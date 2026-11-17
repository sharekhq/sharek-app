'use client';

import {
  FC,
  forwardRef,
  KeyboardEvent,
  ReactNode,
  RefObject,
  useEffect,
  useImperativeHandle,
  useRef,
} from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import Link from 'next/link';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import {
  EACH_BRAND,
  NO_BRAND,
} from '@gitroom/nestjs-libraries/dtos/brands/brand.dto';
import {
  MOBILE_QUERY,
  useMediaQuery,
} from '@gitroom/react/helpers/use.media.query';
import {
  Channel,
  compareCustomers,
  FOCUS_RING,
} from '@gitroom/frontend/components/launches/channel.panel';
import { useIntegrationList } from '@gitroom/frontend/components/launches/helpers/use.integration.list';
import { isolate } from '@gitroom/frontend/components/launches/helpers/platform-label';
import {
  PostActionsMenuHandle,
  useHangingPanel,
} from '@gitroom/frontend/components/launches/post.actions.menu';
import { SplitPanel } from '@gitroom/frontend/components/ui/split.panel';
import {
  CheckmarkIcon,
  ChevronRightIcon,
  PlusIcon,
} from '@gitroom/frontend/components/ui/icons';
import {
  BrandMark,
  NoBrandMark,
} from '@gitroom/frontend/components/brands/brand.mark';
import {
  Brand,
  useBrands,
  useMoveChannels,
} from '@gitroom/frontend/components/brands/use.brands';
import { useBrandDialogs } from '@gitroom/frontend/components/brands/brand.dialogs';

// A brand's mark in its row (board BrandMenu), and the smaller overlapping
// marks of Each channel's brand.
const MARK = 'w-[28px] h-[28px] rounded-[7px] text-[12px]';
const SMALL_MARK = 'w-[20px] h-[20px] rounded-[5px] text-[10px]';
const SEPARATOR = 'h-px mx-[4px] my-[6px] bg-line';
// The link-style row under a list: Manage brands, and Move to brand's
// + New brand.
const FOOTER_LINK = clsx(
  'self-start flex items-center gap-[8px] min-h-[44px] px-[10px] rounded-[8px] text-[13px] font-[600] text-brandText',
  FOCUS_RING
);

// Up and Down move through the options, wrapping, as the channel list's
// radios do (onRadioGroupKeyDown); the list runs top to bottom in either
// language, so there is no horizontal pair to mirror. By then the list is in
// its place, so the focus scrolls only a long list itself, to show the
// option, and that keeps it open.
export const onListKeyDown = (event: KeyboardEvent<HTMLElement>) => {
  const step = { ArrowDown: 1, ArrowUp: -1 }[event.key] || 0;
  const options = Array.from(
    event.currentTarget.querySelectorAll<HTMLElement>('[role="option"]')
  );
  const from = options.indexOf(event.target as HTMLElement);
  if (!step || from < 0) {
    return;
  }
  event.preventDefault();
  options[(from + step + options.length) % options.length].focus();
};

type HangingPanel = ReturnType<typeof useHangingPanel>;

// The keys of the box that holds a brand list. Escape is the list's alone
// while it is open. The AI image dialog behind it closes on an Escape that
// reaches the document (new-modal.tsx), where React's listener sits too, so
// only stopImmediatePropagation keeps the key from it, as the bottom sheets
// do. The list hanging in the body comes after the rest of the page, so Tab
// and Shift+Tab in it close it as a menu does, `close` giving the focus back
// to the button; the sheet keeps its own Tab.
const onMenuKeyDown = (
  e: KeyboardEvent<HTMLDivElement>,
  { panelRef, show }: HangingPanel,
  close: () => void
) => {
  if (e.key === 'Tab' && panelRef.current?.contains(e.target as Node)) {
    e.preventDefault();
    close();
    return;
  }
  if (e.key !== 'Escape' || !show) {
    return;
  }
  e.stopPropagation();
  e.nativeEvent.stopImmediatePropagation();
  close();
};

