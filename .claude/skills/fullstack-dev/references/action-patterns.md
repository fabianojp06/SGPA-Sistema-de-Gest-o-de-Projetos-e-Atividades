# Action Patterns — SGPA

Referência para o **Action Mode**: Server Actions com Next.js 15+.

## Template Base de Server Action

```typescript
// features/activities/actions/concluir-atividade.ts
'use server'

import { auth } from '@clerk/nextjs/server'
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/db'
import { ConcluirAtividadeSchema, type ActionResult } from '../schemas/activity.schema'
import type { Activity } from '@prisma/client'

export async function concluirAtividade(
  rawInput: unknown
): Promise<ActionResult<Activity>> {
  // 1. Autenticação
  const { userId } = await auth()
  if (!userId) {
    return { success: false, error: 'Não autorizado' }
  }

  // 2. Validação com Zod
  const parsed = ConcluirAtividadeSchema.safeParse(rawInput)
  if (!parsed.success) {
    return {
      success: false,
      error: 'Dados inválidos',
      fieldErrors: parsed.error.flatten().fieldErrors,
    }
  }
  const input = parsed.data

  // 3. Lógica de negócio + persistência
  try {
    const activity = await prisma.$transaction(async (tx) => {
      const atual = await tx.activity.findUnique({
        where: { id: input.activityId, deletedAt: null },
      })
      if (!atual) throw new Error('Atividade não encontrada')

      // RN-01: só conclui com progresso = 100%
      if (atual.progress !== 100) {
        throw new Error('Atividade só pode ser concluída com progresso em 100%')
      }

      const updated = await tx.activity.update({
        where: { id: atual.id },
        data: { status: 'DONE', completedAt: new Date() },
      })

      // RN-15: auditoria dentro da mesma transação
      await tx.auditLog.create({
        data: {
          userId,
          action: 'STATUS_CHANGED',
          entity: 'Activity',
          entityId: updated.id,
          before: { status: atual.status },
          after: { status: updated.status },
        },
      })

      return updated
    })

    // 4. Revalidar cache
    revalidatePath('/projetos/[id]', 'page')

    return { success: true, data: activity }

  } catch (error) {
    // Logar internamente, nunca expor stack trace
    console.error('[concluirAtividade]', error)
    const message = error instanceof Error ? error.message : 'Erro interno'
    return { success: false, error: message }
  }
}
```

---

## Padrões de Autenticação

```typescript
// Sempre no topo da action, antes de qualquer operação
const { userId } = await auth()
if (!userId) {
  return { success: false, error: 'Não autorizado' }
}

// Para verificar role dentro do sistema (via metadata do Clerk)
const { sessionClaims } = await auth()
const role = sessionClaims?.metadata?.role as string | undefined
if (role !== 'coordinator' && role !== 'admin' && role !== 'director') {
  return { success: false, error: 'Sem permissão para esta operação' }
}
```

---

## Revalidação de Cache

```typescript
// Após mutação, revalidar a página ou segmento afetado
revalidatePath('/projetos')                 // rota específica
revalidatePath('/projetos', 'page')          // força rerender da page
revalidatePath('/projetos/[id]', 'page')     // quando o projeto-pai também muda (ex: % de conclusão recalculado)
revalidatePath('/wins')                      // Card WIN — impacta dashboard e pauta
```

---

## Action com `useFormState` (React 19 / Next.js 15)

Para formulários progressivos (sem JS ou com estado de form):

```typescript
// action — assinatura compatível com useActionState
export async function registrarWinAction(
  _prevState: ActionResult | null,
  formData: FormData
): Promise<ActionResult<Win>> {
  const rawInput = {
    title: formData.get('title'),
    status: formData.get('status'),
    dueDate: formData.get('dueDate'),
    projectId: formData.get('projectId') || undefined,
  }
  return registrarWin(rawInput)
}
```

```typescript
// componente client
'use client'
import { useActionState } from 'react'
import { registrarWinAction } from '../actions/registrar-win'

export function WinForm() {
  const [state, formAction, isPending] = useActionState(registrarWinAction, null)

  return (
    <form action={formAction}>
      {state?.success === false && (
        <p className="text-red-600 text-sm">{state.error}</p>
      )}
      {/* campos */}
      <button type="submit" disabled={isPending}>
        {isPending ? 'Salvando...' : 'Registrar WIN'}
      </button>
    </form>
  )
}
```

---

## Ações de Leitura (Query Actions)

Para casos onde Server Components não resolvem (ex: busca dinâmica client-side):

```typescript
'use server'

export async function buscarProjetos(termo: string) {
  const { userId } = await auth()
  if (!userId) return []

  return prisma.project.findMany({
    where: {
      deletedAt: null,
      OR: [
        { code: { contains: termo, mode: 'insensitive' } },
        { name: { contains: termo, mode: 'insensitive' } },
      ],
      status: 'ACTIVE',
    },
    take: 10,
    select: { id: true, code: true, name: true, progress: true },
  })
}
```

---

## Anti-Patterns — Nunca Fazer

```typescript
// ❌ Sem validação Zod
export async function criarAtividade(projectId: string, title: string) { /* ... */ }

// ❌ Sem checagem de soft delete
const atividade = await prisma.activity.findUnique({ where: { id } }) // pode pegar registro "excluído"!

// ❌ Concluir atividade sem checar RN-01
await prisma.activity.update({ where: { id }, data: { status: 'DONE' } }) // e se progress for 40%?

// ❌ DELETE físico de dado de negócio
await prisma.activity.delete({ where: { id } }) // RN-06: usar deletedAt

// ❌ Expor erro interno
return { success: false, error: error.stack } // nunca!

// ❌ Status como texto livre
status: 'Em andamento' // usar o enum ActivityStatus.IN_PROGRESS
```
