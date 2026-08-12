"use client";

import { useState } from "react";
import { toast } from "sonner";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { updateMeetingMinutes, addMeetingDecision, removeMeetingDecision } from "@/actions/meetings";
import { formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface MeetingDecision {
  id: string;
  text: string;
  ownerId: string | null;
  dueDate: string | null;
  createdAt: string;
}

interface MinutesDecisionsPanelProps {
  meetingId: string;
  minutes: string | null;
  decisions: MeetingDecision[];
  users: { id: string; name: string }[];
  canEdit: boolean;
}

export function MinutesDecisionsPanel({
  meetingId,
  minutes,
  decisions,
  users,
  canEdit,
}: MinutesDecisionsPanelProps) {
  const [minutesText, setMinutesText] = useState(minutes ?? "");
  const [savingMinutes, setSavingMinutes] = useState(false);

  const [decisionText, setDecisionText] = useState("");
  const [decisionOwnerId, setDecisionOwnerId] = useState("");
  const [decisionDueDate, setDecisionDueDate] = useState("");
  const [addingDecision, setAddingDecision] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const usersById = new Map(users.map((u) => [u.id, u.name]));

  async function handleSaveMinutes() {
    setSavingMinutes(true);
    const result = await updateMeetingMinutes({ meetingId, text: minutesText });
    setSavingMinutes(false);

    if (result.success) {
      toast.success("Ata salva");
    } else {
      toast.error(result.error);
    }
  }

  async function handleAddDecision(e: React.FormEvent) {
    e.preventDefault();
    setAddingDecision(true);

    const result = await addMeetingDecision({
      meetingId,
      text: decisionText,
      ownerId: decisionOwnerId || undefined,
      dueDate: decisionDueDate ? new Date(decisionDueDate) : undefined,
    });

    setAddingDecision(false);

    if (result.success) {
      toast.success("Decisão adicionada");
      setDecisionText("");
      setDecisionOwnerId("");
      setDecisionDueDate("");
    } else {
      toast.error(result.error);
    }
  }

  async function handleRemoveDecision(decisionId: string) {
    setRemovingId(decisionId);
    const result = await removeMeetingDecision({ meetingId, decisionId });
    setRemovingId(null);

    if (!result.success) {
      toast.error(result.error);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-foreground">Ata</h2>
        {canEdit ? (
          <>
            <Textarea
              value={minutesText}
              onChange={(e) => setMinutesText(e.target.value)}
              rows={8}
              placeholder="O que foi discutido na reunião…"
            />
            <div>
              <Button onClick={handleSaveMinutes} disabled={savingMinutes}>
                {savingMinutes ? "Salvando…" : "Salvar ata"}
              </Button>
            </div>
          </>
        ) : minutes ? (
          <p className="whitespace-pre-wrap text-sm text-secondary-foreground">{minutes}</p>
        ) : (
          <p className="text-sm text-muted-foreground">Nenhuma ata registrada ainda.</p>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-foreground">Decisões</h2>

        {decisions.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma decisão registrada ainda.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {decisions.map((decision) => (
              <li
                key={decision.id}
                className="flex items-start justify-between gap-3 rounded-md border border-border px-3 py-2"
              >
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm text-foreground">{decision.text}</span>
                  <span className="text-xs text-muted-foreground">
                    {decision.ownerId ? (usersById.get(decision.ownerId) ?? "—") : "Sem responsável"}
                    {decision.dueDate ? ` · prazo ${formatDate(decision.dueDate)}` : ""}
                  </span>
                </div>
                {canEdit && (
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    disabled={removingId === decision.id}
                    onClick={() => handleRemoveDecision(decision.id)}
                  >
                    <Trash2Icon />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}

        {canEdit && (
          <form onSubmit={handleAddDecision} className="flex flex-col gap-3 rounded-md border border-border p-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="decision-text">Nova decisão</Label>
              <Textarea
                id="decision-text"
                value={decisionText}
                onChange={(e) => setDecisionText(e.target.value)}
                rows={2}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>Responsável (opcional)</Label>
                <Select value={decisionOwnerId} onValueChange={(v) => setDecisionOwnerId(v ?? "")}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Selecione" />
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
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="decision-due">Prazo (opcional)</Label>
                <Input
                  id="decision-due"
                  type="date"
                  value={decisionDueDate}
                  onChange={(e) => setDecisionDueDate(e.target.value)}
                />
              </div>
            </div>
            <div>
              <Button type="submit" disabled={addingDecision} data-icon="inline-start">
                <PlusIcon />
                {addingDecision ? "Adicionando…" : "Adicionar decisão"}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
