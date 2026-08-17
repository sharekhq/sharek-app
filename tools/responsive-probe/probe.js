// Responsive probe — runs inside the page, returns one reading for the current
// route and viewport. Driven by run.mjs; see that file for usage.
//
// Reports five things, in the order they cost a user:
//   1. the page's primary action is covered (nothing else matters if you can't act)
//   2. content CLIPPED away by an overflow:hidden ancestor — unreachable, because
//      there is no scrollbar to get to it
//   3. text printed over other text — every pixel on screen, and still unreadable
//   4. touch targets under the 44px WCAG 2.5.5 floor
//   5. the page scrolling sideways
//
// Note on (5): inside the app shell this can never fail — layout.component.tsx
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

  // The account precondition, observed rather than assumed — run.mjs gates a
  // run on it. `Select Customer` renders only when the account's integrations
  // span more than one customer grouping, and that one control is what decides
  // whether the tablet failure reproduces at all.
  //
  // Match the tooltip attribute, not the visible text: the text becomes the
  // customer's own name once one is selected (select.customer.tsx:81), while
  // the tooltip is set unconditionally from a translation key (:64) and never
  // carries account data. Localised, like the patterns above.
  const CUSTOMER_CONTROL = /select customer|اختر العميل/i;

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

  const customerControlPresent = [...document.querySelectorAll('[data-tooltip-content]')].some(
    (el) => CUSTOMER_CONTROL.test(el.getAttribute('data-tooltip-content') || '') && !hidden(el)
  );

  // Which build was measured. The channels rail prints NEXT_PUBLIC_VERSION into
  // a div of its own (launches.component.tsx:582-586), and a real build stamps
  // that with the commit SHA. Only leaves are scanned, so the token is read
  // once from the element that holds nothing else rather than from every
  // ancestor that contains it. Absent — a local build, or a page without the
  // rail — is reported as absent, never guessed.
  const build = (() => {
    for (const el of document.querySelectorAll('div')) {
      if (el.children.length) continue;
      const match = (el.textContent || '').match(/\b[0-9a-f]{40}\b/);
      if (match) return match[0];
    }
    return null;
  })();

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

  // ---- 3. colliding content ----
  // Clipping catches content cut off by an ancestor. This catches the other way
  // a squeezed layout fails: everything is on screen, reachable, and two runs of
  // text are printed over one another.
  //
  // Candidates are the elements that render a run of text themselves, not the
  // boxes containing them — a collision is a property of rendered text. That is
  // also what makes the pairing affordable: /launches carries ~2,000 elements
  // and pairing them all is two million tests per reading, while the ones that
  // print something are a fraction of that.
  //
  // Pairs are formed by sweeping down the page. Sorted by top edge, each element
  // is compared only against those starting before it ends, so elements sharing
  // no vertical band are never compared at all.
  //
  // Nesting is excluded here rather than downstream, because an element
  // overlapping its own ancestor is not a finding in any layout. Everything
  // else is: two labels in adjacent grid cells are cousins, not siblings, and
  // they are exactly what this exists to catch.
  //
  // Geometry only. Which of these pairs is a squeeze and which is the design is
  // FR-012, and it is decided — and tested — in reading.mjs.
  const ownText = (el) =>
    [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());

  // Tested on the participants, never on their ancestors: the calendar's day
  // labels are static inside cells that are `sticky top-0 z-[20]`, so a rule
  // that walked up would discard the finding it exists to make.
  const inFlow = (el) => {
    const cs = getComputedStyle(el);
    if (cs.position !== 'static' || cs.transform !== 'none') return false;
    return !['marginTop', 'marginRight', 'marginBottom', 'marginLeft'].some(
      (m) => parseFloat(cs[m]) < 0
    );
  };

  // The box as the user can actually see it: the element's own rect, cut down
  // by every ancestor that clips overflow away.
  //
  // A layout rect is not what is on screen. A collapsed accordion is the plain
  // case — `max-h-[0] overflow-hidden` on the wrapper, while the answer inside
  // still measures its full natural height and sits exactly where it would have
  // been. Pairing raw rects reports the billing FAQ as three overlaps at every
  // width, including the widths where the page is perfectly fine, and none of it
  // is on screen. Text nobody can see cannot collide with anything.
  //
  // Only `hidden` and `clip` count, the same two `clipper()` treats as real
  // clipping. An `overflow-auto` ancestor is not one: its content is reachable
  // by scrolling and is drawn, which is exactly the calendar grid the day-label
  // collision lives inside.
  const visibleRect = (el) => {
    const r = el.getBoundingClientRect();
    const box = { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
    for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
      const cs = getComputedStyle(n);
      const clipsX = cs.overflowX === 'hidden' || cs.overflowX === 'clip';
      const clipsY = cs.overflowY === 'hidden' || cs.overflowY === 'clip';
      if (!clipsX && !clipsY) continue;
      const nr = n.getBoundingClientRect();
      if (clipsX) {
        box.left = Math.max(box.left, nr.left);
        box.right = Math.min(box.right, nr.right);
      }
      if (clipsY) {
        box.top = Math.max(box.top, nr.top);
        box.bottom = Math.min(box.bottom, nr.bottom);
      }
    }
    box.width = box.right - box.left;
    box.height = box.bottom - box.top;
    return box;
  };

  const texts = [];
  for (const el of document.querySelectorAll('body *')) {
    if (!ownText(el)) continue;
    const r = visibleRect(el);
    if (r.width < 8 || r.height < 8) continue;
    if (outsideViewport(r) || hidden(el)) continue;
    texts.push({ el, r, flow: inFlow(el) });
  }
  texts.sort((a, b) => a.r.top - b.r.top);

  const box = (t) => ({
    tag: t.el.tagName.toLowerCase(),
    cls: cls(t.el, 90),
    w: Math.round(t.r.width),
    h: Math.round(t.r.height),
  });

  const collisionCandidates = [];
  for (let i = 0; i < texts.length; i++) {
    const a = texts[i];
    // Sorted by top, so `b.top < a.bottom` is the vertical intersection and the
    // end of the sweep in one condition: past it, nothing else can reach back up.
    for (let j = i + 1; j < texts.length && texts[j].r.top < a.r.bottom; j++) {
      const b = texts[j];
      if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
      const overlap = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
      if (overlap <= 0) continue;
      collisionCandidates.push({
        overlapPx: Math.round(overlap),
        a: box(a),
        b: box(b),
        aFlow: a.flow,
        bFlow: b.flow,
      });
    }
  }

  // ---- 4. touch targets ----
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
    // The two halves of the account precondition. `pageRendered` anchors it:
    // a missing customer control means nothing if the page never loaded, so a
    // route with no ROUTE_CTA entry cannot answer the question and says so by
    // reporting false — only a route with an anchor pattern is worth a
    // pre-flight, and run.mjs runs it on /launches.
    precondition: { customerControlPresent, pageRendered: !!cta && cta.verdict !== 'NOT FOUND' },
    build,
    sidewaysScrollPx: Math.max(0, document.documentElement.scrollWidth - vw),
    clippedCount: clipped.length,
    worstCutPx: clipped.length ? Math.max(...clipped.map((c) => c.lostPx)) : 0,
    clipped: clipped.sort((a, b) => b.lostPx - a.lostPx).slice(0, 6),
    // Raw — run.mjs decides these into collisionCount / worstOverlapPx /
    // collisions and drops the candidates. They never reach a stored reading.
    collisionCandidates,
    touch: { total, under44: small, pct: total ? Math.round((small / total) * 100) : 0 },
    smallest: smallest.sort((a, b) => a.h * a.w - b.h * b.w).slice(0, 4),
  };
})();
