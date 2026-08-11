import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import type { Prisma } from "@prisma/client";

// US-023: log de auditoria — matriz de acesso 4.1, "Ver logs de auditoria":
// admin e director apenas.
export async function getAuditLogs(limit = 200) {
  await requireRole("admin", "director");
  return prisma.auditLog.findMany({
    include: { user: true },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

interface LogAuditParams {
  userId: string;
  action: string;
  entity: string;
  entityId: string;
  before?: Prisma.InputJsonValue | null;
  after?: Prisma.InputJsonValue | null;
}

export async function logAudit({
  userId,
  action,
  entity,
  entityId,
  before,
  after,
}: LogAuditParams) {
  await prisma.auditLog.create({
    data: {
      userId,
      action,
      entity,
      entityId,
      before: before ?? undefined,
      after: after ?? undefined,
    },
  });
}
