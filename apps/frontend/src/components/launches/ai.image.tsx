import { Button } from '@gitroom/react/form/button';
import {
  FC,
  ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import clsx from 'clsx';
import Loading from '@gitroom/frontend/components/layout/loading';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { isAlreadyAnswered } from '@gitroom/helpers/utils/custom.fetch.func';
import { ndjsonFrames } from '@gitroom/helpers/utils/ndjson.frames';
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
  IMAGE_REFERENCE_MAX,
  IMAGE_STYLE_CATEGORIES,
  IMAGE_STYLE_CATEGORY_LABELS,
  IMAGE_STYLES,
  ImageAspectId,
  ImageReferenceRefusal,
  ImageStyle,
} from '@gitroom/nestjs-libraries/dtos/media/image.generation.catalog';
import {
  AspectTile,
  MEDIA_PREVIEW_MAX_HEIGHT,
  MEDIA_PREVIEW_MAX_WIDTH,
} from '@gitroom/frontend/components/ui/aspect.tile';
import { CostNote } from '@gitroom/frontend/components/ui/cost.note';
import { ModalActionBar } from '@gitroom/frontend/components/ui/modal.action.bar';
import type { MediaDestination } from '@gitroom/frontend/components/ui/media.destination';
import {
  AiImageIcon,
  CheckmarkIcon,
  ChevronDownIcon,
} from '@gitroom/frontend/components/ui/icons';
import { ReferenceImages } from '@gitroom/frontend/components/launches/ai.image.references';
import { useMediaDirectory } from '@gitroom/react/helpers/use.media.directory';
import SafeImage from '@gitroom/react/helpers/safe.image';
import { useIntegrationList } from '@gitroom/frontend/components/launches/helpers/use.integration.list';
import { isolate } from '@gitroom/frontend/components/launches/helpers/platform-label';
import type { Channel } from '@gitroom/frontend/components/launches/channel.panel';
import {
  BrandMenu,
  NO_BRAND,
} from '@gitroom/frontend/components/brands/brand.menu';
import {
  BrandMark,
  NoBrandMark,
} from '@gitroom/frontend/components/brands/brand.mark';
import {
  Brand,
  useBrands,
} from '@gitroom/frontend/components/brands/use.brands';

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
  'cursor-pointer rounded-full px-[12px] h-[30px] flex items-center gap-[5px] text-[12px] font-[600] border transition-colors focus-visible:ring-2 focus-visible:ring-brand';

const chipClasses = (selected: boolean) =>
  clsx(
    CHIP_BASE,
    selected
      ? 'bg-brandSoft border-brand text-brandText'
      : 'bg-newBgColorInner border-newColColor text-textItemBlur hover:border-textItemFocused'
  );

/**
 * A refused reference comes back named by the number on its thumbnail, and is
 * said in the window's language rather than the server's English (research
 * R13). Anything else keeps the server's message.
 */
const referenceRefusal = (
  t: ReturnType<typeof useT>,
  payload: { code?: ImageReferenceRefusal; index?: number } | null,
  edit: boolean
) => {
  switch (payload?.code) {
    case 'reference_missing':
      // In an edit, image 1 is the image being edited. It has no remove
      // control, so removing it is not advice the window can give.
      if (edit && payload.index === 1) {
        return t(
          'image_edit_missing',
          "The image you're editing is no longer in your Media library. Go back to the prompt to make a new one."
        );
      }
      return t(
        'image_reference_missing',
        'Reference image {{n}} is no longer in your Media library. Remove it and try again.',
        { n: payload.index }
      );
    case 'reference_unreadable':
      return t(
        'image_reference_unreadable',
        "Reference image {{n}} can't be used — its file format isn't supported. Remove it and try again.",
        { n: payload.index }
      );
    case 'reference_too_large':
      return t(
        'image_reference_too_large',
        'Reference image {{n}} is larger than 30 MB. Remove it and try again.',
        { n: payload.index }
      );
  }
};

// The brand picked last in this browser (research R13): a per-viewer
// convenience, so storage the browser refuses leaves the window on No brand.
const BRAND_KEY = 'aiImageBrand';

const rememberedBrand = () => {
  try {
    return localStorage.getItem(BRAND_KEY);
  } catch {
    return null;
  }
};

