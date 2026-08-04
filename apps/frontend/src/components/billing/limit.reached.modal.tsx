'use client';

import { FC } from 'react';
import { capitalize } from 'lodash';
import i18next from 'i18next';
import { Button } from '@gitroom/react/form/button';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useUser } from '@gitroom/frontend/components/layout/user.context';
import {
  showModalEmitter,
  useModals,
} from '@gitroom/frontend/components/layout/new-modal';
import {
  formatResetDate,
  limitCopyFor,
  limitSectionFor,
  nextTierFor,
  viewerCanBuy,
} from '@gitroom/frontend/components/billing/limit.sections';

/** Exactly the fields taken from the 402 body; everything else is resolved here. */
export interface LimitModalInput {
  section?: string;
  message?: string;
  resetsAt?: string;
}

const RING = 'focus-visible:ring-2 focus-visible:ring-brand';

/**
 * A spent meter: a muted outer dial with the sweep filled to the end in brand.
 * Decorative — it carries nothing the sentences below it do not say — and
 * mirrored under RTL so the needle still travels toward the end of the reading
 * direction.
 */
const LimitGauge: FC<{ spark?: boolean }> = ({ spark }) => (
  <svg
    width="128"
    height="88"
    viewBox="0 0 128 88"
    fill="none"
    className="text-muted rtl:-scale-x-100"
    role="presentation"
    aria-hidden="true"
  >
    <path
      d="M16 72 A48 48 0 0 1 112 72"
      stroke="currentColor"
      strokeWidth="2"
      opacity="0.45"
      strokeLinecap="round"
    />
    <path
      d="M28 72 A36 36 0 0 1 100 72"
      className="text-brand"
      stroke="currentColor"
      strokeWidth="6"
      strokeLinecap="round"
    />
    <line
      x1="64"
      y1="72"
      x2="98"
      y2="54"
      className="text-brand"
      stroke="currentColor"
      strokeWidth="4"
      strokeLinecap="round"
    />
    <circle cx="64" cy="72" r="6" className="text-brand" fill="currentColor" />
    <line
      x1="40"
      y1="80"
      x2="88"
      y2="80"
      stroke="currentColor"
      strokeWidth="2"
      opacity="0.45"
      strokeLinecap="round"
    />
    {spark && (
      <path
        d="M100 20 L103 28 L111 31 L103 34 L100 42 L97 34 L89 31 L97 28 Z"
        className="text-brand"
        fill="currentColor"
        opacity="0.9"
      />
    )}
  </svg>
);

const UpgradeIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path
      d="M3 8h10M9 4l4 4-4 4"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/**
 * The one card every plan limit raises. It reads its entry out of
 * `LIMIT_SECTIONS` and renders it — which section was hit never reaches this
 * component as a branch, so a new section is a table entry and nothing else.
 */
