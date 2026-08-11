"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { logAudit } from "@/actions/audit";
import { toActionError } from "@/lib/action-error";
import { revalidatePath } from "next/cache";

// Matriz de acesso 4.1: mesma regra de quem gerencia o projeto gerencia a equipe.
const TEAM_MANAGER_ROLES = ["admin", "director", "coordinator"] as const;

export async function getProjectMembers(projectId: string) {
  return prisma.projectMember.findMany({
    where: { projectId },
    include: { user: true },
    orderBy: { user: { name: "asc" } },
  });
}

const addMemberSchema = z.object({
  projectId: z.string(),
  userId: z.string(),
  role: z.enum(["gestor", "membro", "leitura"]),
});

// US-004: associar equipe ao projeto com papéis (gestor, membro, leitura).
export async function addProjectMember(input: z.infer<typeof addMemberSchema>) {
  try {
    const user = await requireRole(...TEAM_MANAGER_ROLES);
    const data = addMemberSchema.parse(input);

    const member = await prisma.projectMember.upsert({
      where: { projectId_userId: { projectId: data.projectId, userId: data.userId } },
      update: { role: data.role },
      create: data,
    });

    await logAudit({
      userId: user.id,
      action: "add_member",
      entity: "ProjectMember",
      entityId: member.id,
      after: member,
    });

    revalidatePath(`/dashboard/projetos/${data.projectId}`);
    return { success: true as const, member };
  } catch (error) {
    return {
      success: false as const,
      error: toActionError(error, "Não foi possível associar o membro", "addProjectMember"),
    };
  }
}

export async function removeProjectMember(id: string) {
  try {
    const user = await requireRole(...TEAM_MANAGER_ROLES);
    const member = await prisma.projectMember.delete({ where: { id } });

    await logAudit({
      userId: user.id,
      action: "remove_member",
      entity: "ProjectMember",
      entityId: id,
      before: member,
    });

    revalidatePath(`/dashboard/projetos/${member.projectId}`);
    return { success: true as const };
  } catch (error) {
    return {
      success: false as const,
      error: toActionError(error, "Não foi possível remover o membro", "removeProjectMember"),
    };
  }
}
