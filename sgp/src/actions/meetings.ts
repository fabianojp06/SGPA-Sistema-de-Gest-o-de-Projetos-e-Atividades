"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireDbUser, requireRole } from "@/lib/auth";
import { logAudit } from "@/actions/audit";
import { toActionError } from "@/lib/action-error";
import { generateAgendaText, AGENDA_MODEL_NAME } from "@/lib/anthropic";
import { buildDailyPrompt, buildWeeklyPrompt } from "@/lib/agenda-prompts";
import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";

// US-032/033: tipos de reunião com geração de pauta via IA implementada
// nesta onda. BIWEEKLY/MONTHLY/ONE_ON_ONE ficam para a Onda 10.
const AGENDA_SUPPORTED_TYPES = ["DAILY", "WEEKLY"] as const;

interface AgendaContent {
  text: string;
  generatedAt: string;
  model: string;
  generatedById: string;
}

// US-044: item de Meeting.decisions (Json array). ownerId aponta para User
// (nunca texto livre) e é opcional — nem toda decisão tem responsável formal.
interface MeetingDecision {
  id: string;
  text: string;
  ownerId: string | null;
  dueDate: string | null;
  createdAt: string;
}

const MEETING_MANAGER_ROLES = ["admin", "director", "coordinator"] as const;

const COLLECTIVE_TYPES = ["DAILY", "WEEKLY", "BIWEEKLY", "MONTHLY"] as const;

// RN-16: vínculo obrigatório mutuamente exclusivo — projeto para tipos
// coletivos, participante para ONE_ON_ONE.
const meetingSchema = z
  .object({
    type: z.enum(["DAILY", "WEEKLY", "BIWEEKLY", "MONTHLY", "ONE_ON_ONE"]),
    date: z.coerce.date(),
    weekNumber: z.coerce.number().int().min(1).max(53),
    year: z.coerce.number().int(),
    projectId: z.string().optional(),
    participantId: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.type === "ONE_ON_ONE") {
      if (!data.participantId) {
        ctx.addIssue({
          code: "custom",
          path: ["participantId"],
          message: "Selecione o participante desta reunião One-on-One",
        });
      }
    } else if (!data.projectId) {
      ctx.addIssue({
        code: "custom",
        path: ["projectId"],
        message: "Selecione o projeto desta reunião",
      });
    }
  });

// Mesmo critério de "sob gestão" usado nos dashboards (Ondas 1-4): admin/
// director enxergam todo o portfólio, coordinator só os projetos onde é
// ProjectMember.
async function assertProjectAccess(user: { id: string; role: string }, projectId: string) {
  if (user.role === "admin" || user.role === "director") return;

  const membership = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId: user.id } },
  });
  if (!membership) {
    throw new Error("Você não tem acesso a este projeto");
  }
}

interface MeetingFilters {
  type?: (typeof COLLECTIVE_TYPES)[number] | "ONE_ON_ONE";
  projectId?: string;
  from?: Date;
  to?: Date;
}

export async function getMeetings(filters?: MeetingFilters) {
  const user = await requireDbUser();
  const isGlobal = user.role === "admin" || user.role === "director";

  const managedProjectIds = isGlobal
    ? null
    : (
        await prisma.projectMember.findMany({
          where: { userId: user.id },
          select: { projectId: true },
        })
      ).map((m) => m.projectId);

  return prisma.meeting.findMany({
    where: {
      deletedAt: null,
      ...(filters?.type ? { type: filters.type } : {}),
      ...(filters?.from || filters?.to
        ? {
            date: {
              ...(filters?.from ? { gte: filters.from } : {}),
              ...(filters?.to ? { lte: filters.to } : {}),
            },
          }
        : {}),
      OR: [
        {
          projectId: filters?.projectId
            ? filters.projectId
            : managedProjectIds !== null
              ? { in: managedProjectIds }
              : { not: null },
        },
        { participantId: user.id },
        ...(isGlobal ? [{ type: "ONE_ON_ONE" as const }] : []),
      ],
    },
    include: { project: true, participant: true, createdBy: true },
    orderBy: { date: "desc" },
  });
}

