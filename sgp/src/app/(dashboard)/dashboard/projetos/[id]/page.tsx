import { notFound } from "next/navigation";
import { getProject } from "@/actions/projects";
import { getProjectActivities } from "@/actions/activities";
import { getActiveUsers } from "@/actions/users";
import { getProjectMembers } from "@/actions/team";
import { getProjectPhases } from "@/actions/phases";
import { EditProjectForm } from "@/components/projects/edit-project-form";
import { TeamCard } from "@/components/projects/team-card";
import { PhasesCard } from "@/components/projects/phases-card";
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

  const [activities, users, members, phases] = await Promise.all([
    getProjectActivities(id),
    getActiveUsers(),
    getProjectMembers(id),
    getProjectPhases(id),
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

      <div className="grid gap-6 md:grid-cols-2">
        <TeamCard projectId={id} members={members} users={users} />
        <PhasesCard projectId={id} phases={phases} />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Atividades ({activities.length})</CardTitle>
          <ActivityFormDialog projectId={id} users={users} activities={activities} />
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
                  <TableHead className="w-10"></TableHead>
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
