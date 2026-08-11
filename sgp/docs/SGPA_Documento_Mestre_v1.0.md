gun  
**SGPA**

**Sistema de Gestão de Projetos e Atividades**

**DOCUMENTO MESTRE DE REFERÊNCIA PARA DESENVOLVIMENTO**

*Versão 1.0  ·  Agosto de 2026  ·  Confidencial — Uso Interno*

| Área | AGP — Gerenciamento de Programa & Projetos |
| :---- | :---- |
| **Responsável** | Fabiano Garcia |
| **Stack** | Next.js 15 · TypeScript · Supabase · Clerk · Vercel · GitHub |
| **Dev tooling** | Claude Code (1 dev) — capacidade equivalente a time de 3–4 |
| **Status** | **Desenvolvimento — MVP em curso** |

# **1\. Visão do Produto**

O SGPA é um sistema web centralizado que substitui o Card WIN em planilha Excel e integra todo o ciclo de gestão: registro de atividades semanais (WINs), acompanhamento de projetos, alertas automáticos de prazo, dashboards gerenciais e geração automática de pautas para reuniões de diretoria.

## **1.1 Problema resolvido (AS-IS)**

| \# | Dor / Limitação | Impacto real |
| :---- | :---- | :---- |
| 1 | Planilha Excel individual por colaborador — sem visão consolidada | Gestor cego em tempo real |
| 2 | Limite artificial de 3 WINs por semana | Atividades omitidas ou perdidas |
| 3 | Prazo como número serial Excel (ex: 46234\) | Erro de interpretação e ilegibilidade |
| 4 | Status em texto livre — "FEITO", "EM ANDAMENTO" | Inconsistência entre colaboradores |
| 5 | Alerta de Risco sem categoria, dono ou prazo de resolução | Risco sem rastreabilidade |
| 6 | Regra das 3 semanas aplicada manualmente | Falha por dependência de memória humana |
| 7 | Sem histórico de evolução de status de atividade | Impossível auditar o que foi feito |
| 8 | Planilhas individuais — sem cruzamento de equipe | Diretoria recebe visão fragmentada |

## **1.2 Cadeia de valor TO-BE**

| Planejamento | Execução | Controle | Decisão |
| :---- | :---- | :---- | :---- |
| Criar ProjetoEscopo \+ FasesAtribuir EquipeDefinir Prazos | Registrar WINsAtualizar StatusProgressosSinalizar Bloqueios | Monitor Prazos/SLAAlerta RiscoRegra 3 SemanasHistórico Auditoria | Dashboards Real-timeAlerta ProativoPauta AutomáticaRelatórios Executivos |

# **2\. Stack Tecnológica e Arquitetura**

Arquitetura: Monolito Modular em Next.js 15 Full-Stack. Decisão baseada no perfil de 1 dev com Claude Code — elimina complexidade operacional de microserviços sem sacrificar modularidade interna.

## **2.1 Stack consolidada**

| Camada | Tecnologia | Justificativa |
| :---- | :---- | :---- |
| Framework | Next.js 15 (App Router) \+ TypeScript strict | Full-stack único, SSR, Server Actions |
| UI / Design System | Tailwind CSS \+ shadcn/ui | Componentes acessíveis, sem custo de design system próprio |
| Deploy | Vercel | CI/CD zero-config, preview por PR automático |
| Repositório | GitHub | Source of truth, integração nativa Vercel |
| Banco de Dados | Supabase (PostgreSQL gerenciado) | RLS nativo, Realtime, Storage, sem ops de banco |
| ORM | Prisma | Type-safe end-to-end, migrations, playground visual |
| Autenticação | Clerk | UI pronta, RBAC nativo, webhooks, SSO futuro |
| Realtime | Supabase Realtime | Dashboards e notificações ao vivo via WebSocket |
| Jobs agendados | Supabase pg\_cron \+ Edge Functions | Alertas automáticos e Regra das 3 Semanas |
| E-mail | Resend \+ React Email | Templates em React, 3k emails/mês grátis |
| Storage de arquivos | Supabase Storage | Anexos de atividades e WINs |
| PDF / Word | react-pdf \+ docx (npm) | Exportação de pautas |
| Dashboards/Gráficos | Recharts \+ Tremor | Dashboards gerenciais prontos para uso |
| IA assistiva | Anthropic API (claude-sonnet-4-6) | Geração de pauta, sugestões, resumos |
| Dev tooling | Claude Code | 1 dev \= capacidade de time de 3–4 |

## **2.2 Decisões arquiteturais (ADRs)**

