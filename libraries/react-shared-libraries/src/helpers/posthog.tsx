'use client';

import posthog from 'posthog-js';
import { PostHogProvider } from 'posthog-js/react';
import { FC, ReactNode, useEffect } from 'react';
import { useUser } from '@gitroom/frontend/components/layout/user.context';
export const PHProvider: FC<{
  children: ReactNode;
  phkey?: string;
  host?: string;
}> = ({ children, phkey, host }) => {
  useEffect(() => {
    if (!phkey || !host) {
      return;
    }
    // The consent choice is the cookie sharek.app writes on .sharek.app; a
    // recorded decline turns capture and SDK storage off. No cookieless mode:
    // it would treat everyone who never saw that notice as opted out.
    posthog.init(phkey, {
      api_host: host,
      person_profiles: 'identified_only',
      capture_pageview: 'history_change',
      custom_campaign_params: ['ref'],
      opt_out_capturing_persistence_type: 'cookie',
      opt_out_persistence_by_default: true,
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
    if (
      !posthog.__loaded ||
      posthog.has_opted_out_capturing() ||
      !user?.id ||
      user.impersonate
    ) {
      return;
    }
    posthog.identify(user.id, { email: user.email, name: user.name });
  }, [user?.id, user?.email, user?.name, user?.impersonate]);
  return null;
};

// reset() also deletes the consent cookie sharek.app wrote, so a choice the
// visitor granted is written back; a visitor who declined is left untouched.
export const resetAnalyticsIdentity = () => {
  if (!posthog.__loaded || posthog.has_opted_out_capturing()) {
    return;
  }
  const granted = posthog.get_explicit_consent_status() === 'granted';
  posthog.reset();
  if (granted) {
    posthog.opt_in_capturing({ captureEventName: false });
  }
};
