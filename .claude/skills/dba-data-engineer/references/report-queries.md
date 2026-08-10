# Report Queries — SGPA

SQL para relatórios analíticos e dashboards do domínio de gestão de projetos e atividades.
Todos os exemplos usam CTEs nomeadas para legibilidade e manutenibilidade, e respeitam
RN-06 (soft delete) filtrando `"deletedAt" IS NULL` em cada CTE que toca uma tabela mutável.

---

## Consulta 1: Dashboard de Progresso Agregado por Projeto/Equipe

A consulta mais usada do SGPA — base do Dashboard do Coordenador (US-025) e do Dashboard
Executivo (US-026).

```sql
-- Progresso agregado por projeto, com SLA e carga de equipe
-- Parâmetro: $1 = area (opcional, NULL = todas)

WITH
-- 1. Projetos ativos na área
projetos_base AS (
  SELECT
    id,
    code,
    name,
    area,
    status,
    "startDate",
    "endDate",
    progress
  FROM "Project"
  WHERE "deletedAt" IS NULL
    AND ($1::TEXT IS NULL OR area = $1)
),

-- 2. Atividades por projeto — total, concluídas, atrasadas
atividades_agg AS (
  SELECT
    "projectId",
    COUNT(*)                                                          AS total_atividades,
    COUNT(*) FILTER (WHERE status = 'DONE')                          AS concluidas,
    COUNT(*) FILTER (WHERE status = 'BLOCKED')                       AS bloqueadas,
    COUNT(*) FILTER (
      WHERE status NOT IN ('DONE', 'CANCELLED') AND "dueDate" < NOW()
    )                                                                  AS atrasadas
  FROM "Activity"
  WHERE "deletedAt" IS NULL
  GROUP BY "projectId"
),

-- 3. Carga de equipe (quantos membros ativos por projeto)
equipe_agg AS (
  SELECT
    pm."projectId",
    COUNT(DISTINCT pm."userId") AS qtd_membros
  FROM "ProjectMember" pm
  JOIN "User" u ON u.id = pm."userId" AND u."deletedAt" IS NULL
  GROUP BY pm."projectId"
),

-- 4. Riscos abertos por projeto (RN-11)
riscos_agg AS (
  SELECT
    "projectId",
    COUNT(*) FILTER (WHERE status = 'OPEN')                          AS riscos_abertos,
    COUNT(*) FILTER (WHERE level IN ('HIGH', 'CRITICAL') AND status != 'RESOLVED') AS riscos_criticos
  FROM "Risk"
  WHERE "projectId" IS NOT NULL
  GROUP BY "projectId"
)

-- Montagem final
SELECT
  p.code,
  p.name,
  p.area,
  p.status,
  p.progress                                                          AS progresso_cacheado,
  -- Progresso recalculado a partir das atividades (RN-07 — deve bater com o cacheado)
  CASE
    WHEN COALESCE(a.total_atividades, 0) = 0 THEN 0
    ELSE ROUND(a.concluidas * 100.0 / a.total_atividades, 1)
  END                                                                  AS progresso_calculado,
  COALESCE(a.total_atividades, 0)                                     AS total_atividades,
  COALESCE(a.concluidas, 0)                                           AS concluidas,
  COALESCE(a.bloqueadas, 0)                                           AS bloqueadas,
  COALESCE(a.atrasadas, 0)                                            AS atrasadas,
  -- SLA: % no prazo (US-028)
  CASE
    WHEN COALESCE(a.total_atividades, 0) = 0 THEN 100
    ELSE ROUND((a.total_atividades - a.atrasadas) * 100.0 / a.total_atividades, 1)
  END                                                                  AS sla_no_prazo_pct,
  COALESCE(e.qtd_membros, 0)                                          AS qtd_membros,
  COALESCE(r.riscos_abertos, 0)                                       AS riscos_abertos,
  COALESCE(r.riscos_criticos, 0)                                      AS riscos_criticos,
  p."endDate",
  (p."endDate" < NOW() AND p.status = 'ACTIVE')                       AS prazo_estourado

FROM projetos_base p
LEFT JOIN atividades_agg a ON a."projectId" = p.id
LEFT JOIN equipe_agg e     ON e."projectId" = p.id
LEFT JOIN riscos_agg r     ON r."projectId" = p.id

ORDER BY sla_no_prazo_pct ASC, p."endDate" ASC;
```

---

## Consulta 2: Ranking de WINs Escalados (Regra das 3 Semanas — RN-09)

```sql
-- WINs com maior repeatCount, priorizados para revisão do Plano de Ação
-- Parâmetro: $1 = userId (opcional, NULL = toda a equipe — visão de gestor/diretor)

WITH
wins_ativos AS (
  SELECT
    w.id,
    w."userId",
    w."projectId",
    w.title,
    w.status,
    w."repeatCount",
    w.escalated,
    w."dueDate",
    w."weekNumber",
    w.year
  FROM "Win" w
  WHERE w."deletedAt" IS NULL
    AND w.status != 'DONE'
    AND ($1::TEXT IS NULL OR w."userId" = $1)
)

SELECT
  u.name                                       AS responsavel,
  u.area,
  p.name                                       AS projeto,
  w.title,
  w."repeatCount",
  w.escalated,
  w."dueDate",
  w."weekNumber",
  w.year,
  RANK() OVER (ORDER BY w."repeatCount" DESC)  AS ranking,
  -- Distância da regra: quantas semanas faltam para escalar automaticamente (RN-09: limite 3)
  GREATEST(3 - w."repeatCount", 0)             AS semanas_ate_escalar

FROM wins_ativos w
JOIN "User" u    ON u.id = w."userId"
LEFT JOIN "Project" p ON p.id = w."projectId" AND p."deletedAt" IS NULL

WHERE w."repeatCount" >= 2   -- foco em WINs próximos ou já na escalação

ORDER BY w."repeatCount" DESC, w."dueDate" ASC;
```

