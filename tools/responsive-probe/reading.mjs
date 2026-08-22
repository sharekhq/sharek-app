// Every rule the probe applies that has a right answer without a browser.
// run.mjs does the I/O and the printing; this module decides.
//
// Nothing here touches the network, the clock or the filesystem, so all of it
// is driven test-first from reading.test.mjs.

// ---------------------------------------------------------------------------
// What a full run covers
// ---------------------------------------------------------------------------

// Seven of the eight routes the 2026-08-15 audit measured. /auth/login is not
// here: login happens first, so the signed-out page is unreachable in a run.
// Nineteen of the app's twenty-seven routes are still unmeasured — /p/[id]
// (the public share page, the only majority-mobile surface) and the signup
// funnel matter most.
//
// These live here rather than in run.mjs because they are not defaults, they
// are the definition of a complete run: PROBE_ROUTES and PROBE_VIEWPORTS narrow
// a run for iteration, and anything narrower than this cannot be a baseline.
// Widening them is a new baseline, not a bigger one.
export const CANONICAL_ROUTES = [
  '/launches',
  '/analytics',
  '/settings',
  '/media',
  '/plugs',
  '/billing',
  '/agents',
];

export const CANONICAL_VIEWPORTS = [
  { w: 390, h: 844, label: 'phone' },
  { w: 820, h: 1180, label: 'tablet portrait' },
  { w: 1024, h: 768, label: 'tablet landscape' },
  { w: 1440, h: 900, label: 'desktop' },
];

// How a viewport is named in a reading and in provenance.
export const viewportKey = (v) => `${v.w}x${v.h}`;

// ---------------------------------------------------------------------------
// Modal targets — a second axis, deliberately not an eighth route
// ---------------------------------------------------------------------------

// The harness has measured routes since spec 014 and has never opened a modal,
// which is why compose's 809px is hand-produced and has not moved through four
// rollouts. The click itself was never the cost: `ab(['click', …])` has signed
// the probe in since the beginning. The cost is that everything downstream is
// keyed by route — `completeness()` requires a run's routes to be exactly
// CANONICAL_ROUTES, and `difference()` pairs readings on route + viewport — so
// adding `compose` to that list would make baseline.json, touch-gate-1.json and
// both phase-4 finals report as narrowed. The instrument would arrive by
// invalidating the history it exists to extend (R4, PR3).
//
// So targets are their own axis. A target says where to navigate, what to click
// to get the surface on screen, and how long to let it settle.
//
// `open` is a list of clicks rather than one selector because the control is
// not always on screen: below the tablet width the channels rail collapses into
// a drawer and takes Create Post with it, which is why /launches@390 reads
// `behind-drawer`. A step marked optional is one that has nothing to click at
// some widths and everything to click at others — it is not a step that may
// fail. Whether the surface actually opened is never inferred from these
// clicks; it is decided by measuring for the modal afterwards, which is the
// only answer that holds however the steps behaved (PR8).

// Both selectors are Tailwind classes the project writes literally — there is
// no CSS-module hashing here — and both were checked against the deployed page
// rather than read off the JSX.
//
//   .phone:flex   the channels drawer toggle (ui/split.panel.tsx:185). It is
//                 `hidden phone:flex`, so it exists at every width and is only
//                 laid out at or below 768 — which is exactly the width where
//                 Create Post is off screen and /launches reads `behind-drawer`.
//   .bg-btnPrimary  Create Post (launches/new.post.tsx:80). The calendar's hour
//                 cell carries `group-hover:bg-btnPrimary`, a different class
//                 token on a div, so the button selector does not reach it.
const CHANNELS_DRAWER_TOGGLE = 'button.phone\\:flex.self-start';
const CREATE_POST = 'button.bg-btnPrimary';

//   .rounded-br-[10px].bg-surface  a post's body on the calendar grid
//                 (launches/calendar.tsx:1198, the div carrying onClick={editPost}).
//                 The delete and preview controls above it are separate elements,
//                 so this reaches the editor rather than a confirmation.
const CALENDAR_POST = 'div.rounded-br-\\[10px\\].bg-surface';

export const CANONICAL_MODALS = [
  {
    id: 'compose',
    route: '/launches',
    open: [
      { click: CHANNELS_DRAWER_TOGGLE, optional: true },
      { click: CREATE_POST },
    ],
    settle: 1800,
  },
  {
    // The same component with a post already in it — R7's 891px against the
    // empty 809, and the state that overturned FR-007's threshold. It is here
    // rather than hand-measured because it is the more important of compose's
    // two states and the one that had never been measured twice.
    id: 'compose-existing',
    route: '/launches',
    open: [{ click: CALENDAR_POST, scrollIntoView: true }],
    settle: 1800,
    // Measured 2026-08-19: at ≤768 the calendar is not a grid, it is `ListView`
    // (calendar.tsx:506), and on this account it renders "No posts" under All and
    // "No draft posts" under Draft while the same post shows on the week grid at
    // 769 and above. So there is nothing to click at 390, and a target that
    // cannot open records an error — which would make every full run incomplete
    // for a reason that is about the account's data, not about the layout.
    //
    // A target says which widths it can be reached at, and is held to exactly
    // those. Widening this list is a claim about the app that has to be measured
    // first, the same way CANONICAL_ROUTES works.
    widths: [820, 1024, 1440],
  },
];

// A reading's key, and the guarantee that it can never be paired with a route.
// Route paths all begin with a slash and this prefix does not, so the two
// namespaces cannot meet — and an id that tried to look like a path is refused
// rather than quietly namespaced, because `difference()` pairing compose
// against /launches would report a page of changes that never happened (PR5).
const MODAL_PREFIX = 'modal:';
// A second prefix rather than a second namespace: route paths all begin with a
// slash and neither prefix does, so all three sets stay disjoint. A panel
// reading filed as `modal:` would be a reading that lies about what it measured
// in the one field every comparison pairs on.
const PANEL_PREFIX = 'panel:';

export const targetKey = (target) => {
  const id = typeof target === 'string' ? target : target.id;
  const kind = (typeof target === 'string' ? 'modal' : target.kind) || 'modal';
  if (String(id).startsWith('/')) {
    throw new Error(`a target id must not look like a path — got ${id}`);
  }
  if (kind !== 'modal' && kind !== 'panel') {
    throw new Error(`unknown target kind "${kind}" on ${id}`);
  }
  return `${kind === 'panel' ? PANEL_PREFIX : MODAL_PREFIX}${id}`;
};

export const modalKey = (id) => targetKey({ id, kind: 'modal' });

// Whether a reading is of a modal rather than of a route. Read off the key
// rather than off a flag, so a reading that came back from an older run cannot
// disagree with itself — and off the same constant modalKey writes, so the two
// cannot drift apart.
export const isModalReading = (reading) => String(reading.route).startsWith(MODAL_PREFIX);

// A reading of any target, of either kind. `isModalReading` keeps its narrower
// meaning because callers that ask specifically about modals still exist; this
// is what the checks that care only about "was this taken somewhere other than
// its own key" use.
export const isTargetReading = (reading) =>
  isModalReading(reading) || String(reading.route).startsWith(PANEL_PREFIX);

// ---------------------------------------------------------------------------
// Measurement targets — one driver, two kinds
// ---------------------------------------------------------------------------

