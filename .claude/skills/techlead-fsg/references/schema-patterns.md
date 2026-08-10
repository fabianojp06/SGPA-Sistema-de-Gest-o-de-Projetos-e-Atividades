# Schema Patterns — SGPA

Referência para o **Schema Mode** e **Perf Mode** do Tech Lead FSG.

Fonte da verdade do domínio: `prisma/schema.prisma`. Este arquivo referencia o schema já
definido no documento mestre (seção 7) — trate-o como baseline aceito, não redesenhe do zero
sem motivo.

## Tipos de Dados: Regras do SGPA

| Dado                        | Tipo correto (Prisma)         | Nunca usar                    |
|-------------------------------|-----------------------------------|------------------------------------|
| IDs internos                  | `String @default(cuid())`         | `Int` autoincrement, `SERIAL`     |
| Progresso de atividade/projeto| `Int` (0-100) + `CHECK` no banco  | `Float`/`Decimal` (não há frações de progresso) |
| Status                        | `enum` Prisma fechado              | `String` livre (RN-10)            |
| Datas de prazo                | `DateTime` (`dueDate`, `endDate`) | `String` formatada, serial Excel  |
| Exclusão                      | `deletedAt DateTime?` (soft delete) | `DELETE` físico / flag booleana `isDeleted` sem timestamp |
| Snapshot de auditoria         | `Json?` (`before`/`after`)         | Colunas separadas por campo alterado |
| Semana/ano do WIN              | `Int weekNumber`, `Int year`       | `String` "semana 12/2026"         |

---

## Template de Model Prisma Padrão (com Soft Delete e Auditoria)

```prisma
model Activity {
  id            String         @id @default(cuid())
  projectId     String
  parentId      String?        // sub-atividade (checklist hierárquico)

  title         String
  description   String?
  status        ActivityStatus @default(TODO)
  priority      String         @default("medium")
  progress      Int            @default(0) // 0-100 — RN-01

  assignedToId  String?
  supportId     String?
  dueDate       DateTime       // RN-02: nunca > project.endDate
  completedAt   DateTime?
  predecessorId String?

  createdAt     DateTime       @default(now())
  updatedAt     DateTime       @updatedAt
  deletedAt     DateTime?      // RN-06: soft delete obrigatório

  project         Project           @relation(fields: [projectId], references: [id])
  assignedTo      User?             @relation(fields: [assignedToId], references: [id])
  deadlineChanges DeadlineChange[]  // RN-03
  comments        ActivityComment[]
  attachments     Attachment[]

  @@index([projectId, deletedAt])
  @@index([assignedToId, status])
  @@index([dueDate])
}
```

Invariantes que **não** cabem só no Prisma — exigem `CHECK` constraint via migration SQL:

```sql
ALTER TABLE "Activity" ADD CONSTRAINT progress_range CHECK (progress BETWEEN 0 AND 100);
ALTER TABLE "Project" ADD CONSTRAINT project_dates CHECK ("endDate" >= "startDate");
```

---

## Organização de Schema: Sem Multi-Tenant

O SGPA **não** particiona dados por tenant/organização — é sistema de organização única. Não
propor `organizationId`/`tenantId` em models novos, nem Row-Level Security por tenant. Isolamento
de dados aqui é por **papel** (Clerk role) e por **alocação** (ex: `technician` só vê projetos
onde é `ProjectMember`), resolvido em nível de query/Server Action, não de schema multi-tenant.

```prisma
// Padrão de alocação — não confundir com isolamento de tenant
model ProjectMember {
  id        String  @id @default(cuid())
  projectId String
  userId    String
  role      String  // manager | member | viewer

  project Project @relation(fields: [projectId], references: [id])
  user    User    @relation(fields: [userId], references: [id])

  @@unique([projectId, userId])
}
```

---

## Padrão de Log de Auditoria (RN-15 — imutável)

