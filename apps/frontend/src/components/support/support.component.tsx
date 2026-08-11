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
// that row is the page's own job: without this the page is sized by its own
// content and the grey shows beside it. That surface is already white, so the
// form sits straight on it — a white card here would be a card on a card.
const Page = ({ children }: { children: React.ReactNode }) => (
  <div className="bg-newBgColorInner flex-1 flex flex-col p-[20px]">
    {children}
  </div>
);

// Started at the same edge as the page title, the way every sibling page lays
// out; what fills the rest of the row is the aside rather than centring. The
// form keeps a measure it reads at, and the aside takes the width left over.
// The form track shrinks before the pair stacks, so two columns still fit a
// 1100px window; below 1025 they stack and the aside leads, because what it
// holds — where the reply lands, what the enquiry carries — is meant to be read
// before sending, not under the button.
const Columns = ({ children }: { children: React.ReactNode }) => (
  <div className="w-full max-w-[1068px] grid grid-cols-[minmax(0,680px)_minmax(280px,340px)] gap-[48px] items-start mobile:grid-cols-1 mobile:gap-[24px] mobile:max-w-[680px]">
    {children}
  </div>
);

// Both spans sit above the pair in either arrangement, so a failure is never
// announced below the aside that stacking put in front of the form.
const FULL_WIDTH = 'col-span-2 mobile:col-span-1 max-w-[680px]';

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
        {/* Same grid as the form, so the heading lands where "Get help" was
            rather than jumping across the row on submit. */}
        <Columns>
          <div className="flex flex-col gap-[16px] max-w-[560px]">
            <h2 className="text-[20px]">
              {t('support_sent_title', 'Your enquiry is with us')}
            </h2>
            <div className="text-muted">
              {t(
                'support_sent_body',
                'We have emailed you a confirmation. Reply to that email to add a screenshot or anything else that helps.'
              )}
            </div>
            {/* Four characters do not need the width of the column, and the
                number is quoted back to us, so it is set in the tabular face. */}
            <div className="self-start flex items-center gap-[10px] bg-panel rounded-[8px] py-[9px] px-[14px] text-[14px]">
              <span className="text-muted">
                {t('support_sent_reference', 'Ticket ID')}
              </span>
              <span dir="ltr" className="font-mono tabular-nums text-[15px]">
                #{ticketNumber}
              </span>
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
        </Columns>
      </Page>
    );
  }

  return (
    <Page>
      <Columns>
        {/* Paired with an icon so colour is never the only signal. */}
        {failed && (
          <div
            role="alert"
            className={clsx(
              FULL_WIDTH,
              'flex items-start gap-[10px] border border-line rounded-[8px] py-[12px] px-[14px] text-[14px] bg-[color-mix(in_srgb,var(--error)_8%,transparent)]'
            )}
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

        {/* The shell already titles the page — its h1 reads "Support" — so a
            heading here would name the same thing a second time. This line is
            the lede instead. */}
        <div className={clsx(FULL_WIDTH, 'text-muted')}>
          {t(
            'support_intro',
            'Tell us what happened and we will get back to you by email.'
          )}
        </div>

        <FormProvider {...form}>
          <form
            onSubmit={form.handleSubmit(submit)}
            className="flex flex-col gap-[24px] mobile:order-2"
          >
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
              {/* Paired with an icon so colour is never the only signal. The
                  line is held even when empty, the way the shared Input and
                  Textarea hold theirs: an error that appears on submit must not
                  push the button out from under the pointer. */}
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

            <div>
              <Button
                type="submit"
                className={FOCUS_RING}
                loading={form.formState.isSubmitting}
              >
                {t('support_submit', 'Send enquiry')}
              </Button>
            </div>
          </form>
        </FormProvider>

        {/* Neither half of this is something the sender types, and both are
            things they should see before they send: who the reply reaches, and
            what the enquiry carries that they never wrote. Beside the form they
            inform without crowding it, and the width they take is the width
            that was empty. */}
        <aside className="bg-panel rounded-[12px] p-[20px] flex flex-col gap-[18px] text-[14px] mobile:order-1">
          {/* The sender cannot change who this comes from, so it is shown: a
              reply landing at an unexpected address is the surprise this avoids. */}
          <div className="flex flex-col gap-[12px]">
            {/* Signup never writes a name, so for most accounts there is
                nothing to put here, and a label with a blank under it reads as
                a fault. The reply address below carries the identity. */}
            {!!user?.name && (
              <div>
                <div className="text-[12px] text-muted">
                  {t('support_identity_from', 'From')}
                </div>
                {user.name}
              </div>
            )}
            <div>
              <div className="text-[12px] text-muted">
                {t('support_identity_reply', 'Reply to')}
              </div>
              <div className="break-words">{user?.email}</div>
            </div>
            {!!organizationName && (
              <div>
                <div className="text-[12px] text-muted">
                  {t('support_identity_workspace', 'Workspace')}
                </div>
                <div className="break-words">{organizationName}</div>
              </div>
            )}
          </div>

          <div className="border-t border-line pt-[18px]">
            <div className="font-[600] mb-[10px]">
              {t('support_disclosure_summary', 'What we attach automatically')}
            </div>
            <ul className="flex flex-col gap-[8px] text-muted list-disc ps-[18px]">
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
            <div className="text-muted mt-[12px]">
              {t(
                'support_disclosure_never',
                'We never send your password, your channel credentials, or the content of your posts.'
              )}
            </div>
          </div>
        </aside>
      </Columns>
    </Page>
  );
};