// Mesmo escopo de visibilidade de getMeetings(), para uma única reunião:
// admin/director veem qualquer uma; coordinator/technician só as do(s)
// projeto(s) onde são ProjectMember, ou a própria One-on-One.
export async function getMeeting(id: string) {
  const user = await requireDbUser();
  const isGlobal = user.role === "admin" || user.role === "director";

  const meeting = await prisma.meeting.findUnique({
    where: { id, deletedAt: null },
    include: { project: true, participant: true, createdBy: true },
  });
  if (!meeting) return null;

  if (isGlobal || meeting.participantId === user.id) return meeting;

  if (meeting.projectId) {
    const membership = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId: meeting.projectId, userId: user.id } },
    });
    if (membership) return meeting;
  }

  return null;
}

export async function createMeeting(input: z.infer<typeof meetingSchema>) {
  try {
    const user = await requireRole(...MEETING_MANAGER_ROLES);
    const data = meetingSchema.parse(input);

    if (data.type === "ONE_ON_ONE") {
      // participantId presence already validated by schema
    } else if (data.projectId) {
      await assertProjectAccess(user, data.projectId);
    }

    const meeting = await prisma.meeting.create({
      data: {
        type: data.type,
        date: data.date,
        weekNumber: data.weekNumber,
        year: data.year,
        projectId: data.type === "ONE_ON_ONE" ? null : (data.projectId ?? null),
        participantId: data.type === "ONE_ON_ONE" ? (data.participantId ?? null) : null,
        createdById: user.id,
      },
    });

    await logAudit({
      userId: user.id,
      action: "create",
      entity: "Meeting",
      entityId: meeting.id,
      after: meeting,
    });

    revalidatePath("/dashboard/reunioes/pautas");
    return { success: true as const, meeting };
  } catch (error) {
    return {
      success: false as const,
      error: toActionError(error, "Não foi possível criar a reunião", "createMeeting"),
    };
  }
}

const deleteMeetingSchema = z.object({ id: z.string() });

export async function deleteMeeting(input: z.infer<typeof deleteMeetingSchema>) {
  try {
    const user = await requireRole(...MEETING_MANAGER_ROLES);
    const { id } = deleteMeetingSchema.parse(input);

    const before = await prisma.meeting.findUniqueOrThrow({ where: { id } });
    if (before.projectId) {
      await assertProjectAccess(user, before.projectId);
    }

    const meeting = await prisma.meeting.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    await logAudit({
      userId: user.id,
      action: "delete",
      entity: "Meeting",
      entityId: meeting.id,
      before,
      after: meeting,
    });

    revalidatePath("/dashboard/reunioes/pautas");
    return { success: true as const };
  } catch (error) {
    return {
      success: false as const,
      error: toActionError(error, "Não foi possível excluir a reunião", "deleteMeeting"),
    };
  }
}

const generateAgendaSchema = z.object({ meetingId: z.string() });

