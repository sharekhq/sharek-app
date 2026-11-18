'use client';

import {
  FC,
  ReactNode,
  Ref,
  useCallback,
  useEffect,
  useId,
  useRef,
} from 'react';
import clsx from 'clsx';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { LoadingComponent } from '@gitroom/frontend/components/layout/loading';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';
import { useLaunchStore } from '@gitroom/frontend/components/new-launch/store';
import {
  ComposerTab,
  ComposerTabs,
  ComposerTarget,
  useComposerStage,
} from '@gitroom/frontend/components/new-launch/composer.tabs';
import { ShowAllProviders } from '@gitroom/frontend/components/new-launch/providers/show.all.providers';
import { PreviewFit } from '@gitroom/frontend/components/new-launch/preview.fit';
import { useHasScroll } from '@gitroom/frontend/components/ui/is.scroll.hook';
import {
  ChevronLeftIcon,
  CloseIcon,
} from '@gitroom/frontend/components/ui/icons';
import {
  SWITCH_OPTION,
  SWITCH_OPTION_IDLE,
  SWITCH_OPTION_ON,
} from '@gitroom/frontend/components/ui/pick.controls';
import { onRadioGroupKeyDown } from '@gitroom/frontend/components/launches/channel.panel';
import {
  AI_IMAGE_TOOL,
  StudioToolEntry,
  useComposerCatalog,
} from '@gitroom/frontend/components/studio/studio.tools';
import { ToolSwitcher } from '@gitroom/frontend/components/studio/tool.switcher';
import {
  STAGE_BACKGROUND,
  type WorkspaceToolProps,
} from '@gitroom/frontend/components/studio/workspace.frame';

/**
 * The composer's right column: the tab strip where the 65px header was, then
 * Post preview and the Create with AI tab's panel. The tab hosts one tool at
 * a time, chosen in its switcher; each tool shown since the tab opened stays
 * mounted, hidden when not shown, so it keeps its settings, progress and
 * versions (FR-021). At 1025px and below the strip is hidden and the active
 * AI tab is a layer over the composer, with its own Back and close (FR-026).
 */
