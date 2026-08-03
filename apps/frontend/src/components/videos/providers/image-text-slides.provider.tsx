import { videoWrapper } from '@gitroom/frontend/components/videos/video.wrapper';
import {
  FC,
  ReactNode,
  useCallback,
  useRef,
  useState,
  useEffect,
} from 'react';
import { createPortal } from 'react-dom';
import { VideoPromptField } from '@gitroom/frontend/components/videos/video.modal.parts';
import { CostNote } from '@gitroom/frontend/components/ui/cost.note';
import { useVideoFunction } from '@gitroom/frontend/components/videos/video.render.component';
import useSWR from 'swr';
import { useFormContext } from 'react-hook-form';
import { Button } from '@gitroom/react/form/button';
import { Slider } from '@gitroom/react/form/slider';
import { deleteDialog } from '@gitroom/react/helpers/delete.dialog';
import clsx from 'clsx';
import i18next from 'i18next';
import { useVideo } from '@gitroom/frontend/components/videos/video.context.wrapper';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { ndjsonFrames } from '@gitroom/helpers/utils/ndjson.frames';

export interface Voices {
  voices: Voice[];
  arabicVoices?: Voice[];
}

export interface Voice {
  id: string;
  name: string;
  preview_url: string;
}

const VoiceSelector: FC = () => {
  const t = useT();
  const { register, watch, setValue } = useFormContext();
  const videoFunction = useVideoFunction();
  const [currentlyPlaying, setCurrentlyPlaying] = useState<string | null>(null);
  const [loadingVoice, setLoadingVoice] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const loadVideos = useCallback(() => {
    return videoFunction('loadVoices', {});
  }, []);

  const selectedVoice = watch('voice');
  const { isLoading, data } = useSWR<Voices>('load-voices', loadVideos);

  const [activeSet, setActiveSet] = useState<'english' | 'arabic'>(
    i18next.language?.startsWith('ar') ? 'arabic' : 'english'
  );

  const activeVoices =
    activeSet === 'arabic' && data?.arabicVoices?.length
      ? data.arabicVoices
      : data?.voices;

  // Re-anchor selection to the active set (first load and every set switch)
  useEffect(() => {
    if (
      activeVoices?.length &&
      (!selectedVoice || !activeVoices.some((v) => v.id === selectedVoice))
    ) {
      setValue('voice', activeVoices[0].id);
    }
  }, [activeVoices, selectedVoice, setValue]);

  const playVoice = useCallback(
    async (voiceId: string, previewUrl: string) => {
      try {
        setLoadingVoice(voiceId);

        // Stop current audio if playing
        if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current = null;
        }

        // If clicking the same voice that's playing, stop it
        if (currentlyPlaying === voiceId) {
          setCurrentlyPlaying(null);
          setLoadingVoice(null);
          return;
        }

        // Create new audio element
        const audio = new Audio(previewUrl);
        audioRef.current = audio;

        audio.addEventListener('loadeddata', () => {
          setLoadingVoice(null);
          setCurrentlyPlaying(voiceId);
        });

        audio.addEventListener('ended', () => {
          setCurrentlyPlaying(null);
          audioRef.current = null;
        });

        audio.addEventListener('error', () => {
          setLoadingVoice(null);
          setCurrentlyPlaying(null);
          audioRef.current = null;
        });

        await audio.play();
      } catch (error) {
        console.error('Error playing voice:', error);
        setLoadingVoice(null);
        setCurrentlyPlaying(null);
      }
    },
    [currentlyPlaying]
  );

  const selectVoice = useCallback(
    (voiceId: string) => {
      setValue('voice', voiceId);
    },
    [setValue]
  );

  if (isLoading || !data?.voices?.length) {
    return (
      <div className="flex items-center justify-center py-4">
        <div className="text-sm text-muted">
          {t('loading_voices', 'Loading voices...')}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="text-[14px] font-[600] mb-[6px]">
        {t('select_a_voice', 'Select a voice')}
      </div>
      {/* Two anonymous buttons said nothing about what they switched. Each set
          now names its language in that language's own script and says how many
          voices it holds (FR-019). Omitted entirely when there is only one set,
          which is the pre-existing behaviour. */}
      {!!data?.arabicVoices?.length && (
        <div className="flex gap-[8px]">
          {[
            {
              id: 'english' as const,
              label: t('voice_set_english', 'English'),
              count: data.voices?.length || 0,
            },
            {
              id: 'arabic' as const,
              label: t('voice_set_arabic', 'العربية'),
              count: data.arabicVoices?.length || 0,
            },
          ].map((set) => {
            const selected = activeSet === set.id;
            return (
              <button
                key={set.id}
                type="button"
                aria-pressed={selected}
                onClick={() => setActiveSet(set.id)}
                className={clsx(
                  'flex-1 min-w-0 h-[52px] px-[8px] rounded-[8px] border flex flex-col items-center justify-center gap-[1px] whitespace-nowrap transition-colors',
                  'focus-visible:ring-2 focus-visible:ring-brand',
                  selected
                    ? 'bg-brandSoft border-brand text-brandText font-[600]'
                    : 'bg-surface border-line text-ink hover:border-inkSoft'
                )}
              >
                <span className="inline-flex items-center gap-[6px] text-[14px] font-[600]">
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 16 16"
                    fill="none"
                    aria-hidden="true"
                    className="flex-none opacity-80"
                  >
                    <circle
                      cx="8"
                      cy="8"
                      r="6"
                      stroke="currentColor"
                      strokeWidth="1.3"
                    />
                    <path
                      d="M2 8h12M8 2c1.8 2 1.8 10 0 12M8 2C6.2 4 6.2 12 8 14"
                      stroke="currentColor"
                      strokeWidth="1.3"
                    />
                  </svg>
                  {set.label}
                </span>
                <span
                  className={clsx(
                    'text-[11px] font-[400]',
                    selected ? 'opacity-80' : 'text-muted'
                  )}
                >
                  {t('voice_set_count', '{{count}} voices', {
                    count: set.count,
                  })}
                </span>
              </button>
            );
          })}
        </div>
      )}
      {/* One row per voice — a radio, the name, and a round preview button.
          A labelled full-size button per voice turned a six-voice list into a
          column taller than the modal. */}
      <div className="flex flex-col gap-[6px]">
        {(activeVoices || []).map((voice) => (
          <div
            key={voice.id}
            className={clsx(
              'flex items-center gap-[10px] ps-[12px] pe-[8px] py-[8px] rounded-[8px] border transition-colors cursor-pointer',
              selectedVoice === voice.id
                ? 'border-brand bg-brandSoft'
                : 'border-line bg-surface hover:border-inkSoft'
            )}
            onClick={() => selectVoice(voice.id)}
          >
            <input
              {...register('voice')}
              type="radio"
              value={voice.id}
              className="w-[16px] h-[16px] flex-none accent-brand focus-visible:ring-2 focus-visible:ring-brand"
              checked={selectedVoice === voice.id}
              onChange={() => selectVoice(voice.id)}
            />
            <span className="text-[14px]">{voice.name}</span>
            <span className="flex-1" />
            <button
              type="button"
              aria-label={
                currentlyPlaying === voice.id
                  ? t('stop', 'Stop')
                  : t('play', 'Play')
              }
              className={clsx(
                'w-[30px] h-[30px] rounded-full flex-none inline-flex items-center justify-center border transition-colors',
                'focus-visible:ring-2 focus-visible:ring-brand',
                loadingVoice === voice.id && 'opacity-50 pointer-events-none',
                currentlyPlaying === voice.id
                  ? 'bg-brand border-brand text-white'
                  : 'bg-surface border-line text-ink hover:border-inkSoft'
              )}
              onClick={(e) => {
                e.stopPropagation();
                playVoice(voice.id, voice.preview_url);
              }}
              disabled={loadingVoice === voice.id}
            >
              {currentlyPlaying === voice.id ? (
                <svg width="10" height="10" viewBox="0 0 12 12" fill="currentColor">
                  <rect x="2" y="2" width="8" height="8" rx="1.5" />
                </svg>
              ) : (
                <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                  <path d="M3.5 2.4l6 3.6-6 3.6V2.4z" />
                </svg>
              )}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

interface Storyboard {
  styleGuide: string;
  slides: { text: string }[];
}

/**
 * The NDJSON frames the create route emits. The provider's own `done` event
 * carries a URL and never leaves the server — this is the service's, which
 * carries the saved media row.
 */
type CreateStreamEvent =
  | { name: 'heartbeat' }
  | { name: 'progress'; step: string; done: number; total: number }
  | { name: 'done'; media: { id: string; path: string } }
  | { name: 'error'; error: true; message: string };

/**
 * The render's phases, in the order the stream emits them. Ordered rather than
 * keyed: the waiting screen renders them as a list and is driven by position,
 * so a frame's step name has to resolve to an index. `images` is the one that
 * also carries a live count — the modal appends it to the active step.
 */
const STEPS: {
  step: string;
  /** Its frames carry a real running count; every other step repeats the total. */
  counted?: boolean;
  label: (t: ReturnType<typeof useT>) => string;
}[] = [
  { step: 'planning', label: (t) => t('step_planning', 'Writing image prompts…') },
  { step: 'images', counted: true, label: (t) => t('step_images', 'Creating images') },
  { step: 'voicing', label: (t) => t('step_voicing', 'Recording the voiceover…') },
  {
    step: 'assembling',
    label: (t) => t('step_assembling', 'Putting the video together…'),
  },
];

const SLIDE_OPTIONS = [1, 2, 3, 4, 5, 6];
const MAX_SLIDES = SLIDE_OPTIONS[SLIDE_OPTIONS.length - 1];

/**
 * Mirrors the backend's WORDS_PER_SLIDE budget and SILENT_CHARS_PER_SECOND
 * reading pace so the review screen can show a length before anything renders.
 * Changing either constant in images.slides.ts means changing these too.
 */
const SOFT_CHARS_PER_SLIDE = 140;
const CHARS_PER_SECOND = 14;
const estimateSeconds = (text: string) => text.length / CHARS_PER_SECOND;

/**
 * The server's own MAX_CHARS_PER_SLIDE. Past it `create` rejects the whole deck,
 * so the count is shown against this rather than the soft budget above.
 */
const MAX_CHARS_PER_SLIDE = 280;

const SetupScreen: FC<{ onPlanned: (storyboard: Storyboard) => void }> = ({
  onPlanned,
}) => {
  const t = useT();
  const fetch = useFetch();
  const toaster = useToaster();
  const { watch, setValue, trigger, getValues } = useFormContext();
  const { output, actionsSlot } = useVideo();
  const [loading, setLoading] = useState(false);
  const voiceover = watch('voiceover');
  const slides = watch('slides');

  useEffect(() => {
    if (slides === undefined) setValue('slides', 4);
    if (voiceover === undefined) setValue('voiceover', true);
  }, [slides, voiceover, setValue]);

  const plan = useCallback(async () => {
    if (!(await trigger())) return;
    // Planning is free, but it is credit-gated on purpose — a user with none
    // should find out before writing a script, not after. Asking the pre-flight
    // first is what makes that refusal survivable: a refused request stops dead
    // inside the fetch wrapper, so anything already committed to — the button's
    // loading label here, the waiting screen in `create()` — would stay that way
    // for good.
    await fetch('/media/generate-video/image-text-slides/allowed');
    setLoading(true);
    try {
      const response = await fetch('/media/generate-video/plan', {
        method: 'POST',
        body: JSON.stringify({
          type: 'image-text-slides',
          output,
          customParams: getValues(),
        }),
      });
      if (!response.ok) throw new Error();
      onPlanned(await response.json());
    } catch {
      toaster.show(
        t(
          'could_not_write_script',
          'Could not write a script for this. Please try again.'
        ),
        'warning'
      );
    }
    setLoading(false);
  }, [trigger, getValues, output, onPlanned, toaster, t, fetch]);

  return (
    <div className="flex flex-col gap-[16px]">
      <VideoPromptField
        placeholder={t(
          'slides_prompt_placeholder',
          'What should the video be about? A topic, an offer, or a short brief'
        )}
      />

      <div>
        <div className="text-[14px] font-[600] mb-[6px]">
          {t('slides_count', 'Slides')}
        </div>
        <div className="flex gap-[8px]">
          {SLIDE_OPTIONS.map((count) => (
            <Button
              key={count}
              type="button"
              variant="ghost"
              className={clsx(
                '!flex-1',
                slides === count && '!bg-brandSoft !text-brandText !border-brand'
              )}
              onClick={() => setValue('slides', count)}
            >
              {count}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between border border-tableBorder rounded-[8px] p-[12px]">
        <div className="text-[14px]">{t('voiceover', 'Voiceover')}</div>
        <Slider
          value={voiceover ? 'on' : 'off'}
          onChange={(value) => setValue('voiceover', value === 'on')}
        />
      </div>

      {!!voiceover && <VoiceSelector />}
      {!voiceover && (
        <div className="text-[12px] text-muted">
          {t(
            'silent_video_note',
            'No narration — the slide text is shown on screen.'
          )}
        </div>
      )}

      {/* Planning the script costs nothing — the credit is spent by Create
          video on the next screen, and saying so here stops the user hesitating
          over a button that does not charge (FR-018). */}
      {!!actionsSlot &&
        createPortal(
          <>
            <CostNote>
              {t('video_nothing_charged_yet', 'Nothing is charged yet')}
            </CostNote>
            <span className="flex-1" />
            <Button type="button" onClick={plan} disabled={loading}>
              {loading
                ? t('writing_script', 'Writing the script…')
                : t('continue', 'Continue')}
            </Button>
          </>,
          actionsSlot
        )}
    </div>
  );
};

/** One 28px control in a slide card's header. Icon-only, so it carries a label. */
const SlideControl: FC<{
  label: string;
  disabled?: boolean;
  /** Marks a control that destroys content, so its hover reads as a warning. */
  danger?: boolean;
  onClick: () => void;
  children: ReactNode;
}> = ({ label, disabled, danger, onClick, children }) => (
  <button
    type="button"
    aria-label={label}
    title={label}
    disabled={disabled}
    onClick={onClick}
    className={clsx(
      'w-[28px] h-[28px] rounded-[6px] flex-none inline-flex items-center justify-center text-muted transition-colors',
      'focus-visible:ring-2 focus-visible:ring-brand',
      disabled
        ? 'opacity-35 pointer-events-none'
        : danger
        ? 'hover:bg-quiet hover:text-error'
        : 'hover:bg-quiet hover:text-ink'
    )}
  >
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      {children}
    </svg>
  </button>
);

const ReviewScreen: FC<{
  storyboard: Storyboard;
  onChangeStoryboard: (storyboard: Storyboard) => void;
  onBack: () => void;
  onCreate: () => void;
}> = ({ storyboard, onChangeStoryboard, onBack, onCreate }) => {
  const t = useT();
  const { actionsSlot } = useVideo();
  const slides = storyboard.slides;

  const setText = (index: number, text: string) =>
    onChangeStoryboard({
      ...storyboard,
      slides: slides.map((slide, i) => (i === index ? { text } : slide)),
    });

  const move = (index: number, by: number) => {
    const next = [...slides];
    const target = index + by;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onChangeStoryboard({ ...storyboard, slides: next });
  };

  const remove = (index: number) =>
    onChangeStoryboard({
      ...storyboard,
      slides: slides.filter((_, i) => i !== index),
    });

  const add = () =>
    onChangeStoryboard({ ...storyboard, slides: [...slides, { text: '' }] });

  const totalSeconds = slides.reduce(
    (sum, slide) => sum + estimateSeconds(slide.text),
    0
  );
  // Server-side this is a 400 on the whole deck, so the button is blocked here
  // and the offending slide's own count turns red beside it.
  const anyOverLimit = slides.some(
    (slide) => slide.text.length > MAX_CHARS_PER_SLIDE
  );

  return (
    <div className="flex flex-col gap-[12px]">
      <div className="text-[12px] text-muted">
        {t('estimated_length', 'About {{seconds}}s', {
          seconds: Math.round(totalSeconds),
        })}
      </div>

      {slides.map((slide, index) => {
        const seconds = estimateSeconds(slide.text);
        const chars = slide.text.length;
        const tooLong = chars > SOFT_CHARS_PER_SLIDE;
        const overLimit = chars > MAX_CHARS_PER_SLIDE;
        return (
          // The controls sit in the card's own header rather than a third
          // column, so the text area gets the card's full width — which is what
          // lets the modal be 600px wide instead of 880px.
          <div
            key={index}
            className={clsx(
              'flex flex-col gap-[8px] border rounded-[10px] p-[10px] bg-surface',
              overLimit ? 'border-error' : 'border-line'
            )}
          >
            <div className="flex items-center gap-[8px]">
              <span className="w-[22px] h-[22px] rounded-[6px] bg-quiet text-[11px] font-[600] flex items-center justify-center flex-none">
                {index + 1}
              </span>
              <span className="flex-1" />
              <SlideControl
                label={t('move_slide_up', 'Move slide up')}
                disabled={index === 0}
                onClick={() => move(index, -1)}
              >
                <path
                  d="M8 12.5V4M4.5 7.5L8 4l3.5 3.5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </SlideControl>
              <SlideControl
                label={t('move_slide_down', 'Move slide down')}
                disabled={index === slides.length - 1}
                onClick={() => move(index, 1)}
              >
                <path
                  d="M8 3.5V12M4.5 8.5L8 12l3.5-3.5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </SlideControl>
              {/* A bin, not a cross: the cross is the modal's own close glyph,
                  and this removes a slide rather than dismissing anything. */}
              <SlideControl
                label={t('delete', 'Delete')}
                danger
                onClick={() => remove(index)}
              >
                <path
                  d="M2.8 4.3h10.4M6.4 4.3V3.2a.7.7 0 0 1 .7-.7h1.8a.7.7 0 0 1 .7.7v1.1M12.1 4.3l-.5 8a1 1 0 0 1-1 .95H5.4a1 1 0 0 1-1-.95l-.5-8"
                  stroke="currentColor"
                  strokeWidth="1.3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M6.7 7v3.6M9.3 7v3.6"
                  stroke="currentColor"
                  strokeWidth="1.3"
                  strokeLinecap="round"
                />
              </SlideControl>
            </div>
            <textarea
              value={slide.text}
              onChange={(e) => setText(index, e.target.value)}
              // 16px, the app's own default: this is the text the user came
              // here to edit, so it cannot be the smallest input in the flow.
              className="w-full min-h-[62px] bg-newBgColorInner border border-newTableBorder rounded-[7px] px-[12px] py-[10px] text-[16px] outline-none text-textColor resize-y"
            />
            <div className="flex justify-between items-baseline gap-[10px] text-[11px]">
              <span className={tooLong ? 'text-brandText font-[600]' : 'text-muted'}>
                {tooLong
                  ? t(
                      'slide_text_too_long',
                      'This slide runs about {{seconds}}s — that is long for one image.',
                      { seconds: Math.round(seconds) }
                    )
                  : t('slide_seconds', '{{seconds}}s', {
                      seconds: Math.round(seconds),
                    })}
              </span>
              <span
                dir="ltr"
                className={clsx(
                  'flex-none tabular-nums',
                  overLimit ? 'text-error font-[600]' : 'text-muted'
                )}
              >
                {t('slide_chars', '{{used}} / {{max}}', {
                  used: chars,
                  max: MAX_CHARS_PER_SLIDE,
                })}
              </span>
            </div>
          </div>
        );
      })}

      {anyOverLimit && (
        <div className="text-[12px] text-error">
          {t(
            'slide_over_limit',
            'One slide is over the {{max}} character limit — trim it to continue.',
            { max: MAX_CHARS_PER_SLIDE }
          )}
        </div>
      )}

      {/* Adding a slide edits the deck; back and create leave the screen. The
          two jobs sit on opposite ends rather than reading as one row of three.
          Create video carries its own cost, so the bar needs no separate note. */}
      {!!actionsSlot &&
        createPortal(
          <>
            <Button
              type="button"
              variant="quiet"
              onClick={add}
              disabled={slides.length >= MAX_SLIDES}
            >
              {t('add_slide', 'Add slide')}
            </Button>
            <span className="flex-1" />
            <Button type="button" variant="ghost" onClick={onBack}>
              {t('back', 'Back')}
            </Button>
            <Button
              type="button"
              onClick={onCreate}
              // An empty row is dropped server-side, so blocking here is the only
              // thing that stops a slide vanishing without explanation.
              disabled={
                !slides.length ||
                slides.some((s) => !s.text.trim()) ||
                anyOverLimit
              }
            >
              {t('create_video', 'Create video')}
              <span className="ms-[6px] font-[500] opacity-75">
                · {t('one_credit', '1 credit')}
              </span>
            </Button>
          </>,
          actionsSlot
        )}
    </div>
  );
};

const ImageSlidesComponent = () => {
  const t = useT();
  const fetch = useFetch();
  const toaster = useToaster();
  const { getValues } = useFormContext();
  const {
    output,
    onMedia,
    startRender,
    reportProgress,
    failRender,
    phase,
    setTrail,
  } = useVideo();
  const [storyboard, setStoryboard] = useState<Storyboard | null>(null);
  const [planned, setPlanned] = useState<Storyboard | null>(null);

  // Three screens deep, so the header says which one this is. Declared from
  // here rather than at registration because the labels need `t()`.
  const trailStep = phase === 'setup' ? (storyboard ? 1 : 0) : 2;
  useEffect(() => {
    setTrail({
      steps: [
        t('video_step_script', 'Script'),
        t('video_step_review', 'Review'),
        t('video_step_render', 'Render'),
      ],
      current: trailStep,
    });
  }, [trailStep, setTrail, t]);

  const create: () => Promise<void> = useCallback(async () => {
    if (!storyboard) return;
    // A silent render never emits `voicing` — the server sends `assembling`
    // straight after the images — so listing that phase would leave "Recording
    // the voiceover…" ticked as done on a video that has no voice.
    const steps = STEPS.filter(
      ({ step }) => step !== 'voicing' || !!getValues().voiceover
    );
    try {
      const response = await fetch('/media/generate-video/create', {
        method: 'POST',
        body: JSON.stringify({
          type: 'image-text-slides',
          output,
          customParams: getValues(),
          storyboard,
        }),
      });
      // The credit, trial and provider checks run before the stream opens, so
      // they still arrive as a status. 402 and 406 never reach here — the
      // fetch wrapper shows the billing and trial dialogs and never resolves,
      // which is also why the waiting screen waits for this response: entering
      // it first would strand the user on a render that never started.
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.message || '');
      }

      // Regenerate re-renders this same storyboard rather than re-planning it —
      // the images are written fresh each time, which is the point.
      startRender({
        steps: steps.map(({ label }) => label(t)),
        regenerate: () => create(),
        backLabel: t('edit_script', 'Edit script'),
        // The review screen it returns to is still mounted with the storyboard,
        // so returning to it needs nothing from here.
        onBack: () => undefined,
      });

      let settled = false;

      for await (const data of ndjsonFrames<CreateStreamEvent>(
        response.body!
      )) {
        // Keep-alive frames from the server; not render events.
        if (data.name === 'heartbeat') continue;
        if (data.name === 'error') throw new Error(data.message);
        if (data.name === 'progress') {
          const index = steps.findIndex(({ step }) => step === data.step);
          // An unknown step name would otherwise reset the list to the first
          // phase, which reads as the render going backwards.
          if (index >= 0) {
            reportProgress({
              index,
              // Every frame carries done/total, but only the image step's
              // numbers move — showing the rest would put a static "4 / 4"
              // beside a phase that has not started counting anything.
              ...(steps[index].counted
                ? { done: data.done, total: data.total }
                : {}),
            });
          }
        }
        if (data.name === 'done') {
          // Hands the saved media back to the modal, which shows it on the
          // result screen — or attaches it, if the modal was closed.
          settled = true;
          onMedia(data.media);
        }
      }

      // A stream that ends without either terminal frame would otherwise leave
      // the waiting screen running with no idea what happened.
      if (!settled) {
        throw new Error('');
      }
    } catch (e) {
      failRender();
      toaster.show(
        (e instanceof Error && e.message) ||
          t(
            'video_creation_failed',
            'Could not create the video. You have not been charged.'
          ),
        'warning'
      );
    }
  }, [
    storyboard,
    getValues,
    output,
    onMedia,
    startRender,
    reportProgress,
    failRender,
    toaster,
    t,
    fetch,
  ]);

  // Going back re-plans, which replaces the script. Warn only when that would
  // actually throw work away — comparing against the storyboard as planned, not
  // a dirty flag, so an edit-and-undo does not nag.
  const back = useCallback(async () => {
    const edited = JSON.stringify(storyboard) !== JSON.stringify(planned);
    if (
      edited &&
      !(await deleteDialog(
        t(
          'back_discards_edits',
          'Going back rewrites the script and your edits will be lost. Continue?'
        ),
        t('yes_rewrite_it', 'Yes, rewrite it'),
        t('rewrite_the_script', 'Rewrite the script?'),
        t('no_keep_editing', 'No, keep editing')
      ))
    ) {
      return;
    }
    setStoryboard(null);
  }, [storyboard, planned, t]);

  if (!storyboard) {
    return (
      <SetupScreen
        onPlanned={(next) => {
          setPlanned(next);
          setStoryboard(next);
        }}
      />
    );
  }

  return (
    <ReviewScreen
      storyboard={storyboard}
      onChangeStoryboard={setStoryboard}
      onBack={back}
      onCreate={create}
    />
  );
};

/**
 * A stack of offset frames — stills with cuts between them — under a burned-in
 * caption bar and a narration waveform: the three things this type produces
 * that the single-shot one does not.
 */
const SlidesDiagram = (
  <svg width="52" height="52" viewBox="0 0 52 52" fill="none" aria-hidden="true">
    <rect
      x="4"
      y="6"
      width="28"
      height="21"
      rx="3"
      stroke="currentColor"
      strokeWidth="1.5"
      opacity=".38"
    />
    <rect
      x="9"
      y="10"
      width="28"
      height="21"
      rx="3"
      fill="var(--ai-soft)"
      stroke="currentColor"
      strokeWidth="1.5"
      opacity=".62"
    />
    <rect
      x="14"
      y="14"
      width="28"
      height="21"
      rx="3"
      fill="var(--ai-soft)"
      stroke="currentColor"
      strokeWidth="1.6"
    />
    <path
      d="M17 31l4.5-5 3.4 3.6 4-4.8 5.6 6.2"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <circle cx="21" cy="20" r="1.9" stroke="currentColor" strokeWidth="1.3" />
    <rect
      x="19"
      y="37.5"
      width="18"
      height="2.6"
      rx="1.3"
      fill="currentColor"
      opacity=".55"
    />
    <path
      d="M6 44v-4M10 46v-8M14 45v-6M18 47v-10M22 45v-6M26 46.5v-9M30 44v-4"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
  </svg>
);

videoWrapper('image-text-slides', ImageSlidesComponent, {
  ownsActions: true,
  card: {
    name: {
      key: 'video_type_image_text_slides',
      fallback: 'Image Text Slides',
    },
    description: {
      key: 'video_type_slides_desc',
      fallback:
        'A narrated slideshow of AI images with captions burned in. You review and edit the script before anything is rendered.',
    },
    pills: [
      { key: 'video_type_slides_pill_slides', fallback: '1–6 slides' },
      { key: 'video_type_slides_pill_length', fallback: '10–55 s' },
      {
        key: 'video_type_slides_pill_voiceover',
        fallback: 'Voiceover optional',
      },
      {
        key: 'video_type_slides_pill_bestfor',
        fallback: 'Best for lists & explainers',
      },
    ],
    diagram: SlidesDiagram,
  },
});
