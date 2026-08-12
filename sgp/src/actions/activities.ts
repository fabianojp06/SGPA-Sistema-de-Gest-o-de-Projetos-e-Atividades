"use server";

import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireDbUser, requireRole } from "@/lib/auth";
import { logAudit } from "@/actions/audit";
import { toActionError } from "@/lib/action-error";
import { UPCOMING_DEADLINE_WINDOW_DAYS } from "@/lib/deadlines";
import { type DashboardFilters, periodCutoff } from "@/lib/dashboard-filters";
import { revalidatePath } from "next/cache";

// US-030: monta o recorte adicional (AND) a partir dos filtros globais do
// dashboard, exceto `dueDate` — cada action já tem sua própria condição de
// `dueDate` (atrasada/próxima) e precisa combiná-la com o corte de período
// no mesmo objeto (duas chaves `dueDate` no spread se sobrescreveriam).
// Nunca substitui o escopo RBAC/pessoal já presente no `where` de cada
// action — só adiciona restrições em cima dele. `includeAssignee` controla
// se o filtro de responsável é aplicado (nas variantes "My*" ele é
// ignorado, pois assignedToId já está fixado no próprio usuário).
function buildActivityFilterWhere(
  filters: DashboardFilters | undefined,
  {
    includeAssignee = true,
    allowedStatuses,
  }: { includeAssignee?: boolean; allowedStatuses?: readonly string[] } = {},
): Prisma.ActivityWhereInput {
  if (!filters) return {};

  // Blocos de "atrasada"/"próxima" só fazem sentido para status em aberto —
  // um filtro de status fora desse conjunto (ex: DONE) é ignorado em vez de
  // devolver atividade concluída rotulada como atrasada.
  const statusFilterAllowed = !allowedStatuses || (filters.status && allowedStatuses.includes(filters.status));

  return {
    ...(filters.projectId ? { projectId: filters.projectId } : {}),
    ...(filters.area ? { project: { area: filters.area } } : {}),
    ...(filters.status && statusFilterAllowed ? { status: filters.status } : {}),
    ...(includeAssignee && filters.assignedToId ? { assignedToId: filters.assignedToId } : {}),
  };
}

function periodDueDateGte(filters: DashboardFilters | undefined): Date | undefined {
  return filters?.period ? periodCutoff(filters.period) : undefined;
}

// RN-04: só gestor/admin altera prazo de atividade de outros.
const ACTIVITY_MANAGER_ROLES = ["admin", "director", "coordinator"] as const;

