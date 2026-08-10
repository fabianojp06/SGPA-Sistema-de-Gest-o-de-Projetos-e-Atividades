import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

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
