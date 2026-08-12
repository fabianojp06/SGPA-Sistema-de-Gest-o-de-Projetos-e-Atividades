"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole, requireDbUser } from "@/lib/auth";
import { logAudit } from "@/actions/audit";
import { toActionError } from "@/lib/action-error";
import { type DashboardFilters, periodCutoff } from "@/lib/dashboard-filters";
import { revalidatePath } from "next/cache";

const projectSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  area: z.string().min(1),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
});

// Matriz de acesso (doc mestre 4.1): admin, director e coordinator criam/editam projeto.
const PROJECT_MANAGER_ROLES = ["admin", "director", "coordinator"] as const;

// Matriz de acesso 4.1 — "Ver todos os projetos": admin/director veem tudo;
// coordinator/technician só os projetos em que estão alocados (ProjectMember).
const GLOBAL_VIEW_ROLES = ["admin", "director"] as const;

// US-020/021/022.
export async function getProjects() {
  const user = await requireDbUser();

  return prisma.project.findMany({
    where: {
      deletedAt: null,
      ...(GLOBAL_VIEW_ROLES.includes(user.role as (typeof GLOBAL_VIEW_ROLES)[number])
        ? {}
        : { members: { some: { userId: user.id } } }),
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getProject(id: string) {
  const user = await requireDbUser();

  return prisma.project.findUnique({
    where: {
      id,
      deletedAt: null,
      ...(GLOBAL_VIEW_ROLES.includes(user.role as (typeof GLOBAL_VIEW_ROLES)[number])
        ? {}
        : { members: { some: { userId: user.id } } }),
    },
  });
}

export async function createProject(input: z.infer<typeof projectSchema>) {
  try {
    const user = await requireRole(...PROJECT_MANAGER_ROLES);
    const data = projectSchema.parse(input);

    const project = await prisma.project.create({ data });

    await logAudit({
      userId: user.id,
      action: "create",
      entity: "Project",
      entityId: project.id,
      after: project,
    });

    revalidatePath("/dashboard/projetos");
    return { success: true as const, project };
  } catch (error) {
    return {
      success: false as const,
      error: toActionError(error, "Não foi possível criar o projeto", "createProject"),
    };
  }
}

const updateProjectSchema = projectSchema.partial().extend({
  id: z.string(),
  status: z.enum(["ACTIVE", "PAUSED", "COMPLETED", "ARCHIVED", "CANCELLED"]).optional(),
});

// US-002: edição com registro automático de alterações via AuditLog (before/after).
export async function updateProject(input: z.infer<typeof updateProjectSchema>) {
  try {
    const user = await requireRole(...PROJECT_MANAGER_ROLES);
    const { id, ...rest } = updateProjectSchema.parse(input);

    const before = await prisma.project.findUniqueOrThrow({ where: { id } });
    const project = await prisma.project.update({ where: { id }, data: rest });

    await logAudit({
      userId: user.id,
      action: "update",
      entity: "Project",
      entityId: project.id,
      before,
      after: project,
    });

    revalidatePath("/dashboard/projetos");
    revalidatePath(`/dashboard/projetos/${id}`);
    return { success: true as const, project };
  } catch (error) {
    return {
      success: false as const,
      error: toActionError(error, "Não foi possível atualizar o projeto", "updateProject"),
    };
  }
}

const closeProjectSchema = z.object({
  id: z.string(),
  status: z.enum(["COMPLETED", "ARCHIVED", "CANCELLED"]),
  reason: z.string().min(1, "Justificativa obrigatória"),
});

// US-005: encerrar/arquivar projeto com justificativa obrigatória.
export async function closeProject(input: z.infer<typeof closeProjectSchema>) {
  try {
    const user = await requireRole(...PROJECT_MANAGER_ROLES);
    const { id, status, reason } = closeProjectSchema.parse(input);

    const before = await prisma.project.findUniqueOrThrow({ where: { id } });
    const project = await prisma.project.update({ where: { id }, data: { status } });

    await logAudit({
      userId: user.id,
      action: "close",
      entity: "Project",
      entityId: project.id,
      before: { status: before.status },
      after: { status: project.status, reason },
    });

    revalidatePath("/dashboard/projetos");
    revalidatePath(`/dashboard/projetos/${id}`);
    return { success: true as const, project };
  } catch (error) {
    return {
      success: false as const,
      error: toActionError(error, "Não foi possível encerrar o projeto", "closeProject"),
    };
  }
}

const cloneProjectSchema = z.object({
  sourceId: z.string(),
  code: z.string().min(1, "Código obrigatório"),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
});

// US-006: clonar projeto existente como template. Copia dados básicos e
// fases; não copia atividades/equipe (são específicas da instância).
export async function cloneProject(input: z.infer<typeof cloneProjectSchema>) {
  try {
    const user = await requireRole(...PROJECT_MANAGER_ROLES);
    const { sourceId, code, startDate, endDate } = cloneProjectSchema.parse(input);

    const source = await prisma.project.findUniqueOrThrow({
      where: { id: sourceId },
      include: { phases: true },
    });

    const project = await prisma.project.create({
      data: {
        code,
        name: `${source.name} (cópia)`,
        description: source.description,
        area: source.area,
        startDate,
        endDate,
        phases: {
          create: source.phases.map((phase) => ({
            name: phase.name,
            startDate: phase.startDate,
            endDate: phase.endDate,
            order: phase.order,
          })),
        },
      },
    });

    await logAudit({
      userId: user.id,
      action: "clone",
      entity: "Project",
      entityId: project.id,
      before: { sourceId },
      after: project,
    });

    revalidatePath("/dashboard/projetos");
    return { success: true as const, project };
  } catch (error) {
    return {
      success: false as const,
      error: toActionError(error, "Não foi possível clonar o projeto", "cloneProject"),
    };
  }
}

// US-025: índice de entrega no prazo por colaborador — REL-002. Escopo:
// colaboradores dos projetos onde o usuário autenticado (coordinator/
// director/admin) é ProjectMember, reaproveitando o mesmo critério de
// "sob gestão" usado em getProjects() para coordinator.
const TEAM_DELIVERY_ROLES = ["admin", "director", "coordinator"] as const;

// US-030: filters.projectId/area restringem AND sobre os projetos onde o
// usuário já é ProjectMember — nunca um projeto fora desse escopo, mesmo
// que o valor do filtro tente apontar pra lá (ele simplesmente não bate
// com managedProjectIds e o resultado fica vazio). filters.assignedToId
// restringe a exibição a 1 colaborador específico.
export async function getTeamDeliveryRate(filters?: DashboardFilters) {
  const user = await requireRole(...TEAM_DELIVERY_ROLES);

  let managedProjectIds = (
    await prisma.projectMember.findMany({
      where: { userId: user.id },
      select: { projectId: true },
    })
  ).map((m) => m.projectId);

  if (filters?.projectId) {
    managedProjectIds = managedProjectIds.filter((id) => id === filters.projectId);
  }
  if (filters?.area) {
    const projectsInArea = await prisma.project.findMany({
      where: { id: { in: managedProjectIds }, area: filters.area },
      select: { id: true },
    });
    managedProjectIds = projectsInArea.map((p) => p.id);
  }

  if (managedProjectIds.length === 0) {
    return [];
  }

  const members = await prisma.projectMember.findMany({
    where: {
      projectId: { in: managedProjectIds },
      ...(filters?.assignedToId ? { userId: filters.assignedToId } : {}),
    },
    select: { user: true },
    distinct: ["userId"],
  });

  const doneActivities = await prisma.activity.findMany({
    where: {
      projectId: { in: managedProjectIds },
      status: "DONE",
      deletedAt: null,
      assignedToId: { not: null },
      ...(filters?.period ? { completedAt: { gte: periodCutoff(filters.period) } } : {}),
    },
    select: { assignedToId: true, dueDate: true, completedAt: true },
  });

  return members
    .map(({ user: member }) => {
      const memberDone = doneActivities.filter((a) => a.assignedToId === member.id);
      const onTime = memberDone.filter(
        (a) => a.completedAt !== null && a.completedAt <= a.dueDate,
      ).length;

      return {
        user: member,
        totalDone: memberDone.length,
        onTimeRate: memberDone.length === 0 ? null : Math.round((onTime / memberDone.length) * 100),
      };
    })
    .sort((a, b) => a.user.name.localeCompare(b.user.name));
}

// US-025: "Projetos da minha equipe" — projetos onde o usuário autenticado é
// ProjectMember, independente do papel (ao contrário de getProjects(), que
// para admin/director retorna o portfólio inteiro). Usado no dashboard do
// coordenador para refletir especificamente a equipe sob sua gestão direta.
export async function getMyManagedProjects(filters?: DashboardFilters) {
  const user = await requireDbUser();
  return prisma.project.findMany({
    where: {
      deletedAt: null,
      members: { some: { userId: user.id } },
      ...(filters?.projectId ? { id: filters.projectId } : {}),
      ...(filters?.area ? { area: filters.area } : {}),
    },
    orderBy: { createdAt: "desc" },
  });
}

// US-028/US-029: perfis que podem ver indicadores agregados de portfólio/
// equipe. technician não acessa — são indicadores de gestão, não de execução
// individual (RN aplicável: nenhuma, é apenas leitura restrita por RBAC).
const PORTFOLIO_METRICS_ROLES = ["admin", "director", "coordinator"] as const;

// Escopo de projetos visível ao usuário para os indicadores agregados:
// admin/director = portfólio inteiro; coordinator = projetos onde é
// ProjectMember (mesmo critério de getProjects()/getTeamDeliveryRate()).
async function getMetricsScopeProjectIds(user: { id: string; role: string }) {
  if (GLOBAL_VIEW_ROLES.includes(user.role as (typeof GLOBAL_VIEW_ROLES)[number])) {
    return null; // null = sem filtro de projectId, portfólio inteiro
  }

  const memberships = await prisma.projectMember.findMany({
    where: { userId: user.id },
    select: { projectId: true },
  });
  return memberships.map((m) => m.projectId);
}

function calcSlaRate(done: { dueDate: Date; completedAt: Date | null }[]) {
  if (done.length === 0) return null;
  const onTime = done.filter((a) => a.completedAt !== null && a.completedAt <= a.dueDate).length;
  return Math.round((onTime / done.length) * 100);
}

// US-028 — REL-001: % de atividades DONE concluídas dentro do prazo,
// agregado no portfólio visível ao usuário e também aberto por projeto.
// US-030: filters.projectId/area restringem em cima do escopo RBAC (nunca o
// substituem — se o projeto do filtro não estiver em scopeProjectIds, vira
// escopo vazio); filters.period restringe pela data de conclusão.
export async function getSlaRate(filters?: DashboardFilters) {
  const user = await requireRole(...PORTFOLIO_METRICS_ROLES);
  let scopeProjectIds = await getMetricsScopeProjectIds(user);

  if (filters?.projectId) {
    scopeProjectIds = scopeProjectIds === null ? [filters.projectId] : scopeProjectIds.filter((id) => id === filters.projectId);
  }
  if (filters?.area) {
    const projectsInArea = await prisma.project.findMany({
      where: {
        area: filters.area,
        deletedAt: null,
        ...(scopeProjectIds !== null ? { id: { in: scopeProjectIds } } : {}),
      },
      select: { id: true },
    });
    scopeProjectIds = projectsInArea.map((p) => p.id);
  }

  if (scopeProjectIds !== null && scopeProjectIds.length === 0) {
    return { portfolio: null as number | null, byProject: [] };
  }

  const [doneActivities, projects] = await Promise.all([
    prisma.activity.findMany({
      where: {
        status: "DONE",
        deletedAt: null,
        ...(scopeProjectIds !== null ? { projectId: { in: scopeProjectIds } } : {}),
        ...(filters?.period ? { completedAt: { gte: periodCutoff(filters.period) } } : {}),
      },
      select: { projectId: true, dueDate: true, completedAt: true },
    }),
    prisma.project.findMany({
      where: {
        deletedAt: null,
        ...(scopeProjectIds !== null ? { id: { in: scopeProjectIds } } : {}),
      },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const portfolio = calcSlaRate(doneActivities);

  const byProject = projects.map((project) => ({
    project,
    slaRate: calcSlaRate(doneActivities.filter((a) => a.projectId === project.id)),
  }));

  return { portfolio, byProject };
}

const WORKLOAD_ACTIVE_STATUSES = ["TODO", "IN_PROGRESS"] as const;

type WorkloadColor = "green" | "amber" | "red";

function workloadColor(relativeLoad: number): WorkloadColor {
  if (relativeLoad <= 0.7) return "green";
  if (relativeLoad <= 1.3) return "amber";
  return "red";
}

// US-029 — REL-003: carga de trabalho ativa por colaborador, normalizada
// dentro do grupo de mesma User.area. BLOCKED não conta como carga ativa
// (representa espera por terceiro, não trabalho em andamento). Colaboradores
// sem área caem num grupo "Sem área" à parte, nunca comparados com quem tem
// área definida.
export async function getWorkloadHeatmap() {
  const user = await requireRole(...PORTFOLIO_METRICS_ROLES);
  const scopeProjectIds = await getMetricsScopeProjectIds(user);

  if (scopeProjectIds !== null && scopeProjectIds.length === 0) {
    return [];
  }

  const members = await prisma.projectMember.findMany({
    where: scopeProjectIds !== null ? { projectId: { in: scopeProjectIds } } : {},
    select: { user: true },
    distinct: ["userId"],
  });

  const activeActivities = await prisma.activity.findMany({
    where: {
      status: { in: [...WORKLOAD_ACTIVE_STATUSES] },
      deletedAt: null,
      assignedToId: { not: null },
      ...(scopeProjectIds !== null ? { projectId: { in: scopeProjectIds } } : {}),
    },
    select: { assignedToId: true },
  });

  const activeCountByUser = new Map<string, number>();
  for (const activity of activeActivities) {
    const id = activity.assignedToId as string;
    activeCountByUser.set(id, (activeCountByUser.get(id) ?? 0) + 1);
  }

  const entries = members.map(({ user: member }) => ({
    user: member,
    area: member.area ?? null,
    activeCount: activeCountByUser.get(member.id) ?? 0,
  }));

  // Agrupa por área ("Sem área" é seu próprio grupo — chave null) e calcula
  // a média do grupo para normalizar a carga relativa de cada colaborador.
  const groups = new Map<string | null, typeof entries>();
  for (const entry of entries) {
    const group = groups.get(entry.area) ?? [];
    group.push(entry);
    groups.set(entry.area, group);
  }

  const result: Array<{
    user: (typeof entries)[number]["user"];
    area: string | null;
    activeCount: number;
    relativeLoad: number;
    color: WorkloadColor;
  }> = [];

  for (const group of groups.values()) {
    const groupAverage =
      group.length === 1
        ? null // grupo de 1 pessoa: sem base de comparação, tratado abaixo como neutro
        : group.reduce((sum, e) => sum + e.activeCount, 0) / group.length;

    for (const entry of group) {
      const relativeLoad = groupAverage === null || groupAverage === 0 ? 1 : entry.activeCount / groupAverage;
      result.push({ ...entry, relativeLoad, color: workloadColor(relativeLoad) });
    }
  }

  return result.sort((a, b) => a.user.name.localeCompare(b.user.name));
}

// US-026 — REL-001: resumo executivo do portfólio para o Dashboard do
// Diretor. Diferente de getSlaRate()/getWorkloadHeatmap() (Onda 2), esta
// action é restrita a admin/director — coordinator não vê o portfólio
// inteiro, só a fatia onde é ProjectMember (blocos da Onda 1).
const EXECUTIVE_SUMMARY_ROLES = ["admin", "director"] as const;

export async function getExecutiveSummary() {
  await requireRole(...EXECUTIVE_SUMMARY_ROLES);

  const [activeProjects, criticalProjectsCount, openEscalationsCount] = await Promise.all([
    prisma.project.findMany({
      where: { status: "ACTIVE", deletedAt: null },
      select: { progress: true },
    }),
    prisma.project.count({
      where: {
        deletedAt: null,
        risks: {
          some: {
            projectId: { not: null },
            level: { in: ["HIGH", "CRITICAL"] },
            status: "OPEN",
          },
        },
      },
    }),
    prisma.win.count({
      where: { escalated: true, status: { not: "DONE" }, deletedAt: null },
    }),
  ]);

  const avgPortfolioProgress =
    activeProjects.length === 0
      ? null
      : Math.round(activeProjects.reduce((sum, p) => sum + p.progress, 0) / activeProjects.length);

  return {
    activeProjectsCount: activeProjects.length,
    criticalProjectsCount,
    avgPortfolioProgress,
    openEscalationsCount,
  };
}
