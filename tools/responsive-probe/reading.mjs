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

// A pair is unordered, so its signature is too — the same two participants the
// other way round is the same finding, not a second one.
const pairSignature = (c) => [c.a.tag + c.a.cls, c.b.tag + c.b.cls].sort().join(' | ');

export function reportableCollisions(candidates) {
  const seen = new Set();
  const collisions = [];

  // Sorted before it is deduped, so the worst instance of a repeated signature
  // survives. The seven day-header pairs on the calendar share one signature;
  // keeping whichever came first in document order would report a smaller
  // overlap than the one that was measured.
  for (const c of [...candidates].sort((x, y) => y.overlapPx - x.overlapPx)) {
    if (!c.aFlow || !c.bFlow) continue;
    if (c.overlapPx <= COLLISION_FLOOR_PX) continue;
    const key = pairSignature(c);
    if (seen.has(key)) continue;
    seen.add(key);
    // The flow flags decided the finding; they are not part of it.
    collisions.push({ overlapPx: c.overlapPx, a: c.a, b: c.b });
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
  precondition,
  postcondition,
}) {
  return {
    account,
    baseUrl,
    build: build ?? null,
    capturedAt,
    routes,
    viewports,
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

  if (!sameSet(prov.routes, CANONICAL_ROUTES)) {
    const absent = CANONICAL_ROUTES.filter((r) => !prov.routes.includes(r));
    return {
      complete: false,
      reason:
        `narrowed route set — covered ${prov.routes.length} of the ${CANONICAL_ROUTES.length} ` +
        `canonical routes, leaving out ${absent.join(', ') || 'none'}`,
    };
  }

  if (!sameSet(prov.viewports, canonicalViewports)) {
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

  // A route can go missing without erroring — an interrupted loop, a reading
  // that failed to parse. Checked separately so the two are not reported as
  // the same thing.
  const absent = [];
  for (const viewport of prov.viewports) {
    for (const route of prov.routes) {
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
  const elsewhere = readings.filter(
    (r) => r.url !== r.route && !String(r.url).startsWith(`${r.route}/`)
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
// often the calendar repeats it. That belongs to 016-responsive-primitives — the
// 44px floor is its subject and it needs a figure it can gate on — so it is
// recorded here rather than guessed at now.
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
    'worstCutPx',
    'sidewaysScrollPx',
    'precondition.customerControlPresent',
    // Promoted 2026-08-16 on the four-run measurement described above.
    'collisionCount',
    'worstOverlapPx',
  ],
  // Demoted 2026-08-17: `touch.under44` is reproducible within a sitting and not
  // across one. See the note above.
  advisory: ['touch.total', 'touch.under44'],
  // Deliberately outside both lists, so a comparison never mentions them:
  //   build          — provenance, printed above the diff. Comparing it per
  //                    reading would report four rows after every deploy, which
  //                    is precisely when the layout signal needs to be clean.
  //   touch.pct      — derived from total and under44, so it cannot move on its
  //                    own. Including it would report one fact three times.
  //   clipped[],
  //   smallest[],
  //   collisions[]   — detail carried in the baseline for reading by hand, too
  //                    noisy to diff element by element.
  notCompared: ['build', 'touch.pct', 'clipped', 'smallest', 'collisions'],
};

export const baseline = (run) => ({ ...run, variance: VARIANCE });

// ---------------------------------------------------------------------------
// Comparing a fresh run against the baseline — FR-011, FR-012
// ---------------------------------------------------------------------------

// Everything provenance records except the build, which is deliberately not a
// condition: a different build is the whole reason anyone compares two runs.
// The rest are not differences to report, they are reasons the two readings
// were never measuring the same thing.
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
  return { comparable: true, reason: null };
}

const at = (obj, path) => path.split('.').reduce((v, k) => (v == null ? v : v[k]), obj);

// What moved, route by route and width by width. Only the fields the baseline
// declares stable count as changes; the ones it declares advisory are shown
// separately and are not evidence of anything. A field in neither list is not
// reported at all — the variance profile is the whole vocabulary of a
// comparison, which is why a baseline without one is not worth keeping.
export function difference(baselineRun, run) {
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

  return { changes, advisory, introduced };
}
