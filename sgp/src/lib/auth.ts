import { auth, currentUser } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

export async function getCurrentDbUser() {
  const { userId } = await auth();
  if (!userId) return null;

  return prisma.user.findUnique({ where: { clerkId: userId } });
}

export async function requireDbUser() {
  const user = await getCurrentDbUser();
  if (!user) throw new Error("Não autenticado");
  return user;
}

export async function getCurrentClerkUser() {
  return currentUser();
}
