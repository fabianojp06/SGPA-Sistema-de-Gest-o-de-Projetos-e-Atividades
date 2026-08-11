import { auth, currentUser } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import type { UserRole } from "@prisma/client";

export async function getCurrentDbUser() {
  const { userId } = await auth();
  if (!userId) return null;

  return prisma.user.findUnique({ where: { clerkId: userId } });
}

export async function requireDbUser() {
  const user = await getCurrentDbUser();
  if (!user || user.deletedAt) throw new Error("Não autenticado");
  return user;
}

/**
 * RN-04 e equivalentes: garante que o usuário autenticado tem um dos
 * perfis permitidos antes de prosseguir com a mutação.
 */
export async function requireRole(...allowed: UserRole[]) {
  const user = await requireDbUser();
  if (!allowed.includes(user.role)) {
    throw new Error("Sem permissão para executar esta ação");
  }
  return user;
}

export async function getCurrentClerkUser() {
  return currentUser();
}
