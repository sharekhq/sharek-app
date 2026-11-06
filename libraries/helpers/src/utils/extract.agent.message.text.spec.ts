import {
  extractAgentMessageMedia,
  extractAgentMessageText,
  storedAgentRowToChatMessages,
  stripIntegrationsBlock,
} from './extract.agent.message.text';

describe('extractAgentMessageText', () => {
  it('returns the flattened content string of a healthy v2 message', () => {
    expect(
      extractAgentMessageText({
        role: 'assistant',
        content: {
          format: 2,
          content: 'Sure, scheduling it now.',
          parts: [{ type: 'text', text: 'Sure, scheduling it now.' }],
        },
      })
    ).toBe('Sure, scheduling it now.');
  });

  it('returns plain-string content as-is (legacy rows)', () => {
    expect(extractAgentMessageText({ role: 'user', content: 'hello there' })).toBe(
      'hello there'
    );
  });

  it('rebuilds text from parts when the flattened string is missing', () => {
    expect(
      extractAgentMessageText({
        role: 'assistant',
        content: {
          format: 2,
          parts: [{ type: 'step-start' }, { type: 'text', text: 'From parts.' }],
        },
      })
    ).toBe('From parts.');
  });

  it('joins multiple text parts with newlines, skipping empty ones', () => {
    expect(
      extractAgentMessageText({
        role: 'assistant',
        content: {
          format: 2,
          parts: [
            { type: 'text', text: 'One' },
            { type: 'text', text: '' },
            { type: 'text', text: 'Two' },
          ],
        },
      })
    ).toBe('One\nTwo');
  });

  it('returns empty string for a poisoned dead-turn message (no text anywhere)', () => {
    expect(
      extractAgentMessageText({ role: 'assistant', content: { format: 2, parts: [] } })
    ).toBe('');
  });

  it('returns empty string when content is missing entirely', () => {
    expect(extractAgentMessageText({ role: 'assistant' })).toBe('');
    expect(extractAgentMessageText({ role: 'assistant', content: null })).toBe('');
  });

  it('returns empty string for tool-invocation-only messages', () => {
    expect(
      extractAgentMessageText({
        role: 'assistant',
        content: {
          format: 2,
          parts: [
            {
              type: 'tool-invocation',
              toolInvocation: { toolName: 'generateImage', state: 'call' },
            },
          ],
        },
      })
    ).toBe('');
  });

  // CopilotKit 1.72 sends user content as AG-UI input parts, so a message on
  // screen can carry an array where stored rows carry a string.
  it('joins the text parts of an AG-UI content array', () => {
    expect(
      extractAgentMessageText({
        role: 'user',
        content: [
          { type: 'text', text: 'a' },
          { type: 'binary', mimeType: 'image/png', data: 'x' },
          { type: 'text', text: 'b' },
        ],
      })
    ).toBe('a\nb');
  });

  it('falls back to parts when the flattened content is an empty string', () => {
    expect(
      extractAgentMessageText({
        role: 'assistant',
        content: { format: 2, content: '', parts: [{ type: 'text', text: 'recovered' }] },
      })
    ).toBe('recovered');
  });
});

describe('stripIntegrationsBlock', () => {
  const block = `[--integrations--]
Use the following social media platforms: [{"id":"abc","platform":"x"}]
[--integrations--]`;

  it('leaves text without a block untouched', () => {
    expect(stripIntegrationsBlock('just a message')).toBe('just a message');
  });

  it('removes the block and the whitespace it leaves behind', () => {
    expect(stripIntegrationsBlock(`schedule this\n${block}`)).toBe(
      'schedule this'
    );
  });

  // Threads written before the list moved into the system prompt carry one
  // block per user message; a rehydrated thread can hold several.
  it('removes every block, not just the first', () => {
    expect(stripIntegrationsBlock(`a\n${block}\nb\n${block}`)).toBe('a\nb');
  });

  it('returns empty string for a message that was only a block', () => {
    expect(stripIntegrationsBlock(block)).toBe('');
  });

  it('keeps a [--Media--] block, which is a different feature', () => {
    const media = '[--Media--]Image: https://x/y.png\n[--Media--]';
    expect(stripIntegrationsBlock(`caption\n${media}\n${block}`)).toBe(
      `caption\n${media}`
    );
  });

  it('tolerates an unterminated block without hanging', () => {
    expect(stripIntegrationsBlock('text\n[--integrations--]\nhalf')).toBe(
      'text\n[--integrations--]\nhalf'
    );
  });
});

