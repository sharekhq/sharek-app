import { Agent } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';
import { InMemoryStore } from '@mastra/core/storage';
import { messagesToSend } from './sharek.agent';

// Drives a real Mastra agent against an in-memory store to prove the claim
// Tier 3 exists for: the thread stops being re-saved on every turn. Runs only
// under jest.integration.config.ts — see that file for why.

const stubModel: any = {
  specificationVersion: 'v2',
  provider: 'stub',
  modelId: 'stub',
  supportedUrls: {},
  async doStream() {
    return {
      stream: new ReadableStream({
        start(c) {
          c.enqueue({ type: 'stream-start', warnings: [] });
          c.enqueue({ type: 'text-start', id: '0' });
          c.enqueue({ type: 'text-delta', id: '0', delta: 'reply' });
          c.enqueue({ type: 'text-end', id: '0' });
          c.enqueue({
            type: 'finish',
            finishReason: 'stop',
            usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          });
          c.close();
        },
      }),
      request: {},
      response: {},
    };
  },
  async doGenerate() {
    return {
      content: [{ type: 'text', text: 'reply' }],
      finishReason: 'stop',
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      warnings: [],
    };
  },
};

const TURNS = 6;
const REAL_MESSAGES = TURNS * 2; // one user and one assistant per turn

const storedRowsAfterTurns = async (useSlice: boolean) => {
  const agent = new Agent({
    id: 'a',
    name: 'a',
    instructions: () => 'SYSTEM',
    model: stubModel,
    tools: {},
    memory: new Memory({
      storage: new InMemoryStore(),
      options: { generateTitle: false, lastMessages: 20 },
    }),
  } as any);

  // mirrors CopilotKit, which resends its whole message list every turn
  const clientThread: any[] = [];
  for (let n = 1; n <= TURNS; n++) {
    clientThread.push({ role: 'user', content: `message ${n}` });
    const sent = useSlice
      ? messagesToSend(clientThread.slice() as any)
      : clientThread.slice();

    const res = await agent.stream(sent as any, {
      memory: { thread: 'T', resource: 'R' },
    } as any);
    for await (const _ of res.fullStream as any) {
      /* drain */
    }
    await new Promise((r) => setTimeout(r, 250));

    clientThread.push({
      role: 'assistant',
      content: [{ type: 'text', text: 'reply' }],
    });
  }

  const memory = await agent.getMemory();
  const stored = await memory!.recall({
    threadId: 'T',
    resourceId: 'R',
    perPage: 500,
  });
  return stored.messages.length;
};

describe('Samy conversation storage', () => {
  it('stores exactly one row per message when only the newest exchange is sent', async () => {
    expect(await storedRowsAfterTurns(true)).toBe(REAL_MESSAGES);
  }, 30000);

  // The behaviour this replaced. Production reached 368 rows for 78 real
  // messages; if this ever stops being far worse, the comparison is broken.
  it('re-appends the whole thread when the client list is sent verbatim', async () => {
    expect(await storedRowsAfterTurns(false)).toBeGreaterThan(REAL_MESSAGES * 2);
  }, 30000);
});
