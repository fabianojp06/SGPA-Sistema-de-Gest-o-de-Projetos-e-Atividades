"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { logAudit } from "@/actions/audit";
import { toActionError } from "@/lib/action-error";
import { revalidatePath } from "next/cache";

const PHASE_MANAGER_ROLES = ["admin", "director", "coordinator"] as const;

export async function getProjectPhases(projectId: string) {
  return prisma.projectPhase.findMany({
    where: { projectId },
    orderBy: { order: "asc" },
  });
}

const phaseSchema = z.object({
  projectId: z.string(),
  name: z.string().min(1, "Nome obrigatório"),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
});

// US-003: definir fases/etapas do projeto com datas.
export async function createProjectPhase(input: z.infer<typeof phaseSchema>) {
  try {
    const user = await requireRole(...PHASE_MANAGER_ROLES);
    const data = phaseSchema.parse(input);

    const project = await prisma.project.findUniqueOrThrow({
      where: { id: data.projectId },
    });
    if (data.endDate > project.endDate) {
      throw new Error("O prazo da fase não pode ser posterior ao prazo final do projeto");
    }

    const count = await prisma.projectPhase.count({ where: { projectId: data.projectId } });
    const phase = await prisma.projectPhase.create({ data: { ...data, order: count } });

    await logAudit({
      userId: user.id,
      action: "create",
      entity: "ProjectPhase",
      entityId: phase.id,
      after: phase,
    });

    revalidatePath(`/dashboard/projetos/${data.projectId}`);
    return { success: true as const, phase };
  } catch (error) {
    return {
      success: false as const,
      error: toActionError(error, "Não foi possível criar a fase", "createProjectPhase"),
    };
  }
}
