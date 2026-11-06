import { Global, Module } from '@nestjs/common';
import { LoadToolsService } from '@gitroom/nestjs-libraries/chat/load.tools.service';
import { MastraService } from '@gitroom/nestjs-libraries/chat/mastra.service';
import { toolList } from '@gitroom/nestjs-libraries/chat/tools/tool.list';
import { McpRelayService } from '@gitroom/nestjs-libraries/chat/mcp.relay.service';
import { SamyImageTool } from '@gitroom/nestjs-libraries/chat/tools/samy.image.tool';

@Global()
@Module({
  // SamyImageTool stays out of toolList, which is what every outside connection lists.
  providers: [
    MastraService,
    LoadToolsService,
    McpRelayService,
    SamyImageTool,
    ...toolList,
  ],
  get exports() {
    return this.providers;
  },
})
export class ChatModule {}
