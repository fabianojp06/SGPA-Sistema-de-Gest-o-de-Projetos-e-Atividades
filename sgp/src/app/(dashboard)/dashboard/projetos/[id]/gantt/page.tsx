import { notFound } from "next/navigation";
import Link from "next/link";
import { getProjectGanttData } from "@/actions/activities";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";

interface GanttPageProps {
  params: Promise<{ id: string }>;
}

const STATUS_VARIANT: Record<string, "default" | "outline" | "destructive"> = {
  TODO: "outline",
  IN_PROGRESS: "default",
  DONE: "default",
  BLOCKED: "destructive",
  CANCELLED: "outline",
};

// Posição/largura da barra como % do intervalo total do projeto — cálculo
// dinâmico, não dá pra expressar como classe Tailwind fixa, então usa style
// só para essas duas propriedades numéricas (cor/borda continuam via classes
// e CSS variables do design system).
function barPosition(projectStart: Date, projectEnd: Date, activityStart: Date, activityDue: Date) {
  const totalMs = projectEnd.getTime() - projectStart.getTime();
  if (totalMs <= 0) return { leftPct: 0, widthPct: 100 };

  const clampedStart = Math.max(activityStart.getTime(), projectStart.getTime());
  const clampedEnd = Math.min(activityDue.getTime(), projectEnd.getTime());

  const leftPct = ((clampedStart - projectStart.getTime()) / totalMs) * 100;
  const widthPct = Math.max(((clampedEnd - clampedStart) / totalMs) * 100, 1.5);

  return { leftPct, widthPct };
}

export default async function ProjectGanttPage({ params }: GanttPageProps) {
  const { id } = await params;
  const data = await getProjectGanttData(id);

  if (!data) notFound();

  const { project, activities } = data;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href={`/dashboard/projetos/${id}`}
          className="text-xs font-medium text-accent hover:underline"
        >
          ← Voltar ao projeto
        </Link>
        <h1 className="mt-1 text-2xl font-semibold text-foreground">Gantt — {project.name}</h1>
        <p className="text-muted-foreground">
          {formatDate(project.startDate)} até {formatDate(project.endDate)}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Atividades ({activities.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {activities.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhuma atividade para exibir no Gantt ainda.
            </p>
          ) : (
            <div className="flex flex-col gap-3 overflow-x-auto">
              {activities.map((activity) => {
                const { leftPct, widthPct } = barPosition(
                  project.startDate,
                  project.endDate,
                  activity.startDate,
                  activity.dueDate,
                );

                return (
                  <div key={activity.id} className="flex flex-col gap-1.5 min-w-[560px]">
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-foreground">{activity.title}</span>
                        {activity.assignedTo && (
                          <span className="text-xs text-muted-foreground">
                            {activity.assignedTo.name}
                          </span>
                        )}
                        {activity.predecessorTitle && (
                          <span
                            className="text-xs text-muted-foreground"
                            title={`Depende de "${activity.predecessorTitle}"`}
                          >
                            ⤷ {activity.predecessorTitle}
                          </span>
                        )}
                      </div>
                      <Badge variant={STATUS_VARIANT[activity.status] ?? "outline"}>
                        {activity.status}
                      </Badge>
                    </div>

                    <div className="relative h-6 w-full rounded-md bg-muted/30">
                      <div
                        className={`absolute top-0 h-full rounded-md ${
                          activity.blockedByPredecessor
                            ? "border-2 border-dashed border-[var(--accent-danger)] bg-[var(--accent-danger)]/15"
                            : "bg-accent/70"
                        }`}
                        style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                        title={
                          activity.blockedByPredecessor
                            ? `Bloqueada: "${activity.predecessorTitle}" ainda não foi iniciada`
                            : `${formatDate(activity.startDate)} — ${formatDate(activity.dueDate)}`
                        }
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
