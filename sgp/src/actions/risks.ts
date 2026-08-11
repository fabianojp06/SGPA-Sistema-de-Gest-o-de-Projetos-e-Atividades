"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireDbUser } from "@/lib/auth";
import { logAudit } from "@/actions/audit";
import { toActionError } from "@/lib/action-error";
import { getCurrentWeek } from "@/lib/utils";
import { revalidatePath } from "next/cache";

const riskSchema = z.object({
  title: z.string().min(1, "Título obrigatório"),
  description: z.string().min(1, "Descrição obrigatória"),
  level: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
  category: z.string().min(1).default("general"),
  projectId: z.string().optional(),
  dueDate: z.coerce.date().optional(),
});

export async function getMyRisks() {
  const user = await requireDbUser();
  return prisma.risk.findMany({
    where: { userId: user.id, status: { not: "RESOLVED" } },
    orderBy: { createdAt: "desc" },
  });
}

export async function createRisk(input: z.infer<typeof riskSchema>) {
  try {
    const user = await requireDbUser();
    const data = riskSchema.parse(input);
    const { week, year } = getCurrentWeek();

    const risk = await prisma.risk.create({
      data: {
        ...data,
        userId: user.id,
        ownerId: user.id,
        weekNumber: week,
        year,
      },
    });

    await logAudit({
      userId: user.id,
      action: "create",
      entity: "Risk",
      entityId: risk.id,
      after: risk,
    });

    revalidatePath("/dashboard/wins");
    return { success: true as const, risk };
  } catch (error) {
    return {
      success: false as const,
      error: toActionError(error, "Não foi possível registrar o risco", "createRisk"),
    };
  }
}
