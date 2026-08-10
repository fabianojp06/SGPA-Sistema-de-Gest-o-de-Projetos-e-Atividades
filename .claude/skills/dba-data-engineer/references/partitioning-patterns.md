# Partitioning Patterns — SGPA

Estratégias de particionamento para tabelas grandes do domínio de gestão de projetos e
atividades. No SGPA, os dois candidatos naturais são `AuditLog` (RN-15 — INSERT only,
cresce indefinidamente) e `Win` (uma linha por WIN por colaborador por semana).

---

## Quando Particionar

| Critério                                      | Decisão              |
|-----------------------------------------------|----------------------|
| Tabela com < 500k linhas/ano                  | Não particionar      |
| Tabela com 500k–2M linhas/ano                 | Avaliar; índices primeiro |
| Tabela com > 2M linhas/ano                    | Particionar          |
| Queries sempre filtram por data/período       | Particionar por período (RANGE) |
| Tabela é append-only e nunca é limpa (`AuditLog`) | Particionar cedo — facilita retenção futura |
| Necessidade de `DROP` rápido de dados antigos | Particionar (partition pruning) |

Para o volume esperado do SGPA (uso interno, uma equipe GIA/STI), `AuditLog` e `Win` não
vão atingir milhões de linhas rapidamente — mas particionar `AuditLog` desde o início é
barato e evita uma migration dolorosa depois, já que a tabela nunca é limpa (RN-15 proíbe
DELETE) e cresce de forma monotônica.

---

## Estratégia 1: Particionamento de AuditLog por Data (RANGE)

```sql
CREATE TABLE "AuditLog" (
  id         TEXT        NOT NULL DEFAULT gen_cuid(),
  "userId"   TEXT        NOT NULL,
  action     TEXT        NOT NULL,   -- CREATED | UPDATED | DELETED | STATUS_CHANGED | DEADLINE_CHANGED
  entity     TEXT        NOT NULL,   -- Project | Activity | Win | Risk
  "entityId" TEXT        NOT NULL,
  before     JSONB,
  after      JSONB,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id, "createdAt")
) PARTITION BY RANGE ("createdAt");

-- Partições mensais (criar com pg_partman ou script mensal via pg_cron)
CREATE TABLE "AuditLog_2026_08"
  PARTITION OF "AuditLog"
  FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');

CREATE TABLE "AuditLog_2026_09"
  PARTITION OF "AuditLog"
  FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');

-- Índices: criados na tabela pai, propagados automaticamente para partições
CREATE INDEX ON "AuditLog" (entity, "entityId", "createdAt" DESC);
CREATE INDEX ON "AuditLog" ("userId", "createdAt" DESC);

-- Bloquear UPDATE e DELETE via trigger (RN-15 — imutabilidade garantida no banco,
-- não só no Prisma middleware)
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

**Vantagem:** consultas de trilha de auditoria por período (ex.: "ações de julho/2026")
fazem partition pruning — Postgres ignora todas as outras partições. E, se no futuro o
produto definir uma política de retenção, `DROP TABLE "AuditLog_2024_01"` remove um mês
inteiro em milissegundos, sem violar RN-15 (retenção é decisão de produto, não UPDATE/DELETE ad-hoc).

---

## Estratégia 2: Particionamento de Win por Ano (LIST)

Toda leitura de `Win` no Card WIN e nos dashboards inclui `year` — bom candidato a
partition pruning por LIST.

```sql
CREATE TABLE "Win" (
  id            TEXT        NOT NULL DEFAULT gen_cuid(),
  "userId"      TEXT        NOT NULL,
  "projectId"   TEXT,
  "weekNumber"  SMALLINT    NOT NULL,
  year          SMALLINT    NOT NULL,
  title         TEXT        NOT NULL,
  status        "WinStatus" NOT NULL DEFAULT 'TODO',
  "repeatCount" INTEGER     NOT NULL DEFAULT 1,
  escalated     BOOLEAN     NOT NULL DEFAULT FALSE,
  "dueDate"     TIMESTAMPTZ NOT NULL,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "deletedAt"   TIMESTAMPTZ,
  -- PK deve incluir a chave de particionamento
  PRIMARY KEY (id, year)
) PARTITION BY LIST (year);

CREATE TABLE "Win_2025"
  PARTITION OF "Win"
  FOR VALUES IN (2025);

CREATE TABLE "Win_2026"
  PARTITION OF "Win"
  FOR VALUES IN (2026);

-- Script para criar partição do próximo ano (rodar em dezembro via pg_cron)
-- CREATE TABLE "Win_2027" PARTITION OF "Win" FOR VALUES IN (2027);

-- Índices parciais (RN-06) propagam para todas as partições
CREATE INDEX ON "Win" ("userId", "weekNumber")
  WHERE "deletedAt" IS NULL;
CREATE INDEX ON "Win" ("repeatCount")
  WHERE "deletedAt" IS NULL AND status != 'DONE';  -- base do job da Regra das 3 Semanas (RN-09)
```

---

## Verificar Partition Pruning

```sql
-- Confirmar que o Postgres está usando partition pruning
EXPLAIN SELECT * FROM "Win"
WHERE "userId" = '...' AND year = 2026;
-- Deve mostrar: "Partitions: Win_2026" — não todas as partições

-- Se mostrar todas as partições, verificar:
-- 1. year está no WHERE?
-- 2. Tipo do parâmetro bate com o tipo da coluna? (SMALLINT vs INT)
-- 3. enable_partition_pruning = on? (padrão)
SHOW enable_partition_pruning;
```

---

## pg_partman: Automação de Partições

Para produção, usar pg_partman para criar partições automaticamente (menos scripts
manuais de fim de mês/ano):

```sql
-- Instalar extensão (disponível no Supabase)
CREATE EXTENSION pg_partman SCHEMA partman;

-- Configurar gerenciamento automático de partições mensais do AuditLog
SELECT partman.create_parent(
  p_parent_table  => 'public."AuditLog"',
  p_control       => 'createdAt',
  p_type          => 'range',
  p_interval      => 'monthly',
  p_premake       => 3   -- cria 3 partições futuras com antecedência
);

-- Rodar manutenção (via job pg_cron — mesmo mecanismo usado pela Regra das 3 Semanas)
SELECT partman.run_maintenance();
```

---

## Queries de Monitoramento de Partições

```sql
-- Listar partições de uma tabela com tamanho
SELECT
  child.relname                          AS particao,
  pg_size_pretty(pg_relation_size(child.oid)) AS tamanho,
  pg_size_pretty(pg_total_relation_size(child.oid)) AS tamanho_total
FROM pg_inherits
JOIN pg_class parent ON pg_inherits.inhparent = parent.oid
JOIN pg_class child  ON pg_inherits.inhrelid  = child.oid
WHERE parent.relname = 'AuditLog'
ORDER BY child.relname;

-- Verificar se partition pruning está funcionando
EXPLAIN (ANALYZE, BUFFERS)
SELECT COUNT(*) FROM "Win" WHERE year = 2026;
-- Deve mostrar "Partitions selected: 1 (out of N)"
```