| ADR | Decisão | Alternativas rejeitadas | Custo de reversão |
| :---- | :---- | :---- | :---- |
| ADR-001 | Monolito Modular Next.js | Microserviços (ops demais para 1 dev), Serverless (mal para WebSocket) | Médio — extração futura possível |
| ADR-002 | Next.js Full-Stack (frontend \+ backend no mesmo repo) | React+Vite \+ Node separado (2 repos, 2 deploys) | Médio |
| ADR-003 | Supabase no lugar de AWS RDS \+ ElastiCache \+ S3 | AWS puro (muito ops), PlanetScale (sem Realtime) | Alto — mas raramente necessário |
| ADR-004 | Clerk no lugar de NextAuth.js | NextAuth (mais config), Auth própria (risco de segurança) | Médio |
| ADR-005 | pg\_cron \+ Edge Functions para jobs | BullMQ+Redis (infra extra), AWS SQS+Lambda (vendor lock) | Baixo |
| ADR-006 | Anthropic API para geração de pauta | OpenAI (sem diferencial), regras manuais (sem inteligência) | Baixo |

## **2.3 Estrutura de pastas do projeto**

sgpa/

├── app/

│   ├── (auth)/              ← Clerk auth pages

│   ├── (dashboard)/

│   │   ├── page.tsx         ← Dashboard principal

│   │   ├── projetos/

│   │   ├── wins/

│   │   ├── reunioes/

│   │   └── riscos/

│   └── api/

│       ├── webhooks/clerk/

│       └── cron/            ← Edge functions (regra 3 semanas, alertas)

├── components/

│   ├── ui/                  ← shadcn/ui base

│   ├── wins/                ← WinCard, WinItem, WinForm

│   ├── projetos/            ← ProjectList, ProjectProgress

│   ├── dashboard/           ← KPICard, RiskPanel, AgendaPanel

│   └── layout/              ← Sidebar, Topbar

├── lib/

│   ├── supabase/            ← client, server, realtime hooks

│   ├── clerk/               ← auth helpers, permissions

│   └── resend/              ← email templates (React Email)

├── prisma/

│   └── schema.prisma        ← models completos

└── supabase/

    └── migrations/          ← pg\_cron jobs SQL

# **3\. Design System e UI/UX**

Tema: Dark-first com superfície grafite profissional. Elemento assinatura: barra lateral com radar de atividade em tempo real (pontos que pulsam via Supabase Realtime). Uma animação — gasta toda a boldness em um lugar só.

## **3.1 Paleta de cores**

| Token | Hex | Uso |
| :---- | :---- | :---- |
| \--bg-base | \#0D0F12 | Base da aplicação (fundo principal) |
| \--bg-surface | \#151820 | Superfície de cards e painéis |
| \--bg-elevated | \#1E2330 | Modais, dropdowns, tooltips |
| \--bg-subtle | \#252B3B | Hover states, linhas alternadas |
| \--accent | \#4F7EFF | Ações principais, itens ativos, links |
| \--accent-success | \#2DD4A0 | Concluído, no prazo, status OK |
| \--accent-warning | \#F5A524 | Atenção, prazo próximo, risco médio |
| \--accent-danger | \#F0544F | Atrasado, bloqueado, risco alto |
| \--accent-purple | \#9B6DFF | Reuniões, pautas, itens de agenda |
| \--text-primary | \#F0F2F8 | Texto principal (branco azulado) |
| \--text-secondary | \#8892A4 | Texto secundário, metadados |
| \--text-muted | \#4A5568 | Hints, placeholders, labels desabilitados |
| \--border-default | \#2A3A52 | Bordas padrão de cards |

## **3.2 Tipografia**

| Papel | Fonte | Uso |
| :---- | :---- | :---- |
| Display / Headings | Geist (Vercel) | Títulos de página, nome do sistema, destaques |
| Body / Interface | Inter | Corpo de texto, labels, navegação, formulários |
| Dados / Código | Geist Mono | Prazos, percentuais, IDs de projeto, semanas, status badges |

## **3.3 Componentes principais**

| Componente | Descrição | Status badges |
| :---- | :---- | :---- |
| KPICard | Número grande \+ label \+ delta \+ barra de progresso inferior | — |
| WinItem | Número do WIN \+ título \+ suporte \+ status badge \+ prazo colorido | — |
| ProjectCard | Ícone colorido \+ nome \+ área \+ barra de progresso \+ status | — |
| RiskItem | Ícone de nível \+ título \+ descrição \+ responsável | — |
| AlertaRegra3 | Banner âmbar inline no Card WIN ao detectar 3 semanas repetidas | — |
| SidebarNav | Ícone \+ label \+ badge de contagem \+ ponto de radar pulsante | — |
| — | Status "Em andamento" | Badge azul com ponto azul |
| — | Status "Concluído" | Badge verde com ponto verde |
| — | Status "Bloqueado" | Badge vermelho com ponto vermelho |
| — | Status "A fazer" | Badge cinza com ponto cinza |

