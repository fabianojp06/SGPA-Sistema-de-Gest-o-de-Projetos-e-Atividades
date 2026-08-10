# Template de Casos de Teste

Consulte este arquivo no **Case Mode** — ao detalhar casos de teste funcionais.

---

## Estrutura de um conjunto de casos de teste

Para cada feature, organize os casos em quatro grupos obrigatórios:

```
Feature: [Nome da Feature]
  |-- Grupo 1: Caminho feliz (o que deve funcionar)
  |-- Grupo 2: Cenarios negativos (o que deve ser rejeitado)
  |-- Grupo 3: Casos de borda (limites, extremos, simultaneidade)
  `-- Grupo 4: Seguranca e RBAC (perfil, auth, injecao)
```

---

## Template de caso individual

```markdown
### CT-[NNN] — [Resumo: verbo + objeto + condicao]

| Campo            | Valor                                                              |
|------------------|--------------------------------------------------------------------|
| **Modulo**       | [Projetos / Atividades / WINs / Riscos / Pedidos de Ajuda / Pautas]|
| **Grupo**        | Caminho feliz / Negativo / Borda / Seguranca                      |
| **Prioridade**   | P0 / P1 / P2 / P3                                                 |
| **Tipo**         | Funcional / Regressao / Seguranca / Performance / Exploratorio    |
| **RN aplicavel** | [RN-XX, se houver]                                                 |
| **Pre-condicao** | [estado exato do sistema e do banco antes de iniciar]             |
| **Perfil**       | admin / director / coordinator / technician / nao autenticado     |
| **Automatizado** | Sim (Vitest integracao) / Sim (Playwright E2E) / Nao              |

**Passos de execucao:**
1. [acao especifica — "Acessar /atividades/[id]"]
2. [acao — "Preencher campo 'Progresso' com '100'"]
3. [acao — "Clicar em 'Marcar como concluida'"]

**Resultado esperado:**
- [ ] [asserção 1 — o que deve aparecer na UI]
- [ ] [asserção 2 — o que deve estar no banco: "campo activity.status = DONE"]
- [ ] [asserção 3 — o que deve ter sido registrado: "AuditLog criado com action = STATUS_CHANGED"]

