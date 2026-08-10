# Feature Playbook — SGPA

Referência para o **Feature Mode**: implementação ponta a ponta.

## Estrutura de Pastas da Feature

```
src/
├── app/
│   └── (dashboard)/
│       ├── page.tsx                       # Dashboard principal
│       └── atividades/                    # rota do módulo
│           ├── page.tsx                   # Server Component — lista
│           ├── loading.tsx                # Skeleton automático
│           ├── error.tsx                  # Boundary de erro
│           └── nova/
│               └── page.tsx               # Server Component — formulário
│
├── features/
│   └── activities/                        # feature slice
│       ├── actions/
│       │   └── criar-atividade.ts         # Server Action
│       ├── components/
│       │   ├── ActivityForm.tsx           # Client Component
│       │   └── ActivityList.tsx           # Server ou Client
│       ├── schemas/
│       │   └── activity.schema.ts         # Zod schemas
│       └── types/
│           └── activity.types.ts          # tipos derivados do Zod e Prisma
│
└── lib/
    └── db/
        └── activity.queries.ts            # queries Prisma reutilizáveis
```

---

## Sequência de Implementação

### Passo 1 — Schema Prisma

```prisma
// prisma/schema.prisma

model Activity {
  id            String         @id @default(cuid())
  projectId     String
  parentId      String?        // sub-atividade (checklist hierárquico — US-013)
  title         String
  description   String?
  status        ActivityStatus @default(TODO)
  priority      String         @default("medium")
  progress      Int            @default(0)  // 0-100
  assignedToId  String?
  dueDate       DateTime
  completedAt   DateTime?
  createdAt     DateTime       @default(now())
  updatedAt     DateTime       @updatedAt
  deletedAt     DateTime?      // RN-06: soft delete — nunca DELETE físico

  project       Project        @relation(fields: [projectId], references: [id])
  assignedTo    User?          @relation(fields: [assignedToId], references: [id])
  deadlineChanges DeadlineChange[]

  @@index([projectId])
  @@index([projectId, status])
  @@index([assignedToId])
}

enum ActivityStatus {
  TODO
  IN_PROGRESS
  DONE
  BLOCKED
  CANCELLED
}
```

```bash
npx prisma migrate dev --name add_activity
```

### Passo 2 — Zod Schema

```typescript
// features/activities/schemas/activity.schema.ts
import { z } from 'zod'

export const CriarAtividadeSchema = z.object({
  projectId: z.string().cuid('ID de projeto inválido'),
  title: z.string().min(3, 'Mínimo 3 caracteres').max(255),
  description: z.string().max(2000).optional(),
  priority: z.enum(['low', 'medium', 'high']).default('medium'),
  dueDate: z.coerce.date(),
  assignedToId: z.string().cuid().optional(),
})

export type CriarAtividadeInput = z.infer<typeof CriarAtividadeSchema>

// Tipo de retorno padrão de actions
export type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> }
```

### Passo 3 — Server Action

Ver `references/action-patterns.md` para o template completo. Se a operação tocar mais de uma
entidade (ex: criar atividade e recalcular progresso do projeto-pai), ver
`references/transaction-patterns.md`.

### Passo 4 — Page (Server Component)

```typescript
// app/(dashboard)/atividades/page.tsx
import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db'
import { ActivityList } from '@/features/activities/components/ActivityList'

export default async function AtividadesPage() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const activities = await prisma.activity.findMany({
    where: { deletedAt: null, assignedToId: userId },
    orderBy: { dueDate: 'asc' },
    take: 50,
  })

  return (
    <main className="container mx-auto py-6">
      <h1 className="text-2xl font-bold mb-6">Minhas Atividades</h1>
      <ActivityList activities={activities} />
    </main>
  )
}
```

### Passo 5 — Form Component (Client)

Ver `references/ui-patterns.md` para o template de formulário.

---

## Checklist de Integração

Antes de considerar a feature pronta:

- [ ] Schema Prisma com `deletedAt` e índices em colunas de filtro frequente (`projectId`, `status`, `assignedToId`)
- [ ] Migration aplicada e testada localmente
- [ ] Zod schema cobre todos os campos obrigatórios e opcionais
- [ ] Server Action valida com Zod antes de qualquer escrita
- [ ] Server Action verifica autenticação (e role, quando a operação exigir) via Clerk antes de qualquer DB call
- [ ] Regras de negócio aplicáveis (RN-01, RN-02, RN-03...) checadas no backend, não só na UI
- [ ] Mutações que tocam mais de uma entidade usam `prisma.$transaction()` (ver Integrity Mode)
- [ ] Auditoria registrada em `AuditLog` (INSERT only — RN-15) quando a ação for crítica
- [ ] `revalidatePath()` chamado após mutação
- [ ] `loading.tsx` implementado para a rota
- [ ] `error.tsx` implementado para a rota
- [ ] Estados de loading/error/empty no componente React
- [ ] Sem `console.log` de dados sensíveis
- [ ] Sem stack trace exposto para o cliente
