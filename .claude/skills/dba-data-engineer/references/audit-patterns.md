# Audit Patterns — SGPA

Trilha de auditoria para mutações críticas do SGPA — imutável, rastreável, consultável.
Implementa diretamente a RN-15: "Logs de auditoria são imutáveis — INSERT only, sem
UPDATE ou DELETE."

---

## Princípios da Auditoria do SGPA

1. **Append-only:** nenhum UPDATE ou DELETE no `AuditLog` — nunca, nem por admin (RN-15)
2. **Atômica:** o log é gravado na mesma transação da operação — ou ambos acontecem ou nenhum
3. **Completa:** captura quem, quando, o quê, de qual estado para qual (`before`/`after`)
4. **Consultável:** estrutura que permite auditoria por entidade, ator, período ou tipo de ação
5. **Cobre as mutações críticas listadas no US-023**: criação, exclusão lógica, alteração
   de prazo (RN-03), mudança de status

---

## Estrutura da Tabela de Auditoria (model Prisma `AuditLog`)

```sql
CREATE TABLE "AuditLog" (
  id          TEXT        PRIMARY KEY DEFAULT gen_cuid(),
  "userId"    TEXT        NOT NULL REFERENCES "User"(id),

  -- O que foi alterado
  action      TEXT        NOT NULL
                          CHECK (action IN ('CREATED','UPDATED','DELETED','STATUS_CHANGED','DEADLINE_CHANGED')),
  entity      TEXT        NOT NULL,   -- 'Project', 'Activity', 'Win', 'Risk'
  "entityId"  TEXT        NOT NULL,

  -- Estado antes/depois (JSONB — snapshot dos campos relevantes)
  before      JSONB,
  after       JSONB,

  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()

) PARTITION BY RANGE ("createdAt");  -- particionar por mês — ver partitioning-patterns.md

-- Partições mensais (criar com pg_partman ou manualmente)
CREATE TABLE "AuditLog_2026_08"
  PARTITION OF "AuditLog"
  FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');

-- Índices para consultas frequentes
CREATE INDEX ON "AuditLog" (entity, "entityId", "createdAt" DESC);
CREATE INDEX ON "AuditLog" ("userId", "createdAt" DESC);
CREATE INDEX ON "AuditLog" (entity, action, "createdAt" DESC);

-- Bloquear UPDATE e DELETE via trigger (imutabilidade garantida no banco,
-- não só confiada ao Prisma middleware)
CREATE OR REPLACE FUNCTION bloquear_alteracao_audit_log()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'AuditLog é imutável (RN-15). Operação % bloqueada.', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_audit_log_imutavel
  BEFORE UPDATE OR DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION bloquear_alteracao_audit_log();
```

---

## Uso no Código da Aplicação (Prisma 6, dentro de $transaction)

```typescript
// Toda mutação crítica grava em AuditLog na mesma transação — nunca depois, "se der tempo"
await prisma.$transaction(async (tx) => {
  const before = await tx.activity.findUniqueOrThrow({ where: { id: activityId } })

  const after = await tx.activity.update({
    where: { id: activityId },
    data: { status: 'DONE', progress: 100, completedAt: new Date() }, // RN-01
  })

  await tx.auditLog.create({
    data: {
      userId,
      action: 'STATUS_CHANGED',
      entity: 'Activity',
      entityId: activityId,
      before: { status: before.status, progress: before.progress },
      after: { status: after.status, progress: after.progress },
    },
  })
})

// Alteração de prazo (RN-03) — justificativa obrigatória, grava em DeadlineChange
// E TAMBÉM em AuditLog para a trilha genérica
await prisma.$transaction(async (tx) => {
  const before = await tx.activity.findUniqueOrThrow({ where: { id: activityId } })

  const activity = await tx.activity.update({
    where: { id: activityId },
    data: { dueDate: newDate },
  })

  await tx.deadlineChange.create({
    data: { activityId, changedById: userId, oldDate: before.dueDate, newDate, reason },
  })

  await tx.auditLog.create({
    data: {
      userId,
      action: 'DEADLINE_CHANGED',
      entity: 'Activity',
      entityId: activityId,
      before: { dueDate: before.dueDate },
      after: { dueDate: newDate, reason },
    },
  })
})
```

