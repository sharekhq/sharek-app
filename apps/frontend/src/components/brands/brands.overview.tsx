'use client';

import { FC, ReactNode } from 'react';
import clsx from 'clsx';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { NO_BRAND } from '@gitroom/nestjs-libraries/dtos/brands/brand.dto';
import { FOCUS_RING } from '@gitroom/frontend/components/launches/channel.panel';
import { CheckmarkIcon, PlusIcon } from '@gitroom/frontend/components/ui/icons';
import { CARD_PADDING } from '@gitroom/frontend/components/ui/page.scroll';
import {
  BrandMark,
  NoBrandMark,
} from '@gitroom/frontend/components/brands/brand.mark';
import {
  Brand,
  kitNote,
  kitStatus,
} from '@gitroom/frontend/components/brands/use.brands';

// A page's top on the Brands page (board Main, part 4): the mark, when it has
// one, the name and the line under it, then what the page offers. The
// overview's, a brand's and No brand's.
export const PageTop: FC<{
  mark?: ReactNode;
  name: string;
  dir?: 'auto';
  line: string;
  children?: ReactNode;
}> = ({ mark, name, dir, line, children }) => (
  <div className="flex items-center gap-[16px] mobile:gap-[12px]">
    {mark}
    <div className="flex-1 min-w-0 flex flex-col items-start gap-[2px]">
      <h2
        dir={dir}
        className="max-w-full truncate text-[22px] font-[600] text-ink"
      >
        {name}
      </h2>
      <p className="text-[13px] leading-[1.45] text-muted">{line}</p>
    </div>
    {children}
  </div>
);

// A card's mark, and the look a brand's card and No brand's share.
const CARD_MARK = 'w-[44px] h-[44px] rounded-[11px] text-[15px]';
const CARD = clsx(
  'flex flex-col gap-[12px]',
  CARD_PADDING,
  'rounded-[12px] border border-line bg-surface text-start cursor-pointer hover:border-inkSoft transition-colors',
  FOCUS_RING
);
const NOTE = 'text-[12.5px] text-muted';

// A card's top: its mark, its name and the line under it.
const CardTop: FC<{ mark: ReactNode; name: ReactNode; line: string }> = ({
  mark,
  name,
  line,
}) => (
  <span className="flex items-center gap-[12px]">
    {mark}
    <span className="flex-1 min-w-0 flex flex-col items-start gap-[2px]">
      {name}
      <span className="text-[13px] text-muted">{line}</span>
    </span>
  </span>
);

// One kit item: a tick when it is done, dashed when it is missing, with a
// word for screen readers, so its state is more than its colour.
const KitItem: FC<{ label: string; done: boolean }> = ({ label, done }) => {
  const t = useT();
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-[4px] h-[24px] px-[8px] rounded-[6px] text-[12px] font-[500]',
        done
          ? 'bg-surface2 text-ink'
          : 'border border-dashed border-line text-muted'
      )}
    >
      {/* the tick's width and height are fixed: it takes no size */}
      {done && (
        <CheckmarkIcon
          width={12}
          height={9}
          aria-hidden="true"
          className="text-success"
        />
      )}
      {label}
      {!done && (
        <span className="sr-only">{t('brands_kit_missing', 'missing')}</span>
      )}
    </span>
  );
};

