import Link from "next/link";
import { getCurrentDbUser } from "@/lib/auth";
import { getProjects } from "@/actions/projects";
import { getOverdueActivities, getUpcomingDeadlineActivities } from "@/actions/activities";
import { getMyWinsThisWeek, getTeamWinsThisWeek } from "@/actions/wins";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";

const TEAM_VIEW_ROLES = ["admin", "director", "coordinator"];

function StatTile({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: "success" | "warning" | "danger";
}) {
  const accentClass =
    accent === "success"
      ? "text-[var(--accent-success)]"
      : accent === "warning"
        ? "text-[var(--accent-warning)]"
        : accent === "danger"
          ? "text-[var(--accent-danger)]"
          : "text-foreground";

  return (
    <Card size="sm">
      <CardContent className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className={`font-mono text-3xl font-semibold ${accentClass}`}>{value}</span>
      </CardContent>
    </Card>
  );
}

export default async function DashboardPage() {
  const currentUser = await getCurrentDbUser();
  const isManager = !!currentUser && TEAM_VIEW_ROLES.includes(currentUser.role);

  const [projects, overdue, upcoming, wins] = await Promise.all([
    getProjects(),
    getOverdueActivities(),
    getUpcomingDeadlineActivities(),
    isManager ? getTeamWinsThisWeek() : getMyWinsThisWeek(),
  ]);

  const activeProjects = projects.filter((p) => p.status === "ACTIVE");
  const avgProgress =
    activeProjects.length === 0
      ? 0
      : Math.round(
          activeProjects.reduce((sum, p) => sum + p.progress, 0) / activeProjects.length,
        );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">
          Olá, {currentUser?.name.split(" ")[0] ?? ""}
        </h1>
        <p className="text-muted-foreground">
          Visão geral de projetos, atividades e WINs.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatTile label="Projetos ativos" value={activeProjects.length} />
        <StatTile label="Progresso médio" value={avgProgress} accent="success" />
        <StatTile label="Atividades atrasadas" value={overdue.length} accent="danger" />
        <StatTile label="Prazo próximo" value={upcoming.length} accent="warning" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Atividades atrasadas ({overdue.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {overdue.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhuma atividade atrasada. 🎉
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {overdue.slice(0, 8).map((activity) => (
                  <Link
                    key={activity.id}
                    href={`/dashboard/projetos/${activity.projectId}`}
                    className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-muted/50"
                  >
                    <span>{activity.title}</span>
                    <Badge variant="destructive">{formatDate(activity.dueDate)}</Badge>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              {isManager ? "WINs da equipe esta semana" : "Meus WINs esta semana"} ({wins.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {wins.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum WIN registrado ainda.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {wins.slice(0, 8).map((win) => (
                  <div key={win.id} className="flex items-center justify-between text-sm">
                    <span>{win.title}</span>
                    <Badge variant="outline">{formatDate(win.dueDate)}</Badge>
                  </div>
                ))}
              </div>
            )}
            <Link
              href="/dashboard/wins"
              className="mt-3 inline-block text-xs text-accent hover:underline"
            >
              Ver Card WIN completo →
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
