import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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
  });

  if (overdueWins.length > 0) {
    await prisma.win.updateMany({
      where: { id: { in: overdueWins.map((w) => w.id) } },
      data: { escalated: true },
    });
  }

  return NextResponse.json({ escalated: overdueWins.length });
}
