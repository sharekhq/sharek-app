import { createContext, useContext } from 'react';

export type VideoPhase = 'setup' | 'rendering' | 'result';

/** What a provider hands the modal when its render starts. */
export interface RenderHandshake {
  /**
   * Ordered step labels, already translated. Present only when the provider's
   * stream reports real progress; omit it and the waiting screen shows elapsed
   * time instead — a fake progress bar on a render that reports nothing is a
   * lie the user catches when it sits still for a minute.
   */
  steps?: string[];
  /** Run the same render again. Costs one credit. Wired to the result screen's Regenerate. */
  regenerate: () => void;
  /** Already-translated label for the result screen's return action, e.g. "Edit script". */
  backLabel: string;
  /** Leave the result and return to the provider's own earlier screen. */
  onBack: () => void;
}

/** One progress update. `index` is the zero-based position in `steps`. */
export interface RenderProgress {
  index: number;
  /** Optional live count for a step that has one, e.g. images 2 of 4. */
  done?: number;
  total?: number;
}

/**
 * The header trail — the provider's *flow* steps (Script → Review → Render),
 * distinct from `RenderHandshake.steps`, which are the *render* phases shown on
 * the waiting screen. Labels are already translated: the provider sets this
 * from inside its component, where `t()` is available, which is why the trail
 * cannot be declared at `videoWrapper()`'s module scope. `null` — the default —
 * means no trail, so a one-shot provider needs no opt-out.
 */
export interface VideoTrail {
  steps: string[];
  /** Zero-based index of the current step. Earlier steps render as done. */
  current: number;
}

export const VideoContextWrapper = createContext<{
  value: string;
  output: 'vertical' | 'horizontal';
  onMedia: (media: { id: string; path: string }) => void;
  close: () => void;
  /**
   * Which screen the modal is showing. Owned by the modal; a provider reads it
   * to place itself in its own trail while the render runs.
   */
  phase: VideoPhase;
  /**
   * The action bar's slot, for a provider that owns its actions to portal into.
   * The modal hands over the node rather than a selector because it does not
   * exist during the provider's first render, and the modal replaces it
   * whenever the phase changes. `null` means there is no bar to fill.
   */
  actionsSlot: HTMLElement | null;
  startRender: (handshake: RenderHandshake) => void;
  reportProgress: (progress: RenderProgress) => void;
  failRender: () => void;
  setTrail: (trail: VideoTrail | null) => void;
}>({
  value: '',
  output: 'vertical',
  onMedia: () => undefined,
  close: () => undefined,
  phase: 'setup',
  actionsSlot: null,
  startRender: () => undefined,
  reportProgress: () => undefined,
  failRender: () => undefined,
  setTrail: () => undefined,
});

export const useVideo = () => useContext(VideoContextWrapper);
