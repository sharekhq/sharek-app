import { MastraAgent } from '@ag-ui/mastra';
import type { AbstractAgent, BaseEvent, RunAgentInput } from '@ag-ui/client';
import type { Observable } from 'rxjs';
import type { Mastra } from '@mastra/core';
import type { RequestContext } from '@mastra/core/request-context';

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
  run(input: RunAgentInput): Observable<BaseEvent> {
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
}): Record<string, AbstractAgent> =>
  Object.entries(mastra.listAgents() || {}).reduce((all, [agentId, agent]) => {
    all[agentId] = new SharekAgent({
      agentId,
      agent: agent as any,
      resourceId,
      requestContext,
    });
    return all;
  }, {} as Record<string, AbstractAgent>);
