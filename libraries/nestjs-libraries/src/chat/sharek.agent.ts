import { MastraAgent } from '@ag-ui/mastra';
import type { Mastra } from '@mastra/core';
import type { RequestContext } from '@mastra/core/request-context';

// @copilotkit/runtime ships its own nested rxjs and @ag-ui/client, so importing
// Observable/RunAgentInput/AbstractAgent here resolves to a *different* copy of
// those types than the vendor's own signature uses, and nothing lines up.
// Deriving from MastraAgent keeps us on whichever copy it actually compiled
// against, whatever the install hoists.
type VendorRun = MastraAgent['run'];
type VendorRunInput = Parameters<VendorRun>[0];
type VendorRunOutput = ReturnType<VendorRun>;

export type AguiMessage = { id?: string; role?: string; [key: string]: unknown };

/**
 * CopilotKit resends the entire thread on every turn, and Mastra saves whatever
 * it is given — its dedupe is by message id, and @ag-ui/mastra's converter drops
 * ids. Production threads reached 368 rows for 78 real messages because of it.
 *
 * Mastra Memory already holds the history, so only the newest exchange needs to
 * be sent. That is everything from the last user message onward: during a
 * renderAndWaitForResponse round-trip the tail is [user, assistant(tool-call),
 * tool(result)], and separating a tool result from its call is an API error.
 *
 * Anything unfamiliar falls back to the full list — sending too much costs
 * tokens, sending too little breaks the conversation.
 */
export const messagesToSend = (messages: AguiMessage[]): AguiMessage[] => {
  if (!Array.isArray(messages) || messages.length === 0) return messages;

  let lastUser = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === 'user') {
      lastUser = i;
      break;
    }
  }

  if (lastUser === -1) return messages;
  return messages.slice(lastUser);
};

/**
 * Identical to MastraAgent except for what it forwards: only the newest
 * exchange, because Mastra Memory already holds the rest. Overriding the public
 * run() leaves every byte of the vendor's streaming, tool-event and lifecycle
 * handling intact — the alternative was reimplementing its private message
 * converter, on the hot path of every message.
 */
export class SharekAgent extends MastraAgent {
  run(input: VendorRunInput): VendorRunOutput {
    return super.run({
      ...input,
      messages: messagesToSend(input.messages as AguiMessage[]) as any,
    });
  }
}

/**
 * Same shape as MastraAgent.getLocalAgents, so the controller swaps one call.
 */
export const getSharekAgents = ({
  mastra,
  resourceId,
  requestContext,
}: {
  mastra: Mastra;
  resourceId: string;
  requestContext?: RequestContext;
}): ReturnType<typeof MastraAgent.getLocalAgents> =>
  Object.entries(mastra.listAgents() || {}).reduce((all, [agentId, agent]) => {
    // `as any` only bridges the duplicate-package type identity described above;
    // this is a real MastraAgent subclass at runtime.
    all[agentId] = new SharekAgent({
      agentId,
      agent: agent as any,
      resourceId,
      requestContext,
    }) as any;
    return all;
  }, {} as ReturnType<typeof MastraAgent.getLocalAgents>);
