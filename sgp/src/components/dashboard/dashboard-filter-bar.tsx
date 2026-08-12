"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { PERIOD_LABELS, PERIOD_PRESETS, STATUS_LABELS_PT, ACTIVITY_STATUSES } from "@/lib/dashboard-filters";

const SELECT_CLASS =
  "h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

interface DashboardFilterBarProps {
  projects: { id: string; name: string }[];
  areas: string[];
  // US-030: filtro de responsável só faz sentido em blocos de equipe —
  // omitido (undefined) para o técnico, que já vê só as próprias atividades.
  members?: { id: string; name: string }[];
  hasActiveFilters: boolean;
}

export function DashboardFilterBar({ projects, areas, members, hasActiveFilters }: DashboardFilterBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    router.push(params.size > 0 ? `${pathname}?${params.toString()}` : pathname);
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/20 p-3">
      <select
        className={SELECT_CLASS}
        value={searchParams.get("periodo") ?? ""}
        onChange={(e) => setParam("periodo", e.target.value)}
      >
        <option value="">Período: todos</option>
        {PERIOD_PRESETS.map((preset) => (
          <option key={preset} value={preset}>
            {PERIOD_LABELS[preset]}
          </option>
        ))}
      </select>

      <select
        className={SELECT_CLASS}
        value={searchParams.get("projeto") ?? ""}
        onChange={(e) => setParam("projeto", e.target.value)}
      >
        <option value="">Projeto: todos</option>
        {projects.map((project) => (
          <option key={project.id} value={project.id}>
            {project.name}
          </option>
        ))}
      </select>

      <select
        className={SELECT_CLASS}
        value={searchParams.get("area") ?? ""}
        onChange={(e) => setParam("area", e.target.value)}
      >
        <option value="">Área: todas</option>
        {areas.map((area) => (
          <option key={area} value={area}>
            {area}
          </option>
        ))}
      </select>

      <select
        className={SELECT_CLASS}
        value={searchParams.get("status") ?? ""}
        onChange={(e) => setParam("status", e.target.value)}
      >
        <option value="">Status: todos</option>
        {ACTIVITY_STATUSES.map((status) => (
          <option key={status} value={status}>
            {STATUS_LABELS_PT[status]}
          </option>
        ))}
      </select>

      {members && (
        <select
          className={SELECT_CLASS}
          value={searchParams.get("responsavel") ?? ""}
          onChange={(e) => setParam("responsavel", e.target.value)}
        >
          <option value="">Responsável: todos</option>
          {members.map((member) => (
            <option key={member.id} value={member.id}>
              {member.name}
            </option>
          ))}
        </select>
      )}

      {hasActiveFilters && (
        <button
          type="button"
          onClick={() => router.push(pathname)}
          className="text-xs font-medium text-accent hover:underline"
        >
          Limpar filtros
        </button>
      )}
    </div>
  );
}
