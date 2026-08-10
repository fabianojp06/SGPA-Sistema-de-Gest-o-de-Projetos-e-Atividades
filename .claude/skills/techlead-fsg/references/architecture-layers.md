# Architecture Layers — SGPA

Referência para o **Design Mode** do Tech Lead FSG.

## Estrutura de Pastas Alvo

O SGPA é um **Monolito Modular em Next.js** (ADR-001/002) — não usa DDD hexagonal completo com
`domain/application/infrastructure` por bounded context. A estrutura prioriza produtividade de
1 dev + Claude Code sobre isolamento arquitetural máximo.

```
sgpa/
├── app/
│   ├── (auth)/                    # Clerk auth pages (sign-in, sign-up)
│   ├── (dashboard)/
│   │   ├── page.tsx               # Dashboard principal (por perfil)
│   │   ├── projetos/
│   │   │   ├── page.tsx
│   │   │   └── [projectId]/
│   │   ├── wins/                  # Card WIN digital
│   │   ├── reunioes/              # Pautas e atas
│   │   └── riscos/
│   └── api/
│       ├── webhooks/clerk/        # sync de usuário/role
│       └── cron/                  # Edge Functions (regra 3 semanas, alertas de prazo)
│
├── components/
│   ├── ui/                        # shadcn/ui base
│   ├── wins/                      # WinCard, WinItem, WinForm, AlertaRegra3
│   ├── projetos/                  # ProjectList, ProjectCard, ProjectProgress
│   ├── dashboard/                 # KPICard, RiskPanel, AgendaPanel
│   └── layout/                    # Sidebar (com radar de atividade), Topbar
│
├── lib/
│   ├── actions/                   # Server Actions, agrupadas por módulo
│   │   ├── projects.ts
│   │   ├── activities.ts
│   │   ├── wins.ts
│   │   └── meetings.ts
│   ├── supabase/                  # client, server, realtime hooks
│   ├── clerk/                     # auth helpers, permissions (role guards)
│   ├── resend/                    # email templates (React Email)
│   ├── ai/                        # prompt builders + client Anthropic API
│   └── validations/               # Zod schemas por entidade
│
├── prisma/
│   └── schema.prisma               # models completos (fonte da verdade do domínio)
│
└── supabase/
    └── migrations/                 # SQL de jobs pg_cron, RLS, functions
```

---

## Regras de Dependência

```
Presentation (app/, components/)
    → Server Actions (lib/actions/)
        → Validação (lib/validations/ — Zod)
        → Prisma Client (acesso direto ao banco)
    → Integrações externas (lib/ai/, lib/resend/, lib/supabase/realtime)
```

**Regra de ouro:** Server Actions são a única porta de escrita para dados de domínio. Componentes
não chamam Prisma diretamente para mutação — apenas Server Components podem fazer leitura direta
via Prisma. Violação desta regra (mutação direta em componente de UI) é P1 no code review.

Este é um monolito modular pragmático, não uma arquitetura em camadas com interfaces/repositories
abstraídas — não proponha essa complexidade extra a menos que um módulo específico realmente
precise trocar de implementação de persistência (o que hoje não é o caso do SGPA).

---

## Módulos do SGPA

| Módulo         | Responsabilidade                                         | Entidades Principais                        |
|------------------|--------------------------------------------------------------|--------------------------------------------------|
| `projetos`       | Ciclo de vida de projetos e fases                            | Project, ProjectPhase, ProjectMember            |
| `atividades`     | Tarefas, progresso, prazos, dependências                     | Activity, DeadlineChange, ActivityComment       |
| `wins`           | Card WIN semanal, riscos, pedidos de ajuda                   | Win, Risk, HelpRequest                          |
| `reunioes`       | Geração de pauta (IA), atas e decisões                       | Meeting                                         |
| `auditoria`      | Trilha de auditoria imutável                                  | AuditLog                                        |
| `usuarios`       | Perfis, papéis, RBAC (via Clerk)                              | User                                             |

---

## Padrão de Server Action

```typescript
// lib/actions/activities.ts
'use server'

import { z } from 'zod'
import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'
import { UpdateActivityProgressSchema } from '@/lib/validations/activity'
import { assertRole } from '@/lib/clerk/permissions'

export async function updateActivityProgress(input: unknown) {
  // 1. Validar entrada
  const parsed = UpdateActivityProgressSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false as const, error: 'Dados inválidos' }
  }
  const { activityId, progress } = parsed.data

  // 2. Autenticar e autorizar
  const { userId, sessionClaims } = await auth()
  if (!userId) return { success: false as const, error: 'Não autenticado' }

  const activity = await prisma.activity.findFirst({
    where: { id: activityId, deletedAt: null },
  })
  if (!activity) return { success: false as const, error: 'Atividade não encontrada' }

  // 3. Regra de negócio (RN-01): só conclui com progress = 100
  const newStatus =
    progress === 100 ? 'DONE' : activity.status === 'DONE' ? 'IN_PROGRESS' : activity.status

  // 4. Persistir + auditar na mesma transação
  await prisma.$transaction([
    prisma.activity.update({
      where: { id: activityId },
      data: { progress, status: newStatus, completedAt: progress === 100 ? new Date() : null },
    }),
    prisma.auditLog.create({
      data: {
        userId,
        action: 'UPDATED',
        entity: 'Activity',
        entityId: activityId,
        before: { progress: activity.progress, status: activity.status },
        after: { progress, status: newStatus },
      },
    }),
  ])

  return { success: true as const }
}
```

---

## React Server Components vs Client Components

| Caso de uso                                    | Tipo              |
|---------------------------------------------------|--------------------|
| Busca de dados, leitura de DB (listas, dashboards) | Server Component   |
| Interatividade, estado local, eventos UI           | Client Component   |
| Formulários com validação inline                   | Client Component   |
| Layouts, páginas de leitura                        | Server Component   |
| Assinatura de canal Supabase Realtime              | Client Component   |

**Regra:** só adicionar `'use client'` quando houver um motivo explícito (interatividade,
Realtime, hooks). Default é Server Component.

---

## Supabase Realtime: Onde Entra na Arquitetura

```
Server Action (mutação) → Postgres (UPDATE)
                                ↓
                    Supabase Realtime (WAL → WebSocket)
                                ↓
             Client Component assinante (Dashboard, Sidebar radar)
```

Usar Realtime apenas onde há valor real de "ao vivo": dashboards, contador de atividade na
sidebar, alertas de risco. Não usar Realtime para listagens estáticas que só mudam por ação do
próprio usuário — nesses casos, revalidação de cache (`revalidatePath`) após a Server Action é
suficiente e mais simples.
