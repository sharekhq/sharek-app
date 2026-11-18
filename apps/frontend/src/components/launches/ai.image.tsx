import { Button } from '@gitroom/react/form/button';
import { FC, useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { isAlreadyAnswered } from '@gitroom/helpers/utils/custom.fetch.func';
import { ndjsonFrames } from '@gitroom/helpers/utils/ndjson.frames';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { Textarea } from '@gitroom/react/form/textarea';
import useSWR from 'swr';
import { IMAGE_PROMPT_MIN_CHARS } from '@gitroom/nestjs-libraries/dtos/videos/video.prompt.bounds';
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
  ImageStyle,
} from '@gitroom/nestjs-libraries/dtos/media/image.generation.catalog';
import { CostNote } from '@gitroom/frontend/components/ui/cost.note';
import {
  CHIP,
  CHIP_IDLE,
  CHIP_ON,
} from '@gitroom/frontend/components/ui/pick.controls';
import { AiImageIcon } from '@gitroom/frontend/components/ui/icons';
import {
  CreditsPill,
  GenerateButton,
  StageActions,
  StageProgress,
  StageResult,
  StageSample,
  VersionsStrip,
  WorkspaceFrame,
  type WorkspaceToolProps,
} from '@gitroom/frontend/components/studio/workspace.frame';
import {
  FieldLabel,
  OrientationField,
} from '@gitroom/frontend/components/studio/workspace.fields';
import { ReferenceImages } from '@gitroom/frontend/components/launches/ai.image.references';
import {
  BrandField,
  brandRefusal,
  BrandRefusal,
  useImageBrand,
} from '@gitroom/frontend/components/launches/ai.image.brand';
import { liveLogo } from '@gitroom/frontend/components/brands/use.brands';

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

/** The AI image generator's sample picture, on its Studio card and its stage. */
export const AI_IMAGE_COVER = '/studio/covers/ai-image.webp';

/**
 * The placeholder and the finished image share one box so the stage does not
 * jump between them: the preset's own proportions, from the size it renders
 * at.
 */
const presetRatio = (id: ImageAspectId) => {
  const [width, height] = IMAGE_ASPECT_PRESETS[id].size.split('x').map(Number);
  return width / height;
};

const chipClasses = (selected: boolean) =>
  clsx(CHIP, selected ? CHIP_ON : CHIP_IDLE);

/**
 * A refused reference comes back named by the number on its thumbnail, and is
 * said in the window's language rather than the server's English (research
 * R13), as are the brand's. Anything else keeps the server's message.
 */
