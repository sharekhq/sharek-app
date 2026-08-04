import { Button } from '@gitroom/react/form/button';
import React, {
  FC,
  Fragment,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import clsx from 'clsx';
import Loading from '@gitroom/frontend/components/layout/loading';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { isAlreadyAnswered } from '@gitroom/helpers/utils/custom.fetch.func';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useLaunchStore } from '@gitroom/frontend/components/new-launch/store';
import useSWR from 'swr';
import {
  VideoWrapper,
  videoOwnsActions,
  videoTypeCard,
} from '@gitroom/frontend/components/videos/video.render.component';
import { FormProvider, useForm } from 'react-hook-form';
import { useUser } from '@gitroom/frontend/components/layout/user.context';
import {
  RenderHandshake,
  RenderProgress,
  VideoContextWrapper,
  VideoPhase,
  VideoTrail,
} from '@gitroom/frontend/components/videos/video.context.wrapper';
import { useToaster } from '@gitroom/react/toaster/toaster';
import {
  ModalHeaderSlot,
  ModalHeaderSlotTarget,
  useModals,
} from '@gitroom/frontend/components/layout/new-modal';
import { ndjsonFrames } from '@gitroom/helpers/utils/ndjson.frames';
import {
  VIDEO_ORIENTATION_IDS,
  VIDEO_ORIENTATION_LABELS,
  VIDEO_ORIENTATION_TOOLTIPS,
  VIDEO_ORIENTATIONS,
  VideoOrientationId,
} from '@gitroom/nestjs-libraries/dtos/videos/video.orientation.catalog';
import { CostNote } from '@gitroom/frontend/components/ui/cost.note';
import { ModalActionBar } from '@gitroom/frontend/components/ui/modal.action.bar';
import {
  AspectTile,
  MEDIA_PREVIEW_MAX_HEIGHT,
  MEDIA_PREVIEW_MAX_WIDTH,
} from '@gitroom/frontend/components/ui/aspect.tile';

type Media = { id: string; path: string };

type VideoType = { identifier: string; title: string };

/**
 * The provider's own name for itself, from the registry — or the API's title
 * when it declares no card. The modal never keeps a table of identifiers
 * (FR-004).
 */
const videoTypeLabel = (t: ReturnType<typeof useT>, type: VideoType) => {
  const card = videoTypeCard(type.identifier);
  return card ? t(card.name.key, card.name.fallback) : type.title;
};

const metaPillClasses =
  'text-[11px] font-[600] text-inkSoft bg-panel border border-line rounded-full px-[8px] py-[2px]';

/**
 * One choice in the type chooser: what this type produces, in a diagram it
 * drew itself, a sentence, and the facts a first-time chooser needs — length,
 * quality, what it suits.
 */
const VideoTypeChooserCard: FC<{
  type: VideoType;
  onSelect: () => void;
}> = ({ type, onSelect }) => {
  const t = useT();
  const card = videoTypeCard(type.identifier);

  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex gap-[14px] items-start text-start bg-surface border border-line rounded-[14px] p-[16px] hover:border-inkSoft transition-colors focus-visible:ring-2 focus-visible:ring-brand"
    >
      {!!card && (
        <span className="w-[72px] h-[72px] flex-none rounded-[12px] bg-ai text-aiAccent flex items-center justify-center">
          {card.diagram}
        </span>
      )}
      <span className="flex-1 min-w-0">
        <span className="block text-[15px] font-[600]">
          {videoTypeLabel(t, type)}
        </span>
        {!!card && (
          <>
            <span className="block text-[12px] text-muted mt-[3px] leading-[1.55]">
              {t(card.description.key, card.description.fallback)}
            </span>
            <span className="flex flex-wrap gap-[6px] mt-[8px]">
              {card.pills.map((pill) => (
                <span key={pill.key} className={metaPillClasses}>
                  {t(pill.key, pill.fallback)}
                </span>
              ))}
            </span>
          </>
        )}
      </span>
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        aria-hidden="true"
        className="text-muted flex-none self-center rtl:rotate-180"
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
  );
};

