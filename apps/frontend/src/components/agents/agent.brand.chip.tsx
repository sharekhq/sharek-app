'use client';

import { FC, useContext, useLayoutEffect, useRef } from 'react';
import clsx from 'clsx';
import { hasExtension } from '@gitroom/helpers/utils/has.extension';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import {
  brandsAmong,
  PropertiesContext,
} from '@gitroom/frontend/components/agents/agent';
import { useAttachments } from '@gitroom/frontend/components/agents/agent.attachments';
import { followChatBottom } from '@gitroom/frontend/components/agents/agent.created.media';
import { BrandMark } from '@gitroom/frontend/components/brands/brand.mark';
import {
  BrandMenu,
  EACH_BRAND,
  NO_BRAND,
} from '@gitroom/frontend/components/brands/brand.menu';
import { useBrands } from '@gitroom/frontend/components/brands/use.brands';
import { Integrations } from '@gitroom/frontend/components/launches/calendar.context';
import { FOCUS_RING } from '@gitroom/frontend/components/launches/channel.panel';
import { isolate } from '@gitroom/frontend/components/launches/helpers/platform-label';
import { useIntegrationList } from '@gitroom/frontend/components/launches/helpers/use.integration.list';

// A brand's mark on the chip (board SamyChip).
const MARK = 'w-[22px] h-[22px] rounded-[6px] text-[11px]';

/**
 * The brand chip after the "Samy will use" pill (contracts/pages-ui.md part
 * 2, states A to F; boards SamyChip, ChipStates and SamyPhoneChip): the brand
 * in use, its logo and name; N brands, with their marks, when the picked
 * channels span them; No brand; or Choose a brand while it waits. Agent
 * makes the choice; the chip opens the brand list for this message, whose
 * pick holds until the picked channels' brands change. Nothing shows while
 * the organization has no brands.
 */
export const BrandChip: FC = () => {
  const t = useT();
  const { properties, brand, pickBrand } = useContext(PropertiesContext);
  const { data: brands } = useBrands();
  const { data: channels } = useIntegrationList();

  if (!brands?.length) {
    return null;
  }

  const among = brandsAmong(brands, properties);
  const current = brands.find(({ id }) => id === brand);
  // a brand's fill, or an outline for No brand and while it waits
  const filled = !!current || brand === EACH_BRAND;
  const label = current
    ? current.name
    : brand === EACH_BRAND
    ? t('brands_count', '{{count}} brands', { count: among.length })
    : brand === NO_BRAND
    ? t('brands_no_brand', 'No brand')
    : t('brands_choose_a_brand', 'Choose a brand');

  return (
    // A click in the list, or on its sheet's scrim, stays the list's: the
    // box puts the focus in the text on any click that isn't on a button
    // (agent.input.tsx), which on a phone brings up the keyboard.
    <div className="flex min-w-0" onClick={(event) => event.stopPropagation()}>
      <BrandMenu
        brands={brands}
        count={(id) =>
          channels.filter(
            (channel: Integrations) => channel.customer?.id === id
          ).length
        }
        value={brand}
        each={among.map(({ id }) => id)}
        variant="message"
        onPick={pickBrand}
        label={t(
          'brands_chip_label',
          'Brand for this message: {{brand}}. Change brand',
          {
            brand: label,
            // React escapes the label, so i18next mustn't first
            interpolation: { escapeValue: false },
          }
        )}
        triggerClassName={clsx(
          'flex items-center gap-[7px] min-w-0 max-w-[230px] h-[30px] coarse:h-[44px] pe-[9px] rounded-full text-[13px] whitespace-nowrap cursor-pointer transition-colors aria-expanded:shadow-[inset_0_0_0_1.5px_var(--brand)]',
          filled
            ? 'ps-[4px] bg-surface2 text-ink'
            : brand === NO_BRAND
            ? 'ps-[8px] text-muted shadow-[inset_0_0_0_1px_var(--line)] hover:bg-surface2'
            : 'ps-[10px] text-inkSoft shadow-[inset_0_0_0_1.5px_var(--line)] hover:bg-surface2',
          FOCUS_RING
        )}
        trigger={
          <>
            {current && <BrandMark brand={current} className={MARK} />}
            {/* overlapped from the start edge, as the pill's pictures are */}
            {brand === EACH_BRAND && (
              <span aria-hidden="true" className="flex flex-none">
                {among.slice(0, 3).map((item, index) => (
                  <BrandMark
                    key={item.id}
                    brand={item}
                    className={clsx(
                      MARK,
                      index > 0 && '-ms-[7px] ring-2 ring-surface2'
                    )}
                  />
                ))}
              </span>
            )}
            {brand === NO_BRAND && (
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                aria-hidden="true"
                className="flex-none"
              >
                <circle cx="12" cy="12" r="8" />
                <path d="M6.5 17.5l11-11" />
              </svg>
            )}
            {/* a brand's name keeps its own direction, and a long one is cut */}
            <span
              dir={current ? 'auto' : undefined}
              className={clsx(
                'min-w-0 truncate',
                filled ? 'font-[600]' : 'text-inkSoft'
              )}
            >
              {label}
            </span>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              className="flex-none text-muted"
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </>
        }
      />
    </div>
  );
};

/**
 * The note under the attached images while a brand is chosen (FR-024; board
 * ChipStates, state E): they go in place of the brand's examples, and its
 * logo still goes along. A video is no example, so only images count.
 */
export const BrandNote: FC = () => {
  const t = useT();
  const { brand } = useContext(PropertiesContext);
  const { data: brands } = useBrands();
  const { attached } = useAttachments();
  const note = useRef<HTMLParagraphElement>(null);
  const current = brands?.find(({ id }) => id === brand);
  const images = attached.filter(
    (media) => !hasExtension(media.path, 'mp4')
  ).length;
  const showing = !!current && images > 0;

  // It takes its room from the chat, as the attachments' row does, and the
  // chat's own scrolling watches only its messages.
  useLayoutEffect(() => {
    if (note.current) {
      followChatBottom(
        document.querySelector('.copilotKitMessages'),
        note.current.offsetHeight
      );
    }
  }, [showing]);

  if (!showing) {
    return null;
  }

  return (
    <p
      ref={note}
      className="flex items-start gap-[8px] mt-[8px] mx-[12px] px-[10px] py-[8px] rounded-[10px] bg-aiSoft text-ink text-[12.5px] leading-[1.45] cursor-default"
    >
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className="flex-none mt-[1px] text-aiAccent"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v5M12 8h.01" />
      </svg>
      <span>
        {t(
          'brands_attach_note',
          "Your {{count}} images go in place of {{brand}}'s examples. Its logo still goes along.",
          {
            count: images,
            brand: isolate(current.name),
            interpolation: { escapeValue: false },
          }
        )}
      </span>
    </p>
  );
};
