'use client';

import posthog, { BeforeSendFn, Properties } from 'posthog-js';
import { PostHogProvider } from 'posthog-js/react';
import { FC, ReactNode, useEffect } from 'react';
import { getCookie } from 'react-use-cookie';
import { useUser } from '@gitroom/frontend/components/layout/user.context';

// Activation and password-reset links carry their token in the path, and a
// reset token stays usable for 20 minutes: no URL reaches PostHog with one.
const AUTH_TOKEN_IN_PATH = /(\/auth\/(?:activate|forgot)\/)[\w.-]+/g;

const maskAuthTokens = (properties: Properties) =>
  Object.fromEntries(
    Object.entries(properties).map(([key, value]) => [
      key,
      typeof value === 'string'
        ? value.replace(AUTH_TOKEN_IN_PATH, '$1<masked>')
        : value,
    ])
  );

const withoutAuthTokens: BeforeSendFn = (event) =>
  event && {
    ...event,
    properties: maskAuthTokens(event.properties),
    ...(event.$set && { $set: maskAuthTokens(event.$set) }),
    ...(event.$set_once && { $set_once: maskAuthTokens(event.$set_once) }),
  };

export const PHProvider: FC<{
  children: ReactNode;
  phkey?: string;
  host?: string;
}> = ({ children, phkey, host }) => {
  useEffect(() => {
    // sharek.app records the visitor's choice in this cookie on .sharek.app,
    // and a decline means no SDK at all: nothing captured, stored or fetched.
    // The app reads the cookie itself because the SDK never would: it picks
    // its consent storage at a first read made before this effect runs. No
    // cookieless mode either: it treats everyone who never saw the notice as
    // opted out.
    if (!phkey || !host || getCookie(`__ph_opt_in_out_${phkey}`) === '0') {
      return;
    }
    posthog.init(phkey, {
      api_host: host,
      person_profiles: 'identified_only',
      capture_pageview: 'history_change',
      custom_campaign_params: ['ref'],
      // Under its default name the SDK's own consent record is that shared
      // cookie, which it moves into localStorage and deletes, and deletes
      // again on reset(). A name of its own keeps it away from the cookie.
      consent_persistence_name: 'sharek_app_consent',
      before_send: withoutAuthTokens,
      // Replay is switched on for the whole project; nothing an account
      // wrote may be readable in a recording.
      session_recording: { maskAllInputs: true, maskTextSelector: '*' },
    });
  }, []);
  if (!phkey || !host) {
    return <>{children}</>;
  }
  return <PostHogProvider client={posthog}>{children}</PostHogProvider>;
};

export const PostHogIdentify: FC = () => {
  const user = useUser();
  useEffect(() => {
    if (!posthog.__loaded || !user?.id || user.impersonate) {
      return;
    }
    posthog.identify(user.id, { email: user.email, name: user.name });
  }, [user?.id, user?.email, user?.name, user?.impersonate]);
  return null;
};

// The consent cookie sharek.app wrote is not the SDK's record, so a reset
// leaves the visitor's choice as it was.
export const resetAnalyticsIdentity = () => {
  if (!posthog.__loaded) {
    return;
  }
  posthog.reset();
};
