import Anthropic from "@anthropic-ai/sdk";

const AGENDA_MODEL = "claude-sonnet-4-5";
const AGENDA_TIMEOUT_MS = 30_000;

// Instanciado sob demanda (não no import) para não quebrar o boot do app se
// ANTHROPIC_API_KEY estiver ausente — o erro só aparece quando alguém
// efetivamente tenta gerar uma pauta (US-032/033).
function getClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY não configurada");
  }
  return new Anthropic({ apiKey, timeout: AGENDA_TIMEOUT_MS });
}

export async function generateAgendaText(prompt: string): Promise<string> {
  const client = getClient();

  const response = await client.messages.create({
    model: AGENDA_MODEL,
    max_tokens: 1500,
    messages: [{ role: "user", content: prompt }],
  });

  const block = response.content.find((c) => c.type === "text");
  if (!block || block.type !== "text") {
    throw new Error("Resposta da Anthropic API sem conteúdo de texto");
  }
  return block.text;
}

export const AGENDA_MODEL_NAME = AGENDA_MODEL;
