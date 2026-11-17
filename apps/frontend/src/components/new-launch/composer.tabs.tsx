'use client';

import {
  createContext,
  FC,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { PendingKind } from '@gitroom/react/helpers/video.or.image';
import { useLaunchStore } from '@gitroom/frontend/components/new-launch/store';
import type { MediaDestination } from '@gitroom/frontend/components/ui/media.destination';

export type ComposerTabKind = PendingKind;

/** A post in the composer: `'global'` or a channel's id, and the post's index. */
export interface PreviewPlace {
  channel: string;
  index: number;
}

export interface ComposerTab {
  kind: ComposerTabKind;
  /**
   * The media row's latest changeMedia, refreshed every render (never the
   * click's copy); undefined once the trigger has unmounted. Read when the
   * render lands (tasks D10).
   */
  target: () => ((media: { id: string; path: string }) => void) | undefined;
  place: PreviewPlace;
  busy: boolean;
}

export interface PendingMedia {
  id: string;
  kind: ComposerTabKind;
  place: PreviewPlace;
}

export interface ComposerTabs {
  tabs: Partial<Record<ComposerTabKind, ComposerTab>>;
  active: 'preview' | ComposerTabKind;
  pending: PendingMedia[];
  /** One of each (FR-021): selects an open tab of that kind, which takes this target and the post at `index` when idle; a busy one keeps its own. */
  open(
    kind: ComposerTabKind,
    target: ComposerTab['target'],
    index: number
  ): void;
  /** Selects Post preview only when that tab was on screen; a running render keeps its pending entry until it settles (FR-025). */
  close(kind: ComposerTabKind): void;
  select(tab: 'preview' | ComposerTabKind): void;
}

// What the stage's panels add to it: each render's pending entry, and the
// spinner of the tab it runs in while that tab is open.
interface ComposerStageState extends ComposerTabs {
  addPending: (entry: PendingMedia) => void;
  removePending: (id: string) => void;
  setBusy: (kind: ComposerTabKind, busy: boolean) => void;
}

export const ComposerTabsContext = createContext<ComposerStageState | null>(
  null
);

/**
 * The composer's tabs: Post preview, and up to one AI image and one AI video
 * tab beside the post (FR-021). `onActiveChange` lets the composer keep its
 * right column shown on a phone while an AI tab is active (tasks D11).
 */
export const ComposerTabsProvider: FC<{
  children: ReactNode;
  onActiveChange?: (active: 'preview' | ComposerTabKind) => void;
}> = ({ children, onActiveChange }) => {
  const [tabs, setTabs] = useState<ComposerTabs['tabs']>({});
  const [active, setActive] = useState<ComposerTabs['active']>('preview');
  const [pending, setPending] = useState<PendingMedia[]>([]);
  const setLocked = useLaunchStore((state) => state.setLocked);

  // The post a button works for, read at the click: the channel on screen
  // when it holds its own values, as the editor's appendImages chooses (D10).
  const open = useCallback<ComposerTabs['open']>((kind, target, index) => {
    const state = useLaunchStore.getState();
    const place = {
      channel: state.internal.some(
        (entry) => entry.integration.id === state.current
      )
        ? state.current
        : 'global',
      index,
    };
    setTabs((current) => ({
      ...current,
      [kind]: current[kind]?.busy
        ? current[kind]
        : { kind, target, place, busy: false },
    }));
    setActive(kind);
  }, []);

  const close = useCallback((kind: ComposerTabKind) => {
    setTabs((current) => {
      const rest = { ...current };
      delete rest[kind];
      return rest;
    });
    setActive((current) => (current === kind ? 'preview' : current));
  }, []);

  const setBusy = useCallback((kind: ComposerTabKind, busy: boolean) => {
    setTabs((current) => {
      const tab = current[kind];
      return tab ? { ...current, [kind]: { ...tab, busy } } : current;
    });
  }, []);

  const addPending = useCallback((entry: PendingMedia) => {
    setPending((current) => [...current, entry]);
  }, []);

  const removePending = useCallback((id: string) => {
    setPending((current) => current.filter((entry) => entry.id !== id));
  }, []);

  // The one writer of the composer's lock for AI work (D14): two tabs can
  // render at once and `locked` is one boolean, so it follows whether any
  // render is pending, written only when that changes. Never on mount, so a
  // lock an upload holds is left as it is.
  const working = pending.length > 0;
  const wrote = useRef(false);
  useEffect(() => {
    if (wrote.current === working) {
      return;
    }
    wrote.current = working;
    setLocked(working);
  }, [working, setLocked]);

  useEffect(() => {
    onActiveChange?.(active);
  }, [active, onActiveChange]);

  const value = useMemo(
    () => ({
      tabs,
      active,
      pending,
      open,
      close,
      select: setActive,
      addPending,
      removePending,
      setBusy,
    }),
    [tabs, active, pending, open, close, addPending, removePending, setBusy]
  );

  return (
    <ComposerTabsContext.Provider value={value}>
      {children}
    </ComposerTabsContext.Provider>
  );
};

/** The composer's tabs, or null outside the composer (Samy, the reference row, Studio). */
export const useComposerTabs = (): ComposerTabs | null =>
  useContext(ComposerTabsContext);

/**
 * What the composer's ✦ AI Image and AI Video buttons do: in the composer, a
 * result for a post's row (the editor gives it the post's index, `place`) is
 * made in its kind's tab beside it, for that post, whose channel the provider
 * reads at the click (FR-021, tasks D10); outside it (Samy, Studio), for a
 * reference row, or for a row that is not a post's (a channel's settings, a
 * model's reference), the tool's window (review C1).
 */
export const useOpenTool = (
  kind: ComposerTabKind,
  onChange: (media: { id: string; path: string }) => void,
  place: number | undefined,
  destination: MediaDestination,
  openWindow: () => void
): (() => void) => {
  const tabs = useComposerTabs();
  // The row's latest handler, read when the result lands, which can be long
  // after the click; none once the button is gone (tasks D10).
  const latestOnChange = useRef<typeof onChange | undefined>(undefined);
  useEffect(() => {
    latestOnChange.current = onChange;
    return () => {
      latestOnChange.current = undefined;
    };
  }, [onChange]);

  return () => {
    if (!tabs || destination !== 'post' || place === undefined) {
      openWindow();
      return;
    }
    tabs.open(kind, () => latestOnChange.current, place);
  };
};
