import { redirect } from "next/navigation";
import { getCurrentDbUser } from "@/lib/auth";
import { getProjects, getSlaRate, getWorkloadHeatmap } from "@/actions/projects";
import {
  getMeetingsByType,
  getEscalatedWinsTimeline,
  getDecisionsByProject,
  getAgendaAdoptionRate,
  type ReportFilters,
} from "@/actions/meetings";
import { parseDashboardFilters } from "@/lib/dashboard-filters";
import { ReportsFilterBar } from "@/components/reports/reports-filter-bar";
import { SlaBarChart } from "@/components/reports/sla-bar-chart";
import { WorkloadBarChart } from "@/components/reports/workload-bar-chart";
import { MeetingsByTypeChart } from "@/components/reports/meetings-by-type-chart";
import { EscalatedWinsTimelineChart } from "@/components/reports/escalated-wins-timeline-chart";
import { DecisionsByProjectChart } from "@/components/reports/decisions-by-project-chart";
import { AgendaAdoptionChart } from "@/components/reports/agenda-adoption-chart";

const REPORT_ROLES = ["admin", "director", "coordinator"];
const MEETING_TYPES = ["DAILY", "WEEKLY", "BIWEEKLY", "MONTHLY", "ONE_ON_ONE"];

interface RelatoriosPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function RelatoriosPage({ searchParams }: RelatoriosPageProps) {
  const user = await getCurrentDbUser();
  if (!user || !REPORT_ROLES.includes(user.role)) {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const baseFilters = parseDashboardFilters(params);
  const tipoParam = Array.isArray(params.tipo) ? params.tipo[0] : params.tipo;
  const meetingType = MEETING_TYPES.includes(tipoParam ?? "")
    ? (tipoParam as ReportFilters["meetingType"])
    : undefined;
  const filters: ReportFilters = { ...baseFilters, meetingType };
  const filtersActive = Boolean(filters.period || filters.projectId || filters.area || filters.meetingType);

  const [projects, slaRate, workload, meetingsByType, escalatedTimeline, decisionsByProject, agendaAdoption] =
    await Promise.all([
      getProjects(),
      getSlaRate(filters),
      getWorkloadHeatmap(),
      getMeetingsByType(filters),
      getEscalatedWinsTimeline(filters),
      getDecisionsByProject(filters),
      getAgendaAdoptionRate(filters),
    ]);

  const areaOptions = Array.from(new Set(projects.map((p) => p.area))).sort();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Relatórios</h1>
        <p className="text-muted-foreground">
          Indicadores de portfólio, equipe e pautas de reunião — visão gerencial.
        </p>
      </div>

      <ReportsFilterBar projects={projects} areas={areaOptions} hasActiveFilters={filtersActive} />

      <div>
        <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Portfólio e equipe
        </h2>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <SlaBarChart data={slaRate.byProject} />
          <WorkloadBarChart data={workload} />
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Pautas e reuniões
        </h2>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <MeetingsByTypeChart data={meetingsByType} />
          <AgendaAdoptionChart {...agendaAdoption} />
          <EscalatedWinsTimelineChart data={escalatedTimeline} />
          <DecisionsByProjectChart data={decisionsByProject} />
        </div>
      </div>
    </div>
  );
}
