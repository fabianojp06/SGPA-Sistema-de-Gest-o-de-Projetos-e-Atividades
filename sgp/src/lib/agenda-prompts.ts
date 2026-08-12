import { prisma } from "@/lib/prisma";
import { getSlaRate } from "@/actions/projects";
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

// US-034: pauta Quinzenal — foco nos WINs escalados (RN-09) do projeto. Por
// RN-17, Win.escalated é a fonte formal de "itens de plano de ação" — não
// existe (nem deve ser referenciada) uma tabela PlanoDeAcao separada.
export async function buildBiweeklyPrompt(meeting: Meeting & { project: { name: string } | null }) {
  if (!meeting.projectId) {
    throw new Error("Reunião Quinzenal sem projeto associado");
  }

  const memberIds = (
    await prisma.projectMember.findMany({
      where: { projectId: meeting.projectId },
      select: { userId: true },
    })
  ).map((m) => m.userId);

  const [escalatedWins, risks, helpRequests] = await Promise.all([
    prisma.win.findMany({
      where: { projectId: meeting.projectId, deletedAt: null, escalated: true },
      include: { user: true },
      orderBy: { repeatCount: "desc" },
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

  const escalatedBlock = escalatedWins.length
    ? escalatedWins
        .map(
          (w) =>
            `- ${w.user.name}: "${w.title}" — sem conclusão há ${w.repeatCount} semanas consecutivas (RN-09)${w.supportName ? `, apoio: ${w.supportName}` : ""}`,
        )
        .join("\n")
    : "Nenhum item escalado neste ciclo.";

  const risksBlock = risks.length
    ? risks.map((r) => `- "${r.title}" (nível ${RISK_LEVEL_LABEL[r.level] ?? r.level}, categoria ${r.category}, status ${r.status})`).join("\n")
    : "Nenhum risco aberto ou em mitigação.";

  const helpBlock = helpRequests.length
    ? helpRequests.map((h) => `- ${h.description} (destinatário: ${h.targetName}${h.dueDate ? `, prazo ${h.dueDate.toLocaleDateString("pt-BR")}` : ""})`).join("\n")
    : "Nenhum pedido de ajuda pendente.";

  return `Você é assistente de um coordenador de projetos gerando a pauta de uma reunião Quinzenal do projeto "${meeting.project?.name}".

Esta reunião existe pra decidir sobre itens travados — o foco é o Plano de Ação (WINs escalados), não o operacional do dia a dia.

WINs escalados (RN-09 — sem conclusão por 3+ semanas):
${escalatedBlock}

Riscos abertos ou em mitigação:
${risksBlock}

Pedidos de ajuda pendentes:
${helpBlock}

Gere a pauta em markdown com as seções "Plano de Ação — itens escalados", "Riscos abertos", "Pedidos de ajuda pendentes". Se não houver itens escalados, deixe isso explícito na seção — é um bom sinal, não omita a seção. Não invente dados que não foram fornecidos.`;
}

// US-035: pauta Mensal — WINs escalados do mês + saúde do projeto (SLA e
// progresso), reaproveitando getSlaRate() já existente (Onda 2).
export async function buildMonthlyPrompt(meeting: Meeting & { project: { name: string; progress: number } | null }) {
  if (!meeting.projectId) {
    throw new Error("Reunião Mensal sem projeto associado");
  }

  const monthStart = new Date(meeting.date.getFullYear(), meeting.date.getMonth(), 1);
  const monthEnd = new Date(meeting.date.getFullYear(), meeting.date.getMonth() + 1, 1);

  const memberIds = (
    await prisma.projectMember.findMany({
      where: { projectId: meeting.projectId },
      select: { userId: true },
    })
  ).map((m) => m.userId);

  const [escalatedWins, risks, helpRequests, slaRate] = await Promise.all([
    prisma.win.findMany({
      where: {
        projectId: meeting.projectId,
        deletedAt: null,
        escalated: true,
        updatedAt: { gte: monthStart, lt: monthEnd },
      },
      include: { user: true },
      orderBy: { repeatCount: "desc" },
    }),
    prisma.risk.findMany({
      where: { projectId: meeting.projectId, status: { in: ["OPEN", "MITIGATING"] } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.helpRequest.findMany({
      where: { userId: { in: memberIds }, resolved: false },
      orderBy: { createdAt: "desc" },
    }),
    getSlaRate({ projectId: meeting.projectId }),
  ]);

  const projectSla = slaRate.byProject.find((p) => p.project.id === meeting.projectId)?.slaRate ?? null;

  const escalatedBlock = escalatedWins.length
    ? escalatedWins
        .map((w) => `- ${w.user.name}: "${w.title}" — sem conclusão há ${w.repeatCount} semanas consecutivas (RN-09)`)
        .join("\n")
    : "Nenhum item escalado neste mês.";

  const risksBlock = risks.length
    ? risks.map((r) => `- "${r.title}" (nível ${RISK_LEVEL_LABEL[r.level] ?? r.level}, categoria ${r.category}, status ${r.status})`).join("\n")
    : "Nenhum risco aberto ou em mitigação.";

  const helpBlock = helpRequests.length
    ? helpRequests.map((h) => `- ${h.description} (destinatário: ${h.targetName}${h.dueDate ? `, prazo ${h.dueDate.toLocaleDateString("pt-BR")}` : ""})`).join("\n")
    : "Nenhum pedido de ajuda pendente.";

  const slaLine =
    projectSla === null
      ? "Sem entregas concluídas neste mês para calcular SLA."
      : `${projectSla}% das atividades concluídas dentro do prazo.`;

  return `Você é assistente de um coordenador de projetos gerando a pauta de uma reunião Mensal do projeto "${meeting.project?.name}".

Saúde do projeto:
- Progresso atual: ${meeting.project?.progress ?? 0}%
- SLA de entrega no mês: ${slaLine}

WINs escalados no mês (RN-09 — Plano de Ação):
${escalatedBlock}

Riscos abertos ou em mitigação:
${risksBlock}

Pedidos de ajuda pendentes:
${helpBlock}

Gere a pauta em markdown com as seções "Saúde do projeto", "Plano de Ação — itens escalados", "Riscos abertos", "Pedidos de ajuda pendentes". Não invente dados que não foram fornecidos.`;
}

// US-045: pauta One-on-One — única reunião sem projeto (RN-16); os dados são
// escopados pelo colaborador (meeting.participantId), não por ProjectMember.
export async function buildOneOnOnePrompt(meeting: Meeting & { participant: { name: string } | null }) {
  if (!meeting.participantId) {
    throw new Error("Reunião One-on-One sem participante associado");
  }

  const since = new Date(meeting.date.getTime() - 14 * 24 * 60 * 60 * 1000);
  const participantName = meeting.participant?.name ?? "colaborador";

  const [wins, risks, helpRequests] = await Promise.all([
    prisma.win.findMany({
      where: { userId: meeting.participantId, deletedAt: null, updatedAt: { gte: since } },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.risk.findMany({
      where: { ownerId: meeting.participantId, status: { in: ["OPEN", "MITIGATING"] } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.helpRequest.findMany({
      where: { userId: meeting.participantId, resolved: false },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const winsBlock = wins.length
    ? wins.map((w) => `- "${w.title}" (${WIN_STATUS_LABEL[w.status] ?? w.status})${w.escalated ? " — ESCALADO" : ""}`).join("\n")
    : "Nenhum WIN nas últimas 2 semanas.";

  const risksBlock = risks.length
    ? risks.map((r) => `- "${r.title}" (nível ${RISK_LEVEL_LABEL[r.level] ?? r.level}, categoria ${r.category}, status ${r.status})`).join("\n")
    : "Nenhum risco aberto ou em mitigação sob responsabilidade dele(a).";

  const helpBlock = helpRequests.length
    ? helpRequests.map((h) => `- ${h.description} (destinatário: ${h.targetName}${h.dueDate ? `, prazo ${h.dueDate.toLocaleDateString("pt-BR")}` : ""})`).join("\n")
    : "Nenhum pedido de ajuda pendente.";

  const hasAnyData = wins.length > 0 || risks.length > 0 || helpRequests.length > 0;

  return `Você é assistente de um coordenador gerando a pauta de uma reunião 1:1 com ${participantName}.

WINs das últimas 2 semanas:
${winsBlock}

Riscos sob responsabilidade dele(a):
${risksBlock}

Pedidos de ajuda pendentes:
${helpBlock}

${hasAnyData ? "" : `Não há nenhuma atualização recente de ${participantName} — gere uma pauta curta com a seção 'Sem atualizações recentes de ${participantName}'.\n`}
Gere a pauta em markdown, tom de conversa individual (não é status de projeto). Não invente dados que não foram fornecidos.`;
}
