import { prisma } from "@/lib/prisma";
import type { Meeting } from "@prisma/client";

const WIN_STATUS_LABEL: Record<string, string> = {
  TODO: "A fazer",
  IN_PROGRESS: "Em andamento",
  DONE: "Concluído",
  BLOCKED: "Bloqueado",
  CANCELLED: "Cancelado",
};

const RISK_LEVEL_LABEL: Record<string, string> = {
  LOW: "Baixo",
  MEDIUM: "Médio",
  HIGH: "Alto",
  CRITICAL: "Crítico",
};

// US-032: WINs atualizados desde a última Daily do mesmo projeto (ou nas
// últimas 24h, se não houver Daily anterior); riscos OPEN e pedidos de ajuda
// pendentes de membros do projeto.
export async function buildDailyPrompt(meeting: Meeting & { project: { name: string } | null }) {
  if (!meeting.projectId) {
    throw new Error("Reunião Daily sem projeto associado");
  }

  const previousDaily = await prisma.meeting.findFirst({
    where: {
      projectId: meeting.projectId,
      type: "DAILY",
      deletedAt: null,
      id: { not: meeting.id },
      date: { lt: meeting.date },
    },
    orderBy: { date: "desc" },
  });

  const since = previousDaily ? previousDaily.date : new Date(meeting.date.getTime() - 24 * 60 * 60 * 1000);

  const memberIds = (
    await prisma.projectMember.findMany({
      where: { projectId: meeting.projectId },
      select: { userId: true },
    })
  ).map((m) => m.userId);

  const [wins, risks, helpRequests] = await Promise.all([
    prisma.win.findMany({
      where: {
        projectId: meeting.projectId,
        deletedAt: null,
        updatedAt: { gte: since },
      },
      include: { user: true },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.risk.findMany({
      where: { projectId: meeting.projectId, status: "OPEN" },
      orderBy: { createdAt: "desc" },
    }),
    prisma.helpRequest.findMany({
      where: { userId: { in: memberIds }, resolved: false },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const winsBlock = wins.length
    ? wins.map((w) => `- ${w.user.name}: "${w.title}" (${WIN_STATUS_LABEL[w.status] ?? w.status})${w.escalated ? " — ESCALADO" : ""}`).join("\n")
    : "Nenhuma atualização registrada.";

  const risksBlock = risks.length
    ? risks.map((r) => `- "${r.title}" (nível ${RISK_LEVEL_LABEL[r.level] ?? r.level}, categoria ${r.category})`).join("\n")
    : "Nenhum risco aberto.";

  const helpBlock = helpRequests.length
    ? helpRequests.map((h) => `- ${h.description} (destinatário: ${h.targetName}${h.dueDate ? `, prazo ${h.dueDate.toLocaleDateString("pt-BR")}` : ""})`).join("\n")
    : "Nenhum pedido de ajuda pendente.";

  const hasAnyData = wins.length > 0 || risks.length > 0 || helpRequests.length > 0;

  return `Você é assistente de um coordenador de projetos gerando a pauta de uma reunião Daily do projeto "${meeting.project?.name}".

Dados desde a última Daily (ou últimas 24h, se for a primeira):

WINs (atualizações de trabalho):
${winsBlock}

Riscos abertos:
${risksBlock}

Pedidos de ajuda pendentes:
${helpBlock}

${hasAnyData ? "" : "Não há nenhuma atualização registrada desde a última Daily — gere uma pauta curta com uma seção 'Sem atualizações desde a última Daily'.\n"}
Gere a pauta em markdown, curta e objetiva (é uma Daily, não uma reunião longa), com tópicos por pessoa/risco/pedido de ajuda. Não invente dados que não foram fornecidos.`;
}

// US-033: WINs da semana da reunião, riscos OPEN/MITIGATING, pedidos de
// ajuda pendentes — todos escopados ao projeto via ProjectMember.
export async function buildWeeklyPrompt(meeting: Meeting & { project: { name: string } | null }) {
  if (!meeting.projectId) {
    throw new Error("Reunião Semanal sem projeto associado");
  }

  const memberIds = (
    await prisma.projectMember.findMany({
      where: { projectId: meeting.projectId },
      select: { userId: true },
    })
  ).map((m) => m.userId);

  const [wins, risks, helpRequests] = await Promise.all([
    prisma.win.findMany({
      where: {
        projectId: meeting.projectId,
        deletedAt: null,
        weekNumber: meeting.weekNumber,
        year: meeting.year,
      },
      include: { user: true },
      orderBy: { user: { name: "asc" } },
    }),
    prisma.risk.findMany({
      where: { projectId: meeting.projectId, status: { in: ["OPEN", "MITIGATING"] } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.helpRequest.findMany({
      where: { userId: { in: memberIds }, resolved: false },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const escalated = wins.filter((w) => w.escalated);
  const regular = wins.filter((w) => !w.escalated);
  const today = new Date();

  const winsBlock = regular.length
    ? regular
        .map(
          (w) =>
            `- ${w.user.name}: "${w.title}" (${WIN_STATUS_LABEL[w.status] ?? w.status}${w.repeatCount > 1 ? `, repetido ${w.repeatCount}x` : ""}${w.supportName ? `, apoio: ${w.supportName}` : ""})`,
        )
        .join("\n")
    : "Nenhum WIN registrado nesta semana.";

  const risksBlock = risks.length
    ? risks.map((r) => `- "${r.title}" (nível ${RISK_LEVEL_LABEL[r.level] ?? r.level}, categoria ${r.category}, status ${r.status})`).join("\n")
    : "Nenhum risco aberto ou em mitigação.";

  const helpBlock = helpRequests.length
    ? helpRequests
        .map(
          (h) =>
            `- ${h.description} (destinatário: ${h.targetName}${h.dueDate ? `, prazo ${h.dueDate.toLocaleDateString("pt-BR")}${h.dueDate < today ? " — ATRASADO" : ""}` : ""})`,
        )
        .join("\n")
    : "Nenhum pedido de ajuda pendente.";

  const escalatedBlock = escalated.length
    ? escalated.map((w) => `- ${w.user.name}: "${w.title}" — sem conclusão há ${w.repeatCount} semanas consecutivas (RN-09)`).join("\n")
    : null;

  const hasAnyData = wins.length > 0 || risks.length > 0 || helpRequests.length > 0;

  return `Você é assistente de um coordenador de projetos gerando a pauta de uma reunião Semanal do projeto "${meeting.project?.name}" (semana ${meeting.weekNumber}/${meeting.year}).

WINs da semana:
${winsBlock}

Riscos abertos ou em mitigação:
${risksBlock}

Pedidos de ajuda pendentes:
${helpBlock}
${escalatedBlock ? `\nWINs escalados (RN-09 — sem conclusão por 3+ semanas):\n${escalatedBlock}\n` : ""}
${hasAnyData ? "" : "Não há nenhum WIN, risco ou pedido de ajuda registrado nesta semana — gere uma pauta curta com uma seção 'Sem atualizações registradas nesta semana'.\n"}
Gere a pauta em markdown com as seções, nesta ordem: "Destaques da semana", "Riscos abertos", "Pedidos de ajuda pendentes"${escalatedBlock ? ', "Escalados — atenção"' : ""}. Não invente dados que não foram fornecidos.`;
}
