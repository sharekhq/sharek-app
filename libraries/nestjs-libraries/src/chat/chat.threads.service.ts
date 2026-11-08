import { Injectable, NotFoundException } from '@nestjs/common';
import type { StorageThreadType } from '@mastra/core/memory';
import { ChatThreadsRepository } from '@gitroom/nestjs-libraries/chat/chat.threads.repository';

@Injectable()
export class ChatThreadsService {
  constructor(private _chatThreadsRepository: ChatThreadsRepository) {}

  async list(orgId: string) {
    const threads = await this._chatThreadsRepository.listThreads(orgId);
    return { threads: threads.map((thread) => this.toChat(thread)) };
  }

  async rename(orgId: string, threadId: string, title: string) {
    const thread = await this.getChat(orgId, threadId);
    return this.toChat(
      await this._chatThreadsRepository.saveThread({
        ...thread,
        title: title.trim(),
      })
    );
  }

  async setPinned(orgId: string, threadId: string, pinned: boolean) {
    const thread = await this.getChat(orgId, threadId);
    return this.toChat(
      await this._chatThreadsRepository.saveThread({
        ...thread,
        metadata: { ...thread.metadata, pinned },
      })
    );
  }

  // Another workspace's chat answers as a missing one, so its id reveals nothing.
  private async getChat(orgId: string, threadId: string) {
    const thread = await this._chatThreadsRepository.getThread(threadId);
    if (!thread || thread.resourceId !== orgId) {
      throw new NotFoundException('Chat not found');
    }
    return thread;
  }

  // Mastra's title is optional; the contract's is a string, '' until named.
  private toChat(thread: StorageThreadType) {
    return {
      id: thread.id,
      title: thread.title ?? '',
      pinned: thread.metadata?.pinned === true,
      updatedAt: thread.updatedAt.toISOString(),
    };
  }
}