// A target is route + click steps + settle + reachable widths + an arrival
// assertion, and the assertion is the only thing that differs between a modal
// and a tab panel. The navigate → click → settle → measure sequence is
// identical, so there is one driver; a second near-identical one would drift
// the moment either gained a fix.
//
// The assertion is never optional and is never inferred from the clicks having
// been dispatched. run.mjs's own standing rule is the reason: a target that did
// not open must be an error, never "a reading whose width is zero, which would
// read as 'it fits' — the strongest false green this instrument could emit".
//
// The facts come from the driver, which is the only thing that can see a page;
// the verdict is decided here, which is the only place a test can reach.
export function arrival(target, { modalOpen = false, selectorLaidOut = null } = {}) {
  const kind = target.kind || 'modal';

  if (kind === 'modal') {
    return modalOpen
      ? { arrived: true, reason: null }
      : { arrived: false, reason: `no modal is open — ${target.id} did not reach the screen` };
  }

  if (kind === 'panel') {
    if (!target.arrived) {
      // Refused rather than defaulted. A panel with no assertion would measure
      // whatever the page happened to be showing and file it under the panel's
      // name, which is the same false green in a different costume.
      throw new Error(`panel target ${target.id} declares no arrival assertion`);
    }
    if (selectorLaidOut === null) {
      throw new Error(`panel target ${target.id} was judged without asking whether it arrived`);
    }
    return selectorLaidOut
      ? { arrived: true, reason: null }
      : {
          arrived: false,
          reason: `${target.arrived} is not laid out — ${target.id} did not reach the screen`,
        };
  }

  throw new Error(`unknown target kind "${kind}" on ${target.id}`);
}

// Which of a run's widths a target owes a reading at. A target that declares
// `widths` is held to exactly those and no others — `compose-existing` has
// depended on that since 018, because at 390 the calendar is a ListView with
// nothing to click and a target that cannot open records an error, which would
// make every full run incomplete for a reason about the account's data rather
// than about the layout. Absent, it owes a reading at every width the run
// covered.
//
// Shared by the driver and by completeness() so the two cannot disagree about
// what a run owes.
export const reachableWidths = (target, viewports) =>
  viewports.filter((v) => !target.widths || target.widths.includes(Number(String(v).split('x')[0])));

// ---------------------------------------------------------------------------
// Precondition — can this account reproduce the failure we are measuring?
// ---------------------------------------------------------------------------

// Layout failures land on whichever element loses the fight for width, so what
// the account contains decides what the probe sees. `Select Customer` renders
// only when integrations span more than one customer value — an unassigned
// channel counts as one (select.customer.tsx:48-58) — and that one ~157px
// control is what pushes the calendar column past the point where the channels
// rail collapses and takes Create Post with it. An account without it reports
// green on a page that is broken for everyone else.
//
// Four answers, and the order they are tested in is the meaning:
//
//   waived        the operator said measure anyway. Honoured over everything,
//                 because it is a decision, not an observation — but the reason
//                 still carries what was seen, so two waived runs for different
//                 causes do not read alike. Never baseline-eligible.
//   check-broken  the page did not render, so the precondition could not be
//                 evaluated at all. The check failed, not the account (FR-003).
//   unqualified   the page rendered and the control did not. The account cannot
//                 reproduce the failure.
//   qualified     both present.
export function preconditionVerdict({
  pageRendered,
  customerControlPresent,
  waived = false,
}) {
  const observed = !pageRendered
    ? 'the anchor control was not found, so the page did not render'
    : customerControlPresent
    ? 'the Select Customer control rendered'
    : 'the Select Customer control did not render';

  if (waived) {
    return {
      verdict: 'waived',
      blames: null,
      reason: `precondition waived by PROBE_WAIVE_PRECONDITION — ${observed}`,
      remedy: null,
    };
  }

  if (!pageRendered) {
    return {
      verdict: 'check-broken',
      blames: 'check',
      reason: `the precondition could not be evaluated — ${observed}`,
      remedy:
        'the check itself is at fault, not the account: the target may not be this app, ' +
        'the page may not have finished rendering, or the primary action may have been renamed. ' +
        'Verify the anchor pattern in probe.js ROUTE_CTA.',
    };
  }

  if (customerControlPresent) {
    return {
      verdict: 'qualified',
      blames: null,
      reason: `the account can reproduce the width-dependent failure — ${observed}`,
      remedy: null,
    };
  }

  return {
    verdict: 'unqualified',
    blames: 'account',
    reason: `this account cannot reproduce the failure being measured — ${observed}`,
    remedy:
      "the account's integrations span only one customer grouping, so Select Customer is not " +
      'rendered at all (select.customer.tsx:56) and the widths where Create Post is covered will ' +
      'read as clean. Assign a customer to one channel and leave another unassigned — that is two ' +
      'groupings — then run again. Or set PROBE_WAIVE_PRECONDITION=1 to measure anyway, ' +
      'accepting that the run can never be a baseline.',
  };
}

// ---------------------------------------------------------------------------
// Clipping — content cut off by an ancestor that hides its overflow
// ---------------------------------------------------------------------------

// probe.js hands over every in-viewport box that crosses the edge of a clipping
// ancestor. Which of them are findings is decided here, for the reason the two
// rules below already are: a figure computed in the page eval cannot be tested,
// and probe.js named this scan as the last one that had not moved.
//
// What stays in the page is what cannot leave it. The 8×8 minimum box,
// outsideViewport, hidden, and having a clipper() ancestor at all each need
// getComputedStyle or an ancestor walk, so they are DOM facts rather than
// rules. One more thing stays there and is not a rule either: only boxes with
// `lostPx > 0` are emitted, the payload bound the collision sweep already
// applies as `overlap <= 0`. /launches carries ~2,000 elements and every
// candidate crosses a stdout channel on every reading, so a box sitting
// comfortably inside its clipper is left behind rather than serialised — it
// carries nothing a rule would ask about.
//
// The floor is the one number a reader would want to change, so it lives here
// beside its tested twin rather than in the page.
const CLIP_FLOOR_PX = 8;
const CLIP_CAP = 6;

// Tag plus class excerpt — the signature the two rules below already dedupe on.
// Two boxes rendering from the same element and the same classes are one thing
// to fix, however often the page repeats them.
const clipSignature = (c) => c.tag + c.cls;

// Two ways a box can cross the edge of its clipper without anything being lost.
// Both follow `wrapperSignatures`' precedent — relocated into a named bucket,
// never dropped — and both treat a candidate that predates them as *not*
// exempt, so every retained reading keeps meaning what it meant.
//
// The value is truncated inside a field whose whole job is to truncate. The
// question is about the clipper and never about the candidate's own styles: a
// `truncate`d element cut off by a layout row is losing content, and reading
// its classes instead would excuse the squeeze. `panel:settings-developers@390`
// reported `span.blur-sm.select-none` losing 257px of the API key, and that
// figure — "two thirds of the screen" — is what rated finding 63 P1, while
// `sidewaysScrollPx: 0` in the same reading says nothing left the document.
const truncatedByField = (c) => c.clipperIsField === true;

// The overhang is paid for by a negative margin between the box and its
// clipper. `/modal/dark/all` reports two boxes at every width losing exactly
// the compensation in force there — 12 under `mobile:`, 40 above it — for a
// frame that is deliberately larger than its parent so that compose's own
// padding is cancelled.
//
// Narrow on purpose, and the comparison is what makes it narrow: a control with
// `-ms-[6px]` losing 300px has lost 300px and still reports all of it. Only an
// overhang wholly inside the compensation is excused.
const paidForByMargin = (c) => c.compensatedPx > 0 && c.lostPx <= c.compensatedPx;