// RN-07: progresso do projeto = média do progresso das atividades de topo
// (não deletadas, sem contar sub-atividades/checklist — US-013). Deve rodar
// na mesma transação da mudança que o afeta.
async function recalcProjectProgress(tx: Prisma.TransactionClient, projectId: string) {
  const activities = await tx.activity.findMany({
    where: { projectId, deletedAt: null, parentId: null },
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
// US-030: `filters` aplica período/projeto/área/responsável/status como AND
// sobre este escopo — nunca o substitui.
export async function getOverdueActivities(filters?: DashboardFilters) {
  await requireDbUser();
  const periodGte = periodDueDateGte(filters);
  return prisma.activity.findMany({
    where: {
      status: { in: [...OPEN_STATUSES] },
      dueDate: { lt: new Date(), ...(periodGte ? { gte: periodGte } : {}) },
      deletedAt: null,
      ...buildActivityFilterWhere(filters, { allowedStatuses: OPEN_STATUSES }),
    },
    include: { assignedTo: true, project: true },
    orderBy: { dueDate: "asc" },
  });
}

// US-015: atividades com prazo dentro da janela configurável (RN-08).
export async function getUpcomingDeadlineActivities(
  windowDays: number = UPCOMING_DEADLINE_WINDOW_DAYS,
  filters?: DashboardFilters,
) {
  await requireDbUser();
  const now = new Date();
  const limit = new Date(now.getTime() + windowDays * 24 * 60 * 60 * 1000);
  const periodGte = periodDueDateGte(filters);

  return prisma.activity.findMany({
    where: {
      status: { in: [...OPEN_STATUSES] },
      dueDate: { gte: periodGte && periodGte > now ? periodGte : now, lte: limit },
      deletedAt: null,
      ...buildActivityFilterWhere(filters, { allowedStatuses: OPEN_STATUSES }),
    },
    include: { assignedTo: true, project: true },
    orderBy: { dueDate: "asc" },
  });
}

// US-024: mesmas listas de US-014/US-015, mas restritas às atividades
// atribuídas ao próprio usuário — visão pessoal do técnico no dashboard.
// includeAssignee: false porque assignedToId já está fixo no usuário.
export async function getMyOverdueActivities(filters?: DashboardFilters) {
  const user = await requireDbUser();
  const periodGte = periodDueDateGte(filters);
  return prisma.activity.findMany({
    where: {
      assignedToId: user.id,
      status: { in: [...OPEN_STATUSES] },
      dueDate: { lt: new Date(), ...(periodGte ? { gte: periodGte } : {}) },
      deletedAt: null,
      ...buildActivityFilterWhere(filters, { includeAssignee: false, allowedStatuses: OPEN_STATUSES }),
    },
    include: { project: true },
    orderBy: { dueDate: "asc" },
  });
}

export async function getMyUpcomingDeadlineActivities(
  windowDays: number = UPCOMING_DEADLINE_WINDOW_DAYS,
  filters?: DashboardFilters,
) {
  const user = await requireDbUser();
  const now = new Date();
  const limit = new Date(now.getTime() + windowDays * 24 * 60 * 60 * 1000);
  const periodGte = periodDueDateGte(filters);

  return prisma.activity.findMany({
    where: {
      assignedToId: user.id,
      status: { in: [...OPEN_STATUSES] },
      dueDate: { gte: periodGte && periodGte > now ? periodGte : now, lte: limit },
      deletedAt: null,
      ...buildActivityFilterWhere(filters, { includeAssignee: false, allowedStatuses: OPEN_STATUSES }),
    },
    include: { project: true },
    orderBy: { dueDate: "asc" },
  });
}

const ACTIVITY_STATUSES = ["TODO", "IN_PROGRESS", "DONE", "BLOCKED", "CANCELLED"] as const;

// US-024: contagem por status (RN-10, enum fechado) das atividades atribuídas
// ao usuário autenticado — exclui sub-atividades/checklist (parentId != null)
// para não distorcer a carga percebida com itens leves de checklist (US-013).
export async function getMyActivityStatusCounts() {
  const user = await requireDbUser();
  const grouped = await prisma.activity.groupBy({
    by: ["status"],
    where: { assignedToId: user.id, deletedAt: null, parentId: null },
    _count: { _all: true },
  });

  const counts = Object.fromEntries(
    ACTIVITY_STATUSES.map((status) => [status, 0]),
  ) as Record<(typeof ACTIVITY_STATUSES)[number], number>;

  for (const row of grouped) {
    counts[row.status] = row._count._all;
  }

  return counts;
}

export async function getProjectActivities(projectId: string) {
  await requireDbUser();
  return prisma.activity.findMany({
    where: { projectId, deletedAt: null, parentId: null },
    include: { assignedTo: true },
    orderBy: { createdAt: "desc" },
  });
}

// US-013: sub-atividades (checklist hierárquico) de uma atividade-pai.
export async function getSubActivities(parentId: string) {
  await requireDbUser();
  return prisma.activity.findMany({
    where: { parentId, deletedAt: null },
    orderBy: { createdAt: "asc" },
  });
}

const subActivitySchema = z.object({
  parentId: z.string(),
  title: z.string().min(1, "Título obrigatório"),
});

// Item de checklist herda projeto e prazo da atividade-pai — é uma unidade
// leve, não uma atividade completa por si.
export async function createSubActivity(input: z.infer<typeof subActivitySchema>) {
  try {
    const user = await requireDbUser();
    const { parentId, title } = subActivitySchema.parse(input);

    const parent = await prisma.activity.findUniqueOrThrow({ where: { id: parentId } });
    const subActivity = await prisma.activity.create({
      data: {
        projectId: parent.projectId,
        parentId,
        title,
        dueDate: parent.dueDate,
      },
    });

    await logAudit({
      userId: user.id,
      action: "create_subactivity",
      entity: "Activity",
      entityId: subActivity.id,
      after: subActivity,
    });

    revalidatePath(`/dashboard/projetos/${parent.projectId}`);
    return { success: true as const, subActivity };
  } catch (error) {
    return {
      success: false as const,
      error: toActionError(error, "Não foi possível criar o item", "createSubActivity"),
    };
  }
}

const toggleSubActivitySchema = z.object({
  id: z.string(),
  done: z.boolean(),
});

export async function toggleSubActivity(input: z.infer<typeof toggleSubActivitySchema>) {
  try {
    const user = await requireDbUser();
    const { id, done } = toggleSubActivitySchema.parse(input);

    const before = await prisma.activity.findUniqueOrThrow({ where: { id } });
    const subActivity = await prisma.activity.update({
      where: { id },
      data: {
        progress: done ? 100 : 0,
        status: done ? "DONE" : "TODO",
        completedAt: done ? new Date() : null,
      },
    });

    await logAudit({
      userId: user.id,
      action: "update_subactivity",
      entity: "Activity",
      entityId: id,
      before: { status: before.status, progress: before.progress },
      after: { status: subActivity.status, progress: subActivity.progress },
    });

    revalidatePath(`/dashboard/projetos/${subActivity.projectId}`);
    return { success: true as const, subActivity };
  } catch (error) {
    return {
      success: false as const,
      error: toActionError(error, "Não foi possível atualizar o item", "toggleSubActivity"),
    };
  }
}

const activitySchema = z.object({
  projectId: z.string(),
  phaseId: z.string().optional(),
  title: z.string().min(1, "Título obrigatório"),
  description: z.string().optional(),
  assignedToId: z.string().optional(),
  dueDate: z.coerce.date(),
  predecessorId: z.string().optional(), // US-011
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

    // US-018/RN-18: bloqueia início/conclusão se a predecessora não foi iniciada.
    if (before.predecessorId && status !== "TODO" && status !== "CANCELLED") {
      const predecessor = await prisma.activity.findUnique({
        where: { id: before.predecessorId },
      });
      if (predecessor && predecessor.status === "TODO") {
        throw new Error(
          `Atividade predecessora ("${predecessor.title}") ainda não foi iniciada`,
        );
      }
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
