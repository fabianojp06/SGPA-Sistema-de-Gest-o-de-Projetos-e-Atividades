# Query Performance — SGPA

Diagnóstico e otimização de queries lentas no PostgreSQL (Supabase).

---

## Fluxo de Diagnóstico

```
1. Obter EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
2. Identificar o nó mais custoso (→ maior "actual time")
3. Classificar o problema (ver tabela abaixo)
4. Aplicar a solução correspondente
5. Medir antes e depois com EXPLAIN ANALYZE
```

```sql
-- Sempre usar estas opções para diagnóstico completo
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT ...;
```

---

## Classificação de Problemas por Sintoma

| Sintoma no EXPLAIN                        | Causa provável                  | Solução                               |
|---------------------------------------------|---------------------------------|---------------------------------------|
| `Seq Scan` em tabela grande               | Índice ausente ou não usado     | Criar índice; verificar tipo de dado  |
| `rows=X (actual rows=Y)` muito diferentes | Estatísticas desatualizadas     | `ANALYZE tabela;`                     |
| `Hash Join` → `Nested Loop` inesperado    | Estimativa de cardinalidade ruim| `ANALYZE`; ajustar `work_mem`         |
| `Sort` sem `Index Scan`                   | `ORDER BY` sem índice           | Índice incluindo a coluna de ordem    |
| `Bitmap Heap Scan` com muitos blocos      | Tabela com alto bloat (comum em `Win`/`Activity` com muito soft delete) | `VACUUM ANALYZE` |
| Tempo alto em `Filter`                    | Índice existe mas não filtra `deletedAt` | Recriar como índice parcial `WHERE "deletedAt" IS NULL` |
| `Parallel Seq Scan`                       | Consulta analítica sem índice   | Índice parcial ou view materializada  |

---

## Índices: Decisão de Criação

### Índice simples vs composto

```sql
-- Simples: filtra só por projectId (útil, mas não exclui soft-deletadas)
CREATE INDEX idx_activity_project ON "Activity" ("projectId");

-- Composto + parcial: filtra por projectId + status, só linhas ativas
CREATE INDEX idx_activity_project_status_active
  ON "Activity" ("projectId", status)
  WHERE "deletedAt" IS NULL;

-- Regra: no SGPA, "deletedAt IS NULL" é quase sempre a condição mais seletiva —
-- prefira índice parcial a índice composto genérico sempre que a leitura de linhas
-- soft-deletadas for rara (dashboards, listagens, Card WIN)
```

### Índice parcial (o padrão default do SGPA — RN-06)

```sql
-- Atividades ativas por responsável — base do dashboard do técnico (US-024)
CREATE INDEX idx_activity_assignee_active
  ON "Activity" ("assignedToId", "dueDate")
  WHERE "deletedAt" IS NULL AND status != 'DONE';

-- WINs não concluídos da semana — base do Card WIN
CREATE INDEX idx_win_user_week_pending
  ON "Win" ("userId", year, "weekNumber")
  WHERE "deletedAt" IS NULL AND status != 'DONE';

-- Projetos ativos — dashboards excluem arquivados/cancelados
CREATE INDEX idx_project_active
  ON "Project" (status, area)
  WHERE "deletedAt" IS NULL AND status = 'ACTIVE';
```

### Índice covering (INCLUDE) para evitar heap fetch

```sql
-- Listagem de atividades do dashboard sem tocar o heap
CREATE INDEX idx_activity_listagem
  ON "Activity" ("projectId", "dueDate")
  INCLUDE (title, status, progress, "assignedToId")
  WHERE "deletedAt" IS NULL;
-- Com INCLUDE, o Postgres satisfaz a query só com o índice (Index Only Scan)
```

### Índice para busca textual

```sql
-- Busca por título de atividade ou nome de projeto (contains)
CREATE INDEX idx_project_name_trgm
  ON "Project" USING GIN (name gin_trgm_ops);
-- Requer: CREATE EXTENSION pg_trgm;
-- Suporta LIKE '%texto%' e ILIKE via índice
```

---

## Reescrita de Queries Comuns

### Anti-pattern: subquery correlacionada

