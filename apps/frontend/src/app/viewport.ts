import type { Viewport } from 'next';

/**
 * How the app sits inside device hardware, declared once and re-exported by each
 * of the three root layouts.
 *
 * One per root layout is required rather than optional: there is no
 * `app/layout.tsx`, so `(app)`, `(extension)` and `(provider)` each own a root,
 * and `export const viewport` is only honoured from a layout or page. A route
 * served by `(extension)` — the standalone compose route, the surface most likely
 * to sit against a device edge — gets nothing from a declaration in `(app)`.
 *
 * `viewportFit: 'cover'` is the whole point: without it `env(safe-area-inset-*)`
 * resolves to zero whatever CSS asks for. The width and scale reproduce Next's
 * own default exactly, because the app has no viewport meta today and that
 * default is what is in effect — this declaration must not change how the page
 * scales or zooms. In particular it sets neither `maximumScale` nor
 * `userScalable`, which would take pinch-zoom away.
 *
 * Nothing consumes the insets yet, deliberately. Declaring them is the change;
 * spending them is a visual change with its own review.
 */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};
