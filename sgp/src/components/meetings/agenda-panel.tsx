"use client";

import { useState } from "react";
import { toast } from "sonner";
import { SparklesIcon } from "lucide-react";
import { generateAgenda, updateMeetingAgenda } from "@/actions/meetings";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface AgendaContent {
  text: string;
  generatedAt: string;
  model: string;
  generatedById: string;
}

interface AgendaPanelProps {
  meetingId: string;
  agenda: AgendaContent | null;
  canGenerate: boolean;
}

export function AgendaPanel({ meetingId, agenda, canGenerate }: AgendaPanelProps) {
  const [text, setText] = useState(agenda?.text ?? "");
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleGenerate() {
    if (agenda && !confirm("Isso substitui a pauta atual. Continuar?")) return;

    setGenerating(true);
    const result = await generateAgenda({ meetingId });
    setGenerating(false);

    if (result.success) {
      const newAgenda = result.meeting.agenda as unknown as AgendaContent;
      setText(newAgenda.text);
      toast.success("Pauta gerada");
    } else {
      toast.error(result.error);
    }
  }

  async function handleSave() {
    setSaving(true);
    const result = await updateMeetingAgenda({ meetingId, text });
    setSaving(false);

    if (result.success) {
      toast.success("Pauta salva");
    } else {
      toast.error(result.error);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">Pauta</h2>
        {canGenerate && (
          <Button variant="outline" onClick={handleGenerate} disabled={generating} data-icon="inline-start">
            <SparklesIcon />
            {generating ? "Gerando…" : agenda ? "Gerar novamente" : "Gerar pauta com IA"}
          </Button>
        )}
      </div>

      {text ? (
        <>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={16}
            className="font-mono text-sm"
          />
          {agenda && (
            <p className="text-xs text-muted-foreground">
              Gerada em {new Date(agenda.generatedAt).toLocaleString("pt-BR")} · {agenda.model}
            </p>
          )}
          {canGenerate && (
            <div>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? "Salvando…" : "Salvar pauta"}
              </Button>
            </div>
          )}
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          Nenhuma pauta gerada ainda{canGenerate ? " — clique em \"Gerar pauta com IA\"." : "."}
        </p>
      )}
    </div>
  );
}
