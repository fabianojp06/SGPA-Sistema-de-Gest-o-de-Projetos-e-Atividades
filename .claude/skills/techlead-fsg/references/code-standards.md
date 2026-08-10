# Code Standards — SGPA

Referência para o **Code Mode** do Tech Lead FSG.

## TypeScript: Padrões Obrigatórios

### Enums de Domínio (nunca strings livres — RN-10)

```typescript
// Espelham os enums do prisma/schema.prisma — nunca redeclarar como string solta
import { ActivityStatus, ProjectStatus, RiskLevel } from '@prisma/client'

// Correto — usa o enum gerado pelo Prisma
function canComplete(status: ActivityStatus, progress: number): boolean {
  return progress === 100 // RN-01
}

// Errado — string livre reabre a porta para inconsistência entre telas
function canCompleteWrong(status: string, progress: number): boolean { return progress === 100 }
```

### Erros de Domínio Tipados

```typescript
// lib/errors/DomainErrors.ts

export abstract class DomainError extends Error {
  abstract readonly code: string
  constructor(message: string) {
    super(message)
    this.name = this.constructor.name
  }
}

export class DeadlineExceedsProjectError extends DomainError {
  readonly code = 'DEADLINE_EXCEEDS_PROJECT' // RN-02
  constructor(activityDueDate: Date, projectEndDate: Date) {
    super(
      `Prazo da atividade (${activityDueDate.toISOString()}) excede o prazo do projeto ` +
      `(${projectEndDate.toISOString()})`
    )
  }
}

export class ActivityNotCompletableError extends DomainError {
  readonly code = 'ACTIVITY_NOT_COMPLETABLE' // RN-01
  constructor(progress: number) {
    super(`Atividade não pode ser concluída com progresso ${progress}% (requer 100%)`)
  }
}

export class MissingDeadlineJustificationError extends DomainError {
  readonly code = 'MISSING_DEADLINE_JUSTIFICATION' // RN-03
  constructor() {
    super('Alteração de prazo exige justificativa')
  }
}

export class ForbiddenRoleError extends DomainError {
  readonly code = 'FORBIDDEN_ROLE'
  constructor(requiredRoles: string[]) {
    super(`Ação requer um dos perfis: ${requiredRoles.join(', ')}`)
  }
}
```

### DTOs com Zod (validação de entrada)

```typescript
// lib/validations/activity.ts
import { z } from 'zod'

export const UpdateActivityProgressSchema = z.object({
  activityId: z.string().cuid(),
  progress: z.number().int().min(0).max(100),
})
export type UpdateActivityProgressInput = z.infer<typeof UpdateActivityProgressSchema>

export const ChangeDeadlineSchema = z.object({
  activityId: z.string().cuid(),
  newDate: z.coerce.date(),
  reason: z.string().min(10, 'Justificativa deve ter ao menos 10 caracteres'), // RN-03
})
export type ChangeDeadlineInput = z.infer<typeof ChangeDeadlineSchema>

export const CreateWinSchema = z.object({
  title: z.string().min(3).max(255),
  projectId: z.string().cuid().optional(),
  supportName: z.string().optional(),
  dueDate: z.coerce.date(),
  weekNumber: z.number().int().min(1).max(53),
  year: z.number().int().min(2020),
})
export type CreateWinInput = z.infer<typeof CreateWinSchema>
```

---

## Next.js: Padrões de Server Action

```typescript
// lib/actions/deadlines.ts
'use server'

import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { ChangeDeadlineSchema } from '@/lib/validations/activity'
import { requireRole } from '@/lib/clerk/permissions'
import { DeadlineExceedsProjectError } from '@/lib/errors/DomainErrors'

export async function changeActivityDeadline(input: unknown) {
  try {
    const { activityId, newDate, reason } = ChangeDeadlineSchema.parse(input)

    // RN-04: apenas coordinator, director ou admin altera prazo de terceiros
    const { userId } = await requireRole(['admin', 'director', 'coordinator'])

    const activity = await prisma.activity.findFirstOrThrow({
      where: { id: activityId, deletedAt: null },
      include: { project: true },
    })

    // RN-02: prazo de atividade <= prazo do projeto-pai
    if (newDate > activity.project.endDate) {
      throw new DeadlineExceedsProjectError(newDate, activity.project.endDate)
    }

    await prisma.$transaction([
      prisma.activity.update({ where: { id: activityId }, data: { dueDate: newDate } }),
      prisma.deadlineChange.create({
        data: { activityId, changedById: userId, oldDate: activity.dueDate, newDate, reason },
      }),
      prisma.auditLog.create({
        data: {
          userId,
          action: 'DEADLINE_CHANGED',
          entity: 'Activity',
          entityId: activityId,
          before: { dueDate: activity.dueDate },
          after: { dueDate: newDate, reason },
        },
      }),
    ])

    revalidatePath(`/projetos/${activity.projectId}`)
    return { success: true as const }

  } catch (error) {
    if (error instanceof DeadlineExceedsProjectError) {
      return { success: false as const, error: error.message, code: error.code }
    }
    console.error('[changeActivityDeadline] erro inesperado:', error)
    return { success: false as const, error: 'Erro interno do servidor' }
  }
}
```

