'use client';

import {
  createContext,
  FC,
  MouseEvent,
  ReactNode,
  RefObject,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  PENDING_KINDS,
  type PendingKind,
} from '@gitroom/react/helpers/video.or.image';
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
  /** None once the editor deleted its post (review C7). */
  place: PreviewPlace | undefined;
  busy: boolean;
  /** The ✦ button last pressed for the tab, which the phone layer's Back and close give the focus back to (FR-026). */
  opener?: HTMLElement;
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
  /** One of each (FR-021): selects an open tab of that kind, which takes this target and the post at `index` when idle; a busy one keeps its own. Either takes the `opener`. */
  open(
    kind: ComposerTabKind,
    target: ComposerTab['target'],
    index: number,
    opener?: HTMLElement
  ): void;
  /** Selects Post preview only when that tab was on screen; a running render keeps its pending entry until it settles (FR-025). */
  close(kind: ComposerTabKind): void;
  select(tab: 'preview' | ComposerTabKind): void;
  /** The editor added a post after the one at `index` on `channel`: each place there follows its post (review C7). */
  postAdded(channel: string, index: number): void;
  /** The editor deleted the post at `index` on `channel`: each place there follows its post (review C7). */
  postRemoved(channel: string, index: number): void;
  /** The editor moved the post at `index` on `channel` a step, swapping it with its neighbour (review C7). */
  postMoved(channel: string, index: number, direction: 'up' | 'down'): void;
}

// What the stage's panels add to it: each render's pending entry, the
// spinner of the tab it runs in while that tab is open, whether the composer
// is still open when the render lands, and the panels' own copies of their
// tabs while they render, which follow the post a closed tab no longer holds.
interface ComposerStageState extends ComposerTabs {
  addPending: (entry: PendingMedia) => void;
  removePending: (id: string) => void;
  setBusy: (kind: ComposerTabKind, busy: boolean) => void;
  composerOpen: RefObject<boolean>;
  rendering: RefObject<Set<RefObject<ComposerTab>>>;
}

const ComposerTabsContext = createContext<ComposerStageState | null>(null);

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
  // The composer is open while this provider is mounted: a render that
  // outlives it is only in the Media library (research R1, review C3).
  const composerOpen = useRef(true);
  useEffect(() => {
    composerOpen.current = true;
    return () => {
      composerOpen.current = false;
    };
  }, []);

  // The post a button works for, read at the click: the channel on screen
  // when it holds its own values, as the editor's appendImages chooses (D10).
  const open = useCallback<ComposerTabs['open']>(
    (kind, target, index, opener) => {
      const state = useLaunchStore.getState();
      const place = {
        channel: state.internal.some(
          (entry) => entry.integration.id === state.current
        )
          ? state.current
          : 'global',
        index,
      };
      setTabs((current) => {
        const tab = current[kind];
        return {
          ...current,
          [kind]: tab?.busy
            ? { ...tab, opener }
            : { kind, target, place, busy: false, opener },
        };
      });
      setActive(kind);
    },
    []
  );

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

  const rendering = useRef(new Set<RefObject<ComposerTab>>());

  // The editor added, deleted or moved a post on `channel` (review C7): each
  // place there, an open tab's, a pending entry's and a rendering panel's,
  // follows its post to the index `to` gives, or goes with it. A moved place
  // lands through the store from then on, since the row at its old index now
  // shows another post; a deleted post's result lands in no post, as once
  // the composer has closed (research R1).
  const movePlaces = useCallback(
    (channel: string, to: (index: number) => number | undefined) => {
      const follow = (place: PreviewPlace) => {
        const index = place.channel === channel ? to(place.index) : place.index;
        if (index === place.index) {
          return place;
        }
        return index === undefined ? undefined : { channel, index };
      };
      const move = (tab: ComposerTab): ComposerTab => {
        const place = tab.place && follow(tab.place);
        return place === tab.place
          ? tab
          : { ...tab, place, target: () => undefined };
      };
      setTabs((current) => {
        const next = { ...current };
        PENDING_KINDS.forEach((kind) => {
          const tab = current[kind];
          if (tab) {
            next[kind] = move(tab);
          }
        });
        return next;
      });
      setPending((current) =>
        current.flatMap((entry) => {
          const place = follow(entry.place);
          return place ? [{ ...entry, place }] : [];
        })
      );
      rendering.current.forEach((latest) => {
        latest.current = move(latest.current);
      });
    },
    []
  );

  const postAdded = useCallback<ComposerTabs['postAdded']>(
    (channel, index) =>
      movePlaces(channel, (each) => (each > index ? each + 1 : each)),
    [movePlaces]
  );

  const postRemoved = useCallback<ComposerTabs['postRemoved']>(
    (channel, index) =>
      movePlaces(channel, (each) =>
        each < index ? each : each > index ? each - 1 : undefined
      ),
    [movePlaces]
  );

  // The first post goes no higher and the last no lower, as in the store.
  const postMoved = useCallback<ComposerTabs['postMoved']>(
    (channel, index, direction) => {
      const state = useLaunchStore.getState();
      const posts =
        channel === 'global'
          ? state.global
          : state.internal.find((entry) => entry.integration.id === channel)
              ?.integrationValue || [];
      const other = direction === 'up' ? index - 1 : index + 1;
      if (other < 0 || other >= posts.length) {
        return;
      }
      movePlaces(channel, (each) =>
        each === index ? other : each === other ? index : each
      );
    },
    [movePlaces]
  );

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
      postAdded,
      postRemoved,
      postMoved,
      addPending,
      removePending,
      setBusy,
      composerOpen,
      rendering,
    }),
    [
      tabs,
      active,
      pending,
      open,
      close,
      postAdded,
      postRemoved,
      postMoved,
      addPending,
      removePending,
      setBusy,
    ]
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
 * The stage's view of the tabs, for the strip and the panels the composer
 * draws inside its provider.
 */
export const useComposerStage = (): ComposerStageState =>
  useContext(ComposerTabsContext)!;

/**
 * What the composer's ✦ AI Image and AI Video buttons do: in the composer, a
 * result for a post's row (the editor gives it the post's index, `place`) is
 * made in its kind's tab beside it, for that post, whose channel the provider
 * reads at the click, and the tab keeps the button pressed for the focus to
 * come back to (FR-021, FR-026, tasks D10); outside it (Samy, Studio), for a
 * reference row, or for a row that is not a post's (a channel's settings, a
 * model's reference), the tool's window (review C1).
 */
export const useOpenTool = (
  kind: ComposerTabKind,
  onChange: (media: { id: string; path: string }) => void,
  place: number | undefined,
  destination: MediaDestination,
  openWindow: () => void
): ((event: MouseEvent<HTMLElement>) => void) => {
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

  return (event) => {
    if (!tabs || destination !== 'post' || place === undefined) {
      openWindow();
      return;
    }
    tabs.open(kind, () => latestOnChange.current, place, event.currentTarget);
  };
};
