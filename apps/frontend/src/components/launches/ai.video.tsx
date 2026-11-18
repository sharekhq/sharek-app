import React, {
  FC,
  Fragment,
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import clsx from 'clsx';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { isAlreadyAnswered } from '@gitroom/helpers/utils/custom.fetch.func';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import useSWR from 'swr';
import {
  VideoWrapper,
  videoOwnsActions,
  videoOwnsStage,
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
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { ndjsonFrames } from '@gitroom/helpers/utils/ndjson.frames';
import {
  VIDEO_ORIENTATION_IDS,
  VIDEO_ORIENTATION_LABELS,
  VIDEO_ORIENTATION_TOOLTIPS,
  VIDEO_ORIENTATIONS,
  VideoOrientationId,
} from '@gitroom/nestjs-libraries/dtos/videos/video.orientation.catalog';
import { CostNote } from '@gitroom/frontend/components/ui/cost.note';
import type { MediaDestination } from '@gitroom/frontend/components/ui/media.destination';
import {
  CreditsPill,
  GenerateButton,
  StageActions,
  StageProgress,
  StageResult,
  StageSample,
  TickIcon,
  VersionsStrip,
  WORKSPACE_WINDOW,
  WorkspaceFrame,
  WorkspaceToolProps,
} from '@gitroom/frontend/components/studio/workspace.frame';
import { OrientationField } from '@gitroom/frontend/components/studio/workspace.fields';
import { useComposerTabs } from '@gitroom/frontend/components/new-launch/composer.tabs';

export type Media = { id: string; path: string };

export type VideoType = { identifier: string; title: string };

/**
 * The provider's own name for itself, from the registry — or the API's title
 * when it declares no card. The modal never keeps a table of identifiers
 * (FR-004).
 */
export const videoTypeLabel = (t: ReturnType<typeof useT>, type: VideoType) => {
  const card = videoTypeCard(type.identifier);
  return card ? t(card.name.key, card.name.fallback) : type.title;
};

/** The shape's proportions, width over height, as the stage parts take them. */
const orientationRatio = (id: VideoOrientationId) => {
  const [width, height] = VIDEO_ORIENTATIONS[id].ratio.split(':').map(Number);
  return width / height;
};

/** m:ss. Built rather than localised — the digits stay Latin in both languages. */
const formatElapsed = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

/** A video this tool made, and the shape it was made in, which its box keeps. */
type Version = { media: Media; output: VideoOrientationId };

/**
 * The AI video tool, wherever it is hosted: its Studio page (`page`) or a
 * window (`stacked`). The settings stay beside the stage, which shows the
 * sample, the wait or the video, with every video made since it opened.
 */
export const AiVideoTool: FC<
  WorkspaceToolProps & {
    type: VideoType;
  }
> = (props) => {
  const {
    type,
    layout,
    destination,
    onChange,
    onAccept,
    onCreatePost,
    setLoading,
    active = true,
    locked,
  } = props;
  const t = useT();
  const fetch = useFetch();
  const form = useForm();
  const [position, setPosition] = useState<VideoOrientationId>('vertical');
  // The shape of the render under way, which its waiting box draws: the shape
  // picked stays editable beside it, for the next render.
  const [makingShape, setMakingShape] =
    useState<VideoOrientationId>('vertical');
  const toaster = useToaster();
  // Inside the composer the tool is one of its tabs: its windows open outside
  // it (contracts/composer-and-preview.md §4).
  const inTab = !!useComposerTabs();

  const [phase, setPhase] = useState<VideoPhase>('setup');
  const [handshake, setHandshake] = useState<RenderHandshake | null>(null);
  const [progress, setProgress] = useState<RenderProgress | null>(null);
  // Every video made since the tool opened, in order: a render adds one and
  // never replaces what a credit was already spent on (FR-008).
  const [versions, setVersions] = useState<Version[]>([]);
  // The version on screen: the one Use video and Create a post take.
  const [shown, setShown] = useState<Version | null>(null);
  // A ref callback rather than a lookup: the bar does not exist during a
  // provider's first render, and the modal replaces it on every phase change.
  const [actionsSlot, setActionsSlot] = useState<HTMLElement | null>(null);
  // The stage's slot, the same way, for a provider that fills the stage in
  // place of the sample.
  const [stageSlot, setStageSlot] = useState<HTMLElement | null>(null);
  const [trail, setTrail] = useState<VideoTrail | null>(null);
  const [elapsed, setElapsed] = useState(0);

  const loadCredits = useCallback(async () => {
    return (
      await fetch(`/copilot/credits?type=ai_videos`, {
        method: 'GET',
      })
    ).json();
  }, []);

  const { data, mutate: mutateCredits } = useSWR(
    'copilot-credits',
    loadCredits
  );

  // A render outlives the modal: the closure keeps running after an early close
  // and attaches the video itself, so it has to know whether anyone is still
  // watching: the tool is mounted, and on screen, which a composer tab behind
  // another is not (contracts/workspace-parts.md §5).
  const mounted = useRef(true);
  const onScreen = useRef(active);
  useEffect(() => {
    onScreen.current = active;
  }, [active]);
  // Set from the click until the render is over, by whichever path starts it:
  // `generate` below, or a provider that runs its own render (`claimRender`).
  // The window's actions stay on screen until the render's request is
  // answered: a second click there must not start a second paid render, and
  // the result must not be used or left while one is coming.
  const rendering = useRef(false);
  // The version on screen is mirrored in a ref because `failRender` is handed
  // to the provider and captured inside its own memoised render callback: a
  // version whose identity changed with it would go stale exactly when it
  // matters — on a render that fails.
  const held = useRef<Version | null>(null);
  // The shape picked, for the same callbacks and for the render a result's
  // handshake repeats: a shape picked beside a result is the next render's
  // (FR-008). And the shape of the render under way, which its version keeps
  // whatever is picked meanwhile.
  const chosen = useRef<VideoOrientationId>('vertical');
  const making = useRef<VideoOrientationId>('vertical');

  const holdResult = (version: Version | null) => {
    held.current = version;
    setShown(version);
  };

  const choose = (id: VideoOrientationId) => {
    chosen.current = id;
    setPosition(id);
  };

  // `loading` follows the request, whose end also ends the render
  // (`rendering`). It is all the tool reports: in the composer the stage holds
  // the lock while any tab's request is open (tasks D14).
  // Memoized: the context functions built on them have to keep one identity
  // for the life of the modal.
  const startRequest = useCallback(() => {
    setLoading?.(true);
  }, [setLoading]);

  const endRequest = useCallback(() => {
    rendering.current = false;
    setLoading?.(false);
  }, [setLoading]);

  useEffect(
    () => () => {
      mounted.current = false;
    },
    []
  );

  // The five context functions below are deliberately stable: the provider
  // captures them when it builds its render handshake, and the Regenerate it
  // hands back re-runs that same closure.
  // One render at a time, claimed at the click; `endRequest` lets it go when
  // the render is handed back, through `onMedia` or `failRender`.
  const claimRender = useCallback(() => {
    if (rendering.current) {
      return false;
    }
    rendering.current = true;
    return true;
  }, []);

  const startRender = useCallback(
    (next: RenderHandshake) => {
      making.current = chosen.current;
      setMakingShape(chosen.current);
      setHandshake(next);
      setProgress(null);
      setPhase('rendering');
      startRequest();
    },
    [startRequest]
  );

  const reportProgress = useCallback(
    (next: RenderProgress) => setProgress(next),
    []
  );

  const onMedia = useCallback(
    (media: Media) => {
      endRequest();
      mutateCredits();

      // Closed mid-render, or its tab behind another: nobody is left to
      // review it, so it goes straight into the post exactly as it did before
      // this screen existed (FR-014).
      if (!mounted.current || !onScreen.current) {
        onChange(media);
        return;
      }

      const version = { media, output: making.current };
      setVersions((list) => [...list, version]);
      holdResult(version);
      setPhase('result');
    },
    [onChange, mutateCredits, endRequest]
  );

  const failRender = useCallback(() => {
    endRequest();
    // An earlier result was already paid for, so a render that fails must
    // not throw it away.
    if (held.current) {
      // Still watching: put it back on screen, because that video can still
      // be used.
      if (mounted.current && onScreen.current) {
        setPhase('result');
        return;
      }
      // Closed mid-render, or its tab behind another. The waiting screen
      // promised the post or the reference row a video, and this one is paid
      // for — attaching it is closer to that promise than leaving it empty.
      // The Media library already holds it, so handing it on there would only
      // announce an older video as new.
      if (destination !== 'media') {
        onChange(held.current.media);
      }
      return;
    }
    // Nothing to show for it: the inputs are kept for another attempt —
    // nothing was charged.
    if (mounted.current) {
      setPhase('setup');
    }
  }, [endRequest, onChange, destination]);

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
    // One render at a time. It is over when its request ends, or below, when
    // the credit check refuses it or the form does not validate.
    if (!claimRender()) {
      return;
    }
    // The point of asking first: a refusal here has already raised its own
    // modal, so the flow stops before the waiting screen exists. Falling
    // through would only reach the same refusal again, from the render call.
    try {
      await fetch(`/media/generate-video/${type.identifier}/allowed`);
    } catch (e) {
      // Already answered — a refusal here rejects before the waiting screen
      // exists, so there is nothing to undo but the guard and nothing more to
      // say.
      if (isAlreadyAnswered(e)) {
        rendering.current = false;
        return;
      }
      // Any other failure would fail the render call the same way a moment
      // later; fall through so it is reported once, by the path that reports
      // it properly, rather than leaving the button doing nothing.
    }

    const customParams = form.getValues();
    if (!(await form.trigger())) {
      rendering.current = false;
      toaster.show(
        t('please_fill_all_required_fields', 'Please fill all required fields'),
        'warning'
      );
      return;
    }

    // No steps: this route emits only heartbeats until it is done, so the
    // waiting screen shows elapsed time rather than an invented step list.
    // No way back either: the settings stay beside the result, and the next
    // render starts from them as they stand.
    startRender({ regenerate: () => generate() });

    try {
      const response = await fetch(`/media/generate-video`, {
        method: 'POST',
        body: JSON.stringify({
          type: type.identifier,
          output: chosen.current,
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
  }, [type, claimRender, startRender, onMedia, failRender]);

  const useVideoInPost = () => {
    // A render under way would finish after the window closed and hand the
    // post a second video.
    if (rendering.current) {
      return;
    }
    onChange(shown!.media);
    onAccept?.();
  };

  const backFromResult = () => {
    // A render under way would bring the waiting screen up over the screen
    // this returns to.
    if (rendering.current) {
      return;
    }
    // Giving up the result ends the flow; the provider's own inputs stay as
    // they were, on the screen it returns to, and the versions stay for the
    // video after it.
    holdResult(null);
    setPhase('setup');
    handshake?.onBack?.();
  };

  // The video is already in the Media library by the time any of this renders
  // — the route saves it as it finishes — so the note names what happens next
  // rather than whether the video is kept. On its page the member can leave
  // it; a composer tab sits beside the post; a window says where the video
  // goes.
  const note =
    layout === 'page'
      ? t(
          'workspace_leave_note_video',
          "You can leave this page. The video is saved to your Media library when it's ready."
        )
      : inTab
      ? t(
          'composer_leave_note_video',
          "Keep writing, switch to Post preview or close this tab. The video is added to your post when it's ready."
        )
      : destination === 'media'
      ? t(
          'close_window_video_note_media',
          "You can close this window — the video will be saved to your Media library when it's ready."
        )
      : t(
          'close_window_video_note',
          "You can close this window — the video will be added to your post when it's ready."
        );

  const orientationSummary = (output: VideoOrientationId) => (
    <>
      {t(`video_orientation_${output}`, VIDEO_ORIENTATION_LABELS[output])}
      {' · '}
      <span dir="ltr">{VIDEO_ORIENTATIONS[output].ratio}</span>
    </>
  );

  const studio = videoTypeCard(type.identifier)?.studio;
  // The settings start with a workflow's steps; the name, maker and facts
  // are the tool switcher's and the Studio page's top bar.
  const head = !!trail && (
    <div className="flex items-center gap-[8px] text-[13px] text-muted">
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
                {done ? <TickIcon size={9} /> : index + 1}
              </span>
              {label}
            </span>
          </Fragment>
        );
      })}
    </div>
  );

  // Today's order: the shape first, then the provider's own fields.
  const settings = (
    <>
      <OrientationField
        label={t('video_orientation', 'Orientation')}
        options={VIDEO_ORIENTATION_IDS.map((id) => ({
          id,
          label: t(`video_orientation_${id}`, VIDEO_ORIENTATION_LABELS[id]),
          ratio: VIDEO_ORIENTATIONS[id].ratio,
          glyph: VIDEO_ORIENTATIONS[id].glyph,
          tooltipHtml: t(
            `video_orientation_${id}_tooltip`,
            VIDEO_ORIENTATION_TOOLTIPS[id]
          ),
        }))}
        value={position}
        onChange={(id) => choose(id as VideoOrientationId)}
      />
      <VideoWrapper identifier={type.identifier} />
    </>
  );

  const stage =
    phase === 'rendering' ? (
      <StageProgress
        ratio={orientationRatio(makingShape)}
        title={t('creating_your_video', 'Creating your video…')}
        detail={t('video_render_minutes', 'Usually takes a few minutes')}
        elapsed={
          hasSteps
            ? undefined
            : t('video_elapsed', '{{time}} elapsed', {
                time: formatElapsed(elapsed),
              })
        }
        steps={handshake?.steps?.map((label, index) => {
          const at = progress?.index ?? 0;
          return {
            label,
            state: index < at ? 'done' : index === at ? 'now' : 'todo',
            count:
              index === at && progress?.total
                ? `${progress.done}/${progress.total}`
                : undefined,
          } as const;
        })}
        note={note}
      />
    ) : phase === 'result' && shown ? (
      <StageResult
        layout={layout}
        media={shown.media}
        kind="video"
        ratio={orientationRatio(shown.output)}
        alt={videoTypeLabel(t, type)}
        caption={orientationSummary(shown.output)}
        actions={
          <StageActions
            media={shown.media}
            kind="video"
            destination={destination}
            onAccept={onAccept && useVideoInPost}
            onCreatePost={onCreatePost}
            // Only a workflow has an earlier screen to go back to.
            back={
              handshake?.backLabel
                ? { label: handshake.backLabel, onClick: backFromResult }
                : undefined
            }
          />
        }
        versions={
          <VersionsStrip
            versions={versions.map((version) => ({
              path: version.media.path,
              kind: 'video' as const,
            }))}
            shown={versions.indexOf(shown)}
            onSelect={(index) => holdResult(versions[index])}
          />
        }
      />
    ) : videoOwnsStage(type.identifier) ? (
      // A provider that owns the stage puts its own sample and its middle
      // step (a workflow's storyboard) there, as the column its part fills.
      <div
        ref={setStageSlot}
        className="w-full flex-1 min-h-0 overflow-y-auto flex flex-col"
      />
    ) : (
      <StageSample
        cover={studio?.cover}
        icon={
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M8 5.5l10 6.5-10 6.5V5.5z" />
          </svg>
        }
        title={t('workspace_video_empty_title', 'Your video appears here')}
        body={t(
          'workspace_video_empty_body',
          'Fill in the settings, then press Generate.'
        )}
      />
    );

  const folded = versions.length > 0 && phase !== 'setup';
  const actions =
    phase === 'setup' && videoOwnsActions(type.identifier) ? (
      // The provider owns the whole row while it is set up: it is the only
      // side that knows which of its screens is showing, and so whether the
      // next click spends a credit (FR-018).
      <div
        ref={setActionsSlot}
        className="video-actions-content flex-1 flex items-center gap-[10px]"
      />
    ) : (
      <>
        <CostNote>{t('video_uses_one_credit', 'Uses 1 video credit')}</CostNote>
        <div className="flex-1" />
        <GenerateButton
          working={phase === 'rendering'}
          again={layout === 'stacked' && folded}
          // The form's submit in setup. On a result, the same render again,
          // through the handshake, as one more version (FR-008). While one
          // runs, a press starts nothing.
          type={phase === 'setup' ? 'submit' : undefined}
          onClick={
            phase === 'result' ? () => handshake?.regenerate() : undefined
          }
        />
      </>
    );

  return (
    <VideoContextWrapper.Provider
      value={{
        // Start with an empty prompt — we no longer copy the post's text field.
        value: '',
        output: position,
        onMedia,
        close: () => onAccept?.(),
        phase,
        actionsSlot,
        stageSlot,
        claimRender,
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
        // The frame lays the tool out; the form only gathers its fields.
        className="contents"
      >
        <FormProvider {...form}>
          <WorkspaceFrame
            layout={layout}
            head={head}
            settings={settings}
            folded={folded}
            settingsSummary={t(
              'workspace_settings_summary_video',
              'Prompt and settings'
            )}
            stage={stage}
            result={phase === 'result' && !!shown}
            actions={actions}
            credits={<CreditsPill count={data?.credits || 0} />}
            locked={locked}
            cost={t('video_uses_one_credit', 'Uses 1 video credit')}
          />
        </FormProvider>
      </form>
    </VideoContextWrapper.Provider>
  );
};

/**
 * The providers the platform offers for text-to-video. Studio's trigger and
 * its page share it under one SWR key, so both read one request.
 */
export const useAiVideoTypes = () => {
  const fetch = useFetch();

  const loadVideoList = useCallback(async () => {
    return (await (await fetch('/media/video-options')).json()).filter(
      (f: any) => f.placement === 'text-to-image'
    );
  }, []);

  return useSWR<VideoType[]>('load-videos-ai', loadVideoList, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    refreshWhenHidden: false,
    revalidateIfStale: false,
    refreshWhenOffline: false,
    keepPreviousData: true,
  });
};

export const AiVideo: FC<{
  value: string;
  onChange: (params: { id: string; path: string }) => void;
  /**
   * Renders what opens the modal — Studio's card, say — while the modal
   * wiring stays here rather than being copied.
   */
  renderTrigger: (open: () => void, loading: boolean) => ReactNode;
  /**
   * Opens this one provider directly, under its own name. Matching nothing —
   * the capability went away since the page loaded — renders nothing.
   */
  only: string;
  /**
   * Where the finished video goes — what the waiting note promises and what
   * the action that accepts it is called.
   */
  destination: MediaDestination;
}> = (props) => {
  const t = useT();
  const { onChange, renderTrigger, only, destination } = props;
  const [loading, setLoading] = useState(false);
  const modals = useModals();

  const { isLoading, data } = useAiVideoTypes();
  const list = useMemo(
    () => data?.filter((type) => type.identifier === only),
    [data, only]
  );

  const openVideoModal = useCallback(() => {
    if (loading || !list?.length) {
      return;
    }
    modals.openModal({
      title: (
        <div className="flex items-center gap-[10px]">
          <span className="text-aiAccent">✦</span>
          {videoTypeLabel(t, list[0])}
        </div>
      ),
      ...WORKSPACE_WINDOW,
      children: (close) => (
        <AiVideoTool
          type={list[0]}
          layout="stacked"
          destination={destination}
          onChange={onChange}
          onAccept={close}
          setLoading={setLoading}
        />
      ),
    });
  }, [loading, list, onChange, only, destination]);

  if (isLoading || list?.length === 0) {
    return null;
  }

  return <>{renderTrigger(openVideoModal, loading)}</>;
};
