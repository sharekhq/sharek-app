'use client';
import * as Sentry from '@sentry/nextjs';
import NextError from 'next/error';
import { useEffect } from 'react';
import { useVariables } from '@gitroom/react/helpers/variable.context';

/**
 * The one root layout that does NOT resolve a document frame, deliberately.
 *
 * Next requires this to be a Client Component (it renders its own document element
 * when it replaces the root layout), so it cannot read cookies and cannot know the
 * user's language, direction or theme. It also renders no localized content —
 * `<NextError statusCode={0} />` plus a Sentry dialog whose labels are hardcoded
 * English below — so there is nothing for direction to lay out.
 *
 * This is why FR-010 reads "every root layout *that renders localized content*".
 * Do not reach for `resolveDocumentFrame` here; it needs cookie values this
 * component has no way to obtain.
 */
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  const { sentryDsn } = useVariables();

  useEffect(() => {
    if (!sentryDsn) {
      return;
    }
    const eventId = Sentry.captureException(error);
    Sentry.showReportDialog({
      eventId,
      title: 'Something broke!',
      subtitle: 'Please help us fix the issue by providing some details.',
      labelComments: 'What happened?',
      labelName: 'Your name',
      labelEmail: 'Your email',
      labelSubmit: 'Send Report',
      lang: 'en',
    });

  }, [error]);
  return (
    <html>
      <body>
        <NextError statusCode={0} />
      </body>
    </html>
  );
}
