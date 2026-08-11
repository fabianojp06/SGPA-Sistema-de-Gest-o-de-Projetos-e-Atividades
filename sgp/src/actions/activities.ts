"use server";

import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireDbUser, requireRole } from "@/lib/auth";
import { logAudit } from "@/actions/audit";
import { toActionError } from "@/lib/action-error";
import { UPCOMING_DEADLINE_WINDOW_DAYS } from "@/lib/deadlines";
import { revalidatePath } from "next/cache";

// RN-04: só gestor/admin altera prazo de atividade de outros.
const ACTIVITY_MANAGER_ROLES = ["admin", "director", "coordinator"] as const;

// RN-07: progresso do projeto = média do progresso das atividades filhas
// (não deletadas). Deve rodar na mesma transação da mudança que o afeta.
async function recalcProjectProgress(tx: Prisma.TransactionClient, projectId: string) {
  const activities = await tx.activity.findMany({
    where: { projectId, deletedAt: null },
    select: { progress: true },
  });

  const progress =
    activities.length === 0
      ? 0
      : Math.round(activities.reduce((sum, a) => sum + a.progress, 0) / activities.length);

  await tx.project.update({ where: { id: projectId }, data: { progress } });
}

const OPEN_STATUSES = ["TODO", "IN_PROGRESS", "BLOCKED"] as const;

// US-014: atividades com prazo vencido e status ≠ Concluída/Cancelada.
export async function getOverdueActivities() {
  await requireDbUser();
  return prisma.activity.findMany({
    where: {
      status: { in: [...OPEN_STATUSES] },
      dueDate: { lt: new Date() },
      deletedAt: null,
    },
    include: { assignedTo: true, project: true },
    orderBy: { dueDate: "asc" },
  });
}

// US-015: atividades com prazo dentro da janela configurável (RN-08).
export async function getUpcomingDeadlineActivities(
  windowDays: number = UPCOMING_DEADLINE_WINDOW_DAYS,
) {
  await requireDbUser();
  const now = new Date();
  const limit = new Date(now.getTime() + windowDays * 24 * 60 * 60 * 1000);

  return prisma.activity.findMany({
    where: {
      status: { in: [...OPEN_STATUSES] },
      dueDate: { gte: now, lte: limit },
      deletedAt: null,
    },
    include: { assignedTo: true, project: true },
    orderBy: { dueDate: "asc" },
  });
}

export async function getProjectActivities(projectId: string) {
  await requireDbUser();
  return prisma.activity.findMany({
    where: { projectId, deletedAt: null },
    include: { assignedTo: true },
    orderBy: { createdAt: "desc" },
  });
}

const activitySchema = z.object({
  projectId: z.string(),
  phaseId: z.string().optional(),
  title: z.string().min(1, "Título obrigatório"),
  description: z.string().optional(),
  assignedToId: z.string().optional(),
  dueDate: z.coerce.date(),
});

export async function createActivity(input: z.infer<typeof activitySchema>) {
  try {
    const user = await requireDbUser();
    const data = activitySchema.parse(input);

    // RN-02: prazo da atividade não pode ser posterior ao prazo do projeto-pai.
    const project = await prisma.project.findUniqueOrThrow({
      where: { id: data.projectId },
    });
    if (data.dueDate > project.endDate) {
      throw new Error(
        "O prazo da atividade não pode ser posterior ao prazo final do projeto",
      );
    }

    const activity = await prisma.activity.create({ data });

    await logAudit({
      userId: user.id,
      action: "create",
      entity: "Activity",
      entityId: activity.id,
      after: activity,
    });

    revalidatePath(`/dashboard/projetos/${data.projectId}`);
    return { success: true as const, activity };
  } catch (error) {
    return {
      success: false as const,
      error: toActionError(error, "Não foi possível criar a atividade", "createActivity"),
    };
  }
}

const updateProgressSchema = z.object({
  id: z.string(),
  progress: z.number().int().min(0).max(100),
});

