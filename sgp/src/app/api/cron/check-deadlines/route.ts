import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resend, RESEND_FROM_EMAIL } from "@/lib/resend";
import { DeadlineAlertEmail } from "@/emails/deadline-alert";
import { formatDate } from "@/lib/utils";
import { UPCOMING_DEADLINE_WINDOW_DAYS } from "@/lib/deadlines";

const OPEN_STATUSES = ["TODO", "IN_PROGRESS", "BLOCKED"] as const;

// RN-14: falha no envio de e-mail nunca pode interromper o job.
async function notify(
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
          ? `[SGPA] Atividade atrasada: ${activityTitle}`
          : `[SGPA] Prazo se aproximando: ${activityTitle}`,
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

async function recipientsFor(projectId: string, assignedToEmail?: string) {
  const managers = await prisma.projectMember.findMany({
    where: { projectId, role: "gestor" },
    include: { user: true },
  });
  const emails = new Set(managers.map((m) => m.user.email));
  if (assignedToEmail) emails.add(assignedToEmail);
  return Array.from(emails);
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
    const to = await recipientsFor(activity.projectId, activity.assignedTo?.email);
    await notify(to, activity.title, activity.project.name, activity.dueDate, "overdue");
  }

  for (const activity of upcoming) {
    const to = await recipientsFor(activity.projectId, activity.assignedTo?.email);
    await notify(to, activity.title, activity.project.name, activity.dueDate, "upcoming");
  }

  return NextResponse.json({ overdue: overdue.length, upcoming: upcoming.length });
}
