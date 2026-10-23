import * as Sentry from '@sentry/nextjs';
import { initializeSentryBasic } from '@gitroom/react/sentry/initialize.sentry.next.basic';

export const setSentryUser = (
  user?: { id: string; email?: string; orgId: string } | null
) => {
  try {
    if (user?.id) {
      Sentry.setUser({
        id: user.id,
        ...(user.email ? { email: user.email } : {}),
      });
      Sentry.setTag('organization.id', user.orgId);
    } else {
      Sentry.setUser(null);
      Sentry.setTag('organization.id', undefined);
    }
  } catch (err) {
    /* never let telemetry break the app */
  }
};

export const initializeSentryClient = (environment: string, dsn: string) => {
  // A remounted layout must not build a second replay integration, Sentry throws on it
  if (Sentry.getClient()) {
    return;
  }

  return initializeSentryBasic(environment, dsn, {
    integrations: [
      // Add default integrations back
      Sentry.browserTracingIntegration(),
      Sentry.browserProfilingIntegration(),
      // Session replay is off: no recording of the page, inputs or canvases.
      Sentry.feedbackIntegration({
        // Disable the injection of the default widget
        autoInject: false,
        showEmail: false,
      }),
    ],

    profilesSampleRate: environment === 'development' ? 1.0 : 0.60,
  });
};
