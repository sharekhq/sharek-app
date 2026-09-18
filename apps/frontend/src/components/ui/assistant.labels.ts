/**
 * The chat controls CopilotKit labels for us, and the keys that translate them.
 *
 * Every string the chat window renders that is not a message comes from the vendor's
 * `labels` prop, and anything left out of it falls back to CopilotKit's own English —
 * invisibly, because those defaults are not literals in this repository and no check
 * can see them. Two of the ten were passed; these are the other eight.
 *
 * One table rather than two copies, for the reason `translation/derive-key.ts` is one
 * function rather than three: both surfaces must hand the widget the same set, and a
 * ninth label added to the composer's popup but not to Samy's chat would show English
 * on one screen and Arabic on the other with every gate still green. `title` and
 * `initial` stay at the call sites, because they are the one thing the two surfaces
 * genuinely do not share — the composer's assistant is not Samy.
 *
 * Shared by the composer's popup and Samy's chat, so it lives here rather than in
 * either of them — the same reason `tutorial.video.ts` sits beside it.
 */
export interface AssistantLabel {
  key: string;
  defaultValue: string;
}

export const ASSISTANT_LABELS: Readonly<Record<string, AssistantLabel>> = {
  placeholder: {
    key: 'assistant_placeholder',
    defaultValue: 'Type a message...',
  },
  error: {
    key: 'assistant_error',
    defaultValue: '❌ An error occurred. Please try again.',
  },
  stopGenerating: {
    key: 'assistant_stop_generating',
    defaultValue: 'Stop generating',
  },
  regenerateResponse: {
    key: 'assistant_regenerate_response',
    defaultValue: 'Regenerate response',
  },
  copyToClipboard: {
    key: 'assistant_copy_to_clipboard',
    defaultValue: 'Copy to clipboard',
  },
  thumbsUp: {
    key: 'assistant_thumbs_up',
    defaultValue: 'Thumbs up',
  },
  thumbsDown: {
    key: 'assistant_thumbs_down',
    defaultValue: 'Thumbs down',
  },
  copied: {
    key: 'assistant_copied',
    defaultValue: 'Copied!',
  },
};

/**
 * The eight, resolved. Spread it FIRST and let the surface's own `title` and
 * `initial` follow, so that the two a surface owns always win.
 */
export const assistantLabels = (
  t: (key: string, fallback: string) => string
): Record<string, string> =>
  Object.fromEntries(
    Object.entries(ASSISTANT_LABELS).map(([label, { key, defaultValue }]) => [
      label,
      t(key, defaultValue),
    ])
  );
