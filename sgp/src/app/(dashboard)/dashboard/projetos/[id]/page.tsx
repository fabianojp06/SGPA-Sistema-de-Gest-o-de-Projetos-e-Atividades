import { notFound } from "next/navigation";
import { getProject } from "@/actions/projects";
import { EditProjectForm } from "@/components/projects/edit-project-form";

interface ProjetoPageProps {
  params: Promise<{ id: string }>;
}

export default async function ProjetoDetailPage({ params }: ProjetoPageProps) {
  const { id } = await params;
  const project = await getProject(id);

  if (!project) notFound();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">
          {project.code} — {project.name}
        </h1>
        <p className="text-muted-foreground">{project.area}</p>
      </div>

      <EditProjectForm project={project} />
    </div>
  );
}
