# Auth Patterns — SGPA

Referência para o **Auth Mode**: Clerk, RBAC e proteção de rotas.

## Modelo de Acesso no SGPA

O SGPA é uso interno de uma única organização — **não há multi-tenancy**. O Clerk aqui serve para
autenticação e para os quatro perfis (roles) definidos no domínio:

```
Clerk User  →  userId  =  criadoPor / responsável / atualizadoPor
Clerk Role  →  admin | director | coordinator | technician  (metadata do usuário)
```

Perfis e capacidades (ver documento mestre §4):

| Perfil (role)  | Capacidades                                                                 |
|----------------|------------------------------------------------------------------------------|
| `admin`        | Acesso total, gerencia usuários e perfis, vê logs de auditoria              |
| `director`     | Visão global de todos os projetos e WINs, dashboards executivos, aprovações |
| `coordinator`  | Cria/gerencia projetos, atribui equipe e prazos, aprova escalações de risco  |
| `technician`   | Registra WINs próprios, atualiza status/progresso das atividades atribuídas |

A role fica em `publicMetadata.role` no Clerk e é espelhada no model `User.role` do Prisma.

---

## Clerk: Leitura de Contexto

### Em Server Components e Server Actions

```typescript
import { auth, currentUser } from '@clerk/nextjs/server'

// Mínimo necessário (mais performático)
const { userId, sessionClaims } = await auth()
const role = sessionClaims?.metadata?.role as string | undefined

// Quando precisa de dados do usuário (nome, email, etc.)
const user = await currentUser()
```

### Em Client Components

```typescript
'use client'
import { useAuth, useUser } from '@clerk/nextjs'

export function MeuComponente() {
  const { userId, isLoaded } = useAuth()
  const { user } = useUser()
  const role = user?.publicMetadata?.role as string | undefined

  if (!isLoaded) return <Skeleton />
  // ...
}
```

---

## Proteção de Rotas

### Middleware (proteção global)

```typescript
// middleware.ts
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'

const isPublicRoute = createRouteMatcher([
  '/',
  '/sign-in(.*)',
  '/sign-up(.*)',
])

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect()
  }
})

export const config = {
  matcher: ['/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)'],
}
```

### Em Server Components (verificação adicional)

```typescript
import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'

export default async function Page() {
  const { userId } = await auth()

  // Redirecionar se não autenticado
  if (!userId) redirect('/sign-in')

  // Prosseguir — technician só vê projetos onde está alocado, RBAC aplicado na query
  const projetos = await prisma.project.findMany({
    where: { deletedAt: null },
  })
  // ...
}
```

### Em Server Actions (padrão obrigatório)

```typescript
'use server'
import { auth } from '@clerk/nextjs/server'

export async function minhaAction(input: unknown) {
  // SEMPRE primeiro passo em toda action
  const { userId } = await auth()
  if (!userId) {
    return { success: false, error: 'Não autorizado' }
  }

  // Resto da action usa userId como ator/auditoria
}
```

---

## Verificação de Permissão por Role

```typescript
// Verificar role do usuário (via publicMetadata do Clerk, espelhado em User.role)
const { sessionClaims } = await auth()
const role = sessionClaims?.metadata?.role as string | undefined

// RN-04: apenas gestor (coordinator) ou admin pode alterar prazo de atividades de outros
if (role !== 'coordinator' && role !== 'admin') {
  return { success: false, error: 'Sem permissão para alterar prazo de atividade de outro responsável' }
}

// Aprovar escalação de risco (Regra 3 Semanas) — coordinator, director ou admin
if (!['coordinator', 'director', 'admin'].includes(role ?? '')) {
  return { success: false, error: 'Sem permissão para aprovar escalação' }
}
```

Helper reutilizável:

```typescript
// lib/auth/roles.ts
import { auth } from '@clerk/nextjs/server'

export type Role = 'admin' | 'director' | 'coordinator' | 'technician'

export async function requireRole(allowed: Role[]): Promise<
  { ok: true; userId: string; role: Role } | { ok: false; error: string }
> {
  const { userId, sessionClaims } = await auth()
  if (!userId) return { ok: false, error: 'Não autorizado' }

  const role = sessionClaims?.metadata?.role as Role | undefined
  if (!role || !allowed.includes(role)) {
    return { ok: false, error: 'Sem permissão para esta operação' }
  }
  return { ok: true, userId, role }
}
```

---

## Estrutura de Rotas

O SGPA não usa `orgSlug` — é uso interno de organização única:

```
/dashboard                    → dashboard por perfil (technician | coordinator | director)
/projetos                     → lista de projetos
/projetos/novo                → formulário
/projetos/[id]                → detalhe (fases, atividades, equipe)
/wins                         → Card WIN digital (semana atual)
/riscos                       → alertas de risco
/reunioes                     → pautas geradas automaticamente
```

### Escopo de visibilidade por role (RN aplicada na query, não na URL)

```typescript
// lib/db/project.queries.ts
import { prisma } from '@/lib/db'
import type { Role } from '@/lib/auth/roles'

export async function listarProjetosVisiveis(userId: string, role: Role) {
  // admin e director: visão global (US-022)
  if (role === 'admin' || role === 'director') {
    return prisma.project.findMany({ where: { deletedAt: null } })
  }

  // coordinator: apenas os projetos onde é membro com papel de gestor
  // technician: apenas projetos onde está alocado (US-021)
  return prisma.project.findMany({
    where: {
      deletedAt: null,
      members: { some: { userId } },
    },
  })
}
```

### Em layouts protegidos

```typescript
// app/(dashboard)/layout.tsx
import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  return <>{children}</>
}
```

---

## Componentes Clerk Úteis

```typescript
// Perfil do usuário
import { UserButton } from '@clerk/nextjs'
<UserButton afterSignOutUrl="/" />

// Botões de sign-in/up
import { SignInButton, SignUpButton } from '@clerk/nextjs'
<SignInButton mode="modal" />
```

Não há `OrganizationSwitcher` no SGPA — o sistema é de organização única (ver §11 do documento
mestre: "Multi-tenancy — fora de escopo").

---

## Anti-Patterns de Auth

```typescript
// ❌ Confiar apenas no cliente para role
const role = searchParams.get('role') // nunca! usuário pode manipular

// ❌ Esquecer de checar soft delete e RBAC de visibilidade
await prisma.activity.findUnique({ where: { id } }) // sem checar deletedAt nem se o technician está alocado

// ❌ Expor userId em logs públicos
console.log(`userId: ${userId}`) // logar apenas em dev, nunca em prod visível

// ✅ Sempre do Clerk, nunca do cliente
const { userId, sessionClaims } = await auth()
```
