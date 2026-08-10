# Ops Health — SGPA

Monitoramento, vacuum, bloat, locks, saúde geral do PostgreSQL (Supabase) e os jobs
pg_cron que sustentam as regras de negócio automatizadas do SGPA (RN-05, RN-08, RN-09).

---

## Dashboard de Saúde: Queries de Monitoramento

### Tabelas mais acessadas (candidatas a índice ou otimização)

```sql
SELECT
  schemaname,
  relname                                          AS tabela,
  seq_scan                                         AS scans_sequenciais,
  idx_scan                                         AS scans_por_indice,
  ROUND(idx_scan::NUMERIC / NULLIF(seq_scan + idx_scan, 0) * 100, 1) AS pct_indice,
  n_live_tup                                       AS linhas_vivas,
  n_dead_tup                                       AS linhas_mortas,
  pg_size_pretty(pg_total_relation_size(relid))    AS tamanho_total
FROM pg_stat_user_tables
ORDER BY seq_scan DESC
LIMIT 20;
```

> ⚠️ `seq_scan` alto + `idx_scan` baixo em `Activity`/`Win` grande = provavelmente falta
> um índice parcial `WHERE "deletedAt" IS NULL` (RN-06), não índice ausente de verdade.

---

### Índices não utilizados (candidatos a DROP)

```sql
SELECT
  schemaname,
  relname    AS tabela,
  indexrelname AS indice,
  idx_scan   AS vezes_usado,
  pg_size_pretty(pg_relation_size(indexrelid)) AS tamanho
FROM pg_stat_user_indexes
WHERE idx_scan = 0
  AND indexrelname NOT LIKE '%_pkey'    -- nunca remover PKs
  AND indexrelname NOT LIKE '%_key'     -- nunca remover unique constraints
ORDER BY pg_relation_size(indexrelid) DESC;
```

---

### Bloat de tabela e índice

```sql
-- Estimar bloat de tabelas (dead tuples como % do total)
SELECT
  schemaname,
  relname                                               AS tabela,
  n_live_tup                                            AS linhas_vivas,
  n_dead_tup                                            AS linhas_mortas,
  ROUND(n_dead_tup::NUMERIC / NULLIF(n_live_tup + n_dead_tup, 0) * 100, 1) AS pct_mortas,
  last_vacuum::DATE                                     AS ultimo_vacuum,
  last_autovacuum::DATE                                 AS ultimo_autovacuum,
  last_analyze::DATE                                    AS ultimo_analyze
FROM pg_stat_user_tables
WHERE n_dead_tup > 1000
ORDER BY n_dead_tup DESC;
```

> ⚠️ `pct_mortas` > 20% em tabela com escrita frequente = vacuum atrasado.
> `Activity` e `Win` são as mais propensas: todo soft delete (RN-06) e toda atualização
> de progresso/status gera um dead tuple.

---

### Locks ativos (detectar bloqueios)

```sql
-- Queries bloqueadas e quem as bloqueia
SELECT
  blocked.pid                            AS pid_bloqueado,
  blocked_activity.query                 AS query_bloqueada,
  blocked_activity.application_name,
  blocking.pid                           AS pid_bloqueador,
  blocking_activity.query                AS query_bloqueadora,
  EXTRACT(EPOCH FROM NOW() - blocked_activity.query_start) AS segundos_esperando
FROM pg_catalog.pg_locks blocked
JOIN pg_catalog.pg_stat_activity blocked_activity  ON blocked_activity.pid = blocked.pid
JOIN pg_catalog.pg_locks blocking
  ON blocking.locktype = blocked.locktype
  AND blocking.database IS NOT DISTINCT FROM blocked.database
  AND blocking.relation IS NOT DISTINCT FROM blocked.relation
  AND blocking.transactionid IS NOT DISTINCT FROM blocked.transactionid
  AND blocking.pid != blocked.pid
JOIN pg_catalog.pg_stat_activity blocking_activity ON blocking_activity.pid = blocking.pid
WHERE NOT blocked.granted
ORDER BY segundos_esperando DESC;
```

---

