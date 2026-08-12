// Mensagens de auth/RBAC (lib/auth.ts) são seguras para expor ao cliente.
// Qualquer outro erro (Prisma, Zod, etc.) é logado no servidor e substituído
// por uma mensagem genérica — nunca expor stack trace/detalhe interno.
const EXPOSABLE_MESSAGES = new Set([
  "Não autenticado",
  "Sem permissão para executar esta ação",
  "Selecione o projeto desta reunião",
  "Selecione o participante desta reunião One-on-One",
  "Você não tem acesso a este projeto",
  "Não foi possível gerar a pauta agora. Tente novamente.",
  "Não foi possível exportar a pauta agora. Tente novamente.",
  "O texto da decisão é obrigatório",
  "Não foi possível marcar a notificação como lida",
  "Não foi possível marcar as notificações como lidas",
]);

export function toActionError(error: unknown, fallback: string, context: string) {
  const message = error instanceof Error ? error.message : String(error);

  if (EXPOSABLE_MESSAGES.has(message)) {
    return message;
  }

  console.error(`[action:${context}]`, error);
  return fallback;
}
