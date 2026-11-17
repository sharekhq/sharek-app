'use client';

import {
  FC,
  Fragment,
  KeyboardEvent,
  ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { SearchField } from '@gitroom/frontend/components/launches/channel.panel';
import { useHangingPanel } from '@gitroom/frontend/components/launches/post.actions.menu';
import { isolate } from '@gitroom/frontend/components/launches/helpers/platform-label';
import { ChevronDownIcon } from '@gitroom/frontend/components/ui/icons';
import {
  onListKeyDown,
  onMenuKeyDown,
  Option,
} from '@gitroom/frontend/components/brands/brand.menu';
import { GROUP_LABEL } from '@gitroom/frontend/components/ui/split.panel';
import {
  filterStudio,
  StudioCatalog,
  StudioTool,
  StudioToolEntry,
  studioToolHref,
} from '@gitroom/frontend/components/studio/studio.tools';
import { studioMakerLine } from '@gitroom/frontend/components/videos/video.wrapper';

type HangingPanel = ReturnType<typeof useHangingPanel>;

/**
 * Puts its children in the top bar, after the page's title
 * (layout/title.tsx's `#top-bar-slot`), once the slot is there, as the
 * composer's providers put their settings in `#social-settings`. Nothing on
 * a page with no slot.
 */
export const TopBarSlot: FC<{ children: ReactNode }> = ({ children }) => {
  const [slot, setSlot] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setSlot(document.getElementById('top-bar-slot'));
  }, []);

  return slot ? createPortal(children, slot) : null;
};

// A listing's picture, small: its cover, or its glyph while it has none or
// the cover does not load, as its Studio card gives way (FR-017).
const ToolPicture: FC<{ entry: StudioToolEntry }> = ({ entry }) => {
  const [failed, setFailed] = useState(false);

  return (
    <span
      aria-hidden="true"
      className="relative flex-none w-[48px] h-[27px] rounded-[6px] overflow-hidden bg-surface2 flex items-center justify-center text-muted [&_svg]:size-4"
    >
      {entry.cover && !failed ? (
        <img
          src={entry.cover}
          width="48"
          height="27"
          alt=""
          onError={() => setFailed(true)}
          className="absolute inset-0 w-full h-full object-cover"
        />
      ) : (
        entry.icon
      )}
    </span>
  );
};

// Tools or Models: the group is named by its title, which only shows it.
const ToolGroup: FC<{ title: string; children: ReactNode }> = ({
  title,
  children,
}) => (
  <div role="group" aria-label={title} className="flex flex-col">
    <div aria-hidden="true" className={GROUP_LABEL}>
      {title}
    </div>
    {children}
  </div>
);

/**
 * The switcher's list while it is open, mounted with it, so its search starts
 * empty each time: the search, then Tools then Models as the Studio page
 * shows them (filterStudio), each with its picture, its name and its
 * category, or its maker and category. A page tool hands its address on, the
 * current one nothing; a window tool opens its window through its own
 * trigger, as its Studio card does, or leads to Billing while it is locked.
 */
