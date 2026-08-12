import type { ActivityStatus } from "@prisma/client";

// US-030: filtros globais do /dashboard. Os únicos valores aceitos vêm de
// enums fechados (RN-10) ou de conjuntos pré-definidos — nunca texto livre
// repassado direto pra uma query. Prioridade fica de fora: Activity.priority
// ainda é String livre no schema, não um enum (ver história US-030).
const PERIOD_PRESETS = ["7d", "30d", "90d"] as const;
export type PeriodPreset = (typeof PERIOD_PRESETS)[number];

const ACTIVITY_STATUSES = ["TODO", "IN_PROGRESS", "DONE", "BLOCKED", "CANCELLED"] as const;

export interface DashboardFilters {
  period?: PeriodPreset;
  projectId?: string;
  area?: string;
  assignedToId?: string;
  status?: ActivityStatus;
}

type SearchParams = Record<string, string | string[] | undefined>;

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

// Lê os filtros da URL (searchParams do Server Component). Qualquer valor
// fora do conjunto aceito é descartado silenciosamente — nunca propagado
// como texto livre para o Prisma, e nunca vira erro pro usuário.
export function parseDashboardFilters(searchParams: SearchParams): DashboardFilters {
  const period = single(searchParams.periodo);
  const status = single(searchParams.status);

  return {
    period: PERIOD_PRESETS.includes(period as PeriodPreset) ? (period as PeriodPreset) : undefined,
    projectId: single(searchParams.projeto) || undefined,
    area: single(searchParams.area) || undefined,
    assignedToId: single(searchParams.responsavel) || undefined,
    status: ACTIVITY_STATUSES.includes(status as ActivityStatus) ? (status as ActivityStatus) : undefined,
  };
}

export function hasActiveFilters(filters: DashboardFilters): boolean {
  return Boolean(filters.period || filters.projectId || filters.area || filters.assignedToId || filters.status);
}

export function periodCutoff(preset: PeriodPreset): Date {
  const days = preset === "7d" ? 7 : preset === "30d" ? 30 : 90;
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

export const PERIOD_LABELS: Record<PeriodPreset, string> = {
  "7d": "Últimos 7 dias",
  "30d": "Últimos 30 dias",
  "90d": "Últimos 90 dias",
};

export const STATUS_LABELS_PT: Record<(typeof ACTIVITY_STATUSES)[number], string> = {
  TODO: "A Fazer",
  IN_PROGRESS: "Em Andamento",
  DONE: "Concluída",
  BLOCKED: "Bloqueada",
  CANCELLED: "Cancelada",
};

export { PERIOD_PRESETS, ACTIVITY_STATUSES };
