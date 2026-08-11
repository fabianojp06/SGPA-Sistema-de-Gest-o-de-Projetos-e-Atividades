"use client";

import { useState } from "react";
import { toast } from "sonner";
import { PlusIcon, XIcon } from "lucide-react";
import { addProjectMember, removeProjectMember } from "@/actions/team";
import type { ProjectMember, User } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ROLE_LABEL: Record<string, string> = {
  gestor: "Gestor",
  membro: "Membro",
  leitura: "Somente leitura",
};

interface TeamCardProps {
  projectId: string;
  members: (ProjectMember & { user: User })[];
  users: User[];
}

export function TeamCard({ projectId, members, users }: TeamCardProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [userId, setUserId] = useState("");
  const [role, setRole] = useState<"gestor" | "membro" | "leitura">("membro");

  const availableUsers = users.filter((u) => !members.some((m) => m.userId === u.id));

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!userId) return;
    setLoading(true);

    const result = await addProjectMember({ projectId, userId, role });
    setLoading(false);

    if (result.success) {
      toast.success("Membro associado");
      setOpen(false);
      setUserId("");
      setRole("membro");
    } else {
      toast.error(result.error);
    }
  }

  async function handleRemove(id: string) {
    setRemovingId(id);
    const result = await removeProjectMember(id);
    setRemovingId(null);

    if (result.success) {
      toast.success("Membro removido");
    } else {
      toast.error(result.error);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Equipe ({members.length})</CardTitle>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger
            render={
              <Button size="sm" data-icon="inline-start">
                <PlusIcon />
                Associar
              </Button>
            }
          />
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Associar membro à equipe</DialogTitle>
              <DialogDescription>US-004 — papéis: gestor, membro ou leitura.</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleAdd} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>Usuário</Label>
                <Select value={userId} onValueChange={(v) => setUserId(v as string)}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Selecione um usuário" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableUsers.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Papel</Label>
                <Select value={role} onValueChange={(v) => setRole(v as typeof role)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gestor">Gestor</SelectItem>
                    <SelectItem value="membro">Membro</SelectItem>
                    <SelectItem value="leitura">Somente leitura</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter>
                <Button type="submit" disabled={loading || !userId}>
                  {loading ? "Salvando…" : "Associar"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {members.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhum membro associado — sem isso, coordinator/technician não veem este projeto.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {members.map((member) => (
              <div key={member.id} className="flex items-center justify-between text-sm">
                <span>{member.user.name}</span>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{ROLE_LABEL[member.role] ?? member.role}</Badge>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => handleRemove(member.id)}
                    disabled={removingId === member.id}
                  >
                    <XIcon />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
