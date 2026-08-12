"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Trash2Icon } from "lucide-react";
import { deleteMeeting } from "@/actions/meetings";
import { Button } from "@/components/ui/button";

export function DeleteMeetingButton({ id }: { id: string }) {
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    if (!confirm("Excluir esta reunião?")) return;
    setLoading(true);
    const result = await deleteMeeting({ id });
    setLoading(false);

    if (result.success) {
      toast.success("Reunião excluída");
    } else {
      toast.error(result.error);
    }
  }

  return (
    <Button variant="ghost" size="icon-xs" disabled={loading} onClick={handleClick}>
      <Trash2Icon />
    </Button>
  );
}
