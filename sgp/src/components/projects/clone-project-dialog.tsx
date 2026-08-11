"use client";

import { useState } from "react";
import { toast } from "sonner";
import { CopyIcon } from "lucide-react";
import { cloneProject } from "@/actions/projects";
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

interface CloneProjectDialogProps {
  sourceId: string;
  sourceName: string;
}

export function CloneProjectDialog({ sourceId, sourceName }: CloneProjectDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [code, setCode] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    const result = await cloneProject({
      sourceId,
      code,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
    });

    setLoading(false);

    if (result.success) {
      toast.success("Projeto clonado");
      setOpen(false);
      setCode("");
      setStartDate("");
      setEndDate("");
    } else {
      toast.error(result.error);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="icon-xs"><CopyIcon /></Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Clonar &quot;{sourceName}&quot;</DialogTitle>
          <DialogDescription>
            US-006 — cria um novo projeto com os mesmos dados básicos e fases.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="clone-code">Código do novo projeto</Label>
            <Input
              id="clone-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
              placeholder="PRJ-002"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="clone-start">Início</Label>
              <Input
                id="clone-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="clone-end">Prazo final</Label>
              <Input
                id="clone-end"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                required
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={loading}>
              {loading ? "Clonando…" : "Clonar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
