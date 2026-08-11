"use client";

import { useState } from "react";
import { toast } from "sonner";
import { updateActivityProgress, updateActivityStatus } from "@/actions/activities";
import type { Activity, User } from "@prisma/client";
import { TableCell, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDate } from "@/lib/utils";
import { UPCOMING_DEADLINE_WINDOW_DAYS } from "@/lib/deadlines";
import { ActivityDetailsDialog } from "@/components/activities/activity-details-dialog";

const OPEN_STATUSES = new Set(["TODO", "IN_PROGRESS", "BLOCKED"]);

// US-014/US-015: sinalização visual de atraso e prazo próximo (RN-08).
function deadlineFlag(dueDate: Date, status: string) {
  if (!OPEN_STATUSES.has(status)) return null;
  const now = Date.now();
  const due = new Date(dueDate).getTime();
  if (due < now) return { label: "Atrasada", variant: "destructive" as const };
  const windowMs = UPCOMING_DEADLINE_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  if (due - now <= windowMs) return { label: "Prazo próximo", variant: "outline" as const };
  return null;
}

const STATUS_OPTIONS = [
  { value: "TODO", label: "A Fazer" },
  { value: "IN_PROGRESS", label: "Em Andamento" },
  { value: "DONE", label: "Concluída" },
  { value: "BLOCKED", label: "Bloqueada" },
  { value: "CANCELLED", label: "Cancelada" },
] as const;

interface ActivityRowProps {
  activity: Activity & { assignedTo: User | null };
}

export function ActivityRow({ activity }: ActivityRowProps) {
  const [progress, setProgress] = useState(activity.progress);
  const [status, setStatus] = useState(activity.status);
  const [savingProgress, setSavingProgress] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);

  async function handleProgressCommit() {
    if (progress === activity.progress) return;
    setSavingProgress(true);
    const result = await updateActivityProgress({ id: activity.id, progress });
    setSavingProgress(false);

    if (result.success) {
      toast.success("Progresso atualizado");
      setStatus(result.activity.status);
    } else {
      toast.error(result.error);
      setProgress(activity.progress);
    }
  }

  async function handleStatusChange(value: string | null) {
    if (!value) return;
    const next = value as typeof status;
    setSavingStatus(true);
    const result = await updateActivityStatus({ id: activity.id, status: next });
    setSavingStatus(false);

    if (result.success) {
      toast.success("Status atualizado");
      setStatus(result.activity.status);
    } else {
      toast.error(result.error);
    }
  }

  const flag = deadlineFlag(activity.dueDate, status);

  return (
    <TableRow>
      <TableCell>{activity.title}</TableCell>
      <TableCell>{activity.assignedTo?.name ?? "—"}</TableCell>
      <TableCell className="font-mono">
        <div className="flex items-center gap-2">
          {formatDate(activity.dueDate)}
          {flag && <Badge variant={flag.variant}>{flag.label}</Badge>}
        </div>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-1.5">
          <Input
            type="number"
            min={0}
            max={100}
            value={progress}
            onChange={(e) => setProgress(Number(e.target.value))}
            onBlur={handleProgressCommit}
            disabled={savingProgress}
            className="w-16"
          />
          <span className="text-xs text-muted-foreground">%</span>
        </div>
      </TableCell>
      <TableCell>
        <Select value={status} onValueChange={handleStatusChange}>
          <SelectTrigger className="w-40" disabled={savingStatus}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        <ActivityDetailsDialog activity={activity} />
      </TableCell>
    </TableRow>
  );
}