// Sorted before it is deduped, so the deepest instance of a repeated signature
// survives. Keeping whichever came first in document order reported 10px on a
// page where the same signature was cut by 300 — the mistake `reportableCollisions`
// and `reportableUndersized` both document avoiding, and the one this scan never
// got while it lived in the page.
//
// Whether the floor runs before or after the dedupe is immaterial under
// worst-wins: if any instance of a signature clears the floor, the deepest one
// does. Under first-wins it was load-bearing, because a 6px instance arriving
// early would claim the key and suppress a 40px one behind it.
//
// Its own function because the modal figure is deduped independently of the
// document-wide one: a signature appearing both inside a modal and on the page
// behind it would otherwise be swallowed by whichever instance won the
// document-wide dedupe, which is a fact about the page behind the overlay
// rather than about the modal being measured.
const decideClipped = (candidates) => {
  const seen = new Set();
  const clipped = [];
  const fieldTruncated = [];
  const compensated = [];
  for (const c of [...candidates].sort((x, y) => y.lostPx - x.lostPx)) {
    if (c.lostPx <= CLIP_FLOOR_PX) continue;
    const key = clipSignature(c);
    if (seen.has(key)) continue;
    seen.add(key);
    // Which side of the modal boundary the box fell on decided which figure it
    // counts toward; it is not part of the finding.
    const entry = { lostPx: c.lostPx, w: c.w, tag: c.tag, cls: c.cls };
    // One `seen` across all three buckets, so a signature is classified once
    // and by its deepest instance — the same worst-wins rule the sort above
    // already exists for. A relocated finding keeps the figure it was measured
    // at rather than the shallowest one that happened to share its signature.
    if (truncatedByField(c)) fieldTruncated.push(entry);
    else if (paidForByMargin(c)) compensated.push(entry);
    else clipped.push(entry);
  }
  return { clipped, fieldTruncated, compensated };
};

export function reportableClipped(candidates, { modalOpen } = { modalOpen: false }) {
  const { clipped, fieldTruncated, compensated } = decideClipped(candidates);

  return {
    // The count is what survived the rules, not what fitted in the report — the
    // same split `collisionCount` and `collisions[]` keep. A count that quietly
    // capped at six would read identically on a page with seven clipped
    // controls and one with seventy.
    clippedCount: clipped.length,
    worstCutPx: clipped.length ? clipped[0].lostPx : 0,
    clipped: clipped.slice(0, CLIP_CAP),
    // The two relocated buckets, kept to the same count/detail split as the
    // reported one and present even when empty — "measured none" and "not
    // measured" are different answers, and every other field here keeps them
    // apart. FR-008: a candidate that left `clippedCount` must be findable in
    // one of these, and one that vanished from all three is a defect in the
    // rule rather than a fix.
    fieldTruncated: fieldTruncated.length,
    fieldTruncatedSignatures: fieldTruncated.slice(0, CLIP_CAP),
    marginCompensated: compensated.length,
    marginCompensatedSignatures: compensated.slice(0, CLIP_CAP),
    // How much of the clipping is the modal's own. Present only on a modal
    // reading, and absent — not zero — otherwise, so a route reading keeps the
    // exact field set it had before this axis existed and a comparison against
    // a pre-modal baseline names the field as introduced rather than reporting
    // a reading that changed. `wrapper.w` and `wrapper.h` already work this way.
    //
    // A modal that clips nothing reports 0, present: "measured none" and "not
    // measured" are different answers and both of this file's other rules keep
    // them apart.
    //
    // Deduped over the inside candidates on their own rather than read off the
    // survivors above. When one signature is clipped both inside the modal and
    // on the page behind it, the document-wide dedupe keeps whichever instance
    // cut deeper — so a subset reading would report the modal's own clipped
    // control as absent whenever the page behind it happened to cut deeper,
    // which is a fact about the page rather than about the modal being
    // measured. One control clipped inside the modal is one finding however the
    // page behind it renders.
    //
    // Two limits, written here rather than left to be rediscovered:
    //
    // The boundary is a containment test, so this cannot claim content the
    // modal owns but does not contain — a portalled dropdown, a tooltip, a date
    // picker. If such an element renders fixed above z-index 200 it becomes the
    // topmost element and therefore *becomes* the boundary; otherwise it reads
    // as page. Either way it is not inside the modal by containment. 017 T088
    // found the Arabic date picker opening off-screen, which is exactly this
    // class of element.
    //
    // And this figure is always ≤ `clippedCount`. research.md R4 claims the
    // opposite — that the subset relation "does not hold" because the two
    // counts are taken over two dedupes — and that claim is wrong: both apply
    // the same floor and the same signature, and the inside candidates are a
    // subset of all candidates, so the inside signature set is a subset of the
    // document-wide one. The independent dedupe is still the right rule, for
    // the reason above; it just does not buy what R4 says it buys.
    ...(modalOpen
      ? { clippedInside: decideClipped(candidates.filter((c) => c.inModal)).clipped.length }
      : {}),
  };
}

// ---------------------------------------------------------------------------
// Collisions — which overlaps are a squeeze, and which are the design
// ---------------------------------------------------------------------------

// probe.js hands over every pair of in-viewport text-bearing elements whose
// boxes intersect and where neither contains the other. Containment is settled
// there, in collection: an element overlapping its own ancestor is not a
// finding in any layout. What crosses the boundary is geometry, and the
// judgement lives here where it can be tested.
//
// Note what the pairing is not. The audit describes this as sibling-rect
// intersection, and a sibling test reports zero on the calendar it exists to
// catch — the colliding day labels are children of two different grid cells,
// so their nearest common ancestor is three levels up. Cousins are the point.
//
// FR-012's operative test is "a reported pair stops overlapping when the
// viewport is widened", and a reading evaluates one viewport at a time. Both
// participants being in normal flow is the proxy, and it lines up with the
// exclusion list exactly: a badge on an avatar, a floating action over a list
// and a portalled overlay are all out of flow, so they are excluded by
// construction rather than by four special cases.
//
// The floor, the class excerpt and the cap of six are the ones `clipped`
// already uses. A second vocabulary for the same kind of finding would be one
// more thing to learn for nothing.
const COLLISION_FLOOR_PX = 8;
const COLLISION_CAP = 6;

// Tag plus class, and — only where there is no class — the participant's own
// text. Two boxes rendering from the same element and the same classes are one
// thing to fix; two unclassed boxes are two different things, and without the
// text there is nothing at all to tell them apart.
//
// `modal:compose-existing@1440` is the case: the date control overlaps a `121`
// preview counter by 25px and a `32` counter by 17px, both participants
// classless, so both pairs sign as `div | div` and the smaller is dropped as a
// repeat of the larger. Every retained reading back to `post-018-fine-final`
// carries the same understatement.
//
// The scoping to unclassed participants is the whole rule rather than a
// shortcut. A signature that always included the text would report the
// calendar's day headers seven times — they carry a class and their text is a
// different weekday in every cell — and one finding repeated across a repeating
// layout is one finding. Falling back to '' keeps a candidate from before this
// rule signing exactly as it used to.
const participantSignature = (p) => p.tag + (p.cls || p.text || '');

// A pair is unordered, so its signature is too — the same two participants the
// other way round is the same finding, not a second one.
const pairSignature = (c) => [participantSignature(c.a), participantSignature(c.b)].sort().join(' | ');

