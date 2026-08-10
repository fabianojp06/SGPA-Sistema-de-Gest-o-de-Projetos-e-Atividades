# Schema Design — SGPA

Padrões de modelagem de banco de dados para o domínio de gestão de projetos e atividades.

---

## Template Padrão de Tabela de Negócio (com soft delete)

```sql
CREATE TABLE "Activity" (
  -- Identificação
  id              TEXT          PRIMARY KEY DEFAULT gen_cuid(), -- alinhado a @default(cuid()) do Prisma

  -- Relacionamentos
  "projectId"     TEXT          NOT NULL REFERENCES "Project"(id),
  "parentId"      TEXT          REFERENCES "Activity"(id),      -- sub-atividade
  "assignedToId"  TEXT          REFERENCES "User"(id),
  "supportId"     TEXT          REFERENCES "User"(id),
  "predecessorId" TEXT          REFERENCES "Activity"(id),

  -- Dados de negócio
  title           TEXT          NOT NULL,
  description     TEXT,
  status          "ActivityStatus" NOT NULL DEFAULT 'TODO',
  priority        TEXT          NOT NULL DEFAULT 'medium',
  progress        INTEGER       NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  "dueDate"       TIMESTAMPTZ   NOT NULL,
  "completedAt"   TIMESTAMPTZ,

  -- Auditoria de linha (Prisma @default(now()) / @updatedAt)
  "createdAt"     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  "updatedAt"     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  -- Soft delete (RN-06) — NUNCA DELETE físico nesta tabela
  "deletedAt"     TIMESTAMPTZ,

  -- Constraint de negócio (RN-01): só conclui com progresso = 100
  CONSTRAINT activity_done_requires_full_progress
    CHECK (status != 'DONE' OR progress = 100)
);

-- ─── Índices ───────────────────────────────────────────────────────────────────

-- Acesso primário: quase toda query filtra por projeto e exclui deletadas
CREATE INDEX idx_activity_project_active
  ON "Activity" ("projectId", status)
  WHERE "deletedAt" IS NULL;

-- Minhas atividades (dashboard do técnico) — RN vinculada ao US-024
CREATE INDEX idx_activity_assigned_active
  ON "Activity" ("assignedToId", "dueDate")
  WHERE "deletedAt" IS NULL AND status != 'DONE';

-- Atividades vencidas (job de alerta de prazo — RN-05/RN-08)
CREATE INDEX idx_activity_overdue
  ON "Activity" ("dueDate")
  WHERE "deletedAt" IS NULL AND status NOT IN ('DONE', 'CANCELLED');

-- Sub-atividades (checklist hierárquico — US-013)
CREATE INDEX idx_activity_parent
  ON "Activity" ("parentId")
  WHERE "deletedAt" IS NULL;

-- ─── Trigger: updatedAt automático ─────────────────────────────────────────
CREATE TRIGGER trg_activity_updated_at
  BEFORE UPDATE ON "Activity"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

> Nota: o Prisma Client não usa `gen_cuid()` — os `cuid()` são gerados na aplicação
> (`@default(cuid())`). O `DEFAULT` acima só é necessário para INSERTs feitos fora do
> Prisma (scripts, seeds SQL, migrations manuais). Em produção, sempre inserir via Prisma.

---

## Índice Parcial: o padrão mais usado no SGPA

Como o soft delete (RN-06) está em praticamente toda tabela de negócio, o índice parcial
`WHERE "deletedAt" IS NULL` é o padrão default — não a exceção. Regra prática:

> Se 95%+ das queries de uma tabela filtram por `deletedAt IS NULL`, o índice parcial é
> menor, mais rápido de manter e mais seletivo do que um índice completo — crie-o assim
> por padrão, não como otimização posterior.

```sql
-- ❌ Índice completo — inclui linhas soft-deletadas que quase nunca são lidas
CREATE INDEX idx_project_status ON "Project" (status);

-- ✅ Índice parcial — menor, e casa exatamente com o padrão de acesso real
CREATE INDEX idx_project_status_active
  ON "Project" (status)
  WHERE "deletedAt" IS NULL;
```

---

## Modelo do Ciclo de Projeto (referência resumida — ver schema.prisma completo)

```
User ──< ProjectMember >── Project ──< ProjectPhase
                              │
                              ├──< Activity ──< DeadlineChange
                              │       │            (RN-03: justificativa obrigatória)
                              │       ├──< ActivityComment
                              │       └──< Attachment
                              │
                              ├──< Win  (Card WIN — RN-09: repeatCount / escalated)
                              └──< Risk (RN-11: categoria, nível, responsável, status)

