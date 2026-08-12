import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";

const PAGE_SIZE: [number, number] = [595.28, 841.89]; // A4
const MARGIN = 50;
const CONTENT_WIDTH = PAGE_SIZE[0] - MARGIN * 2;

interface AgendaContent {
  text: string;
  generatedAt: string;
  model: string;
  generatedById: string;
}

interface MeetingForPdf {
  type: string;
  date: Date;
  agenda: AgendaContent;
  project: { name: string } | null;
  participant: { name: string } | null;
  generatedByName: string;
}

const TYPE_LABEL: Record<string, string> = {
  DAILY: "Daily",
  WEEKLY: "Semanal",
  BIWEEKLY: "Quinzenal",
  MONTHLY: "Mensal",
  ONE_ON_ONE: "One-on-One",
};

function wrapLine(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

export async function buildMeetingAgendaPdf(meeting: MeetingForPdf): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const regularFont = await doc.embedFont(StandardFonts.Helvetica);
  const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);

  let page = doc.addPage(PAGE_SIZE);
  let y = PAGE_SIZE[1] - MARGIN;

  function newPageIfNeeded(lineHeight: number) {
    if (y - lineHeight < MARGIN) {
      page = doc.addPage(PAGE_SIZE);
      y = PAGE_SIZE[1] - MARGIN;
    }
  }

  function drawText(text: string, font: PDFFont, size: number, color = rgb(0.1, 0.1, 0.1)) {
    for (const line of wrapLine(text, font, size, CONTENT_WIDTH)) {
      newPageIfNeeded(size + 6);
      page.drawText(line, { x: MARGIN, y, size, font, color });
      y -= size + 6;
    }
  }

  const subject = meeting.project?.name ?? meeting.participant?.name ?? "—";
  drawText(`Reunião ${TYPE_LABEL[meeting.type] ?? meeting.type}`, boldFont, 18);
  y -= 4;
  drawText(subject, regularFont, 12, rgb(0.3, 0.3, 0.3));
  drawText(`Data: ${meeting.date.toLocaleDateString("pt-BR")}`, regularFont, 10, rgb(0.4, 0.4, 0.4));
  drawText(
    `Gerado por: ${meeting.generatedByName} em ${new Date(meeting.agenda.generatedAt).toLocaleString("pt-BR")}`,
    regularFont,
    10,
    rgb(0.4, 0.4, 0.4),
  );
  y -= 10;
  newPageIfNeeded(1);
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: PAGE_SIZE[0] - MARGIN, y },
    thickness: 1,
    color: rgb(0.8, 0.8, 0.8),
  });
  y -= 20;

  // Renderização simples de markdown: "# "/"## " viram títulos, "- "/"* "
  // viram bullet com indentação, o resto é parágrafo comum.
  const lines = meeting.agenda.text.split("\n");
  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line.trim()) {
      y -= 8;
      continue;
    }

    const headingMatch = line.match(/^(#{1,3})\s+(.*)$/);
    if (headingMatch) {
      y -= 6;
      drawText(headingMatch[2], boldFont, 13);
      continue;
    }

    const bulletMatch = line.match(/^[-*]\s+(.*)$/);
    if (bulletMatch) {
      newPageIfNeeded(11 + 6);
      const bulletLines = wrapLine(bulletMatch[1], regularFont, 11, CONTENT_WIDTH - 14);
      bulletLines.forEach((bl, i) => {
        newPageIfNeeded(17);
        page.drawText(i === 0 ? "•" : "", { x: MARGIN, y, size: 11, font: regularFont });
        page.drawText(bl, { x: MARGIN + 14, y, size: 11, font: regularFont });
        y -= 17;
      });
      continue;
    }

    drawText(line, regularFont, 11);
  }

  return doc.save();
}
