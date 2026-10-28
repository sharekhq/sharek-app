'use client';

import React, {
  ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Logo } from '@gitroom/frontend/components/new-layout/logo';
import { fontVariables } from '@gitroom/frontend/app/fonts';
import dynamic from 'next/dynamic';
const ModeComponent = dynamic(
  () => import('@gitroom/frontend/components/layout/mode.component'),
  {
    ssr: false,
  }
);

import clsx from 'clsx';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useVariables } from '@gitroom/react/helpers/variable.context';
import { useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import {
  useMediaQuery,
  MOBILE_QUERY,
} from '@gitroom/react/helpers/use.media.query';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { CheckPayment } from '@gitroom/frontend/components/layout/check.payment';
import { ToolTip } from '@gitroom/frontend/components/layout/top.tip';
import { ShowMediaBoxModal } from '@gitroom/frontend/components/media/media.component';
import { ShowLinkedinCompany } from '@gitroom/frontend/components/launches/helpers/linkedin.component';
import { MediaSettingsLayout } from '@gitroom/frontend/components/launches/helpers/media.settings.component';
import { Toaster } from '@gitroom/react/toaster/toaster';
import { ShowPostSelector } from '@gitroom/frontend/components/post-url-selector/post.url.selector';
import { Support } from '@gitroom/frontend/components/layout/support';
import { ContinueProvider } from '@gitroom/frontend/components/layout/continue.provider';
import { ContextWrapper } from '@gitroom/frontend/components/layout/user.context';
import { CopilotKit } from '@copilotkit/react-core';
import { MantineWrapper } from '@gitroom/react/helpers/mantine.wrapper';
import { Impersonate } from '@gitroom/frontend/components/layout/impersonate';
import { AnnouncementBanner } from '@gitroom/frontend/components/layout/announcement.banner';
import { Title } from '@gitroom/frontend/components/layout/title';
import { TopMenu } from '@gitroom/frontend/components/layout/top.menu';
import { LanguageComponent } from '@gitroom/frontend/components/layout/language.component';
import { ChromeExtensionComponent } from '@gitroom/frontend/components/layout/chrome.extension.component';
import NotificationComponent from '@gitroom/frontend/components/notifications/notification.component';
import { OrganizationSelector } from '@gitroom/frontend/components/layout/organization.selector';
import { StreakComponent } from '@gitroom/frontend/components/layout/streak.component';
import { PreConditionComponent } from '@gitroom/frontend/components/layout/pre-condition.component';
import { AttachToFeedbackIcon } from '@gitroom/frontend/components/new-layout/sentry.feedback.component';
import { FirstBillingComponent } from '@gitroom/frontend/components/billing/first.billing.component';
import { TrialTracker } from '@gitroom/frontend/components/layout/gtm.component';
import { PostHogIdentify } from '@gitroom/react/helpers/posthog';
import { setSentryUser } from '@gitroom/react/sentry/initialize.sentry.client';
import { setUserTimezone } from '@gitroom/frontend/components/layout/set.timezone';

export const LayoutComponent = ({ children }: { children: ReactNode }) => {
  const fetch = useFetch();

  const { backendUrl, billingEnabled, isGeneral, showUpstreamExtras } =
    useVariables();

  // Feedback icon component attaches Sentry feedback to a top-bar icon when DSN is present
  const searchParams = useSearchParams();
  const load = useCallback(async (path: string) => {
    return await (await fetch(path)).json();
  }, []);
  const { data: user, mutate } = useSWR('/user/self', load, {
    // set before anything renders a date in the user's timezone
    onSuccess: (data) => setUserTimezone(data?.timezoneName),
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    revalidateIfStale: false,
    refreshWhenOffline: false,
    refreshWhenHidden: false,
  });

  // Small-screen nav drawer (≤1025px): the icon rail is hidden on small
  // screens and revealed as an off-canvas drawer via the header hamburger. The
  // open state only drives small-screen styles, so it's visually inert on
  // desktop and needs no reset on resize — only the scroll lock below must be
  // released.
  const t = useT();
  const isSmallScreen = useMediaQuery(MOBILE_QUERY);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  // Escape and the scrim hand focus back to the button that opened the
  // drawer; an item tap navigates, so it only closes.
  const closeDrawer = useCallback(() => {
    setDrawerOpen(false);
    menuButtonRef.current?.focus();
  }, []);

  // Lock background scroll, close on Escape and move focus into the drawer
  // while it is open on small screens (≤1025px). Re-runs on resize so the
  // lock is released if the viewport grows.
  useEffect(() => {
    if (!drawerOpen || !isSmallScreen) return;
    (
      document.querySelector<HTMLElement>('#left-menu [aria-current="page"]') ??
      document.querySelector<HTMLElement>('#left-menu a, #left-menu button')
    )?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeDrawer();
    };
    document.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [drawerOpen, isSmallScreen, closeDrawer]);

  useEffect(() => {
    setSentryUser(
      user ? { id: user.id, email: user.email, orgId: user.orgId } : null
    );
  }, [user]);

  if (!user) return null;

  return (
    <ContextWrapper user={user}>
      <CopilotKit
        credentials="include"
        runtimeUrl={backendUrl + '/copilot/chat'}
        useSingleEndpoint={true}
        showDevConsole={false}
      >
        <MantineWrapper>
          <ToolTip />
          <Toaster />
          <TrialTracker />
          <PostHogIdentify />
          <CheckPayment check={searchParams.get('check') || ''} mutate={mutate}>
            <ShowMediaBoxModal />
            <ShowLinkedinCompany />
            <MediaSettingsLayout />
            <ShowPostSelector />
            <PreConditionComponent />
            <ContinueProvider />
            <div
              className={clsx(
                'flex flex-col min-h-screen mobile:min-h-dvh text-newTextColor py-[12px] pe-[12px] ps-[8px] mobile:py-[8px] mobile:pe-[8px]',
                fontVariables,
                'font-sans'
              )}
            >
              <div>{user?.admin ? <Impersonate /> : <div />}</div>
              {user.tier === 'FREE' && isGeneral && billingEnabled ? (
                <FirstBillingComponent />
              ) : (
                <>
                  <AnnouncementBanner />
                  <div className="flex-1 flex gap-[8px]">
                    <Support />
                    {/* Rail background card — reserves the 80px fixed-rail
                        column on desktop. On small screens the rail becomes
                        the off-canvas drawer below, so the reserve is dropped. */}
                    <div className="flex flex-col bg-newBgColor w-[84px] rounded-[12px] mobile:hidden" />
                    {drawerOpen && (
                      <div
                        className="hidden mobile:block fixed inset-0 z-[180] bg-black/50"
                        onClick={closeDrawer}
                        aria-hidden="true"
                      />
                    )}
                    <div
                      id="left-menu"
                      // Closed on a small screen it is off-screen: keep its
                      // items out of the Tab order and the accessibility tree.
                      inert={isSmallScreen && !drawerOpen}
                      className={clsx(
                        'fixed h-full w-[84px] start-[8px] flex flex-1 top-0',
                        // Small screens: off-canvas drawer anchored to the inline-start edge.
                        'mobile:start-0 mobile:w-[100px] mobile:px-[8px] mobile:z-[190] mobile:bg-newBgColor',
                        'mobile:transition-transform mobile:duration-300 mobile:ease-out motion-reduce:transition-none',
                        drawerOpen
                          ? 'mobile:translate-x-0'
                          : 'mobile:-translate-x-full mobile:rtl:translate-x-full',
                        user?.admin && 'pt-[60px] max-h-[1000px]:w-[500px]'
                      )}
                      onClick={() => setDrawerOpen(false)}
                    >
                      {/* min-w-0: without it, nowrap menu labels inflate this
                          flex-1 column past the 84px rail (min-width:auto),
                          so labels never overflow → ellipsis/shrink dead. */}
                      <div className="flex flex-col h-full gap-[32px] flex-1 py-[12px] min-w-0">
                        <div className="flex justify-center">
                          <Logo />
                        </div>
                        <TopMenu />
                      </div>
                    </div>
                    <div className="flex-1 bg-newBgLineColor rounded-[12px] overflow-hidden flex flex-col gap-[1px] blurMe">
                      {/* relative: the notifications popup spans this bar on small screens */}
                      <div className="relative flex bg-newBgColorInner h-[80px] mobile:h-[64px] px-[20px] mobile:px-[12px] mobile:gap-[12px] items-center">
                        <button
                          ref={menuButtonRef}
                          type="button"
                          onClick={() => setDrawerOpen(true)}
                          aria-label={t('open_menu', 'Open menu')}
                          aria-expanded={drawerOpen}
                          aria-controls="left-menu"
                          className="hidden mobile:flex -ms-[6px] h-[40px] w-[40px] coarse:h-[44px] coarse:w-[44px] shrink-0 items-center justify-center rounded-[10px] text-textItemBlur hover:text-newTextColor hover:bg-boxFocused transition-colors focus-visible:ring-2 focus-visible:ring-brand"
                        >
                          <svg
                            width="22"
                            height="22"
                            viewBox="0 0 24 24"
                            fill="none"
                            aria-hidden="true"
                          >
                            <path
                              d="M3 6h18M3 12h18M3 18h18"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                            />
                          </svg>
                        </button>
                        <div className="text-[24px] mobile:text-[18px] font-[600] flex flex-1 min-w-0">
                          <Title />
                        </div>
                        <div className="flex gap-[20px] mobile:gap-[14px] mobile:items-center text-textItemBlur">
                          <div className="phone:hidden">
                            <StreakComponent />
                          </div>
                          <div className="w-[1px] h-[20px] bg-blockSeparator phone:hidden" />
                          <OrganizationSelector />
                          <div className="hover:text-newTextColor">
                            <ModeComponent />
                          </div>
                          <div className="w-[1px] h-[20px] bg-blockSeparator" />
                          <LanguageComponent />
                          {showUpstreamExtras && (
                            <div className="mobile:hidden">
                              <ChromeExtensionComponent />
                            </div>
                          )}
                          <div className="w-[1px] h-[20px] bg-blockSeparator" />
                          <div className="mobile:hidden">
                            <AttachToFeedbackIcon />
                          </div>
                          <NotificationComponent />
                        </div>
                      </div>
                      <div className="flex flex-1 gap-[1px]">{children}</div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </CheckPayment>
        </MantineWrapper>
      </CopilotKit>
    </ContextWrapper>
  );
};