const referenceRefusal = (
  t: ReturnType<typeof useT>,
  payload: (BrandRefusal & { index?: number }) | null,
  edit: boolean
) => {
  // A refused kit image carries a reference's code, so the brand's refusals
  // are read first.
  const refusal = brandRefusal(t, payload);
  if (refusal) {
    return refusal;
  }
  switch (payload?.code) {
    case 'reference_missing':
      // In an edit, image 1 is the image being edited. It has no remove
      // control, so removing it is not advice the window can give.
      if (edit && payload.index === 1) {
        return t(
          'image_edit_missing',
          "The image you're editing is no longer in your Media library. Use the prompt to make a new one."
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

/**
 * The AI image generator on the shared workspace frame, whatever hosts it: its
 * Studio page or a window. The settings stay on screen throughout, and the
 * stage shows the sample, the style catalogue, the progress or the result.
 */
export const AiImageTool: FC<WorkspaceToolProps> = (props) => {
  const {
    layout,
    destination,
    onChange,
    onAccept,
    setLoading,
    active = true,
    locked,
    onCreatePost,
  } = props;
  const t = useT();
  const fetch = useFetch();
  const toaster = useToaster();
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
  const { brands, brand, pickBrand } = useImageBrand();

  // A generation outlives the modal: the closure keeps running after an early
  // close and attaches the image itself, so it has to know whether anyone is
  // still watching: the tool is mounted, and on screen, which a composer tab
  // behind another is not (contracts/workspace-parts.md §5).
  const mounted = useRef(true);
  const onScreen = useRef(active);
  useEffect(() => {
    onScreen.current = active;
  }, [active]);
  // Set from the click until the render is over. The window's actions stay on
  // screen through the credit check: a second click there must not start a
  // second paid render, and the result must not be used or left while one is
  // coming.
  const rendering = useRef(false);

  // `loading` follows the request, whose end also ends the render
  // (`rendering`). It is all the tool reports: in the composer the stage holds
  // the lock while any tab's request is open (tasks D14).
  const startRequest = () => {
    setLoading?.(true);
  };

  const endRequest = () => {
    rendering.current = false;
    setLoading?.(false);
  };

  useEffect(
    () => () => {
      mounted.current = false;
    },
    []
  );

  // Opened from the chips of the stacked layout, the list takes the stage
  // above them: it is scrolled into view, nearest, so one already in view
  // moves nothing; whether it glides is the stylesheet's call.
  const catalogueRoot = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (catalogOpen && layout === 'stacked') {
      catalogueRoot.current?.scrollIntoView({ block: 'nearest' });
    }
  }, [catalogOpen, layout]);

  // The catalogue is a view of the stage: it closes on a pick, on Show less
  // and when a render takes the stage.
  const closeCatalog = () => {
    setCatalogOpen(false);
    setSearch('');
  };

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
    closeCatalog();
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

      // Closed mid-generation, or its tab behind another: nobody is left to
      // review it, so it goes straight into the post exactly as it did before
      // this step existed.
      if (!mounted.current || !onScreen.current) {
        onChange(generated);
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
      // does: that image can still be used.
      if (held) {
        if (mounted.current && onScreen.current) {
          setPhase('result');
        } else {
          // Closed mid-render, or its tab behind another. It is paid for, and
          // the post or the reference row was promised an image — attaching
          // it is closer to that than nothing. The Media library already holds
          // it, so handing it on there would only announce an older image as
          // new.
          if (destination !== 'media') {
            onChange(held.media);
          }
        }
      } else {
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

    // Before the credit: the minimum is the frontend's own, the API accepts less.
    const missing = IMAGE_PROMPT_MIN_CHARS - prompt.trim().length;
    if (missing > 0) {
      toaster.show(
        t(
          'video_prompt_shortfall',
          'Add at least {{count}} more characters to generate',
          { count: missing }
        ),
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
    onChange(versions[shown].media);
    onAccept?.();
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

  const places = IMAGE_REFERENCE_MAX - (liveLogo(brand) ? 1 : 0);
  // A brand picked after the user's images can leave one more than fits; the
  // row under them says so, and nothing goes until it fits. The image being
  // edited takes one of an edit's places.
  const overflow = references.length > places;
  const editOverflow = editReferences.length > places - 1;

  const version = versions[shown] as Version | undefined;
  // An edit keeps the frame of the version it changes; a generation takes the
  // settings'.
  const renderingAspect =
    editing && version ? version.aspectRatio : aspectRatio;

  // The image is already in the Media library by the time any of this renders
  // — the route saves it before it answers — so the note names what happens
  // next rather than whether the image is kept. The Studio page is no window
  // to close: the member can leave it; a composer tab sits beside the post.
  const progressNote =
    layout === 'page'
      ? t(
          'workspace_leave_note_image',
          "You can leave this page. The image is saved to your Media library when it's ready."
        )
      : t(
          'composer_leave_note_image',
          "Keep writing, switch to Post preview or close this tab. The image is added to your post when it's ready."
        );

  const cost = t('image_uses_one_credit', 'Uses 1 image credit');
  const typical = t(
    'usually_takes_half_minute',
    'Usually takes about half a minute'
  );

  const styleLabel = (entry: ImageStyle) =>
    t(`image_style_${entry.id}`, entry.label);

  // A style as a caption names it: Auto, the absence of one, by its mark.
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
    closeCatalog();
  };

  const settings = (
    <>
      <Textarea
        label="Prompt"
        translationKey="prompt"
        // Matches the section labels around it.
        labelClassName="font-[600]"
        name="prompt"
        disableForm
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        maxLength={IMAGE_PROMPT_MAX_CHARS}
        placeholder={t(
          'describe_the_image_you_want_to_generate',
          'Describe the image you want to generate'
        )}
        hint={t(
          'image_prompt_hint',
          'Describe the subject, the setting and the light. Put the words you want on the image in quotes.'
        )}
        counter={promptCounter(prompt.length)}
        className="text-[14px]"
      />
      <BrandField
        brands={brands}
        brand={brand}
        own={references.length > 0}
        onPick={pickBrand}
      />
      <ReferenceImages
        value={references}
        onChange={setReferences}
        max={places}
        branded={!!brand}
        logo={!!liveLogo(brand)}
      />
      <OrientationField
        label={t('image_orientation', 'Orientation')}
        options={IMAGE_ASPECT_IDS.map((id) => ({
          id,
          label: t(`image_aspect_${id}`, ASPECT_TILES[id].label),
          ratio: IMAGE_ASPECT_PRESETS[id].ratio,
          glyph: ASPECT_TILES[id].glyph,
          tooltipHtml: t(
            `image_aspect_${id}_tooltip`,
            ASPECT_TILES[id].tooltip,
            {
              size: IMAGE_ASPECT_PRESETS[id].size.replace('x', '×'),
            }
          ),
        }))}
        value={aspectRatio}
        onChange={(id) => setAspectRatio(id as ImageAspectId)}
      />
      <FieldLabel label={t('style', 'Style')}>
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
            className={chipClasses(false)}
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
      </FieldLabel>
    </>
  );

  // The whole catalogue, on the stage beside the settings; it scrolls on its
  // own, with room for the focus ring on every side.
  const catalogue = (
    <div
      ref={catalogueRoot}
      className="flex-1 min-h-0 w-full max-w-[640px] overflow-y-auto flex flex-col gap-[16px] p-[4px] -m-[4px] text-start"
    >
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
          onClick={closeCatalog}
          className="text-[12px] font-[600] text-brandText cursor-pointer focus-visible:ring-2 focus-visible:ring-brand"
        >
          {t('show_less', '- Show less')}
        </button>
        {/* Auto is a sentinel, not an entry, so it is not counted. */}
        <span>
          {t('styles_count', '{{count}} styles', { count: listedStyles })}
        </span>
      </div>
    </div>
  );

  const stage =
    phase === 'generating' ? (
      <StageProgress
        ratio={presetRatio(renderingAspect)}
        title={
          editing
            ? t('editing_your_image', 'Editing your image…')
            : t('creating_your_image', 'Creating your image…')
        }
        // An edit says which version it changes, as its caption will.
        detail={
          editing
            ? `${t('image_edit_pill', 'Edit of version {{n}}', {
                n: shown + 1,
              })} · ${typical}`
            : typical
        }
        note={progressNote}
      />
    ) : catalogOpen ? (
      catalogue
    ) : phase === 'result' && version ? (
      <StageResult
        layout={layout}
        media={version.media}
        kind="image"
        ratio={presetRatio(version.aspectRatio)}
        alt={version.prompt}
        caption={
          <>
            {version.prompt}
            {' · '}
            {t(
              `image_aspect_${version.aspectRatio}`,
              ASPECT_TILES[version.aspectRatio].label
            )}
            {' · '}
            {styleSummary(version.style)}
          </>
        }
        actions={
          <StageActions
            media={version.media}
            kind="image"
            destination={destination}
            onAccept={onAccept && useImage}
            onCreatePost={onCreatePost}
          />
        }
        versions={
          <VersionsStrip
            versions={versions.map((entry) => ({
              path: entry.media.path,
              kind: 'image',
            }))}
            shown={shown}
            onSelect={select}
          />
        }
        below={
          // The change applies to the image above, as a new version. Its
          // field has the prompt's ceiling and counter (FR-015); its row of
          // images starts with the one being edited.
          <div className="w-full max-w-[640px] flex flex-col gap-[6px] text-start">
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
              className="bg-newBgColorInner min-h-[96px] p-[16px] outline-none border-newColColor border rounded-[8px] text-[14px] coarse:text-[16px] text-textItemFocused focus-visible:ring-2 focus-visible:ring-brand"
            />
            <ReferenceImages
              lead={version.media}
              value={editReferences}
              onChange={setEditReferences}
              max={places - 1}
              branded={!!brand}
              action={
                <Button
                  variant="secondary"
                  onClick={applyEdit}
                  disabled={editOverflow}
                >
                  {t('image_edit_apply', 'Apply edit')}
                  <span className="ms-[6px] font-[500] opacity-75">
                    · {t('one_credit', '1 credit')}
                  </span>
                </Button>
              }
            />
          </div>
        }
      />
    ) : (
      <StageSample
        cover={AI_IMAGE_COVER}
        icon={<AiImageIcon />}
        title={t('workspace_image_empty_title', 'Your image appears here')}
        body={t(
          'workspace_image_empty_body',
          'Describe it, pick a shape and a style, then press Generate.'
        )}
        examples={[
          t('workspace_example_1', 'Iced lemonade on a sunny terrace'),
          t('workspace_example_2', 'Coffee on a marble table, morning light'),
          t('workspace_example_3', 'Ramadan sweets from above'),
        ]}
        // An example fills the prompt; it never renders by itself.
        onExample={setPrompt}
      />
    );

  // Once there is a result a window folds its settings, so the result and
  // the bar share it.
  const folded = versions.length > 0;

  return (
    <WorkspaceFrame
      layout={layout}
      settings={settings}
      folded={folded}
      settingsSummary={t(
        'workspace_settings_summary_image',
        'Prompt, brand, shape and style'
      )}
      stage={stage}
      // The result is on the stage; All styles takes its place while open.
      result={!catalogOpen && phase === 'result' && !!version}
      sample={
        phase !== 'generating' &&
        !catalogOpen &&
        !(phase === 'result' && !!version)
      }
      actions={
        <div className="flex-1 flex items-center gap-[10px]">
          <CostNote>{cost}</CostNote>
          <div className="flex-1" />
          <GenerateButton
            working={phase === 'generating'}
            again={layout === 'stacked' && folded}
            onClick={generate}
            disabled={overflow}
          />
        </div>
      }
      credits={<CreditsPill count={credits?.credits || 0} />}
      locked={locked}
      cost={cost}
    />
  );
};
