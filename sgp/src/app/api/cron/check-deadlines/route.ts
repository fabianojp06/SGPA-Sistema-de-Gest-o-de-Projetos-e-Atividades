import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resend, RESEND_FROM_EMAIL } from "@/lib/resend";
import { DeadlineAlertEmail } from "@/emails/deadline-alert";
import { formatDate } from "@/lib/utils";
import { UPCOMING_DEADLINE_WINDOW_DAYS } from "@/lib/deadlines";
import { notify } from "@/lib/notify";

const OPEN_STATUSES = ["TODO", "IN_PROGRESS", "BLOCKED"] as const;

// RN-14: falha no envio de e-mail nunca pode interromper o job (nem a
// gravação da notificação in-app, e vice-versa).
async function sendDeadlineEmail(
  to: string[],
  activityTitle: string,
  projectName: string,
  dueDate: Date,
  kind: "overdue" | "upcoming",
) {
  if (to.length === 0) return;
  try {
    await resend.emails.send({
      from: RESEND_FROM_EMAIL,
      to,
      subject:
        kind === "overdue"
          ? `[GiaFlow] Atividade atrasada: ${activityTitle}`
          : `[GiaFlow] Prazo se aproximando: ${activityTitle}`,
      react: DeadlineAlertEmail({
        activityTitle,
        projectName,
        dueDate: formatDate(dueDate),
        kind,
      }),
    });
  } catch (error) {
    console.error("[cron:check-deadlines] falha ao enviar e-mail", error);
  }
}

interface Recipient {
  id: string;
  email: string;
}

async function recipientsFor(projectId: string, assignedTo: Recipient | null): Promise<Recipient[]> {
  const managers = await prisma.projectMember.findMany({
    where: { projectId, role: "gestor" },
    include: { user: true },
  });
  const byId = new Map<string, Recipient>(managers.map((m) => [m.user.id, m.user]));
  if (assignedTo) byId.set(assignedTo.id, assignedTo);
  return Array.from(byId.values());
}

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Não autorizado", { status: 401 });
  }

  const now = new Date();
  const upcomingLimit = new Date(
    now.getTime() + UPCOMING_DEADLINE_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  );

  const [overdue, upcoming] = await Promise.all([
    prisma.activity.findMany({
      where: { status: { in: [...OPEN_STATUSES] }, dueDate: { lt: now }, deletedAt: null },
      include: { assignedTo: true, project: true },
    }),
    prisma.activity.findMany({
      where: {
        status: { in: [...OPEN_STATUSES] },
        dueDate: { gte: now, lte: upcomingLimit },
        deletedAt: null,
      },
      include: { assignedTo: true, project: true },
    }),
  ]);

  for (const activity of overdue) {
    const recipients = await recipientsFor(activity.projectId, activity.assignedTo);
    await sendDeadlineEmail(
      recipients.map((r) => r.email),
      activity.title,
      activity.project.name,
      activity.dueDate,
      "overdue",
    );
    for (const recipient of recipients) {
      await notify({
        userId: recipient.id,
        type: "ACTIVITY_OVERDUE",
        title: "Atividade atrasada",
        body: `"${activity.title}" (${activity.project.name}) está atrasada desde ${formatDate(activity.dueDate)}.`,
        entityType: "Activity",
        entityId: activity.id,
        link: `/dashboard/projetos/${activity.projectId}`,
      });
    }
  }

  for (const activity of upcoming) {
    const recipients = await recipientsFor(activity.projectId, activity.assignedTo);
    await sendDeadlineEmail(
      recipients.map((r) => r.email),
      activity.title,
      activity.project.name,
      activity.dueDate,
      "upcoming",
    );
    for (const recipient of recipients) {
      await notify({
        userId: recipient.id,
        type: "ACTIVITY_DUE_SOON",
        title: "Prazo se aproximando",
        body: `"${activity.title}" (${activity.project.name}) vence em ${formatDate(activity.dueDate)}.`,
        entityType: "Activity",
        entityId: activity.id,
        link: `/dashboard/projetos/${activity.projectId}`,
      });
    }
  }

  return NextResponse.json({ overdue: overdue.length, upcoming: upcoming.length });
}