// US-010: progresso registrado com histórico via AuditLog (before/after, RN-15).
export async function updateActivityProgress(input: z.infer<typeof updateProgressSchema>) {
  try {
    const user = await requireDbUser();
    const { id, progress } = updateProgressSchema.parse(input);

    const before = await prisma.activity.findUniqueOrThrow({ where: { id } });

    // RN-01: progresso < 100 não pode conviver com status Concluída.
    const status = before.status === "DONE" && progress < 100 ? "IN_PROGRESS" : before.status;

    const activity = await prisma.$transaction(async (tx) => {
      const updated = await tx.activity.update({
        where: { id },
        data: { progress, status },
      });
      await recalcProjectProgress(tx, before.projectId);
      return updated;
    });

    await logAudit({
      userId: user.id,
      action: "update_progress",
      entity: "Activity",
      entityId: activity.id,
      before: { progress: before.progress, status: before.status },
      after: { progress: activity.progress, status: activity.status },
    });

    revalidatePath(`/dashboard/projetos/${before.projectId}`);
    return { success: true as const, activity };
  } catch (error) {
    return {
      success: false as const,
      error: toActionError(error, "Não foi possível atualizar o progresso", "updateActivityProgress"),
    };
  }
}

const updateStatusSchema = z.object({
  id: z.string(),
  status: z.enum(["TODO", "IN_PROGRESS", "DONE", "BLOCKED", "CANCELLED"]),
});

// US-009: transição de status. RN-01: só conclui com progress = 100.
export async function updateActivityStatus(input: z.infer<typeof updateStatusSchema>) {
  try {
    const user = await requireDbUser();
    const { id, status } = updateStatusSchema.parse(input);

    const before = await prisma.activity.findUniqueOrThrow({ where: { id } });

    if (status === "DONE" && before.progress !== 100) {
      throw new Error("Atividade só pode ser concluída com progresso em 100%");
    }

    const activity = await prisma.$transaction(async (tx) => {
      const updated = await tx.activity.update({
        where: { id },
        data: {
          status,
          completedAt: status === "DONE" ? new Date() : null,
        },
      });
      await recalcProjectProgress(tx, before.projectId);
      return updated;
    });

    await logAudit({
      userId: user.id,
      action: "update_status",
      entity: "Activity",
      entityId: activity.id,
      before: { status: before.status },
      after: { status: activity.status },
    });

    revalidatePath(`/dashboard/projetos/${before.projectId}`);
    return { success: true as const, activity };
  } catch (error) {
    return {
      success: false as const,
      error: toActionError(error, "Não foi possível atualizar o status", "updateActivityStatus"),
    };
  }
}

const changeDeadlineSchema = z.object({
  activityId: z.string(),
  newDate: z.coerce.date(),
  reason: z.string().min(1, "Justificativa obrigatória"),
});

export async function changeActivityDeadline(
  input: z.infer<typeof changeDeadlineSchema>
) {
  try {
    const user = await requireRole(...ACTIVITY_MANAGER_ROLES);
    const { activityId, newDate, reason } = changeDeadlineSchema.parse(input);

    const activity = await prisma.activity.findUniqueOrThrow({
      where: { id: activityId },
    });

    // RN-02: novo prazo também não pode ultrapassar o prazo do projeto-pai.
    const project = await prisma.project.findUniqueOrThrow({
      where: { id: activity.projectId },
    });
    if (newDate > project.endDate) {
      throw new Error(
        "O novo prazo não pode ser posterior ao prazo final do projeto",
      );
    }

    const updated = await prisma.$transaction(async (tx) => {
      const updatedActivity = await tx.activity.update({
        where: { id: activityId },
        data: { dueDate: newDate },
      });

      await tx.deadlineChange.create({
        data: {
          activityId,
          changedById: user.id,
          oldDate: activity.dueDate,
          newDate,
          reason,
        },
      });

      return updatedActivity;
    });

    await logAudit({
      userId: user.id,
      action: "change_deadline",
      entity: "Activity",
      entityId: activityId,
      before: { dueDate: activity.dueDate },
      after: { dueDate: newDate },
    });

    revalidatePath(`/dashboard/projetos/${activity.projectId}`);
    return { success: true as const, activity: updated };
  } catch (error) {
    return {
      success: false as const,
      error: toActionError(error, "Não foi possível alterar o prazo", "changeActivityDeadline"),
    };
  }
}
