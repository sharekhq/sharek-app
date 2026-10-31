// Reopening a Samy thread loads it through getMessagesList, so what recall()
// returns here is all the user gets back of the conversation. The memory is
// Mastra's real one on its in-memory store, which pages and orders messages as
// production's PostgresStore does (oldest first when no order is given); the
// controller's other dependencies are shells, as in copilot.controller.chat.spec.
jest.mock('@gitroom/nestjs-libraries/chat/sharek.agent', () => ({
  getSharekAgents: () => ({}),
  logRunError: () => undefined,
}));
jest.mock('@gitroom/nestjs-libraries/chat/mastra.service', () => ({
  MastraService: class {},
}));
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/subscriptions/subscription.service',
  () => ({ SubscriptionService: class {} })
);

import type { MastraDBMessage } from '@mastra/core/memory';
import { Memory } from '@mastra/memory';
import { InMemoryStore } from '@mastra/core/storage';
import { CopilotController } from './copilot.controller';

type GetMessagesList = CopilotController['getMessagesList'];

// lastMessages is 20, as in load.tools.service.ts; a longer thread shows whether
// the endpoint stops at that window, or at the 10 it used to serve.
const reopenThreadOf = async (count: number) => {
  const memory = new Memory({
    storage: new InMemoryStore(),
    options: { generateTitle: false, lastMessages: 20 },
  });
  await memory.saveThread({
    thread: {
      id: 'thread-1',
      resourceId: 'org-1',
      title: 'Thread',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });
  await memory.saveMessages({
    messages: Array.from(
      { length: count },
      (_, i): MastraDBMessage => ({
        id: `message-${i + 1}`,
        threadId: 'thread-1',
        resourceId: 'org-1',
        role: i % 2 === 0 ? 'user' : 'assistant',
        createdAt: new Date(Date.UTC(2026, 9, 31, 9, i)),
        content: {
          format: 2,
          parts: [{ type: 'text', text: `message ${i + 1}` }],
        },
      })
    ),
  });

  const controller = new CopilotController(
    {} as unknown as ConstructorParameters<typeof CopilotController>[0],
    {
      mastra: async () => ({
        getAgent: () => ({ getMemory: async () => memory }),
      }),
    } as unknown as ConstructorParameters<typeof CopilotController>[1]
  );
  return controller.getMessagesList(
    { id: 'org-1' } as unknown as Parameters<GetMessagesList>[0],
    'thread-1'
  );
};

describe('CopilotController thread history', () => {
  it('brings back every message of a reopened thread, oldest first', async () => {
    const { messages } = await reopenThreadOf(25);
    expect(messages.map((m: MastraDBMessage) => m.id)).toEqual(
      Array.from({ length: 25 }, (_, i) => `message-${i + 1}`)
    );
  });
});
