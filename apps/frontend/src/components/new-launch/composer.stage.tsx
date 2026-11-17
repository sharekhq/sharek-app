'use client';

import {
  FC,
  ReactNode,
  Ref,
  useContext,
  useEffect,
  useId,
  useRef,
} from 'react';
import clsx from 'clsx';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';
import { useLaunchStore } from '@gitroom/frontend/components/new-launch/store';
import {
  ComposerTab,
  ComposerTabKind,
  ComposerTabs,
  ComposerTabsContext,
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
import { AiImageTool } from '@gitroom/frontend/components/launches/ai.image';
import { onRadioGroupKeyDown } from '@gitroom/frontend/components/launches/channel.panel';
import {
  AiVideoChooser,
  useAiVideoTypes,
  VideoType,
} from '@gitroom/frontend/components/launches/ai.video';

const KINDS: ComposerTabKind[] = ['image', 'video'];

/**
 * The composer's right column: the tab strip where the 65px header was, then
 * Post preview and each open AI tab's panel. Every open panel stays mounted,
 * hidden when not shown, so each tool keeps its settings, progress and
 * versions (FR-021). At 1025px and below the strip is hidden and an active
 * AI tab is a layer over the composer, with its own Back and close (FR-026).
 */
export const ComposerStage: FC<{
  previewRef: Ref<unknown>;
  onClose: () => void;
}> = ({ previewRef, onClose }) => {
  const t = useT();
  const id = useId();
  const stage = useContext(ComposerTabsContext)!;
  const { data: videoTypes } = useAiVideoTypes();
  const names: Record<ComposerTabKind, string> = {
    image: t('studio_tool_ai_image', 'AI image generator'),
    video: t('video', '{{ai}} Video', { ai: t('ai', 'AI') }),
  };
  const tabId = (tab: ComposerTabs['active']) => `${id}-tab-${tab}`;
  const panelId = (tab: ComposerTabs['active']) => `${id}-panel-${tab}`;

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
          {KINDS.map((kind) => {
            const tab = stage.tabs[kind];
            if (!tab) {
              return null;
            }
            const on = stage.active === kind;
            // The tab and its close side by side in one option's look: a
            // button can't hold another.
            return (
              <div
                key={kind}
                className={clsx(
                  'min-w-0 inline-flex items-center rounded-[6px] transition-colors',
                  on ? SWITCH_OPTION_ON : SWITCH_OPTION_IDLE
                )}
              >
                <button
                  type="button"
                  role="tab"
                  id={tabId(kind)}
                  aria-controls={panelId(kind)}
                  aria-selected={on}
                  aria-busy={tab.busy}
                  tabIndex={on ? 0 : -1}
                  onClick={() => stage.select(kind)}
                  className={clsx(SWITCH_OPTION, 'min-w-0 gap-[6px] pe-[4px]')}
                >
                  {tab.busy ? (
                    <span
                      aria-hidden="true"
                      className="flex-none w-[12px] h-[12px] rounded-full border-[1.5px] border-current border-t-transparent motion-safe:animate-spin"
                    />
                  ) : (
                    <span aria-hidden="true" className="text-aiAccent">
                      ✦
                    </span>
                  )}
                  <span className="truncate">{names[kind]}</span>
                </button>
                <button
                  type="button"
                  onClick={() => stage.close(kind)}
                  aria-label={t('workspace_close_tab', 'Close {{name}}', {
                    name: names[kind],
                  })}
                  className="flex-none w-[22px] h-[22px] coarse:w-[44px] coarse:h-[44px] me-[4px] coarse:me-0 flex justify-center items-center rounded-[4px] text-muted hover:text-ink focus-visible:ring-2 focus-visible:ring-brand"
                >
                  <CloseIcon size={14} />
                </button>
              </div>
            );
          })}
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
        className="flex-1 relative bg-panel mobile:bg-transparent"
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
      {KINDS.map((kind) => {
        const tab = stage.tabs[kind];
        return (
          tab && (
            <AiTabPanel
              key={kind}
              kind={kind}
              tab={tab}
              name={names[kind]}
              shown={stage.active === kind}
              tabId={tabId(kind)}
              panelId={panelId(kind)}
              videoTypes={videoTypes || []}
            />
          )
        );
      })}
    </>
  );
};

