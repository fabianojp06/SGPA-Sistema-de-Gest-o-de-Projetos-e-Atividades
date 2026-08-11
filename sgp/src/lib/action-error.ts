// Mensagens de auth/RBAC (lib/auth.ts) são seguras para expor ao cliente.
// Qualquer outro erro (Prisma, Zod, etc.) é logado no servidor e substituído
// por uma mensagem genérica — nunca expor stack trace/detalhe interno.
const EXPOSABLE_MESSAGES = new Set([
  "Não autenticado",
  "Sem permissão para executar esta ação",
]);

export function toActionError(error: unknown, fallback: string, context: string) {
  const message = error instanceof Error ? error.message : String(error);

  if (EXPOSABLE_MESSAGES.has(message)) {
    return message;
  }

  console.error(`[action:${context}]`, error);
  return fallback;
}
