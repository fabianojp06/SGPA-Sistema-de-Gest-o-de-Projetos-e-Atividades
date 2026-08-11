"use client";

import { useState } from "react";
import { toast } from "sonner";
import { updateProject } from "@/actions/projects";
import type { Project } from "@prisma/client";
import { Button } from "@/components/ui/button";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CloseProjectDialog } from "@/components/projects/close-project-dialog";

// COMPLETED/ARCHIVED/CANCELLED exigem justificativa (US-005) — usar o botão
// "Encerrar projeto", não este formulário.
const STATUS_OPTIONS = [
  { value: "ACTIVE", label: "Ativo" },
  { value: "PAUSED", label: "Pausado" },
] as const;

function toDateInput(date: Date) {
  return new Date(date).toISOString().slice(0, 10);
}

const TERMINAL_STATUS_LABEL: Record<string, string> = {
  COMPLETED: "Concluído",
  ARCHIVED: "Arquivado",
  CANCELLED: "Cancelado",
};

export function EditProjectForm({ project }: { project: Project }) {
  const isClosed = project.status in TERMINAL_STATUS_LABEL;
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name: project.name,
    area: project.area,
    description: project.description ?? "",
    status: project.status,
    startDate: toDateInput(project.startDate),
    endDate: toDateInput(project.endDate),
  });

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    const result = await updateProject({
      id: project.id,
      name: form.name,
      area: form.area,
      description: form.description || undefined,
      status: form.status,
      startDate: new Date(form.startDate),
      endDate: new Date(form.endDate),
    });

    setLoading(false);

    if (result.success) {
      toast.success("Projeto atualizado");
    } else {
      toast.error(result.error);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Editar projeto</CardTitle>
        {!isClosed && <CloseProjectDialog projectId={project.id} />}
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-name">Nome</Label>
              <Input
                id="edit-name"
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-area">Área</Label>
              <Input
                id="edit-area"
                value={form.area}
                onChange={(e) => set("area", e.target.value)}
                required
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-description">Descrição</Label>
            <Textarea
              id="edit-description"
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-start">Início</Label>
              <Input
                id="edit-start"
                type="date"
                value={form.startDate}
                onChange={(e) => set("startDate", e.target.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-end">Prazo final</Label>
              <Input
                id="edit-end"
                type="date"
                value={form.endDate}
                onChange={(e) => set("endDate", e.target.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Status</Label>
              {isClosed ? (
                <Badge variant="outline" className="w-fit">
                  {TERMINAL_STATUS_LABEL[project.status]}
                </Badge>
              ) : (
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
              )}
            </div>
          </div>
          <div>
            <Button type="submit" disabled={loading}>
              {loading ? "Salvando…" : "Salvar alterações"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