// An AI tab's panel, hosting its tool for the post.
const AiTabPanel: FC<{
  kind: ComposerTabKind;
  tab: ComposerTab;
  name: string;
  shown: boolean;
  tabId: string;
  panelId: string;
  videoTypes: VideoType[];
}> = ({ kind, tab, name, shown, tabId, panelId, videoTypes }) => {
  const t = useT();
  const { select, close, addPending, removePending, setBusy, composerOpen } =
    useContext(ComposerTabsContext)!;
  // The tab's latest target and place, kept after it closes: its tool's
  // render still settles then, and lands through them, never through a newer
  // tab of its kind (D10).
  const latest = useRef(tab);
  useEffect(() => {
    latest.current = tab;
  }, [tab]);
  // The pending entry of the render under way.
  const render = useRef<string | undefined>(undefined);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Only while the panel is mounted: once its tab closed, an open tab of its
  // kind is a newer one's.
  const closeTab = () => {
    if (mounted.current) {
      close(kind);
    }
  };

  // The tool's request: a pending entry where the render was started, for
  // the previews' placeholder and the composer's lock, until it settles,
  // whether the tab is still open or not (D10, D14).
  const setLoading = (loading: boolean) => {
    if (loading) {
      render.current = makeId(10);
      addPending({ id: render.current, kind, place: latest.current.place });
    } else if (render.current) {
      removePending(render.current);
      render.current = undefined;
    }
    if (mounted.current) {
      setBusy(kind, loading);
    }
  };

  // The media row's latest handler while its button is there, which also
  // puts an image in the text of a row in inline-images mode; once the button
  // is gone, appended at the post's place through the store, which reads the
  // latest state (D10); once the composer has closed, in no post: the store
  // then holds the next composer's (research R1, review C3). The tab closes,
  // and the selection moves to Post preview only if it was on screen.
  const land = (media: { id: string; path: string }) => {
    const { target, place } = latest.current;
    const handler = target();
    if (handler) {
      handler(media);
    } else if (composerOpen.current) {
      const store = useLaunchStore.getState();
      if (place.channel === 'global') {
        store.appendGlobalValueMedia(place.index, [media]);
      } else {
        store.appendInternalValueMedia(place.channel, place.index, [media]);
      }
    }
    closeTab();
  };

  const tool = {
    layout: 'stacked' as const,
    destination: 'post' as const,
    active: shown,
    onChange: land,
    onAccept: closeTab,
    setLoading,
  };

  return (
    <div
      role="tabpanel"
      id={panelId}
      aria-labelledby={tabId}
      hidden={!shown}
      className="flex-1 relative bg-newBgColorInner mobile:fixed mobile:inset-0 mobile:z-[600]"
    >
      <div className="absolute inset-0 flex flex-col">
        <div className="hidden mobile:flex flex-none items-center gap-[8px] h-[60px] ps-[16px] pe-[4px]">
          <button
            type="button"
            onClick={() => select('preview')}
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
            onClick={() => close(kind)}
            aria-label={t('workspace_close_tab', 'Close {{name}}', { name })}
            className="flex-none w-[44px] h-[44px] flex justify-center items-center rounded-[8px] text-muted hover:text-ink focus-visible:ring-2 focus-visible:ring-brand"
          >
            <CloseIcon />
          </button>
        </div>
        <div className="flex-1 min-h-0 flex flex-col p-[20px] mobile:p-[16px] mobile:pt-0">
          {kind === 'image' ? (
            <AiImageTool {...tool} />
          ) : (
            <AiVideoChooser list={videoTypes} {...tool} />
          )}
        </div>
      </div>
    </div>
  );
};

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
