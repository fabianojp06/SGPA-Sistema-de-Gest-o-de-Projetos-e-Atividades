"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireDbUser } from "@/lib/auth";
import { toActionError } from "@/lib/action-error";
import { revalidatePath } from "next/cache";

// US-050: sempre escopado por userId = usuário atual — não precisa de RBAC
// por perfil, uma notificação só existe pra quem ela foi endereçada.
export async function getMyNotifications(limit = 20) {
  const user = await requireDbUser();
  const [notifications, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: limit,
    }),
    prisma.notification.count({ where: { userId: user.id, read: false } }),
  ]);

  return { notifications, unreadCount };
}

const markReadSchema = z.object({ id: z.string() });

export async function markNotificationRead(input: z.infer<typeof markReadSchema>) {
  try {
    const user = await requireDbUser();
    const { id } = markReadSchema.parse(input);

    await prisma.notification.updateMany({
      where: { id, userId: user.id },
      data: { read: true },
    });

    revalidatePath("/dashboard");
    return { success: true as const };
  } catch (error) {
    return {
      success: false as const,
      error: toActionError(error, "Não foi possível marcar a notificação como lida", "markNotificationRead"),
    };
  }
}

export async function markAllNotificationsRead() {
  try {
    const user = await requireDbUser();

    await prisma.notification.updateMany({
      where: { userId: user.id, read: false },
      data: { read: true },
    });

    revalidatePath("/dashboard");
    return { success: true as const };
  } catch (error) {
    return {
      success: false as const,
      error: toActionError(error, "Não foi possível marcar as notificações como lidas", "markAllNotificationsRead"),
    };
  }
}
