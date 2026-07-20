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

const ImageSlidesComponent = () => {
  const t = useT();
  const { register, formState } = useFormContext();
  const { value } = useVideo();

  return (
    <div>
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
          value,
        })}
        error={formState?.errors?.prompt?.message}
      />
      <VoiceSelector />
    </div>
  );
};

videoWrapper('image-text-slides', ImageSlidesComponent);
