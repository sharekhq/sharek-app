'use client';

import { ComponentProps, FC, ReactNode, useState } from 'react';
import clsx from 'clsx';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useMediaDirectory } from '@gitroom/react/helpers/use.media.directory';
import SafeImage from '@gitroom/react/helpers/safe.image';
import { Button } from '@gitroom/react/form/button';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import {
  MediaBox,
  mediaLibrarySize,
} from '@gitroom/frontend/components/media/media.component';
import { useIntegrationList } from '@gitroom/frontend/components/launches/helpers/use.integration.list';
import { platformLabel } from '@gitroom/frontend/components/launches/helpers/platform-label';
import {
  ChannelPicture,
  compareChannels,
} from '@gitroom/frontend/components/launches/channel.panel';
import {
  CheckmarkIcon,
  CloseIcon,
  PlusIcon,
} from '@gitroom/frontend/components/ui/icons';
import {
  BrandColourPopover,
  MAX_COLOURS,
} from '@gitroom/frontend/components/brands/brand.colour.popover';
import {
  Brand,
  useBrands,
} from '@gitroom/frontend/components/brands/use.brands';

// A kit holds up to 3 example posts, and font names up to 60 characters, as
// BrandKitDto keeps them.
const MAX_EXAMPLES = 3;
const MAX_FONT = 60;

// PUT /brands/:id/kit's body: only the field a change touches, so two members
// editing different parts of one kit don't overwrite each other (spec, Edge
// Cases). A list goes whole.
type KitChange = Partial<{
  logoId: string | null;
  exampleIds: string[];
  colours: string[];
  headingFont: string | null;
  bodyFont: string | null;
}>;

// A channel as GET /integrations/list gives it, as the channel list reads it.
type KitChannel = ComponentProps<typeof ChannelPicture>['channel'];

type Picked = { id: string; path: string }[];

const FOCUS_RING = 'focus-visible:ring-2 focus-visible:ring-brand';

// The boards' small ghost button: Replace, Remove and Upload logo.
const SMALL_BUTTON = clsx(
  'inline-flex items-center justify-center h-[36px] coarse:h-[44px] px-[12px] rounded-[8px] border border-line text-ink text-[13px] font-[600] whitespace-nowrap cursor-pointer hover:border-inkSoft transition-colors',
  FOCUS_RING
);

// A logo's transparent parts read against a checkerboard of this (board Main,
// part 5).
const CHECK = 'color-mix(in srgb, var(--ink) 6%, transparent)';

// One of the kit's cards: its heading with a count, its own parts, then the
// line that says what it is for.
const Card: FC<{
  title: string;
  count?: ReactNode;
  help: string;
  children: ReactNode;
}> = ({ title, count, help, children }) => (
  <section className="flex flex-col gap-[12px] min-w-0 p-[16px] rounded-[12px] border border-line bg-surface">
    <div className="flex items-center gap-[8px]">
      <h3 className="text-[15px] font-[600] text-ink">{title}</h3>
      {count}
    </div>
    {children}
    <p className="text-[12.5px] leading-[1.5] text-muted">{help}</p>
  </section>
);

// "3 of 3", or "None yet" while the card holds nothing.
const Count: FC<{ n: number; max: number }> = ({ n, max }) => {
  const t = useT();
  return (
    <span className="text-[12px] text-muted">
      {n
        ? t('brands_n_of_max', '{{n}} of {{max}}', { n, max })
        : t('brands_none_yet', 'None yet')}
    </span>
  );
};

// A kit image deleted from the Media library, in its place (board
// BrandsMissing): nothing goes along for it until it is replaced (FR-012).
const Missing: FC<{ className: string; children?: ReactNode }> = ({
  className,
  children,
}) => {
  const t = useT();
  return (
    <div
      className={clsx(
        'flex flex-col items-center justify-center gap-[8px] p-[10px] rounded-[10px] border-[1.5px] border-dashed border-error bg-[color-mix(in_srgb,var(--error)_6%,var(--surface))] text-center',
        className
      )}
    >
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className="text-error"
      >
        <rect x="3" y="3" width="18" height="18" rx="3" />
        <path d="M3 3l18 18" />
      </svg>
      <span className="text-[12.5px] font-[600] leading-[1.35] text-error">
        {t('brands_deleted_from_media', 'Deleted from Media')}
      </span>
      {children}
    </div>
  );
};