describe('extractAgentMessageMedia', () => {
  it('splits the words from the links of a block, in order', () => {
    expect(
      extractAgentMessageMedia(
        'hello\n[--Media--]Image: https://m/a.png\nVideo: https://m/b.mp4\n[--Media--]'
      )
    ).toEqual({
      text: 'hello',
      media: [
        { kind: 'image', url: 'https://m/a.png' },
        { kind: 'video', url: 'https://m/b.mp4' },
      ],
    });
  });

  it('reads every block, and keeps the words between them', () => {
    expect(
      extractAgentMessageMedia(
        '[--Media--]Image: https://m/a.png\n[--Media--]middle\n[--Media--]Image: https://m/b.png\n[--Media--]'
      )
    ).toEqual({
      text: 'middle',
      media: [
        { kind: 'image', url: 'https://m/a.png' },
        { kind: 'image', url: 'https://m/b.png' },
      ],
    });
  });

  it('leaves text with no block unchanged', () => {
    expect(extractAgentMessageMedia('just words\n')).toEqual({
      text: 'just words\n',
      media: [],
    });
  });

  it('gives no words for a block with nothing before it', () => {
    expect(
      extractAgentMessageMedia('[--Media--]Image: https://m/a.png\n[--Media--]')
    ).toEqual({
      text: '',
      media: [{ kind: 'image', url: 'https://m/a.png' }],
    });
  });

  // These links reach an image source and the viewer's external link.
  it('ends a link at the first whitespace or quote', () => {
    expect(
      extractAgentMessageMedia(
        '[--Media--]Image: https://m/a.png" onerror="x\n[--Media--]'
      ).media
    ).toEqual([{ kind: 'image', url: 'https://m/a.png' }]);
    expect(
      extractAgentMessageMedia(
        "[--Media--]Image: https://m/b.png' onerror='x\nVideo: https://m/c.mp4 and more\n[--Media--]"
      ).media
    ).toEqual([
      { kind: 'image', url: 'https://m/b.png' },
      { kind: 'video', url: 'https://m/c.mp4' },
    ]);
  });

  // A typed link no longer loads a picture for the teammates reading the thread.
  it('leaves a hand-typed link outside a block in the words', () => {
    const typed = 'Image: https://m/a.png\nuse this one';

    expect(extractAgentMessageMedia(typed)).toEqual({
      text: typed,
      media: [],
    });
  });

  it('leaves an unterminated marker in the words', () => {
    const typed = 'hello\n[--Media--]Image: https://m/a.png\n';

    expect(extractAgentMessageMedia(typed)).toEqual({
      text: typed,
      media: [],
    });
  });

  it('gives no media for a link that is not http or https', () => {
    expect(
      extractAgentMessageMedia(
        '[--Media--]Image: javascript:alert(1)\nVideo: data:video/mp4;base64,AA\nImage: httpsx://m/a.png\n[--Media--]'
      ).media
    ).toEqual([]);
  });

  it('reads an http link as well as an https one', () => {
    expect(
      extractAgentMessageMedia(
        '[--Media--]Image: http://localhost:4200/uploads/a.png\n[--Media--]'
      ).media
    ).toEqual([{ kind: 'image', url: 'http://localhost:4200/uploads/a.png' }]);
  });
});

