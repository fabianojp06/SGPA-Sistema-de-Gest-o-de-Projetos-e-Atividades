"use server";

import { prisma } from "@/lib/prisma";
import { requireDbUser } from "@/lib/auth";

export async function getActiveUsers() {
  await requireDbUser();
  return prisma.user.findMany({
    where: { deletedAt: null },
    orderBy: { name: "asc" },
  });
}