---

## Trigger de Auditoria Automática (alternativa para captura garantida no banco)

Para tabelas onde toda alteração deve ser capturada mesmo que um script bypasse o
Prisma Client (ex.: script de manutenção rodado direto no SQL editor do Supabase):

```sql
CREATE OR REPLACE FUNCTION capturar_alteracao_generico()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO "AuditLog" ("userId", action, entity, "entityId", after)
    VALUES (
      current_setting('app.current_user_id', true), 'CREATED', TG_TABLE_NAME, NEW.id,
      to_jsonb(NEW)
    );

  ELSIF TG_OP = 'UPDATE' THEN
    -- Captura apenas se houve mudança real (soft delete conta como UPDATE — RN-06)
    IF OLD IS DISTINCT FROM NEW THEN
      INSERT INTO "AuditLog" ("userId", action, entity, "entityId", before, after)
      VALUES (
        current_setting('app.current_user_id', true),
        CASE WHEN NEW."deletedAt" IS NOT NULL AND OLD."deletedAt" IS NULL
             THEN 'DELETED' ELSE 'UPDATED' END,
        TG_TABLE_NAME, NEW.id, to_jsonb(OLD), to_jsonb(NEW)
      );
    END IF;
  END IF;
  RETURN NULL; -- AFTER trigger, retorno ignorado
END;
$$ LANGUAGE plpgsql;

-- Aplicar na tabela de atividades
CREATE TRIGGER trg_activity_auditoria
  AFTER INSERT OR UPDATE ON "Activity"
  FOR EACH ROW EXECUTE FUNCTION capturar_alteracao_generico();
```

> Na prática, o SGPA prioriza gravar o `AuditLog` explicitamente na Server Action (mais
> controle sobre o que entra em `before`/`after`), reservando o trigger genérico para
> tabelas onde a captura automática compensa o menor controle — avaliar com `techlead-fsg`.

---

## Queries de Consulta da Trilha

```sql
-- Histórico completo de uma atividade
SELECT
  al.action,
  al.before,
  al.after,
  u.name AS realizado_por,
  al."createdAt"
FROM "AuditLog" al
JOIN "User" u ON u.id = al."userId"
WHERE al.entity     = 'Activity'
  AND al."entityId" = $1
ORDER BY al."createdAt";

-- Ações de um usuário no período (US-023 — log de auditoria de ações críticas)
SELECT
  al.entity,
  al."entityId",
  al.action,
  al."createdAt"
FROM "AuditLog" al
WHERE al."userId"    = $1
  AND al."createdAt" BETWEEN $2 AND $3
ORDER BY al."createdAt" DESC;

-- Exclusões lógicas (soft delete) do dia — auditoria de RN-06
SELECT
  al.entity,
  al."entityId",
  al.before->>'title' AS titulo,
  u.name               AS realizado_por,
  al."createdAt"
FROM "AuditLog" al
JOIN "User" u ON u.id = al."userId"
WHERE al.action      = 'DELETED'
  AND al."createdAt" >= NOW() - INTERVAL '24 hours'
ORDER BY al."createdAt" DESC;

-- Alterações de prazo sem justificativa aparente (checagem cruzada com DeadlineChange — RN-03)
SELECT al.*
FROM "AuditLog" al
WHERE al.action = 'DEADLINE_CHANGED'
  AND NOT EXISTS (
    SELECT 1 FROM "DeadlineChange" dc
    WHERE dc."activityId" = al."entityId"
      AND dc."createdAt" BETWEEN al."createdAt" - INTERVAL '1 minute' AND al."createdAt" + INTERVAL '1 minute'
  );
```
