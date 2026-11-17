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
import clsx from 'clsx';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useToaster } from '@gitroom/react/toaster/toaster';
import {
  FOCUS_RING,
  SearchField,
} from '@gitroom/frontend/components/launches/channel.panel';
import { useHangingPanel } from '@gitroom/frontend/components/launches/post.actions.menu';
import { isolate } from '@gitroom/frontend/components/launches/helpers/platform-label';
import {
  CheckmarkIcon,
  ChevronDownIcon,
} from '@gitroom/frontend/components/ui/icons';
import {
  filterStudio,
  StudioCatalog,
  StudioTool,
  StudioToolEntry,
  studioToolHref,
} from '@gitroom/frontend/components/studio/studio.tools';

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

// Down and Up move through the options, wrapping, as the brand list's do
// (brands/brand.menu.tsx); from the search field Down goes to the first and
// Up to the last.
const onListKeyDown = (event: KeyboardEvent<HTMLElement>) => {
  const step = { ArrowDown: 1, ArrowUp: -1 }[event.key] || 0;
  const options = Array.from(
    event.currentTarget.querySelectorAll<HTMLElement>('[role="option"]')
  );
  if (!step || !options.length) {
    return;
  }
  event.preventDefault();
  const from = options.indexOf(event.target as HTMLElement);
  const to =
    from < 0
      ? step > 0
        ? 0
        : options.length - 1
      : (from + step + options.length) % options.length;
  options[to].focus();
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

// A choice: its picture, its name and the line under it, and a ✓ when it is
// the current one. Enter and Space choose it, as a click does.
const ToolOption: FC<{
  entry: StudioToolEntry;
  line: string;
  selected: boolean;
  onPick: () => void;
}> = ({ entry, line, selected, onPick }) => {
  const t = useT();

  return (
    <div
      role="option"
      aria-selected={selected}
      tabIndex={0}
      onClick={onPick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onPick();
        }
      }}
      className={clsx(
        'flex items-center gap-[10px] min-h-[48px] px-[10px] py-[6px] rounded-[8px] text-start cursor-pointer hover:bg-surface2 transition-colors',
        FOCUS_RING
      )}
    >
      <ToolPicture entry={entry} />
      <span className="flex-1 min-w-0 flex flex-col items-start gap-[1px]">
        <span
          className={clsx(
            'max-w-full truncate text-[14px] text-ink',
            selected && 'font-[600]'
          )}
        >
          {entry.name(t)}
        </span>
        <span className="max-w-full truncate text-[12px] leading-[1.4] text-muted">
          {line}
        </span>
      </span>
      {selected && (
        <CheckmarkIcon
          aria-hidden="true"
          width={15}
          height={11}
          className="flex-none text-brandText"
        />
      )}
    </div>
  );
};

// Tools or Models: the group is named by its title, which only shows it.
const ToolGroup: FC<{ title: string; children: ReactNode }> = ({
  title,
  children,
}) => (
  <div role="group" aria-label={title} className="flex flex-col">
    <div
      aria-hidden="true"
      className="px-[10px] pt-[8px] pb-[6px] text-[12px] font-[600] text-muted"
    >
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
  const sections = filterStudio(catalog, 'all', query, t);

  // Ready to type. It scrolls nothing: a scroll outside the list closes it
  // (useHangingPanel).
  useEffect(() => {
    searchRef.current?.focus({ preventScroll: true });
  }, []);

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
      ? t('studio_model_by', 'by {{maker}} · {{category}}', {
          maker: isolate(entry.maker.name),
          category,
          // React escapes the line, so i18next mustn't first
          interpolation: { escapeValue: false },
        })
      : category ?? '';
    const selected = entry.id === current.entry.id;
    const href = studioToolHref(entry);

    if (href || selected || tool.state === 'locked' || !entry.trigger) {
      return (
        <ToolOption
          key={entry.id}
          entry={entry}
          line={line}
          selected={selected}
          onPick={() => onGo(selected ? undefined : href ?? '/billing')}
        />
      );
    }
    return (
      <Fragment key={entry.id}>
        {entry.trigger({
          onSaved: saved,
          renderTrigger: (openWindow) => (
            <ToolOption
              entry={entry}
              line={line}
              selected={false}
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
        onKeyDown={onListKeyDown}
        className="fixed z-[100] w-[340px] max-w-[calc(100vw-20px)] max-h-[calc(100vh-20px)] overflow-y-auto flex flex-col p-[6px] bg-surface border border-line rounded-[12px] shadow-menu text-ink cursor-default"
      >
        <div className="pt-[4px] pb-[6px]">
          <SearchField
            ref={searchRef}
            label={t('studio_search', 'Search tools and models')}
            value={query}
            onChange={setQuery}
          />
        </div>
        {sections.tools.length || sections.models.length ? (
          <div
            role="listbox"
            aria-label={t('studio', 'Studio')}
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
  const { ref, panelRef, show, setShow, below } = hanging;
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

  const keys = (e: KeyboardEvent<HTMLDivElement>) => {
    if (
      show &&
      (e.key === 'Escape' ||
        (e.key === 'Tab' && panelRef.current?.contains(e.target as Node)))
    ) {
      e.preventDefault();
      close();
    }
  };

  return (
    <div ref={ref} onKeyDown={keys} className="flex min-w-0 ms-[12px]">
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
