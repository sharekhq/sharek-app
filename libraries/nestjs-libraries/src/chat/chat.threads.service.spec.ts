// The real repository reaches Mastra through MastraService, which builds the agent
// and opens the Postgres store at import; the service only sees the three methods,
// so the repository is a shell and its methods spies.
jest.mock('@gitroom/nestjs-libraries/chat/chat.threads.repository', () => ({
  ChatThreadsRepository: class {},
}));

import { NotFoundException } from '@nestjs/common';
import type { StorageThreadType } from '@mastra/core/memory';
import { ChatThreadsService } from './chat.threads.service';

// A chat last used weeks ago, with metadata of Mastra's own beside the pin.
const pinned: StorageThreadType = {
  id: 'thread-1',
  resourceId: 'org-1',
  title: 'Cold brew launch plan',
  createdAt: new Date('2026-10-01T08:00:00.000Z'),
  updatedAt: new Date('2026-10-02T09:12:44.000Z'),
  metadata: { pinned: true, mastra: { om: { lastObservedAt: 1 } } },
};
const unpinned: StorageThreadType = {
  id: 'thread-2',
  resourceId: 'org-1',
  title: 'Spring menu',
  createdAt: new Date('2026-11-01T08:00:00.000Z'),
  updatedAt: new Date('2026-11-08T09:12:44.000Z'),
  metadata: { pinned: false, mastra: { om: { lastObservedAt: 2 } } },
};
// A chat before its first reply ends: no title and no metadata yet.
const untitled: StorageThreadType = {
  id: 'thread-3',
  resourceId: 'org-1',
  title: '',
  createdAt: new Date('2026-09-01T08:00:00.000Z'),
  updatedAt: new Date('2026-09-01T08:05:00.000Z'),
};
const elsewhere: StorageThreadType = {
  ...unpinned,
  id: 'thread-9',
  resourceId: 'org-2',
};

const serviceOnRepository = (stored: StorageThreadType | null = unpinned) => {
  const repository = {
    // The repository's own order, last used first, which isn't pinned first.
    listThreads: jest.fn().mockResolvedValue([unpinned, pinned, untitled]),
    getThread: jest.fn().mockResolvedValue(stored),
    saveThread: jest.fn(async (thread: StorageThreadType) => thread),
  };
  const service = new ChatThreadsService(
    repository as unknown as ConstructorParameters<typeof ChatThreadsService>[0]
  );
  return { service, repository };
};

