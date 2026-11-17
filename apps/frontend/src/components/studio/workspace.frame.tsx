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
import { buttonClassName } from '@gitroom/react/form/button';
import { VideoFrame } from '@gitroom/react/helpers/video.frame';
import { CostNote } from '@gitroom/frontend/components/ui/cost.note';
import {
  CheckmarkIcon,
  ChevronDownIcon,
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
  /** Composer tab only: false while another tab is on screen. Default true. */
  active?: boolean;
  locked?: boolean;
  /** The Studio tool page's Create a post, only when the workspace has a channel. */
  onCreatePost?: (media: { id: string; path: string }) => void;
  /** Whether a render takes the composer's lock (FR-021a). Default `destination === 'post'`; Samy's AI Image passes false. */
  locksComposer?: boolean;
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
 * (`page`) the settings sit in a 360px panel on the start side, scrolling on
 * their own above the action bar, and the stage fills the rest. From 1025px
 * down the window scrolls and the bar sticks to the bottom of the screen; on a
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
  // padding to both edges and its foot.
  const bar = (
    <div
      className={clsx(
        'py-[16px] border-t border-line bg-surface flex flex-wrap items-center gap-[10px]',
        page
          ? '-mx-[20px] -mb-[20px] px-[20px] mobile:-mx-[16px] mobile:-mb-[16px] mobile:px-[16px] mobile:sticky mobile:bottom-0'
          : 'sticky bottom-0'
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
      <div className="flex h-full min-h-0 mobile:h-auto phone:flex-col">
        <div
          className={clsx(
            CARD_PADDING,
            'w-[360px] shrink-0 min-h-0 flex flex-col gap-[16px] border-e border-line phone:w-full phone:border-e-0'
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
            'flex-1 min-w-0 [container-type:size] flex flex-col items-center justify-center phone:order-first phone:flex-none phone:h-[clamp(240px,45dvh,440px)]'
          )}
        >
          {stage}
        </div>
      </div>
    );
  }

  return (
    <div className={clsx('flex-1 min-h-0', SETTINGS_SCROLL)}>
      <div className="flex-none h-[clamp(240px,45dvh,440px)] [container-type:size] flex flex-col items-center justify-center">
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

/** The credits left, in the action bar. */
export const CreditsPill: FC<{ count: number }> = ({ count }) => {
  const t = useT();
  return (
    <div className="bg-ai text-aiAccent rounded-full px-[12px] py-[4px] text-[12px] font-[600]">
      {t('credits_left_count', '{{count}} credits left', { count })}
    </div>
  );
};

// A stage part fills the stage; its picture takes what the words leave.
const STAGE_PART =
  'flex-1 min-h-0 self-stretch flex flex-col items-center gap-[16px] text-center';
// The room the picture fills: a size container of its own, so the words
// around it keep their height and the picture sizes to the rest.
const STAGE_ROOM =
  'flex-1 min-h-0 w-full [container-type:size] flex items-center justify-center';

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
  return (
    <div className={STAGE_PART}>
      <div className={STAGE_ROOM}>
        <div className="relative w-[min(100cqw,calc(100cqh*16/9),640px)] aspect-video overflow-hidden rounded-[12px] bg-surface2">
          {cover ? (
            <img
              src={cover}
              width="640"
              height="360"
              alt=""
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

/** The note under the wait and the info mark it leads with. */
const StageNote: FC<{ children: ReactNode }> = ({ children }) => (
  <div className="flex gap-[8px] items-start max-w-[420px] text-start text-[12px] text-muted">
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
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
    {children}
  </div>
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
                {state === 'done' && (
                  <svg
                    width="10"
                    height="10"
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
                )}
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
 */
export const StageResult: FC<{
  media: { path: string };
  kind: 'image' | 'video';
  ratio: number;
  alt: string;
  caption: ReactNode;
  actions: ReactNode;
  versions?: ReactNode;
  below?: ReactNode;
}> = ({ media, kind, ratio, alt, caption, actions, versions, below }) => {
  const t = useT();
  return (
    <div className={STAGE_PART}>
      <div className={STAGE_ROOM}>
        {kind === 'image' ? (
          <a
            href={media.path}
            target="_blank"
            rel="noreferrer"
            aria-label={t('open_image_full_size', 'Open the image full size')}
            style={stageBox(ratio)}
            className="group relative block max-w-full cursor-pointer rounded-[12px] focus-visible:ring-2 focus-visible:ring-brand"
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
            className="max-w-full rounded-[12px] shadow-card bg-surface2"
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
      {versions}
      {below}
    </div>
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