// A brand's card (FR-013): its channels, how many of the kit's five items it
// has, each item, and the one note that holds (kitNote), if any.
const BrandCard: FC<{
  brand: Brand;
  channels: number;
  onPick: () => void;
}> = ({ brand, channels, onPick }) => {
  const t = useT();
  const status = kitStatus(brand);
  const items = [
    { key: 'logo', label: t('brands_logo', 'Logo'), done: status.logo },
    {
      key: 'colours',
      label: t('brands_colours', 'Colours'),
      done: status.colours,
    },
    { key: 'fonts', label: t('brands_fonts', 'Fonts'), done: status.fonts },
    {
      key: 'examples',
      label: status.examples
        ? t('brands_kit_examples_n', '{{n}} of 3 examples', {
            n: status.examples,
          })
        : t('brands_kit_examples', 'Examples'),
      done: status.examples > 0,
    },
    {
      key: 'about',
      label: t('brands_details_about', 'About'),
      done: status.about,
    },
  ];
  const note = kitNote(status, channels);
  const notes = {
    no_channels: t('brands_no_channels_yet', 'No channels yet'),
    empty: t('brands_overview_empty_kit', 'Empty kit: Samy uses no look'),
    ready: t('brands_overview_ready', 'Ready: Samy and Studio use this kit'),
  };

  return (
    <button type="button" onClick={onPick} className={CARD}>
      <CardTop
        mark={<BrandMark brand={brand} className={CARD_MARK} />}
        name={
          <span
            dir="auto"
            title={brand.name}
            className="max-w-full truncate text-[15px] font-[600] text-ink"
          >
            {brand.name}
          </span>
        }
        line={`${t('channels_count', '{{count}} channels', {
          count: channels,
        })} · ${t('brands_overview_kit', 'kit {{n}} of 5', {
          n: items.filter((item) => item.done).length,
        })}`}
      />
      <span className="flex flex-wrap gap-[6px]">
        {items.map((item) => (
          <KitItem key={item.key} label={item.label} done={item.done} />
        ))}
      </span>
      {note && <span className={NOTE}>{notes[note]}</span>}
    </button>
  );
};

/**
 * The Brands page's overview above 1025px (contracts/ui.md §7): All brands,
 * then a card per brand in the list's order, New brand, and No brand while a
 * channel is in no brand. It loads nothing: the page hands it the brands and
 * each one's channel count (FR-017).
 */
export const BrandsOverview: FC<{
  // sorted A to Z, as the list
  brands: Brand[];
  // channels per brand id, NO_BRAND included
  count: (id: string) => number;
  // a brand id or NO_BRAND
  onPick: (id: string) => void;
  onNewBrand: () => void;
}> = ({ brands, count, onPick, onNewBrand }) => {
  const t = useT();
  const ungrouped = count(NO_BRAND);

  return (
    <>
      <PageTop
        name={t('brands_overview_title', 'All brands')}
        line={[
          t('brands_count', '{{count}} brands', { count: brands.length }),
          ...(ungrouped
            ? [
                t(
                  'brands_overview_ungrouped',
                  '{{count}} channels not in a brand',
                  { count: ungrouped }
                ),
              ]
            : []),
          t(
            'brands_overview_used_by',
            "Samy and Sharek's AI use each brand's kit to keep images on-brand."
          ),
        ].join(' · ')}
      />
      {/* At most three across, at least 240px each: 32px is the two 16px gaps. */}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(max(240px,calc((100%_-_32px)/3)),1fr))] gap-[16px]">
        {brands.map((brand) => (
          <BrandCard
            key={brand.id}
            brand={brand}
            channels={count(brand.id)}
            onPick={() => onPick(brand.id)}
          />
        ))}
        <button
          type="button"
          onClick={onNewBrand}
          className={clsx(
            'flex flex-col items-center justify-center gap-[8px] min-h-[150px]',
            CARD_PADDING,
            'rounded-[12px] border-[1.5px] border-dashed border-line text-[14px] font-[600] text-muted hover:text-ink cursor-pointer transition-colors',
            FOCUS_RING
          )}
        >
          <span className="flex items-center justify-center w-[44px] h-[44px] rounded-[11px] bg-surface2 text-ink">
            <PlusIcon size={20} aria-hidden="true" />
          </span>
          {t('brands_new_brand', 'New brand')}
        </button>
        {ungrouped > 0 && (
          <button
            type="button"
            onClick={() => onPick(NO_BRAND)}
            className={CARD}
          >
            <CardTop
              mark={<NoBrandMark className={CARD_MARK} size={20} />}
              name={
                <span className="text-[15px] font-[600] text-ink">
                  {t('brands_no_brand', 'No brand')}
                </span>
              }
              line={t('channels_count', '{{count}} channels', {
                count: ungrouped,
              })}
            />
            <span className={NOTE}>
              {t(
                'brands_overview_no_brand_help',
                "These channels post without a brand's look. Move one with its ⋯ in the Calendar."
              )}
            </span>
          </button>
        )}
      </div>
    </>
  );
};
