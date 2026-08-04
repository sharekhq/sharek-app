'use client';

import { ReactNode, useCallback, useEffect } from 'react';
import { MantineProvider } from '@mantine/core';
import { SWRConfig } from 'swr';
import { FetchWrapperComponent } from '@gitroom/helpers/utils/custom.fetch';
import { isAlreadyAnswered } from '@gitroom/helpers/utils/custom.fetch.func';
import { deleteDialog } from '@gitroom/react/helpers/delete.dialog';
import {
  LimitModalInput,
  showLimitReachedModal,
} from '@gitroom/frontend/components/billing/limit.reached.modal';
import { useReturnUrl } from '@gitroom/frontend/app/(app)/auth/return.url.component';
import { useVariables } from '@gitroom/react/helpers/variable.context';

// App-wide Mantine theme so every Mantine surface (date/time picker, the
// group autocomplete, the language list) uses the brand instead of Mantine's
// factory blue for selection/focus states. Shade 6 = --brand (#B92D43).
const brandRamp: [
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string
] = [
  '#FBE9EC',
  '#F5CDD4',
  '#EBA0AC',
  '#E17284',
  '#D94A61',
  '#CE3450',
  '#B92D43',
  '#A0263A',
  '#8E1F33',
  '#741826',
];
export default function LayoutContext(params: { children: ReactNode }) {
  if (params?.children) {
    // eslint-disable-next-line react/no-children-prop
    return <LayoutContextInner children={params.children} />;
  }
  return <></>;
}
export function setCookie(cname: string, cvalue: string, exdays: number) {
  if (typeof document === 'undefined') {
    return;
  }
  const d = new Date();
  d.setTime(d.getTime() + exdays * 24 * 60 * 60 * 1000);
  const expires = 'expires=' + d.toUTCString();
  document.cookie = cname + '=' + cvalue + ';' + expires + ';path=/';
}
function LayoutContextInner(params: { children: ReactNode }) {
  const returnUrl = useReturnUrl();
  const { backendUrl, isGeneral, isSecured } = useVariables();
  const afterRequest = useCallback(
    async (url: string, options: RequestInit, response: Response) => {
      if (
        typeof window !== 'undefined' &&
        (window.location.href.includes('/p/') ||
          window.location.pathname.startsWith('/provider/'))
      ) {
        return true;
      }
      const headerAuth =
        response?.headers?.get('auth') || response?.headers?.get('Auth');
      const showOrg =
        response?.headers?.get('showorg') || response?.headers?.get('Showorg');
      const impersonate =
        response?.headers?.get('impersonate') ||
        response?.headers?.get('Impersonate');
      const logout =
        response?.headers?.get('logout') || response?.headers?.get('Logout');
      if (headerAuth) {
        setCookie('auth', headerAuth, 365);
      }
      if (showOrg) {
        setCookie('showorg', showOrg, 365);
      }
      if (impersonate) {
        setCookie('impersonate', impersonate, 365);
      }
      if (logout && !isSecured) {
        setCookie('auth', '', -10);
        setCookie('showorg', '', -10);
        setCookie('impersonate', '', -10);
        window.location.href = '/';
        return true;
      }
      const reloadOrOnboarding =
        response?.headers?.get('reload') ||
        response?.headers?.get('onboarding');
      if (reloadOrOnboarding) {
        const getAndClear = returnUrl.getAndClear();
        if (getAndClear) {
          window.location.href = getAndClear;
          return true;
        }
      }
      if (response?.headers?.get('onboarding')) {
        window.location.href = isGeneral
          ? '/launches?onboarding=true'
          : '/analytics?onboarding=true';
        return true;
      }

      if (response?.headers?.get('reload')) {
        window.location.reload();
        return true;
      }

      if (response.status === 401 || response?.headers?.get('logout')) {
        if (!isSecured) {
          setCookie('auth', '', -10);
          setCookie('showorg', '', -10);
          setCookie('impersonate', '', -10);
        }
        window.location.href = '/';
      }
      if (response.status === 406) {
        if (
          await deleteDialog(
            'You are currently on trial, in order to use the feature you must finish the trial',
            'Finish the trial, charge me now',
            'Trial',

          )
        ) {
          window.open('/billing?finishTrial=true', '_blank');
          return false;
        }
        return false;
      }

      if (response.status === 402) {
        // Cloned, so the body is still readable if a caller does inspect it.
        // The modal owns the refusal from here, so nothing waits on the
        // customer — but the request must NOT resolve: most callers never
        // check a response and would announce a success the server refused.
        // Returning false rejects it with AlreadyAnsweredError instead.
        const body: LimitModalInput = await response
          .clone()
          .json()
          .catch(() => ({}));
        showLimitReachedModal({
          section: body?.section,
          message: body?.message,
          resetsAt: body?.resetsAt,
        });
        return false;
      }
      return true;
    },
    []
  );
  // A refusal the interceptor already answered stops its caller by rejecting,
  // and the many callers that never inspect a response have no catch to land
  // in. That is the intended outcome — they simply stop — but the browser
  // still reports it as an unhandled rejection, and Sentry would file every
  // limit refusal as an error. The modal is the user-facing half; this is the
  // console half.
  useEffect(() => {
    const swallow = (event: PromiseRejectionEvent) => {
      if (isAlreadyAnswered(event.reason)) {
        event.preventDefault();
      }
    };
    window.addEventListener('unhandledrejection', swallow);
    return () => window.removeEventListener('unhandledrejection', swallow);
  }, []);

  return (
    <FetchWrapperComponent baseUrl={backendUrl} afterRequest={afterRequest}>
      {/* A guarded GET behind SWR — the AI assistant's thread list, billing,
          teams — now rejects on a 402 instead of resolving, and SWR retries a
          rejected fetcher with backoff. Every retry is refused again, so it
          would raise the card once more each time the customer dismissed it.
          A refusal is not a transient failure; there is nothing to retry. */}
      <SWRConfig value={{ shouldRetryOnError: (err) => !isAlreadyAnswered(err) }}>
        <MantineProvider
          theme={{ colors: { brand: brandRamp }, primaryColor: 'brand' }}
        >
          {params?.children || <></>}
        </MantineProvider>
      </SWRConfig>
    </FetchWrapperComponent>
  );
}
