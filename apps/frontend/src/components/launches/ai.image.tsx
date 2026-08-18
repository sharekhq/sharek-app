import { Button } from '@gitroom/react/form/button';
import { FC, useCallback, useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import Loading from '@gitroom/frontend/components/layout/loading';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { isAlreadyAnswered } from '@gitroom/helpers/utils/custom.fetch.func';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useLaunchStore } from '@gitroom/frontend/components/new-launch/store';
import {
  ModalHeaderSlot,
  ModalHeaderSlotTarget,
  useModals,
} from '@gitroom/frontend/components/layout/new-modal';
import { useToaster } from '@gitroom/react/toaster/toaster';
import useSWR from 'swr';
import {
  IMAGE_ASPECT_IDS,
  IMAGE_ASPECT_PRESETS,
  IMAGE_POPULAR_STYLES,
  IMAGE_PROMPT_MAX_CHARS,
  IMAGE_STYLE_CATEGORIES,
  IMAGE_STYLE_CATEGORY_LABELS,
  IMAGE_STYLES,
  ImageAspectId,
  ImageStyle,
} from '@gitroom/nestjs-libraries/dtos/media/image.generation.catalog';
import {
  AspectTile,
  MEDIA_PREVIEW_MAX_HEIGHT,
  MEDIA_PREVIEW_MAX_WIDTH,
} from '@gitroom/frontend/components/ui/aspect.tile';
import { CostNote } from '@gitroom/frontend/components/ui/cost.note';
import { ModalActionBar } from '@gitroom/frontend/components/ui/modal.action.bar';

const useImageCredits = () => {
  const fetch = useFetch();
  return useSWR('copilot-credits-images', async () =>
    (
      await fetch('/copilot/credits?type=ai_images', {
        method: 'GET',
      })
    ).json()
  );
};
// Presentation only — the ids, ratios and render sizes come from the shared
// catalog. The glyph proportions are the approved mockup's, drawn to fit a
// ~23px box rather than computed from the ratio.
const ASPECT_TILES: Record<
  ImageAspectId,
  { label: string; glyph: { width: number; height: number }; tooltip: string }
> = {
  square: {
    label: 'Square',
    glyph: { width: 22, height: 22 },
    tooltip:
      '<strong>Square · 1:1 — {{size}} px</strong><br />Instagram &amp; Facebook feed posts · profile artwork.',
  },
  portrait: {
    label: 'Portrait',
    glyph: { width: 18, height: 22 },
    tooltip:
      '<strong>Portrait · 4:5 — {{size}} px</strong><br />The tallest feed post Instagram and Facebook allow — it fills more of the screen.',
  },
  story: {
    label: 'Story',
    glyph: { width: 13, height: 23 },
    tooltip:
      '<strong>Story · 9:16 — {{size}} px</strong><br />Instagram Stories &amp; Reels · TikTok · YouTube Shorts.<br /><span style="opacity:.72">Also the right frame for Veo 3 vertical video references.</span>',
  },
  landscape: {
    label: 'Landscape',
    glyph: { width: 23, height: 13 },
    tooltip:
      '<strong>Landscape · 16:9 — {{size}} px</strong><br />X &amp; LinkedIn posts · YouTube thumbnails.<br /><span style="opacity:.72">Also the right frame for Veo 3 horizontal video references.</span>',
  },
};

/**
 * The placeholder and the finished image share one box so the layout does not
 * jump between them: the preset's own proportions scaled into the preview box
 * both AI modals use, so a 9:16 image and a 9:16 video come out the same size.
 */
const previewBox = (size: string) => {
  const [width, height] = size.split('x').map(Number);
  const scale = Math.min(
    MEDIA_PREVIEW_MAX_WIDTH / width,
    MEDIA_PREVIEW_MAX_HEIGHT / height
  );
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
};

const pillClasses =
  'h-[26px] px-[10px] inline-flex items-center gap-[5px] bg-surface border border-line rounded-full text-[12px] font-[600] text-inkSoft';

const CHIP_BASE =
  'cursor-pointer rounded-full px-[12px] h-[30px] flex items-center gap-[5px] text-[12px] font-[600] border transition-colors';

const chipClasses = (selected: boolean) =>
  clsx(
    CHIP_BASE,
    selected
      ? 'bg-brandSoft border-brand text-brandText'
      : 'bg-newBgColorInner border-newColColor text-newTextItemBlur hover:border-newTextItemFocused'
  );

