process.env.COPILOTKIT_TELEMETRY_DISABLED = 'true';

// The real MastraService builds Samy's agent and opens the Postgres store at
// import; the repository only calls its mastra(), which a stand-in answers here.
jest.mock('@gitroom/nestjs-libraries/chat/mastra.service', () => ({
  MastraService: class {},
}));

import { Agent } from '@mastra/core/agent';
import { Mastra } from '@mastra/core/mastra';
import { Memory } from '@mastra/memory';
import { InMemoryStore } from '@mastra/core/storage';
import {
  CopilotRuntime,
  copilotRuntimeNodeHttpEndpoint,
} from '@copilotkit/runtime';
import { getSharekAgents } from './sharek.agent';
import { ChatThreadsRepository } from './chat.threads.repository';
import { ChatThreadsService } from './chat.threads.service';

// Renames and pins chats through the service, on the real repository and
// Mastra's real agent loop and memory, and runs Samy on them through the real
// CopilotKit endpoint, as the browser does. Runs only under
// jest.integration.config.ts, see that file for why.

// The words of every model call, so a chat's generated title reads "reply" too.
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

// generateTitle is on, as Samy's agent has it, so a run names a chat whose stored
// title is empty (C12).
const samyOnMemory = () => {
  const agent = new Agent({
    id: 'sharek',
    name: 'Sharek',
    instructions: () => 'SYSTEM',
    model: stubModel,
    tools: {},
    memory: new Memory({
      storage: new InMemoryStore(),
      options: { generateTitle: true, lastMessages: 20 },
    }),
  } as any);
  const mastra = new Mastra({ agents: { postiz: agent }, logger: false });
  const service = new ChatThreadsService(
    new ChatThreadsRepository({
      mastra: async () => mastra,
    } as unknown as ConstructorParameters<typeof ChatThreadsRepository>[0])
  );
  const endpoint = copilotRuntimeNodeHttpEndpoint({
    endpoint: '/copilot/agent',
    runtime: new CopilotRuntime({
      agents: getSharekAgents({ mastra, resourceId: 'org-1' }),
    }),
  }) as unknown as (request: Request) => Promise<Response>;

  // One Samy run on the chat, read to its end, then the time the title takes.
  const run = async (threadId: string, runId: string) => {
    const response = await endpoint(
      new Request('http://localhost/copilot/agent', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          method: 'agent/run',
          params: { agentId: 'postiz' },
          body: {
            threadId,
            runId,
            messages: [{ id: `message-${runId}`, role: 'user', content: 'hi' }],
            state: {},
            tools: [],
            context: [],
            forwardedProps: {},
          },
        }),
      })
    );
    await response.text();
    await new Promise((resolve) => setTimeout(resolve, 250));
  };
  const chat = async (threadId: string) =>
    (await service.list('org-1')).threads.find(({ id }) => id === threadId);

  return { mastra, service, run, chat };
};

describe('Samy chats renamed and pinned through the service', () => {
  // Without this, a title kept through a run could only mean that no run writes one.
  it('control: a run names a chat whose title is empty', async () => {
    const { run, chat } = samyOnMemory();

    await run('thread-1', 'run-1');

    expect(await chat('thread-1')).toMatchObject({
      title: 'reply',
      pinned: false,
    });
  }, 30000);

  it('keeps its new name and its pin through a following run', async () => {
    const { service, run, chat } = samyOnMemory();
    await run('thread-1', 'run-1');

    await service.rename('org-1', 'thread-1', 'Spring menu');
    await service.setPinned('org-1', 'thread-1', true);
    await run('thread-1', 'run-2');

    expect(await chat('thread-1')).toMatchObject({
      title: 'Spring menu',
      pinned: true,
    });
  }, 30000);

  // The store keeps the updatedAt it's given, as PG's upsert does (research R12),
  // so a chat from an earlier day stays in that day's group, pinned or not.
  it('leaves updatedAt where the last message put it, so the chat keeps its place', async () => {
    const { mastra, service } = samyOnMemory();
    const memory = await mastra.getAgent('postiz').getMemory();
    await memory!.saveThread({
      thread: {
        id: 'thread-old',
        resourceId: 'org-1',
        title: 'Cold brew launch plan',
        createdAt: new Date('2026-10-01T08:00:00.000Z'),
        updatedAt: new Date('2026-10-02T09:12:44.000Z'),
      },
    });
    await memory!.saveThread({
      thread: {
        id: 'thread-new',
        resourceId: 'org-1',
        title: 'Spring menu',
        createdAt: new Date('2026-11-01T08:00:00.000Z'),
        updatedAt: new Date('2026-11-07T18:01:02.000Z'),
      },
    });

    await service.setPinned('org-1', 'thread-old', true);
    await service.rename('org-1', 'thread-old', 'Iced latte week');
    await service.setPinned('org-1', 'thread-old', false);

    await expect(service.list('org-1')).resolves.toEqual({
      threads: [
        {
          id: 'thread-new',
          title: 'Spring menu',
          pinned: false,
          updatedAt: '2026-11-07T18:01:02.000Z',
        },
        {
          id: 'thread-old',
          title: 'Iced latte week',
          pinned: false,
          updatedAt: '2026-10-02T09:12:44.000Z',
        },
      ],
    });
  });
});