# **4\. Perfis de Usuário e Permissões**

| Perfil (Clerk role) | Capacidades no sistema |
| :---- | :---- |
| director | Visão global irrestrita de todos os projetos e WINs, dashboards executivos, aprovação de projetos, recebimento de pauta gerada automaticamente |
| coordinator | Criar e gerenciar projetos, definir atividades, atribuir responsáveis e prazos, acompanhar progresso da equipe, gerar relatórios, aprovar escalações de risco |
| technician | Registrar WINs da própria semana, atualizar status de atividades atribuídas, registrar progresso %, sinalizar riscos e pedidos de ajuda |
| admin | Gerenciar usuários, perfis de acesso, parâmetros do sistema, visualizar logs de auditoria, configurar notificações globais |

## **4.1 Matriz de acesso por recurso**

| Recurso | admin | director | coordinator | technician |
| :---- | :---- | :---- | :---- | :---- |
| Ver todos os projetos | ✅ | ✅ | Apenas os seus | Apenas alocados |
| Criar projeto | ✅ | ✅ | ✅ | — |
| Editar projeto de outro | ✅ | ✅ | — | — |
| Registrar WIN | ✅ | ✅ | ✅ | ✅ |
| Ver WINs de toda equipe | ✅ | ✅ | ✅ | — |
| Alterar prazo de atividade | ✅ | ✅ | ✅ | — |
| Aprovar escalação (Regra 3s) | ✅ | ✅ | ✅ | — |
| Gerar pauta de reunião | ✅ | ✅ | ✅ | — |
| Acessar dashboard executivo | ✅ | ✅ | — | — |
| Gerenciar usuários | ✅ | — | — | — |
| Ver logs de auditoria | ✅ | ✅ | — | — |

# **5\. Backlog Completo — Épicos e Histórias de Usuário**

  **MVP — ENTREGA 1: Core de Projetos, Atividades e Card WIN Digital**

Prioridade máxima. Substitui o Card WIN em planilha Excel e entrega o núcleo funcional do sistema. Critério de saída: equipe GIA e STI usando o SGPA no lugar das planilhas.

### **EP-01 — Gestão de Projetos**

| ID | História de Usuário | Prior. | Porte | Entrega |
| :---- | :---- | :---- | :---- | :---- |
| US-001 | Criar projeto com dados básicos (nome, descrição, área, responsável, datas, status) | Alta | M | MVP |
| US-002 | Editar e versionar dados do projeto com registro automático de alterações | Alta | P | MVP |
| US-003 | Definir fases/etapas do projeto com datas e responsáveis por fase | Alta | M | MVP |
| US-004 | Associar equipe ao projeto com papéis (gestor, membro, leitura) | Alta | M | MVP |
| US-005 | Encerrar ou arquivar projeto com justificativa obrigatória | Média | P | MVP |
| US-006 | Clonar projeto existente como template para novos projetos | Baixa | P | MVP |

### **EP-02 — Gestão de Atividades**

| ID | História de Usuário | Prior. | Porte | Entrega |
| :---- | :---- | :---- | :---- | :---- |
| US-007 | Criar atividade vinculada a projeto (título, descrição, tipo, prioridade) | Alta | M | MVP |
| US-008 | Atribuir responsável, suporte e prazo à atividade | Alta | P | MVP |
| US-009 | Atualizar status: A Fazer → Em Andamento → Concluída → Bloqueada → Cancelada | Alta | M | MVP |
| US-010 | Registrar progresso % (0-100) com histórico de atualizações | Alta | P | MVP |
| US-011 | Criar dependência entre atividades (predecessora / successora) | Média | G | MVP |
| US-012 | Comentar e anexar arquivos em uma atividade | Média | M | MVP |
| US-013 | Criar sub-atividades (checklist hierárquico dentro de uma atividade) | Média | M | MVP |

### **EP-03 — Controle de Prazos e Alertas**

