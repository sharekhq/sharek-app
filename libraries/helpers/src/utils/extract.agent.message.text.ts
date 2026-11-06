// Chat storage rows (mastra_messages) hold either a plain string or a Mastra v2
// content object; a turn that died mid-stream persists one with no flattened
// string and no text parts. Messages that yield '' here are dropped rather than
// restored empty into the thread, unless they hold media to show.
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

// The same rule for a link that comes from a tool's result.
export const isMediaLink = (url: unknown): url is string =>
  typeof url === 'string' && /^https?:\/\//.test(url);

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

interface StoredToolInvocation {
  state?: string;
  toolCallId: string;
  toolName: string;
  args?: unknown;
  result?: { path?: string };
}

// The tools whose results the chat draws. A restored call with no renderer paints
// an empty container, so nothing else comes back.
const RESTORED_TOOLS = ['generateImageTool'];

// Only a result holding media counts, so a refused attempt shows nothing and a
// row left with nothing stays dropped.
const restoredInvocations = ({
  content,
}: StoredAgentMessage): StoredToolInvocation[] => {
  const parts =
    content && typeof content === 'object' && !Array.isArray(content)
      ? content.parts || []
      : [];

  return parts
    .filter((part) => part.type === 'tool-invocation')
    .map((part) => part.toolInvocation as StoredToolInvocation)
    .filter(
      (call) =>
        call?.state === 'result' &&
        RESTORED_TOOLS.includes(call.toolName) &&
        isMediaLink(call.result?.path)
    );
};

interface RestoredChatMessage {
  id: string;
  role: string;
  content: string;
  toolCalls?: {
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }[];
  toolCallId?: string;
}

// One stored row as what CopilotKit holds live, so a reopened chat draws what
// Samy made through the same cards: tool calls on the assistant message, then a
// tool message per result. CopilotKit matches messages by id in the chat, its
// runner and the Mastra bridge, so each keeps a stored id or one built from it;
// without them each one shows twice.
export const storedAgentRowToChatMessages = (
  row: StoredAgentMessage & { id: string }
): RestoredChatMessage[] => {
  // Threads written before the channel list moved into the system prompt carry
  // it in the message text. Drop it here so reopening an old thread does not
  // resend it to the model on every turn.
  const content = stripIntegrationsBlock(extractAgentMessageText(row));
  const calls = restoredInvocations(row);

  if (!content && !calls.length) {
    return [];
  }

  return [
    {
      id: row.id,
      role: row.role,
      content,
      ...(calls.length
        ? {
            toolCalls: calls.map((call) => ({
              id: call.toolCallId,
              type: 'function' as const,
              function: {
                name: call.toolName,
                arguments: JSON.stringify(call.args ?? {}),
              },
            })),
          }
        : {}),
    },
    ...calls.map((call) => ({
      id: `${row.id}:${call.toolCallId}`,
      role: 'tool',
      toolCallId: call.toolCallId,
      content: JSON.stringify(call.result),
    })),
  ];
};