```prisma
model AuditLog {
  id        String   @id @default(cuid())
  userId    String
  action    String   // CREATED | UPDATED | DELETED | STATUS_CHANGED | DEADLINE_CHANGED
  entity    String   // Project | Activity | Win | Risk
  entityId  String
  before    Json?
  after     Json?
  createdAt DateTime @default(now())

  user User @relation(fields: [userId], references: [id])

  @@index([entity, entityId])
  @@index([userId, createdAt])
}
```

Reforço: qualquer proposta de `UPDATE`/`DELETE` sobre esta tabela — inclusive via Prisma
middleware "para corrigir dado errado" — deve ser recusada. Correção é uma nova linha, nunca
edição da anterior.

---

## Performance: Índices Recorrentes no SGPA

```sql
-- Dashboards por status e prazo (query mais frequente do sistema)
CREATE INDEX idx_activity_status_duedate ON "Activity" (status, "dueDate")
  WHERE "deletedAt" IS NULL;

-- Card WIN por usuário e semana
CREATE INDEX idx_win_user_week ON "Win" ("userId", year, "weekNumber")
  WHERE "deletedAt" IS NULL;

-- Detecção de repetição (RN-09) — WINs não concluídos por usuário
CREATE INDEX idx_win_escalation ON "Win" ("userId", "repeatCount", status)
  WHERE "deletedAt" IS NULL AND status != 'DONE';
```

Sempre criar índice parcial (`WHERE "deletedAt" IS NULL`) em tabelas com soft delete e alto
volume de leitura — evita que registros arquivados poluam o índice.

---

## Migrations: Padrão de Segurança

Toda migration deve declarar reversibilidade e impacto, e considerar que o projeto usa
**Prisma 6** (fixado — não gerar sintaxe de `prisma migrate` v7) e conexão via **pooler do
Supabase** para `DATABASE_URL`, com `DIRECT_URL` reservado para operações de migration.

```sql
-- prisma/migrations/20260810_add_repeat_count_to_win/migration.sql
-- Descrição: Adiciona repeatCount e escalated para suportar RN-09 (escalação automática)
-- Reversível: SIM
-- Impacto em produção: LOW — ADD COLUMN com DEFAULT, sem lock prolongado

-- UP
ALTER TABLE "Win" ADD COLUMN "repeatCount" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Win" ADD COLUMN "escalated" BOOLEAN NOT NULL DEFAULT false;

-- DOWN
ALTER TABLE "Win" DROP COLUMN "repeatCount";
ALTER TABLE "Win" DROP COLUMN "escalated";
```

**Operações de alto risco (avaliar janela de manutenção, mesmo em app de baixo volume):**
- `ALTER TABLE ... SET NOT NULL` em tabela com muitas linhas (full table scan)
- Adicionar índice sem `CONCURRENTLY` em tabela já populada
- Renomear coluna usada por código em produção sem etapa de transição

---

## Query Patterns Frequentes no SGPA

### Progresso do projeto calculado a partir das atividades filhas (RN-07)

```sql
-- Supabase Function chamada por trigger após UPDATE em Activity
SELECT COALESCE(AVG(progress), 0)::INT AS project_progress
FROM "Activity"
WHERE "projectId" = $1 AND "deletedAt" IS NULL;
```

### Dashboard do Técnico: atividades e WINs da semana

```sql
SELECT a.*, p.name AS project_name
FROM "Activity" a
JOIN "Project" p ON p.id = a."projectId"
WHERE a."assignedToId" = $1
  AND a."deletedAt" IS NULL
  AND a.status != 'DONE'
ORDER BY a."dueDate" ASC;
```

### Atividades atrasadas (RN-14 / alerta de prazo)

```sql
SELECT * FROM "Activity"
WHERE "dueDate" < NOW()
  AND status NOT IN ('DONE', 'CANCELLED')
  AND "deletedAt" IS NULL;
```