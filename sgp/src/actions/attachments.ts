"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireDbUser } from "@/lib/auth";
import { logAudit } from "@/actions/audit";
import { toActionError } from "@/lib/action-error";
import { revalidatePath } from "next/cache";

export async function getActivityAttachments(activityId: string) {
  await requireDbUser();
  return prisma.attachment.findMany({
    where: { activityId },
    orderBy: { createdAt: "desc" },
  });
}

// Simplificação de MVP: anexo por link (ex: SharePoint/Drive), não upload
// binário — não há bucket de storage configurado para isso ainda.
const attachmentSchema = z.object({
  activityId: z.string(),
  name: z.string().min(1, "Nome obrigatório"),
  url: z.string().url("URL inválida"),
});

// US-012: anexar arquivo (por link) a uma atividade.
export async function createActivityAttachment(input: z.infer<typeof attachmentSchema>) {
  try {
    const user = await requireDbUser();
    const { activityId, name, url } = attachmentSchema.parse(input);

    const activity = await prisma.activity.findUniqueOrThrow({ where: { id: activityId } });
    const attachment = await prisma.attachment.create({
      data: { activityId, name, url, size: 0 },
    });

    await logAudit({
      userId: user.id,
      action: "attach",
      entity: "Activity",
      entityId: activityId,
      after: { attachmentId: attachment.id, name, url },
    });

    revalidatePath(`/dashboard/projetos/${activity.projectId}`);
    return { success: true as const, attachment };
  } catch (error) {
    return {
      success: false as const,
      error: toActionError(error, "Não foi possível anexar o link", "createActivityAttachment"),
    };
  }
}