| ID | História de Usuário | Prior. | Porte | Entrega |
| :---- | :---- | :---- | :---- | :---- |
| US-014 | Sinalizar automaticamente atividades atrasadas (prazo vencido \+ status ≠ Concluída) | Alta | M | MVP |
| US-015 | Sinalizar atividades com prazo próximo (janela configurável em dias) | Alta | P | MVP |
| US-016 | Enviar notificação por e-mail e sistema ao responsável e gestor | Alta | G | MVP |
| US-017 | Registrar histórico de alterações de prazo com justificativa obrigatória | Média | P | MVP |
| US-018 | Bloquear conclusão de atividade com predecessora não iniciada (configurável) | Baixa | M | MVP |

### **EP-04 — Perfis de Acesso e Segurança**

| ID | História de Usuário | Prior. | Porte | Entrega |
| :---- | :---- | :---- | :---- | :---- |
| US-019 | Administrador cria e gerencia usuários, perfis e permissões via Clerk | Alta | M | MVP |
| US-020 | Controle de acesso por projeto: membro, gestor, somente leitura | Alta | G | MVP |
| US-021 | Técnico visualiza apenas projetos e atividades onde está alocado | Alta | M | MVP |
| US-022 | Diretor tem visão global irrestrita de todos os projetos e WINs | Alta | P | MVP |
| US-023 | Log de auditoria de ações críticas: criação, exclusão, alteração de prazo | Média | M | MVP |

### **EP-07 — Card WIN Digital (substitui a planilha Excel)**

Módulo central do MVP. Digitaliza e automatiza o Card WIN, elimina planilhas individuais, centraliza visibilidade e implementa a Regra das 3 Semanas automaticamente.

| ID | História de Usuário | Prior. | Porte | Entrega |
| :---- | :---- | :---- | :---- | :---- |
| US-036 | Registrar WINs da semana atual (título, suporte, prazo, status) — sem limite de quantidade | Alta | M | MVP |
| US-037 | Visualizar WINs da semana anterior como retrospectiva automática ao abrir o card | Alta | P | MVP |
| US-038 | Sistema detecta WIN repetido por 3 semanas e alerta gestor para escalação ao Plano de Ação | Alta | G | MVP |
| US-039 | Registrar Alerta de Risco com categoria, nível (baixo/médio/alto/crítico), responsável e status | Alta | M | MVP |
| US-040 | Registrar Pedido de Ajuda com destinatário, prazo de resposta e status de atendimento | Alta | M | MVP |
| US-041 | Vincular WIN a um projeto cadastrado no sistema (rastreabilidade total) | Média | P | MVP |
| US-042 | Visão consolidada de todos os Cards WIN da equipe por semana — acessível ao gestor e diretor | Alta | G | MVP |

  **ENTREGA 2: Dashboards Gerenciais**

### **EP-05 — Dashboards por Perfil**

| ID | História de Usuário | Prior. | Porte | Entrega |
| :---- | :---- | :---- | :---- | :---- |
| US-024 | Dashboard do Técnico: minhas atividades, WINs da semana, prazos, % concluído | Alta | G | Entrega 2 |
| US-025 | Dashboard do Coordenador: status de todos os projetos e índice de entrega da equipe | Alta | G | Entrega 2 |
| US-026 | Dashboard Executivo (Diretor): portfolio completo, projetos críticos, KPIs | Alta | XG | Entrega 2 |
| US-027 | Gráfico de Gantt interativo por projeto com marcos e dependências | Média | XG | Entrega 2 |
| US-028 | SLA: % de atividades no prazo vs. atrasadas por projeto e por responsável | Alta | G | Entrega 2 |
| US-029 | Heatmap de carga de trabalho por membro da equipe | Média | G | Entrega 2 |
| US-030 | Filtros globais: período, projeto, área, responsável, status e prioridade | Alta | M | Entrega 2 |

  **ENTREGA 3: Pauta Automática para Reuniões**

### **EP-06 — Geração de Pauta e Ata**

| ID | História de Usuário | Prior. | Porte | Entrega |
| :---- | :---- | :---- | :---- | :---- |
| US-031 | Configurar modelo de pauta por tipo de reunião (Daily, Semanal, Quinzenal, Mensal) | Alta | G | Entrega 3 |
| US-032 | Gerar pauta da Daily: orientações pendentes \+ WINs do dia | Alta | G | Entrega 3 |
| US-033 | Gerar pauta Semanal: WINs \+ riscos \+ pedidos de ajuda \+ plano de ação | Alta | G | Entrega 3 |
| US-034 | Gerar pauta Quinzenal: revisão do Plano de Ação (PLA-DEP-2026-001) | Média | M | Entrega 3 |
| US-035 | Gerar pauta Mensal: eventos próximos \+ plano de ação \+ assuntos diversos | Média | G | Entrega 3 |
| US-043 | Exportar pauta em PDF e Word (.docx) com identidade visual do setor | Alta | M | Entrega 3 |
| US-044 | Registrar ata e decisões tomadas na reunião vinculadas ao projeto correspondente | Média | G | Entrega 3 |
| US-045 | Geração automática de pauta One-One com histórico do colaborador | Baixa | M | Entrega 3 |

