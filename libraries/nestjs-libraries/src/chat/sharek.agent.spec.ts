import { AbstractAgent, EventSchemas, EventType } from '@ag-ui/client';
import { InMemoryAgentRunner } from '@copilotkit/runtime/v2';
import {
  filter,
  firstValueFrom,
  lastValueFrom,
  Observable,
  toArray,
} from 'rxjs';
import {
  logRunError,
  messagesToSend,
  SharekAgent,
  SharekAgentRunner,
} from './sharek.agent';

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

  // A reopened chat's video result carries when it started, for the browser's card.
  // It must not reach the model or the database.
  it('leaves a restored tool result behind with the history', () => {
    const list = [
      u('1'),
      toolCall('2'),
      {
        ...toolResult('3'),
        content: JSON.stringify({
          jobId: 'video_org-1_abc',
          startedAt: '2026-11-06T10:00:00.000Z',
        }),
      },
      u('4'),
    ];

    expect(messagesToSend(list)).toEqual([u('4')]);
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

  // CopilotKit 1.72 runs a per-request clone of every registered agent, not the
  // agent itself. MastraAgent.clone() builds a plain MastraAgent, which would
  // quietly bring back the whole-thread resend.
  describe('clone', () => {
    it('is a SharekAgent', () => {
      const { agent } = build();
      expect(agent.clone()).toBeInstanceOf(SharekAgent);
    });

    it('still passes only the newest exchange to the vendor run', () => {
      const { agent, seen } = build();
      agent.clone().run({
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

    it('carries the original headers as a copy', () => {
      const { agent } = build();
      agent.headers = { authorization: 'x' };
      const cloned = agent.clone();
      expect(cloned.headers).toEqual({ authorization: 'x' });
      expect(cloned.headers).not.toBe(agent.headers);
    });
  });
});

// A reopened chat is replayed from the runner's memory of the thread. On Stop,
// CopilotKit 1.72 ends the run with a RUN_FINISHED that has no threadId or
// runId, and the browser checks each replayed event with EventSchemas.parse:
// the first one that fails ends the replay, so every turn after a stopped reply
// went missing. These drive the real runner; only the agent is a stand-in.
describe('SharekAgentRunner', () => {
  // Stops like MastraAgent 1.1.4: the stream completes with no RUN_FINISHED of
  // its own, so the runner writes one. A stopped reply is cut during a tool
  // call, as when the user stops an image.
  class ReplyAgent extends AbstractAgent {
    private aborts = new Set<AbortController>();

    constructor(threadId: string, private readonly stopped: boolean) {
      super({ threadId });
    }

    run(input: any): any {
      return new Observable<any>((subscriber) => {
        const abort = new AbortController();
        this.aborts.add(abort);
        abort.signal.addEventListener('abort', () => subscriber.complete());

        const { threadId, runId } = input;
        const messageId = `reply-${runId}`;
        subscriber.next({ type: EventType.RUN_STARTED, threadId, runId });
        subscriber.next({
          type: EventType.TEXT_MESSAGE_START,
          messageId,
          role: 'assistant',
        });
        subscriber.next({
          type: EventType.TEXT_MESSAGE_CONTENT,
          messageId,
          delta: `reply ${runId}`,
        });
        subscriber.next({ type: EventType.TEXT_MESSAGE_END, messageId });

        if (this.stopped) {
          subscriber.next({
            type: EventType.TOOL_CALL_START,
            toolCallId: `image-${runId}`,
            toolCallName: 'generateImage',
            parentMessageId: messageId,
          });
          return;
        }

        subscriber.next({ type: EventType.RUN_FINISHED, threadId, runId });
        subscriber.complete();
      });
    }

    abortRun() {
      this.aborts.forEach((abort) => abort.abort());
      this.aborts.clear();
    }
  }

  // The runners share one process-wide store, as in production, so every test
  // writes its own thread.
  let threads = 0;
  const newThread = () => `reopen-${++threads}`;

  const turn = async (threadId: string, runId: string, stopped = false) => {
    const runner = new SharekAgentRunner();
    const events = runner.run({
      threadId,
      agent: new ReplyAgent(threadId, stopped) as any,
      input: {
        threadId,
        runId,
        messages: [{ id: `ask-${runId}`, role: 'user', content: 'hi' }],
        tools: [],
        context: [],
        state: {},
        forwardedProps: {},
      },
    });

    if (stopped) {
      await firstValueFrom(
        events.pipe(
          filter((event: any) => event.type === EventType.TOOL_CALL_START)
        )
      );
      await runner.stop({ threadId, runId });
    }

    // The run is in the store by the time its events complete.
    await lastValueFrom(events, { defaultValue: undefined });
  };

  const replay = (runner: InMemoryAgentRunner, threadId: string) =>
    lastValueFrom(runner.connect({ threadId }).pipe(toArray())) as Promise<
      any[]
    >;

  const replies = (events: any[]) =>
    events
      .filter((event) => event.type === EventType.TEXT_MESSAGE_CONTENT)
      .map((event) => event.delta);

  it('replays every turn after a reply the user stopped', async () => {
    const threadId = newThread();
    await turn(threadId, 'r1');
    await turn(threadId, 'r2', true);
    await turn(threadId, 'r3');

    const events = await replay(new SharekAgentRunner(), threadId);

    events.forEach((event) =>
      expect(() => EventSchemas.parse(event)).not.toThrow()
    );
    expect(replies(events)).toEqual(['reply r1', 'reply r2', 'reply r3']);
  });

  it("ends each stopped reply with its own run's ids", async () => {
    const threadId = newThread();
    await turn(threadId, 'r1');
    await turn(threadId, 'r2', true);
    await turn(threadId, 'r3', true);
    await turn(threadId, 'r4');

    const events = await replay(new SharekAgentRunner(), threadId);
    const finished = events.filter(
      (event) => event.type === EventType.RUN_FINISHED
    );

    expect(
      finished.map(({ threadId, runId }) => ({ threadId, runId }))
    ).toEqual(['r1', 'r2', 'r3', 'r4'].map((runId) => ({ threadId, runId })));
  });

  it('passes every other event through as the vendor replays it', async () => {
    const threadId = newThread();
    await turn(threadId, 'r1');
    await turn(threadId, 'r2', true);
    await turn(threadId, 'r3');

    const ours = await replay(new SharekAgentRunner(), threadId);
    const vendor = await replay(new InMemoryAgentRunner(), threadId);
    const others = (events: any[]) =>
      events.filter((event) => event.type !== EventType.RUN_FINISHED);

    expect(ours).toHaveLength(vendor.length);
    expect(others(ours)).toEqual(others(vendor));
  });

  it('leaves a thread with no stopped reply as the vendor replays it', async () => {
    const threadId = newThread();
    await turn(threadId, 'r1');
    await turn(threadId, 'r2');

    expect(await replay(new SharekAgentRunner(), threadId)).toEqual(
      await replay(new InMemoryAgentRunner(), threadId)
    );
  });
});

describe('logRunError', () => {
  let logged: { context: string; message: string }[];
  let spy: jest.SpyInstance;

  // console.error, not Nest's Logger: Sentry's console integration records it
  // as a log, where Nest's Logger writes to stdout directly and never arrives.
  beforeEach(() => {
    logged = [];
    spy = jest
      .spyOn(console, 'error')
      .mockImplementation((context?: any, message?: any) =>
        logged.push({ context, message: String(message) })
      );
  });

  afterEach(() => spy.mockRestore());

  const failedRun = (error: unknown) => ({
    type: 'error' as const,
    timestamp: Date.now(),
    context: {
      source: 'runtime' as const,
      threadId: 'thread-1',
      runId: 'run-1',
      request: { operation: 'agent.run', startTime: Date.now() - 1500 },
      metadata: { phase: 'sse.subscription' },
    },
    error,
  });

  // A turn the user saw go silent left nothing in the server logs: CopilotKit
  // hands a run's failure to the browser, and the chat shows nothing.
  it('logs the organization, thread, run, phase and error of a failed run', () => {
    logRunError(
      failedRun(new Error('Run ended without emitting a terminal event')),
      'org-9'
    );

    expect(logged).toHaveLength(1);
    expect(logged[0].context).toBe('SamyRunError');
    expect(JSON.parse(logged[0].message)).toMatchObject({
      org: 'org-9',
      thread: 'thread-1',
      run: 'run-1',
      phase: 'sse.subscription',
      error: 'Run ended without emitting a terminal event',
    });
  });

  it('records how long the run had been going', () => {
    logRunError(failedRun(new Error('x')), 'org-9');

    expect(JSON.parse(logged[0].message).ms).toBeGreaterThanOrEqual(1500);
  });

  it('logs a failure that is not an Error', () => {
    logRunError(failedRun('Thread already running'), 'org-9');

    expect(JSON.parse(logged[0].message).error).toBe('Thread already running');
  });

  it('never throws, whatever it is handed', () => {
    for (const event of [undefined, null, {}, { context: null }, 'nonsense']) {
      expect(() => logRunError(event as any, 'org-9')).not.toThrow();
    }
  });

  it('still logs the organization when the event carries nothing', () => {
    logRunError(undefined as any, 'org-9');

    expect(JSON.parse(logged[0].message)).toMatchObject({
      org: 'org-9',
      thread: 'unknown',
      run: 'unknown',
    });
  });

  it('survives a logger that throws', () => {
    spy.mockImplementation(() => {
      throw new Error('logger down');
    });

    expect(() => logRunError(failedRun(new Error('x')), 'org-9')).not.toThrow();
  });
});

// The multi-turn storage proof drives a real Mastra agent, which jest can only
// run under jest.integration.config.ts: see sharek.agent.integration.spec.ts.
