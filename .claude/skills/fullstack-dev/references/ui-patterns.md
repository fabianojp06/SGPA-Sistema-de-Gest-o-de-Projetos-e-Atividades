# UI Patterns — SGPA

Referência para o **UI Mode**: componentes React, formulários e Tailwind. Design system dark-first
(ver `SKILL.md` para a paleta completa: `--bg-base`, `--accent`, `--success`, `--warning`,
`--danger`, `--purple`; fonte de interface Inter, fonte de dados Geist Mono).

## Template: Formulário com Server Action

```typescript
// features/activities/components/ActivityForm.tsx
'use client'

import { useActionState } from 'react'
import { useRouter } from 'next/navigation'
import { criarAtividadeAction } from '../actions/criar-atividade'
import type { ActionResult } from '../schemas/activity.schema'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'

type Props = {
  projects: { id: string; code: string; name: string }[]
}

export function ActivityForm({ projects }: Props) {
  const [state, formAction, isPending] = useActionState<ActionResult | null, FormData>(
    criarAtividadeAction,
    null
  )
  const router = useRouter()

  // Redirecionar após sucesso
  if (state?.success) {
    router.push('/atividades')
  }

  return (
    <form action={formAction} className="space-y-4 max-w-lg">
      {/* Erro geral */}
      {state?.success === false && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      {/* Projeto */}
      <div className="space-y-1">
        <Label htmlFor="projectId">Projeto</Label>
        <select
          id="projectId"
          name="projectId"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          required
        >
          <option value="">Selecione um projeto...</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.code} — {p.name}
            </option>
          ))}
        </select>
        {state?.success === false && state.fieldErrors?.projectId && (
          <p className="text-xs text-destructive">{state.fieldErrors.projectId[0]}</p>
        )}
      </div>

      {/* Título */}
      <div className="space-y-1">
        <Label htmlFor="title">Título</Label>
        <Input
          id="title"
          name="title"
          placeholder="Título da atividade"
          required
          minLength={3}
        />
        {state?.success === false && state.fieldErrors?.title && (
          <p className="text-xs text-destructive">{state.fieldErrors.title[0]}</p>
        )}
      </div>

      {/* Prazo */}
      <div className="space-y-1">
        <Label htmlFor="dueDate">Prazo</Label>
        <Input
          id="dueDate"
          name="dueDate"
          type="date"
          required
        />
        {state?.success === false && state.fieldErrors?.dueDate && (
          <p className="text-xs text-destructive">{state.fieldErrors.dueDate[0]}</p>
        )}
      </div>

      <Button type="submit" disabled={isPending} className="w-full">
        {isPending ? 'Salvando...' : 'Criar Atividade'}
      </Button>
    </form>
  )
}
```

---

## Template: Tabela de Listagem

```typescript
// features/activities/components/ActivityList.tsx
import { Badge } from '@/components/ui/badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import type { Activity, Project } from '@prisma/client'

type ActivityComProjeto = Activity & { project: Pick<Project, 'code'> }

const STATUS_BADGE: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  TODO:        { label: 'A Fazer',       variant: 'secondary' },
  IN_PROGRESS: { label: 'Em Andamento',  variant: 'default' },
  DONE:        { label: 'Concluída',     variant: 'outline' },
  BLOCKED:     { label: 'Bloqueada',     variant: 'destructive' },
  CANCELLED:   { label: 'Cancelada',     variant: 'secondary' },
}

export function ActivityList({ activities }: { activities: ActivityComProjeto[] }) {
  if (activities.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        Nenhuma atividade encontrada.
      </div>
    )
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Projeto</TableHead>
          <TableHead>Título</TableHead>
          <TableHead className="text-right">Progresso</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Prazo</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {activities.map((activity) => {
          const badge = STATUS_BADGE[activity.status]
          return (
            <TableRow key={activity.id}>
              <TableCell className="font-mono">{activity.project.code}</TableCell>
              <TableCell className="max-w-xs truncate">{activity.title}</TableCell>
              <TableCell className="text-right font-mono">
                {activity.progress}%
              </TableCell>
              <TableCell>
                <Badge variant={badge.variant}>{badge.label}</Badge>
              </TableCell>
              <TableCell className="text-muted-foreground text-sm">
                {formatDate(activity.dueDate)}
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat('pt-BR').format(date)
}
```

---

## Skeleton de Loading

```typescript
// app/(dashboard)/atividades/loading.tsx
import { Skeleton } from '@/components/ui/skeleton'

export default function AtividadesLoading() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-8 w-48" />
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  )
}
```

---

## Error Boundary

```typescript
// app/(dashboard)/atividades/error.tsx
'use client'

import { Button } from '@/components/ui/button'

export default function AtividadesError({
  error,
  reset,
}: {
  error: Error
  reset: () => void
}) {
  return (
    <div className="flex flex-col items-center gap-4 py-12">
      <p className="text-destructive font-medium">Erro ao carregar atividades</p>
      <p className="text-sm text-muted-foreground">{error.message}</p>
      <Button variant="outline" onClick={reset}>Tentar novamente</Button>
    </div>
  )
}
```

---

## Convenções Tailwind do Projeto

```
Layout:     container mx-auto px-4 py-6
Seções:     space-y-6 | gap-4
Cards:      rounded-lg border bg-card p-6 shadow-sm (usar --bg-surface no tema dark)
Títulos:    text-2xl font-bold | text-lg font-semibold
Subtítulos: text-sm text-muted-foreground
Erros:      text-destructive text-sm
Mono:       font-mono (Geist Mono — prazos, percentuais, códigos de projeto, status badges)
Tabela:     usar sempre shadcn/ui Table
Formulário: space-y-4, Label + Input + erro inline
Botões:     shadcn/ui Button — variant: default/outline/destructive/ghost
```

### Cores de status (design system SGPA)

```
Em andamento   → --accent (#4F7EFF)   badge azul, ponto azul
Concluído      → --success (#2DD4A0)  badge verde, ponto verde
Atenção/risco médio → --warning (#F5A524)  badge âmbar
Bloqueado/atrasado  → --danger (#F0544F)   badge vermelho, ponto vermelho
Reunião/pauta  → --purple (#9B6DFF)   itens de agenda
A fazer        → cinza neutro          badge cinza, ponto cinza
```

Elemento assinatura do sidebar: ponto de radar pulsante via Supabase Realtime indicando atividade
ao vivo — usar com moderação (uma animação, sem sobrecarregar a UI).

---

## Formatação de Valores

```typescript
// lib/formatters.ts

export function formatDate(date: Date | string): string {
  return new Intl.DateTimeFormat('pt-BR').format(new Date(date))
}

export function formatDatetime(date: Date | string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(date))
}

export function formatProgress(value: number): string {
  return `${Math.round(value)}%`
}

export function formatWeek(weekNumber: number, year: number): string {
  return `Semana ${weekNumber}/${year}`
}
```

---

## Alerta de Escalação (Regra das 3 Semanas — RN-09)

```typescript
// components/wins/AlertaRegra3.tsx
import { AlertTriangle } from 'lucide-react'

export function AlertaRegra3({ title, repeatCount }: { title: string; repeatCount: number }) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-[--accent-warning] bg-[--accent-warning]/10 px-3 py-2 text-sm">
      <AlertTriangle className="h-4 w-4 text-[--accent-warning]" />
      <span>
        <strong>{title}</strong> repetiu por {repeatCount} semanas — escalado ao Plano de Ação.
      </span>
    </div>
  )
}
```