// A choice: its mark, its name and the line under it, and a ✓ when it is the
// current one. Enter and Space pick it, as a click does. A brand's name keeps
// its own direction.
export const Option: FC<{
  mark: ReactNode;
  name: string;
  dir?: 'auto';
  sub: string;
  selected: boolean;
  sheet: boolean;
  onPick: () => void;
}> = ({ mark, name, dir, sub, selected, sheet, onPick }) => (
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
      'flex items-center gap-[10px] px-[10px] py-[6px] rounded-[8px] text-start cursor-pointer hover:bg-surface2 transition-colors',
      sheet ? 'min-h-[56px]' : 'min-h-[48px]',
      FOCUS_RING
    )}
  >
    {mark}
    <span className="flex-1 min-w-0 flex flex-col items-start gap-[1px]">
      <span
        dir={dir}
        className={clsx(
          'max-w-full truncate text-[14px] text-ink',
          selected && 'font-[600]'
        )}
      >
        {name}
      </span>
      <span className="text-[12px] leading-[1.4] text-muted">{sub}</span>
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

/**
 * A brand list while it is open, mounted with it: its title, Each channel's
 * brand when `each` spans two or more brands, the brands A to Z, as the
 * channel list orders them, each with its mark and its count of `channels`,
 * No brand, then the `footer` its owner gives. A pick hands the choice on.
 *
 * On a wide screen it hangs from its owner's box as PostActionsMenu's list
 * does, against the viewport, so Samy's message box, which clips its content,
 * can't hide it. It renders into the body: Samy's chat is a transformed box
 * (`trz`, agent.chat.tsx), and `fixed` inside one measures from that box, not
 * the viewport. So it sits over the modals (200 and up, new-modal.tsx), the AI
 * image dialog among them, which no longer hold it. At 1025px and below it
 * opens as SplitPanel's bottom sheet, as the channel sheet does. Neither
 * animates.
 */
const BrandList: FC<{
  // the owner's useHangingPanel(), whose box the list hangs from
  hanging: HangingPanel;
  // 1025px and below, read by the owner, which is there before the list
  // opens: useMediaQuery answers false on its first render
  sheet: boolean;
  // shown over the options; it names the listbox and the sheet
  title: string;
  brands: Brand[];
  // the channels each brand's count is taken over
  channels: Channel[];
  value?: string;
  each?: string[];
  // No brand's line
  noBrandSub: string;
  footer: ReactNode;
  onPick: (choice: string) => void;
  onClose: () => void;
}> = ({
  hanging: { panelRef, show },
  sheet,
  title,
  brands,
  channels,
  value,
  each,
  noBrandSub,
  footer,
  onPick,
  onClose,
}) => {
  const t = useT();
  const list = useRef<HTMLDivElement>(null);

  // The focus opens on the current choice, else on the first option, so the
  // arrows work at once. It scrolls nothing: a browser scrolls the boxes
  // around what takes the focus to show it, and a scroll outside the list
  // closes it (useHangingPanel). The sheet's dialog takes it after, as every
  // SplitPanel sheet does, once its own media query has answered.
  useEffect(() => {
    (
      list.current?.querySelector<HTMLElement>('[aria-selected="true"]') ??
      list.current?.querySelector<HTMLElement>('[role="option"]')
    )?.focus({ preventScroll: true });
  }, []);

  const sorted = [...brands].sort(compareCustomers);
  const spanned = sorted.filter((brand) => each?.includes(brand.id));

  const content = (
    <>
      {/* The list is named by it; the title only shows it. */}
      <div
        aria-hidden="true"
        className={clsx(
          'px-[10px] font-[600]',
          sheet
            ? 'pt-[14px] pb-[8px] text-[15px] text-ink'
            : 'pt-[8px] pb-[6px] text-[12px] text-muted'
        )}
      >
        {title}
      </div>
      <div
        ref={list}
        role="listbox"
        aria-label={title}
        onKeyDown={onListKeyDown}
        className="flex flex-col"
      >
        {each && each.length > 1 && (
          <>
            <Option
              mark={
                <span aria-hidden="true" className="flex-none flex">
                  {spanned.map((brand, index) => (
                    <BrandMark
                      key={brand.id}
                      brand={brand}
                      className={clsx(
                        SMALL_MARK,
                        index > 0 && '-ms-[6px] ring-2 ring-surface'
                      )}
                    />
                  ))}
                </span>
              }
              name={t('brands_each_channel', "Each channel's brand")}
              sub={t(
                'brands_each_channel_sub',
                'One image per brand, a credit each'
              )}
              selected={value === EACH_BRAND}
              sheet={sheet}
              onPick={() => onPick(EACH_BRAND)}
            />
            <div aria-hidden="true" className={SEPARATOR} />
          </>
        )}
        {sorted.map((brand) => (
          <Option
            key={brand.id}
            mark={<BrandMark brand={brand} className={MARK} />}
            name={brand.name}
            dir="auto"
            sub={t('channels_count', '{{count}} channels', {
              count: channels.filter(
                (channel) => channel.customer?.id === brand.id
              ).length,
            })}
            selected={value === brand.id}
            sheet={sheet}
            onPick={() => onPick(brand.id)}
          />
        ))}
        <div aria-hidden="true" className={SEPARATOR} />
        <Option
          mark={
            <NoBrandMark
              className="w-[28px] h-[28px] rounded-[8px]"
              size={14}
            />
          }
          name={t('brands_no_brand', 'No brand')}
          sub={noBrandSub}
          selected={value === NO_BRAND}
          sheet={sheet}
          onPick={() => onPick(NO_BRAND)}
        />
      </div>
      {footer}
    </>
  );

  return sheet ? (
    <SplitPanel open onClose={onClose} label={title}>
      <div className="flex flex-col">{content}</div>
    </SplitPanel>
  ) : (
    show &&
      createPortal(
        <div
          ref={panelRef}
          style={{ left: show.x, top: show.y }}
          className="fixed z-[300] w-[300px] max-h-[calc(100vh-20px)] overflow-y-auto flex flex-col p-[6px] bg-surface border border-line rounded-[12px] shadow-menu text-ink cursor-default"
        >
          {content}
        </div>,
        document.body
      )
  );
};

