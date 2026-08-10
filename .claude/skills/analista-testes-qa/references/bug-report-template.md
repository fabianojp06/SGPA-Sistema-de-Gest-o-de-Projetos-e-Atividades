# Template de Bug Report

Consulte este arquivo no **Bug Mode** — ao documentar, analisar ou priorizar defeitos.

---

## Template completo

```markdown
# BUG-[NNN]: [Título descritivo — o que está errado, não o que deveria ser]

**Data**: [data]
**Reportado por**: [QA / Dev / Usuário]
**Módulo SGPA**: [Projetos / Atividades / WINs / Riscos / Pedidos de Ajuda / Pautas de Reunião / Dashboards / Auth]
**Severidade**: P0 / P1 / P2 / P3
**Status**: Aberto / Em análise / Em correção / Aguardando verificação / Fechado
**Versão/Build**: [hash do commit ou versão de deploy]

---

## Descrição

[Uma frase clara descrevendo o comportamento incorreto observado.
Não descreva o que deveria acontecer aqui — isso vai na seção Resultado Esperado.]

---

## Passos para reproduzir

**Pré-condições:**
- Ambiente: [homologação / local / produção]
- Usuário: [perfil — admin / director / coordinator / technician]
- Estado do banco: [ex: "atividade com progresso = 80%, prazo dentro da janela do projeto"]

**Passos:**
1. Acessar [URL específica]
2. [ação exata do usuário]
3. [próxima ação]
4. Observar [onde o problema aparece]

---

## Resultado obtido

[O que realmente aconteceu — seja específico: mensagem de erro exata, valor incorreto
retornado, estado incorreto no banco, redirecionamento inesperado.]

```
Exemplo de resposta da API recebida:
{ "error": null, "data": { "status": "DONE" } }
// sendo que o banco mostra activity.progress = 80 (deveria ser 100 para concluir — RN-01)
```

---

## Resultado esperado

[O que deveria ter acontecido segundo os critérios de aceite.
Referenciar a User Story ou regra de negócio quando disponível: "Conforme CT-007 / US-010 / RN-01".]

---

## Evidências

- [ ] Screenshot ou vídeo da tela
- [ ] Log de console (F12 → Console)
- [ ] Log do servidor (terminal / Vercel logs)
- [ ] Payload da request (F12 → Network → request body)
- [ ] Estado do banco antes e depois (query SQL + resultado)

---

## Hipótese de causa raiz

[Análise inicial do QA sobre onde está o problema. Não precisa ser definitiva —
é ponto de partida para o Dev. Exemplos:]

- [ ] Validação ausente na Server Action (apenas no cliente)
- [ ] Regra de negócio (RN-XX) não implementada no backend, só na UI
- [ ] Filtro de `deletedAt: null` ausente na query Prisma (soft delete vazando na listagem)
- [ ] `AuditLog` não gerado para a mutação (viola RN-15 indiretamente — falta de rastreabilidade)
- [ ] Job pg_cron não está rodando ou está duplicando execução
- [ ] Cache/Realtime desatualizado após mutação

---

## Impacto

**Frequência**: [Sempre / Às vezes / Raramente / Apenas com dados específicos]
**Usuários afetados**: [Todos / Admins / Diretores / Coordenadores / Técnicos]
**Viola regra de negócio crítica**: [Sim / Não] — [qual RN, se aplicável]
**Risco de dados**: [Perda de rastreabilidade / Exclusão física indevida / Vazamento entre perfis / Nenhum]

---

## Teste de regressão sugerido

[Descrever o caso de teste que deve ser adicionado à suíte de automação após a correção,
para garantir que o bug não volte. Especificar nível: unitário, integração ou E2E.]

```typescript
// Exemplo de teste de regressão a adicionar
it('não permite concluir atividade quando progresso é menor que 100% — RN-01', async () => {
  // setup...
  // execução...
  // asserção...
})
```
```

---

## Guia de severidade para o SGPA

| Severidade | Critério | Exemplos |
|------------|----------|----------|
| **P0 — Crítico** | Violação de regra de negócio crítica (RN-01, RN-02, RN-03, RN-06, RN-09, RN-10, RN-15), exclusão física de dado, vazamento de dado entre perfis, sistema inacessível | Projeto apagado do banco (não soft delete), technician acessa dashboard executivo, AuditLog editável |
| **P1 — Alto** | Fluxo principal bloqueado sem workaround | Não consegue registrar WIN, não consegue gerar pauta de reunião |
| **P2 — Médio** | Fluxo funciona mas com comportamento incorreto ou workaround disponível | Data exibida em formato errado, paginação incorreta na lista de projetos |
| **P3 — Baixo** | Problema visual ou de UX sem impacto funcional | Alinhamento, texto de botão, cor incorreta do badge de status |

**Regra inviolável**: qualquer bug que viole uma regra de negócio de criticidade Alta (RN-01, RN-02,
RN-03, RN-06, RN-09, RN-10, RN-15) ou permita acesso indevido entre perfis (RBAC) é **P0**,
independente de qualquer outro critério.

---

## Ciclo de vida do bug

```
Aberto (QA)
  → Em análise (Dev) — 24h para P0, 48h para P1
    → Em correção (Dev)
      → Aguardando verificação (Dev → QA)
        → Fechado (QA confirma correção + teste de regressão adicionado)
        → Reaberto (QA não confirma — volta para Em correção)
```

P0 deve ter alerta imediato no canal do time. Nunca deixar P0 aberto sem responsável definido.
