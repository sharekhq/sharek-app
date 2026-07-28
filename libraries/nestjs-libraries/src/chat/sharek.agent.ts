export type AguiMessage = { id?: string; role?: string; [key: string]: unknown };

/**
 * CopilotKit resends the entire thread on every turn, and Mastra saves whatever
 * it is given — its dedupe is by message id, and @ag-ui/mastra's converter drops
 * ids. Production threads reached 368 rows for 78 real messages because of it.
 *
 * Mastra Memory already holds the history, so only the newest exchange needs to
 * be sent. That is everything from the last user message onward: during a
 * renderAndWaitForResponse round-trip the tail is [user, assistant(tool-call),
 * tool(result)], and separating a tool result from its call is an API error.
 *
 * Anything unfamiliar falls back to the full list — sending too much costs
 * tokens, sending too little breaks the conversation.
 */
export const messagesToSend = (messages: AguiMessage[]): AguiMessage[] => {
  if (!Array.isArray(messages) || messages.length === 0) return messages;

  let lastUser = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === 'user') {
      lastUser = i;
      break;
    }
  }

  if (lastUser === -1) return messages;
  return messages.slice(lastUser);
};
