import Link from "next/link";
import { getMeetings } from "@/actions/meetings";
import { getProjects } from "@/actions/projects";
import { getActiveUsers } from "@/actions/users";
import { MeetingFormDialog } from "@/components/meetings/meeting-form-dialog";
import { DeleteMeetingButton } from "@/components/meetings/delete-meeting-button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate } from "@/lib/utils";

const TYPE_LABEL: Record<string, string> = {
  DAILY: "Daily",
  WEEKLY: "Semanal",
  BIWEEKLY: "Quinzenal",
  MONTHLY: "Mensal",
  ONE_ON_ONE: "One-on-One",
};

const MEETING_TYPES = ["DAILY", "WEEKLY", "BIWEEKLY", "MONTHLY", "ONE_ON_ONE"] as const;

interface PautasPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function PautasPage({ searchParams }: PautasPageProps) {
  const params = await searchParams;
  const typeParam = Array.isArray(params.tipo) ? params.tipo[0] : params.tipo;
  const projectIdParam = Array.isArray(params.projeto) ? params.projeto[0] : params.projeto;
  const fromParam = Array.isArray(params.de) ? params.de[0] : params.de;
  const toParam = Array.isArray(params.ate) ? params.ate[0] : params.ate;

  const type = MEETING_TYPES.includes(typeParam as (typeof MEETING_TYPES)[number])
    ? (typeParam as (typeof MEETING_TYPES)[number])
    : undefined;

  const [meetings, projects, users] = await Promise.all([
    getMeetings({
      type,
      projectId: projectIdParam || undefined,
      from: fromParam ? new Date(fromParam) : undefined,
      to: toParam ? new Date(toParam) : undefined,
    }),
    getProjects(),
    getActiveUsers(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Pautas</h1>
          <p className="text-muted-foreground">
            {meetings.length} reunião{meetings.length === 1 ? "" : "ões"} registrada
            {meetings.length === 1 ? "" : "s"}.
          </p>
        </div>
        <MeetingFormDialog projects={projects} users={users} />
      </div>

      <form className="flex flex-wrap items-end gap-3" method="get">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="tipo" className="text-xs text-muted-foreground">Tipo</label>
          <select
            id="tipo"
            name="tipo"
            defaultValue={type ?? ""}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">Todos</option>
            {MEETING_TYPES.map((t) => (
              <option key={t} value={t}>
                {TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="projeto" className="text-xs text-muted-foreground">Projeto</label>
          <select
            id="projeto"
            name="projeto"
            defaultValue={projectIdParam ?? ""}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">Todos</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="de" className="text-xs text-muted-foreground">De</label>
          <input id="de" name="de" type="date" defaultValue={fromParam ?? ""} className="h-9 rounded-md border border-input bg-background px-3 text-sm" />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="ate" className="text-xs text-muted-foreground">Até</label>
          <input id="ate" name="ate" type="date" defaultValue={toParam ?? ""} className="h-9 rounded-md border border-input bg-background px-3 text-sm" />
        </div>
        <button type="submit" className="h-9 rounded-md border border-input px-3 text-sm text-secondary-foreground hover:bg-sidebar-accent">
          Filtrar
        </button>
      </form>

      <Card>
        <CardContent>
          {meetings.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhuma reunião registrada ainda.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Projeto / Participante</TableHead>
                  <TableHead>Criada por</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {meetings.map((meeting) => (
                  <TableRow key={meeting.id}>
                    <TableCell className="font-mono">{formatDate(meeting.date)}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{TYPE_LABEL[meeting.type]}</Badge>
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/dashboard/reunioes/pautas/${meeting.id}`}
                        className="text-accent hover:underline"
                      >
                        {meeting.project?.name ?? meeting.participant?.name ?? "—"}
                      </Link>
                    </TableCell>
                    <TableCell>{meeting.createdBy.name}</TableCell>
                    <TableCell>
                      <DeleteMeetingButton id={meeting.id} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
