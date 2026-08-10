# Prisma Patterns — SGPA

Referência para o **Schema Mode**: Prisma schema, tipos e migrations.

## Tipos de Campo: Regras Inegociáveis

| Dado                  | Tipo Prisma          | Anotação DB            | Nunca usar       |
|-----------------------|-----------------------|-------------------------|-------------------|
| IDs internos          | `String @id @default(cuid())` | —              | `Int @autoincrement` |
| Timestamps            | `DateTime`            | `@default(now())`       | número serial (nunca formato Excel!) |
| Exclusão              | `DateTime?` (`deletedAt`) | soft delete — RN-06 | `DELETE` físico   |
| Enums de status       | `enum` Prisma          | —                       | `String` livre — RN-10 |
| Progresso             | `Int` (0-100)          | —                       | `Float`/`String`  |
| JSON flexível (pauta, decisões) | `Json`       | —                       | `String` serializado |

---

## Template de Model com Soft Delete e Auditoria

```prisma
model NomeEntidade {
  // — Identificação —
  id            String          @id @default(cuid())

  // — Dados do domínio —
  // ... campos específicos ...

  // — Timestamps —
  createdAt     DateTime        @default(now())
  updatedAt     DateTime        @updatedAt
  deletedAt     DateTime?       // RN-06: soft delete obrigatório, nunca DELETE físico

  // — Índices (obrigatório em FKs e colunas de filtro frequente) —
  @@index([deletedAt])
}
```

---

## Schema Completo: Núcleo do SGPA (Projetos, Atividades, WIN)

```prisma
// prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}

// ─── Enums ────────────────────────────────────────────────

enum ProjectStatus {
  ACTIVE
  PAUSED
  COMPLETED
  ARCHIVED
  CANCELLED
}

enum ActivityStatus {
  TODO
  IN_PROGRESS
  DONE
  BLOCKED
  CANCELLED
}

enum WinStatus {
  TODO
  IN_PROGRESS
  DONE
  BLOCKED
  CANCELLED
}

enum RiskLevel {
  LOW
  MEDIUM
  HIGH
  CRITICAL
}

enum UserRole {
  admin
  director
  coordinator
  technician
}

// ─── Models ───────────────────────────────────────────────

model Project {
  id          String        @id @default(cuid())
  code        String        @unique  // ex: SGP-2026-001
  name        String
  description String?
  area        String
  status      ProjectStatus @default(ACTIVE)
  startDate   DateTime
  endDate     DateTime
  progress    Int           @default(0) // 0-100, calculado a partir das atividades filhas (RN-07)
  createdAt   DateTime      @default(now())
  updatedAt   DateTime      @updatedAt
  deletedAt   DateTime?

  members     ProjectMember[]
  activities  Activity[]
  wins        Win[]

  @@index([status])
  @@index([deletedAt])
}

model Activity {
  id            String         @id @default(cuid())
  projectId     String
  parentId      String?        // sub-atividade
  title         String
  description   String?
  status        ActivityStatus @default(TODO)
  progress      Int            @default(0)
  assignedToId  String?
  dueDate       DateTime
  completedAt   DateTime?
  createdAt     DateTime       @default(now())
  updatedAt     DateTime       @updatedAt
  deletedAt     DateTime?

  project         Project          @relation(fields: [projectId], references: [id])
  assignedTo      User?            @relation(fields: [assignedToId], references: [id])
  deadlineChanges DeadlineChange[]

  @@index([projectId])
  @@index([projectId, status])
  @@index([assignedToId])
}

model Win {
  id          String    @id @default(cuid())
  userId      String
  projectId   String?
  weekNumber  Int
  year        Int
  title       String
  status      WinStatus @default(TODO)
  dueDate     DateTime
  repeatCount Int       @default(1) // RN-09: conta semanas repetidas para escalação
  escalated   Boolean   @default(false)
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  deletedAt   DateTime?

  user        User      @relation(fields: [userId], references: [id])
  project     Project?  @relation(fields: [projectId], references: [id])

  @@index([userId, year, weekNumber])
  @@index([projectId])
}

model AuditLog {
  id        String   @id @default(cuid())
  userId    String
  action    String   // CREATED | UPDATED | DELETED | STATUS_CHANGED | DEADLINE_CHANGED
  entity    String   // Project | Activity | Win | Risk
  entityId  String
  before    Json?
  after     Json?
  createdAt DateTime @default(now())

  user      User     @relation(fields: [userId], references: [id])

  // RN-15: INSERT only — sem model-level constraint que permita update/delete,
  // reforçar em middleware do Prisma (ver abaixo)
  @@index([entity, entityId])
}
```

---

## Migrations: Boas Práticas

```bash
# Criar migration com nome descritivo
npx prisma migrate dev --name add_activity_progress_field

# Aplicar em produção (sem prompt)
npx prisma migrate deploy

# Inspecionar estado
npx prisma migrate status

# Resetar dev (NUNCA em produção)
npx prisma migrate reset
```

**Regras:**
- Nunca editar arquivo de migration já aplicado — criar nova migration
- Sempre revisar o SQL gerado antes de aplicar em staging/produção
- Migrations que removem colunas: fazer em 3 passos (deploy sem a coluna no código → migration remove → deploy limpo)
- Adicionar índice em tabela grande em produção: fazer via migration com `CREATE INDEX CONCURRENTLY`

```sql
-- migration manual para índice concorrente
CREATE INDEX CONCURRENTLY "Activity_projectId_status_idx" ON "Activity"("projectId", "status");
```

---

## Prisma Client: Padrões de Query

### Soft delete sempre no filtro

```typescript
// ✅ Sempre filtrar registros não excluídos
const activities = await prisma.activity.findMany({
  where: { deletedAt: null, status: 'IN_PROGRESS' },
  include: { project: { select: { code: true, name: true } } },
  orderBy: { dueDate: 'asc' },
})

// ❌ Nunca esquecer o filtro de deletedAt — traz também registros "excluídos"
const activity = await prisma.activity.findUnique({ where: { id } })
```

### "Exclusão" = update de deletedAt (RN-06)

```typescript
// ✅ Soft delete
await prisma.activity.update({
  where: { id },
  data: { deletedAt: new Date() },
})

// ❌ Nunca
await prisma.activity.delete({ where: { id } })
```

### Middleware para reforçar AuditLog imutável (RN-15)

```typescript
// lib/db.ts
prisma.$use(async (params, next) => {
  if (params.model === 'AuditLog' && ['update', 'delete', 'updateMany', 'deleteMany'].includes(params.action)) {
    throw new Error('AuditLog é imutável — apenas INSERT é permitido (RN-15)')
  }
  return next(params)
})
```

### Select para evitar over-fetching

```typescript
// Para listagens, selecionar só o necessário
const lista = await prisma.activity.findMany({
  where: { deletedAt: null },
  select: {
    id: true,
    title: true,
    status: true,
    progress: true,
    dueDate: true,
    project: { select: { code: true } },
  },
})
```

---

## Instância Prisma (singleton)

```typescript
// lib/db.ts
import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
```
