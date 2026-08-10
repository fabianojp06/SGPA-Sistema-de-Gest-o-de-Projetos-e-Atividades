# Story Templates — SGPA

Templates completos com exemplos do domínio de gestão de projetos e atividades.

---

## Exemplo completo: Atualizar Status de Atividade

```
## [US-009] — Atualizar Status de Atividade

**Módulo:** Atividades
**Épico:** EP-02 — Gestão de Atividades
**Prioridade:** Alta
**Estimativa:** M

**Como** Técnico responsável por uma atividade,
**Quero** atualizar o status da atividade entre A Fazer, Em Andamento, Concluída, Bloqueada
e Cancelada,
**Para** manter a visão do projeto atualizada em tempo real para o coordenador e o diretor,
conforme RN-10 (status fechados, sem texto livre).

### Contexto e Regras de Negócio

O status da atividade segue um conjunto fechado de valores (`ActivityStatus`): TODO →
IN_PROGRESS → DONE → BLOCKED → CANCELLED. A transição para "Concluída" só é permitida
quando o progresso da atividade está em 100% (RN-01) — isso evita que atividades sejam
fechadas sem entrega real, um dos principais problemas do Card WIN em Excel (status "FEITO"
digitado manualmente sem verificação).

Ao concluir uma atividade, o progresso do projeto-pai deve ser recalculado automaticamente
(RN-07) a partir de todas as atividades filhas não excluídas.

### Critérios de Aceite

**Cenário 1 — Atividade concluída com sucesso**
```gherkin
Dado que a atividade "Configurar ambiente de staging" possui progresso = 100%
  E o usuário logado é o responsável (`assignedToId`) pela atividade
Quando o usuário altera o status para "Concluída"
Então o status da atividade passa para "DONE"
  E o campo `completedAt` é preenchido com a data/hora atual
  E o progresso do projeto-pai é recalculado a partir de todas as atividades filhas
  E o registro em `AuditLog` é criado com `action = STATUS_CHANGED`, `before = {status: "IN_PROGRESS"}`,
    `after = {status: "DONE"}`
  E a tela exibe o badge verde "Concluído"
```

**Cenário 2 — Tentativa de concluir com progresso incompleto**
```gherkin
Dado que a atividade "Escrever documentação da API" possui progresso = 70%
Quando o usuário tenta alterar o status para "Concluída"
Então o sistema exibe: "Não é possível concluir. O progresso da atividade está em 70% —
  ajuste para 100% antes de concluir."
  E o status da atividade permanece "IN_PROGRESS"
  E nenhum registro de auditoria é gerado
```

**Cenário 3 — Usuário sem permissão**
```gherkin
Dado que o usuário logado não é o responsável nem gestor do projeto
Quando o usuário tenta alterar o status da atividade
Então o botão de alteração de status fica desabilitado na UI
  E ao tentar acionar a Server Action diretamente, o sistema retorna
    `{ success: false, error: "Você não tem permissão para alterar esta atividade." }`
```

**Cenário 4 — Reabertura de atividade concluída**
```gherkin
Dado que a atividade "Configurar ambiente de staging" possui status "DONE"
Quando o Coordenador altera o status de volta para "Em Andamento" com justificativa
  "Encontrado bug crítico após validação"
Então o status passa para "IN_PROGRESS"
  E `completedAt` é limpo (`null`)
  E o progresso do projeto-pai é recalculado
  E o `AuditLog` registra a reabertura com a justificativa no campo `after`
```

### Impacto Técnico

| Aspecto           | Detalhe                                                         |
|-------------------|---------------------------------------------------------------------|
| Tabelas afetadas  | `Activity`, `Project`, `AuditLog`                              |
| Campos alterados  | `Activity.status`, `Activity.completedAt`, `Project.progress`  |
| Transação?        | Sim — mudança de status + recálculo de progresso do projeto em `$transaction` |
| Requer RBAC?      | Sim — responsável, coordenador ou admin do projeto             |
| Auditoria         | `AuditLog`: `action=STATUS_CHANGED`, `entity=Activity`          |
| Regra aplicável   | RN-01 (progresso = 100%), RN-07 (recálculo de progresso), RN-10 (enum fechado) |

### Dependências

- Atividade já criada e vinculada a um projeto (US-007)
- Progresso da atividade registrável (US-010)
- Perfis e permissões configurados via Clerk (EP-04)

### Definition of Done

- [ ] Transição de status só ocorre entre valores válidos do enum `ActivityStatus`
- [ ] Conclusão bloqueada quando progresso < 100%, com mensagem exibida
- [ ] Progresso do projeto-pai recalculado atomicamente com a mudança de status
- [ ] Todos os cenários de erro exibem a mensagem especificada
- [ ] Registro em `AuditLog` gerado em todos os cenários de sucesso, com `before`/`after`
- [ ] Usuário sem permissão não altera o status (via UI e via Server Action)
- [ ] Cenário de reabertura testado com limpeza de `completedAt` verificada
```

---

## Exemplo: Épico completo

