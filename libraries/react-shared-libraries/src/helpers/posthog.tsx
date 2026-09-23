'use client';

import posthog, { BeforeSendFn, Properties } from 'posthog-js';
import { PostHogProvider } from 'posthog-js/react';
import { FC, ReactNode, useEffect } from 'react';
import { getCookie } from 'react-use-cookie';
import { useUser } from '@gitroom/frontend/components/layout/user.context';

// Activation and password-reset links carry a JWT in the path, and
// ?loggedAuth= carries a session JWT. The API accepts any of them as a login,
// with no expiry, so none may reach PostHog.
const AUTH_TOKEN_IN_URL =
  /(\/auth\/(?:activate|forgot)\/|[?&]loggedAuth=)[\w.-]+/g;

const maskToken = (text: string) =>
  text.replace(AUTH_TOKEN_IN_URL, '$1<masked>');

// URLs sit at any depth: $web_vitals nests the page URL in each metric and in
// its PerformanceEntry objects, and $$heatmap keys its data by it. A class
// instance is masked as the toJSON() it is sent as. A recording's snapshots
// are left whole; they are large, and their page URLs go through
// maskCapturedNetworkRequestFn.
const maskAuthTokens = (value: unknown): unknown => {
  if (typeof value === 'string') {
    return maskToken(value);
  }
  if (Array.isArray(value)) {
    return value.map(maskAuthTokens);
  }
  if (!value || typeof value !== 'object') {
    return value;
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== null && prototype !== Object.prototype) {
    const { toJSON } = value as { toJSON?: () => unknown };
    return typeof toJSON === 'function'
      ? maskAuthTokens(toJSON.call(value))
      : value;
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      maskToken(key),
      key === '$snapshot_data' ? entry : maskAuthTokens(entry),
    ])
  );
};

const withoutAuthTokens: BeforeSendFn = (event) =>
  event && {
    ...event,
    properties: maskAuthTokens(event.properties) as Properties,
    ...(event.$set && { $set: maskAuthTokens(event.$set) as Properties }),
    ...(event.$set_once && {
      $set_once: maskAuthTokens(event.$set_once) as Properties,
    }),
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
      // wrote may be readable in a recording, nor any token in its URLs.
      session_recording: {
        maskAllInputs: true,
        maskTextSelector: '*',
        maskCapturedNetworkRequestFn: (request) => ({
          ...request,
          name: maskToken(request.name),
        }),
      },
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