/**
 * The brand list (contracts/pages-ui.md part 2; boards BrandMenu and
 * SamyPhoneSheet), opened from a button the caller draws: Samy's brand chip,
 * titled for a message, and the AI image dialog's Brand field, titled for an
 * image. The brands A to Z, as the channel list orders them, each with its
 * mark and channel count; No brand; Manage brands to the Brands page. When
 * the picked channels span two or more brands, Each channel's brand comes
 * first. A ✓ marks the current choice; a pick hands on a brand's id,
 * NO_BRAND or EACH_BRAND and closes the list. It hangs from the button, and
 * at 1025px and below opens as a bottom sheet (BrandList).
 */
export const BrandMenu: FC<{
  // the organization's brands, as useBrands() gives them
  brands: Brand[];
  // the current choice, a brand's id, NO_BRAND or EACH_BRAND; none while
  // the chip waits for one
  value?: string;
  // the ids of the brands the picked channels belong to: two or more offer
  // Each channel's brand, with their marks
  each?: string[];
  // titles the list for a message (the chip) or an image (the dialog)
  variant: 'message' | 'image';
  onPick: (choice: string) => void;
  // the button's accessible name, what it shows, and its classes
  label: string;
  trigger: ReactNode;
  triggerClassName: string;
}> = ({
  brands,
  value,
  each,
  variant,
  onPick,
  label,
  trigger,
  triggerClassName,
}) => {
  const t = useT();
  const isMobile = useMediaQuery(MOBILE_QUERY);
  // A brand's channels come from the channel list, a disabled one too (C4).
  const { data } = useIntegrationList();
  const channels: Channel[] = data;
  const hanging = useHangingPanel();
  const { ref, show, setShow, below } = hanging;
  const button = useRef<HTMLButtonElement>(null);
  const open = !!show;

  const title =
    variant === 'image'
      ? t('brands_for_this_image', 'Brand for this image')
      : t('brands_for_this_message', 'Brand for this message');

  const close = () => {
    setShow(false);
    button.current?.focus();
  };

  const pick = (choice: string) => {
    close();
    onPick(choice);
  };

  return (
    <div
      ref={ref}
      onKeyDown={(e) => onMenuKeyDown(e, hanging, close)}
      className="flex"
    >
      <button
        ref={button}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setShow(open ? false : below())}
        className={triggerClassName}
      >
        {trigger}
      </button>
      {show && (
        <BrandList
          hanging={hanging}
          sheet={isMobile}
          title={title}
          brands={brands}
          channels={channels}
          value={value}
          each={each}
          noBrandSub={t(
            'brands_no_brand_sub',
            'Sends no logo, examples or colours'
          )}
          footer={
            // A new tab, so the AI image dialog, a post editor under it, or
            // Samy's message box keep what is in them.
            <Link
              href="/brands"
              target="_blank"
              rel="noreferrer"
              onClick={() => setShow(false)}
              className={FOOTER_LINK}
            >
              {t('brands_manage_brands', 'Manage brands')}
              <ChevronRightIcon
                size={14}
                aria-hidden="true"
                className="rtl:rotate-180"
              />
            </Link>
          }
          onPick={pick}
          onClose={close}
        />
      )}
    </div>
  );
};

