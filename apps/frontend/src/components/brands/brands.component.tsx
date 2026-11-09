'use client';

import { FC, ReactNode, useState } from 'react';
import clsx from 'clsx';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useMediaDirectory } from '@gitroom/react/helpers/use.media.directory';
import {
  MOBILE_QUERY,
  useMediaQuery,
} from '@gitroom/react/helpers/use.media.query';
import SafeImage from '@gitroom/react/helpers/safe.image';
import { LoadingComponent } from '@gitroom/frontend/components/layout/loading';
import { useIntegrationList } from '@gitroom/frontend/components/launches/helpers/use.integration.list';
import {
  Channel,
  compareChannels,
  compareCustomers,
  FOCUS_RING,
} from '@gitroom/frontend/components/launches/channel.panel';
import { PostActionsMenu } from '@gitroom/frontend/components/launches/post.actions.menu';
import { SplitPanel } from '@gitroom/frontend/components/ui/split.panel';
import { EmptyState } from '@gitroom/frontend/components/ui/empty.state';
import {
  PencilIcon,
  PlusIcon,
  TrashIcon,
} from '@gitroom/frontend/components/ui/icons';
import {
  BrandChannel,
  BrandKit,
  SMALL_BUTTON,
} from '@gitroom/frontend/components/brands/brand.kit';
import { useBrandDialogs } from '@gitroom/frontend/components/brands/brand.dialogs';
import {
  Brand,
  useBrands,
} from '@gitroom/frontend/components/brands/use.brands';

// No brand's place in the list, beside the brands' ids, which are UUIDs.
const NO_BRAND = 'none';

// A brand's mark in its list row, and at the top of its page (board Main).
const LIST_MARK = 'w-[32px] h-[32px] rounded-[8px] text-[13px]';
const PAGE_MARK =
  'w-[56px] h-[56px] rounded-[13px] text-[20px] mobile:w-[44px] mobile:h-[44px] mobile:text-[17px]';

