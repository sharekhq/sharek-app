import { videoWrapper } from '@gitroom/frontend/components/videos/video.wrapper';
import { FC, useCallback, useRef, useState, useEffect } from 'react';
import { useVideoFunction } from '@gitroom/frontend/components/videos/video.render.component';
import useSWR from 'swr';
import { useFormContext } from 'react-hook-form';
import { Button } from '@gitroom/react/form/button';
import { Textarea } from '@gitroom/react/form/textarea';
import clsx from 'clsx';
import i18next from 'i18next';
import { useVideo } from '@gitroom/frontend/components/videos/video.context.wrapper';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useToaster } from '@gitroom/react/toaster/toaster';

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
      <div className="text-sm font-medium text-textColor mb-4">
        {t('select_a_voice', 'Select a Voice')}
      </div>
      {!!data?.arabicVoices?.length && (
        <div className="flex w-full justify-center items-center gap-[10px]">
          <div className="flex-1 flex">
            <Button
              type="button"
              variant="ghost"
              className={clsx(
                '!flex-1',
                activeSet === 'english' &&
                  '!bg-brandSoft !text-brandText !border-brand'
              )}
              onClick={() => setActiveSet('english')}
            >
              {t('voice_set_english', 'English')}
            </Button>
          </div>
          <div className="flex-1 flex">
            <Button
              type="button"
              variant="ghost"
              className={clsx(
                '!flex-1',
                activeSet === 'arabic' &&
                  '!bg-brandSoft !text-brandText !border-brand'
              )}
              onClick={() => setActiveSet('arabic')}
            >
              {t('voice_set_arabic', 'العربية')}
            </Button>
          </div>
        </div>
      )}
      <div className="space-y-2">
        {(activeVoices || []).map((voice) => (
          <div
            key={voice.id}
            className={clsx(
              'flex items-center justify-between p-3 rounded-lg border transition-colors cursor-pointer',
              selectedVoice === voice.id
                ? 'border-brand bg-brandSoft'
                : 'border-tableBorder bg-sixth hover:bg-boxHover'
            )}
            onClick={() => selectVoice(voice.id)}
          >
            <div className="flex items-center space-x-3">
              <input
                {...register('voice')}
                type="radio"
                value={voice.id}
                className="w-4 h-4 text-brand border-line focus:ring-brand"
                checked={selectedVoice === voice.id}
                onChange={() => selectVoice(voice.id)}
              />
              <div>
                <div className="text-sm font-medium text-textColor">
                  {voice.name}
                </div>
              </div>
            </div>

            <Button
              type="button"
              variant="ghost"
              className={clsx(
                'px-3 py-1 text-xs',
                loadingVoice === voice.id && 'opacity-50 cursor-not-allowed',
                currentlyPlaying === voice.id
                  ? '!bg-brand !text-white'
                  : '!bg-sixth'
              )}
              onClick={(e) => {
                e.stopPropagation();
                playVoice(voice.id, voice.preview_url);
              }}
              disabled={loadingVoice === voice.id}
            >
              {loadingVoice === voice.id
                ? '...'
                : currentlyPlaying === voice.id
                ? `⏹ ${t('stop', 'Stop')}`
                : `▶ ${t('play', 'Play')}`}
            </Button>
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

const SetupScreen: FC<{ onPlanned: (storyboard: Storyboard) => void }> = ({
  onPlanned,
}) => {
  const t = useT();
  const fetch = useFetch();
  const toaster = useToaster();
  const { register, watch, setValue, trigger, getValues, formState } =
    useFormContext();
  const { output } = useVideo();
  const [loading, setLoading] = useState(false);
  const voiceover = watch('voiceover');
  const slides = watch('slides');

  useEffect(() => {
    if (slides === undefined) setValue('slides', 4);
    if (voiceover === undefined) setValue('voiceover', true);
  }, [slides, voiceover, setValue]);

  const plan = useCallback(async () => {
    if (!(await trigger())) return;
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
      <Textarea
        label="Prompt"
        translationKey="prompt"
        name="prompt"
        {...register('prompt', {
          required: t('please_type_your_prompt', 'Please type your prompt'),
          minLength: {
            value: 5,
            message: t(
              'the_prompt_should_be_at_least_5_characters_long',
              'The prompt should be at least 5 characters long'
            ),
          },
        })}
        error={formState?.errors?.prompt?.message}
      />

      <div>
        <div className="text-[14px] mb-[6px]">{t('slides_count', 'Slides')}</div>
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
        <input
          type="checkbox"
          {...register('voiceover')}
          className="w-4 h-4 accent-brand"
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

      <Button type="button" onClick={plan} disabled={loading}>
        {loading
          ? t('writing_script', 'Writing the script…')
          : t('continue', 'Continue')}
      </Button>
    </div>
  );
};

const ReviewScreen: FC<{
  storyboard: Storyboard;
  onChangeStoryboard: (storyboard: Storyboard) => void;
  onBack: () => void;
  onCreate: () => void;
  progress: string;
}> = ({ storyboard, onChangeStoryboard, onBack, onCreate, progress }) => {
  const t = useT();
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

  return (
    <div className="flex flex-col gap-[12px]">
      <div className="text-[12px] text-muted">
        {t('estimated_length', 'About {{seconds}}s', {
          seconds: Math.round(totalSeconds),
        })}
      </div>

      {slides.map((slide, index) => {
        const seconds = estimateSeconds(slide.text);
        const tooLong = slide.text.length > SOFT_CHARS_PER_SLIDE;
        return (
          <div
            key={index}
            className="flex gap-[10px] items-start border border-tableBorder rounded-[10px] p-[10px]"
          >
            <div className="w-[22px] h-[22px] rounded-[6px] bg-sixth text-[11px] flex items-center justify-center shrink-0">
              {index + 1}
            </div>
            <div className="flex-1 min-w-0">
              <textarea
                value={slide.text}
                onChange={(e) => setText(index, e.target.value)}
                className="w-full bg-newBgColorInner border border-newTableBorder rounded-[7px] p-[8px] text-[14px] outline-none text-textColor"
              />
              <div
                className={clsx(
                  'text-[11px] mt-[4px]',
                  tooLong ? 'text-brand' : 'text-muted'
                )}
              >
                {tooLong
                  ? t(
                      'slide_text_too_long',
                      'This slide runs about {{seconds}}s — that is long for one image.',
                      { seconds: Math.round(seconds) }
                    )
                  : t('slide_seconds', '{{seconds}}s', {
                      seconds: Math.round(seconds),
                    })}
              </div>
            </div>
            <div className="flex gap-[4px] shrink-0">
              <Button type="button" variant="ghost" onClick={() => move(index, -1)}>
                ↑
              </Button>
              <Button type="button" variant="ghost" onClick={() => move(index, 1)}>
                ↓
              </Button>
              <Button type="button" variant="ghost" onClick={() => remove(index)}>
                ✕
              </Button>
            </div>
          </div>
        );
      })}

      <div className="flex justify-between gap-[10px]">
        <Button
          type="button"
          variant="ghost"
          onClick={add}
          disabled={slides.length >= MAX_SLIDES}
        >
          {t('add_slide', 'Add slide')}
        </Button>
        <Button type="button" variant="ghost" onClick={onBack}>
          {t('back', 'Back')}
        </Button>
        <Button
          type="button"
          onClick={onCreate}
          disabled={!!progress || !slides.length}
        >
          {progress || t('create_video', 'Create video')}
        </Button>
      </div>
    </div>
  );
};

const ImageSlidesComponent = () => {
  const t = useT();
  const fetch = useFetch();
  const toaster = useToaster();
  const { getValues } = useFormContext();
  const { output, onMedia } = useVideo();
  const [storyboard, setStoryboard] = useState<Storyboard | null>(null);
  const [planned, setPlanned] = useState<Storyboard | null>(null);
  const [progress, setProgress] = useState('');

  const create = useCallback(async () => {
    if (!storyboard) return;
    setProgress(t('starting', 'Starting…'));
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
      const reader = response.body!.getReader();
      const decoder = new TextDecoder('utf-8');
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const chunk of decoder
          .decode(value, { stream: true })
          .split('\n')
          .filter((f) => f && f.indexOf('{') > -1)) {
          let data: CreateStreamEvent;
          try {
            data = JSON.parse(chunk);
          } catch {
            /** ignore partial / unparseable chunks **/
            continue;
          }
          // Keep-alive frames from the server; not render events.
          if (data.name === 'heartbeat') continue;
          if (data.name === 'error') throw new Error(data.message);
          if (data.name === 'progress') {
            setProgress(
              t('creating_step', 'Creating… {{done}}/{{total}}', {
                done: data.done,
                total: data.total,
              })
            );
          }
          if (data.name === 'done') {
            // Hands the saved media back to the modal, which attaches it to the
            // post and closes.
            setProgress('');
            onMedia(data.media);
          }
        }
      }
    } catch (e) {
      toaster.show(
        (e instanceof Error && e.message) ||
          t(
            'video_creation_failed',
            'Could not create the video. You have not been charged.'
          ),
        'warning'
      );
      setProgress('');
    }
  }, [storyboard, getValues, output, onMedia, toaster, t, fetch]);

  // Going back re-plans, which replaces the script. Warn only when that would
  // actually throw work away — comparing against the storyboard as planned, not
  // a dirty flag, so an edit-and-undo does not nag.
  const back = useCallback(() => {
    const edited = JSON.stringify(storyboard) !== JSON.stringify(planned);
    if (
      edited &&
      !window.confirm(
        t(
          'back_discards_edits',
          'Going back rewrites the script and your edits will be lost. Continue?'
        )
      )
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
      progress={progress}
    />
  );
};

videoWrapper('image-text-slides', ImageSlidesComponent, { ownsSubmit: true });