// Rule 1 — what the two participants share on screen, rather than what their
// union boxes share.
//
// `overlapPx` is measured in the page from `getBoundingClientRect()`, which for
// an element that wraps is the union of its line boxes: a rectangle it does not
// occupy, spanning every inline sibling on both lines. `/auth@390` reported an
// 89px overlap between Terms of Service and Privacy Policy on that arithmetic —
// two links in one sentence with the second wrapped — and that reading is what
// rated finding 64 P1. They do not overlap on screen at any width.
//
// A union-box intersection is a strict superset of a line-box intersection, so
// the page's sweep still finds every true pair; this only asks which of the
// lines actually meet, on both axes rather than on x alone. An element with one
// line box gives one rectangle equal to its own box, so a single-line pair is
// arithmetically unchanged — which is what leaves `modal:compose-existing@1024`
// reporting its 84px and every non-inline finding this instrument has made
// exactly where it was.
//
// Both sides or neither. A candidate carrying fragments for only one
// participant — or for none, which is every retained reading — keeps the figure
// it was measured with: the other side's position is not in the payload, so
// there is nothing to intersect against, and the safe direction is the one that
// does not silently drop a finding.
const observedOverlap = (c) => {
  if (!Array.isArray(c.aRects) || !Array.isArray(c.bRects)) return c.overlapPx;
  let worst = 0;
  for (const a of c.aRects) {
    for (const b of c.bRects) {
      if (Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) <= 0) continue;
      worst = Math.max(worst, Math.min(a.right, b.right) - Math.max(a.left, b.left));
    }
  }
  return Math.round(worst);
};

export function reportableCollisions(candidates, { modalOpen } = { modalOpen: false }) {
  const seen = new Set();
  const collisions = [];

  // A modal reading measures the modal, so on one the boundary decides first.
  //
  // A pair straddling it is an overlay lying on the page, which is the modal
  // working correctly — the same position (1) takes when it declines to
  // hit-test the primary action under a modal, and for the same reason: an
  // answer fixed by the act of asking is not a measurement. Compose carried
  // 6-10 of these at every width through the whole audit, 1440 included, where
  // it has never had a layout problem. A pair with neither participant inside
  // is a finding about the page behind the surface under test, and a route
  // reading of that page still reports it.
  //
  // Ahead of the sort rather than inside the loop below, because dedupe is by
  // pair signature: a cross-boundary pair allowed to claim a signature and only
  // then be dropped would take a genuine in-modal pair down with it.
  //
  // When no modal is open this does not run, so a route reading is judged by
  // exactly the three rules it always was and a candidate carrying no
  // aInModal/bInModal is never dropped for lacking them.
  const judged = modalOpen ? candidates.filter((c) => c.aInModal && c.bInModal) : candidates;

  // Computed once per candidate and then used for the sort, the floor and the
  // reported figure alike — three places that must agree about how big an
  // overlap is, and would not if two of them read the union box.
  const observed = new Map(judged.map((c) => [c, observedOverlap(c)]));

  // Sorted before it is deduped, so the worst instance of a repeated signature
  // survives. The seven day-header pairs on the calendar share one signature;
  // keeping whichever came first in document order would report a smaller
  // overlap than the one that was measured.
  for (const c of [...judged].sort((x, y) => observed.get(y) - observed.get(x))) {
    if (!c.aFlow || !c.bFlow) continue;
    const overlapPx = observed.get(c);
    if (overlapPx <= COLLISION_FLOOR_PX) continue;
    const key = pairSignature(c);
    if (seen.has(key)) continue;
    seen.add(key);
    // The flow flags and the line boxes decided the finding; they are not part
    // of it.
    collisions.push({ overlapPx, a: c.a, b: c.b });
  }

  return {
    // The count is what survived the rules, not what fitted in the report —
    // the same split `clippedCount` and `clipped[]` already keep.
    collisionCount: collisions.length,
    worstOverlapPx: collisions.length ? collisions[0].overlapPx : 0,
    collisions: collisions.slice(0, COLLISION_CAP),
  };
}

// ---------------------------------------------------------------------------
// Undersized touch targets — WCAG 2.5.5, counted by signature
// ---------------------------------------------------------------------------

// `probe.js` measures every visible, in-viewport interactive element and sends
// the geometry here. Which of them are findings, and how many findings a
// repeated control is worth, are decided in this file because that is where
// they can be tested — the same boundary `reportableCollisions` draws.
//
// Counting instances is what broke `touch.under44`. `calendar.tsx:936` renders
// an hour cell's drop target only while that hour is still ahead, so /launches
// carries up to ~150 of one class or a couple of dozen depending on where *now*
// falls in the displayed week. The field read 15 against a Saturday baseline
// and 172 on the Monday after with nothing in the app changed, which is what
// demoted it to advisory on 2026-08-17.
//
// By signature that swing disappears: the cell's class comes from a `clsx` with
// three static branches (`calendar.tsx:939-947`) — no day index, no per-cell
// state — so all of them collapse to one finding, which is also the honest
// answer. One control is undersized once, however often the calendar repeats
// it. What survives is a ±1: a week displayed entirely in the past renders no
// hour cell at all, so the signature is absent rather than smaller. That is
// recorded in the VARIANCE note below as known, not measured away.
//
// The floor is 44 because WCAG 2.5.5 asks for at least 44, so 44 passes.
// `probe.js` applies the same number to the advisory `touch.under44` it still
// reports; this is the definition of record.
const TOUCH_FLOOR_PX = 44;
const UNDERSIZED_CAP = 6;

// Tag plus class excerpt, the signature `clipped` already dedupes on. Two
// controls that render from the same element and the same classes are the same
// control as far as a layout fix is concerned.
const targetSignature = (c) => c.tag + c.cls;

// A candidate that is in the control set only because of its cursor, and that
// something tappable already covers. Both clauses carry their own weight:
//
//   `semantic === false` protects a real nested action. A 30x30 <button> inside
//   a clickable 300x60 card is semantic, so it keeps being reported — tapping
//   it does something different from tapping the card, and suppressing it is
//   the one error this rule must never make. Strict `=== false`, so a candidate
//   from before probe.js sent these facts carries `undefined` and stays
//   reported: the safe direction, and it keeps every retained reading's meaning.
//
//   the enclosure clearing the floor is what makes the suppression true. A bare
//   cursor-pointer div inside a *small* parent is not covered by anything
//   tappable, so it stays reported.
//
// This is a judgement and it lives here rather than in probe.js because probe.js
// is injected as source text: a verdict computed in the page is a verdict no
// test can reach.
const decorative = (c) =>
  c.semantic === false &&
  !!c.enclosing &&
  c.enclosing.w >= TOUCH_FLOOR_PX &&
  c.enclosing.h >= TOUCH_FLOOR_PX;

// A link inside a sentence. WCAG 2.5.5 — the criterion this scan cites — states
// the exception by name: a target "in a sentence or block of text" is exempt,
// because a link in running prose cannot be padded to 44px without breaking the
// line it sits in. Counting it produces a finding with no remedy, and five of
// the six items that rated finding 64 P1 are exactly that.
//
// Both clauses carry their own weight:
//
//   being a link is what the exception is for. `/support`'s 124x42 category
//   chip is a <button> and is a finding; the `h1 326x36` with a cursor and no
//   handler is finding 64's real defect. Neither is exempt however its parent
//   renders, and a rule that read "inline" off the geometry would take both.
//
//   `inlineInText === true` is strict, so a candidate from before probe.js sent
//   the fact carries `undefined` and stays reported — the safe direction, and
//   the same strictness `decorative` keeps for `semantic === false`.
//
// The fact itself is structural and observed in the page: the element is
// inline-level and its parent renders text of its own around it. `/p/[id]`'s
// logo link is a link and fails both halves — `page.tsx:54` gives it
// `flex items-center justify-center` and nothing renders text beside it — so it
// is still counted, which is finding 62.
const inlineInText = (c) => c.tag === 'a' && c.inlineInText === true;

