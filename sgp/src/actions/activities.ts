"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireDbUser } from "@/lib/auth";
import { logAudit } from "@/actions/audit";
import { revalidatePath } from "next/cache";

const activitySchema = z.object({
  projectId: z.string(),
  phaseId: z.string().optional(),
  title: z.string().min(1),
  description: z.string().optional(),
  assignedToId: z.string().optional(),
  dueDate: z.coerce.date(),
});

export async function createActivity(input: z.infer<typeof activitySchema>) {
  try {
    const user = await requireDbUser();
    const data = activitySchema.parse(input);

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
  } catch {
    return { success: false as const, error: "Não foi possível criar a atividade" };
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
    const user = await requireDbUser();
    const { activityId, newDate, reason } = changeDeadlineSchema.parse(input);

    const activity = await prisma.activity.findUniqueOrThrow({
      where: { id: activityId },
    });

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
  } catch {
    return { success: false as const, error: "Não foi possível alterar o prazo" };
  }
}
