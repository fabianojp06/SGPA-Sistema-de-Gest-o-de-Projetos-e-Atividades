# Transaction Patterns — SGPA

Referência para o **Integrity Mode**: regras de negócio críticas (progresso, prazo, soft delete,
escalação de WIN, auditoria).

## Regra de Ouro

> Uma mutação que muda mais de uma entidade nunca pode parar no meio.
> Se uma etapa falha, todas as anteriores fazem rollback automaticamente.
> **Sempre `prisma.$transaction()`** quando a operação tocar mais de um model (ex: atualizar
> `Activity` e ao mesmo tempo recalcular `Project.progress`, ou mudar prazo e gravar
> `DeadlineChange` + `AuditLog`).

Nem toda operação do SGPA precisa de transação — um `update` de campo único numa única tabela, sem
efeito colateral em outra entidade, não precisa. O critério é: **toca mais de um model? precisa de
efeito colateral consistente? então usa `$transaction()`.**

---

## Quando Usar Transação — Guia por Operação

| Operação                                          | Transação? | Motivo                                                 |
|----------------------------------------------------|:----------:|---------------------------------------------------------|
| Concluir atividade (RN-01)                          | Sim        | Atualiza `Activity` + grava `AuditLog`                  |
| Alterar prazo de atividade (RN-03)                  | Sim        | Atualiza `Activity` + grava `DeadlineChange` + `AuditLog` |
| Registrar WIN e detectar repetição (RN-09)          | Sim        | Cria/atualiza `Win` + pode criar alerta de escalação     |
| Soft delete de projeto/atividade (RN-06)            | Sim        | Atualiza entidade + grava `AuditLog`                    |
| Recalcular progresso do projeto-pai (RN-07)         | Sim        | Lê atividades filhas + atualiza `Project.progress`       |
| Atualizar apenas descrição de uma atividade         | Não        | Campo único, sem efeito colateral em outra entidade      |
| Consulta de dashboard (read-only)                   | Não        | Sem escrita                                              |

---

## Template: Concluir Atividade (RN-01 + Auditoria)

```typescript
export async function concluirAtividade(activityId: string, userId: string) {
  return prisma.$transaction(async (tx) => {

    // 1. Buscar atividade
    const atividade = await tx.activity.findUnique({
      where: { id: activityId, deletedAt: null },
    })
    if (!atividade) throw new Error('Atividade não encontrada')

    // 2. RN-01: só conclui com progresso = 100%
    if (atividade.progress !== 100) {
      throw new Error('Atividade só pode ser concluída com progresso em 100%')
    }

    // 3. Atualizar status
    const atualizada = await tx.activity.update({
      where: { id: atividade.id },
      data: { status: 'DONE', completedAt: new Date() },
    })

    // 4. Registrar auditoria (dentro da mesma transação — RN-15)
    await tx.auditLog.create({
      data: {
        userId,
        action: 'STATUS_CHANGED',
        entity: 'Activity',
        entityId: atualizada.id,
        before: { status: atividade.status, progress: atividade.progress },
        after: { status: atualizada.status },
      },
    })

    return atualizada
  })
}
```

---

## Template: Alterar Prazo de Atividade (RN-02 + RN-03)

```typescript
export async function alterarPrazoAtividade(
  input: { activityId: string; newDate: Date; reason: string },
  userId: string
) {
  return prisma.$transaction(async (tx) => {

    // 1. Buscar atividade e projeto-pai
    const atividade = await tx.activity.findUnique({
      where: { id: input.activityId, deletedAt: null },
      include: { project: true },
    })
    if (!atividade) throw new Error('Atividade não encontrada')

    // 2. RN-02: prazo da atividade não pode ultrapassar o prazo do projeto-pai
    if (input.newDate > atividade.project.endDate) {
      throw new Error('Novo prazo ultrapassa o prazo final do projeto')
    }

    // 3. RN-03: justificativa obrigatória
    if (!input.reason || input.reason.trim().length < 5) {
      throw new Error('Justificativa obrigatória para alteração de prazo (mínimo 5 caracteres)')
    }

    const oldDate = atividade.dueDate

    // 4. Atualizar prazo
    const atualizada = await tx.activity.update({
      where: { id: atividade.id },
      data: { dueDate: input.newDate },
    })

    // 5. Registrar histórico de mudança de prazo (ator + timestamp — RN-03)
    await tx.deadlineChange.create({
      data: {
        activityId: atividade.id,
        changedById: userId,
        oldDate,
        newDate: input.newDate,
        reason: input.reason,
      },
    })

    // 6. Auditoria (RN-15)
    await tx.auditLog.create({
      data: {
        userId,
        action: 'DEADLINE_CHANGED',
        entity: 'Activity',
        entityId: atualizada.id,
        before: { dueDate: oldDate },
        after: { dueDate: input.newDate },
      },
    })

    return atualizada
  })
}
```

---

## Template: Registrar WIN e Escalar Repetição (RN-09)