*Legenda de porte: P \= Pequeno (1-3 dias)  |  M \= Médio (3-7 dias)  |  G \= Grande (1-2 semanas)  |  XG \= Extra Grande (2-4 semanas)*

# **6\. Regras de Negócio**

Estas regras são não-negociáveis. Toda feature implementada deve respeitar as RNs abaixo. Regras com criticidade Alta devem ser validadas no backend — nunca somente no frontend.

| ID | Regra de Negócio | Criticidade | Onde validar |
| :---- | :---- | :---- | :---- |
| RN-01 | Atividade só pode ser marcada "Concluída" se progresso \= 100% | Alta | Backend \+ UI |
| RN-02 | Prazo de atividade não pode ser posterior ao prazo final do projeto-pai | Alta | Backend |
| RN-03 | Alteração de prazo exige justificativa obrigatória e registra ator \+ timestamp | Alta | Backend |
| RN-04 | Apenas Gestor ou Admin pode alterar prazo de atividades de outros | Alta | Backend (RBAC) |
| RN-05 | Projetos sem atividade registrada por 30 dias recebem status automático "Parado" | Média | pg\_cron |
| RN-06 | Toda exclusão é lógica (soft delete) — nunca DELETE físico no banco | Alta | ORM / Prisma |
| RN-07 | % de conclusão do projeto calculado automaticamente a partir das atividades filhas | Alta | Supabase Function |
| RN-08 | Janela de alerta de prazo próximo é configurável por gestor (padrão: 3 dias) | Média | pg\_cron \+ config |
| RN-09 | WIN com status ≠ Concluída por 3 semanas consecutivas gera alerta automático de escalação ao Plano de Ação | Alta | pg\_cron \+ notif |
| RN-10 | Status seguem conjunto fechado: A Fazer → Em Andamento → Concluída → Bloqueada → Cancelada | Alta | DB enum \+ UI |
| RN-11 | Alerta de Risco deve ter: categoria, nível (baixo/médio/alto/crítico), responsável e status | Alta | Backend \+ Form |
| RN-12 | Pedido de Ajuda deve ter: destinatário, prazo de resposta e status de atendimento | Alta | Backend \+ Form |
| RN-13 | WIN pode ser vinculado a um projeto cadastrado (rastreabilidade) | Média | UI \+ Backend |
| RN-14 | Notificações por e-mail usam Resend — falha no envio não pode bloquear a operação principal | Alta | Async / try-catch |
| RN-15 | Logs de auditoria são imutáveis — INSERT only, sem UPDATE ou DELETE | Alta | Prisma middleware |

# **7\. Modelo de Dados — Schema Prisma**

Schema completo para referência. Use como base para gerar as migrations Supabase. Todos os models usam soft delete (deletedAt). UUIDs como PK. Enum de status fechados.

// prisma/schema.prisma

generator client {

  provider \= "prisma-client-js"

}

datasource db {

  provider  \= "postgresql"

  url       \= env("DATABASE\_URL")

  directUrl \= env("DIRECT\_URL")

}

// ── Enums ─────────────────────────────────────────

enum ProjectStatus {

  ACTIVE PAUSED COMPLETED ARCHIVED CANCELLED

}

enum ActivityStatus {

  TODO IN\_PROGRESS DONE BLOCKED CANCELLED

}

enum WinStatus {

  TODO IN\_PROGRESS DONE BLOCKED CANCELLED

}

enum RiskLevel {

  LOW MEDIUM HIGH CRITICAL

}

enum RiskStatus {

  OPEN MITIGATING RESOLVED

}

enum MeetingType {

  DAILY WEEKLY BIWEEKLY MONTHLY ONE\_ON\_ONE

}

enum UserRole {

  admin director coordinator technician

}

// ── Models ────────────────────────────────────────

model User {

  id        String    @id @default(cuid())

  clerkId   String    @unique

  name      String

  email     String    @unique

  role      UserRole  @default(technician)

  area      String?

  createdAt DateTime  @default(now())

  updatedAt DateTime  @updatedAt

  deletedAt DateTime?

  projects       ProjectMember\[\]

  activities     Activity\[\]

  wins           Win\[\]

  risks          Risk\[\]

  helpRequests   HelpRequest\[\]

  auditLogs      AuditLog\[\]

}

