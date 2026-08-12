"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireDbUser, requireRole } from "@/lib/auth";
import { logAudit } from "@/actions/audit";
import { toActionError } from "@/lib/action-error";
import { revalidatePath } from "next/cache";

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
