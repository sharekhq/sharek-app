import { messagesToSend, SharekAgent } from './sharek.agent';

const u = (id: string) => ({ id, role: 'user', content: 'hi' });
const a = (id: string) => ({ id, role: 'assistant', content: 'hello' });
const toolCall = (id: string) => ({
  id,
  role: 'assistant',
  toolCalls: [{ id: 'tc', function: { name: 'x', arguments: '{}' } }],
});
const toolResult = (id: string) => ({
  id,
  role: 'tool',
  toolCallId: 'tc',
  content: 'done',
});

describe('messagesToSend', () => {
  it('sends a lone first message', () => {
    expect(messagesToSend([u('1')])).toEqual([u('1')]);
  });

  // The whole point: history is already in Mastra Memory, so resending it is
  // what wrote 4.7 copies of every thread.
  it('sends only the newest user message, not the history', () => {
    const list = [u('1'), a('2'), u('3'), a('4'), u('5')];
    expect(messagesToSend(list)).toEqual([u('5')]);
  });

  // renderAndWaitForResponse resumes a turn with the tool call and its result
  // trailing. Splitting them sends an orphan tool result, which is an API error.
  it('keeps a trailing tool call and its result with their user message', () => {
    const list = [u('1'), a('2'), u('3'), toolCall('4'), toolResult('5')];
    expect(messagesToSend(list)).toEqual([u('3'), toolCall('4'), toolResult('5')]);
  });

  // Defensive: never return nothing, and never guess when the shape is unfamiliar.
  it('falls back to the whole list when there is no user message', () => {
    const list = [a('1'), a('2')];
    expect(messagesToSend(list)).toEqual(list);
  });

  it('returns the input unchanged when it is empty or not an array', () => {
    expect(messagesToSend([])).toEqual([]);
    expect(messagesToSend(undefined as any)).toEqual(undefined);
    expect(messagesToSend('nonsense' as any)).toEqual('nonsense');
  });
});

describe('SharekAgent', () => {
  // Capture what reaches the vendor implementation by stubbing MastraAgent's
  // own run, two prototypes up from the instance.
  const build = () => {
    const seen: any[] = [];
    const agent: any = new SharekAgent({
      agentId: 'postiz',
      agent: { getMemory: () => undefined } as any,
      resourceId: 'org-1',
    });
    const vendorProto = Object.getPrototypeOf(Object.getPrototypeOf(agent));
    vendorProto.run = function (input: any) {
      seen.push(input);
      return { subscribe: () => undefined };
    };
    return { agent, seen };
  };

  it('passes only the newest exchange to the vendor run', () => {
    const { agent, seen } = build();
    agent.run({
      threadId: 't',
      runId: 'r',
      messages: [
        { id: '1', role: 'user' },
        { id: '2', role: 'assistant' },
        { id: '3', role: 'user' },
      ],
      tools: [],
      context: [],
    });
    expect(seen[0].messages).toEqual([{ id: '3', role: 'user' }]);
  });

  it('leaves every other field of the input untouched', () => {
    const { agent, seen } = build();
    agent.run({
      threadId: 't',
      runId: 'r',
      messages: [{ id: '1', role: 'user' }],
      tools: [{ name: 'x' }],
      context: [{ k: 'v' }],
      state: { a: 1 },
    } as any);
    expect(seen[0]).toMatchObject({
      threadId: 't',
      runId: 'r',
      tools: [{ name: 'x' }],
      context: [{ k: 'v' }],
      state: { a: 1 },
    });
  });
});

// The multi-turn storage proof lives outside jest: Mastra's LLM execution path
// uses a dynamic import(), which jest's VM rejects without
// --experimental-vm-modules, and enabling that flag breaks the tokenx CJS
// transform this config needs. It is verified with a standalone script instead
// (see documentation/superpowers/plans/2026-07-28-samy-token-cost-tier3.md).