// A reopened chat holds what CopilotKit holds live: tool calls on the assistant
// message and a tool message for each result, so one renderer draws both.
describe('storedAgentRowToChatMessages', () => {
  const invocation = (
    toolCallId: string,
    toolInvocation: Record<string, unknown> = {}
  ) => ({
    type: 'tool-invocation',
    toolInvocation: {
      state: 'result',
      toolCallId,
      toolName: 'generateImageTool',
      args: { prompt: 'a cat' },
      result: { id: `media-${toolCallId}`, path: `https://m/${toolCallId}.png` },
      ...toolInvocation,
    },
  });
  const words = (text: string) => [
    { type: 'step-start' },
    { type: 'text', text },
  ];
  const assistant = (parts: Record<string, unknown>[]) => ({
    id: 'r1',
    role: 'assistant',
    content: { format: 2, parts: parts as any },
  });
  const call = (id: string) => ({
    id,
    type: 'function',
    function: {
      name: 'generateImageTool',
      arguments: JSON.stringify({ prompt: 'a cat' }),
    },
  });
  const result = (id: string) => ({
    id: `r1:${id}`,
    role: 'tool',
    toolCallId: id,
    content: JSON.stringify({ id: `media-${id}`, path: `https://m/${id}.png` }),
  });

  it('keeps a user row as it is shown today, without an integrations block', () => {
    expect(
      storedAgentRowToChatMessages({
        id: 'u1',
        role: 'user',
        content:
          'post this\n[--integrations--]\nUse the following social media platforms: []\n[--integrations--]',
      })
    ).toEqual([{ id: 'u1', role: 'user', content: 'post this' }]);
  });

  it('keeps the media block of a user row, for the bubble to read', () => {
    const content = 'hello\n[--Media--]Image: https://m/a.png\n[--Media--]';

    expect(
      storedAgentRowToChatMessages({ id: 'u1', role: 'user', content })
    ).toEqual([{ id: 'u1', role: 'user', content }]);
  });

  it('turns words and an image into a message with its call, then its result', () => {
    expect(
      storedAgentRowToChatMessages(
        assistant([invocation('c1'), ...words('Done.')])
      )
    ).toEqual([
      { id: 'r1', role: 'assistant', content: 'Done.', toolCalls: [call('c1')] },
      result('c1'),
    ]);
  });

  it('keeps an image with no words', () => {
    expect(
      storedAgentRowToChatMessages(assistant([invocation('c1')]))
    ).toEqual([
      { id: 'r1', role: 'assistant', content: '', toolCalls: [call('c1')] },
      result('c1'),
    ]);
  });

  it('makes one message of two images, with two results in order', () => {
    expect(
      storedAgentRowToChatMessages(
        assistant([invocation('c1'), invocation('c2'), ...words('Both.')])
      )
    ).toEqual([
      {
        id: 'r1',
        role: 'assistant',
        content: 'Both.',
        toolCalls: [call('c1'), call('c2')],
      },
      result('c1'),
      result('c2'),
    ]);
  });

  // A refused attempt shows nothing, and a row left with nothing stays dropped.
  it('drops a row holding only a refusal', () => {
    expect(
      storedAgentRowToChatMessages(
        assistant([invocation('c1', { result: { error: 'No credits.' } })])
      )
    ).toEqual([]);
  });

  it('keeps the words of a refusal, with no tool call', () => {
    expect(
      storedAgentRowToChatMessages(
        assistant([
          invocation('c1', { result: { error: 'No credits.' } }),
          ...words('You are out of credits.'),
        ])
      )
    ).toEqual([
      { id: 'r1', role: 'assistant', content: 'You are out of credits.' },
    ]);
  });

  it('ignores a call in any state but result, whatever it holds', () => {
    expect(
      storedAgentRowToChatMessages(
        assistant([invocation('c1', { state: 'call' }), ...words('Trying.')])
      )
    ).toEqual([{ id: 'r1', role: 'assistant', content: 'Trying.' }]);
  });

  // A restored call with no renderer paints an empty container.
  it.each(['generateVideoTool', 'videoStatusTool', 'postsListTool'])(
    'ignores %s, which has no card yet',
    (toolName) => {
      expect(
        storedAgentRowToChatMessages(
          assistant([invocation('c1', { toolName }), ...words('Here.')])
        )
      ).toEqual([{ id: 'r1', role: 'assistant', content: 'Here.' }]);
    }
  );

  it('ignores a result that is not an object holding a link', () => {
    expect(
      storedAgentRowToChatMessages(
        assistant([invocation('c1', { result: 'done' }), ...words('Here.')])
      )
    ).toEqual([{ id: 'r1', role: 'assistant', content: 'Here.' }]);
  });

  // These reach an image source and the viewer's external link, as sent media does.
  it.each(['javascript:alert(1)', 'data:image/png;base64,AA', '/uploads/a.png'])(
    'ignores a result whose link is %s',
    (path) => {
      expect(
        storedAgentRowToChatMessages(
          assistant([invocation('c1', { result: { path } }), ...words('Here.')])
        )
      ).toEqual([{ id: 'r1', role: 'assistant', content: 'Here.' }]);
    }
  );

  // The poison guard: a turn that died mid-stream must not come back.
  it('drops a row with no words and no media', () => {
    expect(
      storedAgentRowToChatMessages({
        id: 'r1',
        role: 'assistant',
        content: { format: 2, parts: [] },
      })
    ).toEqual([]);
    expect(storedAgentRowToChatMessages({ id: 'r1', role: 'assistant' })).toEqual(
      []
    );
  });

  it('keeps a plain string row as it is shown today', () => {
    expect(
      storedAgentRowToChatMessages({
        id: 'r1',
        role: 'assistant',
        content: 'hello',
      })
    ).toEqual([{ id: 'r1', role: 'assistant', content: 'hello' }]);
  });
});