model Project {

  id          String        @id @default(cuid())

  code        String        @unique  // ex: SGO-2026-001

  name        String

  description String?

  area        String

  status      ProjectStatus @default(ACTIVE)

  startDate   DateTime

  endDate     DateTime

  progress    Int           @default(0)  // 0-100, calculado

  createdAt   DateTime      @default(now())

  updatedAt   DateTime      @updatedAt

  deletedAt   DateTime?

  members     ProjectMember\[\]

  phases      ProjectPhase\[\]

  activities  Activity\[\]

  wins        Win\[\]

  risks       Risk\[\]

}

model ProjectMember {

  id        String   @id @default(cuid())

  projectId String

  userId    String

  role      String   // manager | member | viewer

  project   Project  @relation(fields:\[projectId\], references:\[id\])

  user      User     @relation(fields:\[userId\], references:\[id\])

  @@unique(\[projectId, userId\])

}

model Activity {

  id            String         @id @default(cuid())

  projectId     String

  parentId      String?        // sub-atividade

  title         String

  description   String?

  status        ActivityStatus @default(TODO)

  priority      String         @default("medium")

  progress      Int            @default(0)

  assignedToId  String?

  supportId     String?

  dueDate       DateTime

  completedAt   DateTime?

  predecessorId String?

  createdAt     DateTime       @default(now())

  updatedAt     DateTime       @updatedAt

  deletedAt     DateTime?

  project       Project        @relation(fields:\[projectId\], references:\[id\])

  assignedTo    User?          @relation(fields:\[assignedToId\], references:\[id\])

  deadlineChanges DeadlineChange\[\]

  comments      ActivityComment\[\]

  attachments   Attachment\[\]

}

model Win {

  id          String    @id @default(cuid())

  userId      String

  projectId   String?

  weekNumber  Int

  year        Int

  title       String

  status      WinStatus @default(TODO)

  supportName String?

  dueDate     DateTime

  repeatCount Int       @default(1)  // RN-09: conta semanas repetidas

  escalated   Boolean   @default(false)

  createdAt   DateTime  @default(now())

  updatedAt   DateTime  @updatedAt

  deletedAt   DateTime?

  user        User      @relation(fields:\[userId\], references:\[id\])

  project     Project?  @relation(fields:\[projectId\], references:\[id\])

}

model Risk {

  id          String     @id @default(cuid())

  projectId   String?

  userId      String

  weekNumber  Int

  year        Int

  title       String

  description String

  level       RiskLevel

  status      RiskStatus @default(OPEN)

  ownerId     String?    // responsável pela mitigação

  dueDate     DateTime?

  createdAt   DateTime   @default(now())

  updatedAt   DateTime   @updatedAt

  project     Project?   @relation(fields:\[projectId\], references:\[id\])

  user        User       @relation(fields:\[userId\], references:\[id\])

}

model HelpRequest {

  id          String   @id @default(cuid())

  userId      String

  weekNumber  Int

  year        Int

  description String

  targetName  String

  dueDate     DateTime?

  resolved    Boolean  @default(false)

  createdAt   DateTime @default(now())

  user        User     @relation(fields:\[userId\], references:\[id\])

}

model AuditLog {

  id         String   @id @default(cuid())

  userId     String

  action     String   // CREATED | UPDATED | DELETED | STATUS\_CHANGED | DEADLINE\_CHANGED

  entity     String   // Project | Activity | Win | Risk

  entityId   String

  before     Json?

  after      Json?

  createdAt  DateTime @default(now())

  user       User     @relation(fields:\[userId\], references:\[id\])

}

model Meeting {

  id        String      @id @default(cuid())

  type      MeetingType

  weekNumber Int

  year      Int

  date      DateTime

  agenda    Json?       // gerada automaticamente

  minutes   String?     // ata

  decisions Json?       // decisões tomadas

  createdAt DateTime    @default(now())

  updatedAt DateTime    @updatedAt

}

model DeadlineChange {

  id           String   @id @default(cuid())

  activityId   String

  changedById  String

  oldDate      DateTime

  newDate      DateTime

  reason       String   // obrigatório — RN-03

  createdAt    DateTime @default(now())

  activity     Activity @relation(fields:\[activityId\], references:\[id\])

}

# **8\. Estrutura de Reuniões da Equipe**

