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
}) {
  return {
    account,
    baseUrl,
    build: build ?? null,
    capturedAt,
    routes,
    viewports,
    precondition,
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
// `touch.under44` held across all four runs and stays stable — and it is the
// number that matters, since the 44px floor is about how many controls are too
// small, not how many exist.
//
// Neither instability research R5 anticipated is what showed up: the 1800ms
// settle never caught a panel mid-render and `clippedCount` never moved. The
// one that did was not predicted at all, and was found by running `--compare`
// against the freshly captured baseline. Add to `advisory` when a field is
// shown to move; do not explain a movement away.
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
    'touch.under44',
    'sidewaysScrollPx',
    'precondition.customerControlPresent',
  ],
  advisory: ['touch.total'],
  // Deliberately outside both lists, so a comparison never mentions them:
  //   build          — provenance, printed above the diff. Comparing it per
  //                    reading would report four rows after every deploy, which
  //                    is precisely when the layout signal needs to be clean.
  //   touch.pct      — derived from total and under44, so it cannot move on its
  //                    own. Including it would report one fact three times.
  //   clipped[],
  //   smallest[]     — detail carried in the baseline for reading by hand, too
  //                    noisy to diff element by element.
  notCompared: ['build', 'touch.pct', 'clipped', 'smallest'],
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

  return { changes, advisory };
}
