"use client";

import { useState } from "react";
import { toast } from "sonner";
import { PlusIcon } from "lucide-react";
import { createWin } from "@/actions/wins";
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

export function WinFormDialog() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState("");
  const [supportName, setSupportName] = useState("");
  const [dueDate, setDueDate] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    const result = await createWin({
      title,
      supportName: supportName || undefined,
      dueDate: new Date(dueDate),
    });

    setLoading(false);

    if (result.success) {
      toast.success("WIN registrado");
      setOpen(false);
      setTitle("");
      setSupportName("");
      setDueDate("");
    } else {
      toast.error(result.error);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button data-icon="inline-start"><PlusIcon />Registrar WIN</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar WIN</DialogTitle>
          <DialogDescription>
            O que você entregou ou está fazendo esta semana.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="win-title">Título</Label>
            <Input
              id="win-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              placeholder="Ex: Finalizar homologação do módulo X"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="win-support">Suporte (opcional)</Label>
            <Input
              id="win-support"
              value={supportName}
              onChange={(e) => setSupportName(e.target.value)}
              placeholder="Quem está te apoiando nesta entrega"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="win-due">Prazo</Label>
            <Input
              id="win-due"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
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
