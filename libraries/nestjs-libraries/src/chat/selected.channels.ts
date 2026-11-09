// The channels selected for a Samy conversation, as the request context holds
// them: the browser sends them through CopilotKit `properties`
// (copilot.controller.ts).
export type SelectedChannel = {
  id: string;
  identifier: string;
  additionalSettings?: string;
};

// Nothing about the payload's shape is guaranteed. Keep only entries the model
// can actually act on, and never throw: instructions run on every turn, so a
// malformed payload would fail the whole chat rather than one field.
export const selectedChannels = (integrations: unknown): SelectedChannel[] =>
  Array.isArray(integrations)
    ? integrations.filter(
        (p) => p && typeof p.id === 'string' && typeof p.identifier === 'string'
      )
    : [];