export function reportableUndersized(candidates, { modalOpen } = { modalOpen: false }) {
  const seen = new Map();
  // Reclassified, never dropped. `019` declined to fix the wrapper defect
  // mid-flight on the grounds that an instrument change which silences a
  // finding is the wrong order of operations — a change that relocates one into
  // a named, inspectable bucket cannot silence it, and that is what makes the
  // control-for-control comparison this feature owes possible at all.
  const wrapperSeen = new Map();
  // The second bucket, on the same terms as the first. A link exempted here is
  // findable here; a candidate that vanished from both is a defect in the rule.
  const inlineSeen = new Map();

  // Ranked on the dimension that misses the floor, not on area: the calendar's
  // hour cell is 21×68 at 820, so it fails on width while being nearly three
  // times the area of a 22×22 icon that misses by less. Area ranking pushed it
  // out of the report entirely on the first real run. Area breaks the ties, so
  // the order is total and two runs cannot disagree about it.
  //
  // Sorted before it is deduped, so the smallest instance of a repeated
  // signature survives — reporting a 40px cell while a 21px one was measured
  // would under-report the finding, exactly as keeping the smaller overlap
  // would above. Insertion order then carries the sort into the report.
  const severity = (c) => Math.min(c.w, c.h);
  for (const c of [...candidates].sort(
    (x, y) => severity(x) - severity(y) || x.w * x.h - y.w * y.h
  )) {
    // A modal reading measures the modal, so on one the boundary decides first
    // — the same rule reportableClipped and reportableCollisions have applied
    // since 018, and the half 018 did not reach. Without it a modal's touch
    // figure is the whole document, the page behind included: under a fine
    // pointer modal:compose@1024 read 113 against /launches@1024's 87, and the
    // difference was the page. It is attributable to the modal only while the
    // route behind it happens to read zero, which is a coincidence of a build
    // and not a property of the instrument.
    //
    // When no modal is open this does not run, so a route reading is judged by
    // exactly the rules it always was and a candidate carrying no `inModal` is
    // never dropped for lacking it.
    if (modalOpen && !c.inModal) continue;
    if (c.w >= TOUCH_FLOOR_PX && c.h >= TOUCH_FLOOR_PX) continue;
    const key = targetSignature(c);
    // Exclusive by construction — `decorative` requires `semantic === false`
    // and a link is semantic — but written as one choice so a candidate can
    // never be counted twice, which is the arithmetic FR-008 rests on.
    const bucket = inlineInText(c) ? inlineSeen : decorative(c) ? wrapperSeen : seen;
    const kept = bucket.get(key);
    // Every instance is counted even though only the first is kept: "one
    // finding, 150 of them" is a different remediation from "one finding,
    // once", and the count is the only place that fact survives the dedupe.
    if (kept) {
      kept.instances++;
      continue;
    }
    bucket.set(key, { tag: c.tag, cls: c.cls, w: c.w, h: c.h, instances: 1 });
  }

  const undersized = [...seen.values()];
  const wrapperSignatures = [...wrapperSeen.values()];
  const inlineSignatures = [...inlineSeen.values()];
  return {
    // Survivors, not what fitted in the report — same split as the two counts
    // above. A count that quietly capped at six would read identically on a
    // page with seven undersized controls and one with seventy.
    distinctUnder44: undersized.length,
    undersized: undersized.slice(0, UNDERSIZED_CAP),
    // The reclassified ones, kept to the same split for the same reason. The
    // field keeps `distinctUnder44` honest: a candidate that left it must be
    // findable here, and one that vanished from both is a defect in this rule
    // rather than a fix.
    wrappers: wrapperSignatures.length,
    wrapperSignatures: wrapperSignatures.slice(0, UNDERSIZED_CAP),
    // The links in running text, to the same split and for the same reason.
    // Present even when empty: "measured none" and "not measured" are different
    // answers, and this whole report keeps them apart.
    inlineExempt: inlineSignatures.length,
    inlineSignatures: inlineSignatures.slice(0, UNDERSIZED_CAP),
  };
}

// ---------------------------------------------------------------------------
// Provenance — what a reading has to carry to be worth comparing
// ---------------------------------------------------------------------------

// Stamped on every run. Two readings are comparable only on the strength of
// this, so an unknown value is recorded as unknown: a guessed build identity
// would make two incomparable runs look alike, which is the failure this whole
// record exists to prevent.
export function provenance({
  account,
  baseUrl,
  build,
  capturedAt,
  routes,
  viewports,
  modals,
  pointer,
  precondition,
  postcondition,
  survey,
}) {
  return {
    account,
    baseUrl,
    build: build ?? null,
    capturedAt,
    routes,
    viewports,
    // What this run set out to cover, when that is not the canonical seven.
    // Null means "this is a canonical run", the way `modals: null` means "this
    // run did not cover modals" — never "it declared nothing and failed". Every
    // reading retained before surveys existed comes back null and keeps its
    // meaning, which is the only reason this could be added at all.
    survey: survey ?? null,
    // Which modal targets this run opened, by id. Null where none were asked
    // for — and every reading retained before this axis existed comes back
    // that way, which is what keeps them complete. Absence here is "this run
    // did not cover modals", never "this run covered none of them and failed".
    modals: modals ?? null,
    // Which pointer the browser reported while this was measured. Unlike the
    // build it is never unknown: the probe configures it, so an unstated one
    // is the mode it actually ran under rather than a fact nobody gathered.
    pointer: pointer ?? 'fine',
    precondition,
    // The same check, run again once everything has been measured. Null where
    // it was not performed — a reading from before this existed is not judged
    // on evidence nobody gathered.
    postcondition: postcondition ?? null,
  };
}

// ---------------------------------------------------------------------------
// Completeness and baseline eligibility — FR-006
// ---------------------------------------------------------------------------

const sameSet = (a, b) =>
  a.length === b.length && [...a].sort().join(' ') === [...b].sort().join(' ');