---

## Consulta 3: Série Histórica de Conclusão de Atividades (Window Functions)

```sql
-- Conclusões por semana com acumulado — base de gráfico de burndown/burnup por projeto
-- Parâmetros: $1 = projectId, $2 = data_inicio, $3 = data_fim

SELECT
  DATE_TRUNC('week', a."completedAt")                                 AS semana,
  COUNT(*)                                                            AS concluidas_na_semana,
  -- Acumulado de conclusões ao longo do tempo
  SUM(COUNT(*)) OVER (
    ORDER BY DATE_TRUNC('week', a."completedAt")
    ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
  )                                                                    AS concluidas_acumulado,
  -- Média móvel de 4 semanas (velocidade da equipe)
  ROUND(
    AVG(COUNT(*)) OVER (
      ORDER BY DATE_TRUNC('week', a."completedAt")
      ROWS BETWEEN 3 PRECEDING AND CURRENT ROW
    ), 1
  )                                                                    AS media_movel_4sem

FROM "Activity" a
WHERE a."projectId"   = $1
  AND a."deletedAt"   IS NULL
  AND a.status        = 'DONE'
  AND a."completedAt" >= $2
  AND a."completedAt" <  $3

GROUP BY DATE_TRUNC('week', a."completedAt")
ORDER BY semana;
```

---

## Consulta 4: Heatmap de Carga de Trabalho por Membro (US-029)

```sql
-- Atividades ativas por responsável, ponderadas por prioridade
-- Parâmetro: $1 = area (opcional)

SELECT
  u.name                                                              AS colaborador,
  u.area,
  COUNT(*)                                                            AS qtd_atividades,
  COUNT(*) FILTER (WHERE a.priority = 'high')                        AS qtd_alta_prioridade,
  COUNT(*) FILTER (WHERE a."dueDate" < NOW())                        AS qtd_atrasadas,
  SUM(
    CASE a.priority
      WHEN 'high'   THEN 3
      WHEN 'medium' THEN 2
      ELSE 1
    END
  )                                                                    AS peso_carga,
  SUM(
    CASE a.priority WHEN 'high' THEN 3 WHEN 'medium' THEN 2 ELSE 1 END
  ) OVER ()                                                            AS peso_total_equipe,
  ROUND(
    SUM(CASE a.priority WHEN 'high' THEN 3 WHEN 'medium' THEN 2 ELSE 1 END) * 100.0
    / NULLIF(SUM(SUM(CASE a.priority WHEN 'high' THEN 3 WHEN 'medium' THEN 2 ELSE 1 END)) OVER (), 0),
    1
  )                                                                    AS pct_da_carga_total

FROM "Activity" a
JOIN "User" u ON u.id = a."assignedToId" AND u."deletedAt" IS NULL

WHERE a."deletedAt"  IS NULL
  AND a.status       NOT IN ('DONE', 'CANCELLED')
  AND ($1::TEXT IS NULL OR u.area = $1)

GROUP BY u.id, u.name, u.area
ORDER BY peso_carga DESC;
```

---

## Views Materializadas para Consultas Pesadas

```sql
-- View materializada do dashboard de progresso (atualização programada ou sob demanda)
CREATE MATERIALIZED VIEW mv_dashboard_progresso AS
  -- <query completa da Consulta 1 sem parâmetro de área — filtrar no app>
  SELECT ... FROM ...
WITH DATA;

-- Índice na view materializada (necessário para REFRESH CONCURRENTLY)
CREATE UNIQUE INDEX idx_mv_dashboard_progresso_code
  ON mv_dashboard_progresso (code);

-- Atualização (chamar após mutações em Activity/Project, ou via pg_cron a cada 15 min)
REFRESH MATERIALIZED VIEW CONCURRENTLY mv_dashboard_progresso;
-- CONCURRENTLY: permite leituras durante o refresh (requer índice UNIQUE na view)
-- Preferível a query direta quando o dashboard usa Supabase Realtime e recebe
-- muitas leituras simultâneas de vários usuários com a página aberta
```

---

## Dicas de Uso no Prisma ($queryRaw)

```typescript
// Consulta parametrizada via Prisma 6 — sempre usar tagged template
// (proteção automática contra SQL injection)
const resultado = await prisma.$queryRaw<ProgressoRow[]>`
  WITH projetos_base AS (
    SELECT id, code, name, area, status, progress
    FROM "Project"
    WHERE "deletedAt" IS NULL
      AND (${area}::text IS NULL OR area = ${area})
  )
  -- ...resto da query
  SELECT * FROM projetos_base
  ORDER BY code
`

// progress já vem como number (Int no Prisma) — sem necessidade de conversão de Decimal
// Datas vêm como Date do node-postgres — normalizar para ISO antes de mandar ao client
const rows = resultado.map(r => ({
  ...r,
  endDate: r.endDate?.toISOString(),
}))
```
