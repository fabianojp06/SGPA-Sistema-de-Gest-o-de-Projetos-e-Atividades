# Domain Rules — Ciclo de Projetos, Atividades e Card WIN

Regras de negócio do domínio que o SGPA deve implementar.
Use como base para especificação de critérios de aceite e validações de sistema.
As RNs numeradas (RN-01 a RN-15) são as regras mestras do documento de referência do
projeto — use exatamente esses IDs. As subcategorias abaixo (RN-PRJ, RN-ATV etc.) detalham
validações derivadas para uso em critérios de aceite mais granulares.

---

## 1. Regras de Projeto

### RN-07 — Progresso do projeto calculado automaticamente
**Regra:** O campo `Project.progress` nunca é editado manualmente. Ele é sempre:
`progress = média ponderada (ou simples) do progress das Activity não excluídas (deletedAt = null) do projeto`

O sistema deve recalcular este valor em toda mutação de atividade filha (criação, mudança
de status, mudança de progresso, exclusão lógica) — nunca armazenar como campo estático
sem recalcular. Recalcular via Supabase Function ou dentro da mesma transação Prisma.

**Validação crítica:** nenhuma tela deve permitir edição direta de `Project.progress`.

---

### RN-PRJ-001 — Status de projeto e transições permitidas

| Status atual | → Transição para | Condição                                         |
|---------------|--------------------|----------------------------------------------------|
| ACTIVE        | PAUSED            | Decisão do coordenador/diretor — justificativa recomendada |
| ACTIVE        | COMPLETED         | Todas as atividades filhas em DONE ou CANCELLED    |
| ACTIVE        | ARCHIVED          | Encerramento formal com justificativa obrigatória (US-005) |
| PAUSED        | ACTIVE            | Retomada                                           |
| ACTIVE/PAUSED | CANCELLED         | Justificativa obrigatória, registrada em `AuditLog` |
| COMPLETED / ARCHIVED / CANCELLED | (nenhuma) | Estados terminais — sem reversão direta (reabertura exige ação de admin) |

---

### RN-05 — Projeto sem atividade recente recebe status automático
**Regra:** Projeto `ACTIVE` sem nenhuma atividade criada, atualizada ou com progresso
alterado há 30 dias corridos recebe automaticamente um sinalizador de status "Parado"
(exibido na UI, sem necessariamente mudar o enum `ProjectStatus`).

O job `pg_cron` roda diariamente e verifica `Activity.updatedAt` mais recente por projeto.

---

## 2. Regras de Atividade

### RN-01 — Conclusão exige progresso 100%
**Regra:** Uma `Activity` só pode transitar para `status = DONE` quando `progress = 100`.
Validar no backend (Server Action) e refletir no frontend (botão desabilitado com tooltip
explicativo). Nunca confiar apenas na validação de UI.

---

### RN-02 — Prazo de atividade não pode ultrapassar o prazo do projeto-pai
**Regra:** `Activity.dueDate <= Project.endDate` do projeto ao qual a atividade pertence.
Validação ocorre tanto na criação quanto em qualquer alteração de `dueDate` (inclusive via
fluxo de `DeadlineChange`, RN-03).

**Mensagem de erro padrão:** "O prazo da atividade não pode ser posterior ao prazo final do
projeto (DD/MM/AAAA)."

---

### RN-03 — Alteração de prazo exige justificativa e trilha
**Regra:** Toda alteração em `Activity.dueDate` deve:
1. Criar um registro em `DeadlineChange` com `oldDate`, `newDate`, `reason` (obrigatório,
   não pode ser vazio) e `changedById`
2. Validar RN-02 antes de persistir a nova data
3. Registrar também em `AuditLog` (`action = DEADLINE_CHANGED`)

O campo `reason` não aceita string vazia nem apenas espaços — validação Zod com `.min(10)`
recomendada para evitar justificativas vazias tipo "ok".

---

### RN-04 — Apenas gestor ou admin altera prazo de atividade de terceiros
**Regra:** Um `technician` só pode alterar prazo de atividades onde `assignedToId` é ele
mesmo, e apenas dentro do limite do projeto (RN-02). Alterar prazo de atividade de outro
colaborador exige perfil `coordinator`, `director` ou `admin`.

---

### RN-06 — Soft delete obrigatório
**Regra:** Nenhuma entidade (`Project`, `Activity`, `Win`, `Risk`, `HelpRequest`) é removida
fisicamente do banco. Toda exclusão define `deletedAt = now()`. Queries de listagem devem
sempre filtrar `deletedAt: null` por padrão (usar middleware Prisma ou escopo padrão nos
repositórios).

**Validação crítica:** nenhuma Server Action pode chamar `.delete()` do Prisma em modelos
com soft delete — apenas `.update({ deletedAt: new Date() })`.

---

