# Backlog Patterns — SGPA

Guia de priorização, refinamento e rastreabilidade.

---

## Estrutura do Backlog do SGPA

```
Produto: SGPA
│
├── EP-01 — Gestão de Projetos
├── EP-02 — Gestão de Atividades
├── EP-03 — Controle de Prazos e Alertas
├── EP-04 — Perfis de Acesso e Segurança
├── EP-05 — Dashboards por Perfil
├── EP-06 — Geração de Pauta e Ata
└── EP-07 — Card WIN Digital (substitui a planilha Excel)
```

---

## Critérios de Priorização

Usar score ponderado. Pontuar cada US de 1 a 5 em cada critério:

| Critério                    | Peso | Descrição                                              |
|------------------------------|------|----------------------------------------------------------|
| Substitui a planilha (AS-IS)| 3×   | A funcionalidade extingue um uso remanescente do Excel? |
| Risco de inconsistência     | 2×   | Erros podem gerar dado incorreto no dashboard/pauta?    |
| Bloqueio de outras stories  | 2×   | Outras US dependem desta?                              |
| Frequência de uso           | 1×   | Quantos usuários usam e com que frequência (diária > semanal)? |
| Complexidade de entrega     | −1×  | Quanto mais complexo, menor a prioridade relativa      |

**Score = (planilha × 3) + (inconsistência × 2) + (bloqueio × 2) + (frequência × 1) − (complexidade × 1)**

---

## Checklist de Refinamento de Story

Antes de mover uma US para "pronta para desenvolvimento", verificar:

### Clareza
- [ ] A US tem persona (perfil Clerk), ação e objetivo definidos
- [ ] Não há ambiguidade na descrição ("rápido", "adequado", "quando necessário" = reescrever)
- [ ] Regras de negócio referenciadas com RN-NNN (quando aplicável)

### Critérios de Aceite
- [ ] Cenário feliz (happy path) descrito com Gherkin
- [ ] Cenário de estado inválido especificado (progresso incompleto, prazo violado, status errado)
- [ ] Cenário de usuário sem permissão especificado (RBAC por perfil)
- [ ] Comportamento de reabertura/correção especificado (se a operação for reversível)
- [ ] Mensagens de erro com texto exato definido

### Impacto Técnico
- [ ] Tabelas e campos afetados identificados (nomes reais do `schema.prisma`)
- [ ] Necessidade de transação declarada (ex: status + recálculo de progresso)
- [ ] Requisito de RBAC declarado (qual perfil executa)
- [ ] Requisito de auditoria especificado (`AuditLog`)

### Dependências e DoD
- [ ] Dependências de outras US declaradas
- [ ] Definition of Done com checklist de auditoria e soft delete (quando aplicável)

---

## Matriz de Rastreabilidade — Exemplo

Rastrear requisitos do sistema até as regras de negócio mestras (RN-01 a RN-15):

| ID     | Funcionalidade                                | RN aplicável      | EP      | Entrega    |
|--------|--------------------------------------------------|--------------------|---------|------------|
| US-009 | Atualizar status de atividade                  | RN-01, RN-07, RN-10| EP-02   | MVP        |
| US-010 | Registrar progresso % com histórico            | RN-01, RN-07       | EP-02   | MVP        |
| US-017 | Histórico de alteração de prazo com justificativa | RN-02, RN-03     | EP-03   | MVP        |
| US-038 | Detectar WIN repetido e escalar (Regra 3 Semanas) | RN-09            | EP-07   | MVP        |
| US-023 | Log de auditoria de ações críticas             | RN-15              | EP-04   | MVP        |
| US-005 | Encerrar/arquivar projeto com justificativa    | RN-06              | EP-01   | MVP        |

---

## Decomposição de Épico em Stories (padrão)

Ao receber um épico, decompor em stories seguindo esta ordem:

1. **Cadastro base** — entidades mestras que outras dependem (ex: Projeto antes de Atividade)
2. **Criação** — a operação principal (ex: criar atividade)
3. **Consulta / listagem** — ler os dados criados (ex: listar atividades do projeto)
4. **Edição / mudança de estado** — status, progresso, prazo (quando permitido por RN)
5. **Exclusão lógica** — soft delete, sempre com confirmação e justificativa quando aplicável
6. **Relatório / dashboard** — visibilidade agregada dos dados
7. **Automação** — jobs `pg_cron`, notificações, geração de pauta por IA

Para o domínio de gestão de atividades, a ordem 4 é crítica: nunca entregar "criação" sem
a validação de estado (RN-01, RN-02) — a ausência dessas regras é a mesma falha que a
planilha Excel já tinha (status livre, sem verificação de progresso).

---

## Padrão de Numeração

| Prefixo    | Tipo                       | Exemplo     |
|------------|------------------------------|-------------|
| EP-NN      | Épico                      | EP-02       |
| US-NNN     | História de usuário        | US-009      |
| RN-NN      | Regra de negócio mestra    | RN-01       |
| RN-XXX-NNN | Regra de negócio detalhada | RN-PRJ-001  |
| RF-NNN     | Requisito funcional        | RF-001      |
| RNF-NNN    | Requisito não-funcional    | RNF-001     |

Prefixos de domínio para detalhamento de RN:
- `RN-PRJ` — Projetos
- `RN-ATV` — Atividades (além das RNs mestras RN-01 a RN-04, RN-18)
- `RN-WIN` — Card WIN / registros semanais
- `RN-AUD` — Auditoria

---

## Requisitos Não-Funcionais Transversais do SGPA

| ID      | Requisito                                                              | Categoria     |
|---------|--------------------------------------------------------------------------|---------------|
| RNF-001 | Mudança de status/progresso de atividade deve completar em ≤ 2s (p95)  | Performance   |
| RNF-002 | Toda operação que recalcula progresso deve ser atomicamente consistente (transação com rollback) | Confiabilidade |
| RNF-003 | `AuditLog` deve ser imutável — sem UPDATE ou DELETE, aplicado via Prisma middleware | Segurança |
| RNF-004 | Dashboards devem refletir mudanças via Supabase Realtime em ≤ 3s sem reload manual | UX / Realtime |
| RNF-005 | Listagens com até 5.000 atividades devem carregar em ≤ 5s              | Performance   |
| RNF-006 | Exportação de pauta em PDF/DOCX deve executar em background para reuniões com histórico > 3 meses | UX |
| RNF-007 | Sistema deve suportar atualização simultânea de até 20 atividades por múltiplos técnicos sem perda de dado (otimistic locking ou last-write-wins documentado) | Concorrência |