O SGPA gera automaticamente a pauta de cada tipo de reunião com base nos dados reais do sistema. Estrutura definida pela equipe GIA/STI e registrada no Card WIN (arquivo de referência).

| Tipo | Freq. | Duração | Dia/Hora | Pauta gerada pelo SGPA |
| :---- | :---- | :---- | :---- | :---- |
| Daily | Diária (ter-sex) | 15 min | 08h30 | Orientações pendentes \+ WINs do dia de cada colaborador |
| Semanal | Segunda-feira | 30 min | 08h30 | WINs da semana \+ riscos \+ pedidos de ajuda \+ revisão plano de ação |
| Quinzenal | Sexta-feira | 45 min | 08h45 | Revisão completa do Plano de Ação (PLA-DEP-2026-001) |
| Mensal | Sexta-feira\* | 1h30 | 08h30 | Eventos próximos (\~4 semanas) \+ rodada livre \+ plano de ação (\* sem daily no dia) |
| One-One | A cada 45 dias | 30-50 min | A combinar | Desenvolvimento do colaborador \+ histórico de WINs \+ feedbacks |

## **8.1 Plano de Ação de Referência**

PLA-DEP-2026-001 — Acompanhamento das atividades GIA & STI. Destino obrigatório de WINs que repetem por 3 semanas (RN-09). Revisado quinzenal e mensalmente.

# **9\. Roadmap de Entregas**

| Entrega | Épicos | Histórias | Foco | Critério de saída |
| :---- | :---- | :---- | :---- | :---- |
| MVP — Entrega 1 | EP-01, 02, 03, 04, 07 | US-001 a 023 \+ 036 a 042 | Core \+ Card WIN digital | Equipe GIA/STI usando SGPA no lugar das planilhas |
| Entrega 2 | EP-05 | US-024 a 030 | Dashboards gerenciais | Diretor acessa dashboard executivo em reunião real |
| Entrega 3 | EP-06 | US-031 a 045 | Pauta automática \+ ata | Pauta semanal gerada sem intervenção manual |

## **9.1 Indicadores de sucesso**

| Indicador | Baseline (AS-IS) | Meta (TO-BE) | Prazo |
| :---- | :---- | :---- | :---- |
| % WINs registrados no SGPA vs. planilha | 0% | 100% — extinção da planilha | Após MVP |
| Tempo de preparação da pauta semanal | \~30 min (manual) | \< 2 min (automático) | Após Entrega 3 |
| % atividades atrasadas sem alerta proativo | \~100% | \< 10% | Após MVP |
| Visibilidade consolidada da equipe | Inexistente | 100% dos projetos visíveis | Após MVP |
| Escalações da Regra das 3 semanas | Dependência de memória | 100% automatizado | Após MVP |
| Satisfação da Diretoria c/ informações | Não medido | Nota ≥ 4,0 / 5,0 | Após Entrega 2 |

# **10\. Prompt Mestre para Contextualizar o Claude Code**

Use este prompt no início de cada sessão de desenvolvimento com o Claude Code. Ele fornece todo o contexto necessário para o Claude entender o projeto, a stack, as regras de negócio e a feature em desenvolvimento.

## **10.1 Prompt de contexto global (usar em toda nova sessão)**

\# CONTEXTO DO PROJETO — SGPA

\#\# O que é o SGPA

Sistema web de Gestão de Projetos e Atividades para uso interno.

Substitui planilhas Excel (Card WIN) por um sistema centralizado com

dashboards em tempo real e geração automática de pautas de reunião.

\#\# Stack

\- Next.js 15 (App Router) \+ TypeScript strict

\- Tailwind CSS \+ shadcn/ui

\- Supabase (PostgreSQL \+ Realtime \+ Storage)

\- Clerk (autenticação \+ RBAC)

\- Prisma ORM (schema em prisma/schema.prisma)

\- Vercel (deploy) \+ GitHub (repositório)

\- Resend \+ React Email (e-mails transacionais)

\- Anthropic API claude-sonnet-4-6 (geração de pauta com IA)

\#\# Perfis de usuário (Clerk roles)

\- admin: acesso total, gerencia usuários

\- director: visão global, dashboards executivos, aprovações

\- coordinator: gerencia projetos e equipe

\- technician: registra WINs e atualiza atividades próprias

\#\# Regras de negócio críticas

\- RN-01: Atividade só conclui com progresso \= 100%

\- RN-02: Prazo de atividade \<= prazo do projeto-pai

\- RN-03: Alteração de prazo exige justificativa (registra ator \+ timestamp)

\- RN-06: Nunca DELETE físico — usar deletedAt (soft delete)

