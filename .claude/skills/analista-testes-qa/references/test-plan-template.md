# Template de Plano de Testes

Consulte este arquivo no **Plan Mode** — ao criar um plano de testes para uma feature ou modulo.

---

## Template completo

```markdown
# Plano de Testes — [Nome da Feature / Modulo]

**Versao**: 1.0
**Data**: [data]
**Responsavel QA**: [nome]
**Modulo SGPA**: [Projetos / Atividades / WINs / Riscos / Pedidos de Ajuda / Pautas de Reuniao / Dashboards]
**Sprint / Release**: [referencia]
**Referencia de requisitos**: [US-NNN / RN-NNN da analista-negocios-po]

---

## 1. Objetivo

[O que este plano cobre. O que esta fora do escopo.]

**Em escopo:**
- [feature 1]
- [feature 2]

**Fora de escopo:**
- [o que nao sera testado e por que]

---

## 2. Criterios de entrada

Antes de iniciar os testes, verificar:
- [ ] Feature implementada e deployada em ambiente de homologacao (Vercel preview)
- [ ] Banco de dados de teste populado com dados de fixture adequados
- [ ] Criterios de aceite (BDD) disponiveis e revisados
- [ ] Acesso aos ambientes configurado (usuarios de teste para cada perfil: admin, director, coordinator, technician)
- [ ] Build de CI passando (testes unitarios e de integracao sem falha)

---

## 3. Criterios de saida (Definition of Done para QA)

O modulo esta aprovado para release quando:
- [ ] 100% dos casos P0 executados e aprovados
- [ ] 100% dos casos P1 executados e aprovados
- [ ] >= 80% dos casos P2 executados (os reprovados com plano de correcao documentado)
- [ ] Nenhum bug P0 ou P1 aberto sem data de correcao definida
- [ ] Teste de RBAC executado e aprovado para todos os perfis relevantes
- [ ] Toda regra de negocio critica envolvida (RN-01, RN-02, RN-03, RN-06, RN-09, RN-10, RN-15) tem teste de integracao aprovado
- [ ] Teste de regressao dos modulos impactados executado

---

## 4. Ambiente de testes

| Item              | Valor                                              |
|-------------------|------------------------------------------------------|
| URL               | [URL do ambiente de homologacao — Vercel preview]  |
| Banco             | PostgreSQL (Supabase) — instancia de teste isolada |
| Usuario admin     | [email de teste]                                   |
| Usuario director  | [email de teste]                                   |
| Usuario coordinator | [email de teste]                                 |
| Usuario technician | [email de teste]                                  |

---

## 5. Abordagem por nivel de teste

### 5.1 Testes unitarios (responsabilidade: Dev)
- Regras de negocio isoladas (validacoes de progresso, prazo, transicoes de status)
- Meta de cobertura: >= 80% das linhas de logica de negocio
- Ferramenta: Vitest

### 5.2 Testes de integracao (responsabilidade compartilhada Dev + QA)
- Server Actions com banco de dados real
- Jobs pg_cron (Regra das 3 Semanas, alertas de prazo)
- Foco em: efeitos colaterais no banco, geracao de AuditLog, soft delete
- Ferramenta: Vitest + banco PostgreSQL de teste

### 5.3 Testes E2E (responsabilidade: QA)
- Fluxos criticos de ponta a ponta via browser
- Foco em: jornada completa do usuario, validacoes de UI, feedback de erro, Realtime
- Ferramenta: Playwright

### 5.4 Testes exploratorios (responsabilidade: QA)
- Sessoes de 60-90 min sem script fixo
- Foco em: comportamentos inesperados, combinacoes de dados, edge cases nao documentados
  (ex: alterar prazo de uma atividade concluida, registrar WIN duplicado na mesma semana)
- Registrar achados em tempo real

---

## 6. Riscos e mitigacoes

| Risco                                          | Probabilidade | Impacto | Mitigacao                                   |
|--------------------------------------------------|---------------|---------|-----------------------------------------------|
| Dados de fixture insuficientes para edge cases    | Media         | Alto    | Criar script de seed especifico para o modulo |
| Resposta da Anthropic API indisponivel/lenta em teste | Media     | Alto    | Mockar chamada e testar fallback separadamente |
| Job pg_cron nao dispara no ambiente de teste      | Baixa         | Alto    | Executar a funcao do job diretamente no teste de integracao, sem depender do agendador |
| Falha silenciosa de RBAC (perfil errado passa)    | Media         | P0      | Testar explicitamente acesso negado para cada perfil nao autorizado |

---

## 7. Indice de casos de teste

| ID      | Descricao resumida                        | Tipo        | Prioridade | Status     |
|---------|---------------------------------------------|-------------|------------|------------|
| CT-001  | [descricao]                                 | Funcional   | P0         | Pendente   |
| CT-002  | [descricao]                                 | Seguranca   | P0         | Pendente   |
| ...     | ...                                          | ...         | ...        | ...        |
```

---

## Guia de priorizacao

| Prioridade | Criterio                                                                 | Exemplos no SGPA                                     |
|------------|----------------------------------------------------------------------------|---------------------------------------------------------|
| **P0**     | Falha viola RN critica (RN-01, RN-02, RN-03, RN-06, RN-09, RN-10, RN-15) ou vaza dado entre perfis | Atividade conclui com progresso < 100%, exclusao fisica de projeto, technician ve dashboard do director |
| **P1**     | Falha impede fluxo principal ou exige workaround significativo             | Nao consegue registrar WIN, geracao de pauta trava sem fallback |
| **P2**     | Falha afeta experiencia mas tem workaround simples                         | Mensagem de erro vaga, ordenacao incorreta na lista de projetos |
| **P3**     | Polimento visual, texto, preferencia de UX                                 | Alinhamento de coluna, texto de tooltip                 |

**Regra SGPA**: qualquer falha que viole uma regra de negocio critica ou permita acesso indevido
entre perfis (RBAC) e automaticamente P0, independente da frequencia esperada.