// A brand's logo, or its initial while it has none or the logo was deleted
// from Media. Decoration: the brand's name is beside it.
const BrandMark: FC<{ brand: Brand; className: string }> = ({
  brand,
  className,
}) => {
  const mediaDirectory = useMediaDirectory();
  const { logo } = brand.kit;

  if (logo?.path && !logo.missing) {
    return (
      <SafeImage
        src={mediaDirectory.set(logo.path)}
        alt=""
        className={clsx('flex-none object-contain', className)}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className={clsx(
        'flex-none flex items-center justify-center bg-surface2 text-inkSoft font-[700]',
        className
      )}
    >
      {[...brand.name][0]?.toUpperCase()}
    </span>
  );
};

// No brand's mark: an empty dashed tile with a crossed circle.
const NoBrandMark: FC<{ className: string; size: number }> = ({
  className,
  size,
}) => (
  <span
    aria-hidden="true"
    className={clsx(
      'flex-none flex items-center justify-center border-[1.5px] border-dashed border-line text-muted',
      className
    )}
  >
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <circle cx="12" cy="12" r="8" />
      <path d="M6.5 17.5l11-11" />
    </svg>
  </span>
);

// A row of the list: the mark, the name and the channel count. The open page's
// row has the selected tint; the others show a hover. A brand's name keeps its
// own direction and lines up with the list's start.
const ListRow: FC<{
  mark: ReactNode;
  name: string;
  dir?: 'auto';
  count: number;
  current: boolean;
  onClick: () => void;
}> = ({ mark, name, dir, count, current, onClick }) => {
  const t = useT();
  return (
    <button
      type="button"
      aria-current={current ? 'page' : undefined}
      onClick={onClick}
      className={clsx(
        'flex items-center gap-[12px] w-full min-h-[52px] px-[10px] py-[8px] rounded-[10px] text-start cursor-pointer transition-colors',
        current ? 'bg-brandSoft2' : 'hover:bg-boxHover',
        FOCUS_RING
      )}
    >
      {mark}
      <span className="flex-1 min-w-0 flex flex-col items-start gap-[1px]">
        <span
          dir={dir}
          className={clsx(
            'max-w-full truncate text-[14px] text-ink',
            current ? 'font-[600]' : 'font-[500]'
          )}
        >
          {name}
        </span>
        <span className="text-[12px] text-muted whitespace-nowrap">
          {t('channels_count', '{{count}} channels', { count })}
        </span>
      </span>
    </button>
  );
};

// The list (board BrandsList): New brand, with no heading above it, then each
// brand A to Z, and No brand under Not in a brand. With no brands it says
// what they are for.
const BrandsList: FC<{
  brands: Brand[];
  count: (id: string) => number;
  current: string | null;
  onPick: (id: string) => void;
  onNewBrand: () => void;
}> = ({ brands, count, current, onPick, onNewBrand }) => {
  const t = useT();
  const notInABrand = t('brands_not_in_a_brand', 'Not in a brand');

  return (
    <nav
      aria-label={t('brands_all_brands', 'Brands')}
      className="flex flex-col gap-[2px] pt-[12px]"
    >
      <button
        type="button"
        onClick={onNewBrand}
        className={clsx(
          'mx-[4px] mb-[8px] flex items-center gap-[8px] h-[40px] coarse:h-[44px] px-[12px] rounded-[8px] bg-quiet border border-line hover:bg-surface2 transition-colors text-ink text-[14px] font-[600] cursor-pointer',
          FOCUS_RING
        )}
      >
        <PlusIcon size={16} aria-hidden="true" />
        {t('brands_new_brand', 'New brand')}
      </button>
      {!brands.length && (
        <p className="px-[12px] py-[8px] text-[13px] leading-[1.5] text-muted">
          {t(
            'brands_list_empty',
            "No brands yet. Give each brand its own logo and look, and Samy uses it for that brand's channels."
          )}
        </p>
      )}
      {brands.map((brand) => (
        <ListRow
          key={brand.id}
          mark={<BrandMark brand={brand} className={LIST_MARK} />}
          name={brand.name}
          dir="auto"
          count={count(brand.id)}
          current={brand.id === current}
          onClick={() => onPick(brand.id)}
        />
      ))}
      <div role="group" aria-label={notInABrand} className="flex flex-col">
        <div
          aria-hidden="true"
          className="px-[10px] pt-[14px] pb-[6px] text-[12px] font-[600] text-muted"
        >
          {notInABrand}
        </div>
        <ListRow
          mark={<NoBrandMark className={LIST_MARK} size={14} />}
          name={t('brands_no_brand', 'No brand')}
          count={count(NO_BRAND)}
          current={current === NO_BRAND}
          onClick={() => onPick(NO_BRAND)}
        />
      </div>
    </nav>
  );
};

// A page's top (board Main, part 4): the mark, the name and the line under
// it, then what the page offers.
const PageTop: FC<{
  mark: ReactNode;
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

/**
 * The Brands page (contracts/pages-ui.md): the brands listed on the start side
 * in SplitPanel, as Samy's chats are, and the picked brand's page, its name,
 * Rename and its ⋯ over its kit, or No brand's channels. A wide screen shows
 * the first brand until one is picked. At 1025px and below the list is the
 * page until a brand is picked, and the brand's page links back to it.
 *
 * Which channels are in a brand comes from the channel list (C4), so a count
 * includes disabled channels.
 */
export const BrandsComponent: FC = () => {
  const t = useT();
  const isMobile = useMediaQuery(MOBILE_QUERY);
  const { data } = useBrands();
  const { data: integrations, isLoading: loadingChannels } =
    useIntegrationList();
  const { openNewBrand, openRenameBrand, openDeleteBrand } = useBrandDialogs();
  // The brand picked in the list, or No brand; kept for the visit, as
  // Analytics keeps its channel.
  const [chosen, setChosen] = useState<string | null>(null);

  // Loading until the brands come, after a failed answer too, which SWR asks
  // again for: only an answer can say there are no brands.
  if (!data || loadingChannels) {
    return (
      <div className="bg-newBgColorInner p-[20px] flex flex-1 flex-col gap-[15px] transition-all items-center justify-center">
        <LoadingComponent />
      </div>
    );
  }

  const brands = [...data].sort(compareCustomers);
  const channels: Channel[] = integrations;
  const channelsOf = (id: string) =>
    channels.filter((channel) => (channel.customer?.id || NO_BRAND) === id);
  // The open page: No brand, or the brand picked while it is still there.
  // Before a pick, or after the picked brand is deleted, a wide screen shows
  // the first brand and 1025px and below the list.
  const current =
    chosen === NO_BRAND
      ? NO_BRAND
      : brands.find((brand) => brand.id === chosen)?.id ??
        (isMobile ? null : brands[0]?.id ?? null);
  const brand = brands.find((item) => item.id === current);
  const newBrand = () => openNewBrand(setChosen);

  const list = (
    <BrandsList
      brands={brands}
      count={(id) => channelsOf(id).length}
      current={current}
      onPick={setChosen}
      onNewBrand={newBrand}
    />
  );

  const count = (id: string) =>
    t('channels_count', '{{count}} channels', {
      count: channelsOf(id).length,
    });

  const rename = t('rename', 'Rename');

  const page =
    current === NO_BRAND ? (
      <>
        <PageTop
          mark={<NoBrandMark className={PAGE_MARK} size={22} />}
          name={t('brands_no_brand', 'No brand')}
          line={count(NO_BRAND)}
        />
        <div className="flex flex-col gap-[2px]">
          {channelsOf(NO_BRAND)
            .sort(compareChannels)
            .map((channel) => (
              <BrandChannel key={channel.id} channel={channel} />
            ))}
        </div>
      </>
    ) : (
      brand && (
        <>
          <PageTop
            mark={<BrandMark brand={brand} className={PAGE_MARK} />}
            name={brand.name}
            dir="auto"
            line={`${count(brand.id)} · ${t(
              'brands_used_by',
              "Samy and Sharek's AI use this kit to keep your images on-brand."
            )}`}
          >
            {/* on a phone, Rename is in the ⋯ alone */}
            <button
              type="button"
              onClick={() => openRenameBrand(brand)}
              className={clsx(SMALL_BUTTON, 'gap-[6px] mobile:hidden')}
            >
              <PencilIcon size={15} aria-hidden="true" />
              {rename}
            </button>
            <PostActionsMenu
              label={t('brands_brand_options', 'Brand options')}
              triggerClassName={clsx(
                'flex-none flex items-center justify-center w-[44px] h-[44px] rounded-[8px] text-muted hover:bg-surface2 hover:text-ink aria-expanded:bg-surface2 aria-expanded:text-ink cursor-pointer transition-colors',
                FOCUS_RING
              )}
              trigger={
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <circle cx="5" cy="12" r="1.8" />
                  <circle cx="12" cy="12" r="1.8" />
                  <circle cx="19" cy="12" r="1.8" />
                </svg>
              }
              actions={[
                {
                  key: 'rename',
                  icon: (
                    <PencilIcon
                      size={16}
                      aria-hidden="true"
                      className="text-muted"
                    />
                  ),
                  label: rename,
                  onClick: () => openRenameBrand(brand),
                },
                {
                  key: 'delete',
                  icon: <TrashIcon size={16} aria-hidden="true" />,
                  label: t('brands_delete_brand', 'Delete brand'),
                  onClick: () => openDeleteBrand(brand),
                  danger: true,
                },
              ]}
            />
          </PageTop>
          <BrandKit brand={brand} />
        </>
      )
    );

  return (
    <div className="flex flex-1 min-w-0 gap-[1px] mobile:flex-col">
      {/* The rail above 1025px. Below it the list is the page itself, so the
          rail's sheet never opens and has nothing to close. */}
      {!isMobile && (
        <SplitPanel
          open={false}
          onClose={() => undefined}
          width="w-[272px]"
          label={t('brands_all_brands', 'Brands')}
        >
          {list}
        </SplitPanel>
      )}
      {/* Held to the window, as Analytics' numbers are: the page scrolls in
          its own box, so the list stays put. On a phone the box is static,
          and the page scrolls. */}
      <div className="bg-newBgColorInner flex-1 min-w-0 relative">
        <div className="absolute inset-0 overflow-y-auto flex flex-col mobile:static scrollbar scrollbar-thumb-fifth scrollbar-track-newBgColor">
          {!current ? (
            isMobile ? (
              <div className="px-[8px] pb-[20px]">{list}</div>
            ) : (
              <EmptyState
                illustration={
                  <span className="flex gap-[8px]">
                    {[0, 1, 2].map((tile) => (
                      <span
                        key={tile}
                        className="w-[44px] h-[44px] rounded-[11px] border-[1.5px] border-dashed border-line"
                      />
                    ))}
                  </span>
                }
                title={t('brands_empty_title', 'Give each brand its own look')}
                description={t(
                  'brands_empty_body',
                  "Add a logo, a few example posts, colours and fonts. When you pick a brand's channels, Samy and Sharek's AI keep your images in its look."
                )}
                actionLabel={t('brands_new_brand', 'New brand')}
                onAction={newBrand}
              />
            )
          ) : (
            <div className="w-full max-w-[960px] mx-auto flex flex-col gap-[20px] px-[32px] py-[24px] mobile:px-[14px] mobile:py-[16px]">
              {isMobile && (
                <button
                  type="button"
                  onClick={() => setChosen(null)}
                  className={clsx(
                    'self-start flex items-center gap-[4px] h-[44px] -my-[8px] -ms-[6px] px-[6px] rounded-[8px] text-ink text-[14px] font-[600] cursor-pointer',
                    FOCUS_RING
                  )}
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                    className="rtl:-scale-x-100"
                  >
                    <path d="M15 18l-6-6 6-6" />
                  </svg>
                  {t('brands_all_brands', 'Brands')}
                </button>
              )}
              {page}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
