"use client";

import { useState } from "react";
import { toast } from "sonner";
import { XCircleIcon } from "lucide-react";
import { closeProject } from "@/actions/projects";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const STATUS_OPTIONS = [
  { value: "COMPLETED", label: "Concluído" },
  { value: "ARCHIVED", label: "Arquivado" },
  { value: "CANCELLED", label: "Cancelado" },
] as const;

export function CloseProjectDialog({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<(typeof STATUS_OPTIONS)[number]["value"]>("COMPLETED");
  const [reason, setReason] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    const result = await closeProject({ id: projectId, status, reason });
    setLoading(false);

    if (result.success) {
      toast.success("Projeto encerrado");
      setOpen(false);
    } else {
      toast.error(result.error);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="destructive" data-icon="inline-start">
            <XCircleIcon />
            Encerrar projeto
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Encerrar projeto</DialogTitle>
          <DialogDescription>
            Essa ação exige justificativa e fica registrada na auditoria (RN-06/RN-15).
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>Novo status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
              <SelectTrigger className="w-full">
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
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="close-reason">Justificativa</Label>
            <Textarea
              id="close-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              placeholder="Motivo do encerramento"
            />
          </div>
          <DialogFooter>
            <Button type="submit" variant="destructive" disabled={loading}>
              {loading ? "Encerrando…" : "Confirmar encerramento"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