\- RN-09: WIN repetido 3 semanas → alerta de escalação automático (pg\_cron)

\- RN-10: Status são enums fechados — nunca texto livre

\- RN-15: AuditLog é INSERT only — imutável

\#\# Design System

\- Tema: dark-first (--bg-base: \#0D0F12)

\- Fonte corpo: Inter | Fonte dados: Geist Mono

\- Cores: \--accent \#4F7EFF | \--success \#2DD4A0 |

         \--warning \#F5A524 | \--danger \#F0544F | \--purple \#9B6DFF

\- Componentes: shadcn/ui customizados com o design system acima

\#\# Convenções de código

\- Server Actions para mutações (não API Routes para forms)

\- API Routes apenas para endpoints de dados (dashboards, webhooks)

\- Validação com Zod em Server Actions e API Routes

\- Erros: nunca retornar stack trace para o cliente

\- Auditoria: toda mutação crítica registra em AuditLog

\- Supabase Realtime: usar para atualizações de dashboard e WINs

\#\# Feature em desenvolvimento nesta sessão

\[DESCREVA AQUI A FEATURE ATUAL — ex: EP-07 / US-036 — Registrar WINs\]

\#\# Arquivos relevantes para esta sessão

\[LISTE OS ARQUIVOS QUE O CLAUDE DEVE LER PRIMEIRO\]

## **10.2 Prompts específicos por tipo de tarefa**

#### **Para implementar uma User Story:**

Implemente a \[US-XXX\] — \[Título\].

Contexto da US:

\- Como \[perfil\], quero \[ação\] para \[objetivo\].

Regras de negócio aplicáveis: \[RN-XX, RN-XX\]

Critérios de aceite:

1\. \[cenário feliz\]

2\. \[cenário de erro\]

3\. \[auditoria\]

Arquivos a criar/editar: \[lista\]

Não esqueça: soft delete, validação Zod, Server Action, AuditLog.

#### **Para criar um componente de UI:**

Crie o componente \[NomeComponente\] seguindo o design system do SGPA.

Dark-first. Usar CSS variables do design system.

Fonte de dados: Geist Mono. Fonte de interface: Inter.

Props necessárias: \[descreva\]

Comportamento: \[descreva interações\]

Estados: loading | error | empty | populated

Use shadcn/ui como base e customize com Tailwind.

#### **Para criar uma Server Action:**

Crie a Server Action \[nomeAction\] para \[operação\].

Validação: Zod schema para os inputs.

Auth: verificar role com Clerk antes de executar.

Banco: Prisma — lembrar soft delete onde aplicável.

Auditoria: registrar em AuditLog (INSERT only).

E-mail: disparar via Resend se aplicável (não bloquear fluxo principal).

Retorno: { success: true, data } | { success: false, error: string }

#### **Para criar um job agendado (pg\_cron):**

Crie o job pg\_cron para \[finalidade — ex: Regra das 3 Semanas\].

Frequência: \[ex: todo dia às 07h00 BRT\]

Lógica: \[descreva a query ou o que o job deve fazer\]

Notificação: disparar via pg\_net → Edge Function → Resend

Log: registrar execução em tabela de cron\_log

# **11\. Fora do Escopo e Restrições**

| Item excluído | Justificativa / Avaliação futura |
| :---- | :---- |
| Integração com sistemas externos (SIAFI, ERP) | Sem requisito mapeado — avaliar Entrega 4 |
| App mobile nativo (iOS/Android) | MVP foca em web responsiva — avaliar pós-maturidade |
| Módulo financeiro / orçamentário | Fora do domínio de gestão de projetos |
| Videoconferência integrada | Usar ferramentas existentes (Teams, Meet) |
| Relatórios contábeis | Escopo da área financeira (GFIN) |
| IA para sugestão automática de prazos | Avaliar após dados suficientes (Entrega 4+) |
| Multi-tenancy (múltiplas organizações) | Sistema de uso interno — tenant único |

# **12\. Histórico de Versões**

| Versão | Data | Autor | Descrição |
| :---- | :---- | :---- | :---- |
| 1.0 | Agosto/2026 | Fabiano Garcia | Versão inicial — escopo completo baseado no Card WIN AS-IS, levantamento GIA/STI, stack e arquitetura definidas |

*SGPA — Documento Mestre de Referência  ·  v1.0  ·  Agosto de 2026  ·  Confidencial — Uso Interno*

*AGP — Gerenciamento de Programa & Projetos  ·  GIA & STI  ·  Empresa Privada / Mista*