```
## [EP-02] — Gestão de Atividades

**Objetivo de negócio:** Digitalizar o controle de atividades por projeto, com status
fechados, progresso rastreável e recálculo automático do progresso do projeto — eliminando
a planilha individual por colaborador e a inconsistência de status em texto livre.

**Módulo SGPA:** Atividades
**Entrega:** MVP — Entrega 1

### Histórias de Usuário do Épico

| ID      | Título                                                          | Prioridade | Estimativa | Dependências |
|---------|-------------------------------------------------------------------|------------|------------|--------------|
| US-007  | Criar atividade vinculada a projeto                             | Alta       | M          | US-001       |
| US-008  | Atribuir responsável, suporte e prazo à atividade                | Alta       | P          | US-007       |
| US-009  | Atualizar status da atividade                                    | Alta       | M          | US-007       |
| US-010  | Registrar progresso % com histórico                              | Alta       | P          | US-007       |
| US-011  | Criar dependência entre atividades (predecessora/successora)     | Média      | G          | US-007       |
| US-012  | Comentar e anexar arquivos em uma atividade                      | Média      | M          | US-007       |
| US-013  | Criar sub-atividades (checklist hierárquico)                     | Média      | M          | US-007       |

### Critérios de Saída do Épico

- [ ] Ciclo completo (criar → atribuir → progredir → concluir) executável na interface
- [ ] Progresso do projeto recalculado corretamente após qualquer mudança de atividade filha
- [ ] Log de auditoria completo para criação, mudança de status e alteração de prazo
- [ ] Conclusão bloqueada sem progresso 100%, testada em homologação
- [ ] Sub-atividades e dependências funcionando sem violar RN-02 (prazo ≤ prazo do projeto-pai)
```

---

## Exemplo: Regra de negócio — Escalação de WIN (Regra das 3 Semanas)

```
## [US-038] — Detectar WIN Repetido e Escalar ao Plano de Ação

**Módulo:** Card WIN Digital
**Épico:** EP-07 — Card WIN Digital
**Prioridade:** Alta
**Estimativa:** G

**Como** Coordenador,
**Quero** que o sistema detecte automaticamente quando um WIN se repete por 3 semanas
consecutivas sem conclusão,
**Para** escalar o item ao Plano de Ação sem depender da memória humana, conforme RN-09 —
hoje essa checagem é manual e falha com frequência.

### Contexto e Regras de Negócio

Um WIN é considerado "repetido" quando o mesmo título (ou item equivalente) aparece com
`status ≠ DONE` por 3 semanas consecutivas (`weekNumber` sequenciais) para o mesmo usuário.
Quando isso ocorre, o sistema deve marcar `Win.escalated = true`, incrementar
`Win.repeatCount`, e notificar o coordenador do projeto via e-mail (Resend) e painel de
alertas. A checagem roda via job `pg_cron` diário — não é acionada por interação do usuário.

### Critérios de Aceite

**Cenário 1 — WIN repetido pela 3ª semana consecutiva**
```gherkin
Dado que o WIN "Revisar contrato com fornecedor X" do usuário "Ana Silva" possui
  status "IN_PROGRESS" nas semanas 30, 31 e 32 de 2026
Quando o job `pg_cron` de verificação roda no início da semana 33
Então o campo `Win.repeatCount` é atualizado para 3
  E o campo `Win.escalated` passa para `true`
  E uma notificação por e-mail é enviada ao coordenador do projeto vinculado
  E o item aparece destacado com banner âmbar no Card WIN da semana atual
  E o registro em `AuditLog` é criado com `action = STATUS_CHANGED`, `entity = Win`
```

**Cenário 2 — WIN concluído antes da 3ª semana — não escala**
```gherkin
Dado que o WIN "Revisar contrato com fornecedor X" foi registrado com status "IN_PROGRESS"
  nas semanas 30 e 31, e concluído ("DONE") na semana 32
Quando o job `pg_cron` roda no início da semana 33
Então `Win.escalated` permanece `false`
  E nenhuma notificação é enviada
```

**Cenário 3 — Falha no envio de e-mail não bloqueia a escalação (RN-14)**
```gherkin
Dado que a escalação foi corretamente detectada
  E o serviço Resend está indisponível no momento do envio
Quando o job tenta notificar o coordenador
Então `Win.escalated` é marcado `true` e persistido normalmente
  E a falha de e-mail é registrada em log de erro, sem interromper o job
  E o alerta continua visível no painel do sistema independentemente do e-mail
```

### Impacto Técnico

| Aspecto           | Detalhe                                                         |
|-------------------|---------------------------------------------------------------------|
| Tabelas afetadas  | `Win`, `AuditLog`                                                |
| Campos alterados  | `Win.repeatCount`, `Win.escalated`                                |
| Job               | `pg_cron` diário — comparação de título/status por `userId` + 3 `weekNumber` sequenciais |
| Notificação       | Async via Resend — try/catch, não bloqueante (RN-14)             |
| Auditoria         | `AuditLog`: `action=STATUS_CHANGED`, `entity=Win`, `after={escalated:true}` |
| Regra aplicável   | RN-09                                                             |
```
