'use client';

import {
  CSSProperties,
  FC,
  ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { Button, buttonClassName } from '@gitroom/react/form/button';
import { VideoFrame } from '@gitroom/react/helpers/video.frame';
import { CostNote, InfoIcon } from '@gitroom/frontend/components/ui/cost.note';
import {
  CheckmarkIcon,
  ChevronDownIcon,
  PlusIcon,
} from '@gitroom/frontend/components/ui/icons';
import { CARD_PADDING } from '@gitroom/frontend/components/ui/page.scroll';
import { CHIP, CHIP_IDLE } from '@gitroom/frontend/components/ui/pick.controls';
import { MediaDestination } from '@gitroom/frontend/components/ui/media.destination';

export type WorkspaceLayout = 'page' | 'stacked';

/** The props every host passes a tool body on the frame (contracts/workspace-parts.md §5). */
export interface WorkspaceToolProps {
  layout: WorkspaceLayout;
  destination: MediaDestination;
  /** Called with the media in every place today's onChange is called: accept, and the unwatched path. */
  onChange: (media: { id: string; path: string }) => void;
  /** The host's accept: window → close, tab → close the tab. Absent on the Studio page. */
  onAccept?: () => void;
  /** true while a render's request is open (today's setLoading). */
  setLoading?: (loading: boolean) => void;
  /** Composer tab only: false while another tab is on screen, so a render that lands then takes the unwatched path. Default true. */
  active?: boolean;
  locked?: boolean;
  /** The Studio tool page's Create a post, only when the workspace has a channel. */
  onCreatePost?: (media: { id: string; path: string }) => void;
}

export interface WorkspaceFrameProps {
  layout: WorkspaceLayout;
  /** Model facts or a workflow's steps, at the top of the settings. */
  head?: ReactNode;
  settings: ReactNode;
  /** Fold the settings into one row once there is a result (stacked, and the page on a phone). */
  folded?: boolean;
  /** The folded row's second line, e.g. "Prompt, brand, shape and style". */
  settingsSummary?: string;
  stage: ReactNode;
  /**
   * The stage shows a result: a window or a tab lets the stage grow with it,
   * as the page does on a phone, where the sample and the wait keep its fixed
   * height (FR-015, FR-016a).
   */
  result?: boolean;
  /**
   * The stage shows the sample: a window or a tab takes its height, as the
   * sample is one fixed size, where the wait and the result keep theirs.
   */
  sample?: boolean;
  /** The action bar's contents when not locked: cost note + main button, or a provider's slot. */
  actions: ReactNode;
  /** Credits left, shown in the bar. */
  credits?: ReactNode;
  /** A plan without AI: Upgrade to Billing in place of `actions`. */
  locked?: boolean;
  /** The tool's cost, beside Upgrade when `locked`. */
  cost?: ReactNode;
}

// The column that scrolls with the settings. The focus ring is a 2px
// box-shadow outside the field and overflow clips at the padding edge, so the
// box pads 4px on every side and takes them back with a negative margin: the
// fields sit where an unpadded box had them and the ring shows whole.
const SETTINGS_SCROLL =
  'overflow-x-hidden overflow-y-auto flex flex-col gap-[16px] p-[4px] -m-[4px]';

/**
 * The one frame every AI tool draws, whatever hosts it. On its Studio page
 * (`page`) the settings sit in a panel of clamp(380px,34vw,460px) on the start side, scrolling on
 * their own above the action bar, and the stage fills the rest. From 1025px
 * down the window scrolls and the bar is fixed to the foot of the screen; on a
 * phone the page stacks, the stage first.
 * A window or a tab (`stacked`) draws the stage, the settings and the bar in
 * one column that scrolls in the host's height, the bar stuck to its bottom.
 * After a result the stacked settings fold into one Settings row that opens
 * them.
 *
 * The bar holds the tool's credits and its actions, or, on a plan without AI,
 * the cost and Upgrade: the settings and the stage stay to be read.
 */
export const WorkspaceFrame: FC<WorkspaceFrameProps> = ({
  layout,
  head,
  settings,
  folded,
  settingsSummary,
  stage,
  result,
  sample,
  actions,
  credits,
  locked,
  cost,
}) => {
  const t = useT();
  const [open, setOpen] = useState(false);
  const page = layout === 'page';
  const tucked = folded && !open;

  const row = folded && (
    <button
      type="button"
      aria-expanded={open}
      onClick={() => setOpen((value) => !value)}
      className={clsx(
        page ? 'hidden phone:flex' : 'flex',
        'w-full items-center gap-[10px] px-[12px] py-[8px] coarse:min-h-[44px] bg-surface border border-line rounded-[8px] text-start cursor-pointer hover:border-inkSoft transition-colors focus-visible:ring-2 focus-visible:ring-brand'
      )}
    >
      <span className="flex-1 min-w-0 flex flex-col">
        <span className="text-[14px] font-[600] text-ink">
          {t('settings', 'Settings')}
        </span>
        {settingsSummary && (
          <span className="text-[12px] text-muted truncate">
            {settingsSummary}
          </span>
        )}
      </span>
      <ChevronDownIcon
        size={16}
        rotated={open}
        aria-hidden="true"
        className="flex-none text-muted"
      />
    </button>
  );

  // In the page the bar spans the panel, so it reaches past the panel's
  // padding to both edges and its foot. From 1025px down the window scrolls
  // and the page card clips, so a sticky bar would never pin: the bar is
  // fixed to the foot of the screen, under the menu drawer's scrim and every
  // popup, clear of the home indicator, as the composer's tool bar is. In a
  // window it sticks to the scroller's foot, which keeps no ring room under
  // it, so it meets the window's foot while scrolling and at the end.
  const bar = (
    <div
      className={clsx(
        'py-[16px] border-t border-line bg-surface flex flex-wrap items-center gap-[10px]',
        page
          ? '-mx-[20px] -mb-[20px] px-[20px] mobile:m-0 mobile:px-[16px] mobile:pb-[calc(16px+env(safe-area-inset-bottom))] mobile:fixed mobile:inset-x-0 mobile:bottom-0 mobile:z-[90]'
          : 'sticky bottom-0 -mx-[16px] px-[16px]'
      )}
    >
      {credits}
      {locked ? (
        <>
          {!!cost && <CostNote>{cost}</CostNote>}
          <div className="flex-1" />
          <Link href="/billing" className={buttonClassName({ size: 'large' })}>
            {t('studio_upgrade', 'Upgrade')}
          </Link>
        </>
      ) : (
        actions
      )}
    </div>
  );

  if (page) {
    return (
      // The fixed bar leaves the flow, so the page keeps room under its
      // content as tall as the bar: its line, 16px above and below a 44px
      // row, one row from 769px where the bar spans the screen; on a phone
      // the credits may take a row of their own (26px and the 10px gap).
      <div className="flex h-full min-h-0 mobile:h-auto mobile:pb-[calc(77px+env(safe-area-inset-bottom))] phone:flex-col phone:pb-[calc(113px+env(safe-area-inset-bottom))]">
        <div
          className={clsx(
            CARD_PADDING,
            'w-[clamp(380px,34vw,460px)] shrink-0 min-h-0 flex flex-col gap-[16px] border-e border-line phone:w-full phone:border-e-0'
          )}
        >
          {head}
          {row}
          <div
            className={clsx(
              'flex-1 min-h-0',
              SETTINGS_SCROLL,
              tucked && 'phone:hidden'
            )}
          >
            {settings}
          </div>
          {bar}
        </div>
        <div
          className={clsx(
            CARD_PADDING,
            STAGE_BACKGROUND,
            'flex-1 min-w-0 [container-type:size] flex flex-col items-center justify-center mobile:self-start phone:self-stretch phone:order-first phone:flex-none',
            // A size container is as tall as it is told, so a stage that
            // grows with its result stops being one.
            result
              ? 'mobile:[container-type:normal] phone:[container-type:normal]'
              : 'mobile:h-[clamp(240px,45dvh,440px)] phone:h-[clamp(240px,45dvh,440px)]'
          )}
        >
          {stage}
        </div>
      </div>
    );
  }

  // The bar is the last child and its button's ring falls inside its own
  // padding, so no ring room under it: a sticky box keeps inside its
  // scroller's padding and never leaves its place in the flow.
  return (
    <div className={clsx('flex-1 min-h-0', SETTINGS_SCROLL, 'pb-0')}>
      <div
        data-sample={sample || undefined}
        className={clsx(
          STAGE_BACKGROUND,
          'group/stage',
          // One sample size for every tool, the AI image's, whatever the
          // stage's width (StageSample reads it).
          'flex-none flex flex-col items-center justify-center [--sample-w:min(100%,400px)]',
          // As on a phone's page: a size container is as tall as it is
          // told, so a stage that grows with its result stops being one.
          // The sample is one fixed size, so its stage takes that height.
          result || sample
            ? '[container-type:normal]'
            : 'h-[clamp(240px,45dvh,440px)] [container-type:size]'
        )}
      >
        {stage}
      </div>
      {head}
      {row}
      <div className={clsx('flex flex-col gap-[16px]', tucked && 'hidden')}>
        {settings}
      </div>
      {bar}
    </div>
  );
};

/**
 * The window a tool opens in away from its page (contracts/workspace-parts.md
 * §6), as `openModal` takes it: no taller than the screen, so the bar under
 * the settings never sits below it.
 */
export const WORKSPACE_WINDOW = {
  size: 'min(640px, 100%)',
  height: 'min(860px, calc(100dvh - 48px))',
  top: 24,
};

/**
 * The stage's background: the panel tint under a dot grid of the theme's ink,
 * so the result reads against it in either theme.
 */
export const STAGE_BACKGROUND =
  'bg-[var(--panel)] [background-image:radial-gradient(color-mix(in_srgb,var(--ink)_7%,transparent)_1px,transparent_1px)] [background-size:20px_20px]';

/** The credits left, in the action bar. */
export const CreditsPill: FC<{ count: number }> = ({ count }) => {
  const t = useT();
  return (
    <div className="bg-ai text-aiAccent rounded-full px-[12px] py-[4px] text-[12px] font-[600]">
      {t('credits_left_count', '{{count}} credits left', { count })}
    </div>
  );
};

/**
 * The bar's main button, worded as every tool words it (tasks D6): Creating…
 * while a render runs, Generate again once a window's settings fold after a
 * result, Generate otherwise. The press and the type are the tool's.
 */
export const GenerateButton: FC<{
  working: boolean;
  /** The stacked layout, once its settings fold after a result. */
  again: boolean;
  type?: 'button' | 'submit';
  onClick?: () => void;
  disabled?: boolean;
}> = ({ working, again, type, onClick, disabled }) => {
  const t = useT();
  return (
    <Button
      type={type}
      size="large"
      onClick={onClick}
      disabled={disabled}
      aria-busy={working}
    >
      {working
        ? t('workspace_working', 'Creating…')
        : again
        ? t('workspace_generate_again', 'Generate again')
        : t('generate', 'Generate')}
    </Button>
  );
};

// A stage part fills the stage; its picture takes what the words leave.
const STAGE_PART =
  'flex-1 min-h-0 self-stretch flex flex-col items-center gap-[16px] text-center';
// The room the picture fills: a size container of its own, so the words
// around it keep their height and the picture sizes to the rest. A result's
// room stops being one where its stage grows (StageResult).
const STAGE_ROOM_BOX = 'flex-1 min-h-0 w-full flex items-center justify-center';
const STAGE_ROOM = clsx(STAGE_ROOM_BOX, '[container-type:size]');
// A stacked stage showing the sample (WorkspaceFrame's `sample`) takes the
// sample's height, so its part and room keep their content's instead of
// shrinking to a fixed stage.
export const STAGE_SAMPLE_FIT = 'group-data-[sample]/stage:flex-none';
const STAGE_PART_SAMPLE = clsx(STAGE_PART, STAGE_SAMPLE_FIT);
const STAGE_ROOM_SAMPLE = clsx(
  STAGE_ROOM,
  STAGE_SAMPLE_FIT,
  'group-data-[sample]/stage:[container-type:inline-size]'
);

/**
 * The placeholder's box and the result's, so the result lands where the wait
 * drew it: the chosen shape, as tall as its room and, with `max-w-full`, never
 * wider than it.
 */
const stageBox = (ratio: number): CSSProperties => ({
  aspectRatio: ratio,
  width: `calc(100cqh * ${ratio})`,
});

/**
 * Before anything is made: the tool's sample picture, marked as a sample, a
 * title and one line on what to do, and up to three example prompts. An
 * example hands its text to the tool, which fills the prompt with it; it
 * never renders by itself.
 */
export const StageSample: FC<{
  cover?: string;
  /** Drawn where a tool with no cover would have its picture. */
  icon: ReactNode;
  title: string;
  body: string;
  examples?: string[];
  onExample?: (text: string) => void;
}> = ({ cover, icon, title, body, examples, onExample }) => {
  const t = useT();
  // A picture that does not load gives way to the icon, as on the Studio card.
  const [coverFailed, setCoverFailed] = useState(false);
  return (
    <div className={STAGE_PART_SAMPLE}>
      <div className={STAGE_ROOM_SAMPLE}>
        <div className="relative w-[var(--sample-w,min(100cqw,calc(100cqh*16/9),640px))] aspect-video overflow-hidden rounded-[12px] bg-surface">
          {cover && !coverFailed ? (
            <img
              src={cover}
              width="640"
              height="360"
              alt=""
              onError={() => setCoverFailed(true)}
              className="absolute inset-0 w-full h-full object-cover"
            />
          ) : (
            <span className="absolute inset-0 flex items-center justify-center text-muted">
              {icon}
            </span>
          )}
          <span className="absolute top-[10px] start-[10px] h-[26px] px-[8px] rounded-full bg-black/70 text-white text-[12px] font-[600] flex items-center">
            {t('workspace_sample', 'Sample')}
          </span>
        </div>
      </div>
      <div className="flex flex-col gap-[4px] max-w-[420px]">
        <div className="text-[16px] font-[600] text-ink">{title}</div>
        <div className="text-[14px] leading-[1.5] text-muted">{body}</div>
      </div>
      {!!examples?.length && (
        <div className="flex flex-col items-center gap-[8px]">
          <div className="text-[12px] font-[600] text-muted">
            {t('workspace_try_one', 'Try one')}
          </div>
          <div className="flex flex-wrap justify-center gap-[8px]">
            {examples.slice(0, 3).map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => onExample?.(example)}
                className={clsx(CHIP, CHIP_IDLE)}
              >
                {example}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

/** The note under the wait and the info mark it leads with, the cost line's. */
const StageNote: FC<{ children: ReactNode }> = ({ children }) => (
  <div className="flex gap-[8px] items-start max-w-[420px] text-start text-[12px] text-muted">
    <InfoIcon className="mt-[3px]" />
    {children}
  </div>
);

/** A done step's tick: the progress's step list and a workflow's steps. */
export const TickIcon: FC<{ size: number }> = ({ size }) => (
  <svg
    width={size}
    height={size}
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
);

/**
 * While a tool works: a placeholder of the chosen shape, so the wait shows
 * what is coming, the working message and typical time, then the elapsed
 * time or a workflow's steps, and the note on where the result goes. The
 * app's reduced-motion layer stops the pulse and the turning ring too.
 */
export const StageProgress: FC<{
  ratio: number;
  title: string;
  detail: string;
  elapsed?: string;
  steps?: {
    label: string;
    state: 'done' | 'now' | 'todo';
    count?: string;
  }[];
  note: string;
}> = ({ ratio, title, detail, elapsed, steps, note }) => (
  <div className={STAGE_PART}>
    <div className={STAGE_ROOM}>
      <div
        className="max-w-full bg-surface2 rounded-[12px] motion-safe:animate-pulse"
        style={stageBox(ratio)}
      />
    </div>
    <div>
      <div className="text-[15px] font-[600] text-ink">{title}</div>
      <div className="text-[12px] text-muted mt-[2px]">
        {detail}
        {elapsed && (
          <>
            {' · '}
            {elapsed}
          </>
        )}
      </div>
      {!!steps?.length && (
        // The list keeps its own start edge inside the centred column: a
        // checklist whose ticks do not line up is not a checklist.
        <div className="flex flex-col gap-[9px] mt-[14px] w-fit mx-auto text-start">
          {steps.map(({ label, state, count }) => (
            <div
              key={label}
              className={clsx(
                'flex items-center gap-[9px] text-[13px]',
                state === 'now'
                  ? 'text-ink font-[600]'
                  : state === 'done'
                  ? 'text-inkSoft'
                  : 'text-muted'
              )}
            >
              {/* Marked by shape as well as colour: a tick when done, a
                  broken ring while running, an empty one until then. */}
              <span
                className={clsx(
                  'w-[17px] h-[17px] rounded-full flex-none inline-flex items-center justify-center border-[1.5px]',
                  state === 'done'
                    ? 'bg-success border-success text-white'
                    : state === 'now'
                    ? 'border-brand border-t-transparent motion-safe:animate-spin'
                    : 'border-line bg-surface'
                )}
              >
                {state === 'done' && <TickIcon size={10} />}
              </span>
              <span>
                {label}
                {count && (
                  <span dir="ltr" className="tabular-nums">
                    {' · '}
                    {count}
                  </span>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
    <StageNote>{note}</StageNote>
  </div>
);

/**
 * A finished result in the box its placeholder drew, then where it is kept,
 * its caption, the tool's actions, the versions and, for an image, the edit
 * bar. A rendered video plays where it sits; an image opens full size in a
 * new tab, through a link so ⌘-click, middle-click and the keyboard all reach
 * it. The corner badge names where it goes, so the cursor is the plain
 * pointer: a magnifier would promise a lightbox a new tab does not deliver.
 * Where the stage grows with the result (the frame's `result`: a window's or
 * a tab's at every width, the page's on a phone), the picture leaves its
 * room's size container, which would fold to nothing, and takes the full
 * width in its own shape (`!`, over the width its box sets inline).
 */
export const StageResult: FC<{
  layout: WorkspaceLayout;
  media: { path: string };
  kind: 'image' | 'video';
  ratio: number;
  alt: string;
  caption: ReactNode;
  actions: ReactNode;
  versions?: ReactNode;
  below?: ReactNode;
}> = ({
  layout,
  media,
  kind,
  ratio,
  alt,
  caption,
  actions,
  versions,
  below,
}) => {
  const t = useT();
  const page = layout === 'page';
  return (
    <div className={STAGE_PART}>
      <div
        className={clsx(
          STAGE_ROOM_BOX,
          page
            ? '[container-type:size] phone:[container-type:normal]'
            : '[container-type:normal]'
        )}
      >
        {kind === 'image' ? (
          <a
            href={media.path}
            target="_blank"
            rel="noreferrer"
            aria-label={t('open_image_full_size', 'Open the image full size')}
            style={stageBox(ratio)}
            className={clsx(
              'group relative block max-w-full cursor-pointer rounded-[12px] focus-visible:ring-2 focus-visible:ring-brand',
              page ? 'phone:!w-full' : '!w-full'
            )}
          >
            {/* `block` rather than the inline default: an inline image leaves
                descender space inside the link, which would put the focus
                ring and the corner badge below the picture's own edge. */}
            <img
              src={media.path}
              alt={alt}
              className="block w-full h-full rounded-[12px] border border-line object-cover"
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
        ) : (
          <video
            src={media.path}
            controls
            playsInline
            aria-label={alt}
            style={stageBox(ratio)}
            // The placeholder's recessed fill, so the result reads as that
            // box filled in, and a video whose own shape differs letterboxes
            // into a neutral both themes carry.
            className={clsx(
              'max-w-full rounded-[12px] shadow-card bg-surface2',
              page ? 'phone:!w-full' : '!w-full'
            )}
          />
        )}
      </div>
      <div className="flex items-center gap-[6px] text-[13px] font-[600] text-ink">
        <CheckmarkIcon aria-hidden="true" className="text-success" />
        {t('studio_saved_to_media', 'Saved to your Media library')}
      </div>
      <div className="text-[12px] text-muted line-clamp-2">{caption}</div>
      <div className="flex flex-wrap items-center justify-center gap-[10px]">
        {actions}
      </div>
      {/* A row of the strip's own height (52px thumbnails and their 8px
          padding) is always drawn, so the stage's room, and the picture
          sized from it, does not change when the second version lands. */}
      <div
        data-testid="versions-row"
        className="h-[68px] shrink-0 flex items-center justify-center"
      >
        {versions}
      </div>
      {below}
    </div>
  );
};

/**
 * A result's actions, chosen on the host rather than the destination
 * (contracts/workspace-parts.md §3): Download in every host; in a host that
 * accepts, a window or a tab, the accept button, Done when the result is for
 * the Media library and Use image or Use video when it goes to a post or a
 * reference row; on the Studio page, which accepts nothing, Create a post when
 * there is a channel to post it to (FR-007). A workflow's way back leads
 * (tasks D7).
 */
export const StageActions: FC<{
  media: { id: string; path: string };
  kind: 'image' | 'video';
  destination: MediaDestination;
  /**
   * The accept button's press, given only in a host that accepts: the tool's
   * own, which hands the result over and then calls the host's `onAccept`.
   */
  onAccept?: () => void;
  /** The Studio tool page's Create a post, only when there is a channel. */
  onCreatePost?: (media: { id: string; path: string }) => void;
  /** A workflow's way back to an earlier screen: Image Text Slides' Edit script. */
  back?: { label: string; onClick: () => void };
}> = ({ media, kind, destination, onAccept, onCreatePost, back }) => {
  const t = useT();
  return (
    <>
      {back && (
        <Button variant="secondary" size="large" onClick={back.onClick}>
          {back.label}
        </Button>
      )}
      {/* A tab, not this page, when the browser ignores `download` for a
          file on another origin: leaving the page would lose its versions. */}
      <a
        href={media.path}
        download
        target="_blank"
        rel="noreferrer"
        className={buttonClassName({ variant: 'secondary', size: 'large' })}
      >
        {t('workspace_download', 'Download')}
      </a>
      {onAccept ? (
        <Button size="large" onClick={onAccept}>
          {destination === 'media'
            ? t('done', 'Done')
            : kind === 'image'
            ? t('use_image', 'Use image')
            : t('use_video', 'Use video')}
        </Button>
      ) : (
        !!onCreatePost && (
          <Button size="large" onClick={() => onCreatePost(media)}>
            <PlusIcon />
            {t('studio_create_post', 'Create a post')}
          </Button>
        )
      )}
    </>
  );
};

/**
 * Every version made since the tool opened, in the order it was made, once
 * there is a second to go back to (FR-008). The one on screen has a border
 * and a check, so colour is not its only mark; the border is brandText, as
 * brand is only 3:1 on the dark panel. The ring is left to keyboard focus.
 * The padding is room for the ring and the check, and the scroll padding
 * keeps it when a version is scrolled to an edge.
 */
export const VersionsStrip: FC<{
  versions: { path: string; kind: 'image' | 'video' }[];
  shown: number;
  onSelect: (index: number) => void;
}> = ({ versions, shown, onSelect }) => {
  const t = useT();
  // The version on screen is scrolled into the strip when it changes, as a
  // new one lands past an edge. Nearest, so one already in view moves
  // nothing; whether it glides is the stylesheet's call.
  const shownThumbnail = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    shownThumbnail.current?.scrollIntoView({
      block: 'nearest',
      inline: 'nearest',
    });
  }, [shown]);

  if (versions.length < 2) {
    return null;
  }

  return (
    <div
      role="group"
      aria-label={t('image_versions', 'Versions')}
      className="flex gap-[10px] max-w-full overflow-x-auto p-[8px] scroll-px-[8px] motion-safe:scroll-smooth"
    >
      {versions.map((entry, index) => {
        const thumbnail = clsx(
          'w-full h-full rounded-[8px] object-cover transition-colors',
          index === shown
            ? 'border-2 border-brandText'
            : 'border border-line group-hover:border-inkSoft'
        );
        return (
          <button
            // Versions are only ever added, so a place in the strip never
            // changes hands.
            key={index}
            ref={index === shown ? shownThumbnail : undefined}
            type="button"
            onClick={() => onSelect(index)}
            aria-pressed={index === shown}
            aria-label={t('image_version_n', 'Version {{n}}', { n: index + 1 })}
            className="group relative flex-none w-[52px] h-[52px] rounded-[8px] cursor-pointer focus-visible:ring-2 focus-visible:ring-brand"
          >
            {/* The button's name already says which version it is. */}
            {entry.kind === 'video' ? (
              <VideoFrame url={entry.path} className={thumbnail} />
            ) : (
              <img src={entry.path} alt="" className={thumbnail} />
            )}
            {index === shown && (
              <span
                aria-hidden="true"
                className="absolute -top-[5px] -end-[5px] w-[18px] h-[18px] rounded-full bg-brand text-white flex items-center justify-center ring-2 ring-panel"
              >
                <CheckmarkIcon width={10} height={7} />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};
