"use client";

import { useState } from "react";
import { toast } from "sonner";
import { PlusIcon } from "lucide-react";
import { createHelpRequest } from "@/actions/help-requests";
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
import { Textarea } from "@/components/ui/textarea";

export function HelpRequestFormDialog() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [description, setDescription] = useState("");
  const [targetName, setTargetName] = useState("");
  const [dueDate, setDueDate] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    const result = await createHelpRequest({
      description,
      targetName,
      dueDate: dueDate ? new Date(dueDate) : undefined,
    });

    setLoading(false);

    if (result.success) {
      toast.success("Pedido de ajuda registrado");
      setOpen(false);
      setDescription("");
      setTargetName("");
      setDueDate("");
    } else {
      toast.error(result.error);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" data-icon="inline-start"><PlusIcon />Pedido de ajuda</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar pedido de ajuda</DialogTitle>
          <DialogDescription>
            Sinalize um bloqueio que depende de outra pessoa ou área.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="help-target">Destinatário</Label>
            <Input
              id="help-target"
              value={targetName}
              onChange={(e) => setTargetName(e.target.value)}
              required
              placeholder="Quem precisa resolver ou responder"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="help-description">Descrição</Label>
            <Textarea
              id="help-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="help-due">Prazo de resposta (opcional)</Label>
            <Input
              id="help-due"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
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
