'use client';

import clsx from 'clsx';
import {
  createContext,
  FC,
  ReactNode,
  RefObject,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { PendingKind } from '@gitroom/react/helpers/video.or.image';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { buttonClassName } from '@gitroom/react/form/button';
import { AiImageIcon } from '@gitroom/frontend/components/ui/icons';
import { useLaunchStore } from '@gitroom/frontend/components/new-launch/store';

/** A post in the composer: `'global'` or a channel's id, and the post's index. */
export interface PreviewPlace {
  channel: string;
  index: number;
}

/** The post a media row hands a result to: its latest handler and its place. */
export interface ComposerTarget {
  /**
   * The media row's latest changeMedia, refreshed every render (never the
   * click's copy); undefined once the trigger has unmounted. Read when the
   * render lands (tasks D10).
   */
  target: () => ((media: { id: string; path: string }) => void) | undefined;
  /** None once the editor deleted its post (review C7). */
  place: PreviewPlace | undefined;
}

/** The one Create with AI tab (spec 064, plan D3). */
export interface ComposerTab extends ComposerTarget {
  /** In the strip; while closed the object only keeps busy tools' rows. */
  open: boolean;
  /** The catalog id of the tool the member wants on screen. */
  tool: string;
  /** The tools shown since the tab opened, which keep their panel while it is open. */
  visited: string[];
  /** What the row that opened the tab takes. */
  accepts: PendingKind[];
  /** The ✦ button last pressed for the tab, which the phone layer's Back and close give the focus back to (FR-026). */
  opener?: HTMLElement;
}

export interface PendingMedia {
  id: string;
  kind: PendingKind;
  place: PreviewPlace;
}

export interface ComposerTabs {
  tab: ComposerTab | undefined;
  active: 'preview' | 'ai';
  /** The tools with a render running, by catalog id. */
  busy: string[];
  pending: PendingMedia[];
  /** Opens the tab, or selects it when open, for the post at `index`: it takes this target, post, opener and `accepts` every time, and the shown tool stays, else the remembered one. */
  open(
    target: ComposerTab['target'],
    index: number,
    opener: HTMLElement | undefined,
    accepts: PendingKind[]
  ): void;
  /** The member picked a tool in the switcher: shown now and remembered. */
  pick(tool: string, from?: string): void;
  /** Selects Post preview only when the tab was on screen; a running render keeps its pending entry until it settles (FR-025). */
  close(): void;
  select(tab: 'preview' | 'ai'): void;
  /** The editor added a post after the one at `index` on `channel`: each place there follows its post (review C7). */
  postAdded(channel: string, index: number): void;
  /** The editor deleted the post at `index` on `channel`: each place there follows its post (review C7). */
  postRemoved(channel: string, index: number): void;
  /** The editor moved the post at `index` on `channel` a step, swapping it with its neighbour (review C7). */
  postMoved(channel: string, index: number, direction: 'up' | 'down'): void;
}

// What the stage's panels add to it: each render's pending entry, the
// busy tools, whether the composer is still open when the render lands, and
// the panels' own copies of their rows while they render, which follow the
// post a closed tab no longer holds.
interface ComposerStageState extends ComposerTabs {
  addPending: (entry: PendingMedia) => void;
  removePending: (id: string) => void;
  setBusy: (tool: string, busy: boolean) => void;
  composerOpen: RefObject<boolean>;
  rendering: RefObject<Set<RefObject<ComposerTarget>>>;
}

const TOOL_KEY = 'composerAiTool';

// The tool the member last picked, none when storage is blocked.
const rememberedTool = () => {
  try {
    return window.localStorage.getItem(TOOL_KEY);
  } catch {
    return null;
  }
};

const rememberTool = (tool: string) => {
  try {
    window.localStorage.setItem(TOOL_KEY, tool);
  } catch {
    // Refused: the pick holds while the tab is open.
  }
};

const ComposerTabsContext = createContext<ComposerStageState | null>(null);

/**
 * The composer's tabs: Post preview, and the one Create with AI tab beside
 * the post (spec 064). `defaultTool` is the tool it opens on when none was
 * picked before; `onActiveChange` lets the composer keep its right column
 * shown on a phone while the AI tab is active (tasks D11).
 */
export const ComposerTabsProvider: FC<{
  children: ReactNode;
  defaultTool: string;
  onActiveChange?: (active: 'preview' | 'ai') => void;
}> = ({ children, defaultTool, onActiveChange }) => {
  const [tab, setTab] = useState<ComposerTab>();
  const [active, setActive] = useState<ComposerTabs['active']>('preview');
  const [busy, setBusyTools] = useState<string[]>([]);
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
    (target, index, opener, accepts) => {
      const state = useLaunchStore.getState();
      const place = {
        channel: state.internal.some(
          (entry) => entry.integration.id === state.current
        )
          ? state.current
          : 'global',
        index,
      };
      setTab((current) => {
        const tool = current?.open
          ? current.tool
          : rememberedTool() || defaultTool;
        return {
          target,
          place,
          opener,
          accepts,
          open: true,
          tool,
          visited: current?.open ? current.visited : [tool],
        };
      });
      setActive('ai');
    },
    [defaultTool]
  );

  const pick = useCallback((tool: string, from?: string) => {
    setTab(
      (current) =>
        current && {
          ...current,
          tool,
          visited: [tool, ...(from ? [from] : [])].reduce(
            (all, each) => (all.includes(each) ? all : [...all, each]),
            current.visited
          ),
        }
    );
    rememberTool(tool);
  }, []);

  const close = useCallback(() => {
    setTab((current) => current && { ...current, open: false, visited: [] });
    setActive((current) => (current === 'ai' ? 'preview' : current));
  }, []);

  const setBusy = useCallback((tool: string, loading: boolean) => {
    setBusyTools((current) => [
      ...current.filter((each) => each !== tool),
      ...(loading ? [tool] : []),
    ]);
  }, []);

  const addPending = useCallback((entry: PendingMedia) => {
    setPending((current) => [...current, entry]);
  }, []);

  const removePending = useCallback((id: string) => {
    setPending((current) => current.filter((entry) => entry.id !== id));
  }, []);

  const rendering = useRef(new Set<RefObject<ComposerTarget>>());

  // The editor added, deleted or moved a post on `channel` (review C7): each
  // place there, the tab's, a pending entry's and a rendering panel's,
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
      const move = <Row extends ComposerTarget>(row: Row): Row => {
        const place = row.place && follow(row.place);
        return place === row.place
          ? row
          : { ...row, place, target: () => undefined };
      };
      setTab((current) => current && move(current));
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
      tab,
      active,
      busy,
      pending,
      open,
      pick,
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
      tab,
      active,
      busy,
      pending,
      open,
      pick,
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
 * What the composer's Create with AI button does: in the composer, a result
 * for a post's row (the editor gives it the post's index, `place`) is made in
 * the AI tab beside it, for that post, whose channel the provider reads at
 * the click, and the tab keeps the button pressed for the focus to come back
 * to (FR-021, FR-026, tasks D10).
 */
export const CreateWithAi: FC<{
  onChange: (media: { id: string; path: string }) => void;
  place: number | undefined;
  accepts: PendingKind[];
}> = ({ onChange, place, accepts }) => {
  const t = useT();
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

  if (!tabs || place === undefined) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={(event) =>
        tabs.open(
          () => latestOnChange.current,
          place,
          event.currentTarget,
          accepts
        )
      }
      data-tooltip-id="tooltip"
      data-tooltip-content={t('create_with_ai', 'Create with AI')}
      aria-label={t('create_with_ai', 'Create with AI')}
      className={clsx(
        buttonClassName({ variant: 'ai', size: 'small' }),
        'coarse:h-[44px] coarse:min-w-[44px] mobile:h-[44px] mobile:min-w-[44px] mobile:px-0'
      )}
    >
      <div className="flex gap-[6px] items-center">
        <div>
          <AiImageIcon className="mobile:w-[20px] mobile:h-[20px]" />
        </div>
        <div className="mobile:hidden block">
          {t('create_with_ai', 'Create with AI')}
        </div>
      </div>
    </button>
  );
};
