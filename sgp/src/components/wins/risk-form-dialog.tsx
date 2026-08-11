"use client";

import { useState } from "react";
import { toast } from "sonner";
import { PlusIcon } from "lucide-react";
import { createRisk } from "@/actions/risks";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const LEVELS = [
  { value: "LOW", label: "Baixo" },
  { value: "MEDIUM", label: "Médio" },
  { value: "HIGH", label: "Alto" },
  { value: "CRITICAL", label: "Crítico" },
] as const;

export function RiskFormDialog() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [level, setLevel] = useState<string>("MEDIUM");
  const [dueDate, setDueDate] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    const result = await createRisk({
      title,
      description,
      level: level as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
      category: "general",
      dueDate: dueDate ? new Date(dueDate) : undefined,
    });

    setLoading(false);

    if (result.success) {
      toast.success("Alerta de risco registrado");
      setOpen(false);
      setTitle("");
      setDescription("");
      setLevel("MEDIUM");
      setDueDate("");
    } else {
      toast.error(result.error);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" data-icon="inline-start"><PlusIcon />Registrar risco</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar alerta de risco</DialogTitle>
          <DialogDescription>
            Sinalize uma ameaça à entrega para visibilidade do time.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="risk-title">Título</Label>
            <Input
              id="risk-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="risk-description">Descrição</Label>
            <Textarea
              id="risk-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Nível</Label>
            <Select value={level} onValueChange={(v) => setLevel(v as string)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Selecione o nível" />
              </SelectTrigger>
              <SelectContent>
                {LEVELS.map((l) => (
                  <SelectItem key={l.value} value={l.value}>
                    {l.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="risk-due">Prazo (opcional)</Label>
            <Input
              id="risk-due"
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
