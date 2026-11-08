// The real MastraService builds the agent and opens the Postgres store at import,
// and only which memory call each method makes is under test, so the service is a
// shell and the memory behind it a set of spies.
jest.mock('@gitroom/nestjs-libraries/chat/mastra.service', () => ({
  MastraService: class {},
}));

import type { StorageThreadType } from '@mastra/core/memory';
import { ChatThreadsRepository } from './chat.threads.repository';

// A chat last used weeks ago, with metadata of Mastra's own beside the pin.
const stored: StorageThreadType = {
  id: 'thread-1',
  resourceId: 'org-1',
  title: 'Cold brew launch plan',
  createdAt: new Date('2026-10-01T08:00:00.000Z'),
  updatedAt: new Date('2026-10-02T09:12:44.000Z'),
  metadata: { pinned: true, mastra: { om: { lastObservedAt: 1 } } },
};
const other: StorageThreadType = {
  id: 'thread-2',
  resourceId: 'org-1',
  title: '',
  createdAt: new Date('2026-09-01T08:00:00.000Z'),
  updatedAt: new Date('2026-09-01T08:05:00.000Z'),
};

const repositoryOnMemory = () => {
  const memory = {
    listThreads: jest.fn().mockResolvedValue({
      threads: [stored, other],
      total: 2,
      page: 0,
      perPage: false,
      hasMore: false,
    }),
    getThreadById: jest.fn().mockResolvedValue(stored),
    saveThread: jest.fn(
      async ({ thread }: { thread: StorageThreadType }) => thread
    ),
    updateThread: jest.fn(),
  };
  const getAgent = jest.fn(() => ({ getMemory: async () => memory }));
  const repository = new ChatThreadsRepository({
    mastra: async () => ({ getAgent }),
  } as unknown as ConstructorParameters<typeof ChatThreadsRepository>[0]);
  return { repository, memory, getAgent };
};

// Mastra's thread rows have no Prisma model, so the repository wraps the memory
// of the agent Samy runs on (research R12, R13; FR-023).
describe('ChatThreadsRepository', () => {
  it("lists every chat of the workspace, last used first, from the Samy agent's memory", async () => {
    const { repository, memory, getAgent } = repositoryOnMemory();

    await expect(repository.listThreads('org-1')).resolves.toEqual([
      stored,
      other,
    ]);

    expect(getAgent).toHaveBeenCalledWith('postiz');
    expect(memory.listThreads).toHaveBeenCalledWith({
      filter: { resourceId: 'org-1' },
      orderBy: { field: 'updatedAt', direction: 'DESC' },
      perPage: false,
    });
  });

  it('reads one chat by its id', async () => {
    const { repository, memory } = repositoryOnMemory();

    await expect(repository.getThread('thread-1')).resolves.toBe(stored);

    expect(memory.getThreadById).toHaveBeenCalledWith({
      threadId: 'thread-1',
    });
  });

  it('reads a missing chat as null', async () => {
    const { repository, memory } = repositoryOnMemory();
    memory.getThreadById.mockResolvedValueOnce(null);

    await expect(repository.getThread('gone')).resolves.toBeNull();
  });

  it('saves exactly the chat it is given, its stored updatedAt included', async () => {
    const { repository, memory } = repositoryOnMemory();
    const renamed: StorageThreadType = {
      ...stored,
      title: 'Spring menu',
      metadata: { ...stored.metadata, pinned: false },
    };

    await expect(repository.saveThread(renamed)).resolves.toBe(renamed);

    expect(memory.saveThread).toHaveBeenCalledTimes(1);
    expect(memory.saveThread).toHaveBeenCalledWith({ thread: renamed });
    expect(memory.saveThread.mock.calls[0][0].thread).toBe(renamed);
  });

  // updateThread sets updatedAt to now, which would move a pinned or renamed chat
  // to Today in the history.
  it('never writes through updateThread', async () => {
    const { repository, memory } = repositoryOnMemory();

    await repository.listThreads('org-1');
    await repository.getThread('thread-1');
    await repository.saveThread(stored);

    expect(memory.updateThread).not.toHaveBeenCalled();
  });
});
