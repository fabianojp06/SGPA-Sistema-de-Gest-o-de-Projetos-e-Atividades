"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireDbUser } from "@/lib/auth";
import { logAudit } from "@/actions/audit";
import { toActionError } from "@/lib/action-error";
import { revalidatePath } from "next/cache";

// ActivityComment.userId não tem relação Prisma declarada no schema (só o
// escalar) — busca-se o autor manualmente em vez de um `include`.
export async function getActivityComments(activityId: string) {
  await requireDbUser();
  const comments = await prisma.activityComment.findMany({
    where: { activityId },
    orderBy: { createdAt: "asc" },
  });

  const authors = await prisma.user.findMany({
    where: { id: { in: [...new Set(comments.map((c) => c.userId))] } },
  });
  const authorById = new Map(authors.map((a) => [a.id, a]));

  return comments.map((comment) => ({
    ...comment,
    author: authorById.get(comment.userId) ?? null,
  }));
}

const commentSchema = z.object({
  activityId: z.string(),
  content: z.string().min(1, "Comentário vazio"),
});

// US-012: comentar em uma atividade.
export async function createActivityComment(input: z.infer<typeof commentSchema>) {
  try {
    const user = await requireDbUser();
    const { activityId, content } = commentSchema.parse(input);

    const activity = await prisma.activity.findUniqueOrThrow({ where: { id: activityId } });
    const comment = await prisma.activityComment.create({
      data: { activityId, userId: user.id, content },
    });

    await logAudit({
      userId: user.id,
      action: "comment",
      entity: "Activity",
      entityId: activityId,
      after: { commentId: comment.id, content },
    });

    revalidatePath(`/dashboard/projetos/${activity.projectId}`);
    return { success: true as const, comment };
  } catch (error) {
    return {
      success: false as const,
      error: toActionError(error, "Não foi possível comentar", "createActivityComment"),
    };
  }
}