// An example's ×, in its tile's corner, whether the image is there or was
// deleted from Media.
const RemoveExample: FC<{ onClick: () => void }> = ({ onClick }) => {
  const t = useT();
  return (
    <button
      type="button"
      aria-label={t('brands_remove_example', 'Remove example')}
      onClick={onClick}
      className={clsx(
        'absolute top-[6px] end-[6px] coarse:top-0 coarse:end-0 w-[28px] h-[28px] coarse:w-[44px] coarse:h-[44px] flex items-center justify-center rounded-[8px] cursor-pointer',
        FOCUS_RING
      )}
    >
      <span className="flex items-center justify-center w-[28px] h-[28px] rounded-[8px] bg-[rgba(0,0,0,0.55)] text-white">
        <CloseIcon size={14} aria-hidden="true" />
      </span>
    </button>
  );
};

// A font name, saved when its field is left and only when it changed. Keyed
// by the saved name, so a name saved by someone else refills the field.
const FontField: FC<{
  label: string;
  value: string | null;
  onSave: (value: string | null) => void;
}> = ({ label, value, onSave }) => (
  <label className="flex flex-col gap-[6px] min-w-0">
    <span className="text-[13px] font-[600] text-inkSoft">{label}</span>
    <input
      key={value ?? ''}
      dir="auto"
      maxLength={MAX_FONT}
      defaultValue={value ?? ''}
      placeholder="—"
      onBlur={(e) => {
        const next = e.currentTarget.value.trim() || null;
        if (next !== value) {
          onSave(next);
        }
      }}
      className="h-[44px] px-[10px] rounded-[8px] border border-line bg-surface text-ink text-[14px] coarse:text-[16px] placeholder:text-muted outline-none placeholder-shown:[direction:inherit] focus:border-brand focus:ring-[3px] focus:ring-brandSoft"
    />
  </label>
);

// Add channels' picker: the organization's channels in no brand or another
// one, each saying which, ticked to move into this brand.
const ChannelPicker: FC<{
  channels: KitChannel[];
  onAdd: (ids: string[]) => void;
  onCancel: () => void;
}> = ({ channels, onAdd, onCancel }) => {
  const t = useT();
  const [picked, setPicked] = useState<string[]>([]);

  if (!channels.length) {
    return (
      <p className="text-[14px] text-muted">
        {t('brands_no_other_channels', 'No other channels to add.')}
      </p>
    );
  }

  const toggle = (id: string) =>
    setPicked((list) =>
      list.includes(id) ? list.filter((item) => item !== id) : [...list, id]
    );

  return (
    <div className="flex flex-col gap-[16px]">
      <p className="text-[13px] leading-[1.5] text-muted">
        {t(
          'brands_add_channels_hint',
          'A channel in another brand moves to this one.'
        )}
      </p>
      <div className="flex flex-col gap-[2px]">
        {channels.map((channel) => {
          const checked = picked.includes(channel.id);
          return (
            <button
              key={channel.id}
              type="button"
              role="checkbox"
              aria-checked={checked}
              onClick={() => toggle(channel.id)}
              className={clsx(
                'flex items-center gap-[12px] min-h-[52px] px-[8px] rounded-[10px] text-start cursor-pointer hover:bg-boxHover transition-colors',
                FOCUS_RING
              )}
            >
              <ChannelPicture channel={channel} />
              <span className="flex-1 min-w-0 flex flex-col gap-[1px]">
                <bdi className="text-[14px] font-[500] text-ink truncate">
                  {channel.name}
                </bdi>
                <span className="text-[12px] text-muted truncate">
                  {channel.customer?.id ? (
                    <bdi>{channel.customer.name}</bdi>
                  ) : (
                    t('brands_no_brand', 'No brand')
                  )}
                </span>
              </span>
              {/* the look of the channel list's Check */}
              <span
                aria-hidden="true"
                className={clsx(
                  'flex-none flex border rounded-[6px] w-[20px] h-[20px] justify-center items-center transition-colors',
                  checked ? 'bg-brand border-brand' : 'border-muted'
                )}
              >
                {checked && <CheckmarkIcon className="text-white" />}
              </span>
            </button>
          );
        })}
      </div>
      <div className="flex justify-end gap-[8px]">
        <Button variant="ghost" onClick={onCancel}>
          {t('cancel', 'Cancel')}
        </Button>
        <Button disabled={!picked.length} onClick={() => onAdd(picked)}>
          {t('add', 'Add')}
        </Button>
      </div>
    </div>
  );
};

