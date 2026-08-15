// Responsive probe — runs inside the page, returns one reading for the current
// route and viewport. Driven by run.mjs; see that file for usage.
//
// Reports four things, in the order they cost a user:
//   1. the page's primary action is covered (nothing else matters if you can't act)
//   2. content CLIPPED away by an overflow:hidden ancestor — unreachable, because
//      there is no scrollbar to get to it
//   3. touch targets under the 44px WCAG 2.5.5 floor
//   4. the page scrolling sideways
//
// Note on (4): inside the app shell this can never fail — layout.component.tsx
// wraps page content in overflow-hidden, so no document scrollbar can appear.
// It is recorded because it does fire for portalled surfaces (the compose modal
// renders through createPortal, outside that frame). Do not gate a build on it.
(() => {
  const vw = window.innerWidth;

  // Each route's primary action, as a pattern matched against a control's text.
  // Only routes with a single unambiguous primary action belong here — a route
  // with no entry simply is not hit-tested, which is the honest reading for a
  // page like /analytics or /settings that has no one thing you came to do.
  // Add a route here to extend coverage. Patterns are localised because the app
  // runs in English and Arabic.
  const ROUTE_CTA = [
    [/^\/launches/, /create post|إنشاء منشور/i],
    [/^\/media/, /upload|رفع/i],
  ];

  // A closed off-canvas drawer is meant to sit outside the viewport, so it is
  // not a bug. Detect that by geometry (the box is wholly outside) rather than
  // by "has a transform", which also catches centring, RTL arrow rotation and
  // hover scale, and silently hides real findings.
  const outsideViewport = (r) => r.right <= 0 || r.left >= vw;

  const hidden = (el) => {
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.visibility === 'hidden' || cs.display === 'none' || cs.opacity === '0') return true;
      if (n.getAttribute && n.getAttribute('aria-hidden') === 'true') return true;
    }
    return false;
  };

  // Nearest ancestor that clips horizontal overflow without offering a scrollbar.
  const clipper = (el) => {
    for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.overflowX === 'hidden' || cs.overflowX === 'clip') return n;
      if (cs.overflowX === 'auto' || cs.overflowX === 'scroll') return null;
    }
    return null;
  };

  const cls = (el, n) =>
    (typeof el.className === 'string' ? el.className : '').replace(/\s+/g, ' ').trim().slice(0, n);

  // ---- 1. primary action reachable? ----
  const pattern = (ROUTE_CTA.find(([route]) => route.test(location.pathname)) || [])[1];
  let cta = null;
  if (pattern) {
    const matches = [...document.querySelectorAll('button, a[href], [role="button"], .cursor-pointer')]
      .filter((b) => pattern.test(b.textContent || '') && !hidden(b));
    // A match sitting outside the viewport is inside a closed drawer, which is
    // by design on a phone — the user opens the drawer to reach it. Only fail
    // on a control that is supposed to be on screen and cannot be clicked.
    const control = matches.find((b) => !outsideViewport(b.getBoundingClientRect()));
    if (!control) {
      cta = { verdict: matches.length ? 'behind-drawer' : 'NOT FOUND' };
    } else {
      const r = control.getBoundingClientRect();
      const cx = Math.round(r.left + r.width / 2);
      const cy = Math.round(r.top + r.height / 2);
      const at = document.elementFromPoint(cx, cy);
      cta = {
        verdict: at && (at === control || control.contains(at)) ? 'clickable' : 'COVERED',
        w: Math.round(r.width),
        h: Math.round(r.height),
        coveredBy: at && !(at === control || control.contains(at)) ? cls(at, 90) : undefined,
      };
    }
  }

  // ---- 2. clipped content ----
  const clipped = [];
  const seen = new Set();
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) continue;
    if (outsideViewport(r) || hidden(el)) continue;
    const c = clipper(el);
    if (!c) continue;
    const cr = c.getBoundingClientRect();
    const lost = Math.round(Math.max(r.right - cr.right, cr.left - r.left));
    if (lost <= 8) continue;
    const key = el.tagName + cls(el, 90);
    if (seen.has(key)) continue;
    seen.add(key);
    clipped.push({ lostPx: lost, w: Math.round(r.width), tag: el.tagName.toLowerCase(), cls: cls(el, 90) });
  }

  // ---- 3. touch targets ----
  let small = 0;
  let total = 0;
  const smallest = [];
  for (const el of document.querySelectorAll(
    'button, a[href], input, select, textarea, [role="button"], .cursor-pointer'
  )) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0 || outsideViewport(r) || hidden(el)) continue;
    total++;
    if (r.height < 44 || r.width < 44) {
      small++;
      smallest.push({ h: Math.round(r.height), w: Math.round(r.width), text: (el.textContent || '').trim().slice(0, 24) });
    }
  }

  return {
    url: location.pathname,
    vw,
    cta,
    sidewaysScrollPx: Math.max(0, document.documentElement.scrollWidth - vw),
    clippedCount: clipped.length,
    worstCutPx: clipped.length ? Math.max(...clipped.map((c) => c.lostPx)) : 0,
    clipped: clipped.sort((a, b) => b.lostPx - a.lostPx).slice(0, 6),
    touch: { total, under44: small, pct: total ? Math.round((small / total) * 100) : 0 },
    smallest: smallest.sort((a, b) => a.h * a.w - b.h * b.w).slice(0, 4),
  };
})();
