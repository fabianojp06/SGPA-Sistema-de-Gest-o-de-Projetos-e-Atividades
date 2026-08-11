import { notFound } from "next/navigation";
import { getProject } from "@/actions/projects";
import { getProjectActivities } from "@/actions/activities";
import { getActiveUsers } from "@/actions/users";
import { EditProjectForm } from "@/components/projects/edit-project-form";
import { ActivityFormDialog } from "@/components/activities/activity-form-dialog";
import { ActivityRow } from "@/components/activities/activity-row";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface ProjetoPageProps {
  params: Promise<{ id: string }>;
}

export default async function ProjetoDetailPage({ params }: ProjetoPageProps) {
  const { id } = await params;
  const project = await getProject(id);

  if (!project) notFound();

  const [activities, users] = await Promise.all([
    getProjectActivities(id),
    getActiveUsers(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">
          {project.code} — {project.name}
        </h1>
        <p className="text-muted-foreground">{project.area}</p>
      </div>

      <EditProjectForm project={project} />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Atividades ({activities.length})</CardTitle>
          <ActivityFormDialog projectId={id} users={users} />
        </CardHeader>
        <CardContent>
          {activities.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhuma atividade cadastrada ainda.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Título</TableHead>
                  <TableHead>Responsável</TableHead>
                  <TableHead>Prazo</TableHead>
                  <TableHead>Progresso</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activities.map((activity) => (
                  <ActivityRow key={activity.id} activity={activity} />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
