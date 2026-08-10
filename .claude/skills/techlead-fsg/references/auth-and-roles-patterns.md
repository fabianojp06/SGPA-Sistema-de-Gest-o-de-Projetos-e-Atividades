# Auth & Roles Patterns — SGPA

Referência para o **Auth Mode** do Tech Lead FSG.

> Este arquivo substitui o antigo `multitenant-patterns.md`. **O SGPA não é multi-tenant** —
> é um sistema de organização única, uso interno. Não existe isolamento por `tenant_id`,
> schema-per-tenant ou RLS por tenant, e essa não é uma decisão a se questionar a cada feature:
> é uma característica estrutural do domínio (ver documento mestre, seção 11 — "Fora do Escopo").
> Se o usuário pedir suporte a múltiplas organizações, trate como mudança de escopo maior e
> registre um ADR — não implemente silenciosamente.

## Estratégia Adotada: RBAC via Clerk (sem isolamento de tenant)

O controle de acesso do SGPA é inteiramente baseado em **papel do usuário** (`role`) e, em
alguns casos, em **alocação explícita** a um projeto (`ProjectMember`). Não há uma segunda
dimensão de "organização" a isolar.

```
Request HTTP
    ↓
Clerk middleware (Next.js)
    → verifica sessão
    → injeta sessionClaims (inclui metadata.role)
    ↓
Server Action / Route Handler
    → chama requireRole([...]) explicitamente
    → opcionalmente verifica alocação (ProjectMember) para o recurso específico
    ↓
Prisma
    → query filtrada por deletedAt e, quando cabível, por alocação (não por tenant)
```

---

## Perfis (Clerk roles) e Capacidades

| Perfil (Clerk role) | Capacidades no sistema |
|------------------------|-----------------------------|
| `admin`        | Gerencia usuários, perfis de acesso, parâmetros do sistema, visualiza logs de auditoria, configura notificações globais |
| `director`     | Visão global irrestrita de todos os projetos e WINs, dashboards executivos, aprovação de projetos, recebe pauta gerada automaticamente |
| `coordinator`  | Cria e gerencia projetos, define atividades, atribui responsáveis e prazos, acompanha progresso da equipe, gera relatórios, aprova escalações de risco |
| `technician`   | Registra WINs da própria semana, atualiza status de atividades atribuídas, registra progresso %, sinaliza riscos e pedidos de ajuda |

---

## Matriz de Acesso por Recurso

| Recurso                         | admin | director | coordinator      | technician        |
|--------------------------------------|:-------:|:----------:|:-------------------:|:--------------------:|
| Ver todos os projetos                | Sim   | Sim      | Apenas os seus      | Apenas alocados      |
| Criar projeto                        | Sim   | Sim      | Sim                 | —                     |
| Editar projeto de outro              | Sim   | Sim      | —                    | —                     |
| Registrar WIN                        | Sim   | Sim      | Sim                 | Sim                   |
| Ver WINs de toda a equipe            | Sim   | Sim      | Sim                 | —                     |
| Alterar prazo de atividade (RN-04)   | Sim   | Sim      | Sim                 | —                     |
| Aprovar escalação (RN-09)            | Sim   | Sim      | Sim                 | —                     |
| Gerar pauta de reunião               | Sim   | Sim      | Sim                 | —                     |
| Acessar dashboard executivo          | Sim   | Sim      | —                    | —                     |
| Gerenciar usuários                   | Sim   | —         | —                    | —                     |
| Ver logs de auditoria                | Sim   | Sim      | —                    | —                     |

Esta matriz é a referência oficial para o review checklist (P1 automático se uma Server Action
não a respeitar).

---

## Implementação: Guard de Role

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

// Uso em Server Action
export async function approveEscalation(riskId: string) {
  const { userId, role } = await requireRole(['admin', 'director', 'coordinator'])
  // ...
}
```

---

## Escopo de Visibilidade: Alocação, Não Tenant

`technician` só vê projetos e atividades onde está alocado — isso é resolvido com um `JOIN`
via `ProjectMember`, não com uma segunda chave de particionamento:

```typescript
// ✅ Correto — filtro por alocação, explícito na query
export async function listMyProjects(userId: string, role: Role) {
  if (role === 'admin' || role === 'director') {
    return prisma.project.findMany({ where: { deletedAt: null } })
  }
  return prisma.project.findMany({
    where: {
      deletedAt: null,
      OR: [
        { members: { some: { userId } } },     // coordinator/technician alocado
        ...(role === 'coordinator' ? [{ createdById: userId }] : []),
      ],
    },
  })
}
```

```typescript
// ❌ Errado — não introduzir uma segunda dimensão de isolamento que o domínio não tem
export async function listMyProjectsWrong(userId: string, tenantId: string) {
  return prisma.project.findMany({ where: { tenantId } }) // SGPA não tem tenantId
}
```

---

## Webhook Clerk: Sincronização de Usuário e Role

```typescript
// app/api/webhooks/clerk/route.ts
import { Webhook } from 'svix'
import { prisma } from '@/lib/prisma'

export async function POST(request: Request) {
  const payload = await verifyClerkWebhook(request) // valida assinatura svix

  if (payload.type === 'user.created' || payload.type === 'user.updated') {
    const { id, email_addresses, public_metadata } = payload.data
    await prisma.user.upsert({
      where: { clerkId: id },
      create: {
        clerkId: id,
        email: email_addresses[0].email_address,
        name: `${payload.data.first_name ?? ''} ${payload.data.last_name ?? ''}`.trim(),
        role: (public_metadata.role as Role) ?? 'technician',
      },
      update: {
        email: email_addresses[0].email_address,
        role: (public_metadata.role as Role) ?? 'technician',
      },
    })
  }

  return new Response('OK', { status: 200 })
}
```

`role` vive em `public_metadata` do Clerk e é espelhado em `User.role` (Prisma) para permitir
`JOIN`s eficientes — a fonte da verdade em tempo de autorização é sempre `sessionClaims`
(Clerk), não a cópia no Postgres, que existe para leitura/relatórios.

---

## Checklist: Nova Feature que Toca Autorização

Ao propor qualquer Server Action ou Route Handler novo, responder:

1. **Qual o menor conjunto de roles que deveria acessar isso?** Nunca `['admin', 'director',
   'coordinator', 'technician']` "por segurança" quando o recurso é sensível.
2. **A ação depende de alocação a um projeto específico**, além do role? Se sim, verificar
   `ProjectMember` explicitamente, não assumir que o role sozinho garante o escopo certo.
3. **A UI já esconde a ação para roles não autorizados?** Isso não substitui a checagem no
   backend — é só UX.
4. **Existe log de auditoria para esta ação, se ela for sensível (RN-23 do backlog)?**

---

## Cenários de Borda

### Usuário sem role definido no Clerk
Tratar como `technician` (menor privilégio) por padrão até que um `admin` atribua o role
correto — nunca conceder acesso amplo por omissão.

### Mudança de role em sessão ativa
`sessionClaims` só atualiza no próximo refresh de token — para mudanças críticas de permissão,
considerar forçar novo login ou invalidar sessão via Clerk API.

### Relatórios "vendo tudo" para admin/director
Não é um caso especial de isolamento a contornar — é simplesmente ausência de filtro de
alocação na query, já coberto pela matriz de acesso acima.