### Queries de longa duração (candidatas a cancelamento)

```sql
SELECT
  pid,
  NOW() - query_start                         AS duracao,
  state,
  LEFT(query, 100)                            AS query_resumida,
  wait_event_type,
  wait_event
FROM pg_stat_activity
WHERE state != 'idle'
  AND query_start < NOW() - INTERVAL '30 seconds'
ORDER BY duracao DESC;

-- Cancelar query específica (não mata a conexão)
SELECT pg_cancel_backend(pid);

-- Matar conexão (último recurso)
SELECT pg_terminate_backend(pid);
```

---

## Vacuum e Autovacuum

### Forçar vacuum em tabela crítica

```sql
-- Vacuum leve (pode rodar com tabela em uso)
VACUUM ANALYZE "Activity";

-- Vacuum full (reescreve a tabela — BLOQUEIA; usar em janela de manutenção)
VACUUM FULL "Win";

-- Após vacuum full, recriar índices para eliminar bloat de índice
REINDEX TABLE CONCURRENTLY "Win";
```

### Configurar autovacuum mais agressivo para tabelas de alta escrita

```sql
-- Tabelas com alta taxa de UPDATE por soft delete e mudança de status/progresso
ALTER TABLE "Activity" SET (
  autovacuum_vacuum_scale_factor    = 0.02,  -- padrão 0.20 — vacuuma com 2% de dead tuples
  autovacuum_analyze_scale_factor   = 0.01,  -- atualiza estatísticas com 1% de mudança
  autovacuum_vacuum_cost_delay      = 2      -- ms entre operações (padrão 20ms)
);

ALTER TABLE "Win" SET (
  autovacuum_vacuum_scale_factor    = 0.02,
  autovacuum_analyze_scale_factor   = 0.01
);
```

---

## Jobs pg_cron — Regras de Negócio Automatizadas

O SGPA depende de pg_cron para três regras críticas. Cada job deve ser eficiente o
bastante para rodar sem competir com o tráfego de dashboard (Realtime) em horário de pico.

### RN-09 — Regra das 3 Semanas (WIN repetido gera escalação)

```sql
-- Detecta WINs cujo título se repete por 3 semanas consecutivas sem conclusão
-- e marca escalated = true, disparando notificação (via pg_net → Edge Function → Resend)

-- Query de detecção — roda diariamente, cedo, antes da equipe abrir o Card WIN
WITH wins_repetidos AS (
  SELECT
    "userId",
    title,
    COUNT(DISTINCT ("weekNumber", year)) AS semanas_distintas,
    MAX(id)                              AS win_mais_recente_id
  FROM "Win"
  WHERE "deletedAt" IS NULL
    AND status != 'DONE'
    AND "dueDate" >= NOW() - INTERVAL '4 weeks'
  GROUP BY "userId", title
  HAVING COUNT(DISTINCT ("weekNumber", year)) >= 3
)
UPDATE "Win" w
SET "repeatCount" = wr.semanas_distintas,
    escalated     = TRUE
FROM wins_repetidos wr
WHERE w.id = wr.win_mais_recente_id
  AND w.escalated = FALSE;  -- idempotente: não reprocessa quem já foi escalado

-- Agendamento (roda todo dia às 07h00 BRT = 10h00 UTC)
SELECT cron.schedule(
  'rn09-regra-3-semanas',
  '0 10 * * *',
  $$ <query de detecção acima> $$
);
```

### RN-05 — Projeto parado (sem atividade registrada por 30 dias)

```sql
UPDATE "Project" p
SET status = 'PAUSED'
WHERE p."deletedAt" IS NULL
  AND p.status = 'ACTIVE'
  AND NOT EXISTS (
    SELECT 1 FROM "Activity" a
    WHERE a."projectId" = p.id
      AND a."deletedAt" IS NULL
      AND a."updatedAt" >= NOW() - INTERVAL '30 days'
  );

SELECT cron.schedule('rn05-projeto-parado', '0 6 * * *', $$ <query acima> $$);
```

### RN-08 — Prazo próximo (janela configurável, padrão 3 dias)

