'use client';

import { FC, KeyboardEvent, ReactNode, useEffect, useRef } from 'react';
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
import { useHangingPanel } from '@gitroom/frontend/components/launches/post.actions.menu';
import { SplitPanel } from '@gitroom/frontend/components/ui/split.panel';
import {
  CheckmarkIcon,
  ChevronRightIcon,
} from '@gitroom/frontend/components/ui/icons';
import {
  BrandMark,
  NoBrandMark,
} from '@gitroom/frontend/components/brands/brand.mark';
import { Brand } from '@gitroom/frontend/components/brands/use.brands';

// The choices besides a brand's id: no kit at all, or each picked channel's
// own brand, as Samy's request context takes them (brand.dto.ts), handed on
// to the list's callers.
export { EACH_BRAND, NO_BRAND };

// A brand's mark in its row (board BrandMenu), and the smaller overlapping
// marks of Each channel's brand.
const MARK = 'w-[28px] h-[28px] rounded-[7px] text-[12px]';
const SMALL_MARK = 'w-[20px] h-[20px] rounded-[5px] text-[10px]';
const SEPARATOR = 'h-px mx-[4px] my-[6px] bg-line';

// Up and Down move through the options, wrapping, as the channel list's
// radios do (onRadioGroupKeyDown); the list runs top to bottom in either
// language, so there is no horizontal pair to mirror.
const onListKeyDown = (event: KeyboardEvent<HTMLElement>) => {
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

// A choice: its mark, its name and the line under it, and a ✓ when it is the
// current one. Enter and Space pick it, as a click does. A brand's name keeps
// its own direction.
const Option: FC<{
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
 * The brand list (contracts/pages-ui.md part 2; boards BrandMenu and
 * SamyPhoneSheet), opened from a button the caller draws: Samy's brand chip,
 * titled for a message, and the AI image dialog's Brand field, titled for an
 * image. The brands A to Z, as the channel list orders them, each with its
 * mark and channel count; No brand; Manage brands to the Brands page. When
 * the picked channels span two or more brands, Each channel's brand comes
 * first. A ✓ marks the current choice; a pick hands on a brand's id,
 * NO_BRAND or EACH_BRAND and closes the list.
 *
 * On a wide screen the list hangs from the button as PostActionsMenu's does,
 * against the viewport, so Samy's message box, which clips its content, can't
 * hide it. At 1025px and below it opens as SplitPanel's bottom sheet, as the
 * channel sheet does. Neither animates.
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
  // Manage brands opens the Brands page in a new tab, so a dialog around the
  // list, a post editor under it, or Samy's message box keep what is in them
  manageInNewTab?: boolean;
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
  manageInNewTab,
  label,
  trigger,
  triggerClassName,
}) => {
  const t = useT();
  const isMobile = useMediaQuery(MOBILE_QUERY);
  // A brand's channels come from the channel list, a disabled one too (C4).
  const { data } = useIntegrationList();
  const channels: Channel[] = data;
  const { ref, panelRef, show, setShow, below } = useHangingPanel();
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const open = !!show;

  const title =
    variant === 'image'
      ? t('brands_for_this_image', 'Brand for this image')
      : t('brands_for_this_message', 'Brand for this message');

  // The focus opens on the current choice, else on the first option, so the
  // arrows work at once. The sheet's dialog takes it after, as every
  // SplitPanel sheet does, once its own media query has answered.
  useEffect(() => {
    if (!open) {
      return;
    }
    (
      list.current?.querySelector<HTMLElement>('[aria-selected="true"]') ??
      list.current?.querySelector<HTMLElement>('[role="option"]')
    )?.focus();
  }, [open]);

  const close = () => {
    setShow(false);
    button.current?.focus();
  };

  const pick = (choice: string) => {
    close();
    onPick(choice);
  };

  // Escape is the list's alone while it is open. The AI image dialog behind
  // it closes on an Escape that reaches the document (new-modal.tsx), where
  // React's listener sits too, so only stopImmediatePropagation keeps the key
  // from it, as the bottom sheets do.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Escape' || !open) {
      return;
    }
    e.stopPropagation();
    e.nativeEvent.stopImmediatePropagation();
    close();
  };

  const sorted = [...brands].sort(compareCustomers);
  const spanned = sorted.filter((brand) => each?.includes(brand.id));

  const content = (
    <>
      {/* The list is named by it; the title only shows it. */}
      <div
        aria-hidden="true"
        className={clsx(
          'px-[10px] font-[600]',
          isMobile
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
              sheet={isMobile}
              onPick={() => pick(EACH_BRAND)}
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
            sheet={isMobile}
            onPick={() => pick(brand.id)}
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
          sub={t('brands_no_brand_sub', 'Sends no logo, examples or colours')}
          selected={value === NO_BRAND}
          sheet={isMobile}
          onPick={() => pick(NO_BRAND)}
        />
      </div>
      <Link
        href="/brands"
        target={manageInNewTab ? '_blank' : undefined}
        rel={manageInNewTab ? 'noreferrer' : undefined}
        onClick={() => setShow(false)}
        className={clsx(
          'self-start flex items-center gap-[8px] min-h-[44px] px-[10px] rounded-[8px] text-[13px] font-[600] text-brandText',
          FOCUS_RING
        )}
      >
        {t('brands_manage_brands', 'Manage brands')}
        <ChevronRightIcon
          size={14}
          aria-hidden="true"
          className="rtl:rotate-180"
        />
      </Link>
    </>
  );

  return (
    <div ref={ref} onKeyDown={onKeyDown} className="flex">
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
      {show &&
        (isMobile ? (
          <SplitPanel open onClose={close} label={title}>
            <div className="flex flex-col">{content}</div>
          </SplitPanel>
        ) : (
          <div
            ref={panelRef}
            style={{ left: show.x, top: show.y }}
            className="fixed z-[100] w-[300px] max-h-[calc(100vh-20px)] overflow-y-auto flex flex-col p-[6px] bg-surface border border-line rounded-[12px] shadow-menu text-ink cursor-default"
          >
            {content}
          </div>
        ))}
    </div>
  );
};