const AiImageModal: FC<{
  close: () => void;
  setLoading: (loading: boolean) => void;
  onChange: (params: { id: string; path: string }) => void;
}> = (props) => {
  const { close, setLoading, onChange } = props;
  const t = useT();
  const fetch = useFetch();
  const toaster = useToaster();
  const setLocked = useLaunchStore((p) => p.setLocked);
  const [prompt, setPrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState<ImageAspectId>('square');
  // Auto imposes nothing, so it is the absence of a style rather than a value.
  const [style, setStyle] = useState<string | undefined>(undefined);
  const [phase, setPhase] = useState<'compose' | 'generating' | 'result'>(
    'compose'
  );
  const [image, setImage] = useState<{ id: string; path: string } | null>(null);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [search, setSearch] = useState('');
  const { data: credits, mutate: mutateCredits } = useImageCredits();

  // A generation outlives the modal: the closure keeps running after an early
  // close and attaches the image itself, so it has to know whether anyone is
  // still watching.
  const mounted = useRef(true);
  const inFlight = useRef(false);
  const holdsLock = useRef(false);
  // The last result that a credit was actually spent on, mirrored in a ref
  // because `generate` clears `image` before it asks again — a Regenerate that
  // fails must not throw away something already paid for.
  const held = useRef<{ id: string; path: string } | null>(null);

  // `loading` follows the request; the composer lock follows the whole flow,
  // which is not over until the image is attached or the user gives it up.
  const startRequest = () => {
    inFlight.current = true;
    setLoading(true);
    if (!holdsLock.current) {
      holdsLock.current = true;
      setLocked(true);
    }
  };

  const endRequest = () => {
    inFlight.current = false;
    setLoading(false);
  };

  // Memoized so the unmount cleanup below keeps a stable dependency: a fresh
  // identity every render would re-run that cleanup and drop the lock early.
  const releaseLock = useCallback(() => {
    if (!holdsLock.current) {
      return;
    }
    holdsLock.current = false;
    setLocked(false);
  }, [setLocked]);

  useEffect(
    () => () => {
      mounted.current = false;
      // A render still in flight keeps the composer locked until it lands
      // (FR-009). Anything else — an unused result, an untouched modal —
      // is given up here, or the composer would stay locked forever.
      if (!inFlight.current) {
        releaseLock();
      }
    },
    [releaseLock]
  );

  const generate = useCallback(async () => {
    if (!prompt.trim()) {
      toaster.show(
        t('please_type_your_prompt', 'Please type your prompt'),
        'warning'
      );
      return;
    }

    // Asked before the generating phase begins, exactly as the video modal
    // asks: a refusal lands on a composer that never moved, instead of a
    // loader that appears for half a second and is replaced by the limit card.
    try {
      await fetch('/media/generate-image/allowed');
    } catch (e) {
      // Already answered — nothing has been committed to yet, so there is
      // nothing to reset and nothing more to say.
      if (isAlreadyAnswered(e)) {
        return;
      }
      // Anything else would fail the generation the same way; fall through so
      // it is reported once, by the path that reports it properly.
    }

    setImage(null);
    setPhase('generating');
    startRequest();
    try {
      const response = await fetch('/media/generate-image-with-prompt', {
        method: 'POST',
        body: JSON.stringify({ prompt, aspectRatio, ...(style && { style }) }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.message || '');
      }
      const generated = await response.json();
      // Anything without a path is not a media record and must not reach the
      // post.
      if (!generated?.path) {
        throw new Error('');
      }
      endRequest();
      mutateCredits();

      // Closed mid-generation: nobody is left to review it, so it goes
      // straight into the post exactly as it did before this step existed.
      if (!mounted.current) {
        onChange(generated);
        releaseLock();
        return;
      }

      held.current = generated;
      setImage(generated);
      setPhase('result');
    } catch (e) {
      endRequest();
      // An earlier result was already paid for, so a failed Regenerate puts it
      // back rather than losing it — the same thing `ai.video`'s failRender
      // does, and the reason the lock stays: that image can still be used.
      if (held.current) {
        if (mounted.current) {
          setImage(held.current);
          setPhase('result');
        } else {
          // Closed mid-Regenerate. It is paid for, and the composer was
          // promised an image — attaching it is closer to that than nothing.
          onChange(held.current);
          releaseLock();
        }
      } else {
        releaseLock();
        // Nothing was charged, so the inputs are kept for another attempt.
        if (mounted.current) {
          setPhase('compose');
        }
      }
      // Already answered: the limit modal is on screen and the composer is
      // back exactly as it was. A second message would be the same refusal
      // twice, in two different voices.
      if (isAlreadyAnswered(e)) {
        return;
      }
      toaster.show(
        (e instanceof Error && e.message) ||
          t(
            'image_generation_failed',
            'Could not generate the image. You have not been charged.'
          ),
        'warning'
      );
    }
  }, [prompt, aspectRatio, style, onChange]);

  const useImage = () => {
    releaseLock();
    onChange(image!);
    close();
  };

  const editPrompt = () => {
    // Giving up the result ends the flow; the inputs stay as they were.
    releaseLock();
    setImage(null);
    setPhase('compose');
  };

  const styleLabel = (entry: ImageStyle) =>
    t(`image_style_${entry.id}`, entry.label);

  const chosenStyle = IMAGE_STYLES.find((entry) => entry.id === style);
  const styleSummary = chosenStyle ? (
    styleLabel(chosenStyle)
  ) : (
    <>
      <span className="text-aiAccent">✦</span>
      {t('auto_style', 'Auto')}
    </>
  );

  // A style picked deep in the catalog joins the collapsed row, so the choice
  // stays visible once the catalog closes.
  const rowStyles =
    chosenStyle &&
    !IMAGE_POPULAR_STYLES.some((entry) => entry.id === chosenStyle.id)
      ? [...IMAGE_POPULAR_STYLES, chosenStyle]
      : IMAGE_POPULAR_STYLES;

  const query = search.trim().toLowerCase();
  const groups = IMAGE_STYLE_CATEGORIES.map((category) => ({
    category,
    styles: IMAGE_STYLES.filter(
      (entry) =>
        entry.category === category &&
        (!query || styleLabel(entry).toLowerCase().includes(query))
    ),
  })).filter((group) => group.styles.length);

  const listedStyles = groups.reduce(
    (total, group) => total + group.styles.length,
    0
  );

  const pickStyle = (id: string) => {
    setStyle(id);
    setCatalogOpen(false);
    setSearch('');
  };

  return (
    <div className="flex flex-col gap-[16px]">
      <ModalHeaderSlot>
        <div className="bg-ai text-aiAccent rounded-full px-[12px] py-[4px] text-[12px] font-[600]">
          {t('credits_left_count', '{{count}} credits left', {
            count: credits?.credits || 0,
          })}
        </div>
      </ModalHeaderSlot>
      {phase === 'compose' && !catalogOpen && (
        <>
        <div className="flex flex-col gap-[6px]">
          <div className="text-[14px] font-[600]">{t('prompt', 'Prompt')}</div>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            maxLength={IMAGE_PROMPT_MAX_CHARS}
            placeholder={t(
              'describe_the_image_you_want_to_generate',
              'Describe the image you want to generate'
            )}
            className="bg-newBgColorInner min-h-[150px] p-[16px] outline-none border-newColColor border rounded-[8px] text-[16px] text-newTextItemFocused"
          />
          {/* The field simply stops accepting characters at the ceiling, so the
              count has to be on screen for that to read as a limit rather than
              a broken keyboard. Marked in the warning tone, not the error one:
              the ceiling is a valid length — the DTO accepts it — so the
              counter says "this is as far as it goes", not "this is wrong". */}
          <div className="text-[12px] flex items-baseline justify-between gap-[10px]">
            <span className="text-muted">
              {t(
                'image_prompt_hint',
                'Describe the subject, the setting and the light.'
              )}
            </span>
            {/* Fixed direction: a counter that reverses under RTL reads as a
                different number entirely. */}
            <span
              dir="ltr"
              className={clsx(
                'flex-none tabular-nums',
                prompt.length >= IMAGE_PROMPT_MAX_CHARS
                  ? 'text-warning font-[600]'
                  : 'text-muted'
              )}
            >
              {t('prompt_counter', '{{used}} / {{max}}', {
                used: prompt.length,
                max: IMAGE_PROMPT_MAX_CHARS,
              })}
            </span>
          </div>
        </div>
        <div className="flex flex-col gap-[6px]">
          <div className="text-[14px] font-[600]">
            {t('image_orientation', 'Orientation')}
          </div>
          <div className="flex gap-[8px]">
            {IMAGE_ASPECT_IDS.map((id) => {
              const tile = ASPECT_TILES[id];
              return (
                <AspectTile
                  key={id}
                  label={t(`image_aspect_${id}`, tile.label)}
                  ratio={IMAGE_ASPECT_PRESETS[id].ratio}
                  glyph={tile.glyph}
                  selected={aspectRatio === id}
                  tooltipHtml={t(`image_aspect_${id}_tooltip`, tile.tooltip, {
                    size: IMAGE_ASPECT_PRESETS[id].size.replace('x', '×'),
                  })}
                  onSelect={() => setAspectRatio(id)}
                />
              );
            })}
          </div>
        </div>
        <div className="flex flex-col gap-[6px]">
          <div className="text-[14px] font-[600]">{t('style', 'Style')}</div>
          <div className="flex flex-wrap gap-[8px]">
            <button
              type="button"
              onClick={() => setStyle(undefined)}
              className={chipClasses(!style)}
            >
              <span className="text-aiAccent">✦</span>
              {t('auto_style', 'Auto')}
            </button>
            {rowStyles.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => setStyle(entry.id)}
                className={chipClasses(style === entry.id)}
              >
                {styleLabel(entry)}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setCatalogOpen(true)}
              className={clsx(
                CHIP_BASE,
                'bg-quiet border-transparent text-inkSoft'
              )}
            >
              {t('all_styles', 'All styles')}
              <svg
                width="12"
                height="12"
                viewBox="0 0 16 16"
                fill="none"
                className="rtl:rotate-180"
              >
                <path
                  d="M6 3l5 5-5 5"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
        </div>
        </>
      )}

      {phase === 'compose' && catalogOpen && (
        <>
          <div className="flex flex-col gap-[6px]">
            <div className="text-[14px] font-[600]">{t('style', 'Style')}</div>
            <div className="flex items-center gap-[8px] h-[38px] px-[12px] bg-surface border border-line rounded-[8px]">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <circle
                  cx="7"
                  cy="7"
                  r="4.5"
                  stroke="currentColor"
                  strokeWidth="1.6"
                />
                <path
                  d="M10.5 10.5L14 14"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
              </svg>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('search_styles', 'Search styles')}
                className="flex-1 bg-transparent border-0 outline-none text-[14px] text-ink"
              />
            </div>
          </div>

          <div className="flex flex-col gap-[16px]">
            {groups.map((group) => (
              <div key={group.category} className="flex flex-col gap-[8px]">
                <div className="text-[12px] font-[600] text-muted">
                  {t(
                    `image_style_cat_${group.category}`,
                    IMAGE_STYLE_CATEGORY_LABELS[group.category]
                  )}
                </div>
                <div className="flex flex-wrap gap-[8px]">
                  {group.styles.map((entry) => (
                    <button
                      key={entry.id}
                      type="button"
                      onClick={() => pickStyle(entry.id)}
                      className={chipClasses(style === entry.id)}
                    >
                      {styleLabel(entry)}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {!listedStyles && (
              <div className="text-[12px] text-muted">
                {t('no_styles_found', 'No styles match your search')}
              </div>
            )}
          </div>

          <div className="flex justify-between items-center text-[12px] text-muted">
            <button
              type="button"
              onClick={() => {
                setCatalogOpen(false);
                setSearch('');
              }}
              className="text-[12px] font-[600] text-brandText cursor-pointer"
            >
              {t('show_less', '- Show less')}
            </button>
            {/* Auto is a sentinel, not an entry, so it is not counted. */}
            <span>
              {t('styles_count', '{{count}} styles', { count: listedStyles })}
            </span>
          </div>
        </>
      )}

      {phase === 'generating' && (
        <>
          <div className="bg-panel rounded-[18px] p-[24px] flex flex-col items-center gap-[16px]">
            <div className="flex gap-[8px]">
              <span className={pillClasses}>
                {t(`image_aspect_${aspectRatio}`, ASPECT_TILES[aspectRatio].label)}
                {' · '}
                {IMAGE_ASPECT_PRESETS[aspectRatio].ratio}
              </span>
              <span className={pillClasses}>{styleSummary}</span>
            </div>
            {/* The placeholder carries the chosen shape so the wait shows what
                is coming. The app's reduced-motion layer stops the pulse. */}
            <div
              className="bg-surface2 rounded-[14px] animate-pulse"
              style={previewBox(IMAGE_ASPECT_PRESETS[aspectRatio].size)}
            />
            <div className="text-center">
              <div className="text-[14px] font-[600]">
                {t('creating_your_image', 'Creating your image…')}
              </div>
              <div className="text-[12px] text-muted mt-[2px]">
                {t(
                  'usually_takes_half_minute',
                  'Usually takes about half a minute'
                )}
              </div>
            </div>
          </div>
          <div className="flex gap-[8px] items-start text-[12px] text-muted">
            <svg
              width="14"
              height="14"
              viewBox="0 0 16 16"
              fill="none"
              className="flex-none mt-[3px]"
            >
              <circle
                cx="8"
                cy="8"
                r="6.5"
                stroke="currentColor"
                strokeWidth="1.4"
              />
              <path
                d="M8 7.5V11M8 5v.5"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
            </svg>
            {t(
              'close_window_note',
              "You can close this window — the image will be added to your post when it's ready."
            )}
          </div>
        </>
      )}

      {phase === 'result' && image && (
        <>
          <div className="bg-panel rounded-[18px] p-[24px] flex flex-col items-center">
            {/* A rendered video plays where it sits; an image had no way to be
                seen at its real size. A link rather than an onClick so
                ⌘-click, middle-click and the keyboard all reach it. The corner
                badge below names where it goes, so the cursor is the plain
                pointer: a magnifier would promise a lightbox that opening a
                tab does not deliver. */}
            <a
              href={image.path}
              target="_blank"
              rel="noreferrer"
              aria-label={t('open_image_full_size', 'Open the image full size')}
              className="group relative cursor-pointer rounded-[14px] focus-visible:ring-2 focus-visible:ring-brand"
            >
              <img
                src={image.path}
                alt={prompt}
                style={previewBox(IMAGE_ASPECT_PRESETS[aspectRatio].size)}
                // `block` rather than the inline default: an inline image
                // leaves descender space inside the link, which would put the
                // focus ring and the corner badge a few pixels below the
                // picture's own edge.
                className="block rounded-[14px] border border-line object-cover"
              />
              <span
                aria-hidden="true"
                className="absolute bottom-[8px] end-[8px] w-[28px] h-[28px] rounded-[8px] bg-black/65 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 coarse:opacity-100 group-focus-visible:opacity-100 transition-opacity"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <path
                    d="M9.5 2.5H13.5V6.5M13.5 2.5L8 8"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M12 10v2.5a1 1 0 0 1-1 1H3.5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1H6"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
              </span>
            </a>
          </div>
          <div className="text-[12px] text-muted text-center line-clamp-2">
            {prompt}
            {' · '}
            {t(`image_aspect_${aspectRatio}`, ASPECT_TILES[aspectRatio].label)}
            {' · '}
            {styleSummary}
          </div>
        </>
      )}

      {/* No bar while a generation runs — there is nothing to act on until it
          lands — and none over the style catalog, which is a sub-screen of
          compose with no action of its own. */}
      {(phase === 'result' || (phase === 'compose' && !catalogOpen)) && (
        <ModalActionBar>
          {phase === 'result' ? (
            <>
              <Button variant="quiet" onClick={editPrompt}>
                {t('edit_prompt', 'Edit prompt')}
              </Button>
              <div className="flex-1" />
              <Button variant="ghost" onClick={generate}>
                {t('regenerate', 'Regenerate')}
                <span className="ms-[6px] font-[500] opacity-75">
                  · {t('one_credit', '1 credit')}
                </span>
              </Button>
              <Button onClick={useImage}>{t('use_image', 'Use image')}</Button>
            </>
          ) : (
            <>
              <CostNote>
                {t('image_uses_one_credit', 'Uses 1 image credit')}
              </CostNote>
              <div className="flex-1" />
              <Button type="button" onClick={generate}>
                {t('generate', 'Generate')}
              </Button>
            </>
          )}
        </ModalActionBar>
      )}
    </div>
  );
};

export const AiImage: FC<{
  value: string;
  onChange: (params: { id: string; path: string }) => void;
}> = (props) => {
  const t = useT();
  const { onChange } = props;
  const [loading, setLoading] = useState(false);
  const modals = useModals();

  const openImageModal = useCallback(() => {
    if (loading) {
      return;
    }
    modals.openModal({
      title: (
        <div className="flex items-center gap-[10px]">
          <span className="text-aiAccent">✦</span>
          {t('generate_ai_image', 'Generate AI Image')}
          <ModalHeaderSlotTarget className="flex-1 flex justify-end" />
        </div>
      ),
      children: (close) => (
        <AiImageModal
          close={close}
          setLoading={setLoading}
          onChange={onChange}
        />
      ),
    });
  }, [loading, onChange]);

  return (
    <div className="relative">
      <div
        onClick={openImageModal}
        className={clsx(
          'cursor-pointer h-[30px] coarse:h-[44px] coarse:min-w-[44px] rounded-[6px] justify-center items-center flex bg-ai text-aiAccent px-[8px]'
        )}
      >
        {loading && (
          <div className="absolute start-[50%] -translate-x-[50%]">
            <Loading height={15} width={15} type="spin" color="var(--ink)" />
          </div>
        )}
        <div
          className={clsx(
            'flex gap-[5px] items-center',
            loading && 'invisible'
          )}
        >
          <div>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
            >
              <g clipPath="url(#clip0_2352_53053)">
                <path
                  d="M8.33333 2.00033H5.2C4.07989 2.00033 3.51984 2.00033 3.09202 2.21831C2.71569 2.41006 2.40973 2.71602 2.21799 3.09234C2 3.52017 2 4.08022 2 5.20032V10.8003C2 11.9204 2 12.4805 2.21799 12.9083C2.40973 13.2846 2.71569 13.5906 3.09202 13.7823C3.51984 14.0003 4.07989 14.0003 5.2 14.0003H11.3333C11.9533 14.0003 12.2633 14.0003 12.5176 13.9322C13.2078 13.7472 13.7469 13.2081 13.9319 12.518C14 12.2636 14 11.9536 14 11.3337M7 5.66699C7 6.40337 6.40305 7.00033 5.66667 7.00033C4.93029 7.00033 4.33333 6.40337 4.33333 5.66699C4.33333 4.93061 4.93029 4.33366 5.66667 4.33366C6.40305 4.33366 7 4.93061 7 5.66699ZM9.99336 7.94576L4.3541 13.0724C4.03691 13.3607 3.87831 13.5049 3.86429 13.6298C3.85213 13.738 3.89364 13.8454 3.97546 13.9173C4.06985 14.0003 4.28419 14.0003 4.71286 14.0003H10.9707C11.9301 14.0003 12.4098 14.0003 12.7866 13.8391C13.2596 13.6368 13.6365 13.2599 13.8388 12.7869C14 12.4101 14 11.9304 14 10.971C14 10.6482 14 10.4867 13.9647 10.3364C13.9204 10.1475 13.8353 9.97056 13.7155 9.81792C13.6202 9.69646 13.4941 9.59562 13.242 9.39396L11.3772 7.9021C11.1249 7.70026 10.9988 7.59935 10.8599 7.56373C10.7374 7.53234 10.6086 7.53641 10.4884 7.57545C10.352 7.61975 10.2324 7.72842 9.99336 7.94576ZM13 1.01074L12.5932 1.82425C12.4556 2.09958 12.3868 2.23724 12.2948 2.35653C12.2132 2.46238 12.1183 2.55728 12.0125 2.63887C11.8932 2.73083 11.7555 2.79966 11.4802 2.93732L10.6667 3.34408L11.4802 3.75083C11.7555 3.88849 11.8932 3.95732 12.0125 4.04928C12.1183 4.13087 12.2132 4.22577 12.2948 4.33162C12.3868 4.45091 12.4556 4.58857 12.5932 4.8639L13 5.67741L13.4068 4.8639C13.5444 4.58857 13.6132 4.45091 13.7052 4.33162C13.7868 4.22577 13.8817 4.13087 13.9875 4.04928C14.1068 3.95732 14.2445 3.88849 14.5198 3.75083L15.3333 3.34408L14.5198 2.93732C14.2445 2.79966 14.1068 2.73083 13.9875 2.63887C13.8817 2.55728 13.7868 2.46238 13.7052 2.35653C13.6132 2.23724 13.5444 2.09958 13.4068 1.82425L13 1.01074Z"
                  stroke="currentColor"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </g>
              <defs>
                <clipPath id="clip0_2352_53053">
                  <rect width="16" height="16" fill="currentColor" />
                </clipPath>
              </defs>
            </svg>
          </div>
          <div className="text-[10px] font-[600] mobile:hidden block">
            {t('ai', 'AI')} Image
          </div>
        </div>
      </div>
    </div>
  );
};
