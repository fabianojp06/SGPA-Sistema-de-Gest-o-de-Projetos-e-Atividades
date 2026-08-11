"use client";

import { useState } from "react";
import { toast } from "sonner";
import { PlusIcon } from "lucide-react";
import { createProject } from "@/actions/projects";
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

const EMPTY_FORM = {
  code: "",
  name: "",
  area: "",
  description: "",
  startDate: "",
  endDate: "",
};

export function ProjectFormDialog() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  function set<K extends keyof typeof EMPTY_FORM>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    const result = await createProject({
      code: form.code,
      name: form.name,
      area: form.area,
      description: form.description || undefined,
      startDate: new Date(form.startDate),
      endDate: new Date(form.endDate),
    });

    setLoading(false);

    if (result.success) {
      toast.success("Projeto criado");
      setOpen(false);
      setForm(EMPTY_FORM);
    } else {
      toast.error(result.error);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button data-icon="inline-start"><PlusIcon />Novo projeto</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Criar projeto</DialogTitle>
          <DialogDescription>Dados básicos do projeto.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="project-code">Código</Label>
              <Input
                id="project-code"
                value={form.code}
                onChange={(e) => set("code", e.target.value)}
                required
                placeholder="PRJ-001"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="project-area">Área</Label>
              <Input
                id="project-area"
                value={form.area}
                onChange={(e) => set("area", e.target.value)}
                required
                placeholder="GIA/STI"
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="project-name">Nome</Label>
            <Input
              id="project-name"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="project-description">Descrição (opcional)</Label>
            <Textarea
              id="project-description"
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="project-start">Início</Label>
              <Input
                id="project-start"
                type="date"
                value={form.startDate}
                onChange={(e) => set("startDate", e.target.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="project-end">Prazo final</Label>
              <Input
                id="project-end"
                type="date"
                value={form.endDate}
                onChange={(e) => set("endDate", e.target.value)}
                required
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={loading}>
              {loading ? "Salvando…" : "Criar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