/**
 * The waiting placeholder and the finished player share one shape — the chosen
 * orientation's own proportions fitted into the given box — so the wait shows
 * what is coming. The centred layout gives both the same box as well, so the
 * result fills the outline the wait drew; only the step-list layout, which has
 * to sit the placeholder beside a column of text, draws the shape smaller.
 */
const orientationBox = (ratio: string, maxWidth: number, maxHeight: number) => {
  const [width, height] = ratio.split(':').map(Number);
  const scale = Math.min(maxWidth / width, maxHeight / height);
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  };
};

/**
 * The waiting placeholder in the step-list layout sits beside the step column,
 * so it is the one box that cannot take the full preview width: at 460 a 16:9
 * render would leave the steps 16px to live in. Capped here instead, which
 * still puts a 9:16 placeholder within 13px of the player that replaces it —
 * the shape the wait draws is the shape that arrives.
 */
const STEP_LIST_PLACEHOLDER_MAX_WIDTH = 240;

const pillClasses =
  'h-[26px] px-[10px] inline-flex items-center gap-[5px] bg-surface border border-line rounded-full text-[12px] font-[600] text-inkSoft';

/** m:ss. Built rather than localised — the digits stay Latin in both languages. */
const formatElapsed = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

export const Modal: FC<{
  close: () => void;
  type: VideoType;
  setLoading: (loading: boolean) => void;
  onChange: (params: { id: string; path: string }) => void;
  /** Returns to the chooser. Undefined when there is only one type to choose. */
  onChangeType?: () => void;
}> = (props) => {
  const { type, onChange, close, setLoading, onChangeType } = props;
  const t = useT();
  const fetch = useFetch();
  const setLocked = useLaunchStore((state) => state.setLocked);
  const form = useForm();
  const [position, setPosition] = useState<VideoOrientationId>('vertical');
  const toaster = useToaster();

  const [phase, setPhase] = useState<VideoPhase>('setup');
  const [handshake, setHandshake] = useState<RenderHandshake | null>(null);
  const [progress, setProgress] = useState<RenderProgress | null>(null);
  const [result, setResult] = useState<Media | null>(null);
  // A ref callback rather than a lookup: the bar does not exist during a
  // provider's first render, and the modal replaces it on every phase change.
  const [actionsSlot, setActionsSlot] = useState<HTMLElement | null>(null);
  const [trail, setTrail] = useState<VideoTrail | null>(null);
  const [elapsed, setElapsed] = useState(0);

  const loadCredits = useCallback(async () => {
    return (
      await fetch(`/copilot/credits?type=ai_videos`, {
        method: 'GET',
      })
    ).json();
  }, []);

  const { data, mutate: mutateCredits } = useSWR('copilot-credits', loadCredits);

  // A render outlives the modal: the closure keeps running after an early close
  // and attaches the video itself, so it has to know whether anyone is still
  // watching.
  const mounted = useRef(true);
  const inFlight = useRef(false);
  const holdsLock = useRef(false);
  // The held result is mirrored in a ref because `failRender` is handed to the
  // provider and captured inside its own memoised render callback: a version
  // whose identity changed with the result would go stale exactly when it
  // matters — on a Regenerate that fails.
  const held = useRef<Media | null>(null);

  const holdResult = (media: Media | null) => {
    held.current = media;
    setResult(media);
  };

  // `loading` follows the request; the composer lock follows the whole flow,
  // which is not over until the video is attached or the user gives it up.
  // Memoized like `releaseLock` below: the context functions built on them have
  // to keep one identity for the life of the modal.
  const startRequest = useCallback(() => {
    inFlight.current = true;
    setLoading(true);
    if (!holdsLock.current) {
      holdsLock.current = true;
      setLocked(true);
    }
  }, [setLoading, setLocked]);

  const endRequest = useCallback(() => {
    inFlight.current = false;
    setLoading(false);
  }, [setLoading]);

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
      // (FR-014). Anything else — an unused result, an untouched modal — is
      // given up here, or the composer would stay locked forever.
      if (!inFlight.current) {
        releaseLock();
      }
    },
    [releaseLock]
  );

  // The four context functions below are deliberately stable: the provider
  // captures them when it builds its render handshake, and the Regenerate it
  // hands back re-runs that same closure.
  const startRender = useCallback((next: RenderHandshake) => {
    setHandshake(next);
    setProgress(null);
    setPhase('rendering');
    startRequest();
  }, [startRequest]);

  const reportProgress = useCallback(
    (next: RenderProgress) => setProgress(next),
    []
  );

  const onMedia = useCallback(
    (media: Media) => {
      endRequest();
      mutateCredits();

      // Closed mid-render: nobody is left to review it, so it goes straight
      // into the post exactly as it did before this screen existed (FR-014).
      if (!mounted.current) {
        onChange(media);
        releaseLock();
        return;
      }

      holdResult(media);
      setPhase('result');
    },
    [onChange, mutateCredits, releaseLock, endRequest]
  );

  const failRender = useCallback(() => {
    endRequest();
    // An earlier result was already paid for, so a Regenerate that fails must
    // not throw it away.
    if (held.current) {
      // Still watching: put it back on screen and keep the lock, because that
      // video can still be used.
      if (mounted.current) {
        setPhase('result');
        return;
      }
      // Closed mid-Regenerate. The waiting screen promised a video would reach
      // the post, and this one is paid for — attaching it is closer to that
      // promise than leaving the composer empty.
      onChange(held.current);
      releaseLock();
      return;
    }
    // Nothing to show for it: the flow is over, so the lock goes back. The
    // inputs are kept for another attempt — nothing was charged.
    releaseLock();
    if (mounted.current) {
      setPhase('setup');
    }
  }, [releaseLock, endRequest, onChange]);

  const hasSteps = !!handshake?.steps?.length;

  // Only for a provider whose stream reports nothing: inventing a progress bar
  // for it would be a lie, so the honest measurement is how long it has been.
  useEffect(() => {
    if (phase !== 'rendering' || hasSteps) {
      return;
    }
    setElapsed(0);
    const started = Date.now();
    const timer = setInterval(
      () => setElapsed(Math.round((Date.now() - started) / 1000)),
      1000
    );
    return () => clearInterval(timer);
  }, [phase, hasSteps]);

  const generate: () => Promise<void> = useCallback(async () => {
    // The point of asking first: a refusal here has already raised its own
    // modal, so the flow stops before the waiting screen exists. Falling
    // through would only reach the same refusal again, from the render call.
    try {
      await fetch(`/media/generate-video/${type.identifier}/allowed`);
    } catch (e) {
      // Already answered — a refusal here rejects before the waiting screen
      // exists, so there is nothing to reset and nothing more to say.
      if (isAlreadyAnswered(e)) {
        return;
      }
      // Any other failure would fail the render call the same way a moment
      // later; fall through so it is reported once, by the path that reports
      // it properly, rather than leaving the button doing nothing.
    }

    const customParams = form.getValues();
    if (!(await form.trigger())) {
      toaster.show('Please fill all required fields', 'warning');
      return;
    }

    // No steps: this route emits only heartbeats until it is done, so the
    // waiting screen shows elapsed time rather than an invented step list.
    startRender({
      regenerate: () => generate(),
      backLabel: t('edit_prompt', 'Edit prompt'),
      // Setup is this provider's only screen and it stays mounted with its
      // inputs, so returning to it needs nothing from the provider itself.
      onBack: () => undefined,
    });

    try {
      const response = await fetch(`/media/generate-video`, {
        method: 'POST',
        body: JSON.stringify({
          type: type.identifier,
          output: position,
          customParams,
        }),
      });

      // Trial and provider checks fail before the stream opens, so they still
      // arrive as a status rather than as an error frame. A credit refusal
      // does not reach here at all — it rejects, and the catch resets.
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.message || '');
      }

      // The render takes minutes; the response is an NDJSON stream whose
      // heartbeat frames keep the proxies from cutting the connection.
      let settled = false;
      for await (const frame of ndjsonFrames<{
        name: string;
        media?: { id: string; path: string };
        message?: string;
      }>(response.body!)) {
        if (frame.name === 'error') {
          throw new Error(frame.message || '');
        }
        if (frame.name === 'done' && frame.media) {
          settled = true;
          onMedia(frame.media);
          break;
        }
      }

      // A stream that ends without a terminal frame means the connection went
      // away mid-render. Deliberately NOT the default "you have not been
      // charged" message: a one-shot render cannot be cancelled, so the server
      // finishes on the credit it already committed and the video still lands
      // in the media library. Telling the user it was free would be a lie.
      if (!settled) {
        throw new Error(
          t(
            'video_connection_dropped',
            'The connection dropped before the video was ready. It may still finish — check your media library in a few minutes.'
          )
        );
      }
    } catch (e) {
      failRender();
      // Already answered by the limit modal: the screen is reset and an
      // earlier paid-for result is back where it was. Nothing left to say.
      if (isAlreadyAnswered(e)) {
        return;
      }
      toaster.show(
        (e instanceof Error && e.message) ||
          t(
            'video_creation_failed',
            'Could not create the video. You have not been charged.'
          ),
        'warning'
      );
    }
  }, [type, position, startRender, onMedia, failRender]);

  const useVideoInPost = () => {
    releaseLock();
    onChange(result!);
    close();
  };

  const backFromResult = () => {
    // Giving up the result ends the flow; the provider's own inputs stay as
    // they were, on the screen it returns to.
    releaseLock();
    holdResult(null);
    setPhase('setup');
    handshake?.onBack();
  };

  const orientation = VIDEO_ORIENTATIONS[position];
  const [ratioWidth, ratioHeight] = orientation.ratio.split(':').map(Number);
  /**
   * A step list can only sit beside the placeholder while the placeholder is
   * narrow enough to leave it room, which a portrait shape is and a landscape
   * one is not: at the full preview width a 16:9 box takes 460 of the panel's
   * 496px. Landscape therefore stacks — and gains, because a stacked
   * placeholder can be the player's exact outline rather than a shrunken
   * stand-in for it. Derived from the shape, not from who is rendering it.
   */
  const stepsBeside = hasSteps && ratioHeight > ratioWidth;
  const orientationSummary = (
    <>
      {t(`video_orientation_${position}`, VIDEO_ORIENTATION_LABELS[position])}
      {' · '}
      <span dir="ltr">{orientation.ratio}</span>
    </>
  );
  const summaryPills = (
    // Centred only in the layout that is itself a centred column. Beside the
    // step list it belongs on the same edge as the heading under it.
    <div
      className={clsx(
        'flex gap-[8px] flex-wrap',
        stepsBeside ? 'justify-start' : 'justify-center'
      )}
    >
      <span className={pillClasses}>{orientationSummary}</span>
    </div>
  );

  return (
    <VideoContextWrapper.Provider
      value={{
        // Start with an empty prompt — we no longer copy the post's text field.
        value: '',
        output: position,
        onMedia,
        close,
        phase,
        actionsSlot,
        startRender,
        reportProgress,
        failRender,
        setTrail,
      }}
    >
      <form
        // Hiding the button is not enough to stop a submit: Enter on a focused
        // control still fires one, which would run the one-shot path and spend
        // a credit behind the provider's own review step.
        onSubmit={
          videoOwnsActions(type.identifier)
            ? (e) => e.preventDefault()
            : form.handleSubmit(generate)
        }
        className="flex flex-col gap-[16px] -mt-[12px]"
      >
        <ModalHeaderSlot>
          <div className="bg-ai text-aiAccent rounded-full px-[12px] py-[4px] text-[12px] font-[600]">
            {t('credits_left_count', '{{count}} credits left', {
              count: data?.credits || 0,
            })}
          </div>
        </ModalHeaderSlot>
        <div className="flex items-center gap-[10px] text-[13px] text-muted">
          {/* Only while nothing is running: a type cannot be swapped out from
              under a render, and the result belongs to the type that made it. */}
          {onChangeType && phase === 'setup' ? (
            <button
              type="button"
              onClick={onChangeType}
              className="min-w-0 inline-flex items-center gap-[4px] rounded-[6px] hover:text-ink transition-colors focus-visible:ring-2 focus-visible:ring-brand"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 16 16"
                fill="none"
                aria-hidden="true"
                className="flex-none rtl:rotate-180"
              >
                <path
                  d="M10 3L5 8l5 5"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              {/* The trail keeps its full width; a long type name gives way,
                  which matters most in Arabic. */}
              <span className="truncate">{videoTypeLabel(t, type)}</span>
            </button>
          ) : (
            <span className="min-w-0 truncate">{videoTypeLabel(t, type)}</span>
          )}
          {/* Only for a provider that declared one — a one-shot provider has no
              flow to place the user inside, so it renders none (FR-004). */}
          {!!trail && (
            <div className="flex items-center gap-[8px] ms-auto flex-none">
              {trail.steps.map((label, index) => {
                // Every step is behind you once the video exists.
                const done = phase === 'result' || index < trail.current;
                const now = !done && index === trail.current;
                return (
                  <Fragment key={label}>
                    {index > 0 && (
                      <span
                        aria-hidden="true"
                        className="w-[14px] h-[1px] bg-line flex-none"
                      />
                    )}
                    <span
                      className={clsx(
                        'inline-flex items-center gap-[5px] text-[12px]',
                        now ? 'text-ink font-[600]' : 'text-muted'
                      )}
                    >
                      {/* A tick rather than a recoloured number: done and
                          pending must not differ by colour alone. */}
                      <span
                        className={clsx(
                          'w-[18px] h-[18px] rounded-full flex-none inline-flex items-center justify-center text-[10px] font-[700] border',
                          done
                            ? 'bg-brandSoft2 border-transparent text-brandText'
                            : now
                            ? 'bg-brand border-brand text-white'
                            : 'bg-surface border-line text-muted'
                        )}
                      >
                        {done ? (
                          <svg
                            width="9"
                            height="9"
                            viewBox="0 0 12 12"
                            fill="none"
                            aria-hidden="true"
                          >
                            <path
                              d="M2.5 6.2l2.3 2.3 4.7-5"
                              stroke="currentColor"
                              strokeWidth="1.8"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        ) : (
                          index + 1
                        )}
                      </span>
                      {label}
                    </span>
                  </Fragment>
                );
              })}
            </div>
          )}
        </div>
        <FormProvider {...form}>
          {/* Hidden rather than unmounted while a render runs: the provider
              holds the storyboard and the filled-in fields the result screen's
              return action goes back to. Orientation sits outside the scroller
              so the choice — and its tooltips — stay visible however far the
              body is scrolled (FR-003). */}
          <div
            className={clsx(
              'flex flex-col gap-[6px]',
              phase !== 'setup' && 'hidden'
            )}
          >
            <div className="text-[14px] font-[600]">
              {t('video_orientation', 'Orientation')}
            </div>
            <div className="flex gap-[8px]">
              {VIDEO_ORIENTATION_IDS.map((id) => (
                <AspectTile
                  key={id}
                  label={t(
                    `video_orientation_${id}`,
                    VIDEO_ORIENTATION_LABELS[id]
                  )}
                  ratio={VIDEO_ORIENTATIONS[id].ratio}
                  glyph={VIDEO_ORIENTATIONS[id].glyph}
                  selected={position === id}
                  tooltipHtml={t(
                    `video_orientation_${id}_tooltip`,
                    VIDEO_ORIENTATION_TOOLTIPS[id]
                  )}
                  onSelect={() => setPosition(id)}
                />
              ))}
            </div>
          </div>
          <div
            className={clsx(
              'max-h-[min(430px,60vh)] overflow-x-hidden overflow-y-auto flex flex-col gap-[16px] pe-[4px]',
              phase !== 'setup' && 'hidden'
            )}
          >
            <VideoWrapper identifier={type.identifier} />
          </div>

          {phase === 'rendering' && (
            <>
              <div
                className={clsx(
                  'bg-panel rounded-[18px] p-[20px] flex',
                  stepsBeside
                    ? 'gap-[20px] items-center'
                    : 'flex-col items-center justify-center text-center gap-[16px]'
                )}
              >
                {!stepsBeside && summaryPills}
                {/* The placeholder carries the chosen shape so the wait shows
                    what is coming. The app's reduced-motion layer stops the
                    pulse. */}
                <div
                  className="bg-surface2 rounded-[12px] flex-none animate-pulse flex items-center justify-center text-muted"
                  style={orientationBox(
                    orientation.ratio,
                    stepsBeside
                      ? STEP_LIST_PLACEHOLDER_MAX_WIDTH
                      : MEDIA_PREVIEW_MAX_WIDTH,
                    MEDIA_PREVIEW_MAX_HEIGHT
                  )}
                >
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M8 5.5l10 6.5-10 6.5V5.5z" />
                  </svg>
                </div>
                <div className={clsx(stepsBeside && 'flex-1 min-w-0')}>
                  {stepsBeside && summaryPills}
                  <div
                    className={clsx(
                      'text-[15px] font-[600]',
                      stepsBeside && 'mt-[10px]'
                    )}
                  >
                    {t('creating_your_video', 'Creating your video…')}
                  </div>
                  <div className="text-[12px] text-muted mt-[2px]">
                    {t('video_render_minutes', 'Usually takes a few minutes')}
                    {!hasSteps && (
                      <>
                        {' · '}
                        {t('video_elapsed', '{{time}} elapsed', {
                          time: formatElapsed(elapsed),
                        })}
                      </>
                    )}
                  </div>
                  {hasSteps && (
                    // Stacked, the list keeps its own start edge inside a
                    // centred column: a checklist whose ticks do not line up
                    // is not a checklist.
                    <div
                      className={clsx(
                        'flex flex-col gap-[9px] mt-[14px]',
                        !stepsBeside && 'w-fit mx-auto text-start'
                      )}
                    >
                      {handshake!.steps!.map((label, index) => {
                        const at = progress?.index ?? 0;
                        const done = index < at;
                        const active = index === at;
                        return (
                          <div
                            key={label}
                            className={clsx(
                              'flex items-center gap-[9px] text-[13px]',
                              active
                                ? 'text-ink font-[600]'
                                : done
                                ? 'text-inkSoft'
                                : 'text-muted'
                            )}
                          >
                            {/* Marked by shape as well as colour: a tick when
                                done, a broken ring while running, an empty one
                                until then. */}
                            <span
                              className={clsx(
                                'w-[17px] h-[17px] rounded-full flex-none inline-flex items-center justify-center border-[1.5px]',
                                done
                                  ? 'bg-success border-success text-white'
                                  : active
                                  ? 'border-brand border-t-transparent animate-spin'
                                  : 'border-line bg-surface'
                              )}
                            >
                              {done && (
                                <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                                  <path
                                    d="M2.5 6.2l2.3 2.3 4.7-5"
                                    stroke="currentColor"
                                    strokeWidth="1.8"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  />
                                </svg>
                              )}
                            </span>
                            <span>
                              {label}
                              {active && !!progress?.total && (
                                <span dir="ltr" className="tabular-nums">
                                  {' · '}
                                  {progress.done}/{progress.total}
                                </span>
                              )}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
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
                  <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.4" />
                  <path
                    d="M8 7.5V11M8 5v.5"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    strokeLinecap="round"
                  />
                </svg>
                {t(
                  'close_window_video_note',
                  "You can close this window — the video will be added to your post when it's ready."
                )}
              </div>
            </>
          )}

          {phase === 'result' && !!result && (
            <div className="bg-panel rounded-[18px] p-[20px] flex flex-col items-center gap-[16px]">
              <video
                src={result.path}
                controls
                playsInline
                style={orientationBox(
                  orientation.ratio,
                  MEDIA_PREVIEW_MAX_WIDTH,
                  MEDIA_PREVIEW_MAX_HEIGHT
                )}
                // The same recessed fill the waiting placeholder used, so the
                // result reads as that box filled in — and so a video whose
                // own aspect differs letterboxes into a neutral both themes
                // can carry, rather than a token that inverts.
                className="rounded-[12px] shadow-card bg-surface2"
              />
              <div className="text-[12px] text-muted text-center">
                {orientationSummary}
              </div>
            </div>
          )}

          {/* No bar while a render runs — there is nothing to act on until it
              lands. */}
          {phase !== 'rendering' && (
            <ModalActionBar>
              {phase === 'result' ? (
                  <>
                    <Button variant="quiet" onClick={backFromResult}>
                      {handshake?.backLabel}
                    </Button>
                    <div className="flex-1" />
                    <Button
                      variant="ghost"
                      onClick={() => handshake?.regenerate()}
                    >
                      {t('regenerate', 'Regenerate')}
                      <span className="ms-[6px] font-[500] opacity-75">
                        · {t('one_credit', '1 credit')}
                      </span>
                    </Button>
                    <Button onClick={useVideoInPost}>
                      {t('use_video', 'Use video')}
                    </Button>
                  </>
                ) : videoOwnsActions(type.identifier) ? (
                  // The provider owns the whole row: it is the only side that
                  // knows which of its screens is showing, and so whether the
                  // next click spends a credit (FR-018).
                  <div
                    ref={setActionsSlot}
                    className="video-actions-content flex-1 flex items-center gap-[10px]"
                  />
                ) : (
                  <>
                    <CostNote>
                      {t('video_uses_one_credit', 'Uses 1 video credit')}
                    </CostNote>
                    <div className="flex-1" />
                    <Button type="submit">{t('generate', 'Generate')}</Button>
                  </>
                )}
            </ModalActionBar>
          )}
        </FormProvider>
      </form>
    </VideoContextWrapper.Provider>
  );
};

const AiVideoModal: FC<{
  list: VideoType[];
  close: () => void;
  setLoading: (loading: boolean) => void;
  onChange: (params: { id: string; path: string }) => void;
}> = (props) => {
  const { list, close, setLoading, onChange } = props;
  const t = useT();
  const [type, setType] = useState<VideoType | null>(
    list.length === 1 ? list[0] : null
  );

  if (!type) {
    return (
      <div className="flex flex-col gap-[16px] -mt-[12px]">
        <div className="text-[13px] text-muted">
          {t('choose_a_video_type', 'Choose a video type')}
        </div>
        <div className="flex flex-col gap-[10px]">
          {list.map((p) => (
            <VideoTypeChooserCard
              key={p.identifier}
              type={p}
              onSelect={() => setType(p)}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <Modal
      type={type}
      close={close}
      setLoading={setLoading}
      onChange={onChange}
      // A chosen type is no longer a dead end: with more than one to choose
      // from, the subhead offers the way back to the chooser (FR-017).
      onChangeType={list.length > 1 ? () => setType(null) : undefined}
    />
  );
};

export const AiVideo: FC<{
  value: string;
  onChange: (params: { id: string; path: string }) => void;
}> = (props) => {
  const t = useT();
  const { onChange } = props;
  const [loading, setLoading] = useState(false);
  const fetch = useFetch();
  const modals = useModals();

  const loadVideoList = useCallback(async () => {
    return (await (await fetch('/media/video-options')).json()).filter(
      (f: any) => f.placement === 'text-to-image'
    );
  }, []);

  const { isLoading, data } = useSWR('load-videos-ai', loadVideoList, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    refreshWhenHidden: false,
    revalidateIfStale: false,
    refreshWhenOffline: false,
    keepPreviousData: true,
  });

  const openVideoModal = useCallback(() => {
    if (loading || !data?.length) {
      return;
    }
    modals.openModal({
      title: (
        <div className="flex items-center gap-[10px]">
          <span className="text-aiAccent">✦</span>
          {t('generate_ai_video', 'Generate AI Video')}
          <ModalHeaderSlotTarget className="flex-1 flex justify-end" />
        </div>
      ),
      children: (close) => (
        <AiVideoModal
          list={data}
          onChange={onChange}
          setLoading={setLoading}
          close={close}
        />
      ),
    });
  }, [loading, data, onChange]);

  if (isLoading || data?.length === 0) {
    return null;
  }

  return (
    <div className="relative">
      <div
        onClick={openVideoModal}
        className={clsx(
          'cursor-pointer h-[30px] rounded-[6px] justify-center items-center flex bg-ai text-aiAccent px-[8px]'
        )}
      >
        {loading && (
          <div className="absolute start-[50%] -translate-x-[50%]">
            <Loading height={15} width={15} type="spin" color="var(--ink)" />
          </div>
        )}
        <div
          className={clsx('flex gap-[5px] items-center', loading && 'invisible')}
        >
          <div>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
            >
              <g clipPath="url(#clip0_2352_53058)">
                <path
                  d="M8.06916 14.1663V2.04134M4.97208 14.1663V11.1351M4.97208 5.07259V2.04134M11.1662 14.1663V11.1351M9.09973 2.02152L4.8482 2.04134C3.80748 2.04134 3.28712 2.04134 2.88962 2.23957C2.53997 2.41394 2.25569 2.69218 2.07754 3.0344C1.875 3.42345 1.875 3.93275 1.875 4.95134L1.875 11.2563C1.875 12.2749 1.875 12.7842 2.07754 13.1733C2.25569 13.5155 2.53997 13.7937 2.88962 13.9681C3.28712 14.1663 3.80748 14.1663 4.8482 14.1663H11.2901C12.3308 14.1663 12.8512 14.1663 13.2487 13.9681C13.5984 13.7937 13.8826 13.5155 14.0608 13.1733C14.2633 12.7842 14.2633 12.2749 14.2633 11.2563V7.61426M1.875 5.07259L9.09973 5.06116M1.875 11.1351H14.2633M12.8141 1.20801L12.3949 2.02152C12.253 2.29684 12.1821 2.4345 12.0873 2.55379C12.0032 2.65965 11.9054 2.75455 11.7963 2.83614C11.6734 2.92809 11.5315 2.99692 11.2478 3.13458L10.4094 3.54134L11.2478 3.9481C11.5315 4.08576 11.6734 4.15459 11.7963 4.24654C11.9054 4.32814 12.0032 4.42303 12.0873 4.52889C12.1821 4.64818 12.253 4.78584 12.3949 5.06116L12.8141 5.87467L13.2333 5.06116C13.3751 4.78584 13.4461 4.64818 13.5408 4.52889C13.6249 4.42303 13.7227 4.32814 13.8318 4.24654C13.9548 4.15459 14.0966 4.08576 14.3804 3.9481L15.2188 3.54134L14.3804 3.13458C14.0966 2.99692 13.9548 2.92809 13.8318 2.83614C13.7227 2.75455 13.6249 2.65965 13.5408 2.55379C13.4461 2.4345 13.3751 2.29684 13.2333 2.02152L12.8141 1.20801Z"
                  stroke="currentColor"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </g>
              <defs>
                <clipPath id="clip0_2352_53058">
                  <rect width="16" height="16" fill="currentColor" />
                </clipPath>
              </defs>
            </svg>
          </div>
          <div className="text-[10px] font-[600] iconBreak:hidden block">
            {t('ai', 'AI')} Video
          </div>
        </div>
      </div>
    </div>
  );
};
