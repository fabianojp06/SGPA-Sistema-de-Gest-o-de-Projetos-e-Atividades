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

// Régua de tempo: uma marcação no 1º dia de cada mês entre o início e o fim
// do projeto, posicionada na mesma escala % das barras — sem isso, as barras
// mostram duração relativa mas nenhuma data real fica visível na tela.
function buildMonthTicks(projectStart: Date, projectEnd: Date) {
  const totalMs = projectEnd.getTime() - projectStart.getTime();
  if (totalMs <= 0) return [];

  const ticks: { leftPct: number; label: string }[] = [];
  const cursor = new Date(projectStart.getFullYear(), projectStart.getMonth(), 1);
  if (cursor < projectStart) cursor.setMonth(cursor.getMonth() + 1);

  while (cursor <= projectEnd) {
    const leftPct = ((cursor.getTime() - projectStart.getTime()) / totalMs) * 100;
    ticks.push({
      leftPct,
      label: cursor.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }),
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return ticks;
}

export default async function ProjectGanttPage({ params }: GanttPageProps) {
  const { id } = await params;
  const data = await getProjectGanttData(id);

  if (!data) notFound();

  const { project, activities } = data;
  const monthTicks = buildMonthTicks(project.startDate, project.endDate);

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
            <div className="overflow-x-auto">
              <div className="flex flex-col gap-3 min-w-[720px]">
                {/* Régua de tempo — alinhada com a mesma largura/offset das
                    barras abaixo (grid de 2 colunas: rótulo fixo | trilha %). */}
                <div className="grid grid-cols-[220px_1fr] items-end gap-3">
                  <div />
                  <div className="relative h-5 border-b border-border">
                    {monthTicks.map((tick) => (
                      <div
                        key={tick.label + tick.leftPct}
                        className="absolute bottom-0 flex -translate-x-1/2 flex-col items-center"
                        style={{ left: `${tick.leftPct}%` }}
                      >
                        <span className="pb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                          {tick.label}
                        </span>
                        <div className="h-1.5 w-px bg-border" />
                      </div>
                    ))}
                  </div>
                </div>

                {activities.map((activity) => {
                  const { leftPct, widthPct } = barPosition(
                    project.startDate,
                    project.endDate,
                    activity.startDate,
                    activity.dueDate,
                  );

                  return (
                    <div key={activity.id} className="grid grid-cols-[220px_1fr] items-center gap-3">
                      <div className="flex flex-col gap-0.5 overflow-hidden">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate text-sm font-medium text-foreground">
                            {activity.title}
                          </span>
                          <Badge variant={STATUS_VARIANT[activity.status] ?? "outline"}>
                            {activity.status}
                          </Badge>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {activity.assignedTo?.name ?? "Sem responsável"}
                          {activity.predecessorTitle && ` · depende de "${activity.predecessorTitle}"`}
                        </span>
                      </div>

                      <div className="flex flex-col gap-1">
                        <div className="relative h-6 w-full rounded-md bg-muted/30">
                          <div
                            className={`absolute top-0 h-full rounded-md ${
                              activity.blockedByPredecessor
                                ? "border-2 border-dashed border-[var(--accent-danger)] bg-[var(--accent-danger)]/15"
                                : "bg-accent/70"
                            }`}
                            style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                          />
                        </div>
                        {/* Datas sempre visíveis — não só em tooltip. */}
                        <div className="relative h-4 text-[11px] text-muted-foreground">
                          <span
                            className="absolute -translate-x-1/2 whitespace-nowrap"
                            style={{ left: `${leftPct}%` }}
                          >
                            {formatDate(activity.startDate)}
                          </span>
                          <span
                            className="absolute -translate-x-1/2 whitespace-nowrap"
                            style={{ left: `${Math.min(leftPct + widthPct, 96)}%` }}
                          >
                            {formatDate(activity.dueDate)}
                          </span>
                        </div>
                        {activity.blockedByPredecessor && (
                          <span className="text-[11px] text-[var(--accent-danger)]">
                            Bloqueada: &ldquo;{activity.predecessorTitle}&rdquo; ainda não foi iniciada
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