```typescript
export async function registrarWin(
  input: { title: string; dueDate: Date; projectId?: string; weekNumber: number; year: number },
  userId: string
) {
  return prisma.$transaction(async (tx) => {

    // 1. Verificar se o mesmo título já apareceu nas 2 semanas anteriores para o usuário
    const anteriores = await tx.win.findMany({
      where: {
        userId,
        title: input.title,
        deletedAt: null,
        OR: [
          { year: input.year, weekNumber: input.weekNumber - 1 },
          { year: input.year, weekNumber: input.weekNumber - 2 },
        ],
      },
    })

    const repeatCount = anteriores.length + 1 // inclui o WIN sendo criado agora
    const escalated = repeatCount >= 3

    // 2. Criar o WIN da semana atual
    const win = await tx.win.create({
      data: {
        userId,
        projectId: input.projectId,
        weekNumber: input.weekNumber,
        year: input.year,
        title: input.title,
        dueDate: input.dueDate,
        repeatCount,
        escalated,
      },
    })

    // 3. RN-09: 3 semanas seguidas com o mesmo WIN pendente → alerta automático de escalação
    if (escalated) {
      await tx.auditLog.create({
        data: {
          userId,
          action: 'CREATED',
          entity: 'Win',
          entityId: win.id,
          after: { escalated: true, repeatCount, motivo: 'Regra das 3 semanas — enviado ao Plano de Ação' },
        },
      })
      // notificação (Resend) disparada fora da transação — ver Anti-Patterns
    }

    return win
  })
}
```

---

## Template: Soft Delete com Justificativa (RN-05, RN-06)

```typescript
export async function arquivarProjeto(projectId: string, reason: string, userId: string) {
  return prisma.$transaction(async (tx) => {

    const projeto = await tx.project.findUnique({ where: { id: projectId, deletedAt: null } })
    if (!projeto) throw new Error('Projeto não encontrado')

    if (!reason || reason.trim().length < 5) {
      throw new Error('Justificativa obrigatória para arquivar o projeto')
    }

    // RN-06: soft delete — nunca DELETE físico, preserva histórico e WINs vinculados
    const arquivado = await tx.project.update({
      where: { id: projeto.id },
      data: { status: 'ARCHIVED', deletedAt: new Date() },
    })

    await tx.auditLog.create({
      data: {
        userId,
        action: 'DELETED',
        entity: 'Project',
        entityId: arquivado.id,
        before: { status: projeto.status },
        after: { status: 'ARCHIVED', reason },
      },
    })

    return arquivado
  })
}
```

---

## Recalcular Progresso do Projeto (RN-07)

```typescript
export async function recalcularProgressoProjeto(projectId: string, tx: Prisma.TransactionClient) {
  const atividades = await tx.activity.findMany({
    where: { projectId, deletedAt: null },
    select: { progress: true },
  })
  if (atividades.length === 0) return

  const media = Math.round(
    atividades.reduce((soma, a) => soma + a.progress, 0) / atividades.length
  )

  await tx.project.update({
    where: { id: projectId },
    data: { progress: media },
  })
}

// Uso: sempre chamado de dentro de uma transação que também alterou uma Activity
export async function atualizarProgressoAtividade(activityId: string, progress: number, userId: string) {
  return prisma.$transaction(async (tx) => {
    const atividade = await tx.activity.update({
      where: { id: activityId, deletedAt: null },
      data: { progress },
    })

    await recalcularProgressoProjeto(atividade.projectId, tx)

    return atividade
  })
}
```

---

## Anti-Patterns Críticos

```typescript
// ❌ Duas operações independentes — se a segunda falhar, projeto fica com progresso desatualizado
await prisma.activity.update({ where: { id }, data: { progress: 100 } })
await prisma.project.update({ where: { id: projectId }, data: { progress: novaMedia } })

// ❌ Concluir sem checar RN-01 dentro da mesma leitura que decide
const atividade = await prisma.activity.findUnique({ where: { id } })
await prisma.activity.update({ where: { id }, data: { status: 'DONE' } }) // e se progress mudou entre a leitura e a escrita?

// ❌ Notificação de escalação bloqueando a transação principal
await tx.win.create({ data: { /* ... */ } })
await resend.emails.send({ /* ... */ }) // NUNCA dentro da transação — falha de e-mail não pode reverter o WIN (RN-14)

// ❌ DELETE físico de dado de negócio — perde histórico de WINs e atividades
await prisma.project.delete({ where: { id } }) // RN-06: usar deletedAt

// ❌ Alterar prazo sem justificativa nem registro de DeadlineChange
await prisma.activity.update({ where: { id }, data: { dueDate: novaData } }) // RN-03 violada
```

Notificação por e-mail (Resend) segue **fora** da transação principal, disparada logo depois do
commit, em `try/catch` isolado — RN-14: falha no envio não pode bloquear a operação principal.

```typescript
const win = await registrarWin(input, userId)
if (win.escalated) {
  try {
    await enviarEmailEscalacao(win)
  } catch (error) {
    console.error('[notificacao escalacao]', error) // não propaga — WIN já foi salvo
  }
}
```
