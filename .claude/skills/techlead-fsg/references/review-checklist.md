# Review Checklist — SGPA

Referência para o **Review Mode** do Tech Lead FSG.

## Severidade

- P1 — Bloqueador: merge bloqueado até corrigir (risco de integridade de dados, segurança, perda de histórico/auditoria)
- P2 — Importante: corrigir nesta PR ou abrir issue rastreada antes de merge
- P3 — Sugestão: melhoria desejável, pode ir em PR futura

---

## Checklist por Categoria

### Integridade de Dados e Regras de Negócio (P1 automático se falhar)

- [ ] Nenhum `prisma.<model>.delete()` em entidades de domínio (Project, Activity, Win, Risk, User)? Sempre `deletedAt` (RN-06)?
- [ ] Toda query de leitura de domínio filtra `deletedAt: null` por padrão?
- [ ] Atividade só é marcada `DONE` quando `progress = 100` (RN-01), validado no backend?
- [ ] Prazo de atividade nunca é aceito além do prazo do projeto-pai (RN-02), validado no backend?
- [ ] Alteração de prazo grava `DeadlineChange` com justificativa obrigatória + ator + timestamp (RN-03)?
- [ ] Status usa o enum Prisma correspondente, nunca `string` livre (RN-10)?
- [ ] Mutação crítica grava `AuditLog` na mesma transação (nunca depois, nunca "se der tempo")?
- [ ] Nenhum código propõe `UPDATE`/`DELETE` sobre `AuditLog` — é INSERT only (RN-15)?

### RBAC / Perfis Clerk (P1 automático se falhar)

- [ ] Toda mutação sensível (alterar prazo, aprovar escalação, gerar pauta, gerenciar usuários) verifica `role` no backend, não só esconde botão na UI?
- [ ] A verificação de role usa a matriz de acesso oficial (`references/auth-and-roles-patterns.md`), não um critério improvisado?
- [ ] Nenhuma tentativa de introduzir isolamento por tenant/organização — o SGPA não é multi-tenant?

### Arquitetura / Camadas

- [ ] Mutação de domínio passa por Server Action, não por chamada direta ao Prisma dentro de um Client Component?
- [ ] Lógica de regra de negócio está na Server Action, não espalhada em componentes de UI?
- [ ] Novo módulo segue a estrutura de pastas do monolito modular (`app/`, `components/`, `lib/actions/`), sem introduzir camadas DDD desnecessárias para o porte do time?

### TypeScript (P2 se falhar)

- [ ] Nenhum `any` — tipos explícitos ou `unknown` com narrowing?
- [ ] Inputs de Server Action validados com Zod antes de tocar o banco?
- [ ] Enums de domínio (`@prisma/client`) usados em vez de strings literais soltas?
- [ ] Erros tipados (`DomainError` subclasses) em vez de `throw new Error('string')` para erros de regra de negócio?

### React / Next.js (P2 se falhar)

- [ ] `'use client'` só onde necessário (interatividade, Realtime)? Server Component por padrão?
- [ ] Nenhuma chamada de banco direta em Server Component de escrita (deve passar por Server Action)?
- [ ] `loading.tsx` e `error.tsx` presentes para rotas críticas (dashboards, projetos)?
- [ ] Formulários validados no servidor (não só no cliente)?
- [ ] `revalidatePath`/`revalidateTag` chamado após mutação para manter cache consistente?

### PostgreSQL / Prisma (P2 se falhar)

- [ ] Índices adicionados para colunas usadas em `WHERE`, `JOIN`, `ORDER BY` frequentes (ex: `projectId`, `dueDate`, `status`)?
- [ ] Migrations reversíveis? Impacto em produção avaliado (`prisma migrate diff` revisado)?
- [ ] `NOT NULL` para colunas obrigatórias? Defaults explícitos?
- [ ] Constraints de FK declaradas? `CHECK` para invariantes baratos (ex: `progress BETWEEN 0 AND 100`)?
- [ ] Nenhuma migration usa conexão direta onde o pooler é exigido (ou vice-versa — `DATABASE_URL` vs `DIRECT_URL`)?

### Integração com IA (Anthropic API) — quando aplicável (P2 se falhar)

- [ ] Chamada à Anthropic API tem tratamento de erro e fallback (não bloqueia a reunião)?
- [ ] Prompt é montado só com dados já validados do Prisma, sem inventar contexto?
- [ ] Contexto enviado é o mínimo necessário para o tipo de pauta (não vaza dados de outros usuários sem necessidade)?
- [ ] Custo/latência considerados explicitamente (síncrono vs pré-gerado por pg_cron)?

### Testes (P2 se ausente em lógica crítica)

- [ ] Regras de negócio (RN-01 a RN-15) cobertas por teste unitário/integração?
- [ ] Cenários de erro (prazo inválido, role sem permissão, progresso fora de 0-100) testados?
- [ ] Teste garante que `AuditLog` é criado nas mutações críticas?

### Legibilidade (P3)

- [ ] Nomes de variáveis e funções em português (domínio) ou inglês (técnico) consistentemente?
- [ ] Comentários de intenção onde a lógica não é óbvia (especialmente referências a RN-XX)?
- [ ] TODOs rastreáveis com issue/ticket?

---

## Formato de Saída do Review

```markdown
## Code Review — [nome do módulo / PR]

### P1 — Bloqueadores
1. **[arquivo:linha]** — [problema] → [impacto no SGPA] → [solução proposta]

### P2 — Importantes
1. **[arquivo:linha]** — [problema] → [solução]

### P3 — Sugestões
1. **[arquivo:linha]** — [sugestão]

### Pontos Positivos
- [o que está bem feito — sempre incluir ao menos um]

### Veredicto
[ ] Aprovado | [ ] Aprovado com P3s | [ ] Bloqueado (P1 ou P2 não resolvido)
```