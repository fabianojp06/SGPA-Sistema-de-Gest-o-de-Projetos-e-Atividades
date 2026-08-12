import { prisma } from "@/lib/prisma";
import type { NotificationType } from "@prisma/client";

interface NotifyParams {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  entityType: string;
  entityId: string;
  link: string;
}

// US-050: não duplica notificação enquanto a anterior do mesmo
// tipo+entidade+usuário ainda estiver não lida (evita spam a cada execução
// do cron); se o usuário já leu, um novo lembrete é legítimo.
export async function notify({ userId, type, title, body, entityType, entityId, link }: NotifyParams) {
  const existing = await prisma.notification.findFirst({
    where: { userId, type, entityId, read: false },
    select: { id: true },
  });
  if (existing) return;

  await prisma.notification.create({
    data: { userId, type, title, body, entityType, entityId, link },
  });
}
