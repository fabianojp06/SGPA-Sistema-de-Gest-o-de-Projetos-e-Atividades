import Link from "next/link";
import { getProjects } from "@/actions/projects";
import { ProjectFormDialog } from "@/components/projects/project-form-dialog";
import { CloneProjectDialog } from "@/components/projects/clone-project-dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate } from "@/lib/utils";

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: "Ativo",
  PAUSED: "Pausado",
  COMPLETED: "Concluído",
  ARCHIVED: "Arquivado",
  CANCELLED: "Cancelado",
};

export default async function ProjetosPage() {
  const projects = await getProjects();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Projetos</h1>
          <p className="text-muted-foreground">
            {projects.length} projeto{projects.length === 1 ? "" : "s"} cadastrado
            {projects.length === 1 ? "" : "s"}.
          </p>
        </div>
        <ProjectFormDialog />
      </div>

      <Card>
        <CardContent>
          {projects.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum projeto cadastrado ainda.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Área</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Progresso</TableHead>
                  <TableHead>Prazo final</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {projects.map((project) => (
                  <TableRow key={project.id}>
                    <TableCell className="font-mono">
                      <Link
                        href={`/dashboard/projetos/${project.id}`}
                        className="text-accent hover:underline"
                      >
                        {project.code}
                      </Link>
                    </TableCell>
                    <TableCell>{project.name}</TableCell>
                    <TableCell>{project.area}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{STATUS_LABEL[project.status]}</Badge>
                    </TableCell>
                    <TableCell className="w-32">
                      <Progress value={project.progress} className="w-24" />
                    </TableCell>
                    <TableCell className="font-mono">{formatDate(project.endDate)}</TableCell>
                    <TableCell>
                      <CloneProjectDialog sourceId={project.id} sourceName={project.name} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
