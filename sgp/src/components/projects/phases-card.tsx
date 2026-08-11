"use client";

import { useState } from "react";
import { toast } from "sonner";
import { PlusIcon } from "lucide-react";
import { createProjectPhase } from "@/actions/phases";
import type { ProjectPhase } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { formatDate } from "@/lib/utils";

interface PhasesCardProps {
  projectId: string;
  phases: ProjectPhase[];
}

export function PhasesCard({ projectId, phases }: PhasesCardProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    const result = await createProjectPhase({
      projectId,
      name,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
    });

    setLoading(false);

    if (result.success) {
      toast.success("Fase criada");
      setOpen(false);
      setName("");
      setStartDate("");
      setEndDate("");
    } else {
      toast.error(result.error);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Fases ({phases.length})</CardTitle>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger
            render={
              <Button size="sm" data-icon="inline-start">
                <PlusIcon />
                Nova fase
              </Button>
            }
          />
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Criar fase</DialogTitle>
              <DialogDescription>US-003 — etapa do projeto com datas.</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="phase-name">Nome</Label>
                <Input
                  id="phase-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="phase-start">Início</Label>
                  <Input
                    id="phase-start"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    required
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="phase-end">Fim</Label>
                  <Input
                    id="phase-end"
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
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
      </CardHeader>
      <CardContent>
        {phases.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma fase cadastrada ainda.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {phases.map((phase) => (
              <div key={phase.id} className="flex items-center justify-between text-sm">
                <span>{phase.name}</span>
                <span className="font-mono text-muted-foreground">
                  {formatDate(phase.startDate)} — {formatDate(phase.endDate)}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
