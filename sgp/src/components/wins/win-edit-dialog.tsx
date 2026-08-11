"use client";

import { useState } from "react";
import { toast } from "sonner";
import { PencilIcon } from "lucide-react";
import { updateWin, deleteWin } from "@/actions/wins";
import type { Win } from "@prisma/client";
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

const NO_PROJECT = "__none__";

const STATUS_OPTIONS = [
  { value: "TODO", label: "A Fazer" },
  { value: "IN_PROGRESS", label: "Em Andamento" },
  { value: "DONE", label: "Concluída" },
  { value: "BLOCKED", label: "Bloqueada" },
  { value: "CANCELLED", label: "Cancelada" },
] as const;

function toDateInput(date: Date) {
  return new Date(date).toISOString().slice(0, 10);
}

interface WinEditDialogProps {
  win: Win;
  projects: { id: string; code: string; name: string }[];
}

export function WinEditDialog({ win, projects }: WinEditDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [form, setForm] = useState({
    title: win.title,
    supportName: win.supportName ?? "",
    dueDate: toDateInput(win.dueDate),
    projectId: win.projectId ?? NO_PROJECT,
    status: win.status,
  });

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    const result = await updateWin({
      id: win.id,
      title: form.title,
      supportName: form.supportName || undefined,
      dueDate: new Date(form.dueDate),
      projectId: form.projectId === NO_PROJECT ? null : form.projectId,
      status: form.status,
    });

    setLoading(false);

    if (result.success) {
      toast.success("WIN atualizado");
      setOpen(false);
    } else {
      toast.error(result.error);
    }
  }

  async function handleDelete() {
    if (!confirm("Excluir este WIN? Essa ação pode ser revertida apenas por um administrador.")) {
      return;
    }
    setDeleting(true);
    const result = await deleteWin(win.id);
    setDeleting(false);

    if (result.success) {
      toast.success("WIN excluído");
      setOpen(false);
    } else {
      toast.error(result.error);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="icon-xs"><PencilIcon /></Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar WIN</DialogTitle>
          <DialogDescription>Atualize os dados ou exclua este registro.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-win-title">Título</Label>
            <Input
              id="edit-win-title"
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-win-support">Suporte (opcional)</Label>
            <Input
              id="edit-win-support"
              value={form.supportName}
              onChange={(e) => set("supportName", e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Projeto (opcional)</Label>
            <Select value={form.projectId} onValueChange={(v) => set("projectId", v as string)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Sem projeto vinculado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_PROJECT}>Sem projeto vinculado</SelectItem>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.code} — {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-win-due">Prazo</Label>
              <Input
                id="edit-win-due"
                type="date"
                value={form.dueDate}
                onChange={(e) => set("dueDate", e.target.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Status</Label>
              <Select
                value={form.status}
                onValueChange={(v) => set("status", v as typeof form.status)}
              >
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
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting || loading}
            >
              {deleting ? "Excluindo…" : "Excluir"}
            </Button>
            <Button type="submit" disabled={loading || deleting}>
              {loading ? "Salvando…" : "Salvar alterações"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
