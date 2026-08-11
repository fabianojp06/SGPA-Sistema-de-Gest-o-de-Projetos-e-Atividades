"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireDbUser } from "@/lib/auth";
import { logAudit } from "@/actions/audit";
import { getCurrentWeek } from "@/lib/utils";
import { revalidatePath } from "next/cache";

const helpRequestSchema = z.object({
  description: z.string().min(1, "Descrição obrigatória"),
  targetName: z.string().min(1, "Destinatário obrigatório"),
  dueDate: z.coerce.date().optional(),
});

export async function getMyHelpRequests() {
  const user = await requireDbUser();
  return prisma.helpRequest.findMany({
    where: { userId: user.id, resolved: false },
    orderBy: { createdAt: "desc" },
  });
}

export async function createHelpRequest(input: z.infer<typeof helpRequestSchema>) {
  try {
    const user = await requireDbUser();
    const data = helpRequestSchema.parse(input);
    const { week, year } = getCurrentWeek();

    const helpRequest = await prisma.helpRequest.create({
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
      entity: "HelpRequest",
      entityId: helpRequest.id,
      after: helpRequest,
    });

    revalidatePath("/dashboard/wins");
    return { success: true as const, helpRequest };
  } catch {
    return { success: false as const, error: "Não foi possível registrar o pedido de ajuda" };
  }
}

export async function resolveHelpRequest(id: string) {
  try {
    const user = await requireDbUser();
    const before = await prisma.helpRequest.findUniqueOrThrow({ where: { id } });
    const helpRequest = await prisma.helpRequest.update({
      where: { id },
      data: { resolved: true },
    });

    await logAudit({
      userId: user.id,
      action: "update",
      entity: "HelpRequest",
      entityId: helpRequest.id,
      before,
      after: helpRequest,
    });

    revalidatePath("/dashboard/wins");
    return { success: true as const, helpRequest };
  } catch {
    return { success: false as const, error: "Não foi possível atualizar o pedido de ajuda" };
  }
}
