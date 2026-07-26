// Chat storage rows (mastra_messages) hold either a plain string or a Mastra v2
// content object; a turn that died mid-stream persists one with no flattened
// string and no text parts. CopilotKit's GraphQL schema requires every resent
// message to carry a string content, so callers must drop messages that
// yield '' here — otherwise the whole thread 400s on every send.
export interface StoredAgentMessagePart {
  type: string;
  text?: string;
  [key: string]: unknown;
}

export interface StoredAgentMessage {
  role: string;
  content?:
    | string
    | {
        format?: number;
        content?: string;
        parts?: StoredAgentMessagePart[];
      }
    | null;
}

export const extractAgentMessageText = (message: StoredAgentMessage): string => {
  const { content } = message;
  if (typeof content === 'string') {
    return content;
  }
  if (typeof content?.content === 'string' && content.content.length > 0) {
    return content.content;
  }
  return (content?.parts || [])
    .filter(
      (part) =>
        part.type === 'text' &&
        typeof part.text === 'string' &&
        part.text.length > 0
    )
    .map((part) => part.text)
    .join('\n');
};
