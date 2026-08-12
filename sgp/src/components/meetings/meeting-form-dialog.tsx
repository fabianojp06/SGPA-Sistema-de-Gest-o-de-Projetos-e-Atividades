"use client";

import { useState } from "react";
import { toast } from "sonner";
import { PlusIcon } from "lucide-react";
import { createMeeting } from "@/actions/meetings";
import { getCurrentWeek } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const TYPES = [
  { value: "DAILY", label: "Daily" },
  { value: "WEEKLY", label: "Semanal" },
  { value: "BIWEEKLY", label: "Quinzenal" },
  { value: "MONTHLY", label: "Mensal" },
  { value: "ONE_ON_ONE", label: "One-on-One" },
] as const;

type MeetingType = (typeof TYPES)[number]["value"];

interface MeetingFormDialogProps {
  projects: { id: string; name: string }[];
  users: { id: string; name: string }[];
}

export function MeetingFormDialog({ projects, users }: MeetingFormDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [type, setType] = useState<MeetingType>("WEEKLY");
  const [date, setDate] = useState("");
  const [projectId, setProjectId] = useState("");
  const [participantId, setParticipantId] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    const { week, year } = getCurrentWeek();
    const result = await createMeeting({
      type,
      date: new Date(date),
      weekNumber: week,
      year,
      projectId: type === "ONE_ON_ONE" ? undefined : projectId || undefined,
      participantId: type === "ONE_ON_ONE" ? participantId || undefined : undefined,
    });

    setLoading(false);

    if (result.success) {
      toast.success("Reunião criada");
      setOpen(false);
      setDate("");
      setProjectId("");
      setParticipantId("");
    } else {
      toast.error(result.error);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button data-icon="inline-start"><PlusIcon />Nova reunião</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova reunião</DialogTitle>
          <DialogDescription>
            Cria o registro da reunião — a pauta é preenchida depois.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>Tipo</Label>
            <Select value={type} onValueChange={(v) => setType(v as MeetingType)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Selecione o tipo" />
              </SelectTrigger>
              <SelectContent>
                {TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {type === "ONE_ON_ONE" ? (
            <div className="flex flex-col gap-1.5">
              <Label>Participante</Label>
              <Select value={participantId} onValueChange={(v) => setParticipantId(v ?? "")}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecione o colaborador" />
                </SelectTrigger>
                <SelectContent>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              <Label>Projeto</Label>
              <Select value={projectId} onValueChange={(v) => setProjectId(v ?? "")}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecione o projeto" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="meeting-date">Data</Label>
            <Input
              id="meeting-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </div>

          <DialogFooter>
            <Button type="submit" disabled={loading}>
              {loading ? "Salvando…" : "Salvar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