// US-032/033: gera a pauta via Anthropic API. Sempre sobrescreve quando
// chamada — a confirmação de "já existe pauta, substituir?" é responsabilidade
// da UI, não uma trava do backend. Nunca grava estado parcial: só chega no
// prisma.meeting.update depois que o texto foi obtido com sucesso.
export async function generateAgenda(input: z.infer<typeof generateAgendaSchema>) {
  try {
    const user = await requireRole(...MEETING_MANAGER_ROLES);
    const { meetingId } = generateAgendaSchema.parse(input);

    const meeting = await prisma.meeting.findUniqueOrThrow({
      where: { id: meetingId, deletedAt: null },
      include: { project: true },
    });

    if (!AGENDA_SUPPORTED_TYPES.includes(meeting.type as (typeof AGENDA_SUPPORTED_TYPES)[number])) {
      throw new Error("Geração de pauta por IA ainda não disponível para este tipo de reunião");
    }
    if (meeting.projectId) {
      await assertProjectAccess(user, meeting.projectId);
    }

    const prompt =
      meeting.type === "DAILY" ? await buildDailyPrompt(meeting) : await buildWeeklyPrompt(meeting);

    let text: string;
    try {
      text = await generateAgendaText(prompt);
    } catch (aiError) {
      console.error("[action:generateAgenda] Anthropic API failed", aiError);
      throw new Error("Não foi possível gerar a pauta agora. Tente novamente.");
    }

    const agenda: AgendaContent = {
      text,
      generatedAt: new Date().toISOString(),
      model: AGENDA_MODEL_NAME,
      generatedById: user.id,
    };

    const updated = await prisma.meeting.update({
      where: { id: meetingId },
      data: { agenda: agenda as unknown as Prisma.InputJsonValue },
    });

    await logAudit({
      userId: user.id,
      action: "generate_agenda",
      entity: "Meeting",
      entityId: meetingId,
      before: meeting.agenda as Prisma.InputJsonValue | null,
      after: agenda as unknown as Prisma.InputJsonValue,
    });

    revalidatePath(`/dashboard/reunioes/pautas/${meetingId}`);
    return { success: true as const, meeting: updated };
  } catch (error) {
    return {
      success: false as const,
      error: toActionError(error, "Não foi possível gerar a pauta agora. Tente novamente.", "generateAgenda"),
    };
  }
}

const updateAgendaSchema = z.object({
  meetingId: z.string(),
  text: z.string().min(1, "A pauta não pode ficar vazia"),
});

// Edição manual do texto gerado — mantém generatedAt/model originais (é a
// mesma geração, só com o texto ajustado pelo coordenador).
export async function updateMeetingAgenda(input: z.infer<typeof updateAgendaSchema>) {
  try {
    const user = await requireRole(...MEETING_MANAGER_ROLES);
    const { meetingId, text } = updateAgendaSchema.parse(input);

    const meeting = await prisma.meeting.findUniqueOrThrow({ where: { id: meetingId, deletedAt: null } });
    if (meeting.projectId) {
      await assertProjectAccess(user, meeting.projectId);
    }

    const previous = meeting.agenda as unknown as AgendaContent | null;
    const agenda: AgendaContent = {
      text,
      generatedAt: previous?.generatedAt ?? new Date().toISOString(),
      model: previous?.model ?? AGENDA_MODEL_NAME,
      generatedById: previous?.generatedById ?? user.id,
    };

    const updated = await prisma.meeting.update({
      where: { id: meetingId },
      data: { agenda: agenda as unknown as Prisma.InputJsonValue },
    });

    await logAudit({
      userId: user.id,
      action: "update_agenda",
      entity: "Meeting",
      entityId: meetingId,
      before: meeting.agenda as Prisma.InputJsonValue | null,
      after: agenda as unknown as Prisma.InputJsonValue,
    });

    revalidatePath(`/dashboard/reunioes/pautas/${meetingId}`);
    return { success: true as const, meeting: updated };
  } catch (error) {
    return {
      success: false as const,
      error: toActionError(error, "Não foi possível salvar a pauta", "updateMeetingAgenda"),
    };
  }
}

const updateMinutesSchema = z.object({
  meetingId: z.string(),
  text: z.string(),
});