---

## React Server Components: Padrão de Fetch

```typescript
// app/(dashboard)/projetos/[projectId]/page.tsx

import { prisma } from '@/lib/prisma'
import { ActivityList } from '@/components/projetos/ActivityList'

// Server Component — sem 'use client'
export default async function ProjectPage({ params }: { params: { projectId: string } }) {
  const project = await prisma.project.findFirstOrThrow({
    where: { id: params.projectId, deletedAt: null },
    include: {
      activities: { where: { deletedAt: null }, orderBy: { dueDate: 'asc' } },
    },
  })

  return (
    <main>
      <h1>{project.name}</h1>
      <ActivityList activities={project.activities} />
    </main>
  )
}
```

---

## RBAC: Guard de Role (sem tenant — apenas perfil)

```typescript
// lib/clerk/permissions.ts
import { auth } from '@clerk/nextjs/server'
import { ForbiddenRoleError } from '@/lib/errors/DomainErrors'

type Role = 'admin' | 'director' | 'coordinator' | 'technician'

export async function requireRole(allowed: Role[]) {
  const { userId, sessionClaims } = await auth()
  if (!userId) throw new Error('Não autenticado')

  const role = sessionClaims?.metadata?.role as Role | undefined
  if (!role || !allowed.includes(role)) {
    throw new ForbiddenRoleError(allowed)
  }
  return { userId, role }
}
```

Nenhuma dessas checagens envolve `tenant_id` — o SGPA é de organização única. Não propor
isolamento de dados por tenant em código novo.

---

## Padrão de Soft Delete (RN-06)

```typescript
// lib/actions/projects.ts
'use server'

export async function archiveProject(projectId: string, reason: string) {
  const { userId } = await requireRole(['admin', 'director'])

  // Nunca prisma.project.delete() em models de domínio
  await prisma.$transaction([
    prisma.project.update({
      where: { id: projectId },
      data: { deletedAt: new Date(), status: 'ARCHIVED' },
    }),
    prisma.auditLog.create({
      data: {
        userId,
        action: 'DELETED',
        entity: 'Project',
        entityId: projectId,
        after: { reason },
      },
    }),
  ])
}

// Toda query de leitura de domínio filtra deletedAt por padrão
export async function listActiveProjects() {
  return prisma.project.findMany({ where: { deletedAt: null } })
}
```

---

## Padrão de Chamada à Anthropic API (Geração de Pauta)

```typescript
// lib/ai/generate-agenda.ts
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function generateWeeklyAgenda(input: {
  wins: { title: string; status: string; supportName: string | null }[]
  risks: { title: string; level: string }[]
  helpRequests: { description: string; targetName: string }[]
}) {
  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: buildWeeklyAgendaPrompt(input), // monta prompt só com dados já validados do Prisma
      }],
    })
    return { success: true as const, agenda: message.content }
  } catch (error) {
    // Nunca bloquear a reunião por falha da IA — fallback com dados brutos
    console.error('[generateWeeklyAgenda] falha na Anthropic API:', error)
    return { success: false as const, fallback: input }
  }
}
```

---

## Nomenclatura

| Contexto          | Convenção                      | Exemplo                          |
|----------------------|-----------------------------------|--------------------------------------|
| Arquivos             | kebab-case                        | `change-activity-deadline.ts`       |
| Server Actions       | camelCase, verbo + entidade       | `changeActivityDeadline()`          |
| Funções/métodos      | camelCase                         | `assertRole()`                      |
| Variáveis            | camelCase                         | `dueDate`, `progress`               |
| Constantes           | UPPER_SNAKE_CASE                  | `MAX_WIN_REPEAT_COUNT`              |
| Componentes React    | PascalCase                        | `WinItem`, `ProjectCard`            |
| Models Prisma        | PascalCase singular               | `Project`, `Activity`, `Win`        |
| Colunas Postgres     | camelCase (Prisma default)        | `dueDate`, `deletedAt`              |
| Enums Prisma         | PascalCase (tipo) / UPPER (valor) | `ActivityStatus.IN_PROGRESS`        |
| Termos de domínio    | Português (domínio do negócio)    | `projeto`, `atividade`, `pauta`     |
| Termos técnicos      | Inglês                            | `action`, `schema`, `middleware`    |