// The Samy page's history: the workspace's chats, renamed and pinned for everyone
// in it, without moving them out of their date group (research R12, R13; FR-023).
describe('ChatThreadsService', () => {
  it("lists the workspace's chats in the repository's order, each as id, title, pinned and updatedAt", async () => {
    const { service, repository } = serviceOnRepository();

    await expect(service.list('org-1')).resolves.toEqual({
      threads: [
        {
          id: 'thread-2',
          title: 'Spring menu',
          pinned: false,
          updatedAt: '2026-11-08T09:12:44.000Z',
        },
        {
          id: 'thread-1',
          title: 'Cold brew launch plan',
          pinned: true,
          updatedAt: '2026-10-02T09:12:44.000Z',
        },
        {
          id: 'thread-3',
          title: '',
          pinned: false,
          updatedAt: '2026-09-01T08:05:00.000Z',
        },
      ],
    });

    expect(repository.listThreads).toHaveBeenCalledWith('org-1');
  });

  // Mastra's thread type leaves the title optional, and the contract's title is
  // a string (contracts/chat-threads-api.md).
  it("lists a chat stored with no title as ''", async () => {
    const { service, repository } = serviceOnRepository();
    repository.listThreads.mockResolvedValueOnce([
      { ...untitled, title: undefined },
    ]);

    const { threads } = await service.list('org-1');

    expect(threads).toEqual([
      {
        id: 'thread-3',
        title: '',
        pinned: false,
        updatedAt: '2026-09-01T08:05:00.000Z',
      },
    ]);
  });

  it('reads a chat as pinned only when its metadata.pinned is true', async () => {
    const { service, repository } = serviceOnRepository();
    repository.listThreads.mockResolvedValueOnce([
      { ...unpinned, id: 'a', metadata: { pinned: 'true' } },
      { ...unpinned, id: 'b', metadata: { pinned: 1 } },
      { ...unpinned, id: 'c', metadata: {} },
      { ...unpinned, id: 'd', metadata: { pinned: true } },
    ]);

    const { threads } = await service.list('org-1');

    expect(threads.map(({ id, pinned }) => [id, pinned])).toEqual([
      ['a', false],
      ['b', false],
      ['c', false],
      ['d', true],
    ]);
  });

  // An id from another workspace gets the answer a missing chat gets, so it
  // reveals nothing about that workspace.
  describe.each([
    [
      'rename',
      (service: ChatThreadsService) =>
        service.rename('org-1', 'thread-9', 'Spring menu'),
    ],
    [
      'setPinned',
      (service: ChatThreadsService) =>
        service.setPinned('org-1', 'thread-9', true),
    ],
  ])('%s', (_name, call) => {
    it('refuses a missing chat with NotFoundException and saves nothing', async () => {
      const { service, repository } = serviceOnRepository(null);

      await expect(call(service)).rejects.toBeInstanceOf(NotFoundException);

      expect(repository.getThread).toHaveBeenCalledWith('thread-9');
      expect(repository.saveThread).not.toHaveBeenCalled();
    });

    it("refuses another workspace's chat just as it refuses a missing one", async () => {
      const missing = await call(serviceOnRepository(null).service).catch(
        (error) => error
      );
      const { service, repository } = serviceOnRepository(elsewhere);

      const foreign = await call(service).catch((error) => error);

      expect(foreign).toBeInstanceOf(NotFoundException);
      expect(foreign.getResponse()).toEqual(missing.getResponse());
      expect(repository.saveThread).not.toHaveBeenCalled();
    });
  });

  it('renames the stored chat to the trimmed title, keeping its metadata, createdAt and updatedAt', async () => {
    const { service, repository } = serviceOnRepository(pinned);

    await service.rename('org-1', 'thread-1', '  Iced latte week  ');

    expect(repository.getThread).toHaveBeenCalledWith('thread-1');
    expect(repository.saveThread).toHaveBeenCalledTimes(1);
    expect(repository.saveThread).toHaveBeenCalledWith({
      id: 'thread-1',
      resourceId: 'org-1',
      title: 'Iced latte week',
      createdAt: new Date('2026-10-01T08:00:00.000Z'),
      updatedAt: new Date('2026-10-02T09:12:44.000Z'),
      metadata: { pinned: true, mastra: { om: { lastObservedAt: 1 } } },
    });
  });

  it('pins the stored chat, keeping every other metadata key, the title, createdAt and updatedAt', async () => {
    const { service, repository } = serviceOnRepository(unpinned);

    await service.setPinned('org-1', 'thread-2', true);

    expect(repository.getThread).toHaveBeenCalledWith('thread-2');
    expect(repository.saveThread).toHaveBeenCalledTimes(1);
    expect(repository.saveThread).toHaveBeenCalledWith({
      id: 'thread-2',
      resourceId: 'org-1',
      title: 'Spring menu',
      createdAt: new Date('2026-11-01T08:00:00.000Z'),
      updatedAt: new Date('2026-11-08T09:12:44.000Z'),
      metadata: { pinned: true, mastra: { om: { lastObservedAt: 2 } } },
    });
  });

  it('unpins the stored chat the same way', async () => {
    const { service, repository } = serviceOnRepository(pinned);

    await service.setPinned('org-1', 'thread-1', false);

    expect(repository.saveThread).toHaveBeenCalledWith({
      ...pinned,
      metadata: { pinned: false, mastra: { om: { lastObservedAt: 1 } } },
    });
  });

  it('pins a chat that has no metadata yet', async () => {
    const { service, repository } = serviceOnRepository(untitled);

    await service.setPinned('org-1', 'thread-3', true);

    expect(repository.saveThread).toHaveBeenCalledWith({
      ...untitled,
      metadata: { pinned: true },
    });
  });

  it('answers a rename with the saved chat in the shape the list gives it', async () => {
    const { service } = serviceOnRepository(pinned);

    await expect(
      service.rename('org-1', 'thread-1', 'Iced latte week')
    ).resolves.toEqual({
      id: 'thread-1',
      title: 'Iced latte week',
      pinned: true,
      updatedAt: '2026-10-02T09:12:44.000Z',
    });
  });

  it('answers a pin with the saved chat in the shape the list gives it', async () => {
    const { service } = serviceOnRepository(unpinned);

    await expect(service.setPinned('org-1', 'thread-2', true)).resolves.toEqual(
      {
        id: 'thread-2',
        title: 'Spring menu',
        pinned: true,
        updatedAt: '2026-11-08T09:12:44.000Z',
      }
    );
  });
});
