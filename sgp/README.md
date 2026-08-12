# GiaFlow (SGPA)

**Sistema de Gestão de Projetos e Atividades** da equipe GIA/STI — substitui o
acompanhamento por planilha Excel (Card WIN) por um sistema web com dashboards
por perfil, pauta de reunião gerada por IA e trilha de auditoria completa.

> Uso interno, tenant único. Não é um produto multi-tenant.

## Índice

- [Visão geral](#visão-geral)
- [Funcionalidades](#funcionalidades)
- [Stack técnica](#stack-técnica)
- [Arquitetura](#arquitetura)
- [Começando](#começando)
- [Variáveis de ambiente](#variáveis-de-ambiente)
- [Scripts disponíveis](#scripts-disponíveis)
- [Estrutura do projeto](#estrutura-do-projeto)
- [Modelo de dados](#modelo-de-dados)
- [Jobs agendados (cron)](#jobs-agendados-cron)
- [Deploy](#deploy)
- [Documentação](#documentação)

## Visão geral

O ciclo de gestão coberto pelo sistema é:

```
Projeto → Fase → Atividade → WIN semanal → Risco / Pedido de ajuda → Pauta de reunião
```

Cada colaborador registra semanalmente o que entregou (WIN), riscos e pedidos
de ajuda — o mesmo dado que hoje vive espalhado em planilhas individuais. A
partir daí o sistema calcula progresso de projeto, aciona alertas de prazo,
escala itens parados há 3+ semanas (RN-09) e gera a pauta da próxima reunião
automaticamente via IA.

## Funcionalidades

**Projetos e atividades**
- CRUD completo de projeto, fases e atividades, com sub-atividades e dependência entre atividades
- Progresso do projeto calculado a partir das atividades filhas
- Clonagem de projeto como template
- Anexos e comentários em atividade

**Card WIN digital**
- Registro semanal de WINs, riscos e pedidos de ajuda por colaborador
- Escalação automática (RN-09 — "Regra das 3 Semanas") via cron
- Visão consolidada da equipe para gestores

**Dashboards por perfil**
- Técnico: atividades atrasadas/próximas do próprio escopo
- Coordenador: projetos sob gestão, índice de entrega no prazo
- Diretor: visão executiva de portfólio, projetos críticos, KPIs
- Filtros globais (período, projeto, área, responsável)
- Visão Gantt de projeto

**Central de Relatórios**
- Gráficos de SLA de entrega, carga de trabalho por colaborador
- Indicadores de uso do módulo de pautas (reuniões por tipo, adoção de IA, decisões registradas)

**Pauta de reunião automática (IA)**
- Geração de pauta via Anthropic API para os 5 tipos de reunião (Daily, Semanal, Quinzenal, Mensal, One-on-One)
- Edição manual da pauta gerada, registro de ata e decisões (com responsável e prazo)
- Exportação da pauta em PDF

**Busca e notificações**
- Busca global (⌘K) por projeto, atividade e WIN, com escopo por perfil
- Notificações in-app de atividade atrasada, prazo próximo e WIN escalado

**Plataforma**
- Autenticação e RBAC via Clerk (`admin`, `director`, `coordinator`, `technician`)
- Trilha de auditoria imutável (`AuditLog`, somente `INSERT`) em toda mutação relevante
- Soft delete em todo dado de negócio — nenhum `DELETE` físico
- Alertas de prazo por e-mail (Resend)

## Stack técnica

| Camada | Tecnologia |
|---|---|
| Framework | [Next.js 16](https://nextjs.org) (App Router, Server Actions, Turbopack) |
| Linguagem | TypeScript (strict) |
| UI | [Tailwind CSS 4](https://tailwindcss.com), [shadcn/ui](https://ui.shadcn.com) sobre [Base UI](https://base-ui.com), [Recharts](https://recharts.org) |
| Banco de dados | PostgreSQL ([Supabase](https://supabase.com)) |
| ORM | [Prisma 6](https://www.prisma.io) |
| Validação | [Zod](https://zod.dev) |
| Autenticação | [Clerk](https://clerk.com) |
| E-mail transacional | [Resend](https://resend.com) + [React Email](https://react.email) |
| IA (pauta de reunião) | [Anthropic API](https://docs.claude.com) (`@anthropic-ai/sdk`) |
| PDF | [pdf-lib](https://pdf-lib.js.org) |
| Deploy | [Vercel](https://vercel.com) (Fluid Compute + Cron Jobs) |

## Arquitetura

- **Server Actions** como camada principal de mutação/leitura — sem API REST própria para o CRUD do app; os únicos Route Handlers são webhook do Clerk, cron jobs e exportação de PDF (que precisam de um binário/requisição HTTP crua).
- **RBAC** aplicado dentro de cada Server Action (nunca só na UI) — cada função de leitura/escrita já nasce escopada pelo perfil do usuário autenticado.
- **Soft delete** (`deletedAt`) em todo model de negócio; exclusão nunca é física.
- **Auditoria imutável**: toda mutação relevante grava em `AuditLog` (`before`/`after` em JSON), tabela somente-inserção.
- **Jobs agendados** (Vercel Cron) fazem a ponte entre estado do banco e efeitos assíncronos (e-mail, escalação, notificação in-app).

## Começando

### Pré-requisitos

- Node.js 20+
- Um projeto [Supabase](https://supabase.com) (Postgres) — ou qualquer Postgres acessível
- Uma aplicação [Clerk](https://clerk.com) (instância de desenvolvimento gratuita)
- Chave de API da [Anthropic](https://console.anthropic.com) (opcional para rodar localmente sem a geração de pauta)

### Instalação

```bash
git clone <repo>
cd sgp
npm install
```

O `postinstall` já roda `prisma generate` automaticamente.

### Banco de dados

```bash
npx prisma migrate dev
```

### Ambiente de desenvolvimento

```bash
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000).

## Variáveis de ambiente

Crie um `.env.local` na raiz do projeto (`sgp/`) com:

```bash
# Banco de dados (Supabase Postgres)
DATABASE_URL=
DIRECT_URL=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Autenticação (Clerk)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
CLERK_WEBHOOK_SECRET=
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/dashboard
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/dashboard

# E-mail transacional (Resend)
RESEND_API_KEY=
RESEND_FROM_EMAIL=

# Geração de pauta por IA
ANTHROPIC_API_KEY=

# Cron jobs (Vercel Cron envia esse token no header Authorization)
CRON_SECRET=

NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Em produção (Vercel), configure as mesmas variáveis via `vercel env add` ou o
dashboard do projeto — nunca commite `.env.local`.

## Scripts disponíveis

| Script | O que faz |
|---|---|
| `npm run dev` | Sobe o servidor de desenvolvimento (Turbopack) |
| `npm run build` | Build de produção |
| `npm run start` | Roda o build de produção localmente |
| `npm run lint` | ESLint |
| `npx prisma studio` | Explorador visual do banco |
| `npx prisma migrate dev --name <nome>` | Cria e aplica uma migration |

## Estrutura do projeto

```
sgp/
├── prisma/
│   ├── schema.prisma        # Modelo de dados
│   └── migrations/
├── src/
│   ├── actions/              # Server Actions — toda mutação/leitura de negócio
│   ├── app/
│   │   ├── (auth)/            # Sign-in / sign-up (Clerk)
│   │   ├── (dashboard)/        # App autenticado (projetos, atividades, WINs, pautas, relatórios...)
│   │   └── api/
│   │       ├── cron/           # Jobs agendados (alertas de prazo, escalação de WIN)
│   │       ├── meetings/[id]/pdf/  # Exportação de pauta em PDF
│   │       └── webhooks/clerk/     # Sincronização de usuário
│   ├── components/            # UI (shadcn/ui + componentes de domínio, por módulo)
│   ├── emails/                # Templates React Email
│   ├── lib/                   # Prisma client, auth, Anthropic, geração de PDF, utils
│   └── middleware.ts           # Proteção de rota via Clerk
└── docs/                      # Documento mestre e backlog do produto
```

## Modelo de dados

Entidades principais (ver `prisma/schema.prisma` para o detalhe completo):

`User` · `Project` · `ProjectMember` · `ProjectPhase` · `Activity` ·
`Win` · `Risk` · `HelpRequest` · `ActivityComment` · `Attachment` ·
`DeadlineChange` · `AuditLog` · `Meeting` · `Notification`

## Jobs agendados (cron)

Configurados em `vercel.json`, autenticados via header `Authorization: Bearer $CRON_SECRET`:

| Rota | Frequência | O que faz |
|---|---|---|
| `/api/cron/check-wins` | Diário, 08:00 | Escala WINs parados (RN-09) e notifica dono + gestores |
| `/api/cron/check-deadlines` | Diário, 08:05 | Alerta (e-mail + notificação in-app) de atividade atrasada ou com prazo próximo |

## Deploy

O deploy é feito na [Vercel](https://vercel.com), a partir do branch `main`.
Requer todas as variáveis de ambiente da seção acima configuradas no ambiente
de produção do projeto.

## Documentação

- [`docs/SGPA_Documento_Mestre_v1.0.md`](docs/SGPA_Documento_Mestre_v1.0.md) — documento de referência de produto (regras de negócio, matriz de acesso)
- [`docs/backlog-entrega2-3.md`](docs/backlog-entrega2-3.md) — backlog e status das entregas pós-MVP
- [`AGENTS.md`](AGENTS.md) — instruções para agentes de IA trabalhando neste repositório
