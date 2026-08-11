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
  status: z.enum(["TODO", "IN_PROGRESS", "DONE", "BLOCKED", "CANCELLED"]),
});

export async function updateWin(input: z.infer<typeof updateWinSchema>) {
  try {
    const user = await requireDbUser();
    const { id, status } = updateWinSchema.parse(input);

    const before = await prisma.win.findUniqueOrThrow({ where: { id } });
    const win = await prisma.win.update({ where: { id }, data: { status } });

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
