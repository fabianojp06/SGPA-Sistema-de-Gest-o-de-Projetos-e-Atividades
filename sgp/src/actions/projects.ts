"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole, requireDbUser } from "@/lib/auth";
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

// Matriz de acesso 4.1 — "Ver todos os projetos": admin/director veem tudo;
// coordinator/technician só os projetos em que estão alocados (ProjectMember).
const GLOBAL_VIEW_ROLES = ["admin", "director"] as const;

// US-020/021/022.
export async function getProjects() {
  const user = await requireDbUser();

  return prisma.project.findMany({
    where: {
      deletedAt: null,
      ...(GLOBAL_VIEW_ROLES.includes(user.role as (typeof GLOBAL_VIEW_ROLES)[number])
        ? {}
        : { members: { some: { userId: user.id } } }),
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getProject(id: string) {
  const user = await requireDbUser();

  return prisma.project.findUnique({
    where: {
      id,
      deletedAt: null,
      ...(GLOBAL_VIEW_ROLES.includes(user.role as (typeof GLOBAL_VIEW_ROLES)[number])
        ? {}
        : { members: { some: { userId: user.id } } }),
    },
  });
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

const closeProjectSchema = z.object({
  id: z.string(),
  status: z.enum(["COMPLETED", "ARCHIVED", "CANCELLED"]),
  reason: z.string().min(1, "Justificativa obrigatória"),
});

// US-005: encerrar/arquivar projeto com justificativa obrigatória.
export async function closeProject(input: z.infer<typeof closeProjectSchema>) {
  try {
    const user = await requireRole(...PROJECT_MANAGER_ROLES);
    const { id, status, reason } = closeProjectSchema.parse(input);

    const before = await prisma.project.findUniqueOrThrow({ where: { id } });
    const project = await prisma.project.update({ where: { id }, data: { status } });

    await logAudit({
      userId: user.id,
      action: "close",
      entity: "Project",
      entityId: project.id,
      before: { status: before.status },
      after: { status: project.status, reason },
    });

    revalidatePath("/dashboard/projetos");
    revalidatePath(`/dashboard/projetos/${id}`);
    return { success: true as const, project };
  } catch (error) {
    return {
      success: false as const,
      error: toActionError(error, "Não foi possível encerrar o projeto", "closeProject"),
    };
  }
}

const cloneProjectSchema = z.object({
  sourceId: z.string(),
  code: z.string().min(1, "Código obrigatório"),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
});

// US-006: clonar projeto existente como template. Copia dados básicos e
// fases; não copia atividades/equipe (são específicas da instância).
export async function cloneProject(input: z.infer<typeof cloneProjectSchema>) {
  try {
    const user = await requireRole(...PROJECT_MANAGER_ROLES);
    const { sourceId, code, startDate, endDate } = cloneProjectSchema.parse(input);

    const source = await prisma.project.findUniqueOrThrow({
      where: { id: sourceId },
      include: { phases: true },
    });

    const project = await prisma.project.create({
      data: {
        code,
        name: `${source.name} (cópia)`,
        description: source.description,
        area: source.area,
        startDate,
        endDate,
        phases: {
          create: source.phases.map((phase) => ({
            name: phase.name,
            startDate: phase.startDate,
            endDate: phase.endDate,
            order: phase.order,
          })),
        },
      },
    });

    await logAudit({
      userId: user.id,
      action: "clone",
      entity: "Project",
      entityId: project.id,
      before: { sourceId },
      after: project,
    });

    revalidatePath("/dashboard/projetos");
    return { success: true as const, project };
  } catch (error) {
    return {
      success: false as const,
      error: toActionError(error, "Não foi possível clonar o projeto", "cloneProject"),
    };
  }
}