```sql
-- ❌ Lento — executa subquery para cada linha da tabela externa
SELECT p.id, p.name,
  (SELECT COUNT(*) FROM "Activity" a
   WHERE a."projectId" = p.id AND a."deletedAt" IS NULL AND a.status = 'DONE') AS concluidas
FROM "Project" p
WHERE p."deletedAt" IS NULL;

-- ✅ Rápido — LEFT JOIN com agregação
SELECT p.id, p.name,
  COALESCE(a.concluidas, 0) AS concluidas
FROM "Project" p
LEFT JOIN (
  SELECT "projectId", COUNT(*) AS concluidas
  FROM "Activity"
  WHERE "deletedAt" IS NULL AND status = 'DONE'
  GROUP BY "projectId"
) a ON a."projectId" = p.id
WHERE p."deletedAt" IS NULL;
```

### Anti-pattern: função em coluna indexada

```sql
-- ❌ Impede uso do índice em dueDate
WHERE DATE("dueDate") = '2026-08-10'

-- ✅ Usa o índice
WHERE "dueDate" >= '2026-08-10 00:00:00+00'
  AND "dueDate" <  '2026-08-11 00:00:00+00'
```

### Anti-pattern: esquecer o filtro de soft delete (o bug mais comum no SGPA)

```sql
-- ❌ Inclui atividades soft-deletadas no cálculo de progresso do projeto (viola RN-07)
SELECT AVG(progress) FROM "Activity" WHERE "projectId" = $1;

-- ✅ Sempre filtrar deletedAt — inclusive dentro de CTEs e subqueries
SELECT AVG(progress) FROM "Activity"
WHERE "projectId" = $1 AND "deletedAt" IS NULL;
```

### Anti-pattern: LIKE com wildcard à esquerda

```sql
-- ❌ Não usa índice B-tree
WHERE title LIKE '%dashboard%'

-- ✅ Usa índice GIN com pg_trgm
WHERE title ILIKE '%dashboard%'  -- com índice GIN trgm criado
-- ou para wildcard apenas à direita (prefixo), B-tree funciona:
WHERE code LIKE 'SGPA-2026-%'    -- usa índice B-tree normal
```

---

## Configurações de Sessão para Queries Analíticas

```sql
-- Para relatórios pesados (dashboard executivo, série histórica de conclusão)
SET work_mem = '128MB';          -- mais memória para sorts e hash joins
SET enable_seqscan = OFF;        -- forçar uso de índice (diagnóstico apenas)

-- Para verificar configuração atual
SHOW work_mem;
SHOW max_parallel_workers_per_gather;
```

---

## pg_stat_statements: Identificar Queries Mais Lentas

```sql
-- Requer: CREATE EXTENSION pg_stat_statements; (disponível no Supabase)

-- Top 10 queries por tempo total
SELECT
  LEFT(query, 80)            AS query_resumida,
  calls,
  ROUND(total_exec_time)     AS total_ms,
  ROUND(mean_exec_time)      AS media_ms,
  ROUND(stddev_exec_time)    AS desvio_ms,
  rows
FROM pg_stat_statements
ORDER BY total_exec_time DESC
LIMIT 10;

-- Queries com pior tempo médio (> 1s) — geralmente dashboard executivo ou job pg_cron da RN-09
SELECT LEFT(query, 80), calls, ROUND(mean_exec_time) AS media_ms
FROM pg_stat_statements
WHERE mean_exec_time > 1000
ORDER BY mean_exec_time DESC;
```

---

## Checklist de Performance

Antes de qualquer relatório ou query nova entrar em produção:

- [ ] `EXPLAIN ANALYZE` executado com volume representativo (não com tabela vazia)
- [ ] Sem `Seq Scan` em tabelas com mais de 10k linhas
- [ ] `"deletedAt" IS NULL` presente no `WHERE` e coberto por índice parcial (RN-06)
- [ ] Nenhuma função em coluna indexada no `WHERE`
- [ ] Subqueries correlacionadas substituídas por JOINs ou CTEs
- [ ] `LIMIT` aplicado em listagens (nunca buscar tudo sem limite)