### RN-10 — Status seguem enum fechado
**Regra:** `ActivityStatus` e `WinStatus` são enums Prisma fixos:
`TODO → IN_PROGRESS → DONE → BLOCKED → CANCELLED`. Nenhum campo de status aceita texto
livre em nenhuma camada (banco, Zod schema, UI). Transições fora da lista de estados válidos
devem ser rejeitadas no backend, independente do que a UI envie.

---

### RN-18 — Bloqueio de conclusão com predecessora não iniciada (configurável)
**Regra:** Quando uma atividade possui `predecessorId` definido e a flag de bloqueio está
ativa para o projeto, a atividade sucessora não pode transitar para `IN_PROGRESS` ou `DONE`
enquanto a atividade predecessora não estiver, no mínimo, `IN_PROGRESS`.

**Mensagem de erro:** "Esta atividade depende de '[Título da predecessora]', que ainda não
foi iniciada."

---

## 3. Regras do Card WIN (Registro Semanal)

### RN-WIN-001 — WIN sem limite de quantidade
**Regra:** Diferente da planilha original (limite artificial de 3 WINs/semana), o sistema
não impõe limite de quantidade de WINs registrados por usuário por semana. Validar apenas
que `title` não seja vazio e `dueDate` seja uma data válida.

---

### RN-09 — Regra das 3 Semanas (escalação automática)
**Regra:** Um WIN com o mesmo título (ou item de mesmo `id` lógico de recorrência) e
`status ≠ DONE` por 3 `weekNumber` consecutivos do mesmo usuário dispara:
1. `Win.repeatCount` incrementado
2. `Win.escalated = true`
3. Notificação ao coordenador do projeto (via Resend — não bloqueante, RN-14)
4. Item passa a ser referenciado no Plano de Ação (PLA-DEP-2026-001) para revisão quinzenal/mensal

Executado via `pg_cron` — nunca depende de ação manual do usuário para ser verificado.

---

### RN-13 — Vínculo de WIN a projeto (rastreabilidade)
**Regra:** `Win.projectId` é opcional, mas quando presente deve referenciar um `Project`
existente e não excluído (`deletedAt = null`). Um WIN sem projeto vinculado ainda é válido
(ex: tarefas administrativas), mas fica fora dos relatórios de execução por projeto.

---

## 4. Regras de Risco e Pedido de Ajuda

### RN-11 — Campos obrigatórios de Alerta de Risco
**Regra:** Todo `Risk` deve ter: `category` (implícita em `title`/`description`), `level`
(`LOW | MEDIUM | HIGH | CRITICAL`), `status` (`OPEN | MITIGATING | RESOLVED`) e idealmente
`ownerId` (responsável pela mitigação). Risco `CRITICAL` sem `ownerId` definido deve gerar
alerta destacado no dashboard do coordenador.

---

### RN-12 — Campos obrigatórios de Pedido de Ajuda
**Regra:** Todo `HelpRequest` deve ter `targetName` (destinatário), `description` e
idealmente `dueDate` (prazo de resposta). O campo `resolved` inicia `false` e só é marcado
`true` por ação explícita do solicitante ou do destinatário — nunca automaticamente por prazo
vencido (isso apenas gera alerta visual de atraso, não fecha o pedido).

---

## 5. Regras Transversais de Auditoria

### RN-15 — AuditLog é imutável (INSERT only)
**Regra:** A tabela `AuditLog` nunca recebe `UPDATE` ou `DELETE` — nem mesmo por admin.
Aplicar via Prisma middleware que intercepta e rejeita essas operações no model `AuditLog`,
como camada de defesa adicional às permissões de banco.

Todo `AuditLog` deve conter:

| Campo       | Valor                                                     |
|-------------|-----------------------------------------------------------|
| `userId`    | ID do usuário autenticado (Clerk → `User.id`)              |
| `action`    | `CREATED \| UPDATED \| DELETED \| STATUS_CHANGED \| DEADLINE_CHANGED` |
| `entity`    | Nome do model afetado (ex: `Project`, `Activity`, `Win`)   |
| `entityId`  | ID do registro afetado                                     |
| `before`    | Estado anterior relevante, em JSON (pode ser `null` em criação) |
| `after`     | Estado novo relevante, em JSON                             |
| `createdAt` | Timestamp automático                                        |

**Nenhuma mutação crítica (status, prazo, exclusão) pode ser implementada sem o registro de
auditoria correspondente.**

---

### RN-14 — Falha de e-mail não bloqueia operação principal
**Regra:** Todo envio via Resend (notificação de prazo, escalação, pedido de ajuda) deve
ocorrer de forma assíncrona e nunca impedir a conclusão da operação principal (ex: mudança
de status de atividade) em caso de falha do serviço de e-mail. Envolver em `try/catch` com
log de erro — o usuário não deve ver a operação principal falhar por causa de um e-mail.