// US-044: ata da reunião — texto livre, preenchido depois que ela aconteceu.
// Mesmo RBAC de quem edita a pauta (coordinator/director/admin).
export async function updateMeetingMinutes(input: z.infer<typeof updateMinutesSchema>) {
  try {
    const user = await requireRole(...MEETING_MANAGER_ROLES);
    const { meetingId, text } = updateMinutesSchema.parse(input);

    const meeting = await prisma.meeting.findUniqueOrThrow({ where: { id: meetingId, deletedAt: null } });
    if (meeting.projectId) {
      await assertProjectAccess(user, meeting.projectId);
    }

    const updated = await prisma.meeting.update({
      where: { id: meetingId },
      data: { minutes: text },
    });

    await logAudit({
      userId: user.id,
      action: "update_minutes",
      entity: "Meeting",
      entityId: meetingId,
      before: meeting.minutes,
      after: text,
    });

    revalidatePath(`/dashboard/reunioes/pautas/${meetingId}`);
    return { success: true as const, meeting: updated };
  } catch (error) {
    return {
      success: false as const,
      error: toActionError(error, "Não foi possível salvar a ata", "updateMeetingMinutes"),
    };
  }
}

const addDecisionSchema = z.object({
  meetingId: z.string(),
  text: z.string().min(1, "O texto da decisão é obrigatório"),
  ownerId: z.string().optional(),
  dueDate: z.coerce.date().optional(),
});

export async function addMeetingDecision(input: z.infer<typeof addDecisionSchema>) {
  try {
    const user = await requireRole(...MEETING_MANAGER_ROLES);
    const { meetingId, text, ownerId, dueDate } = addDecisionSchema.parse(input);

    const meeting = await prisma.meeting.findUniqueOrThrow({ where: { id: meetingId, deletedAt: null } });
    if (meeting.projectId) {
      await assertProjectAccess(user, meeting.projectId);
    }

    const before = (meeting.decisions as unknown as MeetingDecision[] | null) ?? [];
    const decision: MeetingDecision = {
      id: crypto.randomUUID(),
      text,
      ownerId: ownerId ?? null,
      dueDate: dueDate ? dueDate.toISOString() : null,
      createdAt: new Date().toISOString(),
    };
    const after = [...before, decision];

    const updated = await prisma.meeting.update({
      where: { id: meetingId },
      data: { decisions: after as unknown as Prisma.InputJsonValue },
    });

    await logAudit({
      userId: user.id,
      action: "add_decision",
      entity: "Meeting",
      entityId: meetingId,
      before: before as unknown as Prisma.InputJsonValue,
      after: after as unknown as Prisma.InputJsonValue,
    });

    revalidatePath(`/dashboard/reunioes/pautas/${meetingId}`);
    return { success: true as const, meeting: updated };
  } catch (error) {
    return {
      success: false as const,
      error: toActionError(error, "Não foi possível adicionar a decisão", "addMeetingDecision"),
    };
  }
}

const removeDecisionSchema = z.object({
  meetingId: z.string(),
  decisionId: z.string(),
});

export async function removeMeetingDecision(input: z.infer<typeof removeDecisionSchema>) {
  try {
    const user = await requireRole(...MEETING_MANAGER_ROLES);
    const { meetingId, decisionId } = removeDecisionSchema.parse(input);

    const meeting = await prisma.meeting.findUniqueOrThrow({ where: { id: meetingId, deletedAt: null } });
    if (meeting.projectId) {
      await assertProjectAccess(user, meeting.projectId);
    }

    const before = (meeting.decisions as unknown as MeetingDecision[] | null) ?? [];
    const after = before.filter((d) => d.id !== decisionId);

    const updated = await prisma.meeting.update({
      where: { id: meetingId },
      data: { decisions: after as unknown as Prisma.InputJsonValue },
    });

    await logAudit({
      userId: user.id,
      action: "remove_decision",
      entity: "Meeting",
      entityId: meetingId,
      before: before as unknown as Prisma.InputJsonValue,
      after: after as unknown as Prisma.InputJsonValue,
    });

    revalidatePath(`/dashboard/reunioes/pautas/${meetingId}`);
    return { success: true as const, meeting: updated };
  } catch (error) {
    return {
      success: false as const,
      error: toActionError(error, "Não foi possível remover a decisão", "removeMeetingDecision"),
    };
  }
}
