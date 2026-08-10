# ADR Patterns — SGPA

Referência para o **ADR Mode** do Tech Lead FSG.

## Numeração e Rastreabilidade

ADRs do SGPA seguem o padrão `ADR-[NNN]` sequencial por módulo:

- `ADR-CORE-001` — decisões da camada core / plataforma (Next.js, Supabase, Clerk)
- `ADR-PROJ-001` — decisões do módulo de Projetos e Atividades
- `ADR-WIN-001` — decisões do Card WIN digital (RN-09, escalação)
- `ADR-IA-001` — decisões sobre geração de pauta via Anthropic API
- `ADR-INFRA-001` — decisões de infraestrutura / deploy / jobs agendados

Se o usuário não informar o módulo, pergunte uma vez e assuma `CORE` por padrão.

O projeto já tem ADRs registrados no documento mestre (`docs/SGPA_Documento_Mestre_v1.0.md`,
seção 2.2) — trate-os como decisões aceitas, não reabra sem motivo novo:

| ADR | Decisão já tomada |
|-----|---------------------|
| ADR-001 | Monolito Modular Next.js (não microserviços) |
| ADR-002 | Next.js Full-Stack — frontend e backend no mesmo repo |
| ADR-003 | Supabase no lugar de AWS RDS + ElastiCache + S3 |
| ADR-004 | Clerk no lugar de NextAuth.js |
| ADR-005 | pg_cron + Edge Functions para jobs agendados (não BullMQ/SQS) |
| ADR-006 | Anthropic API (`claude-sonnet-4-6`) para geração de pauta |

Decisões técnicas adicionais já em vigor, fora do documento mestre original:
- **Prisma fixado em v6** — não propor upgrade para v7 sem ADR dedicado avaliando breaking changes.
- **Conexão ao Supabase via connection pooler** (`DATABASE_URL` com pooler, `DIRECT_URL` direto
  para migrations) — decisão tomada para contornar limitação de resolução IPv6 no ambiente de
  deploy. Não trocar para conexão direta sem revalidar essa restrição.

---

## Categorias de Decisão Mais Comuns no SGPA

### Regras de Progresso e Prazo (RN-01, RN-02, RN-07)

Padrão de decisão recorrente: onde e como validar consistência entre progresso de atividade,
status e prazo do projeto-pai.

| Estratégia                                   | Quando faz sentido                          | Risco principal                          |
|------------------------------------------------|------------------------------------------------|---------------------------------------------|
| Validação em Server Action (aplicação)        | Regras simples, poucas dependências            | Bypass via chamada direta ao Prisma em outro fluxo |
| Constraint/trigger no Postgres                | Regra que não pode ser violada sob hipótese alguma (ex: `progress` fora de 0-100) | Mensagem de erro menos amigável, exige migration |
| Supabase Function (RN-07: % do projeto)       | Cálculo derivado de agregação de filhos        | Latência extra, precisa de trigger de recálculo |

**Recomendação padrão para SGPA:** validação de regra de negócio (RN-01, RN-02, RN-03) na Server
Action, com `CHECK` constraint no banco como rede de segurança para os invariantes mais baratos
de expressar em SQL (ex: `progress BETWEEN 0 AND 100`).

---

### Escalação Automática (RN-09 — WIN repetido 3 semanas)

Decisão recorrente: onde roda a lógica de detecção de repetição e quem dispara a notificação.

```sql
-- Padrão recomendado: job pg_cron diário, idempotente
-- Detecta WINs com título/atividade repetida por 3 semanas consecutivas sem status DONE
UPDATE "Win" w
SET escalated = true
WHERE w."repeatCount" >= 3
  AND w.escalated = false
  AND w.status != 'DONE'
  AND w."deletedAt" IS NULL;
-- Notificação disparada em Edge Function separada, lendo os registros recém-marcados
```

**Por que job assíncrono, não trigger síncrono:** a regra depende de janela de tempo (3 semanas),
não de um único INSERT/UPDATE — mais simples de raciocinar e testar como job agendado do que
como trigger reativo encadeado.

---

### Geração de Pauta via IA — Síncrono vs Assíncrono

| Estratégia                       | Quando faz sentido                              | Risco principal                         |
|------------------------------------|-----------------------------------------------------|----------------------------------------------|
| Síncrono (usuário espera na tela) | Pauta Daily (poucos dados, resposta rápida)         | UX ruim se a API do Anthropic latenciar |
| Assíncrono (job + notificação)    | Pauta Semanal/Mensal (muitos dados, PDF/Word gerado) | Complexidade extra de fila e status      |
| Pré-geração agendada (pg_cron)    | Pauta recorrente com hora fixa (ex: toda segunda 07h) | Pauta pode ficar desatualizada se dado mudar depois |

**Recomendação padrão:** Daily e One-One síncronos (baixo volume de contexto); Semanal, Quinzenal
e Mensal pré-gerados via pg_cron na madrugada anterior à reunião, com botão de "regenerar" manual.

---

### Auditoria (RN-15 — AuditLog imutável)

**Sempre** que uma decisão envolver alterar comportamento de escrita em `AuditLog`, a resposta
correta é "não altere — crie uma nova linha". Não existe cenário legítimo de `UPDATE`/`DELETE`
em `AuditLog` na aplicação; correção de dado errado é uma nova entrada de auditoria explicando
a correção, nunca uma edição silenciosa do registro anterior.

---

## Template de Trade-off Rápido

Quando o usuário pede uma recomendação sem ADR formal, use este formato:

```
**Recomendação:** [opção]

**Por quê agora:** [2-3 razões específicas ao contexto SGPA — 1 dev + Claude Code, uso interno]

**O que você abre mão:** [custo aceito]

**Quando revisar:** [condição de gatilho]
```
