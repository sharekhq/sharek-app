'use client';

import React, { ReactNode, useCallback, useEffect, useState } from 'react';
import { Logo } from '@gitroom/frontend/components/new-layout/logo';
import { fontVariables } from '@gitroom/frontend/app/fonts';
const ModeComponent = dynamic(
  () => import('@gitroom/frontend/components/layout/mode.component'),
  {
    ssr: false,
  }
);

import clsx from 'clsx';
import dynamic from 'next/dynamic';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useVariables } from '@gitroom/react/helpers/variable.context';
import { useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import { useMediaQuery } from '@gitroom/react/helpers/use.media.query';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { CheckPayment } from '@gitroom/frontend/components/layout/check.payment';
import { ToolTip } from '@gitroom/frontend/components/layout/top.tip';
import { ShowMediaBoxModal } from '@gitroom/frontend/components/media/media.component';
import { ShowLinkedinCompany } from '@gitroom/frontend/components/launches/helpers/linkedin.component';
import { MediaSettingsLayout } from '@gitroom/frontend/components/launches/helpers/media.settings.component';
import { Toaster } from '@gitroom/react/toaster/toaster';
import { ShowPostSelector } from '@gitroom/frontend/components/post-url-selector/post.url.selector';
import { NewSubscription } from '@gitroom/frontend/components/layout/new.subscription';
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
import { setSentryUser } from '@gitroom/react/sentry/initialize.sentry.client';

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
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    revalidateIfStale: false,
    refreshWhenOffline: false,
    refreshWhenHidden: false,
  });

  // Phone nav drawer: the icon rail is hidden on phone and revealed as an
  // off-canvas drawer via the header hamburger. The open state only drives
  // phone-scoped styles, so it's visually inert on desktop and needs no reset
  // on resize — only the scroll lock below must be released.
  const t = useT();
  const isPhone = useMediaQuery('(max-width: 768px)');
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Lock background scroll and close on Escape while the drawer is open on
  // phone. Re-runs on resize so the lock is released if the viewport grows.
  useEffect(() => {
    if (!drawerOpen || !isPhone) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawerOpen(false);
    };
    document.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [drawerOpen, isPhone]);

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
        showDevConsole={false}
      >
        <MantineWrapper>
          <ToolTip />
          <Toaster />
          <TrialTracker />
          <CheckPayment check={searchParams.get('check') || ''} mutate={mutate}>
            <ShowMediaBoxModal />
            <ShowLinkedinCompany />
            <MediaSettingsLayout />
            <ShowPostSelector />
            <PreConditionComponent />
            <NewSubscription />
            <ContinueProvider />
            <div
              className={clsx(
                'flex flex-col min-h-screen min-w-screen text-newTextColor py-[12px] pe-[12px] ps-[8px]',
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
                        column on desktop. On phone the rail becomes the
                        off-canvas drawer below, so the reserve is dropped. */}
                    <div className="flex flex-col bg-newBgColor w-[84px] rounded-[12px] phone:hidden" />
                    {drawerOpen && (
                      <div
                        className="hidden phone:block fixed inset-0 z-[40] bg-black/50"
                        onClick={() => setDrawerOpen(false)}
                        aria-hidden="true"
                      />
                    )}
                    <div
                      id="left-menu"
                      className={clsx(
                        'fixed h-full w-[84px] start-[8px] flex flex-1 top-0',
                        // Phone: off-canvas drawer anchored to the inline-start edge.
                        'phone:start-0 phone:w-[84px] phone:z-[50] phone:bg-newBgColor',
                        'phone:transition-transform phone:duration-300 phone:ease-out motion-reduce:transition-none',
                        drawerOpen
                          ? 'phone:translate-x-0'
                          : 'phone:-translate-x-full phone:rtl:translate-x-full',
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
                      <div className="flex bg-newBgColorInner h-[80px] px-[20px] phone:px-[12px] items-center">
                        <button
                          type="button"
                          onClick={() => setDrawerOpen(true)}
                          aria-label={t('open_menu', 'Open menu')}
                          aria-expanded={drawerOpen}
                          aria-controls="left-menu"
                          className="hidden phone:flex me-[12px] -ms-[6px] h-[40px] w-[40px] shrink-0 items-center justify-center rounded-[10px] text-textItemBlur hover:text-newTextColor hover:bg-boxFocused transition-colors"
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
                        <div className="text-[24px] phone:text-[18px] font-[600] flex flex-1 min-w-0">
                          <Title />
                        </div>
                        <div className="flex gap-[20px] phone:gap-[14px] text-textItemBlur">
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
                            <div className="phone:hidden">
                              <ChromeExtensionComponent />
                            </div>
                          )}
                          <div className="w-[1px] h-[20px] bg-blockSeparator" />
                          <div className="phone:hidden">
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