```sql
-- Candidatos a notificação — junta com config de janela por gestor se existir
SELECT a.id, a."assignedToId", a.title, a."dueDate"
FROM "Activity" a
WHERE a."deletedAt" IS NULL
  AND a.status NOT IN ('DONE', 'CANCELLED')
  AND a."dueDate" BETWEEN NOW() AND NOW() + INTERVAL '3 days';

SELECT cron.schedule('rn08-prazo-proximo', '30 10 * * *', $$ <query acima> $$);
```

### Log de execução dos jobs

```sql
CREATE TABLE cron_log (
  id         BIGSERIAL PRIMARY KEY,
  job_name   TEXT        NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  rows_affected INTEGER,
  status     TEXT        NOT NULL DEFAULT 'RUNNING' CHECK (status IN ('RUNNING','SUCCESS','FAILED')),
  error      TEXT
);

-- Cada job envolve a query real com um wrapper que grava início/fim em cron_log,
-- para diagnosticar se um job está demorando demais ou falhando silenciosamente.
```

```sql
-- Verificar histórico de execução do pg_cron nativo do Supabase
SELECT jobid, jobname, schedule, active FROM cron.job;
SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 20;
```

---

## Manutenção Preventiva (Runbook Mensal)

```sql
-- 1. Checar tabelas com mais dead tuples
SELECT relname, n_dead_tup, last_autovacuum
FROM pg_stat_user_tables
WHERE n_dead_tup > 10000
ORDER BY n_dead_tup DESC;

-- 2. Checar índices não usados
-- (ver query de índices não utilizados acima)

-- 3. Verificar estatísticas desatualizadas
SELECT relname, last_analyze, last_autoanalyze
FROM pg_stat_user_tables
WHERE last_analyze < NOW() - INTERVAL '7 days'
  OR last_analyze IS NULL
ORDER BY relname;

-- 4. Forçar ANALYZE nas tabelas críticas se necessário
ANALYZE "Project";
ANALYZE "Activity";
ANALYZE "Win";
ANALYZE "AuditLog";

-- 5. Verificar tamanho das tabelas e crescimento (AuditLog e Win são os que mais crescem)
SELECT
  schemaname,
  relname,
  pg_size_pretty(pg_total_relation_size(relid)) AS tamanho_total,
  pg_size_pretty(pg_relation_size(relid))        AS tamanho_dados,
  pg_size_pretty(
    pg_total_relation_size(relid) - pg_relation_size(relid)
  )                                              AS tamanho_indices
FROM pg_stat_user_tables
ORDER BY pg_total_relation_size(relid) DESC
LIMIT 20;

-- 6. Confirmar que os jobs pg_cron das RN-05/08/09 rodaram com sucesso na última semana
SELECT job_name, status, started_at, finished_at, rows_affected
FROM cron_log
WHERE started_at >= NOW() - INTERVAL '7 days'
ORDER BY started_at DESC;
```

---

## Configurações Recomendadas para SGPA (postgresql.conf via Supabase)

```ini
# Memória — instância Supabase de porte pequeno/médio para uso interno de 1 equipe
shared_buffers = 25%_da_RAM
effective_cache_size = 75%_da_RAM
work_mem = 32MB                      # por operação de sort/hash; cuidado com conexões via pooler
maintenance_work_mem = 256MB         # para VACUUM, CREATE INDEX

# Checkpoint
checkpoint_completion_target = 0.9
wal_buffers = 32MB

# Autovacuum
autovacuum_max_workers = 3           # padrão suficiente para o número de tabelas do SGPA
autovacuum_naptime = 30s             # padrão 60s; checar com mais frequência

# Logging (para diagnóstico)
log_min_duration_statement = 1000    # logar queries > 1s
log_checkpoints = on
log_lock_waits = on
deadlock_timeout = 1s
```

> Nota: no Supabase, a maior parte destas configurações é ajustada pelo painel
> (Database → Settings) ou via `ALTER SYSTEM`, não editando `postgresql.conf`
> diretamente — o arquivo acima serve como referência do que pedir/configurar.
