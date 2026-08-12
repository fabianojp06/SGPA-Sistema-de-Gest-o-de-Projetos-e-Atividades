import Link from "next/link";
import { getCurrentDbUser } from "@/lib/auth";
import { getProjects, getMyManagedProjects, getTeamDeliveryRate } from "@/actions/projects";
import {
  getOverdueActivities,
  getUpcomingDeadlineActivities,
  getMyOverdueActivities,
  getMyUpcomingDeadlineActivities,
  getMyActivityStatusCounts,
} from "@/actions/activities";
import { getMyWinsThisWeek, getTeamWinsThisWeek } from "@/actions/wins";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";

const TEAM_VIEW_ROLES = ["admin", "director", "coordinator"];

const STATUS_LABELS = {
  TODO: "A Fazer",
  IN_PROGRESS: "Em Andamento",
  DONE: "Concluídas",
  BLOCKED: "Bloqueadas",
  CANCELLED: "Canceladas",
} as const satisfies Record<string, string>;

const PROJECT_STATUS_VARIANT: Record<string, "default" | "outline" | "destructive"> = {
  ACTIVE: "default",
  PAUSED: "outline",
  COMPLETED: "default",
  ARCHIVED: "outline",
  CANCELLED: "destructive",
};

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

  // US-024: técnico vê só suas próprias atividades atrasadas/próximas do
  // prazo. Gestores continuam com a visão de equipe (comportamento existente).
  const [projects, overdue, upcoming, wins, statusCounts, managedProjects, deliveryRate] =
    await Promise.all([
      getProjects(),
      isManager ? getOverdueActivities() : getMyOverdueActivities(),
      isManager ? getUpcomingDeadlineActivities() : getMyUpcomingDeadlineActivities(),
      isManager ? getTeamWinsThisWeek() : getMyWinsThisWeek(),
      isManager ? Promise.resolve(null) : getMyActivityStatusCounts(),
      isManager ? getMyManagedProjects() : Promise.resolve(null),
      isManager ? getTeamDeliveryRate() : Promise.resolve(null),
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
            <CardTitle>
              {isManager ? "Atividades atrasadas" : "Minhas atividades atrasadas"} ({overdue.length})
            </CardTitle>
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

      {/* US-024: contagem por status das atividades do próprio técnico. */}
      {!isManager && statusCounts && (
        <Card>
          <CardHeader>
            <CardTitle>Minhas atividades por status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
              {(Object.keys(STATUS_LABELS) as Array<keyof typeof statusCounts>).map((status) => (
                <div key={status} className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">{STATUS_LABELS[status]}</span>
                  <span className="font-mono text-xl font-semibold text-foreground">
                    {statusCounts[status]}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* US-025: projetos sob gestão do coordenador (ProjectMember) e índice
          de entrega no prazo por colaborador — REL-002. */}
      {isManager && managedProjects && deliveryRate && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Projetos da minha equipe ({managedProjects.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {managedProjects.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhum projeto sob sua gestão no momento.
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  {managedProjects.map((project) => (
                    <Link
                      key={project.id}
                      href={`/dashboard/projetos/${project.id}`}
                      className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-muted/50"
                    >
                      <span>{project.name}</span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-muted-foreground">
                          {project.progress}%
                        </span>
                        <Badge variant={PROJECT_STATUS_VARIANT[project.status] ?? "outline"}>
                          {project.status}
                        </Badge>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Índice de entrega no prazo</CardTitle>
            </CardHeader>
            <CardContent>
              {deliveryRate.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhum colaborador na sua equipe ainda.
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  {deliveryRate.map(({ user, onTimeRate }) => (
                    <div key={user.id} className="flex items-center justify-between text-sm">
                      <span>{user.name}</span>
                      <Badge variant={onTimeRate === null ? "outline" : onTimeRate >= 70 ? "default" : "destructive"}>
                        {onTimeRate === null ? "—" : `${onTimeRate}%`}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
