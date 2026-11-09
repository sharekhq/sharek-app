import { Global, Module } from '@nestjs/common';
import { LoadToolsService } from '@gitroom/nestjs-libraries/chat/load.tools.service';
import { MastraService } from '@gitroom/nestjs-libraries/chat/mastra.service';
import { toolList } from '@gitroom/nestjs-libraries/chat/tools/tool.list';
import { McpRelayService } from '@gitroom/nestjs-libraries/chat/mcp.relay.service';
import { SamyImageTool } from '@gitroom/nestjs-libraries/chat/tools/samy.image.tool';
import { SamyImageReader } from '@gitroom/nestjs-libraries/chat/samy.image.reader';
import { ChatThreadsRepository } from '@gitroom/nestjs-libraries/chat/chat.threads.repository';
import { ChatThreadsService } from '@gitroom/nestjs-libraries/chat/chat.threads.service';
import { TavilyService } from '@gitroom/nestjs-libraries/tavily/tavily.service';
import { ReadWebPageTool } from '@gitroom/nestjs-libraries/chat/tools/read.web.page.tool';

@Global()
@Module({
  // SamyImageTool and the web tools stay out of toolList, which is what every outside connection lists.
  providers: [
    MastraService,
    LoadToolsService,
    McpRelayService,
    SamyImageTool,
    SamyImageReader,
    TavilyService,
    ReadWebPageTool,
    ChatThreadsRepository,
    ChatThreadsService,
    ...toolList,
  ],
  get exports() {
    return this.providers;
  },
})
export class ChatModule {}
