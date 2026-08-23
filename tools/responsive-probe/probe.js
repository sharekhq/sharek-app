// Responsive probe — runs inside the page, returns one reading for the current
// route and viewport. Driven by run.mjs; see that file for usage.
//
// Reports six things, in the order they cost a user:
//   1. the page's primary action is covered (nothing else matters if you can't act)
//   2. content CLIPPED away by an overflow:hidden ancestor — unreachable, because
//      there is no scrollbar to get to it
//   3. text printed over other text — every pixel on screen, and still unreadable
//   4. touch targets under the 44px WCAG 2.5.5 floor
//   5. the page scrolling sideways
//   6. how wide an open modal's content is, against the frame it opened in
//
// Note on (5): inside the app shell this can never fail — layout.component.tsx
// wraps page content in overflow-hidden, so no document scrollbar can appear.
// It never fires for a modal either, and the sentence here used to say the
// opposite: the modal manager renders inline and pins `body, html` to
// overflow:hidden while any modal is open (new-modal.tsx:377), so an oversized
// modal pans inside its own root and the document stays put. Measured
// 2026-08-19 with compose at 390: content 809px wide, document scroll 0. That
// is precisely why (6) exists — this field cannot see a modal at all. Do not
// gate a build on it.
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

  // Is a box a single-line text field — one that suppresses wrapping and is one
  // line tall? Asked of a clipper, never of the thing it clips: an element
  // clipped by such a field is a value being truncated, and `lostPx` there
  // measures how long the string is rather than how much of it is unreachable.
  //
  // A fact and not a verdict. Whether it exempts anything is decided in
  // reading.mjs, where a test can reach it.
  //
  // `line-height: normal` computes to the keyword rather than to a number, so
  // the fallback is the font size by 1.5 — comfortably above every normal
  // line-height a browser produces, which keeps a genuine one-line box inside
  // the test and a two-line one out of it.
  const isField = (n) => {
    const cs = getComputedStyle(n);
    if (cs.whiteSpace !== 'nowrap' && cs.whiteSpace !== 'pre') return false;
    const declared = parseFloat(cs.lineHeight);
    const line = Number.isFinite(declared) ? declared : (parseFloat(cs.fontSize) || 16) * 1.5;
    return n.clientHeight <= Math.ceil(line) + 1;
  };

  // How much of an overhang the layout deliberately pays for: the negative
  // margins between a box and its clipper, on the side the overhang is on.
  //
  // A box pulled back by exactly as much as it sticks out is a compensation,
  // not lost content — `(extension)/modal/[style]/[platform]/page.tsx:13` is
  // `w-[calc(100vw+80px)] -m-[40px]` so that compose's own padding is cancelled
  // and the modal fills the frame. Summed rather than maximised, and walked up
  // to the clipper rather than read off the element alone: the second box that
  // surface reports carries no margin of its own and inherits the overhang from
  // the ancestor that does.
  const compensation = (el, stop, side) => {
    const prop = side === 'left' ? 'marginLeft' : 'marginRight';
    let px = 0;
    for (let n = el; n && n !== stop && n !== document.body; n = n.parentElement) {
      const m = parseFloat(getComputedStyle(n)[prop]) || 0;
      if (m < 0) px -= m;
    }
    return Math.round(px);
  };

  // The attribute, not the property. `el.className` is a string on HTML
  // elements and an `SVGAnimatedString` on SVG ones, so the old `typeof` guard
  // returned '' for every svg on the page — and since the signature is
  // tag + cls, every cursor-pointer svg collapsed into a single classless `svg`
  // row and its class never reached the report. `getAttribute` answers the same
  // question for both, and returns null rather than '' when the attribute is
  // absent, which is what the fallback is for.
  const cls = (el, n) => (el.getAttribute('class') || '').replace(/\s+/g, ' ').trim().slice(0, n);

  // ---- 0. is a modal open? ----
  //
  // Found by the signature the modal manager writes rather than by any one
  // modal's classes: every modal is rendered as a fixed element at z-index
  // 200 + its depth in the stack (new-modal.tsx:384). The last one is the one on
  // top, which is the one a person is looking at — an askClose confirmation over
  // compose is the modal being measured, not compose behind it.
  //
  // First, because (1) depends on it.
  const modalRoot = [...document.querySelectorAll('body *')]
    .filter((el) => {
      const cs = getComputedStyle(el);
      return cs.position === 'fixed' && (parseInt(cs.zIndex, 10) || 0) >= 200;
    })
    .pop();

  // Which side of the boundary an element falls on. Containment, so the root
  // counts as inside itself — a box clipped by the modal root is clipped inside
  // the modal. False for everything when no modal is open, which is what makes
  // both rules downstream no-ops on a route reading.
  //
  // The limit is worth naming where it is defined: content the modal owns but
  // does not contain — a portalled dropdown, a tooltip, the date picker — is
  // not inside it by this test. If it renders fixed above z-index 200 it
  // becomes the topmost element and therefore becomes the boundary; otherwise
  // it reads as page.
  const insideModal = (el) => !!modalRoot && modalRoot.contains(el);

  // ---- 1. primary action reachable? ----
  //
  // Not asked while a modal is open. The hit-test asks whether the route's
  // primary action can be clicked, and an open modal covers the page by design —
  // so the answer would be COVERED on every modal reading ever taken, reported
  // in the summary as the most serious finding this probe has. A question whose
  // answer is fixed by the act of asking is not a measurement, and the file
  // already takes this position: a route with no ROUTE_CTA entry is simply not
  // hit-tested, "which is the honest reading for a page that has no one thing
  // you came to do". A modal reading is that page.
  const pattern = modalRoot
    ? undefined
    : (ROUTE_CTA.find(([route]) => route.test(location.pathname)) || [])[1];
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
  // Geometry, unjudged — the floor, the dedupe and which instance of a repeated
  // signature represents it are decided in reading.mjs where they can be
  // tested. This is the last of the three scans to cross that boundary; the
  // other two already had.
  //
  // `lostPx > 0` is a payload bound rather than a rule, the same one the
  // collision sweep applies as `overlap <= 0` below. Every candidate crosses a
  // stdout channel on every one of ~35 readings and /launches carries ~2,000
  // elements, nearly all of them sitting comfortably inside their clipper and
  // carrying nothing a rule would ask about.
  const clippedCandidates = [];
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) continue;
    if (outsideViewport(r) || hidden(el)) continue;
    const c = clipper(el);
    if (!c) continue;
    const cr = c.getBoundingClientRect();
    const overRight = r.right - cr.right;
    const overLeft = cr.left - r.left;
    const lost = Math.round(Math.max(overRight, overLeft));
    if (lost <= 0) continue;
    clippedCandidates.push({
      lostPx: lost,
      w: Math.round(r.width),
      tag: el.tagName.toLowerCase(),
      cls: cls(el, 90),
      inModal: insideModal(el),
      // Two more observations, no verdict — the pair reading.mjs needs to tell
      // a squeeze from a truncation and from a compensation. Both are computed
      // after the `lost <= 0` gate, so they cost an ancestor walk only for the
      // handful of boxes that actually cross an edge.
      clipperIsField: isField(c),
      compensatedPx: compensation(el, c, overRight >= overLeft ? 'right' : 'left'),
    });
  }

  // ---- 2b. content escaping a container that does not clip it ----
  // The inverse question to (2), and the blind spot finding 69 fell through.
  // (2) walks up from an element asking which ancestor cuts it off; `clipper()`
  // returns null both when an ancestor scrolls — content reachable — and when
  // nothing clips at all. The second is not containment. It is content painted
  // over whatever sits beside it, and no scan here could see it.
  //
  // So this one is asked of the *container*: do my own in-flow children paint
  // outside my box, when I neither clip them nor offer a scrollbar? Geometry
  // only. What counts as a finding among these — the floor, the dedupe, the
  // margin exemption — is decided in reading.mjs where a test can reach it.
  //
  // Two collection decisions, both measurement rather than verdict:
  //
  // A container that clips or scrolls is skipped, because its content has not
  // escaped: the first case belongs to (2), and the second means a person can
  // still reach it. And an out-of-flow child is skipped, because a badge pinned
  // outside its parent, a portalled dropdown and a tooltip are placements. The
  // collision sweep draws the same line for the same reason.
  //
  // `escaped <= 0` is a payload bound, not a rule — the same one (2) applies as
  // `lost <= 0`. Nearly every container on a page holds its children exactly.
  const escapedCandidates = [];
  for (const el of document.querySelectorAll('body *')) {
    if (!el.children.length) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) continue;
    if (outsideViewport(r) || hidden(el)) continue;
    if (getComputedStyle(el).overflowX !== 'visible') continue;
    // Which child escapes furthest, and on which side. Both are needed: the
    // side because a negative margin only pays for the overhang it is on, and
    // the child because the margin that produced the overhang is the escaping
    // child's, not the container's.
    let over = 0;
    let side = 'right';
    let worst = null;
    for (const ch of el.children) {
      const cp = getComputedStyle(ch).position;
      if (cp === 'absolute' || cp === 'fixed') continue;
      const cr = ch.getBoundingClientRect();
      if (cr.width < 1 || cr.height < 1) continue;
      const right = cr.right - r.right;
      const left = r.left - cr.left;
      if (right > over) {
        over = right;
        side = 'right';
        worst = ch;
      }
      if (left > over) {
        over = left;
        side = 'left';
        worst = ch;
      }
    }
    const escaped = Math.round(over);
    if (escaped <= 0) continue;
    escapedCandidates.push({
      escapedPx: escaped,
      w: Math.round(r.width),
      tag: el.tagName.toLowerCase(),
      cls: cls(el, 90),
      inModal: insideModal(el),
      // Walked from the escaping child up to the container, so a child pulled
      // back by exactly as much as it sticks out reads as the compensation it
      // is. Computed after the gate, so it costs an ancestor walk only for the
      // handful of containers that actually spill.
      compensatedPx: compensation(worst, el, side),
    });
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
  // The element's own text — its direct child text nodes, not its
  // descendants'. Returns the run rather than whether there is one: the sweep
  // below only needs the boolean, and an empty string is falsy, but an
  // unclassed participant needs the string itself to be told apart from another
  // unclassed participant. Every pair on `modal:compose-existing@1440` signs as
  // `div | div` without it, and the smaller of two real overlaps is dropped as
  // a repeat of the larger.
  const ownText = (el) =>
    [...el.childNodes]
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

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
  // The walk is per element and the trim is per rectangle, so they are two
  // functions: an element that renders across five lines has one ancestor chain
  // and five boxes, and walking it once per line would repeat the whole chain
  // for every line of a paragraph.
  const clipBox = (el) => {
    const box = { left: -Infinity, right: Infinity, top: -Infinity, bottom: Infinity };
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
    return box;
  };

  const trim = (r, c) => {
    const box = {
      left: Math.max(r.left, c.left),
      right: Math.min(r.right, c.right),
      top: Math.max(r.top, c.top),
      bottom: Math.min(r.bottom, c.bottom),
    };
    box.width = box.right - box.left;
    box.height = box.bottom - box.top;
    return box;
  };

  // The element's whole visible box, and each line it actually occupies — both
  // cut down by every ancestor that clips overflow away.
  //
  // `getBoundingClientRect()` on an element that wraps returns the *union* of
  // its line boxes — a rectangle it does not occupy. An <a> whose text starts
  // mid-line and finishes on the next measures the full content width by two
  // line-heights, and that phantom box covers every inline sibling on both
  // lines. `/auth@390` reported an 89px overlap between two links in one
  // sentence on exactly that arithmetic, and the reading rated a P1.
  //
  // A box with one line box yields one rectangle equal to its trimmed bounding
  // rect, which is what leaves every non-inline finding this instrument has
  // ever made untouched. Rounded because a fragment is a payload, and the
  // floor these feed is 8px.
  //
  // Returned together with the whole box because they share the ancestor walk,
  // which is the expensive half: /launches carries ~2,000 elements and asking
  // for the clip box twice per element would walk every chain twice for a
  // figure that cannot have changed in between.
  const visibleBoxes = (el) => {
    const c = clipBox(el);
    return {
      rect: trim(el.getBoundingClientRect(), c),
      rects: [...el.getClientRects()]
        .map((r) => trim(r, c))
        .filter((r) => r.width > 0 && r.height > 0)
        .map((r) => ({
          left: Math.round(r.left),
          top: Math.round(r.top),
          right: Math.round(r.right),
          bottom: Math.round(r.bottom),
        })),
    };
  };

  const texts = [];
  for (const el of document.querySelectorAll('body *')) {
    const text = ownText(el);
    if (!text) continue;
    const { rect: r, rects } = visibleBoxes(el);
    if (r.width < 8 || r.height < 8) continue;
    if (outsideViewport(r) || hidden(el)) continue;
    // Read once here rather than again in `box()`: one element takes part in
    // many pairs, and both the text and the fragments are properties of the
    // element rather than of the pair.
    texts.push({ el, r, text, rects, flow: inFlow(el), inModal: insideModal(el) });
  }
  texts.sort((a, b) => a.r.top - b.r.top);

  const box = (t) => ({
    tag: t.el.tagName.toLowerCase(),
    cls: cls(t.el, 90),
    w: Math.round(t.r.width),
    h: Math.round(t.r.height),
    // What an unclassed participant is told apart by. Capped like `cls` is, and
    // long enough to separate a date control from a two-digit counter, which is
    // the pair the collapse was hiding.
    text: t.text.slice(0, 40),
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
        // The lines each participant occupies. `overlapPx` above is the union
        // boxes' intersection, which is a strict superset of what the lines
        // share — so the sweep still finds every true pair, and which of the
        // lines actually meet is arithmetic reading.mjs does where a test can
        // reach it. Candidate data like the flow flags: they decide the finding
        // without being part of it, so no stored reading grows a rect array.
        aRects: a.rects,
        bRects: b.rects,
        // Read off the participants rather than tested here: one element takes
        // part in many pairs, and the boundary is a property of the element.
        aInModal: a.inModal,
        bInModal: b.inModal,
      });
    }
  }

  // ---- 4. touch targets ----
  //
  // The set this scan reports on, named once so the enclosing-ancestor walk
  // below asks exactly the question the scan asks.
  const CONTROLS = 'button, a[href], input, select, textarea, [role="button"], .cursor-pointer';

  // Why an element is a control, other than its cursor. `[tabindex]` is here
  // and not in CONTROLS because focusability makes an element a real target
  // without making it one this scan goes looking for — and this is the fact
  // that protects a genuine nested action from being read as decoration.
  const SEMANTIC = 'button, a[href], input, select, textarea, [role="button"], [tabindex]';

  // The box of the nearest ancestor that is itself in the control set, or null.
  // Nearest and only nearest: a candidate wrapped in a sub-44 target which is
  // itself inside a clearing one stays reported, even though a person can only
  // tap the outer thing. That is a deliberate false positive — it errs toward
  // reporting, and the alternative (any ancestor that clears) would suppress a
  // small target nested two levels inside a large clickable region, which is
  // the error the rule exists to avoid.
  const enclosingControl = (el) => {
    for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
      if (n.matches(CONTROLS)) {
        const r = n.getBoundingClientRect();
        return { w: Math.round(r.width), h: Math.round(r.height) };
      }
    }
    return null;
  };

  // Whether an element sits inside a run of text: it is inline-level, and its
  // parent renders text of its own around it. WCAG 2.5.5 — the criterion this
  // scan cites — exempts a target that is "in a sentence or block of text",
  // because a link in running prose cannot be padded to 44px without breaking
  // the line it sits in.
  //
  // Two structural observations and no threshold. The exemption is structural
  // or it is nothing: a rule that read "inline" off the geometry would exempt
  // /support's 124x42 chip, which is a finding. Whether being a link as well is
  // required — it is — is decided in reading.mjs alongside every other verdict.
  const inlineInText = (el) => {
    if (getComputedStyle(el).display !== 'inline') return false;
    const p = el.parentElement;
    return !!p && !!ownText(p);
  };

  let small = 0;
  let total = 0;
  const smallest = [];
  // Geometry, unjudged. Which of these fall under the floor, and how many
  // findings one control repeated across the calendar is worth, are decided in
  // reading.mjs where they can be tested — the boundary collisionCandidates
  // already draws. The `44` a few lines down still computes the advisory
  // instance count, unchanged; reading.mjs holds the definition of record.
  const undersizedCandidates = [];
  for (const el of document.querySelectorAll(CONTROLS)) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0 || outsideViewport(r) || hidden(el)) continue;
    total++;
    undersizedCandidates.push({
      tag: el.tagName.toLowerCase(),
      cls: cls(el, 90),
      w: Math.round(r.width),
      h: Math.round(r.height),
      // Four facts, no verdict. Whether their combination means "decorative
      // wrapper", or "a link inside a sentence", is a judgement and it lives in
      // reading.mjs, where a test can reach it — this file is injected as
      // source text and anything it decides leaves the suite.
      inModal: insideModal(el),
      semantic: el.matches(SEMANTIC),
      enclosing: enclosingControl(el),
      inlineInText: inlineInText(el),
    });
    if (r.height < 44 || r.width < 44) {
      small++;
      smallest.push({ h: Math.round(r.height), w: Math.round(r.width), text: (el.textContent || '').trim().slice(0, 24) });
    }
  }

  return {
    url: location.pathname,
    vw,
    // What the page itself reports about the pointer driving it, so run.mjs can
    // hold its own emulation to account instead of trusting the flag it was
    // given. Never stored: the mode is a property of the run, and provenance
    // records it there once rather than on all 28 readings.
    pointerCoarse: matchMedia('(pointer: coarse)').matches,
    cta,
    // The two halves of the account precondition. `pageRendered` anchors it:
    // a missing customer control means nothing if the page never loaded, so a
    // route with no ROUTE_CTA entry cannot answer the question and says so by
    // reporting false — only a route with an anchor pattern is worth a
    // pre-flight, and run.mjs runs it on /launches. A modal reading lands in
    // that same bucket for the same reason: (1) is not asked under a modal, so
    // there is no cta, so this reports false. It is the pre-flight's question,
    // and the pre-flight is a route navigation.
    precondition: { customerControlPresent, pageRendered: !!cta && cta.verdict !== 'NOT FOUND' },
    build,
    sidewaysScrollPx: Math.max(0, document.documentElement.scrollWidth - vw),
    // Raw, like the two below — run.mjs decides these into clippedCount /
    // worstCutPx / clipped and drops the candidates. They never reach a stored
    // reading.
    clippedCandidates,
    // Raw — run.mjs decides these into collisionCount / worstOverlapPx /
    // collisions and drops the candidates. They never reach a stored reading.
    collisionCandidates,
    // Likewise: run.mjs decides these into touch.distinctUnder44 / undersized.
    undersizedCandidates,
    // Raw — run.mjs decides these into escapedCount / worstEscapePx / escaped.
    escapedCandidates,
    touch: { total, under44: small, pct: total ? Math.round((small / total) * 100) : 0 },
    smallest: smallest.sort((a, b) => a.h * a.w - b.h * b.w).slice(0, 4),
    // ---- 6. the modal's own width ----
    //
    // Present only when a modal is open, and absent — not null — otherwise, so
    // that a route reading is byte-identical to what this file produced before
    // the modal axis existed (PR4). Every other field above answers a question
    // about the page; none of them expresses the measured element's own width,
    // which is the whole of what a modal reading is for.
    //
    // `w` is the horizontal extent the modal's content occupies, not the box
    // the modal is drawn in. Those are different numbers and only one of them
    // is the finding: the outermost modal element is `fixed w-full`, so its own
    // box is the viewport at every width and carries no information at all,
    // while its content sits at 809px inside a 390px frame and pans. scrollWidth
    // is that content extent, and it is what has to come down to the viewport.
    ...(modalRoot
      ? {
          wrapper: {
            w: modalRoot.scrollWidth,
            h: modalRoot.scrollHeight,
          },
        }
      : {}),
  };
})();