// A brand's kit on the Brands page (board Main, parts 5 to 8): the logo, the
// example posts, the colours, the fonts and the brand's channels. Every member
// edits it (FR-008). Each kit change saves at once and refreshes GET /brands;
// a channel move refreshes the channel list.
export const BrandKit: FC<{ brand: Brand }> = ({ brand }) => {
  const t = useT();
  const fetch = useFetch();
  const modals = useModals();
  const mediaDirectory = useMediaDirectory();
  const { mutate: reloadBrands } = useBrands();
  const { data: integrations, mutate: reloadChannels } = useIntegrationList();

  const { logo, examples, colours, headingFont, bodyFont } = brand.kit;
  const exampleIds = examples.map((example) => example.id);
  const list: KitChannel[] = integrations;
  const own = list
    .filter((channel) => channel.customer?.id === brand.id)
    .sort(compareChannels);
  const others = list
    .filter((channel) => channel.customer?.id !== brand.id)
    .sort(compareChannels);

  const save = async (change: KitChange) => {
    await fetch(`/brands/${brand.id}/kit`, {
      method: 'PUT',
      body: JSON.stringify(change),
    });
    reloadBrands();
  };

  // Into a brand, or to No brand with '', through the route the calendar's
  // channel list uses (C3).
  const move = async (ids: string[], group: string) => {
    await Promise.all(
      ids.map((id) =>
        fetch(`/integrations/${id}/group`, {
          method: 'PUT',
          body: JSON.stringify({ group }),
        })
      )
    );
    reloadChannels();
  };

  // Opened as the AI image window's reference row opens the library: images
  // only, and limited to the room the kit has, so a pick that won't fit is
  // refused there with a reason (FR-011).
  const pickImages = (max: number, onPick: (picked: Picked) => void) => {
    modals.openModal({
      title: t('media_library', 'Media Library'),
      askClose: false,
      closeOnEscape: true,
      fullScreen: true,
      size: mediaLibrarySize(),
      height: mediaLibrarySize(),
      children: (close) => (
        <MediaBox type="image" max={max} setMedia={onPick} closeModal={close} />
      ),
    });
  };

  const pickLogo = () =>
    pickImages(1, ([picked]) => {
      if (picked) {
        save({ logoId: picked.id });
      }
    });

  // An image already in the kit is the same example, not a second one.
  const addExamples = () =>
    pickImages(MAX_EXAMPLES - examples.length, (picked) => {
      const added = picked
        .map((item) => item.id)
        .filter((id) => !exampleIds.includes(id));
      if (added.length) {
        save({ exampleIds: [...exampleIds, ...added] });
      }
    });

  const replaceExample = (index: number) =>
    pickImages(1, ([picked]) => {
      if (picked && !exampleIds.includes(picked.id)) {
        save({
          exampleIds: exampleIds.map((id, n) => (n === index ? picked.id : id)),
        });
      }
    });

  const removeExample = (index: number) =>
    save({ exampleIds: exampleIds.filter((_, n) => n !== index) });

  const addChannels = () =>
    modals.openModal({
      title: t('brands_add_channels', 'Add channels'),
      children: (close) => (
        <ChannelPicker
          channels={others}
          onAdd={(ids) => {
            close();
            move(ids, brand.id);
          }}
          onCancel={close}
        />
      ),
    });

  const removeFromBrand = t('brands_remove_from_brand', 'Remove from brand');

  // Two columns while there is room for both, the channels and fonts 320px
  // wide; below that one column, the channels after the examples.
  return (
    <div className="flex flex-wrap items-start gap-[20px] phone:gap-[14px]">
      <div className="flex-[999_1_440px] min-w-0 flex flex-col gap-[16px] phone:gap-[14px]">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-[16px] phone:gap-[14px]">
          <Card
            title={t('brands_logo', 'Logo')}
            help={t(
              'brands_logo_help',
              'Goes with every image, even when you attach your own.'
            )}
          >
            {logo?.missing ? (
              <Missing className="h-[116px]" />
            ) : (
              <div
                className="flex items-center justify-center h-[116px] rounded-[10px] bg-panel"
                style={{
                  backgroundImage: `linear-gradient(45deg, ${CHECK} 25%, transparent 25%, transparent 75%, ${CHECK} 75%), linear-gradient(45deg, ${CHECK} 25%, transparent 25%, transparent 75%, ${CHECK} 75%)`,
                  backgroundSize: '16px 16px',
                  backgroundPosition: '0 0, 8px 8px',
                }}
              >
                {logo?.path ? (
                  <SafeImage
                    src={mediaDirectory.set(logo.path)}
                    alt={t('brands_logo', 'Logo')}
                    className="max-h-[84px] max-w-[calc(100%-32px)] object-contain"
                  />
                ) : (
                  <span className="text-[13px] text-muted">
                    {t('brands_no_logo', 'No logo yet')}
                  </span>
                )}
              </div>
            )}
            <div className="flex flex-wrap gap-[8px]">
              {logo ? (
                <>
                  <button
                    type="button"
                    onClick={pickLogo}
                    className={SMALL_BUTTON}
                  >
                    {t('brands_replace', 'Replace')}
                  </button>
                  <button
                    type="button"
                    onClick={() => save({ logoId: null })}
                    className={SMALL_BUTTON}
                  >
                    {t('remove', 'Remove')}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={pickLogo}
                  className={SMALL_BUTTON}
                >
                  {t('brands_upload_logo', 'Upload logo')}
                </button>
              )}
            </div>
          </Card>
          <Card
            title={t('brands_colours', 'Colours')}
            count={<Count n={colours.length} max={MAX_COLOURS} />}
            help={t(
              'brands_colours_help',
              'Up to 6. Samy names them in each image request.'
            )}
          >
            {/* Under a coarse pointer each × grows to 44px around its
                corner, so the row makes room for it above and between. */}
            <div className="flex flex-wrap items-start gap-[10px] coarse:gap-[20px] coarse:pt-[13px]">
              {colours.map((code) => (
                <div
                  key={code}
                  className="group/swatch flex flex-col items-center gap-[5px] w-[52px]"
                >
                  <span className="relative flex">
                    <span
                      aria-hidden="true"
                      className="w-[44px] h-[44px] rounded-[10px] ring-1 ring-inset ring-line"
                      style={{ backgroundColor: code }}
                    />
                    <button
                      type="button"
                      aria-label={t(
                        'brands_remove_colour',
                        'Remove colour {{code}}',
                        { code }
                      )}
                      onClick={() =>
                        save({
                          colours: colours.filter((item) => item !== code),
                        })
                      }
                      className={clsx(
                        'group absolute -top-[8px] -end-[8px] w-[22px] h-[22px] coarse:w-[44px] coarse:h-[44px] coarse:-top-[19px] coarse:-end-[19px] flex items-center justify-center rounded-full cursor-pointer opacity-0 group-hover/swatch:opacity-100 focus-visible:opacity-100 coarse:opacity-100 transition-opacity',
                        FOCUS_RING
                      )}
                    >
                      <span className="flex items-center justify-center w-[22px] h-[22px] rounded-full bg-surface border border-line text-inkSoft group-hover:text-ink group-hover:border-inkSoft transition-colors">
                        <CloseIcon size={10} aria-hidden="true" />
                      </span>
                    </button>
                  </span>
                  <span
                    dir="ltr"
                    className="text-[11px] text-muted tabular-nums"
                  >
                    {code}
                  </span>
                </div>
              ))}
              <BrandColourPopover
                colours={colours}
                onAdd={(code) => save({ colours: [...colours, code] })}
              />
            </div>
          </Card>
        </div>
        <Card
          title={t('brands_example_posts', 'Example posts')}
          count={<Count n={examples.length} max={MAX_EXAMPLES} />}
          help={
            examples.some((example) => example.missing)
              ? t(
                  'brands_examples_help_missing',
                  'One example was deleted from Media, so Samy skips it until you replace it.'
                )
              : t(
                  'brands_examples_help',
                  'Up to 3 posts in your style. They stay out when you attach images of your own.'
                )
          }
        >
          <div className="grid grid-cols-3 gap-[12px] phone:gap-[8px] max-w-[474px]">
            {examples.map((example, index) =>
              !example.missing && example.path ? (
                <div
                  key={example.id}
                  className="relative aspect-square rounded-[10px] overflow-hidden border border-line bg-panel"
                >
                  <SafeImage
                    src={mediaDirectory.set(example.path)}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                  <RemoveExample onClick={() => removeExample(index)} />
                </div>
              ) : (
                <Missing key={example.id} className="relative aspect-square">
                  <button
                    type="button"
                    onClick={() => replaceExample(index)}
                    className={SMALL_BUTTON}
                  >
                    {t('brands_replace', 'Replace')}
                  </button>
                  <RemoveExample onClick={() => removeExample(index)} />
                </Missing>
              )
            )}
            {examples.length < MAX_EXAMPLES && (
              <button
                type="button"
                onClick={addExamples}
                className={clsx(
                  'aspect-square flex flex-col items-center justify-center gap-[6px] rounded-[10px] border-[1.5px] border-dashed border-line text-muted hover:text-ink hover:border-inkSoft text-[13px] font-[600] cursor-pointer transition-colors',
                  FOCUS_RING
                )}
              >
                <PlusIcon size={18} aria-hidden="true" />
                <span>{t('add', 'Add')}</span>
              </button>
            )}
          </div>
        </Card>
      </div>
      <div className="flex-[1_1_320px] min-w-0 flex flex-col gap-[16px] phone:gap-[14px]">
        <Card
          title={t('channels', 'Channels')}
          count={
            <span className="px-[8px] py-[1px] rounded-full bg-surface2 text-[12px] font-[600] text-muted">
              {own.length}
            </span>
          }
          help={t(
            'brands_channels_help',
            'Tick these channels in Samy and it uses this kit.'
          )}
        >
          {!!own.length && (
            <div className="flex flex-col gap-[2px]">
              {own.map((channel) => (
                <div
                  key={channel.id}
                  className="flex items-center gap-[12px] min-h-[52px] ps-[8px] pe-[4px] py-[6px] rounded-[10px] hover:bg-boxHover transition-colors"
                >
                  <ChannelPicture channel={channel} />
                  <span className="flex-1 min-w-0 flex flex-col gap-[1px]">
                    <bdi className="text-[14px] font-[500] text-ink truncate">
                      {channel.name}
                    </bdi>
                    <span className="text-[12px] text-muted truncate">
                      {platformLabel(channel.identifier)}
                    </span>
                  </span>
                  <button
                    type="button"
                    aria-label={removeFromBrand}
                    title={removeFromBrand}
                    onClick={() => move([channel.id], '')}
                    className={clsx(
                      'flex-none flex items-center justify-center w-[36px] h-[36px] coarse:w-[44px] coarse:h-[44px] rounded-[8px] text-muted hover:bg-surface2 hover:text-ink cursor-pointer transition-colors',
                      FOCUS_RING
                    )}
                  >
                    <CloseIcon size={16} aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <Button
            variant="ghost"
            onClick={addChannels}
            className="w-full"
            innerClassName="gap-[8px]"
          >
            <PlusIcon aria-hidden="true" />
            {t('brands_add_channels', 'Add channels')}
          </Button>
        </Card>
        <Card
          title={t('brands_fonts', 'Fonts')}
          help={t(
            'brands_fonts_help',
            "Names only: Sharek's AI reads them as words, so well-known fonts work best."
          )}
        >
          <FontField
            label={t('brands_headings', 'Headings')}
            value={headingFont}
            onSave={(value) => save({ headingFont: value })}
          />
          <FontField
            label={t('brands_body_text', 'Body text')}
            value={bodyFont}
            onSave={(value) => save({ bodyFont: value })}
          />
        </Card>
        <p className="flex items-start gap-[6px] px-[4px] text-[12.5px] leading-[1.5] text-muted">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className="flex-none mt-[2px]"
          >
            <circle cx="9" cy="8" r="3.5" />
            <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
            <circle cx="17" cy="9" r="2.5" />
            <path d="M16 14.5a5 5 0 0 1 5.5 5" />
          </svg>
          <span>
            {t('brands_any_member', 'Anyone in your team can edit this brand.')}
          </span>
        </p>
      </div>
    </div>
  );
};
