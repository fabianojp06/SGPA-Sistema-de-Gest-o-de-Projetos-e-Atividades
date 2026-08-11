"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ListChecksIcon, PlusIcon } from "lucide-react";
import {
  getSubActivities,
  createSubActivity,
  toggleSubActivity,
} from "@/actions/activities";
import { getActivityComments, createActivityComment } from "@/actions/comments";
import {
  getActivityAttachments,
  createActivityAttachment,
} from "@/actions/attachments";
import type { Activity } from "@prisma/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";

type CommentWithAuthor = Awaited<ReturnType<typeof getActivityComments>>[number];
type Attachment = Awaited<ReturnType<typeof getActivityAttachments>>[number];

export function ActivityDetailsDialog({ activity }: { activity: Activity }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [subActivities, setSubActivities] = useState<Activity[]>([]);
  const [comments, setComments] = useState<CommentWithAuthor[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [newItem, setNewItem] = useState("");
  const [newComment, setNewComment] = useState("");
  const [attachmentName, setAttachmentName] = useState("");
  const [attachmentUrl, setAttachmentUrl] = useState("");

  async function loadAll() {
    setLoading(true);
    const [subs, cmts, atts] = await Promise.all([
      getSubActivities(activity.id),
      getActivityComments(activity.id),
      getActivityAttachments(activity.id),
    ]);
    setSubActivities(subs);
    setComments(cmts);
    setAttachments(atts);
    setLoading(false);
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) loadAll();
  }

  async function handleAddItem(e: React.FormEvent) {
    e.preventDefault();
    if (!newItem.trim()) return;
    const result = await createSubActivity({ parentId: activity.id, title: newItem });
    if (result.success) {
      setNewItem("");
      loadAll();
    } else {
      toast.error(result.error);
    }
  }

  async function handleToggleItem(id: string, done: boolean) {
    const result = await toggleSubActivity({ id, done });
    if (result.success) {
      loadAll();
    } else {
      toast.error(result.error);
    }
  }

  async function handleAddComment(e: React.FormEvent) {
    e.preventDefault();
    if (!newComment.trim()) return;
    const result = await createActivityComment({
      activityId: activity.id,
      content: newComment,
    });
    if (result.success) {
      setNewComment("");
      loadAll();
    } else {
      toast.error(result.error);
    }
  }

  async function handleAddAttachment(e: React.FormEvent) {
    e.preventDefault();
    if (!attachmentName.trim() || !attachmentUrl.trim()) return;
    const result = await createActivityAttachment({
      activityId: activity.id,
      name: attachmentName,
      url: attachmentUrl,
    });
    if (result.success) {
      setAttachmentName("");
      setAttachmentUrl("");
      loadAll();
    } else {
      toast.error(result.error);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button variant="ghost" size="icon-xs"><ListChecksIcon /></Button>} />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{activity.title}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 max-h-[70vh] overflow-y-auto">
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-medium text-foreground">Checklist</h3>
            {loading ? (
              <p className="text-xs text-muted-foreground">Carregando…</p>
            ) : subActivities.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhum item ainda.</p>
            ) : (
              <div className="flex flex-col gap-1">
                {subActivities.map((sub) => (
                  <label key={sub.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={sub.status === "DONE"}
                      onChange={(e) => handleToggleItem(sub.id, e.target.checked)}
                    />
                    <span className={sub.status === "DONE" ? "line-through text-muted-foreground" : ""}>
                      {sub.title}
                    </span>
                  </label>
                ))}
              </div>
            )}
            <form onSubmit={handleAddItem} className="flex gap-1.5">
              <Input
                value={newItem}
                onChange={(e) => setNewItem(e.target.value)}
                placeholder="Novo item"
                className="flex-1"
              />
              <Button type="submit" size="icon-xs"><PlusIcon /></Button>
            </form>
          </section>

          <Separator />

          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-medium text-foreground">Comentários</h3>
            {comments.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhum comentário ainda.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {comments.map((comment) => (
                  <div key={comment.id} className="text-sm">
                    <span className="font-medium">{comment.author?.name ?? "Usuário"}</span>{" "}
                    <span className="text-muted-foreground">{comment.content}</span>
                  </div>
                ))}
              </div>
            )}
            <form onSubmit={handleAddComment} className="flex flex-col gap-1.5">
              <Textarea
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Escreva um comentário"
              />
              <Button type="submit" size="sm" className="self-end">Comentar</Button>
            </form>
          </section>

          <Separator />

          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-medium text-foreground">Anexos (link)</h3>
            {attachments.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhum anexo ainda.</p>
            ) : (
              <div className="flex flex-col gap-1">
                {attachments.map((att) => (
                  <a
                    key={att.id}
                    href={att.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-accent hover:underline"
                  >
                    {att.name}
                  </a>
                ))}
              </div>
            )}
            <form onSubmit={handleAddAttachment} className="flex flex-col gap-1.5">
              <Input
                value={attachmentName}
                onChange={(e) => setAttachmentName(e.target.value)}
                placeholder="Nome do anexo"
              />
              <Input
                value={attachmentUrl}
                onChange={(e) => setAttachmentUrl(e.target.value)}
                placeholder="https://…"
              />
              <Button type="submit" size="sm" className="self-end">Anexar</Button>
            </form>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
