// CJS stand-in for `tokenx`, which ships ESM only. @mastra/core's CJS build
// requires it, so jest cannot load the agent's execution path without either
// transforming it (which needs --experimental-vm-modules) or replacing it
// (which needs this). Only rough token counts are involved, and no assertion in
// the integration specs depends on their accuracy.
export const approximateTokenSize = (text: unknown): number =>
  Math.ceil(String(text ?? '').length / 4);

export const estimateTokenCount = approximateTokenSize;

export const isWithinTokenLimit = (text: unknown, limit: number): boolean =>
  approximateTokenSize(text) <= limit;

export const sliceByTokens = <T>(text: T): T => text;

export const splitByTokens = <T>(text: T): T[] => [text];