**Resultado obtido:** _(preencher na execucao)_
**Evidencias:** _(screenshot / log / payload)_
**Executado por / Data:** _____
**Status:** Passou / Falhou / Bloqueado / Nao executado
```

---

## Exemplo completo: Modulo de Atividades

### CT-001 — Concluir atividade com progresso 100% (tecnico responsavel)

| Campo            | Valor                                                    |
|------------------|-----------------------------------------------------------|
| **Modulo**       | Atividades                                               |
| **Grupo**        | Caminho feliz                                            |
| **Prioridade**   | P0                                                       |
| **Tipo**         | Funcional                                                |
| **RN aplicavel** | RN-01                                                    |
| **Pre-condicao** | Atividade com status "Em Andamento", progresso = 100%, atribuida ao tecnico logado |
| **Perfil**       | technician (responsavel pela atividade)                  |
| **Automatizado** | Sim (Vitest integracao + Playwright E2E)                 |

**Passos:**
1. Acessar `/atividades/{id}`
2. Confirmar que o campo "Progresso" mostra `100`
3. Clicar em "Marcar como concluida"

**Resultado esperado:**
- [ ] Mensagem de sucesso: "Atividade concluida com sucesso"
- [ ] Badge de status atualizado para "Concluida" (verde)
- [ ] Banco: `activity.status = 'DONE'`, `activity.completedAt` preenchido
- [ ] Banco: `project.progress` recalculado a partir das atividades filhas (RN-07)
- [ ] Banco: registro de auditoria criado com `userId`, `action = 'STATUS_CHANGED'`

---

### CT-002 — Rejeitar conclusao quando progresso e menor que 100%

| Campo            | Valor                                                    |
|------------------|-----------------------------------------------------------|
| **Modulo**       | Atividades                                               |
| **Grupo**        | Negativo                                                 |
| **Prioridade**   | P0                                                       |
| **RN aplicavel** | RN-01                                                    |
| **Pre-condicao** | Atividade com status "Em Andamento", progresso = 80%      |
| **Perfil**       | technician (responsavel pela atividade)                  |

**Passos:**
1. Acessar `/atividades/{id}`
2. Clicar em "Marcar como concluida" sem alterar o progresso

**Resultado esperado:**
- [ ] Mensagem de erro: "Nao e possivel concluir: o progresso deve ser 100%"
- [ ] Banco: `activity.status` permanece "IN_PROGRESS"
- [ ] Banco: `activity.completedAt` permanece nulo

---

### CT-003 — Alterar prazo de atividade para exatamente o prazo final do projeto (borda)

| Campo            | Valor                                                    |
|------------------|-----------------------------------------------------------|
| **Modulo**       | Atividades                                               |
| **Grupo**        | Borda                                                    |
| **Prioridade**   | P0                                                       |
| **RN aplicavel** | RN-02                                                    |
| **Pre-condicao** | Projeto com `endDate = 2026-06-30`; atividade com `dueDate = 2026-05-01` |
| **Perfil**       | coordinator                                              |

**Passos:**
1. Alterar o prazo da atividade para `2026-06-30` (exatamente o prazo final do projeto)
2. Informar justificativa "Ajuste de cronograma"
3. Confirmar

**Resultado esperado:**
- [ ] Alteracao aceita (prazo igual ao limite e permitido, apenas posterior e bloqueado)
- [ ] Banco: `activity.dueDate = 2026-06-30`
- [ ] Banco: `DeadlineChange` criado com `reason`, `changedById` e `createdAt`

---

### CT-004 — Technician nao acessa dashboard executivo do director (RBAC)

| Campo            | Valor                                                    |
|------------------|-----------------------------------------------------------|
| **Modulo**       | Dashboards                                               |
| **Grupo**        | Seguranca                                                |
| **Prioridade**   | P0                                                       |
| **Pre-condicao** | Usuario autenticado com role `technician`                 |
| **Perfil**       | technician                                               |

**Passos:**
1. Autenticar como technician
2. Tentar acessar `/dashboard/executivo`

**Resultado esperado:**
- [ ] Resposta HTTP 403 ou redirecionamento para pagina nao autorizada
- [ ] Dados agregados de todos os projetos nao sao exibidos
- [ ] Nenhuma query de agregacao executiva e disparada para esse usuario

---

### CT-005 — WIN repetido por 3 semanas dispara escalacao automatica (RN-09)

| Campo            | Valor                                                              |
|------------------|----------------------------------------------------------------------|
| **Modulo**       | WINs                                                               |
| **Grupo**        | Borda                                                              |
| **Prioridade**   | P0                                                                 |
| **RN aplicavel** | RN-09                                                              |
| **Pre-condicao** | Mesmo WIN (mesmo titulo) registrado com status diferente de Concluida nas semanas 1, 2 e 3 do ano |
| **Automatizado** | Sim (Vitest integracao — job pg_cron)                              |

**Passos:**
1. Executar o job da Regra das 3 Semanas para o ano corrente

**Resultado esperado:**
- [ ] `win.escalated = true` para o registro da terceira semana
- [ ] Alerta vinculado ao Plano de Acao (PLA-DEP-2026-001)
- [ ] Notificacao disparada ao gestor (via Resend) sem bloquear a execucao do job em caso de falha de e-mail
- [ ] Rodar o job novamente no mesmo dia nao gera uma segunda notificacao (idempotencia)

---

### CT-006 — Exclusao de projeto e logica, nunca fisica (RN-06)

| Campo            | Valor                                                    |
|------------------|-----------------------------------------------------------|
| **Modulo**       | Projetos                                                 |
| **Grupo**        | Negativo / Borda                                         |
| **Prioridade**   | P0                                                       |
| **RN aplicavel** | RN-06                                                    |
| **Pre-condicao** | Projeto ativo existente                                   |
| **Perfil**       | admin                                                    |

**Passos:**
1. Acessar `/projetos/{id}`
2. Clicar em "Excluir projeto" e confirmar

**Resultado esperado:**
- [ ] Projeto some da listagem padrao (`GET /projetos`)
- [ ] Registro **continua existindo no banco** com `deletedAt` preenchido
- [ ] Nenhum `DELETE` fisico e executado (verificar query gerada pelo Prisma)
- [ ] Registro de auditoria criado com `action = 'DELETED'`

---

## Guia de nomenclatura de casos

Padrao: `CT-[NNN] — [Verbo] [objeto] [condicao]`

Bons exemplos:
- `CT-012 — Rejeitar mudanca de status para valor fora do enum (RN-10)`
- `CT-013 — Exibir historico de alteracoes de prazo em ordem cronologica decrescente`
- `CT-014 — Bloquear alteracao de prazo por usuario sem perfil de gestor (RN-04)`

Ruins:
- `CT-012 — Testar atividade` (muito generico)
- `CT-013 — WIN funciona` (nao descreve a condicao)