export const ComposerStage: FC<{
  previewRef: Ref<unknown>;
  onClose: () => void;
}> = ({ previewRef, onClose }) => {
  const t = useT();
  const id = useId();
  const stage = useComposerStage();
  const { tab, busy } = stage;
  const name = t('create_with_ai', 'Create with AI');
  const tabId = (each: ComposerTabs['active']) => `${id}-tab-${each}`;
  const panelId = (each: ComposerTabs['active']) => `${id}-panel-${each}`;
  const on = !!tab?.open && stage.active === 'ai';

  return (
    <>
      <div className="mobile:hidden bg-newBgColor h-[65px] rounded-e-[12px] !rounded-b-[0] flex items-center gap-[12px] px-[20px]">
        <div
          role="tablist"
          aria-label={t('composer_tabs_label', 'Post preview and AI tools')}
          onKeyDown={(e) => onRadioGroupKeyDown(e, 'tab')}
          className="flex-1 min-w-0 flex items-center gap-[4px]"
        >
          <button
            type="button"
            role="tab"
            id={tabId('preview')}
            aria-controls={panelId('preview')}
            aria-selected={stage.active === 'preview'}
            tabIndex={stage.active === 'preview' ? 0 : -1}
            onClick={() => stage.select('preview')}
            className={clsx(
              SWITCH_OPTION,
              stage.active === 'preview' ? SWITCH_OPTION_ON : SWITCH_OPTION_IDLE
            )}
          >
            {t('post_preview', 'Post preview')}
          </button>
          {tab?.open && (
            // The tab and its close side by side in one option's look: a
            // button can't hold another. A tablist owns only tabs (WAI-ARIA's
            // deletable tabs): Delete closes the tab in focus, which moves to
            // Post preview, then selected; the × is the pointer's alone.
            <div
              className={clsx(
                'min-w-0 inline-flex items-center rounded-[6px] transition-colors',
                on ? SWITCH_OPTION_ON : SWITCH_OPTION_IDLE
              )}
            >
              <button
                type="button"
                role="tab"
                id={tabId('ai')}
                aria-controls={panelId('ai')}
                aria-selected={on}
                aria-busy={busy.length > 0}
                aria-keyshortcuts="Delete"
                tabIndex={on ? 0 : -1}
                onClick={() => stage.select('ai')}
                onKeyDown={(e) => {
                  if (e.key === 'Delete') {
                    stage.close();
                    document.getElementById(tabId('preview'))?.focus();
                  }
                }}
                className={clsx(SWITCH_OPTION, 'min-w-0 gap-[6px] pe-[4px]')}
              >
                {busy.length > 0 ? (
                  <span
                    aria-hidden="true"
                    className="flex-none w-[12px] h-[12px] rounded-full border-[1.5px] border-current border-t-transparent motion-safe:animate-spin"
                  />
                ) : (
                  <span aria-hidden="true" className="text-aiAccent">
                    ✦
                  </span>
                )}
                <span className="truncate">{name}</span>
              </button>
              <button
                type="button"
                tabIndex={-1}
                aria-hidden="true"
                onClick={() => stage.close()}
                aria-label={t('workspace_close_tab', 'Close {{name}}', {
                  name,
                })}
                className="flex-none w-[22px] h-[22px] coarse:w-[44px] coarse:h-[44px] me-[4px] coarse:me-0 flex justify-center items-center rounded-[4px] text-muted hover:text-ink focus-visible:ring-2 focus-visible:ring-brand"
              >
                <CloseIcon size={14} />
              </button>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('close', 'Close')}
          className="flex-none coarse:w-[44px] coarse:h-[44px] flex justify-center items-center rounded-[8px] text-muted hover:text-ink focus-visible:ring-2 focus-visible:ring-brand"
        >
          <CloseIcon />
        </button>
      </div>
      <div
        role="tabpanel"
        id={panelId('preview')}
        aria-labelledby={tabId('preview')}
        hidden={stage.active !== 'preview'}
        className={clsx(
          'flex-1 relative mobile:bg-transparent mobile:[background-image:none]',
          STAGE_BACKGROUND
        )}
      >
        <Scrollable
          scrollClasses="!pe-[20px]"
          className="absolute mobile:static top-0 p-[20px] pe-[8px] mobile:p-[16px] start-0 w-full h-full mobile:h-auto overflow-x-hidden overflow-y-auto mobile:overflow-y-visible scrollbar scrollbar-thumb-newColColor scrollbar-track-panel"
        >
          <PreviewFit>
            <ShowAllProviders ref={previewRef} />
          </PreviewFit>
        </Scrollable>
      </div>
      {tab && (tab.open || busy.length > 0) && (
        <AiTab
          tab={tab}
          name={name}
          on={on}
          tabId={tabId('ai')}
          panelId={panelId('ai')}
        />
      )}
    </>
  );
};

// The Create with AI tab's panel: the phone header, the tool switcher and one
// panel for each tool shown since the tab opened or still rendering. It is
// mounted while the tab is open or a tool is busy, so a render outlives the
// tab's closing.
const AiTab: FC<{
  tab: ComposerTab;
  name: string;
  on: boolean;
  tabId: string;
  panelId: string;
}> = ({ tab, name, on, tabId, panelId }) => {
  const t = useT();
  const { select, close, pick, busy } = useComposerStage();
  // Every tool a post can be handed, whatever the row takes, is `every`: a
  // busy tool keeps its panel when a narrower row opens the tab.
  const { catalog, every, loading } = useComposerCatalog(tab.accepts);

  // The remembered tool when the row offers it; while the list loads it may
  // not be listed yet, so none shows; once loaded, else the AI image
  // generator, else the list's first. Never written back.
  const current =
    catalog.listings.find(({ entry }) => entry.id === tab.tool) ||
    (loading
      ? undefined
      : catalog.listings.find(({ entry }) => entry.id === AI_IMAGE_TOOL) ||
        catalog.listings[0]);
  const shown = current?.entry.id;

  // The tools shown since the tab opened keep their panel while it is open,
  // and closing it lets the idle ones go; a busy tool keeps its own.
  const idle = tab.open
    ? [
        ...tab.visited.filter((each) =>
          every.listings.some((listing) => listing.entry.id === each)
        ),
        ...(shown && !tab.visited.includes(shown) ? [shown] : []),
      ]
    : [];
  const mountedIds = [...idle, ...busy.filter((each) => !idle.includes(each))];

  // The layer covers the post on a phone: leaving it gives the focus back to
  // the Create with AI button the tab was opened from, while it is there.
  const backToOpener = () => {
    if (tab.opener?.isConnected) {
      tab.opener.focus();
    }
  };

  return (
    <div
      role="tabpanel"
      id={panelId}
      aria-labelledby={tabId}
      hidden={!on}
      className={clsx(
        'flex-1 relative mobile:fixed mobile:inset-0 mobile:z-[600] mobile:bg-newBgColorInner mobile:[background-image:none]',
        STAGE_BACKGROUND
      )}
    >
      <div className="absolute inset-0 flex flex-col">
        <div className="hidden mobile:flex flex-none items-center gap-[8px] h-[60px] ps-[16px] pe-[4px]">
          <button
            type="button"
            onClick={() => {
              select('preview');
              backToOpener();
            }}
            aria-label={t('workspace_back_to_post', 'Back to the post')}
            className="flex-none w-[44px] h-[44px] -ms-[10px] flex justify-center items-center rounded-[8px] text-muted hover:text-ink focus-visible:ring-2 focus-visible:ring-brand"
          >
            <ChevronLeftIcon strokeWidth={1.5} className="rtl:rotate-180" />
          </button>
          <div className="flex-1 min-w-0 truncate text-[20px] font-[600]">
            {name}
          </div>
          <button
            type="button"
            onClick={() => {
              close();
              backToOpener();
            }}
            aria-label={t('workspace_close_tab', 'Close {{name}}', { name })}
            className="flex-none w-[44px] h-[44px] flex justify-center items-center rounded-[8px] text-muted hover:text-ink focus-visible:ring-2 focus-visible:ring-brand"
          >
            <CloseIcon />
          </button>
        </div>
        <div className="flex-1 min-h-0 flex flex-col gap-[16px] p-[20px] mobile:p-[16px] mobile:pt-0">
          {current ? (
            <div className="flex-none flex">
              <ToolSwitcher
                current={current}
                catalog={catalog}
                onPick={(id) => pick(id, shown)}
                busy={busy}
              />
            </div>
          ) : (
            loading && <LoadingComponent />
          )}
          {mountedIds.map((toolId) => {
            const entry = every.listings.find(
              (listing) => listing.entry.id === toolId
            )?.entry;
            return (
              entry?.post && (
                <div
                  key={toolId}
                  hidden={toolId !== shown}
                  className={clsx(
                    toolId === shown && 'flex-1 min-h-0 flex flex-col'
                  )}
                >
                  <AiToolPanel
                    entry={entry}
                    tab={tab}
                    onScreen={on && toolId === shown}
                    shown={tab.open && toolId === shown}
                  />
                </div>
              )
            );
          })}
        </div>
      </div>
    </div>
  );
};

// One tool's panel in the tab, hosting the tool for the post.
const AiToolPanel: FC<{
  entry: StudioToolEntry;
  tab: ComposerTab;
  onScreen: boolean;
  shown: boolean;
}> = ({ entry, tab, onScreen, shown }) => {
  const { close, addPending, removePending, setBusy, composerOpen, rendering } =
    useComposerStage();
  // The tab's latest target and place while the tool is idle; its own from
  // the request until it settles, and kept after the tab closes: its
  // render still lands through them, never through a newer press (D10). While
  // it renders, the provider moves them with the post when the editor deletes
  // or moves one (review C7).
  const latest = useRef<ComposerTarget>({
    target: tab.target,
    place: tab.place,
  });
  // The pending entry of the render under way.
  const render = useRef<string | undefined>(undefined);
  // The tab's target and place now, which the row takes again when its render
  // settles with the tool on screen, its result held for review: the row
  // pressed last, not the one the render started for. A result nobody is
  // there to review lands at once through the render's own row.
  const tabNow = useRef<ComposerTarget>({
    target: tab.target,
    place: tab.place,
  });
  useEffect(() => {
    tabNow.current = { target: tab.target, place: tab.place };
    if (!render.current) {
      latest.current = tabNow.current;
    }
  }, [tab.target, tab.place]);
  // Read when a result lands or is accepted, which can be long after the
  // render that made the handlers: they keep one identity for the panel's
  // life, as the video tool builds its render's handlers on them (review C9).
  const shownRef = useRef(shown);
  const onScreenRef = useRef(onScreen);
  useEffect(() => {
    shownRef.current = shown;
    onScreenRef.current = onScreen;
  }, [shown, onScreen]);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Only while the panel is mounted and its tool is the tab's shown one:
  // otherwise the tab is showing another tool, or is closed already.
  const closeTab = useCallback(() => {
    if (mounted.current && shownRef.current) {
      close();
    }
  }, [close]);

  // The tool's request: a pending entry where the render was started, for
  // the previews' placeholder and the composer's lock, until it settles,
  // whether the tab is still open or not (D10, D14); none once the editor
  // deleted the tab's post (review C7). A start while one is open replaces
  // its entry (review C5).
  const tool = entry.id;
  const kind = entry.post!.kind;
  const setLoading = useCallback(
    (loading: boolean) => {
      if (render.current) {
        removePending(render.current);
        rendering.current.delete(latest);
        render.current = undefined;
      }
      if (loading) {
        latest.current = tabNow.current;
      }
      const { place } = latest.current;
      if (loading && place) {
        render.current = makeId(10);
        addPending({ id: render.current, kind, place });
        rendering.current.add(latest);
      }
      if (!loading && onScreenRef.current) {
        latest.current = tabNow.current;
      }
      setBusy(tool, loading);
    },
    [addPending, removePending, setBusy, rendering, kind, tool]
  );

  // The media row's latest handler while its button is there, which also
  // puts an image in the text of a row in inline-images mode; once the button
  // is gone, appended at the post's place through the store, which reads the
  // latest state (D10); once the composer has closed, in no post: the store
  // then holds the next composer's (research R1, review C3), nor once the
  // editor deleted the post (review C7). The tab closes, and the selection
  // moves to Post preview, only when this tool is the tab's shown one.
  const land = useCallback(
    (media: { id: string; path: string }) => {
      const { target, place } = latest.current;
      const handler = target();
      if (handler) {
        handler(media);
      } else if (composerOpen.current && place) {
        const store = useLaunchStore.getState();
        if (place.channel === 'global') {
          store.appendGlobalValueMedia(place.index, [media]);
        } else {
          store.appendInternalValueMedia(place.channel, place.index, [media]);
        }
      }
      closeTab();
    },
    [composerOpen, closeTab]
  );

  const props: WorkspaceToolProps = {
    layout: 'stacked',
    destination: 'post',
    active: onScreen,
    onChange: land,
    onAccept: closeTab,
    setLoading,
  };

  return <ToolPanel entry={entry} props={props} />;
};

// The tool's own panel for the post: its element type is the tool's, kept
// across renders.
const ToolPanel: FC<{ entry: StudioToolEntry; props: WorkspaceToolProps }> = ({
  entry,
  props,
}) => entry.post!.panel(props);

const Scrollable: FC<{
  className: string;
  scrollClasses: string;
  children: ReactNode;
}> = ({ className, scrollClasses, children }) => {
  const ref = useRef(undefined);
  const hasScroll = useHasScroll(ref);
  return (
    <div className={clsx(className, hasScroll && scrollClasses)} ref={ref}>
      {children}
    </div>
  );
};