const ToolList: FC<{
  hanging: HangingPanel;
  current: StudioTool;
  catalog: StudioCatalog;
  onGo: (href?: string) => void;
}> = ({ hanging: { panelRef, show }, current, catalog, onGo }) => {
  const t = useT();
  const toaster = useToaster();
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const sections = filterStudio(catalog, 'all', query, t);

  // Ready to type. It scrolls nothing: a scroll outside the list closes it
  // (useHangingPanel).
  useEffect(() => {
    searchRef.current?.focus({ preventScroll: true });
  }, []);

  // From the search, Down goes to the first option and Up to the last; the
  // list's own keys (onListKeyDown) take it on from there.
  const intoList = (e: KeyboardEvent<HTMLDivElement>) => {
    const options =
      listRef.current?.querySelectorAll<HTMLElement>('[role="option"]');
    const to =
      options &&
      { ArrowDown: options[0], ArrowUp: options[options.length - 1] }[e.key];
    if (to) {
      e.preventDefault();
      to.focus();
    }
  };

  // The window has put its output in the Media library; here it is only
  // confirmed, as on the Studio page.
  const saved = useCallback(
    () =>
      toaster.show(
        t('studio_saved_to_media', 'Saved to your Media library'),
        'success'
      ),
    [t, toaster]
  );

  const option = (tool: StudioTool) => {
    const { entry } = tool;
    const category = catalog.chips
      .find((chip) => chip.id === entry.category)
      ?.label(t);
    const line = entry.maker
      ? studioMakerLine(t, entry.maker, category)
      : category ?? '';
    const selected = entry.id === current.entry.id;
    const href = studioToolHref(entry);

    if (href || selected || tool.state === 'locked' || !entry.trigger) {
      return (
        <Option
          key={entry.id}
          mark={<ToolPicture entry={entry} />}
          name={entry.name(t)}
          sub={line}
          selected={selected}
          sheet={false}
          onPick={() => onGo(selected ? undefined : href ?? '/billing')}
        />
      );
    }
    return (
      <Fragment key={entry.id}>
        {entry.trigger({
          onSaved: saved,
          renderTrigger: (openWindow) => (
            <Option
              mark={<ToolPicture entry={entry} />}
              name={entry.name(t)}
              sub={line}
              selected={false}
              sheet={false}
              onPick={() => {
                onGo();
                openWindow();
              }}
            />
          ),
        })}
      </Fragment>
    );
  };

  return (
    !!show &&
    createPortal(
      <div
        ref={panelRef}
        style={{ left: show.x, top: show.y }}
        className="fixed z-[100] w-[340px] max-w-[calc(100vw-20px)] max-h-[calc(100vh-20px)] overflow-y-auto flex flex-col p-[6px] bg-surface border border-line rounded-[12px] shadow-menu text-ink cursor-default"
      >
        <div onKeyDown={intoList} className="pt-[4px] pb-[6px]">
          <SearchField
            ref={searchRef}
            label={t('studio_search', 'Search tools and models')}
            value={query}
            onChange={setQuery}
          />
        </div>
        {sections.tools.length || sections.models.length ? (
          <div
            ref={listRef}
            role="listbox"
            aria-label={t('studio', 'Studio')}
            onKeyDown={onListKeyDown}
            className="flex flex-col"
          >
            {!!sections.tools.length && (
              <ToolGroup title={t('studio_section_tools', 'Tools')}>
                {sections.tools.map(option)}
              </ToolGroup>
            )}
            {!!sections.models.length && (
              <ToolGroup title={t('studio_section_models', 'Models')}>
                {sections.models.map(option)}
              </ToolGroup>
            )}
          </div>
        ) : (
          <p className="px-[10px] py-[16px] text-[13px] text-muted text-center">
            {t('studio_no_match_title', 'Nothing matches “{{query}}”', {
              query: isolate(query.trim()),
              // React escapes the line, so i18next mustn't first
              interpolation: { escapeValue: false },
            })}
          </p>
        )}
      </div>,
      document.body
    )
  );
};

/**
 * The tool switcher, in the top bar after "Studio" on a tool's page
 * (contracts/studio-addresses.md § Top bar): a button with the current
 * listing's picture and name that opens every listing of the Studio page
 * (FR-011). It hangs from the button against the viewport and renders into
 * the body, as the brand list does, so the top bar's box cannot clip it.
 * Escape closes it, and so does Tab, since the list in the body comes after
 * the rest of the page; either way, and after a choice, the focus goes back
 * to the button.
 */
export const ToolSwitcher: FC<{
  current: StudioTool;
  catalog: StudioCatalog;
}> = ({ current, catalog }) => {
  const t = useT();
  const router = useRouter();
  const hanging = useHangingPanel();
  const { ref, show, setShow, below } = hanging;
  const button = useRef<HTMLButtonElement>(null);
  const open = !!show;
  const name = current.entry.name(t);

  const close = () => {
    setShow(false);
    button.current?.focus();
  };

  const go = (href?: string) => {
    close();
    if (href) {
      router.push(href);
    }
  };

  return (
    <div
      ref={ref}
      onKeyDown={(e) => onMenuKeyDown(e, hanging, close)}
      className="flex min-w-0 ms-[12px]"
    >
      <button
        ref={button}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t('workspace_switch_tool', 'Switch tool: {{name}}', {
          name: isolate(name),
          interpolation: { escapeValue: false },
        })}
        onClick={() => setShow(open ? false : below())}
        className="min-w-0 max-w-[320px] h-[40px] coarse:h-[44px] flex items-center gap-[10px] ps-[6px] pe-[10px] bg-surface border border-line rounded-[8px] text-[14px] font-[600] text-ink text-start cursor-pointer hover:border-inkSoft aria-expanded:border-brand transition-colors focus-visible:ring-2 focus-visible:ring-brand"
      >
        <ToolPicture entry={current.entry} />
        <span className="flex-1 min-w-0 truncate">{name}</span>
        <ChevronDownIcon
          size={16}
          aria-hidden="true"
          className="flex-none text-muted"
        />
      </button>
      {show && (
        <ToolList
          hanging={hanging}
          current={current}
          catalog={catalog}
          onGo={go}
        />
      )}
    </div>
  );
};
