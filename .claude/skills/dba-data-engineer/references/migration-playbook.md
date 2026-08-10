# Migration Playbook — SGPA

Scripts de migration seguros para produção. Cada migration tem classificação de risco,
estimativa de lock e estratégia de rollback.

---

## Classificação de Risco

| Risco  | Descrição                                               | Requer janela? |
|--------|-----------------------------------------------------------|----------------|
| LOW    | Sem lock prolongado; rollback trivial                   | Não            |
| MEDIUM | Lock breve (< 1s) ou operação com impacto indireto     | Recomendado    |
| HIGH   | Lock prolongado, reescrita de tabela ou sem rollback    | Obrigatório    |

---

## Template de Migration

```sql
-- ============================================================
-- Migration: [NNN]_[descricao_kebab_case]
-- Descrição: [o que faz]
-- Autor:     [nome]
-- Data:      [AAAA-MM-DD]
-- Risco:     LOW / MEDIUM / HIGH
-- Lock:      [estimativa de tempo e escopo do lock]
-- Rollback:  [estratégia / DOWN abaixo]
-- ============================================================

-- === UP =====================================================

-- <SQL da migration>

-- === DOWN ===================================================

-- <SQL de rollback>
```

> No SGPA, migrations são geradas via `prisma migrate dev` / `prisma migrate deploy`
> (Prisma **6** — não v7). Migrations manuais (ex.: pg_cron, triggers, particionamento)
> vivem em `supabase/migrations/` e devem ser aplicadas via Supabase CLI ou SQL editor,
> fora do fluxo padrão do Prisma.

---

## Operações por Risco

### LOW — Seguras a qualquer momento

```sql
-- Adicionar coluna com DEFAULT (não bloqueia leituras no PG 11+)
ALTER TABLE "Activity"
  ADD COLUMN "estimatedHours" INTEGER;

-- Adicionar coluna NOT NULL com DEFAULT (PG 11+ não reescreve a tabela)
ALTER TABLE "Win"
  ADD COLUMN "sourceCardId" TEXT NOT NULL DEFAULT '';

-- Criar índice CONCURRENTLY (não bloqueia writes)
CREATE INDEX CONCURRENTLY idx_activity_project_status_active
  ON "Activity" ("projectId", status)
  WHERE "deletedAt" IS NULL;
-- ⚠️ CONCURRENTLY não pode rodar dentro de bloco BEGIN/COMMIT — executar fora de transação
-- (Prisma Migrate roda cada migration em transação por padrão — usar
--  `prisma migrate dev --create-only` e remover o BEGIN/COMMIT do SQL gerado)

-- Criar nova tabela
CREATE TABLE "DeadlineChange" ( ... );

-- Adicionar CHECK constraint NOT VALID (valida só registros novos)
ALTER TABLE "Activity"
  ADD CONSTRAINT chk_progress_range CHECK (progress BETWEEN 0 AND 100) NOT VALID;
-- Depois validar em background:
ALTER TABLE "Activity" VALIDATE CONSTRAINT chk_progress_range;
```

### MEDIUM — Planejar horário de menor uso

```sql
-- Adicionar FK (adquire lock breve para validar dados existentes)
-- Estratégia: criar FK NOT VALID, validar depois
ALTER TABLE "Activity"
  ADD CONSTRAINT fk_activity_predecessor
  FOREIGN KEY ("predecessorId") REFERENCES "Activity"(id)
  NOT VALID;

ALTER TABLE "Activity" VALIDATE CONSTRAINT fk_activity_predecessor;

-- Renomear coluna (PG 13+ é rápido; versões anteriores reescrevem)
ALTER TABLE "Win" RENAME COLUMN "supportName" TO "supportContact";

-- DROP COLUMN (marca como invisível, não reescreve — mas gera bloat)
ALTER TABLE "Risk" DROP COLUMN "legacyCategory";
-- Seguir de VACUUM FULL em janela de manutenção para recuperar espaço
```

### HIGH — Obrigatoriamente em janela de manutenção

