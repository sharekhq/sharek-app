import { Injectable } from '@nestjs/common';
import type { StorageThreadType } from '@mastra/core/memory';
import { MastraService } from '@gitroom/nestjs-libraries/chat/mastra.service';

// Samy's chats are Mastra thread rows, which have no Prisma model, so they're read
// and written through the agent's memory, and only here.
@Injectable()
export class ChatThreadsRepository {
  constructor(private _mastraService: MastraService) {}

  private async memory() {
    const mastra = await this._mastraService.mastra();
    return mastra.getAgent('postiz').getMemory();
  }

  async listThreads(resourceId: string) {
    const memory = await this.memory();
    const { threads } = await memory.listThreads({
      filter: { resourceId },
      orderBy: { field: 'updatedAt', direction: 'DESC' },
      perPage: false,
    });
    return threads;
  }

  async getThread(threadId: string) {
    const memory = await this.memory();
    return memory.getThreadById({ threadId });
  }

  // saveThread writes the updatedAt it's given; updateThread would set it to now.
  async saveThread(thread: StorageThreadType) {
    const memory = await this.memory();
    return memory.saveThread({ thread });
  }
}
