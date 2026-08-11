"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireDbUser } from "@/lib/auth";
import { logAudit } from "@/actions/audit";
import { toActionError } from "@/lib/action-error";
import { getCurrentWeek } from "@/lib/utils";
import { revalidatePath } from "next/cache";

function getPreviousWeek(week: number, year: number) {
  return week > 1 ? { week: week - 1, year } : { week: 52, year: year - 1 };
}

export async function getMyWinsThisWeek() {
  const user = await requireDbUser();
  const { week, year } = getCurrentWeek();

  return prisma.win.findMany({
    where: { userId: user.id, weekNumber: week, year, deletedAt: null },
    orderBy: { createdAt: "desc" },
  });
}

// US-037: retrospectiva automática da semana anterior ao abrir o card.
export async function getMyWinsLastWeek() {
  const user = await requireDbUser();
  const current = getCurrentWeek();
  const { week, year } = getPreviousWeek(current.week, current.year);

  return prisma.win.findMany({
    where: { userId: user.id, weekNumber: week, year, deletedAt: null },
    orderBy: { createdAt: "desc" },
  });
}

// admin/director/coordinator podem editar/excluir WIN de qualquer um (matriz
// de acesso doc mestre 4.1); technician só o próprio.
const WIN_MANAGER_ROLES = ["admin", "director", "coordinator"] as const;

async function requireWinOwnerOrManager(winId: string) {
  const user = await requireDbUser();
  const win = await prisma.win.findUniqueOrThrow({ where: { id: winId } });

  if (win.userId !== user.id && !WIN_MANAGER_ROLES.includes(user.role as (typeof WIN_MANAGER_ROLES)[number])) {
    throw new Error("Sem permissão para executar esta ação");
  }

  return { user, win };
}

const winSchema = z.object({
  title: z.string().min(1, "Título obrigatório"),
  projectId: z.string().optional(),
  supportName: z.string().optional(),
  dueDate: z.coerce.date(),
});

export async function createWin(input: z.infer<typeof winSchema>) {
  try {
    const user = await requireDbUser();
    const data = winSchema.parse(input);
    const { week, year } = getCurrentWeek();

    const win = await prisma.win.create({
      data: {
        ...data,
        userId: user.id,
        weekNumber: week,
        year,
      },
    });

    await logAudit({
      userId: user.id,
      action: "create",
      entity: "Win",
      entityId: win.id,
      after: win,
    });

    revalidatePath("/dashboard/wins");
    return { success: true as const, win };
  } catch (error) {
    return {
      success: false as const,
      error: toActionError(error, "Não foi possível criar o WIN", "createWin"),
    };
  }
}

const updateWinSchema = z.object({
  id: z.string(),
  title: z.string().min(1, "Título obrigatório"),
  projectId: z.string().optional().nullable(),
  supportName: z.string().optional(),
  dueDate: z.coerce.date(),
  status: z.enum(["TODO", "IN_PROGRESS", "DONE", "BLOCKED", "CANCELLED"]),
});

// US-041: inclui projectId, permitindo vincular/desvincular o WIN a um projeto.
export async function updateWin(input: z.infer<typeof updateWinSchema>) {
  try {
    const { id, ...rest } = updateWinSchema.parse(input);
    const { user, win: before } = await requireWinOwnerOrManager(id);

    const win = await prisma.win.update({ where: { id }, data: rest });

    await logAudit({
      userId: user.id,
      action: "update",
      entity: "Win",
      entityId: win.id,
      before,
      after: win,
    });

    revalidatePath("/dashboard/wins");
    return { success: true as const, win };
  } catch (error) {
    return {
      success: false as const,
      error: toActionError(error, "Não foi possível atualizar o WIN", "updateWin"),
    };
  }
}

// RN-06: soft delete — nunca DELETE físico.
export async function deleteWin(id: string) {
  try {
    const { user, win: before } = await requireWinOwnerOrManager(id);

    const win = await prisma.win.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    await logAudit({
      userId: user.id,
      action: "delete",
      entity: "Win",
      entityId: win.id,
      before,
      after: win,
    });

    revalidatePath("/dashboard/wins");
    return { success: true as const };
  } catch (error) {
    return {
      success: false as const,
      error: toActionError(error, "Não foi possível excluir o WIN", "deleteWin"),
    };
  }
}
