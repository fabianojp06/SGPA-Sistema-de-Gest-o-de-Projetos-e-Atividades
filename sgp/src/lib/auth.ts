import { auth, currentUser } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import type { UserRole } from "@prisma/client";

// Sincroniza sob demanda: o webhook do Clerk é a via principal para criar o
// User (RN aplicável a user.created/updated), mas webhooks são assíncronos e
// dependem de configuração externa (endpoint registrado no Dashboard) — se
// isso falhar, um usuário autenticado no Clerk ficaria travado sem User no
// banco. Aqui garantimos o registro no primeiro acesso autenticado.
async function syncCurrentUserFromClerk(clerkId: string) {
  const clerkUser = await currentUser();
  if (!clerkUser || clerkUser.id !== clerkId) return null;

  const email = clerkUser.emailAddresses[0]?.emailAddress;
  if (!email) return null;

  const name =
    `${clerkUser.firstName ?? ""} ${clerkUser.lastName ?? ""}`.trim() || email;

  return prisma.user.upsert({
    where: { clerkId },
    update: { name, email, avatarUrl: clerkUser.imageUrl },
    create: { clerkId, name, email, avatarUrl: clerkUser.imageUrl },
  });
}

export async function getCurrentDbUser() {
  const { userId } = await auth();
  if (!userId) return null;

  const user = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (user) return user;

  return syncCurrentUserFromClerk(userId);
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
