import { NextResponse } from "next/server";
import { getMeeting } from "@/actions/meetings";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/actions/audit";
import { requireDbUser } from "@/lib/auth";
import { buildMeetingAgendaPdf } from "@/lib/meeting-pdf";

interface AgendaContent {
  text: string;
  generatedAt: string;
  model: string;
  generatedById: string;
}

const TYPE_SLUG: Record<string, string> = {
  DAILY: "daily",
  WEEKLY: "semanal",
  BIWEEKLY: "quinzenal",
  MONTHLY: "mensal",
  ONE_ON_ONE: "one-on-one",
};

// US-043: exporta a pauta já gerada (Meeting.agenda.text) como PDF. Mesmo
// escopo de leitura de getMeeting() — quem não pode ver a reunião recebe 404
// (não 403, pra não revelar que a reunião existe a quem não tem acesso).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireDbUser();
    const { id } = await params;

    const meeting = await getMeeting(id);
    if (!meeting) {
      return NextResponse.json({ error: "Reunião não encontrada" }, { status: 404 });
    }

    const agenda = meeting.agenda as unknown as AgendaContent | null;
    if (!agenda) {
      return NextResponse.json({ error: "Gere a pauta antes de exportar" }, { status: 400 });
    }

    const generatedBy = await prisma.user.findUnique({ where: { id: agenda.generatedById } });

    const pdfBytes = await buildMeetingAgendaPdf({
      type: meeting.type,
      date: meeting.date,
      agenda,
      project: meeting.project,
      participant: meeting.participant,
      generatedByName: generatedBy?.name ?? "—",
    });

    await logAudit({
      userId: user.id,
      action: "export_pdf",
      entity: "Meeting",
      entityId: meeting.id,
      after: { format: "pdf" },
    });

    const dateSlug = meeting.date.toISOString().slice(0, 10);
    const filename = `pauta-${TYPE_SLUG[meeting.type] ?? meeting.type.toLowerCase()}-${dateSlug}.pdf`;

    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("[route:exportMeetingAgendaPdf]", error);
    return NextResponse.json(
      { error: "Não foi possível exportar a pauta agora. Tente novamente." },
      { status: 500 },
    );
  }
}
