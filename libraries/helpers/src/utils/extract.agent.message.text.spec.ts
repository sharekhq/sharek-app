import {
  extractAgentMessageMedia,
  extractAgentMessageText,
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