// Four ways to fall short, each named separately, because "incomplete" on its
// own tells you nothing about what to do next.
export function completeness({ provenance: prov, readings, errors = [] }) {
  const canonicalViewports = CANONICAL_VIEWPORTS.map(viewportKey);
  // A run is either canonical or a survey. A canonical run is judged against
  // CANONICAL_ROUTES and is the only kind that can be a baseline; a survey
  // declares its own coverage and is judged against that. Everything below this
  // point — errors, targets, missing readings, the bracket, the url check — is
  // shared, because none of it depends on which set was declared.
  const survey = prov.survey || null;

  // A declared gap excuses one surface, or one surface at one width. It is not
  // a free pass: it carries a reason, and a gap without one fails the run. The
  // difference between "/oauth/authorize needs a handshake in flight" and
  // silence is the whole value of a survey — a surface that was never reached
  // must never be able to look like one that was measured and found clean.
  const gaps = survey?.gaps || [];
  const unexplained = gaps.filter((g) => !g.reason || !String(g.reason).trim());
  if (unexplained.length) {
    return {
      complete: false,
      reason:
        `a declared gap carries no reason — ${unexplained.map((g) => g.surface).join(', ')}. ` +
        `A gap without a reason is indistinguishable from a surface nobody looked at`,
    };
  }
  const gapped = new Set(gaps.map((g) => g.surface));
  // Two forms, because a target can be unreachable at one width and fine at the
  // others: the surface alone, or the surface at a width.
  const isGap = (key, viewport) => gapped.has(key) || gapped.has(`${key}@${viewport}`);

  if (survey) {
    const owed = survey.routes.filter((r) => !gapped.has(r));
    if (!sameSet(prov.routes, owed)) {
      const absent = owed.filter((r) => !prov.routes.includes(r));
      const extra = prov.routes.filter((r) => !owed.includes(r));
      return {
        complete: false,
        reason:
          `the survey covered a different route set than it declared — ` +
          `${absent.length ? `missing ${absent.join(', ')}` : ''}` +
          `${absent.length && extra.length ? '; ' : ''}` +
          `${extra.length ? `undeclared ${extra.join(', ')}` : ''}`,
      };
    }
  } else if (!sameSet(prov.routes, CANONICAL_ROUTES)) {
    // Equal length AND equal contents, so a *widened* set fails exactly as a
    // narrowed one does. That is deliberate and is why surveys exist: a run
    // covering more routes is not a better canonical run, it is a different
    // kind of run, and letting it pass here would make the canonical series
    // stop meaning one thing.
    const absent = CANONICAL_ROUTES.filter((r) => !prov.routes.includes(r));
    const extra = prov.routes.filter((r) => !CANONICAL_ROUTES.includes(r));
    return {
      complete: false,
      reason: extra.length
        ? `widened route set — covered ${prov.routes.length} routes including ` +
          `${extra.join(', ')}, which are not canonical. A run beyond the canonical seven is a ` +
          `survey and has to declare itself one`
        : `narrowed route set — covered ${prov.routes.length} of the ${CANONICAL_ROUTES.length} ` +
          `canonical routes, leaving out ${absent.join(', ') || 'none'}`,
    };
  }

  // A survey's widths are its own declaration — `prov.viewports` is that
  // declaration, so there is nothing to hold it against but itself, and the
  // real check is the per-reading one further down. Stated rather than left
  // implicit: a second copy of the width list inside `survey` would be a second
  // place for the two to disagree.
  if (!survey && !sameSet(prov.viewports, canonicalViewports)) {
    const absent = canonicalViewports.filter((v) => !prov.viewports.includes(v));
    return {
      complete: false,
      reason:
        `narrowed width set — covered ${prov.viewports.length} of the ${canonicalViewports.length} ` +
        `canonical widths, leaving out ${absent.join(', ') || 'none'}`,
    };
  }

  if (errors.length) {
    return {
      complete: false,
      reason: `a route failed to produce a reading — ${errors
        .map((e) => `${e.route}@${e.viewport}`)
        .join(', ')}`,
    };
  }

  // The modal axis, checked only where a run declared one. A run that never
  // opened a modal is complete on its routes alone: that is not a concession,
  // it is the whole reason the axis is separate. baseline.json, touch-gate-1.json
  // and both phase-4 finals predate modals entirely, and an instrument that
  // marked four retained readings incomplete on arrival would be destroying the
  // history it was built to extend (PR3, R4).
  //
  // Where a run does declare targets, every one of them owes a reading at every
  // width the run covered — the same bar the routes are held to.
  //
  // A survey declares its targets in its own record, because a panel or a modal
  // outside CANONICAL_MODALS has nowhere else to say which widths it can be
  // reached at. Each entry is `{ id, widths? }` — the same shape a canonical
  // target already uses for `widths`, so this is the existing idea applied to a
  // declared target rather than a second one.
  const declaredTargets = survey
    ? survey.targets || []
    : (prov.modals || []).map((id) => CANONICAL_MODALS.find((m) => m.id === id) || { id });
  if (declaredTargets.length) {
    const absentModals = [];
    for (const target of declaredTargets) {
      // A target that declares `widths` is held to those and no others. Absent,
      // it owes a reading at every width the run covered. One rule, shared with
      // the driver, so the two cannot disagree about what a run owes.
      const key = targetKey(target);
      for (const viewport of reachableWidths(target, prov.viewports)) {
        if (isGap(key, viewport)) continue;
        if (!readings.some((r) => r.route === key && r.viewport === viewport)) {
          absentModals.push(`${key}@${viewport}`);
        }
      }
    }
    if (absentModals.length) {
      return {
        complete: false,
        reason: `no reading recorded for ${absentModals.join(', ')}`,
      };
    }
  }

  // A route can go missing without erroring — an interrupted loop, a reading
  // that failed to parse. Checked separately so the two are not reported as
  // the same thing.
  const absent = [];
  for (const viewport of prov.viewports) {
    for (const route of prov.routes) {
      if (isGap(route, viewport)) continue;
      if (!readings.some((r) => r.route === route && r.viewport === viewport)) {
        absent.push(`${route}@${viewport}`);
      }
    }
  }
  if (absent.length) {
    return { complete: false, reason: `no reading recorded for ${absent.join(', ')}` };
  }

  // The run bracketed at both ends. A session can stop rendering the app
  // partway through: the shell draws at the right url and the route's own
  // content never arrives, so a reading comes back with no primary action and
  // nothing clipped and is filed under the route it was asked for. The url
  // check below cannot see that, because the url is right — it is the same
  // false green as the expired session, one level further in.
  //
  // Measured 2026-08-16: four full runs passed every other check here while 14,
  // 8, 0 and 11 of each 28 readings held no content, and in all three bad runs
  // the failure was monotonic — once it started it never recovered. So the
  // closing check is the pre-flight run again after the last reading.
  //
  // This brackets the run; it does not certify each reading. A session that
  // broke and recovered would pass. That is the honest limit of one navigation,
  // and it is cheaper than re-checking on every reading.
  const closing = prov.postcondition;
  if (closing && closing.verdict !== 'qualified' && closing.verdict !== 'waived') {
    return {
      complete: false,
      reason:
        `the app was no longer rendering for this account when the run finished — ` +
        `${closing.reason}. Readings taken after it stopped are of a page with no content in ` +
        `them, and there is no way to tell from here which ones those are`,
    };
  }

  // A reading of the wrong page is not a reading of the route it is filed
  // under. When the session expires mid-run every later navigation redirects to
  // /auth, and without this the run scores complete on a set of readings of the
  // sign-in page — the exact false green this harness exists to prevent, one
  // level up from the account precondition. A redirect deeper into the same
  // route (/agents to /agents/new) is still that route.
  //
  // A modal reading is filed under `modal:compose` and taken at /launches, so
  // it is compared against the route it was opened from rather than against its
  // own key. Without this every modal reading trips a check meant for expired
  // sessions and no run is ever complete again — and with it the check still
  // catches what it exists for, because a modal measured after the session
  // expired was measured on the sign-in page.
  const expectedPath = (r) => (isTargetReading(r) ? r.openedAt : r.route);
  const elsewhere = readings.filter(
    (r) => r.url !== expectedPath(r) && !String(r.url).startsWith(`${expectedPath(r)}/`)
  );
  if (elsewhere.length) {
    const landed = [...new Set(elsewhere.map((r) => r.url))];
    return {
      complete: false,
      reason:
        `${elsewhere.length} reading(s) were taken somewhere other than the route requested — ` +
        `landed on ${landed.join(', ')} (first: ${elsewhere[0].route}@${elsewhere[0].viewport})`,
    };
  }

  return { complete: true, reason: null };
}

// The conjunction from FR-006: complete, and the precondition passed unwaived.
// The precondition is tested first because it is the more fundamental failure —
// a run nobody can trust is not made trustworthy by covering more routes.
export function baselineEligibility(run) {
  const { verdict } = run.provenance.precondition;

  // Tested before the precondition, because it is not a shortfall to be fixed:
  // a survey covers a different set of surfaces and cannot be diffed against
  // the canonical series at all. Not by promotion, not by renaming, not by
  // being the only reading a surface has ever had.
  if (run.provenance.survey) {
    return {
      eligible: false,
      reason:
        'this is a survey run — it declares its own coverage and is judged against that, so it ' +
        'has nothing in common with the canonical series a baseline has to be comparable to',
    };
  }

  if (verdict === 'waived') {
    return {
      eligible: false,
      reason:
        'the precondition was waived — a waived run records what an environment that cannot ' +
        'reproduce the failure looks like, which is the one thing a baseline must not be',
    };
  }
  if (verdict !== 'qualified') {
    return { eligible: false, reason: `the precondition did not pass — ${verdict}` };
  }

  const { complete, reason } = completeness(run);
  return complete ? { eligible: true, reason: null } : { eligible: false, reason };
}

