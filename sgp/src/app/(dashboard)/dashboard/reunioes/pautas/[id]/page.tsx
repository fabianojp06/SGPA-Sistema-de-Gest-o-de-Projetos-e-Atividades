import { notFound } from "next/navigation";
import { getMeeting } from "@/actions/meetings";
import { requireDbUser } from "@/lib/auth";
import { AgendaPanel } from "@/components/meetings/agenda-panel";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";

const TYPE_LABEL: Record<string, string> = {
  DAILY: "Daily",
  WEEKLY: "Semanal",
  BIWEEKLY: "Quinzenal",
  MONTHLY: "Mensal",
  ONE_ON_ONE: "One-on-One",
};

// US-032/033: geração de pauta via IA só está disponível para estes tipos
// nesta onda; os demais ficam para a Onda 10.
const AGENDA_SUPPORTED_TYPES = ["DAILY", "WEEKLY"];
const MANAGER_ROLES = ["admin", "director", "coordinator"];

interface AgendaContent {
  text: string;
  generatedAt: string;
  model: string;
  generatedById: string;
}

export default async function MeetingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [meeting, user] = await Promise.all([getMeeting(id), requireDbUser()]);

  if (!meeting) notFound();

  const canGenerate =
    MANAGER_ROLES.includes(user.role) && AGENDA_SUPPORTED_TYPES.includes(meeting.type);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold text-foreground">
            Reunião {TYPE_LABEL[meeting.type]}
          </h1>
          <Badge variant="outline">{TYPE_LABEL[meeting.type]}</Badge>
        </div>
        <p className="text-muted-foreground">
          {meeting.project?.name ?? meeting.participant?.name ?? "—"} · {formatDate(meeting.date)} · criada
          por {meeting.createdBy.name}
        </p>
      </div>

      <Card>
        <CardContent>
          <AgendaPanel
            meetingId={meeting.id}
            agenda={meeting.agenda as unknown as AgendaContent | null}
            canGenerate={canGenerate}
          />
        </CardContent>
      </Card>
    </div>
  );
}