// A kit image after "Goes along:" (board StudioBrand).
const KIT_THUMBNAIL =
  'flex-none w-[36px] h-[36px] rounded-[8px] border border-line';

/**
 * The Brand field under the prompt (spec 053, US5; board StudioBrand): the
 * brand list titled for an image, opened from a box that shows the brand
 * picked, and beside it what goes along: the brand's logo and its examples
 * still in Media. The examples fade once the user's own images take their
 * place; the logo goes along either way. A brand with no image to send shows
 * nothing beside the box, its colours and fonts going as words.
 */
const BrandField: FC<{
  brands: Brand[];
  // the brand picked; none for No brand
  brand?: Brand;
  // the user has attached images of their own
  own: boolean;
  onPick: (choice: string) => void;
  onManage: () => void;
}> = ({ brands, brand, own, onPick, onManage }) => {
  const t = useT();
  const mediaDirectory = useMediaDirectory();
  const { data } = useIntegrationList();
  const channels: Channel[] = data;
  const name = brand ? brand.name : t('brands_no_brand', 'No brand');
  const logo = brand?.kit.logo;
  const logoPath = logo && !logo.missing ? logo.path : null;
  const examples = (brand?.kit.examples || []).flatMap(
    ({ id, path, missing }) => (path && !missing ? [{ id, path }] : [])
  );

  return (
    <div className="flex flex-col gap-[6px]">
      <div className="text-[14px] font-[600]">
        {t('select_customer_label', 'Brand')}
      </div>
      <div className="flex flex-wrap items-center gap-x-[16px] gap-y-[8px]">
        <div className="w-[340px] max-w-full">
          <BrandMenu
            brands={brands}
            count={(id) =>
              channels.filter((channel) => channel.customer?.id === id).length
            }
            value={brand ? brand.id : NO_BRAND}
            variant="image"
            onPick={onPick}
            onManage={onManage}
            label={t(
              'brands_field_label',
              'Brand for this image: {{brand}}. Change brand',
              { brand: isolate(name), interpolation: { escapeValue: false } }
            )}
            trigger={
              <>
                {brand ? (
                  <BrandMark
                    brand={brand}
                    className="w-[24px] h-[24px] rounded-[6px] text-[11px]"
                  />
                ) : (
                  <NoBrandMark
                    className="w-[24px] h-[24px] rounded-[6px]"
                    size={12}
                  />
                )}
                <span
                  dir={brand ? 'auto' : undefined}
                  className="flex-1 min-w-0 truncate"
                >
                  {name}
                </span>
                <ChevronDownIcon
                  size={16}
                  aria-hidden="true"
                  className="flex-none text-muted"
                />
              </>
            }
            triggerClassName="flex-1 min-w-0 h-[44px] flex items-center gap-[10px] px-[12px] bg-surface border border-line rounded-[8px] text-[14px] text-ink text-start cursor-pointer hover:border-inkSoft aria-expanded:border-brand transition-colors focus-visible:ring-2 focus-visible:ring-brand"
          />
        </div>
        {(logoPath || examples.length > 0) && (
          <div className="flex items-center gap-[6px] text-[12px] text-muted">
            <span>{t('brands_goes_along', 'Goes along:')}</span>
            {logoPath && (
              <SafeImage
                src={mediaDirectory.set(logoPath)}
                alt={t('brands_logo', 'Logo')}
                className={clsx(KIT_THUMBNAIL, 'object-contain')}
              />
            )}
            {examples.length > 0 && (
              <span
                role="img"
                aria-label={t('brands_example_posts', 'Example posts')}
                className="flex gap-[6px]"
              >
                {examples.map((example) => (
                  <SafeImage
                    key={example.id}
                    src={mediaDirectory.set(example.path)}
                    alt=""
                    className={clsx(
                      KIT_THUMBNAIL,
                      'object-cover',
                      own && 'opacity-30 grayscale'
                    )}
                  />
                ))}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * An image this window made, the preset it was made at, and the prompt and
 * style its caption names: the generation's, which an edit keeps.
 */
type Version = {
  media: { id: string; path: string };
  aspectRatio: ImageAspectId;
  prompt: string;
  style?: string;
};

const AiImageModal: FC<{
  close: () => void;
  setLoading: (loading: boolean) => void;
  onChange: (params: { id: string; path: string }) => void;
  destination: MediaDestination;
}> = (props) => {
  const { close, setLoading, onChange, destination } = props;
  const t = useT();
  const fetch = useFetch();
  const toaster = useToaster();
  const setLocked = useLaunchStore((p) => p.setLocked);
  const [prompt, setPrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState<ImageAspectId>('square');
  // Auto imposes nothing, so it is the absence of a style rather than a value.
  const [style, setStyle] = useState<string | undefined>(undefined);
  const [references, setReferences] = useState<{ id: string; path: string }[]>(
    []
  );
  const [phase, setPhase] = useState<'compose' | 'generating' | 'result'>(
    'compose'
  );
  // Every image made since the window opened, in order: a render adds one and
  // never replaces what a credit was already spent on (FR-020 – FR-023).
  const [versions, setVersions] = useState<Version[]>([]);
  // The version on screen: the one an edit changes and Use image takes.
  const [shown, setShown] = useState(0);
  // The change typed under the result, and the images added to it.
  const [editText, setEditText] = useState('');
  const [editReferences, setEditReferences] = useState<
    { id: string; path: string }[]
  >([]);
  // Whether the render on the waiting screen is an edit of the version on
  // screen rather than a generation from the compose step.
  const [editing, setEditing] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [search, setSearch] = useState('');
  const { data: credits, mutate: mutateCredits } = useImageCredits();
  const { data: brands } = useBrands();
  // The brand picked, by its id; null for No brand.
  const [brandId, setBrandId] = useState(rememberedBrand);
  // The window starts on the brand picked last while it is still one of the
  // organization's, else on No brand, as it is while the brands load
  // (FR-025). Only this brand goes with a render.
  const brand = brands?.find((item) => item.id === brandId);

  // A generation outlives the modal: the closure keeps running after an early
  // close and attaches the image itself, so it has to know whether anyone is
  // still watching.
  const mounted = useRef(true);
  const inFlight = useRef(false);
  const holdsLock = useRef(false);
  // Set from the click until the render is over. The window's actions stay on
  // screen through the credit check: a second click there must not start a
  // second paid render, and the result must not be used or left while one is
  // coming.
  const rendering = useRef(false);

  // `loading` follows the request, whose end also ends the render
  // (`rendering`); the composer lock follows the whole flow, which is not over
  // until the image is attached or the user gives it up.
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
    rendering.current = false;
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

  // The version on screen is brought into view when it is picked, when it
  // arrives and when a failed render comes back to it: in a strip wider than
  // the window, it may be past an edge (US3 scenario 4). Nearest, so a version
  // already in view moves nothing. One below the fold of a short window brings
  // the window down to it, which on a laptop shows the whole image with the
  // strip under it. Whether it glides is the stylesheet's call, where the app's
  // reduced-motion layer can stop it.
  const shownThumbnail = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    shownThumbnail.current?.scrollIntoView({
      block: 'nearest',
      inline: 'nearest',
    });
  }, [shown, phase]);

  /**
   * One render, a generation or an edit, from the credit check to a new version
   * on screen. Resolves true when it put one there; a render that is refused
   * or fails leaves every version as it was.
   *
   * A plain function, as are the handlers that call it: each reads `versions`
   * and `shown` as they stand at the click, where a memoized copy would append
   * to the list it was built with.
   */
  const render = async (
    url: string,
    body: { aspectRatio: ImageAspectId } & Record<string, unknown>,
    edit = false
  ) => {
    // One render at a time. It is over when its request ends, or below, when
    // the credit check refuses it.
    if (rendering.current) {
      return false;
    }
    rendering.current = true;
    // Asked before the generating phase begins, exactly as the video modal
    // asks: a refusal lands on a window that never moved, instead of a
    // loader that appears for half a second and is replaced by the limit card.
    try {
      await fetch('/media/generate-image/allowed');
    } catch (e) {
      // Already answered — nothing has been committed to yet, so there is
      // nothing to undo but the guard and nothing more to say.
      if (isAlreadyAnswered(e)) {
        rendering.current = false;
        return false;
      }
      // Anything else would fail the render the same way; fall through so
      // it is reported once, by the path that reports it properly.
    }

    // The version on screen was already paid for, so a render that fails, or
    // is abandoned, hands it back rather than nothing.
    const held = versions[shown];
    setEditing(edit);
    setPhase('generating');
    startRequest();
    // Once the request is out, a lost connection leaves a render that cannot be
    // cancelled: the server finishes it on the credit it already committed and
    // the image still lands in the Media library. Deliberately NOT the default
    // "you have not been charged" message. Telling the user it was free would
    // be a lie.
    const dropped = t(
      'image_connection_dropped',
      'The connection dropped before the image was ready. It may still finish — check your Media library in a minute.'
    );
    try {
      const response = await fetch(url, {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { Accept: 'application/x-ndjson' },
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(
          referenceRefusal(t, payload, edit) || payload?.message || ''
        );
      }

      // A render can outlast the proxies' idle cut; the response is an NDJSON
      // stream whose heartbeat frames keep the connection open until it ends.
      let generated: { id: string; path: string } | undefined;
      for await (const frame of ndjsonFrames<{
        name: string;
        media?: { id: string; path: string };
        message?: string;
      }>(response.body!)) {
        if (frame.name === 'error') {
          throw new Error(frame.message || '');
        }
        if (frame.name === 'done' && frame.media) {
          generated = frame.media;
          break;
        }
      }

      // A stream that ends without a terminal frame means the connection went
      // away mid-render.
      if (!generated) {
        throw new Error(dropped);
      }
      // Anything without a path is not a media record and must not reach the
      // post.
      if (!generated.path) {
        throw new Error('');
      }
      endRequest();
      mutateCredits();

      // Closed mid-generation: nobody is left to review it, so it goes
      // straight into the post exactly as it did before this step existed.
      if (!mounted.current) {
        onChange(generated);
        releaseLock();
        return false;
      }

      setVersions([
        ...versions,
        {
          media: generated,
          aspectRatio: body.aspectRatio,
          // An edit is captioned as the version it changed; a generation, by
          // what the compose step asked for.
          ...(edit
            ? { prompt: held.prompt, style: held.style }
            : { prompt, style }),
        },
      ]);
      setShown(versions.length);
      setPhase('result');
      return true;
    } catch (e) {
      endRequest();
      // An earlier result was already paid for, so a failed render puts it
      // back rather than losing it — the same thing `ai.video`'s failRender
      // does, and the reason the lock stays: that image can still be used.
      if (held) {
        if (mounted.current) {
          setPhase('result');
        } else {
          // Closed mid-render. It is paid for, and the composer was promised
          // an image — attaching it is closer to that than nothing.
          onChange(held.media);
          releaseLock();
        }
      } else {
        releaseLock();
        // The inputs are kept for another attempt. Whether this one was
        // charged is known only from the server's own answer: a dropped
        // connection may still finish and be charged, which its message says.
        if (mounted.current) {
          setPhase('compose');
        }
      }
      // Already answered: the limit modal is on screen and the window is
      // back exactly as it was. A second message would be the same refusal
      // twice, in two different voices.
      if (isAlreadyAnswered(e)) {
        return false;
      }
      toaster.show(
        // A connection lost mid-render rarely ends the stream: fetch() or the
        // body read rejects with the Fetch standard's network error, a
        // TypeError. Its outcome is just as unknown.
        e instanceof TypeError
          ? dropped
          : (e instanceof Error && e.message) ||
              t(
                'image_generation_failed',
                'Could not generate the image. You have not been charged.'
              ),
        'warning'
      );
      return false;
    }
  };

  const generate = () => {
    if (!prompt.trim()) {
      toaster.show(
        t('please_type_your_prompt', 'Please type your prompt'),
        'warning'
      );
      return;
    }

    return render('/media/generate-image-with-prompt', {
      prompt,
      aspectRatio,
      ...(style && { style }),
      // Absent rather than empty without references: today's request.
      ...(references.length
        ? { references: references.map((reference) => reference.id) }
        : {}),
      // No brand sends nothing from any kit (FR-020).
      ...(brand && { brand: brand.id }),
    });
  };

  const pickBrand = (choice: string) => {
    const id = choice === NO_BRAND ? null : choice;
    setBrandId(id);
    try {
      if (id) {
        localStorage.setItem(BRAND_KEY, id);
      } else {
        localStorage.removeItem(BRAND_KEY);
      }
    } catch {
      // Refused: the pick holds while the window is open.
    }
  };

  const applyEdit = async () => {
    if (!editText.trim()) {
      toaster.show(
        t('please_describe_the_change', 'Please describe the change'),
        'warning'
      );
      return;
    }

    // The change applies to the version on screen, at the preset it was made
    // at: an edit keeps its frame (FR-012).
    const edited = versions[shown];
    const applied = await render(
      '/media/edit-image-with-prompt',
      {
        imageId: edited.media.id,
        prompt: editText,
        aspectRatio: edited.aspectRatio,
        ...(editReferences.length
          ? { references: editReferences.map((reference) => reference.id) }
          : {}),
        ...(brand && { brand: brand.id }),
      },
      true
    );
    // The next change starts from the new version, with nothing in it yet.
    if (applied) {
      setEditText('');
      setEditReferences([]);
    }
  };

  const useImage = () => {
    // A render under way would finish after the window closed and hand the
    // post a second image.
    if (rendering.current) {
      return;
    }
    releaseLock();
    onChange(versions[shown].media);
    close();
  };

  const backToPrompt = () => {
    // A render under way would bring the waiting screen up over the prompt.
    if (rendering.current) {
      return;
    }
    // Giving up the result ends the flow; the inputs stay as they were, and so
    // do the versions, for the result step to come back to (FR-023).
    releaseLock();
    setPhase('compose');
  };

  const select = (index: number) => {
    // A render under way changes, or falls back to, the version on screen
    // when it began, and its waiting screen names that one.
    if (rendering.current) {
      return;
    }
    setShown(index);
    // The version picked is image 1 of the next edit, so it leaves the images
    // added to it: the same image twice is one reference (FR-005), and the
    // server refuses an edit that sends it twice.
    setEditReferences(
      editReferences.filter(
        (reference) => reference.id !== versions[index].media.id
      )
    );
  };

  // A brand's logo takes one of the render's places (FR-016).
  const places = IMAGE_REFERENCE_MAX - (brand ? 1 : 0);

  const version = versions[shown] as Version | undefined;
  // An edit keeps the frame of the version it changes; a generation takes the
  // compose step's.
  const renderingAspect =
    editing && version ? version.aspectRatio : aspectRatio;

  // The image is already in the Media library by the time any of this renders
  // — the route saves it before it answers — so the destination names what
  // happens next rather than whether the image is kept.
  const closeNote =
    destination === 'media'
      ? t(
          'close_window_note_media',
          "You can close this window — the image will be saved to your Media library when it's ready."
        )
      : destination === 'reference'
      ? t(
          'close_window_note_reference',
          "You can close this window — the image will be added to your reference images when it's ready."
        )
      : t(
          'close_window_note',
          "You can close this window — the image will be added to your post when it's ready."
        );

  // Nothing to attach it to, so there is nothing to "use": the action only
  // confirms the image and closes.
  const acceptLabel =
    destination === 'media' ? t('done', 'Done') : t('use_image', 'Use image');

  const styleLabel = (entry: ImageStyle) =>
    t(`image_style_${entry.id}`, entry.label);

  // A style as a pill or a caption names it: Auto, the absence of one, by its
  // mark.
  const styleSummary = (id: string | undefined) => {
    const entry = IMAGE_STYLES.find((candidate) => candidate.id === id);
    return entry ? (
      styleLabel(entry)
    ) : (
      <>
        <span className="text-aiAccent">✦</span>
        {t('auto_style', 'Auto')}
      </>
    );
  };

  const chosenStyle = IMAGE_STYLES.find((entry) => entry.id === style);

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

  // A field that simply stops accepting characters at the ceiling has to show
  // the count for that to read as a limit rather than a broken keyboard. Marked
  // in the warning tone, not the error one: the ceiling is a valid length — the
  // DTO accepts it — so the counter says "this is as far as it goes", not "this
  // is wrong". Fixed direction: a counter that reverses under RTL reads as a
  // different number entirely.
  const promptCounter = (used: number) => (
    <span
      dir="ltr"
      className={clsx(
        'flex-none tabular-nums text-[12px]',
        used >= IMAGE_PROMPT_MAX_CHARS
          ? 'text-warning font-[600]'
          : 'text-muted'
      )}
    >
      {t('prompt_counter', '{{used}} / {{max}}', {
        used,
        max: IMAGE_PROMPT_MAX_CHARS,
      })}
    </span>
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
            className="bg-newBgColorInner min-h-[150px] p-[16px] outline-none border-newColColor border rounded-[8px] text-[16px] text-textItemFocused focus-visible:ring-2 focus-visible:ring-brand"
          />
          <div className="text-[12px] flex items-baseline justify-between gap-[10px]">
            <span className="text-muted">
              {t(
                'image_prompt_hint',
                'Describe the subject, the setting and the light. Put the words you want on the image in quotes.'
              )}
            </span>
            {promptCounter(prompt.length)}
          </div>
        </div>
        <BrandField
          brands={brands || []}
          brand={brand}
          own={references.length > 0}
          onPick={pickBrand}
          onManage={close}
        />
        <ReferenceImages
          value={references}
          onChange={setReferences}
          max={places}
          branded={!!brand}
        />
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
            <div className="flex items-center gap-[8px] h-[38px] px-[12px] bg-surface border border-line rounded-[8px] focus-within:ring-2 focus-within:ring-brand">
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
                className="flex-1 bg-transparent border-0 outline-none text-[14px] coarse:text-[16px] text-ink"
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
              className="text-[12px] font-[600] text-brandText cursor-pointer focus-visible:ring-2 focus-visible:ring-brand"
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
                {t(
                  `image_aspect_${renderingAspect}`,
                  ASPECT_TILES[renderingAspect].label
                )}
                {' · '}
                {IMAGE_ASPECT_PRESETS[renderingAspect].ratio}
              </span>
              <span className={pillClasses}>
                {editing
                  ? t('image_edit_pill', 'Edit of version {{n}}', {
                      n: shown + 1,
                    })
                  : styleSummary(style)}
              </span>
            </div>
            {/* The placeholder carries the chosen shape so the wait shows what
                is coming. The app's reduced-motion layer stops the pulse. */}
            <div
              className="bg-surface2 rounded-[14px] animate-pulse"
              style={previewBox(IMAGE_ASPECT_PRESETS[renderingAspect].size)}
            />
            <div className="text-center">
              <div className="text-[14px] font-[600]">
                {editing
                  ? t('editing_your_image', 'Editing your image…')
                  : t('creating_your_image', 'Creating your image…')}
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
            {closeNote}
          </div>
        </>
      )}

      {phase === 'result' && version && (
        <>
          <div className="bg-panel rounded-[18px] p-[24px] flex flex-col items-center gap-[16px]">
            {/* A rendered video plays where it sits; an image had no way to be
                seen at its real size. A link rather than an onClick so
                ⌘-click, middle-click and the keyboard all reach it. The corner
                badge below names where it goes, so the cursor is the plain
                pointer: a magnifier would promise a lightbox that opening a
                tab does not deliver. */}
            <a
              href={version.media.path}
              target="_blank"
              rel="noreferrer"
              aria-label={t('open_image_full_size', 'Open the image full size')}
              className="group relative cursor-pointer rounded-[14px] focus-visible:ring-2 focus-visible:ring-brand"
            >
              <img
                src={version.media.path}
                alt={version.prompt}
                style={previewBox(
                  IMAGE_ASPECT_PRESETS[version.aspectRatio].size
                )}
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
            {/* Every image made in this window, in the order it was made, once
                there is a second to go back to (FR-020). The one on screen
                has a border and a check, so colour is not its only mark; the
                border is brandText, as brand is only 3:1 on the dark panel.
                The ring is left to keyboard focus, as on the orientation
                tiles. The padding is room for the ring and the check, and the
                scroll padding keeps it when a version is scrolled to an edge. */}
            {versions.length > 1 && (
              <div
                role="group"
                aria-label={t('image_versions', 'Versions')}
                className="flex gap-[10px] max-w-full overflow-x-auto p-[8px] scroll-px-[8px] motion-safe:scroll-smooth"
              >
                {versions.map((entry, index) => (
                  <button
                    // Versions are only ever added, so a place in the strip
                    // never changes hands.
                    key={index}
                    ref={index === shown ? shownThumbnail : undefined}
                    type="button"
                    onClick={() => select(index)}
                    aria-pressed={index === shown}
                    aria-label={t('image_version_n', 'Version {{n}}', {
                      n: index + 1,
                    })}
                    className="group relative flex-none w-[52px] h-[52px] rounded-[8px] cursor-pointer focus-visible:ring-2 focus-visible:ring-brand"
                  >
                    {/* The button's name already says which version it is. */}
                    <img
                      src={entry.media.path}
                      alt=""
                      className={clsx(
                        'w-full h-full rounded-[8px] object-cover transition-colors',
                        index === shown
                          ? 'border-2 border-brandText'
                          : 'border border-line group-hover:border-inkSoft'
                      )}
                    />
                    {index === shown && (
                      <span
                        aria-hidden="true"
                        className="absolute -top-[5px] -end-[5px] w-[18px] h-[18px] rounded-full bg-brand text-white flex items-center justify-center ring-2 ring-panel"
                      >
                        <CheckmarkIcon width={10} height={7} />
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="text-[12px] text-muted text-center line-clamp-2">
            {version.prompt}
            {' · '}
            {t(
              `image_aspect_${version.aspectRatio}`,
              ASPECT_TILES[version.aspectRatio].label
            )}
            {' · '}
            {styleSummary(version.style)}
          </div>
          {/* The change applies to the image above, as a new version. Its
              field has the prompt's ceiling and counter (FR-015); its row of
              images starts with the one being edited. */}
          <div className="flex flex-col gap-[6px]">
            <div className="flex items-baseline justify-between gap-[10px]">
              <div className="text-[14px] font-[600]">
                {t('image_edit_label', 'Edit this image')}
              </div>
              {promptCounter(editText.length)}
            </div>
            <textarea
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              maxLength={IMAGE_PROMPT_MAX_CHARS}
              aria-label={t('image_edit_label', 'Edit this image')}
              placeholder={t(
                'image_edit_placeholder',
                'Describe the change — for example, make the background plain white'
              )}
              className="bg-newBgColorInner min-h-[96px] p-[16px] outline-none border-newColColor border rounded-[8px] text-[16px] text-textItemFocused focus-visible:ring-2 focus-visible:ring-brand"
            />
            <ReferenceImages
              lead={version.media}
              value={editReferences}
              onChange={setEditReferences}
              max={places - 1}
              action={
                <Button variant="quiet" onClick={applyEdit}>
                  {t('image_edit_apply', 'Apply edit')}
                  <span className="ms-[6px] font-[500] opacity-75">
                    · {t('one_credit', '1 credit')}
                  </span>
                </Button>
              }
            />
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
              <Button variant="quiet" onClick={backToPrompt}>
                {t('back_to_prompt', 'Back to prompt')}
              </Button>
              <div className="flex-1" />
              <Button variant="ghost" onClick={generate}>
                {t('regenerate', 'Regenerate')}
                <span className="ms-[6px] font-[500] opacity-75">
                  · {t('one_credit', '1 credit')}
                </span>
              </Button>
              <Button onClick={useImage}>{acceptLabel}</Button>
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
  /**
   * Renders in place of the composer's ✦ button — Studio's card, say — while
   * the modal wiring stays here rather than being copied.
   */
  renderTrigger?: (open: () => void, loading: boolean) => ReactNode;
  /**
   * Where the finished image goes — what the waiting note promises and what
   * the action that accepts it is called. The composer's post by default.
   */
  destination?: MediaDestination;
}> = (props) => {
  const t = useT();
  const { onChange, renderTrigger, destination = 'post' } = props;
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
          destination={destination}
        />
      ),
    });
  }, [loading, onChange, destination]);

  if (renderTrigger) {
    return <>{renderTrigger(openImageModal, loading)}</>;
  }

  return (
    <div className="relative">
      <div
        onClick={openImageModal}
        data-tooltip-id="tooltip"
        data-tooltip-content={t('image', '{{ai}} Image', { ai: t('ai', 'AI') })}
        aria-label={t('image', '{{ai}} Image', { ai: t('ai', 'AI') })}
        className={clsx(
          'cursor-pointer h-[30px] coarse:h-[44px] coarse:min-w-[44px] mobile:h-[44px] mobile:min-w-[44px] rounded-[6px] mobile:rounded-[8px] justify-center items-center flex bg-ai text-aiAccent px-[8px]'
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
            <AiImageIcon className="mobile:w-[20px] mobile:h-[20px]" />
          </div>
          <div className="text-[10px] font-[600] mobile:hidden block">
            {t('image', '{{ai}} Image', { ai: t('ai', 'AI') })}
          </div>
        </div>
      </div>
    </div>
  );
};
