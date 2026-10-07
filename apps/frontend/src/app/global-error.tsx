'use client';
import * as Sentry from '@sentry/nextjs';
import NextError from 'next/error';
import { useEffect } from 'react';

/**
 * The one root layout that does NOT resolve a document frame, deliberately.
 *
 * Next requires this to be a Client Component (it renders its own document element
 * when it replaces the root layout), so it cannot read cookies and cannot know the
 * user's language, direction or theme. It also renders no localized content —
 * only `<NextError statusCode={0} />`; the error is captured and no report
 * dialog opens — so there is nothing for direction to lay out.
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
  useEffect(() => {
    // The variables context is not mounted here (this replaces the root
    // layout), so don't gate on its DSN. Without a client this is a no-op.
    Sentry.captureException(error);
  }, [error]);
  return (
    <html>
      <body>
        <NextError statusCode={0} />
      </body>
    </html>
  );
}
