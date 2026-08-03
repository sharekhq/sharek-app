import { FC } from 'react';
import clsx from 'clsx';
import { useFormContext } from 'react-hook-form';
import { Textarea } from '@gitroom/react/form/textarea';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import {
  VIDEO_PROMPT_MAX_CHARS,
  VIDEO_PROMPT_MIN_CHARS,
} from '@gitroom/nestjs-libraries/dtos/videos/video.prompt.bounds';

/**
 * Both providers' prompt field. The bounds are the API's own, imported rather
 * than restated, so the length the hint promises is the length the request is
 * validated against.
 *
 * The failure this replaces was silent: the only guard was an unmessaged
 * `minLength: 5` in a `register()` call, so a short prompt made the button do
 * nothing at all.
 */
export const VideoPromptField: FC<{
  /** Already-translated placeholder describing what to write. */
  placeholder: string;
  /** Prefills the field on first render — the one-shot provider seeds it. */
  value?: string;
}> = ({ placeholder, value }) => {
  const t = useT();
  const { register, watch, formState } = useFormContext();
  const prompt: string = watch('prompt') || '';
  const error = formState?.errors?.prompt;

  // Named after the fact rather than stated as a rule: the count follows the
  // field as it is typed, so the message stays true until it clears itself.
  const missing = VIDEO_PROMPT_MIN_CHARS - prompt.length;
  const message =
    error?.type === 'minLength' && missing > 0
      ? t(
          'video_prompt_shortfall',
          'Add at least {{count}} more characters to generate',
          { count: missing }
        )
      : (error?.message as string | undefined);

  return (
    <Textarea
      label="Prompt"
      translationKey="prompt"
      // Matches the section labels the provider draws around it.
      labelClassName="font-[600]"
      name="prompt"
      placeholder={placeholder}
      {...register('prompt', {
        ...(value ? { value } : {}),
        required: t('please_type_your_prompt', 'Please type your prompt'),
        minLength: {
          value: VIDEO_PROMPT_MIN_CHARS,
          message: t('video_prompt_min_hint', 'At least {{count}} characters.', {
            count: VIDEO_PROMPT_MIN_CHARS,
          }),
        },
        maxLength: {
          value: VIDEO_PROMPT_MAX_CHARS,
          message: t(
            'video_prompt_too_long',
            'The prompt is over the {{max}} character limit — trim it to generate.',
            { max: VIDEO_PROMPT_MAX_CHARS }
          ),
        },
      })}
      className={clsx(message && '!border-error')}
      aria-invalid={!!message}
      error={
        message ? (
          <span className="inline-flex items-center gap-[5px]">
            <svg
              width="13"
              height="13"
              viewBox="0 0 16 16"
              fill="none"
              className="flex-none"
              aria-hidden="true"
            >
              <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.4" />
              <path
                d="M8 4.8v3.6M8 10.8v.4"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
            {message}
          </span>
        ) : undefined
      }
      hint={t('video_prompt_min_hint', 'At least {{count}} characters.', {
        count: VIDEO_PROMPT_MIN_CHARS,
      })}
      // Fixed direction: a counter that reverses to "2000 / 45" under RTL reads
      // as a different number entirely (FR-009).
      counter={
        <span
          dir="ltr"
          className={clsx(
            'flex-none tabular-nums',
            prompt.length > VIDEO_PROMPT_MAX_CHARS
              ? 'text-error font-[600]'
              : 'text-muted'
          )}
        >
          {t('prompt_counter', '{{used}} / {{max}}', {
            used: prompt.length,
            max: VIDEO_PROMPT_MAX_CHARS,
          })}
        </span>
      }
    />
  );
};