User ──< HelpRequest  (RN-12: destinatário, prazo de resposta, status)
User ──< AuditLog     (RN-15: INSERT only, imutável)
Meeting                (agenda/minutes/decisions gerados — EP-06)
```

```sql
CREATE TABLE "Project" (
  id            TEXT           PRIMARY KEY DEFAULT gen_cuid(),
  code          TEXT           NOT NULL UNIQUE,          -- ex: SGPA-2026-001
  name          TEXT           NOT NULL,
  description   TEXT,
  area          TEXT           NOT NULL,
  status        "ProjectStatus" NOT NULL DEFAULT 'ACTIVE',
  "startDate"   TIMESTAMPTZ    NOT NULL,
  "endDate"     TIMESTAMPTZ    NOT NULL,
  progress      INTEGER        NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100), -- RN-07: calculado
  "createdAt"   TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  "updatedAt"   TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  "deletedAt"   TIMESTAMPTZ,
  CONSTRAINT project_dates_valid CHECK ("endDate" >= "startDate")
);

CREATE TABLE "Win" (
  id            TEXT       PRIMARY KEY DEFAULT gen_cuid(),
  "userId"      TEXT       NOT NULL REFERENCES "User"(id),
  "projectId"   TEXT       REFERENCES "Project"(id),        -- RN-13: vínculo opcional
  "weekNumber"  SMALLINT   NOT NULL,
  year          SMALLINT   NOT NULL,
  title         TEXT       NOT NULL,
  status        "WinStatus" NOT NULL DEFAULT 'TODO',
  "supportName" TEXT,
  "dueDate"     TIMESTAMPTZ NOT NULL,
  "repeatCount" INTEGER    NOT NULL DEFAULT 1,               -- RN-09: contagem de semanas repetidas
  escalated     BOOLEAN    NOT NULL DEFAULT FALSE,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "deletedAt"   TIMESTAMPTZ,
  CONSTRAINT win_week_valid CHECK ("weekNumber" BETWEEN 1 AND 53)
);
```

---

## Enums Fechados (RN-10)

```sql
-- Todo status de workflow é enum Postgres nativo, gerado pelo Prisma a partir de `enum` no schema
CREATE TYPE "ProjectStatus"  AS ENUM ('ACTIVE','PAUSED','COMPLETED','ARCHIVED','CANCELLED');
CREATE TYPE "ActivityStatus" AS ENUM ('TODO','IN_PROGRESS','DONE','BLOCKED','CANCELLED');
CREATE TYPE "WinStatus"      AS ENUM ('TODO','IN_PROGRESS','DONE','BLOCKED','CANCELLED');
CREATE TYPE "RiskLevel"      AS ENUM ('LOW','MEDIUM','HIGH','CRITICAL');
CREATE TYPE "RiskStatus"     AS ENUM ('OPEN','MITIGATING','RESOLVED');

-- Adicionar valor a um enum existente exige migration própria (ALTER TYPE ... ADD VALUE)
-- e não pode rodar dentro da mesma transação de outra alteração — ver migration-playbook.md
```

---

## Função utilitária: set_updated_at

```sql
-- Criar uma vez, reusar em toda tabela com campo updatedAt
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW."updatedAt" = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

---

## Checklist de Modelagem

Antes de finalizar qualquer DDL ou model Prisma, verificar:

- [ ] `deletedAt DateTime?` presente em toda tabela de negócio mutável (RN-06)
- [ ] Nenhuma query de leitura gerada esquece `WHERE "deletedAt" IS NULL`
- [ ] Índices de acesso frequente são parciais (`WHERE "deletedAt" IS NULL`)
- [ ] IDs como `String @default(cuid())` — consistente com o restante do schema
- [ ] Timestamps como `DateTime` (mapeiam para `TIMESTAMPTZ`) — nunca `TIMESTAMP` sem fuso
- [ ] Status como enum fechado (RN-10) — nunca `String` livre para workflow
- [ ] `CHECK` de invariante de negócio quando aplicável (ex.: RN-01 progresso=100 ⇒ DONE)
- [ ] `createdAt`/`updatedAt` com trigger ou `@default(now())`/`@updatedAt`
- [ ] Toda mutação crítica tem caminho de escrita em `AuditLog` (RN-15)
- [ ] Particionamento avaliado se a tabela crescer indefinidamente (`AuditLog`, `Win`)
