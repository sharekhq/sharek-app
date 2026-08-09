'use client';

import React, { useCallback, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import useSWR from 'swr';
import i18next from 'i18next';
import { FormProvider, useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import { object, string } from 'yup';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { Button } from '@gitroom/react/form/button';
import { Input } from '@gitroom/react/form/input';
import { Textarea } from '@gitroom/react/form/textarea';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useUser } from '@gitroom/frontend/components/layout/user.context';
import { SUPPORT_APP_VERSION_MAX } from '@gitroom/nestjs-libraries/dtos/support/create.support.ticket.dto';

const CATEGORIES = ['channels', 'billing', 'technical', 'other'] as const;

const MESSAGE_LIMIT = 2000;

const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand';

// The shell hands each page a flex row laid over the line colour, so covering
// that row is the page's own job: without this the card is sized by its content
// and the grey shows beside it. The inner cap keeps a single-column form at a
// measure it still reads at once the row is wider than the form needs.
const Page = ({ children }: { children: React.ReactNode }) => (
  <div className="bg-newBgColorInner flex-1 flex flex-col p-[20px]">
    <div className="w-full max-w-[720px]">{children}</div>
  </div>
);

const useOrganizations = () => {
  const fetch = useFetch();
  const load = useCallback(async () => {
    return (await fetch('/user/organizations')).json();
  }, []);

  return useSWR('organizations', load, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    revalidateIfStale: false,
  });
};

// Everything here is advisory: it is diagnostic text an agent reads, never
// something the server decides on (research R14).
const clientMetadata = () => {
  const referrer =
    typeof document !== 'undefined' && document.referrer
      ? new URL(document.referrer, window.location.origin)
      : undefined;

  return {
    locale: i18next.resolvedLanguage || 'en',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    appVersion: process.env.NEXT_PUBLIC_VERSION?.slice(
      0,
      SUPPORT_APP_VERSION_MAX
    ),
    userAgent: navigator.userAgent?.slice(0, 512),
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    fromPath:
      referrer && referrer.origin === window.location.origin
        ? referrer.pathname
        : undefined,
  };
};

