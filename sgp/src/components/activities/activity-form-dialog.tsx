"use client";

import { useState } from "react";
import { toast } from "sonner";
import { PlusIcon } from "lucide-react";
import { createActivity } from "@/actions/activities";
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

const UNASSIGNED = "__unassigned__";
const NO_PREDECESSOR = "__none__";

interface ActivityFormDialogProps {
  projectId: string;
  users: { id: string; name: string }[];
  activities: { id: string; title: string }[];
}

export function ActivityFormDialog({ projectId, users, activities }: ActivityFormDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assignedToId, setAssignedToId] = useState(UNASSIGNED);
  const [predecessorId, setPredecessorId] = useState(NO_PREDECESSOR);
  const [dueDate, setDueDate] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    const result = await createActivity({
      projectId,
      title,
      description: description || undefined,
      assignedToId: assignedToId === UNASSIGNED ? undefined : assignedToId,
      predecessorId: predecessorId === NO_PREDECESSOR ? undefined : predecessorId,
      dueDate: new Date(dueDate),
    });

    setLoading(false);

    if (result.success) {
      toast.success("Atividade criada");
      setOpen(false);
      setTitle("");
      setDescription("");
      setAssignedToId(UNASSIGNED);
      setPredecessorId(NO_PREDECESSOR);
      setDueDate("");
    } else {
      toast.error(result.error);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button data-icon="inline-start"><PlusIcon />Nova atividade</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Criar atividade</DialogTitle>
          <DialogDescription>Vinculada a este projeto.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="activity-title">Título</Label>
            <Input
              id="activity-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="activity-description">Descrição (opcional)</Label>
            <Textarea
              id="activity-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Responsável (opcional)</Label>
            <Select value={assignedToId} onValueChange={(v) => setAssignedToId(v as string)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Sem responsável definido" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UNASSIGNED}>Sem responsável definido</SelectItem>
                {users.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Predecessora (opcional)</Label>
            <Select value={predecessorId} onValueChange={(v) => setPredecessorId(v as string)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Sem dependência" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_PREDECESSOR}>Sem dependência</SelectItem>
                {activities.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="activity-due">Prazo</Label>
            <Input
              id="activity-due"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              required
            />
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
