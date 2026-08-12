"use server";

import { prisma } from "@/lib/prisma";
import { requireDbUser } from "@/lib/auth";

const GLOBAL_PROJECT_VIEW_ROLES = ["admin", "director"] as const;
const MANAGER_ROLES = ["admin", "director", "coordinator"] as const;

const RESULTS_PER_TYPE = 5;

export interface SearchResult {
  type: "project" | "activity" | "win";
  id: string;
  title: string;
  subtitle: string;
  href: string;
}

// US-049: busca combinada em Project/Activity/Win, cada bloco já escopado
// pelo mesmo critério RBAC das telas normais (getProjects/getOverdueActivities
// pra managers vs. Meus*/getTeamWinsThisWeek) — nunca busca tudo e filtra
// depois, o `where` já nasce restrito.
export async function globalSearch(query: string): Promise<SearchResult[]> {
  const user = await requireDbUser();
  const term = query.trim();
  if (term.length < 2) return [];

  const isGlobalProjectViewer = GLOBAL_PROJECT_VIEW_ROLES.includes(
    user.role as (typeof GLOBAL_PROJECT_VIEW_ROLES)[number],
  );
  const isManager = MANAGER_ROLES.includes(user.role as (typeof MANAGER_ROLES)[number]);

  const [projects, activities, wins] = await Promise.all([
    prisma.project.findMany({
      where: {
        deletedAt: null,
        ...(isGlobalProjectViewer ? {} : { members: { some: { userId: user.id } } }),
        OR: [{ name: { contains: term, mode: "insensitive" } }, { code: { contains: term, mode: "insensitive" } }],
      },
      select: { id: true, code: true, name: true },
      take: RESULTS_PER_TYPE,
    }),
    prisma.activity.findMany({
      where: {
        deletedAt: null,
        title: { contains: term, mode: "insensitive" },
        // Managers têm visão global de atividades nas telas de equipe
        // (getOverdueActivities); technician só as próprias.
        ...(isManager ? {} : { assignedToId: user.id }),
      },
      select: { id: true, title: true, projectId: true, project: { select: { name: true } } },
      take: RESULTS_PER_TYPE,
    }),
    prisma.win.findMany({
      where: {
        deletedAt: null,
        title: { contains: term, mode: "insensitive" },
        // Managers têm visão global de WINs (getTeamWinsThisWeek);
        // technician só os próprios.
        ...(isManager ? {} : { userId: user.id }),
      },
      select: { id: true, title: true, project: { select: { name: true } } },
      take: RESULTS_PER_TYPE,
    }),
  ]);

  const termLower = term.toLowerCase();
  function rank(label: string) {
    return label.toLowerCase().startsWith(termLower) ? 0 : 1;
  }

  const results: SearchResult[] = [
    ...projects.map((p) => ({
      type: "project" as const,
      id: p.id,
      title: p.name,
      subtitle: p.code,
      href: `/dashboard/projetos/${p.id}`,
    })),
    ...activities.map((a) => ({
      type: "activity" as const,
      id: a.id,
      title: a.title,
      subtitle: a.project.name,
      href: `/dashboard/projetos/${a.projectId}`,
    })),
    ...wins.map((w) => ({
      type: "win" as const,
      id: w.id,
      title: w.title,
      subtitle: w.project?.name ?? "Sem projeto",
      href: `/dashboard/wins`,
    })),
  ];

  return results.sort((a, b) => rank(a.title) - rank(b.title));
}
