import { extractAgentMessageText } from './extract.agent.message.text';

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

  it('falls back to parts when the flattened content is an empty string', () => {
    expect(
      extractAgentMessageText({
        role: 'assistant',
        content: { format: 2, content: '', parts: [{ type: 'text', text: 'recovered' }] },
      })
    ).toBe('recovered');
  });
});