// ---------------------------------------------------------------------------
// The baseline — an accepted run, plus what its numbers are worth
// ---------------------------------------------------------------------------

// Measured, not reasoned about: two back-to-back full runs against an unchanged
// deployment, diffed field by field (research R5). Fields that agreed across
// both runs are stable and are what a comparison reports on; fields that moved
// are advisory and are shown without being treated as regressions.
//
// A baseline that cannot say which of its numbers mean anything is not worth
// keeping, so this travels with it rather than living only here.
// Measured 2026-08-15 over four full runs against build 75f40e48, 28 readings
// each, no errors. The first pair, thirteen minutes apart, agreed on every
// field. The next pair did not: `touch.total` on `/launches` came back one
// lower at 820, 1024 and 1440 — 27→26 and 54→53 — while all 25 other readings
// and every other field stayed identical.
//
// So `touch.total` is advisory. One interactive element on the calendar comes
// and goes between runs with nothing changing in the app, which is enough to
// disqualify it as a regression signal even though the movement is small.
// `touch.under44` held across all four runs and was stable on that evidence
// until 2026-08-17 — see the demotion at the end of this note, which is the same
// field failing a test four runs minutes apart could not perform.
//
// Neither instability research R5 anticipated is what showed up: the 1800ms
// settle never caught a panel mid-render and `clippedCount` never moved. The
// one that did was not predicted at all, and was found by running `--compare`
// against the freshly captured baseline. Add to `advisory` when a field is
// shown to move; do not explain a movement away.
//
// `collisionCount` and `worstOverlapPx` arrived with the collision detector and
// were advisory until measured, for the plainest reason there is: nothing had
// measured them. Settled 2026-08-16 over four more full runs against the same
// unchanged build 75f40e48 — 28 readings each, no errors, every run qualified at
// both ends — and both fields came back identical in all 112 readings. Stable.
//
// The first attempt at that measurement is the reason the closing check exists,
// and is worth keeping. It produced four runs that agreed with each other and
// meant nothing: 14, 8, 0 and 11 of each 28 readings held a page that had drawn
// its shell and no content, and nothing in the harness could see it. These four
// were each checked reading by reading against the baseline's own figure for
// that route and width before being believed — 0 of 28 suspect in all four.
//
// Read the result for what it is. Every one of those 112 readings was zero, so
// four runs establish that the detector does not fire at random, not that some
// particular non-zero figure reproduces. That is the assurance a gate needs —
// the field exists to catch a rise, and from a floor of zero any rise is real —
// but it is a weaker demonstration than a field with a moving figure would give,
// and should not be quoted as a stronger one.
//
// `touch.under44` is advisory as of 2026-08-17, and how it got there matters more
// than the demotion. Comparing a Monday run against the Saturday baseline,
// `/launches@820` read 15 → 172 with nothing in the app changed. `calendar.tsx`
// renders an hour cell's drop target only while that hour is still ahead, so the
// count of interactive elements on the route follows where *now* falls in the
// displayed week: a week that has just started offers roughly 150 of them, a
// week nearly over a couple of dozen. Runs taken minutes apart share a week
// position and agree exactly — which is how a field that is reproducible within
// a sitting and not across one passed for stable, and why four runs is a floor
// for that claim rather than a proof of it.
//
// Getting it back means fixing the instrument, not the classification: count
// undersized targets by `tag + class` signature, the way `clipped` and
// `collisions` already dedupe, so one undersized control counts once however
// often the calendar repeats it. Built 2026-08-17 as `reportableUndersized`
// above, ahead of 016-responsive-primitives rather than inside it — the 44px
// floor is that feature's subject, and it cannot gate on a field that follows
// the day. `touch.under44` is left exactly as it was: it is the only place the
// instance count survives, and "184 of them, 3 controls" is one finding read
// two ways, not one figure superseding another.
export const VARIANCE = {
  method:
    'four full runs against an unchanged deployment, diffed field by field — two back to back, ' +
    'then the captured baseline against a fresh run',
  measuredOn: [
    '2026-08-15T20:19:15.162Z',
    '2026-08-15T20:32:04.722Z',
    '2026-08-15T20:59:25.739Z',
    '2026-08-15T21:18:43.684Z',
  ],
  build: '75f40e48bc56b622946899b46533f1fda0ff99ac',
  stable: [
    'cta.verdict',
    'cta.w',
    'cta.h',
    'cta.coveredBy',
    'clippedCount',
    // Corrected 2026-08-20, when the clip decision moved into this file: the
    // scan deduped by tag + class and kept whichever instance came first in
    // document order, so a page whose earlier `div.foo` lost 10px and whose
    // later one lost 300 reported 10. It now keeps the deepest instance, which
    // is what the two rules below had always done. Readings taken before that
    // date may therefore under-report this field where one signature clipped at
    // more than one depth.
    //
    // It stays stable, and the distinction matters: it is not less reproducible
    // than it was, it is more accurate. `clippedCount` is untouched either way —
    // how many signatures clear the floor does not depend on which instance
    // represents one — and the corrected figure can only be greater than or
    // equal to the old one, never smaller.
    //
    // On 5713eb2f the correction moved nothing. Exactly one of the 70 retained
    // readings has any clipping at all (`/settings@390x844`, three signatures,
    // all cutting 28), and the fine run of 2026-08-20 read 28 there before and
    // after. The claim rests on the fixtures and on a property check over
    // 20,000 randomised candidate lists, because the instrument had no
    // opportunity to show it.
    'worstCutPx',
    'sidewaysScrollPx',
    'precondition.customerControlPresent',
    // Promoted 2026-08-16 on the four-run measurement described above.
    //
    // Narrowed 2026-08-20 on the modal axis, and only there: on a reading taken
    // with a modal open, a pair counts only when both participants are inside
    // it. **Modal readings taken before that date are not comparable on this
    // field** — the seven in `post-017-fine-final.json` carry 38 counted pairs
    // between them, none of which the current definition would count unless it
    // is genuinely inside the modal.
    //
    // It stays stable. The four-run evidence was gathered on route readings,
    // where no modal is open and the boundary filter does not run at all, so
    // nothing in that measurement is disturbed. On the modal axis the field was
    // never measured for reproducibility in the first place — which is the
    // reason the drop is reported and explained rather than hidden behind a
    // demotion. The same date and the same reasoning apply to `worstOverlapPx`,
    // which is the maximum over that same restricted set.
    'collisionCount',
    'worstOverlapPx',
  ],
  // Demoted 2026-08-17: `touch.under44` is reproducible within a sitting and not
  // across one. See the note above.
  //
  // `touch.distinctUnder44` is the instrument fix that note called for, and it
  // arrives advisory for the reason the two collision fields did: nothing has
  // measured it. The construction argument is strong — the hour cell's class is
  // static across all ~150 of its instances, so the swing that demoted
  // `touch.under44` cannot reach a count of signatures — and an argument is not
  // four runs. Promote it after the measurement, and expect a known ±1 when the
  // displayed week is entirely in the past and the signature is absent rather
  // than smaller.
  //
  // `wrapper.w` and `wrapper.h` arrive with the modal axis and arrive advisory,
  // for the plainest reason there is and the same one `collisionCount` and
  // `touch.distinctUnder44` arrived with: nothing has measured them. The
  // construction argument is good — a modal's width is min-content of its own
  // subtree, and compose's 809 is 580px of fixed-width preview pane plus 80px of
  // padding, none of which follows the clock the way the calendar's hour cells
  // do — and a construction argument is not a run. Promote after two runs on one
  // build agree (PR6), and say in this note that the promotion rests on two runs
  // rather than the four the fields above were held to.
  //
  // One caveat the promotion has to survive rather than skip: a target that
  // opens compose over an existing post measures that post's content. Its width
  // is stable while the account is, and it is not stable across a change to the
  // draft the account holds — which is a reason to keep the axis's targets few
  // and to keep the account still, not a reason to leave the field out.
  //
  // `clippedInside` arrives with the modal boundary and arrives advisory, for
  // the reason every field before it did: nothing has measured it. There is a
  // construction argument — it is a count of signatures, the shape that made
  // `touch.distinctUnder44` immune to the swing that demoted `touch.under44`,
  // and it is scoped to a modal whose subtree does not follow the clock — and a
  // construction argument is not a run. What makes the promotion harder here
  // than it was for the wrapper widths is that on this build the field has
  // nothing to be reproducible about: all seven modal readings carry
  // `clippedCount: 0` document-wide, so the figure is 0 everywhere and four
  // agreeing runs would establish only that the detector does not fire at
  // random. That is the same weaker demonstration the collision fields got from
  // a floor of zero, and it should not be quoted as a stronger one. Promote it
  // on a build where a modal actually clips something.
  advisory: [
    'touch.total',
    'touch.under44',
    'touch.distinctUnder44',
    // Added 2026-08-21 with the wrapper rule. Advisory rather than stable for
    // the reason `clippedInside` is: it has no four-run demonstration behind it,
    // and a field promoted on nothing but its own novelty is the kind of claim
    // this record exists to refuse. It is listed rather than omitted so that
    // `introduced` reports it against every baseline that predates it —
    // silence is the one thing this harness must not produce.
    'touch.wrappers',
    'wrapper.w',
    'wrapper.h',
    'clippedInside',
  ],
  // Deliberately outside both lists, so a comparison never mentions them:
  //   build          — provenance, printed above the diff. Comparing it per
  //                    reading would report four rows after every deploy, which
  //                    is precisely when the layout signal needs to be clean.
  //   touch.pct      — derived from total and under44, so it cannot move on its
  //                    own. Including it would report one fact three times.
  //   clipped[],
  //   smallest[],
  //   collisions[],
  //   undersized[]   — detail carried in the baseline for reading by hand, too
  //                    noisy to diff element by element. `undersized[]` carries
  //                    the instance count the dedupe would otherwise discard,
  //                    which is where "one control, 150 of it" is legible.
  //   wrapperSignatures[]
  //                  — the same, for the same reason. It is what makes a
  //                    reclassification auditable by hand; `touch.wrappers`
  //                    above is the figure a comparison reports on.
  notCompared: [
    'build',
    'touch.pct',
    'clipped',
    'smallest',
    'collisions',
    'undersized',
    'wrapperSignatures',
  ],
};

