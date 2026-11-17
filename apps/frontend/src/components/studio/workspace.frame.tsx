'use client';

import { FC, ReactNode, useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { buttonClassName } from '@gitroom/react/form/button';
import { CostNote } from '@gitroom/frontend/components/ui/cost.note';
import { ChevronDownIcon } from '@gitroom/frontend/components/ui/icons';
import { CARD_PADDING } from '@gitroom/frontend/components/ui/page.scroll';

export type WorkspaceLayout = 'page' | 'stacked';

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
 * their own above the action bar, and the stage fills the rest; on a phone the
 * page stacks, the stage first and the bar pinned to the bottom of the screen.
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
          ? '-mx-[20px] -mb-[20px] px-[20px] mobile:-mx-[16px] mobile:-mb-[16px] mobile:px-[16px] phone:sticky phone:bottom-0'
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
