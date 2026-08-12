"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { SparklesIcon, DownloadIcon } from "lucide-react";
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
  // new Date().toLocaleString() depende do fuso do processo que renderiza —
  // formatar só no cliente evita mismatch de hidratação entre servidor/navegador.
  const [generatedAtLabel, setGeneratedAtLabel] = useState<string | null>(null);

  useEffect(() => {
    setGeneratedAtLabel(agenda ? new Date(agenda.generatedAt).toLocaleString("pt-BR") : null);
  }, [agenda]);

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
        <div className="flex items-center gap-2">
          {agenda ? (
            <Button
              variant="outline"
              data-icon="inline-start"
              nativeButton={false}
              render={<a href={`/api/meetings/${meetingId}/pdf`} download />}
            >
              <DownloadIcon />
              Exportar PDF
            </Button>
          ) : (
            <Button variant="outline" disabled title="Gere a pauta antes de exportar" data-icon="inline-start">
              <DownloadIcon />
              Exportar PDF
            </Button>
          )}
          {canGenerate && (
            <Button variant="outline" onClick={handleGenerate} disabled={generating} data-icon="inline-start">
              <SparklesIcon />
              {generating ? "Gerando…" : agenda ? "Gerar novamente" : "Gerar pauta com IA"}
            </Button>
          )}
        </div>
      </div>

      {text ? (
        <>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={16}
            className="font-mono text-sm"
          />
          {agenda && generatedAtLabel && (
            <p className="text-xs text-muted-foreground">
              Gerada em {generatedAtLabel} · {agenda.model}
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
