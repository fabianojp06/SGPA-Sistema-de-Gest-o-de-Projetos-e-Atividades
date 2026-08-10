# Checklist de Cobertura de Testes

Consulte este arquivo no **Coverage Mode** — ao revisar se uma feature ou módulo
tem cobertura de testes adequada.

---

## Mapa de cobertura por tipo de teste

Para cada feature do SGPA, verificar a presença dos seguintes testes:

### Camada: Validação de entrada (Zod)
- [ ] Campo obrigatório ausente → erro com mensagem legível
- [ ] Tipo incorreto (string onde espera number) → erro
- [ ] Valor fora de range (progresso fora de 0–100, prazo antes da data de início) → erro
- [ ] Caracteres especiais / injeção → erro 422, não 500
- [ ] Payload vazio → erro
- [ ] Payload com campos extras → ignorado silenciosamente (não erro)

### Camada: Regra de negócio
- [ ] Caminho feliz com dados válidos → sucesso
- [ ] RN-01: conclusão de atividade com progresso < 100% → erro de negócio (não erro de servidor)
- [ ] RN-02: prazo de atividade posterior ao prazo do projeto-pai → bloqueado
- [ ] RN-03: alteração de prazo sem justificativa → bloqueada; com justificativa → registra ator + timestamp
- [ ] RN-06: exclusão de qualquer entidade → soft delete (`deletedAt`), nunca DELETE físico
- [ ] RN-09: WIN repetido por 3 semanas consecutivas → escalação automática gerada
- [ ] RN-10: tentativa de gravar status fora do enum fechado → rejeitada pelo banco/validação
- [ ] RN-15: tentativa de UPDATE ou DELETE em `AuditLog` → rejeitada ou inexistente no código
- [ ] Status inválido para a transição (ex: Cancelada → Concluída direto) → erro descritivo
- [ ] Progresso no limite exato (99% vs 100%) → comportamento correto e determinístico

### Camada: Banco de dados (testes de integração)
- [ ] Estado do banco após operação de sucesso está correto
- [ ] Estado do banco após operação com erro permanece inalterado (rollback)
- [ ] Registro de `AuditLog` criado após operação crítica (criação, exclusão, alteração de prazo, mudança de status)
- [ ] Registros com `deletedAt` preenchido não aparecem em nenhuma listagem padrão
- [ ] Constraints de FK respeitadas
- [ ] Índices relevantes presentes (verificar EXPLAIN em queries de listagem/dashboard)

### Camada: RBAC (obrigatório em todas as features)
- [ ] `technician` não acessa dashboard executivo do `director`
- [ ] `technician` só visualiza projetos/atividades onde está alocado
- [ ] `coordinator` gerencia projetos/equipe mas não gerencia usuários (exclusivo `admin`)
- [ ] Apenas `admin`/`director`/`coordinator` alteram prazo de atividades de terceiros (RN-04)
- [ ] Requisição sem sessão Clerk válida é rejeitada (401 ou redirecionamento para login, nunca 500)

### Camada: Integrações externas
- [ ] Geração de pauta: resposta da Anthropic API mockada em testes automatizados
- [ ] Geração de pauta: timeout da IA aciona fallback sem quebrar a operação
- [ ] Envio de e-mail (Resend): falha no envio não bloqueia a operação principal (RN-14)
- [ ] Supabase Realtime: dashboard reflete mudança sem reload manual
- [ ] Job pg_cron: execução agendada roda e é idempotente (rodar duas vezes não duplica efeito)

### Camada: UI / E2E
- [ ] Estado de loading visível durante operação assíncrona (ex: geração de pauta)
- [ ] Mensagem de sucesso exibida após operação bem-sucedida
- [ ] Mensagem de erro legível exibida após falha (não "Erro interno")
- [ ] Estado vazio da lista (projetos, WINs, riscos) tem feedback adequado
- [ ] Formulário é resetado ou atualizado após operação bem-sucedida
- [ ] Botão de submit é desabilitado durante o processamento (evitar duplo clique / WIN duplicado)

---

## Matriz de cobertura por módulo

Use esta matriz para mapear rapidamente o que está coberto:

| Feature / Módulo         | Unitário | Integração | E2E | RBAC | RN crítica | Status     |
|---------------------------|----------|------------|-----|------|------------|------------|
| Criar projeto             | ⬜        | ⬜          | ⬜   | ⬜    | —          | Não iniciado |
| Concluir atividade        | ⬜        | ⬜          | ⬜   | ⬜    | RN-01      | Não iniciado |
| Alterar prazo de atividade| ⬜        | ⬜          | ⬜   | ⬜    | RN-02/RN-03| Não iniciado |
| Registrar WIN             | ⬜        | ⬜          | ⬜   | ⬜    | RN-09      | Não iniciado |
| Excluir projeto/atividade | ⬜        | ⬜          | ⬜   | ⬜    | RN-06      | Não iniciado |
| Gerar pauta de reunião    | ⬜        | ⬜          | ⬜   | ⬜    | —          | Não iniciado |

Legenda: ✅ Coberto | ⚠️ Parcial | ❌ Ausente (risco) | ⬜ Não mapeado

---

## Gaps críticos (priorizar imediatamente)

São gaps críticos que devem ser endereçados antes de qualquer release:

1. **Ausência de teste de RBAC** em qualquer feature acessível por mais de um perfil
2. **Ausência de teste de soft delete** em qualquer operação de exclusão (RN-06)
3. **Ausência de teste de `AuditLog`** em qualquer mutação crítica (RN-15)
4. **Cobertura apenas de caminho feliz** em regras de negócio críticas (RN-01, RN-02, RN-09) — sem cenários de erro
5. **Ausência de teste do job pg_cron** da Regra das 3 Semanas (RN-09) e de idempotência

---

## Meta de cobertura por nível

| Nível         | Meta mínima para release | Meta ideal |
|---------------|---------------------------|------------|
| Unitário      | 70% de linhas             | ≥ 85%      |
| Integração    | 100% dos fluxos P0/P1     | Todos os fluxos |
| E2E           | 100% dos fluxos críticos  | Top 5 jornadas de usuário |
| RBAC          | 100% das features com múltiplos perfis | 100% (sem exceção) |

A meta de cobertura de linhas (%) é indicativa — cobertura de 100% de linhas
com testes fracos é pior que 70% com testes que validam comportamento real.
Priorize cobertura de **comportamentos**, não de **linhas**.