export const baseline = (run) => ({ ...run, variance: VARIANCE });

// ---------------------------------------------------------------------------
// Comparing a fresh run against the baseline — FR-011, FR-012
// ---------------------------------------------------------------------------

// Everything provenance records except the build, which is deliberately not a
// condition: a different build is the whole reason anyone compares two runs.
// The rest are not differences to report, they are reasons the two readings
// were never measuring the same thing.
// A reading retained before the coarse mode existed carries no pointer at all.
// Reading those as fine is a fact about when they were taken — the probe had no
// other mode — not a default applied to make a comparison go through.
const pointerOf = (prov) => prov.pointer ?? 'fine';

export function comparability(baselineRun, run) {
  const was = baselineRun.provenance;
  const now = run.provenance;

  if (was.account !== now.account) {
    return {
      comparable: false,
      reason: `different account — the baseline was taken on ${was.account}, this run on ${now.account}`,
    };
  }
  if (was.baseUrl !== now.baseUrl) {
    return {
      comparable: false,
      reason: `different target — the baseline measured ${was.baseUrl}, this run measured ${now.baseUrl}`,
    };
  }
  if (!sameSet(was.routes, now.routes)) {
    return {
      comparable: false,
      reason: `different route set — the baseline covered ${was.routes.join(' ')}, this run covered ${now.routes.join(' ')}`,
    };
  }
  if (!sameSet(was.viewports, now.viewports)) {
    return {
      comparable: false,
      reason: `different width set — the baseline covered ${was.viewports.join(' ')}, this run covered ${now.viewports.join(' ')}`,
    };
  }
  // Not a difference to report: every touch figure moves under a coarse
  // pointer by design, so a cross-mode diff would show the instrument moving
  // and read as though the app had.
  if (pointerOf(was) !== pointerOf(now)) {
    return {
      comparable: false,
      reason: `different pointer mode — the baseline was taken under a ${pointerOf(was)} pointer, this run under a ${pointerOf(now)} one`,
    };
  }
  return { comparable: true, reason: null };
}

const at = (obj, path) => path.split('.').reduce((v, k) => (v == null ? v : v[k]), obj);

// What moved, route by route and width by width. Only the fields the baseline
// declares stable count as changes; the ones it declares advisory are shown
// separately and are not evidence of anything. A field in neither list is not
// reported at all — the variance profile is the whole vocabulary of a
// comparison, which is why a baseline without one is not worth keeping.
export function difference(baselineRun, run) {
  // The backstop under comparability(), which is the graceful path run.mjs
  // takes. This one is for a caller that skipped it: there is no honest diff
  // between two pointer modes, and returning no changes would assert the one
  // thing that is certainly false.
  if (pointerOf(baselineRun.provenance) !== pointerOf(run.provenance)) {
    throw new Error(
      `refusing to diff across pointer modes — the baseline was taken under a ` +
        `${pointerOf(baselineRun.provenance)} pointer, this run under a ` +
        `${pointerOf(run.provenance)} one`
    );
  }

  const changes = [];
  const advisory = [];

  // Fields this code measures that the baseline's profile has never heard of.
  // The loop below reads the profile stored *in the baseline*, so without this
  // a newly added field is simply absent from every comparison against an older
  // one: not an error, not a change, and not mentioned. Silence is the one
  // thing this harness exists not to produce. A flat list of names, because a
  // new instrument is a property of the run rather than of any reading.
  const known = new Set([...baselineRun.variance.stable, ...baselineRun.variance.advisory]);
  const introduced = [...VARIANCE.stable, ...VARIANCE.advisory].filter((f) => !known.has(f));

  for (const before of baselineRun.readings) {
    const after = run.readings.find(
      (r) => r.route === before.route && r.viewport === before.viewport
    );

    // A route the fresh run never reached. Reported, because "no reading" and
    // "no change" must never look alike.
    if (!after) {
      changes.push({
        route: before.route,
        viewport: before.viewport,
        field: 'reading',
        from: 'measured',
        to: 'missing',
      });
      continue;
    }

    for (const [fields, into] of [
      [baselineRun.variance.stable, changes],
      [baselineRun.variance.advisory, advisory],
    ]) {
      for (const field of fields) {
        const from = at(before, field);
        const to = at(after, field);
        if (JSON.stringify(from) !== JSON.stringify(to)) {
          into.push({ route: before.route, viewport: before.viewport, field, from, to });
        }
      }
    }
  }

  // Readings this run took that the baseline never held. `introduced` says the
  // same thing one level down — a field the baseline predates — and this is its
  // reading-level twin. The loop above walks the *baseline's* readings, so a
  // compose reading held against baseline.json, which predates the modal axis
  // entirely, is not compared and without this would not be mentioned either:
  // four measurements taken on every run and reported on none.
  const held = new Set(baselineRun.readings.map((r) => `${r.route}@${r.viewport}`));
  const unpaired = run.readings
    .filter((r) => !held.has(`${r.route}@${r.viewport}`))
    .map((r) => ({ route: r.route, viewport: r.viewport }));

  return { changes, advisory, introduced, unpaired };
}