export const LimitReachedModal: FC<LimitModalInput> = ({
  section,
  message,
  resetsAt,
}) => {
  const t = useT();
  const user = useUser();
  const { closeCurrent } = useModals();

  const entry = limitSectionFor(section);
  const copy = limitCopyFor(entry, user?.tier);
  const canBuy = viewerCanBuy(user?.role);
  const nextTier = canBuy ? nextTierFor(section, user?.tier) : null;

  const plan = user?.tier?.current ? capitalize(user.tier.current) : '';
  // A figure of 0 was replaced by the zero copy, which names no number — so
  // passing it would only send i18next looking for a plural form that no
  // sentence here has.
  const options = { plan, ...(copy.count ? { count: copy.count } : {}) };

  // A pool with nothing in it has nothing to reset, which is also the shape the
  // zero copy takes — so the two sentences can never contradict each other.
  const reset =
    entry.shape === 'allowance' && !!copy.count
      ? resetsAt
        ? t(entry.reset.dated.key, entry.reset.dated.defaultValue, {
            date: formatResetDate(resetsAt, i18next.resolvedLanguage || 'en'),
          })
        : t(entry.reset.generic.key, entry.reset.generic.defaultValue)
      : null;

  const upgrade = () => {
    // A new tab, so whatever the customer was in the middle of survives.
    window.open('/billing', '_blank');
    closeCurrent();
  };

  return (
    <div className="flex flex-col items-center text-center">
      <button
        type="button"
        onClick={closeCurrent}
        aria-label={t('close', 'Close')}
        className={`absolute end-[20px] top-[20px] flex h-[28px] w-[28px] items-center justify-center rounded-[8px] text-muted transition-colors hover:bg-quiet hover:text-ink ${RING}`}
      >
        <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
          <path
            d="M11.7816 4.03157C12.0062 3.80702 12.0062 3.44295 11.7816 3.2184C11.5571 2.99385 11.193 2.99385 10.9685 3.2184L7.50005 6.68682L4.03164 3.2184C3.80708 2.99385 3.44301 2.99385 3.21846 3.2184C2.99391 3.44295 2.99391 3.80702 3.21846 4.03157L6.68688 7.49999L3.21846 10.9684C2.99391 11.193 2.99391 11.557 3.21846 11.7816C3.44301 12.0061 3.80708 12.0061 4.03164 11.7816L7.50005 8.31316L10.9685 11.7816C11.193 12.0061 11.5571 12.0061 11.7816 11.7816C12.0062 11.557 12.0062 11.193 11.7816 10.9684L8.31322 7.49999L11.7816 4.03157Z"
            fill="currentColor"
            fillRule="evenodd"
            clipRule="evenodd"
          />
        </svg>
      </button>

      <LimitGauge spark={entry.spark} />

      <h2 className="mt-[20px] text-balance text-[20px] font-[600] leading-[1.3] text-ink">
        {t(copy.title.key, copy.title.defaultValue, options)}
      </h2>

      <p className="mt-[8px] text-pretty text-[14px] leading-[1.6] text-inkSoft">
        {/* The 402's own message is more specific than the generic line, so it
            speaks whenever the table had nothing to say about this section. */}
        {copy.generic && message
          ? message
          : t(copy.body.key, copy.body.defaultValue, options)}
      </p>

      {reset && (
        <p className="mt-[4px] text-[14px] leading-[1.6] text-muted">{reset}</p>
      )}

      {nextTier && (
        <div className="mt-[24px] w-full border-t border-line pt-[20px] text-start">
          <div className="text-[13px] font-[600] text-muted">
            {t('limit_next_up', 'With {{plan}} you get', {
              plan: capitalize(nextTier.plan.current),
            })}
          </div>
          <ul className="mt-[10px] flex flex-col gap-[8px]">
            {nextTier.rows.map((row) => (
              <li
                key={row.key}
                className="flex items-center gap-[10px] text-[14px] text-ink"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  fill="none"
                  className="flex-none text-brand"
                  aria-hidden="true"
                >
                  <path
                    d="M3.5 8.5l3 3 6-6"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                {t(row.key, row.defaultValue, row)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Billing is hidden from a member's nav and its routes refuse them, so
          the only honest thing to offer is who to ask (FR-009a). */}
      {!canBuy && (
        <p className="mt-[16px] text-[14px] leading-[1.6] text-muted">
          {t(
            'limit_ask_owner',
            'Ask an account owner or admin to upgrade your plan.'
          )}
        </p>
      )}

      <div className="mt-[24px] flex items-center justify-center gap-[10px]">
        {canBuy && nextTier ? (
          <>
            <Button
              onClick={upgrade}
              className={RING}
              innerClassName="gap-[8px]"
            >
              {t('limit_upgrade', 'Upgrade plan')}
              <span className="rtl:rotate-180">
                <UpgradeIcon />
              </span>
            </Button>
            <Button variant="ghost" onClick={closeCurrent} className={RING}>
              {t('limit_not_now', 'Not now')}
            </Button>
          </>
        ) : (
          <Button variant="ghost" onClick={closeCurrent} className={RING}>
            {t('limit_got_it', 'Got it')}
          </Button>
        )}
      </div>
    </div>
  );
};

/**
 * Opened from the global 402 handler, which is not a component. The id is fixed
 * so two refusals landing together raise one card rather than stacking two —
 * `useModalStore` already drops an open whose id is present.
 */
export const showLimitReachedModal = (input: LimitModalInput) => {
  showModalEmitter({
    id: 'limit-reached',
    size: 460,
    // The card carries its own close control, which the shared one cannot: the
    // global stylesheet kills focus outlines and that button declares none.
    withCloseButton: false,
    children: <LimitReachedModal {...input} />,
  });
};