export const SupportComponent = () => {
  const t = useT();
  const fetch = useFetch();
  const user = useUser();
  const { data: organizations } = useOrganizations();
  const [ticketNumber, setTicketNumber] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const chipRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const organizationName = useMemo(
    () =>
      (organizations as { id: string; name: string }[] | undefined)?.find(
        (organization) => organization.id === user?.orgId
      )?.name,
    [organizations, user?.orgId]
  );

  const categoryLabels: Record<(typeof CATEGORIES)[number], string> = {
    channels: t('support_category_channels', 'Channels & posting'),
    billing: t('support_category_billing', 'Billing & plans'),
    technical: t('support_category_technical', 'Something is broken'),
    other: t('support_category_other', 'Something else'),
  };

  const schema = useMemo(
    () =>
      object({
        // No default, so an untouched group is an error rather than a guess.
        category: string()
          .oneOf(
            CATEGORIES as unknown as string[],
            t('support_category_required', 'Choose what your enquiry is about')
          )
          .required(
            t('support_category_required', 'Choose what your enquiry is about')
          ),
        subject: string()
          .trim()
          .required(t('support_subject_required', 'Add a subject'))
          .max(200),
        message: string()
          .trim()
          .required(t('support_message_required', 'Describe what happened'))
          .max(MESSAGE_LIMIT),
      }),
    [t]
  );

  const form = useForm({
    resolver: yupResolver(schema),
    defaultValues: { category: '', subject: '', message: '' },
  });

  const category = form.watch('category');
  const message = form.watch('message') || '';
  const categoryError = form.formState.errors.category?.message;

  const chooseCategory = useCallback(
    (value: string) => () => {
      form.setValue('category', value, { shouldValidate: true });
    },
    [form]
  );

  // Arrow keys move within the group; the group itself stays one tab stop.
  const onChipKeyDown = useCallback(
    (index: number) => (event: React.KeyboardEvent<HTMLButtonElement>) => {
      // In Arabic the chips run right to left, so the horizontal pair mirrors
      // or the arrow moves the opposite way from the one that was pressed. Down
      // is "next" in either direction.
      const forward = document.dir === 'rtl' ? -1 : 1;
      const step =
        { ArrowRight: forward, ArrowDown: 1, ArrowLeft: -forward, ArrowUp: -1 }[
          event.key
        ] || 0;

      if (!step) {
        return;
      }

      event.preventDefault();
      const next = (index + step + CATEGORIES.length) % CATEGORIES.length;
      form.setValue('category', CATEGORIES[next], { shouldValidate: true });
      chipRefs.current[next]?.focus();
    },
    [form]
  );

  // The resolver's inferred type marks every field optional even though
  // validation has already guaranteed all three by the time this runs.
  const submit = useCallback(
    async (values: {
      category?: string;
      subject?: string;
      message?: string;
    }) => {
      setFailed(false);

      try {
        const response = await fetch('/support', {
          method: 'POST',
          body: JSON.stringify({ ...values, ...clientMetadata() }),
        });

        // A refusal, a help desk that could not be reached, and a request that
        // never left the browser are one situation to the sender: nothing was
        // sent, and there is another way to reach us. Nothing is cleared either
        // way (FR-014) — re-typing a paragraph of detail is how someone gives
        // up instead of asking again.
        if (!response.ok) {
          setFailed(true);
          return;
        }

        const { ticketNumber: reference } = await response.json();
        setTicketNumber(reference);
      } catch {
        setFailed(true);
      }
    },
    [fetch]
  );

  if (ticketNumber) {
    return (
      <Page>
        <div className="flex flex-col gap-[16px] bg-surface border-line border shadow-soft rounded-[8px] p-[24px]">
          <h2 className="text-[20px]">
            {t('support_sent_title', 'Your enquiry is with us')}
          </h2>
          <div className="text-muted">
            {t(
              'support_sent_body',
              'We have emailed you a confirmation. Reply to that email to add a screenshot or anything else that helps.'
            )}
          </div>
          <div className="bg-panel rounded-[8px] p-[16px]">
            <div className="text-[12px] text-muted">
              {t('support_sent_reference', 'Your reference')}
            </div>
            <div className="text-[20px]">#{ticketNumber}</div>
          </div>
          <div>
            <Button
              type="button"
              variant="quiet"
              className={FOCUS_RING}
              onClick={() => {
                form.reset();
                setTicketNumber(null);
              }}
            >
              {t('support_send_another', 'Send another enquiry')}
            </Button>
          </div>
        </div>
      </Page>
    );
  }

  return (
    <Page>
      <FormProvider {...form}>
        <form onSubmit={form.handleSubmit(submit)}>
          <div className="flex flex-col gap-[24px] bg-surface border-line border shadow-soft rounded-[8px] p-[24px]">
            {/* Paired with an icon so colour is never the only signal. */}
            {failed && (
              <div
                role="alert"
                className="flex items-start gap-[10px] border border-line rounded-[8px] py-[12px] px-[14px] text-[14px] bg-[color-mix(in_srgb,var(--error)_8%,transparent)]"
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  className="shrink-0 mt-[1px] text-error"
                >
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 8v5M12 16h.01" />
                </svg>
                <div>
                  <b className="block">
                    {t(
                      'support_failed_title',
                      "We couldn't send your enquiry."
                    )}
                  </b>
                  <span className="text-inkSoft">
                    {t(
                      'support_failed_body',
                      'Try again in a moment, or email support@sharek.app directly.'
                    )}
                  </span>
                </div>
              </div>
            )}

            <div className="flex flex-col gap-[4px]">
              <h2 className="text-[20px]">{t('support_title', 'Get help')}</h2>
              <div className="text-muted">
                {t(
                  'support_intro',
                  'Tell us what happened and we will get back to you by email.'
                )}
              </div>
            </div>

            {/* The sender cannot change who this comes from, so it is shown: a
              reply landing at an unexpected address is the surprise this avoids. */}
            <div className="bg-panel rounded-[8px] p-[16px] flex flex-col gap-[4px] text-[14px]">
              {/* Signup never writes a name, so for most accounts there is
                  nothing to put here, and a label with a blank after it reads
                  as a fault. The reply address below carries the identity. */}
              {!!user?.name && (
                <div>
                  <span className="text-muted">
                    {t('support_identity_from', 'From')}:{' '}
                  </span>
                  {user.name}
                </div>
              )}
              <div>
                <span className="text-muted">
                  {t('support_identity_reply', 'Reply to')}:{' '}
                </span>
                {user?.email}
              </div>
              {!!organizationName && (
                <div>
                  <span className="text-muted">
                    {t('support_identity_workspace', 'Workspace')}:{' '}
                  </span>
                  {organizationName}
                </div>
              )}
            </div>

            <div className="flex flex-col gap-[6px]">
              <div className="text-[14px]">
                {t('support_category_label', 'What is this about?')}
              </div>
              <div
                role="radiogroup"
                aria-label={t('support_category_label', 'What is this about?')}
                className="flex flex-wrap gap-[8px]"
              >
                {CATEGORIES.map((value, index) => (
                  <button
                    key={value}
                    ref={(element) => {
                      chipRefs.current[index] = element;
                    }}
                    type="button"
                    role="radio"
                    aria-checked={category === value}
                    tabIndex={
                      category
                        ? category === value
                          ? 0
                          : -1
                        : index === 0
                        ? 0
                        : -1
                    }
                    onClick={chooseCategory(value)}
                    onKeyDown={onChipKeyDown(index)}
                    className={clsx(
                      'h-[42px] px-[16px] rounded-[8px] border text-[14px]',
                      FOCUS_RING,
                      category === value
                        ? 'bg-brandSoft border-brand text-ink'
                        : 'bg-transparent border-line text-ink'
                    )}
                  >
                    {categoryLabels[value]}
                  </button>
                ))}
              </div>
              {/* Paired with an icon so colour is never the only signal. */}
              <div className="text-error text-[12px] flex items-center gap-[6px]">
                {categoryError ? (
                  <>
                    <span aria-hidden="true">⚠</span>
                    <span>{String(categoryError)}</span>
                  </>
                ) : (
                  <>&nbsp;</>
                )}
              </div>
            </div>

            <Input
              name="subject"
              label={t('support_subject_label', 'Subject')}
              placeholder={t(
                'support_subject_placeholder',
                'A short summary of the problem'
              )}
              maxLength={200}
              className={clsx(
                'focus-within:outline-none focus-within:ring-2 focus-within:ring-brand'
              )}
            />

            <Textarea
              name="message"
              label={t('support_message_label', 'What happened?')}
              placeholder={t(
                'support_message_placeholder',
                'Include what you expected, what happened instead, and when it started.'
              )}
              maxLength={MESSAGE_LIMIT}
              className={FOCUS_RING}
              counter={
                <span className="text-muted">
                  {message.length}/{MESSAGE_LIMIT}
                </span>
              }
            />

            {/* The enquiry carries things the sender never typed. Saying so is the
              difference between helpful and surprising; collapsed so it informs
              without crowding the form. */}
            <details className="bg-panel rounded-[8px] p-[16px] text-[14px]">
              <summary
                className={clsx('cursor-pointer text-muted', FOCUS_RING)}
              >
                {t(
                  'support_disclosure_summary',
                  'What we attach automatically'
                )}
              </summary>
              <ul className="mt-[12px] flex flex-col gap-[6px] text-muted list-disc ps-[20px]">
                <li>{t('support_disclosure_plan', 'Your plan and role')}</li>
                <li>
                  {t(
                    'support_disclosure_channels',
                    'Your connected channels and whether any need reconnecting'
                  )}
                </li>
                <li>
                  {t(
                    'support_disclosure_account',
                    'Your workspace name and how long the account has existed'
                  )}
                </li>
                <li>
                  {t(
                    'support_disclosure_browser',
                    'Your browser, screen size, timezone and app version'
                  )}
                </li>
              </ul>
              <div className="mt-[12px]">
                {t(
                  'support_disclosure_never',
                  'We never send your password, your channel credentials, or the content of your posts.'
                )}
              </div>
            </details>

            <div>
              <Button
                type="submit"
                className={FOCUS_RING}
                loading={form.formState.isSubmitting}
              >
                {t('support_submit', 'Send enquiry')}
              </Button>
            </div>
          </div>
        </form>
      </FormProvider>
    </Page>
  );
};
