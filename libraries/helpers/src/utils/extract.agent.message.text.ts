// Chat storage rows (mastra_messages) hold either a plain string or a Mastra v2
// content object; a turn that died mid-stream persists one with no flattened
// string and no text parts. Callers drop messages that yield '' here rather
// than restore an empty one into the thread.
export interface StoredAgentMessagePart {
  type: string;
  text?: string;
  [key: string]: unknown;
}

export interface StoredAgentMessage {
  role: string;
  content?:
    | string
    // AG-UI input content, which CopilotKit 1.72 uses for messages on screen.
    | StoredAgentMessagePart[]
    | {
        format?: number;
        content?: string;
        parts?: StoredAgentMessagePart[];
      }
    | null;
}

// Until the selected-channel list moved into the agent's system prompt, the
// frontend appended it to the text of every user message. Stored threads still
// carry those blocks, and resending them costs ~315 tokens per message per turn,
// so strip them when rehydrating a thread and before rendering it. The lazy
// quantifier means an unterminated marker matches nothing and the text survives.
const INTEGRATIONS_BLOCK = /\n?\[--integrations--\][\s\S]*?\[--integrations--\]/g;

export const stripIntegrationsBlock = (text: string): string =>
  text.replace(INTEGRATIONS_BLOCK, '').trimEnd();

// What a user message attaches, as the chat's input writes it: one `Image:` or
// `Video:` line per item between two markers. Only a block counts, so a link
// typed into a message stays words and loads nothing for teammates reading the
// thread, and the lazy quantifier leaves an unterminated marker in the words.
const MEDIA_BLOCK = /\n?\[--Media--\]([\s\S]*?)\[--Media--\]/g;
// A link ends at the first whitespace or quote. Only http(s) counts, because
// these reach an image source and the viewer's external link.
const MEDIA_LINE = /^(Image|Video): (https?:\/\/[^\s"']+)/gm;

export interface AgentMessageMedia {
  kind: 'image' | 'video';
  url: string;
}

export const extractAgentMessageMedia = (
  text: string
): { text: string; media: AgentMessageMedia[] } => {
  const media: AgentMessageMedia[] = [];
  const words = text.replace(MEDIA_BLOCK, (_block, lines: string) => {
    for (const [, kind, url] of lines.matchAll(MEDIA_LINE)) {
      media.push({ kind: kind === 'Video' ? 'video' : 'image', url });
    }
    return '';
  });

  return { text: words, media };
};

const joinTextParts = (parts: StoredAgentMessagePart[]): string =>
  parts
    .filter(
      (part) =>
        part.type === 'text' &&
        typeof part.text === 'string' &&
        part.text.length > 0
    )
    .map((part) => part.text)
    .join('\n');

export const extractAgentMessageText = (message: StoredAgentMessage): string => {
  const { content } = message;
  if (typeof content === 'string') {
    return content;
  }
  if (Array.isArray(content)) {
    return joinTextParts(content);
  }
  if (typeof content?.content === 'string' && content.content.length > 0) {
    return content.content;
  }
  return joinTextParts(content?.parts || []);
};
