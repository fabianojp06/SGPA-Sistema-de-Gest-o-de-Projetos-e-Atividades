"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { logAudit } from "@/actions/audit";
import { toActionError } from "@/lib/action-error";
import { revalidatePath } from "next/cache";

const projectSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  area: z.string().min(1),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
});

// Matriz de acesso (doc mestre 4.1): admin, director e coordinator criam/editam projeto.
const PROJECT_MANAGER_ROLES = ["admin", "director", "coordinator"] as const;

export async function getProjects() {
  return prisma.project.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: "desc" },
  });
}

export async function getProject(id: string) {
  return prisma.project.findUnique({ where: { id, deletedAt: null } });
}

export async function createProject(input: z.infer<typeof projectSchema>) {
  try {
    const user = await requireRole(...PROJECT_MANAGER_ROLES);
    const data = projectSchema.parse(input);

    const project = await prisma.project.create({ data });

    await logAudit({
      userId: user.id,
      action: "create",
      entity: "Project",
      entityId: project.id,
      after: project,
    });

    revalidatePath("/dashboard/projetos");
    return { success: true as const, project };
  } catch (error) {
    return {
      success: false as const,
      error: toActionError(error, "Não foi possível criar o projeto", "createProject"),
    };
  }
}

const updateProjectSchema = projectSchema.partial().extend({
  id: z.string(),
  status: z.enum(["ACTIVE", "PAUSED", "COMPLETED", "ARCHIVED", "CANCELLED"]).optional(),
});

// US-002: edição com registro automático de alterações via AuditLog (before/after).
export async function updateProject(input: z.infer<typeof updateProjectSchema>) {
  try {
    const user = await requireRole(...PROJECT_MANAGER_ROLES);
    const { id, ...rest } = updateProjectSchema.parse(input);

    const before = await prisma.project.findUniqueOrThrow({ where: { id } });
    const project = await prisma.project.update({ where: { id }, data: rest });

    await logAudit({
      userId: user.id,
      action: "update",
      entity: "Project",
      entityId: project.id,
      before,
      after: project,
    });

    revalidatePath("/dashboard/projetos");
    revalidatePath(`/dashboard/projetos/${id}`);
    return { success: true as const, project };
  } catch (error) {
    return {
      success: false as const,
      error: toActionError(error, "Não foi possível atualizar o projeto", "updateProject"),
    };
  }
}
