import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { notify } from "@/lib/notify";

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Não autorizado", { status: 401 });
  }

  const overdueWins = await prisma.win.findMany({
    where: {
      status: { notIn: ["DONE", "CANCELLED"] },
      dueDate: { lt: new Date() },
      escalated: false,
      deletedAt: null,
    },
    include: { user: true, project: true },
  });

  if (overdueWins.length > 0) {
    await prisma.win.updateMany({
      where: { id: { in: overdueWins.map((w) => w.id) } },
      data: { escalated: true },
    });
  }

  // US-050: notifica o dono do WIN e os gestores do projeto (quando houver).
  for (const win of overdueWins) {
    const recipientIds = new Set<string>([win.userId]);
    if (win.projectId) {
      const managers = await prisma.projectMember.findMany({
        where: { projectId: win.projectId, role: "gestor" },
        select: { userId: true },
      });
      for (const m of managers) recipientIds.add(m.userId);
    }

    for (const userId of recipientIds) {
      await notify({
        userId,
        type: "WIN_ESCALATED",
        title: "WIN escalado",
        body: `"${win.title}" (${win.user.name}${win.project ? `, ${win.project.name}` : ""}) foi escalado por falta de conclusão (RN-09).`,
        entityType: "Win",
        entityId: win.id,
        link: "/dashboard/wins",
      });
    }
  }

  return NextResponse.json({ escalated: overdueWins.length });
}