```sql
-- ❌ SET NOT NULL em coluna sem DEFAULT (full table scan + lock)
-- ✅ Estratégia segura em 3 passos:

-- Passo 1: Adicionar coluna nullable com DEFAULT
ALTER TABLE "Project" ADD COLUMN "riskThreshold" INTEGER DEFAULT 3;

-- Passo 2: Backfill (pode rodar em batches para não bloquear)
UPDATE "Project"
SET "riskThreshold" = 3
WHERE "riskThreshold" IS NULL;
-- Para tabelas grandes, fazer em batches:
-- UPDATE "Activity" SET "priority" = 'medium'
--   WHERE id IN (SELECT id FROM "Activity" WHERE priority IS NULL LIMIT 1000);

-- Passo 3: Adicionar constraint NOT NULL (rápido se coluna já está preenchida)
ALTER TABLE "Project" ALTER COLUMN "riskThreshold" SET NOT NULL;

-- ───────────────────────────────────────────────────────────────

-- Mudar tipo de coluna (ex: TEXT → enum fechado) — reescreve a tabela
-- ✅ Estratégia: coluna paralela
-- 1. Criar novo tipo enum e nova coluna
CREATE TYPE "ActivityPriority" AS ENUM ('low','medium','high');
ALTER TABLE "Activity" ADD COLUMN "priorityEnum" "ActivityPriority";
-- 2. Preencher com conversão
UPDATE "Activity" SET "priorityEnum" = priority::"ActivityPriority" WHERE "priorityEnum" IS NULL;
-- 3. Adicionar constraints na nova
ALTER TABLE "Activity" ALTER COLUMN "priorityEnum" SET NOT NULL;
-- 4. Em manutenção: renomear colunas
ALTER TABLE "Activity" RENAME COLUMN priority TO "priorityDeprecated";
ALTER TABLE "Activity" RENAME COLUMN "priorityEnum" TO priority;
-- 5. Próxima release: DROP COLUMN "priorityDeprecated"
```

---

## Particionamento como Migration

Converter tabela existente para particionada sem downtime (PG 12+) — cenário típico do
SGPA é `AuditLog` (RN-15, cresce indefinidamente) ou `Win` (uma linha por WIN por semana
por colaborador, também cresce sem parar):

```sql
-- Estratégia: tabela nova particionada + migração gradual

-- 1. Criar tabela particionada
CREATE TABLE "AuditLog_v2" (
  LIKE "AuditLog" INCLUDING ALL
) PARTITION BY RANGE ("createdAt");

-- 2. Criar partições
CREATE TABLE "AuditLog_2026_07"
  PARTITION OF "AuditLog_v2"
  FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');

CREATE TABLE "AuditLog_2026_08"
  PARTITION OF "AuditLog_v2"
  FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');

-- 3. Copiar dados em background (sem lock)
INSERT INTO "AuditLog_v2"
SELECT * FROM "AuditLog" WHERE "createdAt" >= '2026-07-01' AND "createdAt" < '2026-08-01';
INSERT INTO "AuditLog_v2"
SELECT * FROM "AuditLog" WHERE "createdAt" >= '2026-08-01';

-- 4. Em janela de manutenção: renomear
ALTER TABLE "AuditLog"    RENAME TO "AuditLog_legado";
ALTER TABLE "AuditLog_v2" RENAME TO "AuditLog";

-- 5. Manter AuditLog_legado por 1 ciclo de release para rollback
```

---

## Checklist Pré-Deploy

- [ ] Migration testada em ambiente de staging com volume similar ao produção
- [ ] `EXPLAIN ANALYZE` executado nas queries impactadas após a migration
- [ ] Rollback (DOWN) testado e validado
- [ ] Para índices: `CREATE INDEX CONCURRENTLY` — nunca dentro de `BEGIN/COMMIT`
- [ ] Para tabelas grandes (> 100k linhas): estimativa de duração medida em staging
- [ ] Backup do banco realizado antes de migrations HIGH (snapshot Supabase)
- [ ] Monitoramento de locks ativo durante deploy: `SELECT * FROM pg_locks JOIN pg_stat_activity ...`
- [ ] Confirmar que a migration foi gerada com Prisma **6** (`prisma migrate`), nunca v7

## Checklist Pós-Deploy

- [ ] `SELECT COUNT(*)` nas tabelas afetadas para verificar dados
- [ ] Queries críticas executadas com `EXPLAIN ANALYZE` para confirmar uso de índice
- [ ] `\d "TabelaAfetada"` para confirmar estrutura final
- [ ] Logs de erro do banco monitorados por 15 min após deploy
- [ ] `ANALYZE "TabelaAfetada";` executado para atualizar estatísticas