// Move to brand's list, mounted while it is open, so the brands and the
// channel list load when it opens, not with every channel row: a pick moves
// the channel (nothing for the ✓ choice), + New brand opens New brand with
// the channel and moves it into the brand once it is created.
const MoveToBrandList: FC<{
  hanging: HangingPanel;
  sheet: boolean;
  channel: Channel;
  onClose: () => void;
}> = ({ hanging, sheet, channel, onClose }) => {
  const t = useT();
  const { data: brands } = useBrands();
  // A brand's channels come from the channel list, a disabled one too (C4).
  const { data } = useIntegrationList();
  const channels: Channel[] = data;
  const move = useMoveChannels();
  const { openNewBrand } = useBrandDialogs();
  // '' is the route's No brand
  const current = channel.customer?.id || '';

  const pick = (choice: string) => {
    const group = choice === NO_BRAND ? '' : choice;
    onClose();
    if (group !== current) {
      move([channel.id], group);
    }
  };

  const create = () => {
    onClose();
    openNewBrand((id) => move([channel.id], id), channel);
  };

  return (
    <BrandList
      hanging={hanging}
      sheet={sheet}
      title={t('brands_move_channel_to', 'Move {{channel}} to', {
        channel: isolate(channel.name),
        interpolation: { escapeValue: false },
      })}
      brands={brands ?? []}
      channels={channels}
      value={current || NO_BRAND}
      noBrandSub={t(
        'brands_no_brand_on_its_own',
        'Listed on its own, outside any brand'
      )}
      footer={
        <button type="button" onClick={create} className={FOOTER_LINK}>
          <PlusIcon size={14} aria-hidden="true" />
          {t('brands_new_brand', 'New brand')}
        </button>
      }
      onPick={pick}
      onClose={onClose}
    />
  );
};

/**
 * Move to brand (spec 058, contracts/ui.md "The Move list"), for the channel
 * ⋯ menu (menu/menu.tsx): the brand list, titled for the channel, opened
 * through its handle by the menu's Move to brand. It is a held box, as a
 * held PostActionsMenu is: laid over the ⋯ in the menu's relative box, it
 * lets every press through to the ⋯ and hangs the list from it, from its
 * other side in Arabic, and at 1025px and below holds the sheet, which takes
 * presses. `data-open` while open keeps the row's ⋯ shown (channel.panel.tsx)
 * while the pointer or the focus is in a list the body holds. Escape and Tab
 * close it as BrandMenu's do, the focus going back to the ⋯ (`button`).
 */
export const MoveToBrandMenu = forwardRef<
  PostActionsMenuHandle,
  { channel: Channel; button: RefObject<HTMLButtonElement | null> }
>(function MoveToBrandMenu({ channel, button }, handle) {
  const isMobile = useMediaQuery(MOBILE_QUERY);
  const hanging = useHangingPanel();
  const { ref, show, setShow, below } = hanging;

  useImperativeHandle(
    handle,
    () => ({
      open: () => setShow(below()),
      close: () => setShow(false),
    }),
    [below, setShow]
  );

  const close = () => {
    setShow(false);
    button.current?.focus();
  };

  return (
    <div
      ref={ref}
      onKeyDown={(e) => onMenuKeyDown(e, hanging, close)}
      data-open={show ? '' : undefined}
      className="absolute inset-0 pointer-events-none"
    >
      {show && (
        <div className="pointer-events-auto">
          <MoveToBrandList
            hanging={hanging}
            sheet={isMobile}
            channel={channel}
            onClose={close}
          />
        </div>
      )}
    </div>
  );
});
