// Tests for the probe's decision logic. Run them with:
//
//   node --test 'tools/responsive-probe/*.test.mjs'
//
// Node's built-in runner, because no jest project in this repo covers tools/
// and the probe has no dependencies to add one to. Pass the glob, not the
// directory: since Node 22.6 a positional is a glob pattern, and a bare
// directory matches nothing.
//
// Everything tested here is a pure function of data already in hand. The
// browser side — the DOM queries, the settle timing, the subprocess calls —
// is validated by a real run against the deployed app instead. See
// specs/014-probe-baseline/data-model.md#the-test-boundary.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  CANONICAL_MODALS,
  CANONICAL_ROUTES,
  CANONICAL_VIEWPORTS,
  VARIANCE,
  arrival,
  baseline,
  baselineEligibility,
  comparability,
  completeness,
  difference,
  modalKey,
  preconditionVerdict,
  isModalReading,
  isTargetReading,
  provenance,
  reachableWidths,
  reportableClipped,
  reportableCollisions,
  reportableUndersized,
  targetKey,
  viewportKey,
} from './reading.mjs';

// A complete, qualifying run — the shape every test below narrows from.
const QUALIFIED = preconditionVerdict({ pageRendered: true, customerControlPresent: true });

const readingFor = (route, viewport) => ({
  route,
  viewport,
  url: route,
  vw: Number(viewport.split('x')[0]),
  cta: route === '/launches' ? { verdict: 'COVERED', w: 120, h: 42 } : null,
  clippedCount: 0,
  worstCutPx: 0,
  clipped: [],
  touch: { total: 40, under44: 3, pct: 8 },
  smallest: [],
  sidewaysScrollPx: 0,
});

function makeRun(overrides = {}) {
  const routes = overrides.routes || CANONICAL_ROUTES;
  const viewports = overrides.viewports || CANONICAL_VIEWPORTS.map(viewportKey);
  return {
    provenance: provenance({
      account: 'probe@example.com',
      baseUrl: 'https://dash.sharek.app',
      build: 'a'.repeat(40),
      capturedAt: '2026-08-15T12:00:00.000Z',
      routes,
      viewports,
      precondition: overrides.precondition || QUALIFIED,
      // `null` is meaningful and distinct from absent: it is how a reading from
      // before the closing check existed comes back.
      postcondition:
        overrides.postcondition === undefined ? QUALIFIED : overrides.postcondition,
      // Left absent unless a test names one, so the default is what most of
      // these exercise — the shape every invocation predating coarse mode has.
      pointer: overrides.pointer,
    }),
    readings: viewports.flatMap((v) => routes.map((r) => readingFor(r, v))),
    errors: [],
    ...(overrides.run || {}),
  };
}

// ---------------------------------------------------------------------------
// Precondition — FR-001 to FR-004
// ---------------------------------------------------------------------------

test('rendered page with the customer control present qualifies', () => {
  const { verdict } = preconditionVerdict({
    pageRendered: true,
    customerControlPresent: true,
  });
  assert.equal(verdict, 'qualified');
});

test('rendered page without the customer control is unqualified', () => {
  const { verdict } = preconditionVerdict({
    pageRendered: true,
    customerControlPresent: false,
  });
  assert.equal(verdict, 'unqualified');
});

test('a page that did not render means the check is broken, not the account', () => {
  const { verdict } = preconditionVerdict({
    pageRendered: false,
    customerControlPresent: false,
  });
  assert.equal(verdict, 'check-broken');
});

test('an explicit waiver is honoured over any observation', () => {
  const { verdict } = preconditionVerdict({
    pageRendered: true,
    customerControlPresent: false,
    waived: true,
  });
  assert.equal(verdict, 'waived');
});

test('a waiver still reports what was observed underneath it', () => {
  const onABrokenCheck = preconditionVerdict({
    pageRendered: false,
    customerControlPresent: false,
    waived: true,
  });
  const onAnUnqualifiedAccount = preconditionVerdict({
    pageRendered: true,
    customerControlPresent: false,
    waived: true,
  });
  assert.equal(onABrokenCheck.verdict, 'waived');
  assert.equal(onAnUnqualifiedAccount.verdict, 'waived');
  // The waiver says "measure anyway", not "and never mind why". Two waived
  // runs for different underlying reasons must not read identically.
  assert.notEqual(onABrokenCheck.reason, onAnUnqualifiedAccount.reason);
});

test('every verdict states a reason', () => {
  for (const observed of [
    { pageRendered: true, customerControlPresent: true },
    { pageRendered: true, customerControlPresent: false },
    { pageRendered: false, customerControlPresent: false },
    { pageRendered: true, customerControlPresent: false, waived: true },
  ]) {
    const { reason } = preconditionVerdict(observed);
    assert.equal(typeof reason, 'string');
    assert.ok(reason.length > 0, `empty reason for ${JSON.stringify(observed)}`);
  }
});

test('an unqualified verdict says what would satisfy the precondition', () => {
  const { remedy } = preconditionVerdict({
    pageRendered: true,
    customerControlPresent: false,
  });
  assert.ok(remedy && remedy.length > 0, 'unqualified must carry a remedy (FR-002)');
});

// FR-003 — the two failures must never be confused for one another.
test('a broken check is never reported as an account problem', () => {
  const broken = preconditionVerdict({ pageRendered: false, customerControlPresent: false });
  const unqualified = preconditionVerdict({ pageRendered: true, customerControlPresent: false });

  assert.notEqual(broken.verdict, unqualified.verdict);
  assert.notEqual(broken.reason, unqualified.reason);
  // Machine-readable, so the runner's wording cannot drift from the verdict.
  assert.equal(broken.blames, 'check');
  assert.equal(unqualified.blames, 'account');
});

test('a passing or waived precondition blames nobody', () => {
  assert.equal(
    preconditionVerdict({ pageRendered: true, customerControlPresent: true }).blames,
    null
  );
  assert.equal(
    preconditionVerdict({ pageRendered: true, customerControlPresent: false, waived: true }).blames,
    null
  );
});

// ---------------------------------------------------------------------------
// Completeness — FR-006
// ---------------------------------------------------------------------------

test('a full run over the canonical sets is complete', () => {
  const { complete, reason } = completeness(makeRun());
  assert.equal(complete, true);
  assert.equal(reason, null);
});

test('a narrowed route set makes a run incomplete', () => {
  const { complete, reason } = completeness(makeRun({ routes: ['/launches'] }));
  assert.equal(complete, false);
  assert.match(reason, /route/i);
});

test('a narrowed viewport set makes a run incomplete', () => {
  const { complete, reason } = completeness(makeRun({ viewports: ['1440x900'] }));
  assert.equal(complete, false);
  assert.match(reason, /width|viewport/i);
});

test('an errored route makes a run incomplete', () => {
  const run = makeRun();
  run.errors = [{ route: '/billing', viewport: '820x1180', message: 'timed out' }];
  const { complete, reason } = completeness(run);
  assert.equal(complete, false);
  assert.match(reason, /\/billing/);
});

test('a missing reading makes a run incomplete even with no error recorded', () => {
  const run = makeRun();
  run.readings = run.readings.filter(
    (r) => !(r.route === '/agents' && r.viewport === '390x844')
  );
  const { complete, reason } = completeness(run);
  assert.equal(complete, false);
  assert.match(reason, /\/agents/);
});

// Found by running it: a session that expires mid-run leaves every later
// navigation redirected to /auth, and the probe measures the sign-in page
// while recording it under the route it asked for. Twenty-eight readings, no
// errors, canonical sets, a qualified pre-flight — and sixteen of them of a
// page nobody asked to measure. The evidence was already in each reading;
// nothing looked at it.
test('a reading taken on a different page than the one requested makes a run incomplete', () => {
  const run = makeRun();
  for (const r of run.readings) {
    if (r.viewport === '1440x900') r.url = '/auth';
  }
  const { complete, reason } = completeness(run);
  assert.equal(complete, false);
  assert.match(reason, /\/auth/);
});

test('a redirect deeper into the same route is still that route', () => {
  const run = makeRun();
  // /agents lands on /agents/new when the account has no agent yet.
  for (const r of run.readings) {
    if (r.route === '/agents') r.url = '/agents/new';
  }
  assert.equal(completeness(run).complete, true);
});

// Found by running it, twice over. A session can stop rendering the app partway
// through a run: the shell draws at the right URL and the route's own content
// never arrives, so `/launches` comes back with no primary action and nothing
// clipped. Four runs on 2026-08-16 passed every check here — 28 readings, no
// errors, canonical sets, a qualified pre-flight — while 14, 8, 0 and 11 of each
// 28 were of a page with no content in it. The url check above cannot see this,
// because the url is right; it is the same false green one level further in.
//
// The degradation was monotonic in all three bad runs: once it started, every
// later reading was affected. So the run is bracketed — the pre-flight is run
// again at the end, and a run that finished on a session no longer rendering is
// not a run. This is a bracket and not a per-reading guarantee: a session that
// broke and recovered would pass, and that is stated rather than papered over.
const BROKEN = preconditionVerdict({ pageRendered: false, customerControlPresent: false });

test('a run still rendering the app at the end is complete', () => {
  const { complete, reason } = completeness(makeRun({ postcondition: QUALIFIED }));
  assert.equal(complete, true);
  assert.equal(reason, null);
});

test('a run that finished on a session no longer rendering is incomplete', () => {
  const { complete, reason } = completeness(makeRun({ postcondition: BROKEN }));
  assert.equal(complete, false);
  assert.match(reason, /render/i);
});

test('an account that stopped qualifying mid-run is incomplete too', () => {
  const unqualified = preconditionVerdict({ pageRendered: true, customerControlPresent: false });
  assert.equal(completeness(makeRun({ postcondition: unqualified })).complete, false);
});

test('a waived run is not failed by its closing check', () => {
  // The waiver says "measure anyway", and it says so about both ends.
  const waived = preconditionVerdict({
    pageRendered: false,
    customerControlPresent: false,
    waived: true,
  });
  assert.equal(completeness(makeRun({ postcondition: waived })).complete, true);
});

test('a reading taken before the closing check existed is not failed for lacking one', () => {
  // Absent is not the same as failed: what was never observed cannot be judged,
  // the same way an absent build is recorded rather than guessed at.
  assert.equal(completeness(makeRun({ postcondition: null })).complete, true);
});

test('a run that died mid-run is not eligible as a baseline', () => {
  const { eligible, reason } = baselineEligibility(makeRun({ postcondition: BROKEN }));
  assert.equal(eligible, false);
  assert.match(reason, /render/i);
});

test('each way of being incomplete gives its own reason', () => {
  const errored = makeRun();
  errored.errors = [{ route: '/billing', viewport: '820x1180', message: 'timed out' }];
  const missing = makeRun();
  missing.readings = missing.readings.slice(0, -1);
  const elsewhere = makeRun();
  elsewhere.readings[0].url = '/auth';

  const reasons = [
    completeness(makeRun({ routes: ['/launches'] })).reason,
    completeness(makeRun({ viewports: ['1440x900'] })).reason,
    completeness(errored).reason,
    completeness(missing).reason,
    completeness(elsewhere).reason,
    completeness(makeRun({ postcondition: BROKEN })).reason,
  ];
  assert.equal(new Set(reasons).size, reasons.length, 'reasons must be distinguishable');
});

// ---------------------------------------------------------------------------
// The generalised target — 020 FR-015 to FR-017
// ---------------------------------------------------------------------------

const panelTarget = (over = {}) => ({
  id: 'settings-teams',
  kind: 'panel',
  route: '/settings',
  open: [{ click: 'div.w-\\[260px\\] > div > div:nth-child(2)' }],
  settle: 1200,
  arrived: 'table.teams',
  ...over,
});

test('a modal target arrives when a modal root is on the page', () => {
  const target = { id: 'compose', kind: 'modal', route: '/launches' };
  assert.equal(arrival(target, { modalOpen: true }).arrived, true);
  assert.equal(arrival(target, { modalOpen: false }).arrived, false);
});

test('a target with no kind is a modal, so every existing target keeps working', () => {
  assert.equal(arrival({ id: 'compose', route: '/launches' }, { modalOpen: true }).arrived, true);
});

test('a panel target arrives when its declared selector is laid out', () => {
  assert.equal(arrival(panelTarget(), { selectorLaidOut: true }).arrived, true);
  assert.equal(arrival(panelTarget(), { selectorLaidOut: false }).arrived, false);
});

test('a target that did not arrive says so with the selector that failed', () => {
  // The reason has to name what was looked for. "did not open" on its own sends
  // whoever reads it back to the source to find out what was asserted.
  const { arrived, reason } = arrival(panelTarget(), { selectorLaidOut: false });
  assert.equal(arrived, false);
  assert.match(reason, /table\.teams/);
  assert.match(reason, /settings-teams/);
});

test('a panel target with no arrival assertion is refused, not defaulted', () => {
  // The strongest false green this instrument could emit is a reading of
  // whatever the page happened to show, filed under the panel's name.
  assert.throws(() => arrival(panelTarget({ arrived: undefined }), { selectorLaidOut: true }), /assertion/i);
});

test('a panel target judged without asking whether it arrived is refused', () => {
  assert.throws(() => arrival(panelTarget()), /without asking/i);
});

test('an unknown target kind is refused rather than guessed', () => {
  assert.throws(() => arrival(panelTarget({ kind: 'drawer' })), /drawer/);
});

test('a target declaring widths owes a reading at exactly those', () => {
  const viewports = CANONICAL_VIEWPORTS.map(viewportKey);
  assert.deepEqual(reachableWidths({ id: 'compose-existing', widths: [820, 1024, 1440] }, viewports), [
    '820x1180',
    '1024x768',
    '1440x900',
  ]);
});

test('a target declaring no widths owes a reading at every width the run covered', () => {
  const viewports = CANONICAL_VIEWPORTS.map(viewportKey);
  assert.deepEqual(reachableWidths({ id: 'compose' }, viewports), viewports);
});

test('a panel reading is keyed as a panel, not filed under modal:', () => {
  // Every comparison pairs on `route`. A panel filed as `modal:` would be a
  // reading that lies about what it measured in the one field that decides
  // which two readings are the same measurement.
  assert.equal(targetKey({ id: 'settings-teams', kind: 'panel' }), 'panel:settings-teams');
  assert.equal(targetKey({ id: 'compose', kind: 'modal' }), 'modal:compose');
  assert.equal(targetKey({ id: 'compose' }), 'modal:compose');
  assert.equal(targetKey('compose'), 'modal:compose');
});

test('routes, modal keys and panel keys can never collide', () => {
  const keys = [
    ...CANONICAL_ROUTES,
    targetKey({ id: 'compose', kind: 'modal' }),
    targetKey({ id: 'compose', kind: 'panel' }),
  ];
  assert.equal(new Set(keys).size, keys.length);
  for (const r of CANONICAL_ROUTES) assert.ok(r.startsWith('/'));
  assert.ok(!targetKey({ id: 'x', kind: 'panel' }).startsWith('/'));
});

test('a target id that looks like a path is refused for either kind', () => {
  assert.throws(() => targetKey({ id: '/settings', kind: 'panel' }), /path/);
  assert.throws(() => targetKey({ id: '/launches', kind: 'modal' }), /path/);
});

test('a panel reading counts as a target reading, so it is judged at where it opened', () => {
  assert.equal(isTargetReading({ route: 'panel:settings-teams' }), true);
  assert.equal(isTargetReading({ route: 'modal:compose' }), true);
  assert.equal(isTargetReading({ route: '/settings' }), false);
  // The narrower question still answers narrowly.
  assert.equal(isModalReading({ route: 'panel:settings-teams' }), false);
});

// ---------------------------------------------------------------------------
// Survey runs — 020 FR-014 to FR-018, contract survey-run.md
// ---------------------------------------------------------------------------

// `completeness()` fails any run whose route set is not *identical* to
// CANONICAL_ROUTES — `sameSet` is equal-length plus equal contents, so a run
// covering MORE routes is judged incomplete exactly as a narrowed one is. The
// sweep covers 19 more routes, so without this it cannot produce a complete
// reading at all; and widening CANONICAL_ROUTES would make every retained
// reading back to baseline.json report as narrowed, destroying the
// comparability the whole record is built on.
//
// So a run is either canonical or a survey. A survey declares its own coverage
// and is judged against that declaration, and it is never baseline-eligible.
// This is not a new idea — it is the modal axis's rule extended from targets to
// routes, and the file already says it: "A run that never opened a modal is
// complete on its routes alone: that is not a concession, it is the whole
// reason the axis is separate."

const SURVEY_ROUTES = ['/support', '/err', '/billing/lifetime'];
const SURVEY_VIEWPORTS = ['390x844', '1440x900'];

function makeSurvey(overrides = {}) {
  const declared = overrides.declaredRoutes || SURVEY_ROUTES;
  const gaps = overrides.gaps === undefined ? [] : overrides.gaps;
  const gapSurfaces = new Set(gaps.map((g) => g.surface));
  const covered = overrides.routes || declared.filter((r) => !gapSurfaces.has(r));
  const viewports = overrides.viewports || SURVEY_VIEWPORTS;
  return {
    provenance: provenance({
      account: 'probe@example.com',
      baseUrl: 'https://dash.sharek.app',
      build: 'a'.repeat(40),
      capturedAt: '2026-08-21T12:00:00.000Z',
      routes: covered,
      viewports,
      precondition: overrides.precondition || QUALIFIED,
      postcondition: overrides.postcondition === undefined ? QUALIFIED : overrides.postcondition,
      survey: overrides.survey === undefined ? { routes: declared, targets: [], gaps } : overrides.survey,
    }),
    readings: viewports.flatMap((v) => covered.map((r) => readingFor(r, v))),
    errors: [],
    ...(overrides.run || {}),
  };
}

test('a survey is judged complete against its own declaration, not the canonical seven', () => {
  const { complete, reason } = completeness(makeSurvey());
  assert.equal(complete, true);
  assert.equal(reason, null);
});

test('a canonical run still fails when its route set differs in either direction', () => {
  // The guard that matters most: the survey path must not become a hole in the
  // check that keeps every retained reading comparable. Narrowed has always
  // failed; widened must fail too, and for the same reason.
  const narrowed = completeness(makeRun({ routes: ['/launches'] }));
  assert.equal(narrowed.complete, false);
  assert.match(narrowed.reason, /route/i);

  const widened = makeRun({ routes: [...CANONICAL_ROUTES, '/support'] });
  assert.equal(completeness(widened).complete, false);
  assert.match(completeness(widened).reason, /route/i);
});

test('a survey that missed a route it declared, without calling it a gap, is incomplete', () => {
  const { complete, reason } = completeness(
    makeSurvey({ routes: ['/support', '/err'] })
  );
  assert.equal(complete, false);
  assert.match(reason, /route/i);
});

test('a declared gap with a reason makes the run complete without the reading', () => {
  const { complete, reason } = completeness(
    makeSurvey({ gaps: [{ surface: '/billing/lifetime', reason: 'needs a lifetime deal on the account' }] })
  );
  assert.equal(complete, true);
  assert.equal(reason, null);
});

test('a declared gap without a reason fails the run', () => {
  // The difference between "/oauth/authorize needs a handshake in flight" and
  // silence is this feature's entire value. A surface that was never reached
  // must never be able to look like one that was measured and found clean.
  const { complete, reason } = completeness(
    makeSurvey({ gaps: [{ surface: '/billing/lifetime' }] })
  );
  assert.equal(complete, false);
  assert.match(reason, /reason/i);
});

test('a gap may name one width of a surface rather than the whole surface', () => {
  // A target that cannot be opened at a width it declared is a gap with its
  // reason, not a silent absence — and neither is it a reason to drop the
  // surface at the widths where it does open.
  const run = makeSurvey({
    gaps: [{ surface: '/billing/lifetime@390x844', reason: 'the card does not render below 768' }],
  });
  run.provenance.routes = SURVEY_ROUTES;
  run.readings = run.readings.filter(
    (r) => !(r.route === '/billing/lifetime' && r.viewport === '390x844')
  );
  run.readings.push(readingFor('/billing/lifetime', '1440x900'));

  const { complete, reason } = completeness(run);
  assert.equal(complete, true);
  assert.equal(reason, null);
});

test('a survey is never baseline-eligible, however clean it is', () => {
  // Not by promotion, not by renaming, not by being the only reading of a
  // surface. The canonical seven-route series stays the only comparable one.
  const { eligible, reason } = baselineEligibility(makeSurvey());
  assert.equal(eligible, false);
  assert.match(reason, /survey/i);
});

test('a survey still has to bracket, error-free, like any other run', () => {
  const errored = makeSurvey();
  errored.errors = [{ route: '/support', viewport: '390x844', message: 'timed out' }];
  assert.equal(completeness(errored).complete, false);

  assert.equal(completeness(makeSurvey({ postcondition: BROKEN })).complete, false);
});

test('a survey owes a reading for every target it declared, at every reachable width', () => {
  const declaredTarget = { id: 'settings-teams', widths: [1440] };
  const run = makeSurvey({ survey: { routes: SURVEY_ROUTES, targets: [declaredTarget], gaps: [] } });
  assert.equal(completeness(run).complete, false);
  assert.match(completeness(run).reason, /settings-teams/);

  run.readings.push({ ...readingFor('/settings', '1440x900'), route: 'modal:settings-teams', openedAt: '/settings' });
  assert.equal(completeness(run).complete, true);
});

test('a run with no survey declaration is judged exactly as it always was', () => {
  // Absence means "this is a canonical run", the way `modals: null` means "this
  // run did not cover modals". Every reading retained before this existed comes
  // back that way and must keep its meaning.
  assert.equal(makeRun().provenance.survey, null);
  assert.equal(completeness(makeRun()).complete, true);
  assert.equal(baselineEligibility(makeRun()).eligible, true);
});

// ---------------------------------------------------------------------------
// Baseline eligibility — FR-006
// ---------------------------------------------------------------------------

test('a complete qualifying run is eligible as a baseline', () => {
  const { eligible, reason } = baselineEligibility(makeRun());
  assert.equal(eligible, true);
  assert.equal(reason, null);
});

test('an incomplete run is ineligible and says which condition it failed', () => {
  const { eligible, reason } = baselineEligibility(makeRun({ routes: ['/launches'] }));
  assert.equal(eligible, false);
  assert.match(reason, /route/i);
});

test('a waived run is never eligible, however complete', () => {
  const waived = makeRun({
    precondition: preconditionVerdict({
      pageRendered: true,
      customerControlPresent: false,
      waived: true,
    }),
  });
  assert.equal(completeness(waived).complete, true, 'fixture must be otherwise complete');

  const { eligible, reason } = baselineEligibility(waived);
  assert.equal(eligible, false);
  assert.match(reason, /waive/i);
});

// ---------------------------------------------------------------------------
// Provenance — FR-005
// ---------------------------------------------------------------------------

test('provenance carries every field needed to judge comparability', () => {
  const p = makeRun().provenance;
  for (const field of [
    'account',
    'baseUrl',
    'build',
    'capturedAt',
    'routes',
    'viewports',
    'precondition',
    'pointer',
  ]) {
    assert.ok(field in p, `provenance is missing ${field}`);
    assert.notEqual(p[field], undefined, `provenance.${field} is undefined`);
  }
});

test('an absent build is recorded as absent, never guessed', () => {
  const p = provenance({
    account: 'probe@example.com',
    baseUrl: 'https://dash.sharek.app',
    build: undefined,
    capturedAt: '2026-08-15T12:00:00.000Z',
    routes: CANONICAL_ROUTES,
    viewports: CANONICAL_VIEWPORTS.map(viewportKey),
    precondition: QUALIFIED,
  });
  assert.ok('build' in p, 'the field must survive so its absence is visible');
  assert.equal(p.build, null);
  // Survives the round trip to disk — undefined would have vanished silently.
  assert.equal(JSON.parse(JSON.stringify(p)).build, null);
});

test('provenance records the pointer mode the reading was taken under', () => {
  const p = makeRun({ pointer: 'coarse' }).provenance;
  assert.equal(p.pointer, 'coarse');
});

test('a run that does not name a pointer mode is fine, because that is the only mode there was', () => {
  // Unlike the build, this is never unknown: the probe configures the pointer
  // itself, so an unstated one is the default it used rather than a fact
  // nobody gathered. Every retained reading predates the coarse mode.
  const p = makeRun().provenance;
  assert.equal(p.pointer, 'fine');
  assert.equal(JSON.parse(JSON.stringify(p)).pointer, 'fine');
});

test('provenance records the sets that were actually covered, not the canonical ones', () => {
  const p = makeRun({ routes: ['/launches'] }).provenance;
  assert.deepEqual(p.routes, ['/launches']);
});

test('a captured baseline carries the variance profile with it', () => {
  const b = baseline(makeRun());
  assert.ok(b.variance, 'a baseline that cannot say which of its numbers mean anything is not one');
  assert.ok(Array.isArray(b.variance.stable) && b.variance.stable.length > 0);
  assert.ok(Array.isArray(b.variance.advisory));
  assert.equal(
    b.variance.stable.some((f) => b.variance.advisory.includes(f)),
    false,
    'a field cannot be both stable and advisory'
  );
  assert.deepEqual(b.readings, makeRun().readings, 'the readings are retained whole');
});

// ---------------------------------------------------------------------------
// Comparability — FR-011
// ---------------------------------------------------------------------------

// A baseline whose variance profile is fixed here rather than imported, so
// these tests describe the rule and not the numbers a particular run measured.
const makeBaseline = (overrides = {}) => ({
  ...baseline(makeRun(overrides)),
  variance: { stable: ['cta.verdict', 'touch.total'], advisory: ['clippedCount'] },
});

test('a run against the same account, target and sets is comparable', () => {
  const { comparable, reason } = comparability(makeBaseline(), makeRun());
  assert.equal(comparable, true);
  assert.equal(reason, null);
});

test('a different account is not comparable', () => {
  const run = makeRun();
  run.provenance.account = 'someone-else@example.com';
  const { comparable, reason } = comparability(makeBaseline(), run);
  assert.equal(comparable, false);
  assert.match(reason, /account/i);
});

test('a different target is not comparable', () => {
  const run = makeRun();
  run.provenance.baseUrl = 'https://staging.example.com';
  const { comparable, reason } = comparability(makeBaseline(), run);
  assert.equal(comparable, false);
  assert.match(reason, /target|url/i);
});

test('a different route set is not comparable', () => {
  const { comparable, reason } = comparability(makeBaseline(), makeRun({ routes: ['/launches'] }));
  assert.equal(comparable, false);
  assert.match(reason, /route/i);
});

test('a different width set is not comparable', () => {
  const { comparable, reason } = comparability(
    makeBaseline(),
    makeRun({ viewports: ['1440x900'] })
  );
  assert.equal(comparable, false);
  assert.match(reason, /width|viewport/i);
});

test('a different build is still comparable — that is the point of comparing', () => {
  const run = makeRun();
  run.provenance.build = 'b'.repeat(40);
  assert.equal(comparability(makeBaseline(), run).comparable, true);
});

test('a coarse reading is not comparable against a fine one', () => {
  // The whole reason this field exists. Every touch figure moves under a
  // coarse pointer by design, so diffing across modes would report the
  // instrument as though it were the app.
  const coarse = makeRun({ pointer: 'coarse' });
  const { comparable, reason } = comparability(makeBaseline(), coarse);
  assert.equal(comparable, false);
  assert.match(reason, /pointer/i);
});

test('the refusal holds in the other direction too', () => {
  const { comparable } = comparability(makeBaseline({ pointer: 'coarse' }), makeRun());
  assert.equal(comparable, false);
});

test('two coarse readings are comparable', () => {
  const { comparable, reason } = comparability(
    makeBaseline({ pointer: 'coarse' }),
    makeRun({ pointer: 'coarse' })
  );
  assert.equal(comparable, true);
  assert.equal(reason, null);
});

test('a retained reading with no pointer mode compares as fine', () => {
  // touch-gate-1.json and every baseline on disk were written before the
  // field existed. Reading them as fine is a fact about when they were taken,
  // not a default applied for convenience.
  const stored = makeBaseline();
  delete stored.provenance.pointer;
  assert.equal(comparability(stored, makeRun()).comparable, true);
  assert.equal(comparability(stored, makeRun({ pointer: 'coarse' })).comparable, false);
});

test('each way of being incomparable gives its own reason', () => {
  const account = makeRun();
  account.provenance.account = 'someone-else@example.com';
  const target = makeRun();
  target.provenance.baseUrl = 'https://staging.example.com';

  const reasons = [
    comparability(makeBaseline(), account).reason,
    comparability(makeBaseline(), target).reason,
    comparability(makeBaseline(), makeRun({ routes: ['/launches'] })).reason,
    comparability(makeBaseline(), makeRun({ viewports: ['1440x900'] })).reason,
    comparability(makeBaseline(), makeRun({ pointer: 'coarse' })).reason,
  ];
  assert.equal(new Set(reasons).size, reasons.length, 'reasons must be distinguishable');
});

// ---------------------------------------------------------------------------
// Differencing — FR-011, FR-012
// ---------------------------------------------------------------------------

const withReading = (run, route, viewport, patch) => {
  const next = { ...run, readings: run.readings.map((r) => ({ ...r })) };
  Object.assign(
    next.readings.find((r) => r.route === route && r.viewport === viewport),
    patch
  );
  return next;
};

test('an unchanged run differs in nothing', () => {
  const { changes, advisory } = difference(makeBaseline(), makeRun());
  assert.deepEqual(changes, []);
  assert.deepEqual(advisory, []);
});

test('difference refuses to diff across pointer modes', () => {
  // comparability() is the graceful path and run.mjs takes it, printing a
  // reason instead of a diff. This is the backstop underneath it: a caller
  // that skips the guard must not get a plausible-looking diff, because the
  // honest answer to "what moved between a fine and a coarse reading" is that
  // the question is malformed — and returning zero changes would say the
  // opposite.
  assert.throws(
    () => difference(makeBaseline(), makeRun({ pointer: 'coarse' })),
    /pointer/i
  );
  assert.throws(
    () => difference(makeBaseline({ pointer: 'coarse' }), makeRun()),
    /pointer/i
  );
});

test('difference still diffs two readings taken the same way', () => {
  assert.doesNotThrow(() =>
    difference(makeBaseline({ pointer: 'coarse' }), makeRun({ pointer: 'coarse' }))
  );
});

test('a primary action that became reachable is reported', () => {
  const run = withReading(makeRun(), '/launches', '1024x768', {
    cta: { verdict: 'clickable', w: 120, h: 42 },
  });
  const { changes } = difference(makeBaseline(), run);
  assert.equal(changes.length, 1);
  assert.deepEqual(
    { ...changes[0] },
    {
      route: '/launches',
      viewport: '1024x768',
      field: 'cta.verdict',
      from: 'COVERED',
      to: 'clickable',
    }
  );
});

test('a primary action that became unreachable is reported the same way', () => {
  const base = makeBaseline();
  base.readings = base.readings.map((r) =>
    r.route === '/launches' && r.viewport === '1024x768'
      ? { ...r, cta: { verdict: 'clickable', w: 120, h: 42 } }
      : r
  );
  const { changes } = difference(base, makeRun());
  assert.equal(changes.length, 1);
  assert.equal(changes[0].from, 'clickable');
  assert.equal(changes[0].to, 'COVERED');
});

test('a movement in an unstable field is advisory, never a change', () => {
  const run = withReading(makeRun(), '/media', '390x844', { clippedCount: 4 });
  const { changes, advisory } = difference(makeBaseline(), run);
  assert.deepEqual(changes, []);
  assert.equal(advisory.length, 1);
  assert.equal(advisory[0].field, 'clippedCount');
  assert.equal(advisory[0].from, 0);
  assert.equal(advisory[0].to, 4);
});

test('a field in neither list is not reported at all', () => {
  const run = withReading(makeRun(), '/media', '390x844', { worstCutPx: 300 });
  const { changes, advisory } = difference(makeBaseline(), run);
  assert.deepEqual(changes, []);
  assert.deepEqual(advisory, []);
});

test('a reading the fresh run never produced is reported, not silently skipped', () => {
  const run = makeRun();
  run.readings = run.readings.filter(
    (r) => !(r.route === '/billing' && r.viewport === '820x1180')
  );
  const { changes } = difference(makeBaseline(), run);
  assert.equal(changes.length, 1);
  assert.equal(changes[0].route, '/billing');
  assert.match(changes[0].to, /missing|not measured/i);
});

// ---------------------------------------------------------------------------
// A field the baseline predates — FR-015
// ---------------------------------------------------------------------------

test('a field measured here that the baseline predates is introduced, not changed', () => {
  // The comparison this is written for: a fresh run carries the collision
  // fields, the 2026-08-15 baseline's profile has never heard of them.
  const run = withReading(makeRun(), '/launches', '1024x768', {
    collisionCount: 7,
    worstOverlapPx: 31,
  });
  const { changes, advisory, introduced } = difference(makeBaseline(), run);

  assert.ok(introduced.includes('collisionCount'), 'the new field must be named');
  assert.ok(introduced.includes('worstOverlapPx'));
  // Neither a regression nor a movement — a new instrument is neither.
  assert.deepEqual(changes, []);
  assert.deepEqual(advisory, []);
});

test('a baseline whose profile already carries every measured field introduces nothing', () => {
  // baseline() stamps the running code's own profile, so there is nothing the
  // code measures that this baseline does not know about.
  assert.deepEqual(difference(baseline(makeRun()), makeRun()).introduced, []);
});

test('introduced names fields, not per-route rows — a new instrument is a property of the run', () => {
  const { introduced } = difference(makeBaseline(), makeRun());
  assert.ok(introduced.length > 0, 'the fixture baseline predates most of the profile');
  for (const field of introduced) assert.equal(typeof field, 'string');
  assert.equal(new Set(introduced).size, introduced.length, 'no field named twice');
});

test('the touch fields are advisory — their count depends on the day, not on the build', () => {
  // Found 2026-08-17 comparing a Monday run against a Saturday baseline:
  // touch.under44 on /launches@820 read 15 -> 172 with nothing in the app
  // changed. calendar.tsx renders an hour cell's drop target only when the hour
  // is still ahead, so the count follows where now falls in the displayed week.
  // Four runs minutes apart cannot see that; they share a week position.
  // Do not promote either back without making the measurement day-independent.
  for (const field of ['touch.total', 'touch.under44']) {
    assert.ok(VARIANCE.advisory.includes(field), `${field} must be advisory`);
    assert.equal(VARIANCE.stable.includes(field), false, `${field} must not be stable`);
  }
});

test('the deduped touch count is advisory until it has been measured', () => {
  // It arrives with the dedupe and nothing has measured it yet — exactly the
  // position collisionCount and worstOverlapPx were in when the collision
  // detector landed. Promote it on four full runs against an unchanged
  // deployment, not on the argument that deduping ought to make it stable.
  // The argument is good and it is still not a measurement.
  assert.ok(VARIANCE.advisory.includes('touch.distinctUnder44'));
  assert.equal(VARIANCE.stable.includes('touch.distinctUnder44'), false);
});

test('the deduped touch detail is carried for reading, not diffed', () => {
  // Same treatment as clipped[], smallest[] and collisions[]: element-by-element
  // diffing of a detail list is noise, and the count beside it is the signal.
  assert.ok(VARIANCE.notCompared.includes('undersized'));
});

test('no field is both stable and advisory', () => {
  const both = VARIANCE.stable.filter((f) => VARIANCE.advisory.includes(f));
  assert.deepEqual(both, [], 'a field counted and not counted at once has no meaning');
});

test('a field the baseline knows and the code has dropped is not introduced', () => {
  // makeBaseline's profile carries touch.total; so does VARIANCE. The bucket is
  // the code's vocabulary minus the baseline's, never the other way round.
  assert.equal(difference(makeBaseline(), makeRun()).introduced.includes('touch.total'), false);
});

// ---------------------------------------------------------------------------
// Reportable collisions — FR-011, FR-012
// ---------------------------------------------------------------------------

// The candidate shape probe.js emits. Containment is already excluded upstream,
// in collection, so nothing here has to test for it. Whether a participant is
// in normal flow is observed in the browser — position, transform, margins —
// and arrives as a boolean: that is the boundary data-model.md draws, and the
// CSS-to-boolean mapping is validated by a real run rather than pretended at.
const participant = (cls) => ({ tag: 'div', cls, w: 88, h: 18 });

const candidate = (overlapPx, over = {}) => ({
  a: participant('text-[14px] font-[600] text-brandText'),
  b: participant('text-[14px] font-[600] flex items-center'),
  overlapPx,
  aFlow: true,
  bFlow: true,
  ...over,
});

test('two in-flow participants overlapping above the floor are reported', () => {
  const { collisions, collisionCount, worstOverlapPx } = reportableCollisions([candidate(31)]);

  assert.equal(collisionCount, 1);
  assert.equal(worstOverlapPx, 31);
  // The flow flags are the filter's input, not part of the finding.
  assert.deepEqual(collisions[0], {
    overlapPx: 31,
    a: participant('text-[14px] font-[600] text-brandText'),
    b: participant('text-[14px] font-[600] flex items-center'),
  });
});

// FR-012's exclusions — a badge on an avatar, a floating action over a list, a
// portalled overlay — are all out of flow, so they are excluded by construction
// rather than by four special cases.
test('a pair with either participant out of flow is not reported', () => {
  assert.equal(reportableCollisions([candidate(31, { aFlow: false })]).collisionCount, 0);
  assert.equal(reportableCollisions([candidate(31, { bFlow: false })]).collisionCount, 0);
  assert.equal(
    reportableCollisions([candidate(31, { aFlow: false, bFlow: false })]).collisionCount,
    0
  );
});

test('an overlap at or below 8px is not a finding', () => {
  // The same floor probe.js already applies to clipping, so sub-pixel rounding
  // is never reported as a squeeze.
  assert.equal(reportableCollisions([candidate(8)]).collisionCount, 0);
  assert.equal(reportableCollisions([candidate(9)]).collisionCount, 1);
});

test('two pairs with the same tag+class signature are reported once', () => {
  const { collisions, collisionCount } = reportableCollisions([candidate(24), candidate(31)]);
  assert.equal(collisionCount, 1);
  // The worst instance survives, not whichever arrived first: reporting 24px
  // while a 31px overlap was measured would under-report the finding.
  assert.equal(collisions[0].overlapPx, 31);
});

test('a pair is unordered — the same two participants the other way round is one finding', () => {
  const { collisionCount } = reportableCollisions([
    candidate(31),
    candidate(24, {
      a: participant('text-[14px] font-[600] flex items-center'),
      b: participant('text-[14px] font-[600] text-brandText'),
    }),
  ]);
  assert.equal(collisionCount, 1);
});

test('two pairs with different signatures are both reported', () => {
  const { collisionCount } = reportableCollisions([
    candidate(31),
    candidate(24, { b: participant('text-[12px] text-newTableText') }),
  ]);
  assert.equal(collisionCount, 2);
});

test('an empty candidate list reports zero, not absent', () => {
  assert.deepEqual(reportableCollisions([]), {
    collisions: [],
    collisionCount: 0,
    worstOverlapPx: 0,
  });
});

test('a page whose every candidate is filtered out reads the same as one with none', () => {
  const filtered = reportableCollisions([candidate(31, { aFlow: false }), candidate(4)]);
  assert.deepEqual(filtered, { collisions: [], collisionCount: 0, worstOverlapPx: 0 });
});

test('collisions are sorted worst first and capped at six, like clipped', () => {
  const many = [12, 40, 9, 33, 21, 55, 17, 28].map((px, i) =>
    candidate(px, { a: participant(`a-${i}`), b: participant(`b-${i}`) })
  );
  const { collisions, collisionCount, worstOverlapPx } = reportableCollisions(many);

  assert.deepEqual(
    collisions.map((c) => c.overlapPx),
    [55, 40, 33, 28, 21, 17]
  );
  assert.equal(worstOverlapPx, 55);
  // The count is what survived the rules, not what fitted in the report — the
  // same split clippedCount and clipped[] already keep. A count that quietly
  // capped at six would flatten the fourfold rise R3 predicts into nothing.
  assert.equal(collisionCount, 8);
});

// The modal boundary — FR-006 to FR-009
//
// A route reading measures the document, and the document is the surface. A
// modal reading measures the modal, and the page behind it is scenery.

test('a pair straddling the modal boundary is not a collision', () => {
  // The reason collisionCount was noise on the modal axis for the entire audit:
  // a label inside the modal and a label on the dashboard behind it "intersect"
  // only because an overlay is drawn on top of a page, which is the modal
  // working correctly. Compose carried 6-10 of these at every width including
  // 1440, where it has never had a layout problem.
  const cross = reportableCollisions([candidate(96, { aInModal: true, bInModal: false })], {
    modalOpen: true,
  });

  assert.equal(cross.collisionCount, 0);
  // And it contributes to neither of the other two figures — a dropped pair
  // that still set the worst overlap would report a finding with nothing behind it.
  assert.equal(cross.worstOverlapPx, 0);
  assert.deepEqual(cross.collisions, []);

  // Either way round: the pair is unordered, so the rule has to be too.
  assert.equal(
    reportableCollisions([candidate(96, { aInModal: false, bInModal: true })], { modalOpen: true })
      .collisionCount,
    0
  );
});

test('a pair genuinely inside the modal is still judged by the existing rules', () => {
  const inside = (over = {}) => candidate(31, { aInModal: true, bInModal: true, ...over });

  const kept = reportableCollisions([inside()], { modalOpen: true });
  assert.equal(kept.collisionCount, 1);
  assert.equal(kept.worstOverlapPx, 31);
  assert.deepEqual(kept.collisions[0], {
    overlapPx: 31,
    a: participant('text-[14px] font-[600] text-brandText'),
    b: participant('text-[14px] font-[600] flex items-center'),
  });

  // The boundary is one more rule ahead of the three that were already there,
  // not a replacement for them.
  assert.equal(reportableCollisions([inside({ aFlow: false })], { modalOpen: true }).collisionCount, 0);
  assert.equal(reportableCollisions([inside({ overlapPx: 8 })], { modalOpen: true }).collisionCount, 0);
});

test('a pair with neither participant inside the modal is not counted', () => {
  // A modal reading measures the modal. Two runs of text overlapping on the
  // page behind it are a finding about a surface nobody is looking at, and on
  // a route reading of that same page they are still reported.
  assert.equal(
    reportableCollisions([candidate(96, { aInModal: false, bInModal: false })], { modalOpen: true })
      .collisionCount,
    0
  );
});

test('with no modal open the boundary rule does not run at all', () => {
  // Every route reading, and every existing caller and test, reaches this
  // function without the flags. They must be untouched: the filter runs only
  // when a modal is open, so a candidate carrying no aInModal/bInModal is never
  // dropped for lacking them.
  const bare = [candidate(31), candidate(24, { b: participant('text-[12px] text-newTableText') })];

  const explicit = reportableCollisions(bare, { modalOpen: false });
  assert.equal(explicit.collisionCount, 2);
  assert.equal(explicit.worstOverlapPx, 31);

  // Omitting the options object entirely is the same reading.
  assert.deepEqual(reportableCollisions(bare), explicit);

  // And a pair flagged as straddling is still counted when no modal is open,
  // because there is no boundary for it to straddle.
  assert.equal(
    reportableCollisions([candidate(31, { aInModal: true, bInModal: false })], { modalOpen: false })
      .collisionCount,
    1
  );
});

test('a dropped cross-boundary pair cannot suppress a real one sharing its signature', () => {
  // Dedupe is by unordered pair signature. If the boundary filter ran after the
  // sort, the 96px cross-boundary pair would claim the signature first — being
  // the worse overlap — and only then be dropped, taking the genuine 31px
  // in-modal pair with it. The filter therefore runs before the sort.
  const { collisionCount, worstOverlapPx, collisions } = reportableCollisions(
    [
      candidate(96, { aInModal: true, bInModal: false }),
      candidate(31, { aInModal: true, bInModal: true }),
    ],
    { modalOpen: true }
  );

  assert.equal(collisionCount, 1);
  assert.equal(worstOverlapPx, 31);
  assert.equal(collisions[0].overlapPx, 31);
});

// ---------------------------------------------------------------------------
// Reportable clipping — FR-002, FR-003, FR-010, FR-011
// ---------------------------------------------------------------------------

// The candidate shape probe.js emits for a box crossing the edge of a clipping
// ancestor. The page-side filters — the 8×8 minimum box, outsideViewport,
// hidden, and having a clipper() ancestor at all — are DOM facts and stay in
// the page; what arrives here is the geometry plus which side of the modal
// boundary the box fell on. The floor is a rule and lives below, where it can
// be tested, exactly as the collision floor does.
const clipCandidate = (lostPx, over = {}) => ({
  lostPx,
  w: 88,
  tag: 'div',
  cls: 'flex flex-1 gap-[1px] phone:flex-col',
  inModal: false,
  ...over,
});

test('an empty candidate list reports zero clipping, not absent', () => {
  assert.deepEqual(reportableClipped([], { modalOpen: false }), {
    clippedCount: 0,
    worstCutPx: 0,
    clipped: [],
  });
});

test('a page whose every clip candidate is filtered out reads the same as one with none', () => {
  const filtered = reportableClipped([clipCandidate(3), clipCandidate(8)], { modalOpen: false });
  assert.deepEqual(filtered, { clippedCount: 0, worstCutPx: 0, clipped: [] });
});

test('a cut at or below 8px is not a finding', () => {
  // The floor probe.js used to apply in the page, now where a test can reach
  // it — the same 8 the collision sweep already answers to.
  assert.equal(reportableClipped([clipCandidate(8)], { modalOpen: false }).clippedCount, 0);
  assert.equal(reportableClipped([clipCandidate(9)], { modalOpen: false }).clippedCount, 1);
});

test('clipped entries carry the geometry and not the boundary flag', () => {
  const { clipped } = reportableClipped([clipCandidate(31, { inModal: true })], {
    modalOpen: true,
  });
  // inModal decided which figure the box counts toward; it is not part of the
  // finding, the same way the flow flags are not part of a collision.
  assert.deepEqual(clipped[0], {
    lostPx: 31,
    w: 88,
    tag: 'div',
    cls: 'flex flex-1 gap-[1px] phone:flex-col',
  });
});

test('clips are sorted worst first and capped at six, and the count is uncapped', () => {
  const many = [12, 40, 9, 33, 21, 55, 17, 28].map((px, i) =>
    clipCandidate(px, { cls: `clipped-signature-${i}` })
  );
  const { clipped, clippedCount, worstCutPx } = reportableClipped(many, { modalOpen: false });

  assert.deepEqual(
    clipped.map((c) => c.lostPx),
    [55, 40, 33, 28, 21, 17]
  );
  assert.equal(worstCutPx, 55);
  // Survivors, not what fitted in the report — the split every other count in
  // this file keeps. Eight findings read 8 and list six.
  assert.equal(clippedCount, 8);
});

test('two clips with the same tag+class signature are reported once', () => {
  const { clippedCount } = reportableClipped([clipCandidate(24), clipCandidate(31)], {
    modalOpen: false,
  });
  assert.equal(clippedCount, 1);
});

test('a signature clipping at more than one depth reports the deepest cut', () => {
  // Sorted before it is deduped, so the worst instance of a repeated signature
  // survives. Keeping whichever came first in document order reported 10 while
  // a 300px cut was measured — the defect research R1 found in this function
  // and the test that fails if anyone reverts to first-wins.
  const deepLast = reportableClipped(
    [clipCandidate(10, { w: 120 }), clipCandidate(300, { w: 420 })],
    { modalOpen: false }
  );
  assert.equal(deepLast.worstCutPx, 300);
  assert.equal(deepLast.clipped[0].lostPx, 300);

  // And the same answer whichever order the page happened to emit them in.
  const deepFirst = reportableClipped(
    [clipCandidate(300, { w: 420 }), clipCandidate(10, { w: 120 })],
    { modalOpen: false }
  );
  assert.equal(deepFirst.worstCutPx, 300);

  // The count is invariant under the correction: how many signatures clear the
  // floor does not depend on which instance is kept to represent one.
  assert.equal(deepLast.clippedCount, 1);
  assert.equal(deepFirst.clippedCount, 1);
});

// The two recorded incidents, reproduced. Both figures — seven and ninety-nine —
// were produced by a hand count during 017, before this rule existed, so a
// passing test means the detector agrees with a person who counted rather than
// with the code that produced it.

test('seven boxes clipped inside a modal report seven inside — 017 T084 reproduced', () => {
  // Compose's editor pane is overflow-x:hidden and its toolbar ran past it, so
  // seven controls were cut off without moving the modal wrapper a single pixel
  // — and every measurement in the audit read the wrapper.
  const seven = Array.from({ length: 7 }, (_, i) =>
    clipCandidate(40 + i, { cls: `editor-toolbar-control-${i}`, inModal: true })
  );
  const { clippedInside, clippedCount } = reportableClipped(seven, { modalOpen: true });

  assert.equal(clippedInside, 7);
  // Reported separately from the document-wide count, not instead of it.
  assert.equal(clippedCount, 7);
});

test('ninety-nine boxes clipped behind a modal report zero inside — 017 T034 reproduced', () => {
  // The phone nav rail parked off-canvas in RTL behind the onboarding overlay.
  // Sixty-one of them were still there with the modal closed; nothing was wrong,
  // and the reading looked exactly like a 99-box Arabic regression.
  const ninetyNine = Array.from({ length: 99 }, (_, i) =>
    clipCandidate(30 + i, { cls: `phone-nav-rail-item-${i}`, inModal: false })
  );
  const { clippedInside, clippedCount } = reportableClipped(ninetyNine, { modalOpen: true });

  assert.equal(clippedInside, 0);
  // The page under an overlay is a real page and its cuts are real cuts — just
  // not what a modal reading asked about. The document-wide figure keeps them.
  assert.equal(clippedCount, 99);
});

test('a route reading carries no inside figure at all — absent, not zero', () => {
  const decided = reportableClipped([clipCandidate(40)], { modalOpen: false });

  // Asserted on key presence rather than on value, so undefined, null and 0
  // cannot pass it. A route reading keeps the exact field set it had before
  // this axis existed, which is what lets a comparison against a pre-modal
  // baseline report the field as introduced rather than as a reading that moved.
  assert.equal('clippedInside' in decided, false);
  assert.deepEqual(Object.keys(decided), ['clippedCount', 'worstCutPx', 'clipped']);

  // And the same with no options at all, which is how every existing caller and
  // every test above still reaches this function.
  assert.equal('clippedInside' in reportableClipped([clipCandidate(40)]), false);
});

test('a modal that clips nothing reports zero inside, present', () => {
  const decided = reportableClipped([clipCandidate(40, { inModal: false })], { modalOpen: true });

  // The distinction reportableCollisions and reportableUndersized already keep
  // between "measured none" and "not measured".
  assert.equal('clippedInside' in decided, true);
  assert.equal(decided.clippedInside, 0);
});

test('a signature clipped on both sides of the boundary is counted inside either way', () => {
  // The test that separates an independent dedupe from a subset reading. Under
  // "count the document-wide survivors flagged inside", the deeper instance
  // claims the signature — so when the deeper one is behind the modal, the
  // modal's own clipped control disappears from the inside figure entirely, and
  // the false negative this feature exists to remove comes back in a new place.
  const deeperBehind = [
    clipCandidate(20, { cls: 'editor-toolbar', inModal: true }),
    clipCandidate(300, { cls: 'editor-toolbar', inModal: false }),
  ];
  const behind = reportableClipped(deeperBehind, { modalOpen: true });
  assert.equal(behind.clippedCount, 1);
  assert.equal(behind.clipped[0].lostPx, 300, 'the document-wide survivor is the deeper instance');
  assert.equal(behind.clippedInside, 1, 'and the modal still reports its own');

  // Which side happens to cut deeper is a fact about the page behind the
  // overlay. The inside figure must not turn on it.
  const deeperInside = [
    clipCandidate(300, { cls: 'editor-toolbar', inModal: true }),
    clipCandidate(20, { cls: 'editor-toolbar', inModal: false }),
  ];
  assert.equal(reportableClipped(deeperInside, { modalOpen: true }).clippedInside, 1);
});

test('the inside count never exceeds the document-wide count', () => {
  // research.md R4 states the opposite — that the subset relation "does not
  // hold" — and that is the one claim in it that is wrong. Both figures apply
  // the same floor and the same tag+cls signature, and the inside candidates
  // are a subset of all candidates, so the inside signature set is a subset of
  // the document-wide one and the count cannot be larger. Verified by brute
  // force over 300,000 randomised candidate lists before being pinned here.
  //
  // The independent dedupe is still the right rule — the test above is what it
  // buys, and it is not this. Pinned so the false version is not restored from
  // the prose.
  const mixed = [
    clipCandidate(300, { cls: 'a', inModal: true }),
    clipCandidate(20, { cls: 'a', inModal: false }),
    clipCandidate(90, { cls: 'b', inModal: true }),
    clipCandidate(90, { cls: 'c', inModal: false }),
    clipCandidate(4, { cls: 'd', inModal: true }),
  ];
  const { clippedInside, clippedCount } = reportableClipped(mixed, { modalOpen: true });
  assert.equal(clippedCount, 3);
  assert.equal(clippedInside, 2);
  assert.ok(clippedInside <= clippedCount);
});

// ---------------------------------------------------------------------------
// Undersized touch targets — the 44px floor, counted by signature
// ---------------------------------------------------------------------------

// probe.js emits every visible, in-viewport interactive element it measured, as
// geometry. Which of them are findings — the floor — and how many findings a
// repeated control is worth — the dedupe — are decided here, where they can be
// tested. That is the same boundary reportableCollisions draws.
//
// The reason the dedupe exists at all: touch.under44 counted instances, and
// /launches renders one hour-cell class up to ~150 times depending on how much
// of the displayed week is still ahead. The field read 15 on a Saturday and 172
// on a Monday with nothing in the app changed, which is what demoted it to
// advisory on 2026-08-17. One undersized control is one finding however often
// the calendar repeats it.
const target = (over = {}) => ({ tag: 'div', cls: 'flex items-center cursor-pointer', w: 92, h: 68, ...over });

// The calendar hour cell at 820px, which is what 016 exists to fix. Its class is
// built by a clsx with three static branches (calendar.tsx:939-947) — no day
// index, no per-cell state — so every instance shares one signature.
const hourCell = (over = {}) =>
  target({ cls: 'min-h-full w-full p-[5px] flex items-center justify-center cursor-pointer pb-[2.5px]', w: 21, h: 68, ...over });

test('an element under the floor in either dimension is a finding', () => {
  assert.equal(reportableUndersized([target({ w: 21, h: 68 })]).distinctUnder44, 1);
  assert.equal(reportableUndersized([target({ w: 92, h: 31 })]).distinctUnder44, 1);
});

test('an element at exactly the floor in both dimensions is not a finding', () => {
  // WCAG 2.5.5 asks for at least 44, so 44 passes and 43 does not. An
  // off-by-one here would report every compliant control on the app.
  assert.equal(reportableUndersized([target({ w: 44, h: 44 })]).distinctUnder44, 0);
  assert.equal(reportableUndersized([target({ w: 43, h: 44 })]).distinctUnder44, 1);
  assert.equal(reportableUndersized([target({ w: 44, h: 43 })]).distinctUnder44, 1);
});

test('an undersized target reports its measurements and how many of it there were', () => {
  const { undersized } = reportableUndersized([hourCell(), hourCell(), hourCell()]);

  assert.deepEqual(undersized, [
    {
      tag: 'div',
      cls: 'min-h-full w-full p-[5px] flex items-center justify-center cursor-pointer pb-[2.5px]',
      w: 21,
      h: 68,
      instances: 3,
    },
  ]);
});

test('repeated instances of one signature are one finding', () => {
  // The whole point. 150 hour cells are one undersized control, not 150.
  const week = Array.from({ length: 150 }, () => hourCell());
  const { distinctUnder44, undersized } = reportableUndersized(week);

  assert.equal(distinctUnder44, 1);
  assert.equal(undersized[0].instances, 150);
});

// This is the movement that demoted the field, reproduced as data. A week
// displayed entirely in the past renders no hour cell at all — calendar.tsx
// gates the drop target on !isBeforeNow — so the signature is absent rather
// than smaller. Under the old instance count that swing was 150; here it is 1,
// and it is the residual the VARIANCE note records as known.
test('a week fully ahead and the same week fully past differ by exactly one finding', () => {
  const chrome = [target({ w: 24, h: 24, cls: 'w-[24px] h-[24px] cursor-pointer' })];
  const ahead = reportableUndersized([...chrome, ...Array.from({ length: 150 }, () => hourCell())]);
  const past = reportableUndersized(chrome);

  assert.equal(ahead.distinctUnder44 - past.distinctUnder44, 1);
});

test('the smallest instance of a repeated signature survives the dedupe', () => {
  // Same reasoning as the worst overlap surviving in reportableCollisions:
  // reporting 40px while a 21px target was measured under-reports the finding.
  const { undersized } = reportableUndersized([hourCell({ w: 40 }), hourCell({ w: 21 })]);

  assert.equal(undersized[0].w, 21);
  assert.equal(undersized[0].instances, 2);
});

test('severity is the dimension that misses the floor, not the area', () => {
  // The calendar hour cell at 820 is 21x68 — it fails on width alone, and by
  // area it is nearly three times a 22x22 icon that misses by less. Ranking on
  // area buries the finding this whole feature exists to fix beneath six pieces
  // of chrome that appear once each, which is exactly what the first real run
  // reported. 21 is a worse miss than 22 in the axis that decides the verdict.
  const { undersized } = reportableUndersized([
    target({ w: 22, h: 22, cls: 'select-none cursor-pointer' }),
    hourCell(),
  ]);

  assert.equal(undersized[0].w, 21);
});

test('two different signatures are two findings', () => {
  const { distinctUnder44 } = reportableUndersized([
    hourCell(),
    target({ w: 24, h: 24, cls: 'w-[24px] h-[24px] cursor-pointer' }),
  ]);

  assert.equal(distinctUnder44, 2);
});

// The two shape assertions below name `wrappers` and `wrapperSignatures`
// because 020 added them to this function's contract (FR-007). They are the
// only two of the 114 that moved rather than grew, and neither weakened: both
// still assert the whole returned object, and both still say the same thing —
// zero is reported as zero, never as absent.
test('an empty candidate list reports zero, not absent', () => {
  assert.deepEqual(reportableUndersized([]), {
    distinctUnder44: 0,
    undersized: [],
    wrappers: 0,
    wrapperSignatures: [],
  });
});

test('a page whose every target clears the floor reads the same as one with none', () => {
  assert.deepEqual(reportableUndersized([target(), target({ w: 120, h: 48 })]), {
    distinctUnder44: 0,
    undersized: [],
    wrappers: 0,
    wrapperSignatures: [],
  });
});

test('undersized targets are sorted smallest first and capped at six, like clipped', () => {
  const many = [40, 8, 33, 21, 12, 36, 17, 28].map((w, i) =>
    target({ w, h: 20, cls: `sig-${i} cursor-pointer` })
  );
  const { undersized, distinctUnder44 } = reportableUndersized(many);

  // Smallest area first: every h is 20, so this is the widths in order.
  assert.deepEqual(
    undersized.map((u) => u.w),
    [8, 12, 17, 21, 28, 33]
  );
  // The count is what survived the rules, not what fitted in the report — the
  // same split clippedCount and collisionCount already keep.
  assert.equal(distinctUnder44, 8);
});

// ---------------------------------------------------------------------------
// The touch scan tells the truth — 020 FR-001 to FR-008, contract touch-scan.md
// ---------------------------------------------------------------------------

// Three defects, one function. The report has been claiming three things that
// are not true: a decorative wrapper is a target, a modal's touch figure
// belongs to the modal, and every icon control is one anonymous `svg`. The
// first and third are the same defect wearing different faces — the report
// describing the DOM less precisely than the scan measured it.
//
// The cases below are contract touch-scan.md's worked table, in its order. The
// first three are the defects; the rest are the guards, and case 6 is the one
// that matters most: it is what stops this change suppressing a real nested
// action, which is the only dangerous error it can make.

// An svg control. `probe.js`'s cls() read `el.className`, which on an SVG
// element is an SVGAnimatedString and never a string — so every cursor-pointer
// svg on a page arrived here as a classless `svg` and they all deduped into
// one. The fix is at the source; what this file can pin is that a candidate
// carrying its classes signs by them.
const svgTarget = (over = {}) => ({
  tag: 'svg',
  cls: 'w-5 h-5 cursor-pointer',
  w: 20,
  h: 20,
  semantic: false,
  enclosing: null,
  ...over,
});

// A decorative wrapper: in the control set only because of `cursor-pointer`,
// sitting inside a row that carries the actual handler and clears the floor.
// The 17x19 chevron inside a compose row, measured on the live app — the audit
// records the rows as 340x42 and 342x44, one on each side of the floor, and
// this is the one that clears.
//
// The contract's worked case 5 writes this enclosure as 340x42 and expects the
// candidate reclassified, which contradicts its own rule and its own case 9:
// the rule is `enclosing.w >= 44 && enclosing.h >= 44`, and case 9 reports a
// candidate inside 340x43 precisely to pin the boundary. 42 is smaller than 43,
// so the two cannot both hold. The rule is stated three times (contract Rule 2,
// plan, T022) against one worked case, and it is also the safer reading — a
// wrapper inside a row that is *itself* under the floor must stay reported,
// because the row being undersized is the finding.
const wrapper = (over = {}) => ({
  tag: 'div',
  cls: 'cursor-pointer',
  w: 17,
  h: 19,
  semantic: false,
  enclosing: { w: 342, h: 44 },
  ...over,
});

test('an svg candidate signs by its classes rather than collapsing to a bare svg', () => {
  const { undersized } = reportableUndersized([svgTarget()]);

  assert.equal(undersized.length, 1);
  assert.equal(undersized[0].cls, 'w-5 h-5 cursor-pointer');
});

test('two svgs with different classes are two findings, not one', () => {
  // Case 2. Today they both arrive as `svg` + '' and dedupe into a single row,
  // so a page with six distinct icon controls reports one.
  const { distinctUnder44 } = reportableUndersized([
    svgTarget({ cls: 'w-5 h-5 cursor-pointer' }),
    svgTarget({ cls: 'w-4 h-4 cursor-pointer text-error' }),
  ]);

  assert.equal(distinctUnder44, 2);
});

test('with a modal open a candidate outside it is not counted', () => {
  // Case 3. The boundary reportableClipped and reportableCollisions have drawn
  // since 018. Without it a modal reading's touch figure is the whole document,
  // the page behind it included — attributable to the modal only while the
  // route behind happens to read zero, which is a coincidence of the build.
  const { distinctUnder44 } = reportableUndersized(
    [wrapper({ cls: 'cursor-pointer behind', enclosing: null, inModal: false })],
    { modalOpen: true }
  );

  assert.equal(distinctUnder44, 0);
});

test('with a modal open a candidate inside it is counted', () => {
  // Case 4, the other half — the rule must scope, not silence.
  const { distinctUnder44 } = reportableUndersized(
    [wrapper({ cls: 'cursor-pointer inside', enclosing: null, inModal: true })],
    { modalOpen: true }
  );

  assert.equal(distinctUnder44, 1);
});

test('a decorative wrapper inside a clearing target is reclassified, not dropped', () => {
  // Case 5. It leaves distinctUnder44 and appears in wrappers. Reclassified
  // rather than dropped is the whole of FR-008: an instrument change that
  // silences a finding is the wrong order of operations, and a change that
  // relocates one into a named, inspectable field cannot silence it.
  const { distinctUnder44, undersized, wrappers, wrapperSignatures } = reportableUndersized([
    wrapper(),
  ]);

  assert.equal(distinctUnder44, 0);
  assert.deepEqual(undersized, []);
  assert.equal(wrappers, 1);
  assert.deepEqual(wrapperSignatures, [
    { tag: 'div', cls: 'cursor-pointer', w: 17, h: 19, instances: 1 },
  ]);
});

test('a semantic control in the same position is still reported', () => {
  // Case 6, and the clause that prevents the only dangerous error this change
  // can make. A 30x30 button inside a clickable 300x60 card does something
  // different from the card, so suppressing it would hide a real target.
  const { distinctUnder44, wrappers } = reportableUndersized([
    { tag: 'button', cls: 'p-[4px]', w: 30, h: 30, semantic: true, enclosing: { w: 300, h: 60 } },
  ]);

  assert.equal(distinctUnder44, 1);
  assert.equal(wrappers, 0);
});

test('a decorative candidate whose enclosing target misses the floor is still reported', () => {
  // Case 7. Nothing tappable covers it, so the suppression would not be true.
  const { distinctUnder44, wrappers } = reportableUndersized([
    wrapper({ enclosing: { w: 30, h: 30 } }),
  ]);

  assert.equal(distinctUnder44, 1);
  assert.equal(wrappers, 0);
});

test('a decorative candidate with no enclosing target at all is still reported', () => {
  // Case 8. Both clauses are required; this is the one that fails.
  const { distinctUnder44, wrappers } = reportableUndersized([wrapper({ enclosing: null })]);

  assert.equal(distinctUnder44, 1);
  assert.equal(wrappers, 0);
});

test('an enclosing target of 43 does not clear the floor', () => {
  // Case 9, and it exists because the compose rows that started this measured
  // 340x42 and 342x44 — one on each side. A rule tested only at those two
  // values would not catch an off-by-one, and 44 passes because WCAG 2.5.5
  // asks for at least 44.
  assert.equal(reportableUndersized([wrapper({ enclosing: { w: 340, h: 43 } })]).distinctUnder44, 1);
  assert.equal(reportableUndersized([wrapper({ enclosing: { w: 43, h: 340 } })]).distinctUnder44, 1);
  assert.equal(reportableUndersized([wrapper({ enclosing: { w: 340, h: 44 } })]).distinctUnder44, 0);
  assert.equal(reportableUndersized([wrapper({ enclosing: { w: 44, h: 44 } })]).distinctUnder44, 0);
});

test('the row the audit measured at 340x42 does not suppress what is inside it', () => {
  // The real pair, both sides. The compose rows the wrapper defect was found on
  // measured 340x42 and 342x44; only the second covers what it holds. The first
  // is itself under the floor — 42 — and a rule that suppressed inside it would
  // hide the row's own finding behind the chevron's, which is the double
  // silence FR-008 exists to prevent.
  assert.equal(reportableUndersized([wrapper({ enclosing: { w: 340, h: 42 } })]).distinctUnder44, 1);
  assert.equal(reportableUndersized([wrapper({ enclosing: { w: 342, h: 44 } })]).distinctUnder44, 0);
});

test('a repeated decorative signature counts once and keeps its instance count', () => {
  // Case 10. The same rule `undersized` already applies to repetition — one
  // control is one finding however often the page repeats it, and the instance
  // count is the only place the repetition survives the dedupe.
  const { wrappers, wrapperSignatures } = reportableUndersized(
    Array.from({ length: 150 }, () => wrapper())
  );

  assert.equal(wrappers, 1);
  assert.equal(wrapperSignatures[0].instances, 150);
});

test('wrapper signatures are capped at six while the count is not', () => {
  // The split `undersized` and `distinctUnder44` already keep, for the same
  // reason: a count that quietly capped would read identically on a page with
  // seven reclassified wrappers and one with seventy.
  const many = [40, 8, 33, 21, 12, 36, 17, 28].map((w, i) =>
    wrapper({ w, h: 20, cls: `wrap-${i} cursor-pointer` })
  );
  const { wrappers, wrapperSignatures } = reportableUndersized(many);

  assert.equal(wrappers, 8);
  assert.equal(wrapperSignatures.length, 6);
  assert.deepEqual(
    wrapperSignatures.map((u) => u.w),
    [8, 12, 17, 21, 28, 33]
  );
});

test('with no modal open every candidate is judged, whatever it carries', () => {
  // Case 11. Unchanged behaviour is the point: every retained reading taken
  // without a modal keeps its meaning, and a candidate from before this feature
  // carries no inModal at all.
  const { distinctUnder44 } = reportableUndersized([
    { tag: 'div', cls: 'a cursor-pointer', w: 20, h: 20, inModal: false },
    { tag: 'div', cls: 'b cursor-pointer', w: 20, h: 20, inModal: true },
    { tag: 'div', cls: 'c cursor-pointer', w: 20, h: 20 },
  ]);

  assert.equal(distinctUnder44, 3);
});

test('a candidate from before this feature is never reclassified for lacking the facts', () => {
  // `semantic === false` is strict on purpose. A reading taken before probe.js
  // sent these facts has `semantic: undefined`, which is not false — so it
  // stays reported, which is the safe direction and keeps every retained
  // reading meaning what it meant.
  const { distinctUnder44, wrappers } = reportableUndersized([
    { tag: 'div', cls: 'legacy cursor-pointer', w: 17, h: 19 },
  ]);

  assert.equal(distinctUnder44, 1);
  assert.equal(wrappers, 0);
});

// ---------------------------------------------------------------------------
// Modal targets — FR-011 to FR-015, contract PR1..PR8
// ---------------------------------------------------------------------------

// The harness has measured seven routes at four widths since spec 014 and has
// never opened a modal, which is why compose's 809px is hand-produced and has
// not moved through four rollouts. These tests fix what a modal reading is
// before one is taken, and — more of the work than it looks — what it must not
// disturb: `completeness()` requires a run's routes to be exactly the canonical
// seven, and `difference()` pairs readings on route + viewport. A modal that
// arrives as an eighth route invalidates every retained reading (PR3, R4).

const modalReadingFor = (id, viewport, over = {}) => ({
  route: modalKey(id),
  viewport,
  // Where the browser was when the modal was measured. A modal reading is taken
  // on a route without being a reading OF it, so the url check in completeness()
  // has to compare against this rather than against `route`.
  openedAt: '/launches',
  url: '/launches',
  vw: Number(viewport.split('x')[0]),
  cta: null,
  clippedCount: 0,
  worstCutPx: 0,
  clipped: [],
  touch: { total: 12, under44: 2, pct: 17 },
  smallest: [],
  sidewaysScrollPx: 0,
  wrapper: { w: 809, h: 829 },
  ...over,
});

// A run that also opened every canonical modal — the shape a full run takes
// once the axis exists.
function makeModalRun(overrides = {}) {
  const run = makeRun(overrides);
  const ids = overrides.modals || CANONICAL_MODALS.map((m) => m.id);
  run.provenance.modals = ids;
  run.readings = [
    ...run.readings,
    ...ids.flatMap((id) => canonicalTargetWidths(id, run.provenance.viewports).map((v) => modalReadingFor(id, v))),
  ];
  return run;
}

// The widths a canonical target can actually be reached at, by id — a thin
// lookup over the shared rule, so these tests and the harness cannot disagree
// about what a target owes.
function canonicalTargetWidths(id, viewports) {
  return reachableWidths(CANONICAL_MODALS.find((m) => m.id === id) || { id }, viewports);
}

test('modal targets are a separate axis, not an eighth route', () => {
  // The whole reason the axis exists rather than a `CANONICAL_ROUTES` entry:
  // widening that list makes every retained reading report as narrowed.
  const ids = CANONICAL_MODALS.map((m) => m.id);
  for (const id of ids) {
    assert.ok(
      !CANONICAL_ROUTES.includes(id) && !CANONICAL_ROUTES.includes(modalKey(id)),
      `${id} must not be reachable as a route`
    );
  }
  assert.ok(CANONICAL_MODALS.length > 0, 'the axis is not worth having empty');
  for (const target of CANONICAL_MODALS) {
    // The contract's shape: where to go, what to click, how long to wait.
    assert.equal(typeof target.id, 'string');
    assert.ok(CANONICAL_ROUTES.includes(target.route), `${target.id} opens from a canonical route`);
    assert.ok(target.open, `${target.id} says what to click`);
  }
});

test('a run that never opened a modal is still complete — every retained reading predates the axis', () => {
  // PR3, stated as the thing it protects: baseline.json, touch-gate-1.json and
  // both phase-4 finals carry no `modals` at all. If the modal clause reads
  // absence as a shortfall, the instrument arrives by invalidating the history
  // it exists to extend.
  const run = makeRun();
  assert.equal(run.provenance.modals ?? null, null);
  assert.deepEqual(completeness(run), { complete: true, reason: null });
});

test('a run that declares modals is complete only once every one of them is measured', () => {
  assert.equal(completeness(makeModalRun()).complete, true);
});

test('a modal reading key cannot collide with a route path', () => {
  // PR5. Route paths all begin with a slash and modal keys never do, so this
  // holds by construction rather than by the current contents of two lists.
  for (const route of CANONICAL_ROUTES) {
    assert.notEqual(modalKey('compose'), route);
  }
  assert.ok(!modalKey('compose').startsWith('/'), 'a modal key is not a path');
  // And it cannot be talked into becoming one.
  assert.throws(() => modalKey('/launches'), /path/i);
});

test('difference pairs a modal reading with the same modal, never with a route', () => {
  // PR5's real consequence: `difference()` pairs on route + viewport, so a key
  // that collided would diff compose against /launches and report a page of
  // changes that never happened.
  const before = { ...baseline(makeModalRun()), variance: { stable: ['wrapper.w'], advisory: [] } };
  const after = makeModalRun();
  const target = after.readings.find((r) => r.route === modalKey('compose') && r.viewport === '390x844');
  target.wrapper = { ...target.wrapper, w: 390 };

  const { changes } = difference(before, after);

  assert.equal(changes.length, 1, 'exactly the reading that moved');
  assert.equal(changes[0].route, modalKey('compose'));
  assert.equal(changes[0].viewport, '390x844');
  assert.equal(changes[0].from, 809);
  assert.equal(changes[0].to, 390);
});

test('a modal target that failed to open is an error, never a reading of zero', () => {
  // PR8, and the failure mode phase 4 actually hit: /analytics@820 came back
  // as a page that had not rendered. A modal whose opener is missing must not
  // produce `wrapper.w: 0`, which reads as "it fits" — the strongest possible
  // false green this instrument could emit.
  const run = makeModalRun();
  run.readings = run.readings.filter(
    (r) => !(r.route === modalKey('compose') && r.viewport === '390x844')
  );
  run.errors = [{ route: modalKey('compose'), viewport: '390x844', message: 'opener not found' }];

  const { complete, reason } = completeness(run);
  assert.equal(complete, false);
  assert.match(reason, /modal:compose@390x844/);
});

test('a declared modal with no reading and no error is still incomplete', () => {
  // The other half of PR8: a loop that skipped a target leaves neither an
  // error nor a reading, and "no reading" must never read as "no finding".
  const run = makeModalRun();
  run.readings = run.readings.filter(
    (r) => !(r.route === modalKey('compose') && r.viewport === '820x1180')
  );

  const { complete, reason } = completeness(run);
  assert.equal(complete, false);
  assert.match(reason, /modal:compose@820x1180/);
});

test('a modal reading is not judged to be a reading of the route it was opened from', () => {
  // completeness() rejects a reading whose url is not the route it is filed
  // under — the check that catches a session expiring mid-run. A modal reading
  // is filed under `modal:compose` and taken at /launches, so without a clause
  // of its own every modal reading trips it and no run is ever complete again.
  const run = makeModalRun();
  assert.equal(completeness(run).complete, true);

  // It still has to catch the thing it exists for: a modal measured after the
  // session expired was measured on the sign-in page.
  const expired = makeModalRun();
  expired.readings.find((r) => r.route === modalKey('compose')).url = '/auth/login';
  assert.equal(completeness(expired).complete, false);
});

test('a width field this code measures but an older baseline predates is introduced, not ignored', () => {
  // The variance profile is the whole vocabulary of a comparison: a field in
  // neither `stable` nor `advisory` is not reported at all. `introduced` reads
  // the profile stored in the baseline, so a newly declared width has to
  // surface there or it is measured on every run and mentioned on none.
  const { introduced } = difference(makeBaseline(), makeRun());

  assert.ok(
    introduced.includes('wrapper.w'),
    'the wrapper width must be named as new against a baseline taken before it existed'
  );
});

test('the wrapper width is declared in VARIANCE, so a comparison can see it move', () => {
  const declared = [...VARIANCE.stable, ...VARIANCE.advisory];
  assert.ok(declared.includes('wrapper.w'));
  assert.ok(
    !VARIANCE.notCompared.includes('wrapper.w'),
    'a field measured and then excluded from every comparison is the silence this harness exists to prevent'
  );
});

test('the inside-clip count is declared in VARIANCE, so a comparison can see it move', () => {
  // The variance profile is the whole vocabulary of a comparison: a field in
  // neither `stable` nor `advisory` is measured on every run and mentioned on
  // none. The wrapper widths are the precedent this follows.
  const declared = [...VARIANCE.stable, ...VARIANCE.advisory];
  assert.ok(declared.includes('clippedInside'));
  assert.ok(
    !VARIANCE.notCompared.includes('clippedInside'),
    'a field measured and then excluded from every comparison is the silence this harness exists to prevent'
  );
  // It arrives advisory, as every field added to this harness has, because
  // nothing has measured it.
  assert.ok(VARIANCE.advisory.includes('clippedInside'));
  assert.ok(!VARIANCE.stable.includes('clippedInside'));
});

test('an inside-clip count an older baseline predates is introduced, not ignored', () => {
  // `introduced` is the code's vocabulary minus the baseline's, so a baseline
  // stored before this axis existed has to have the field named against it —
  // the alternative is a figure taken on every modal reading and reported on
  // none of them.
  const before = { ...baseline(makeRun()), variance: { stable: [], advisory: [] } };

  const { introduced } = difference(before, makeRun());

  assert.ok(
    introduced.includes('clippedInside'),
    'the inside-clip count must be named as new against a baseline taken before it existed'
  );
});

test('modal readings a baseline predates are announced, not silently unpaired', () => {
  // `difference()` walks the baseline's readings, so a reading the baseline has
  // never held is not compared — which is right, and before this axis existed it
  // could not happen. Now it happens on the very next `--compare` against
  // baseline.json, which predates modals entirely. `introduced` already says
  // this for fields; unpaired readings need saying too, or four measurements
  // taken every run are mentioned on none of them.
  const before = { ...baseline(makeRun()), variance: { stable: [], advisory: [] } };
  const after = makeModalRun();

  const { unpaired } = difference(before, after);

  // Every modal reading the run took, at every width that target is reachable
  // at — computed rather than hardcoded, so adding a target does not silently
  // weaken this into checking a subset.
  const viewports = CANONICAL_VIEWPORTS.map(viewportKey);
  const expected = CANONICAL_MODALS.flatMap((m) =>
    canonicalTargetWidths(m.id, viewports).map((v) => `${modalKey(m.id)}@${v}`)
  );
  assert.deepEqual(
    unpaired.map((u) => `${u.route}@${u.viewport}`).sort(),
    expected.sort()
  );
});

test('two runs that both opened the modal leave nothing unpaired', () => {
  const { unpaired } = difference(baseline(makeModalRun()), makeModalRun());
  assert.deepEqual(unpaired, []);
});

test('a target reachable only at some widths is complete when measured at those widths', () => {
  // Compose over an existing post is reached by clicking a post on the calendar,
  // and at ≤768 the calendar is not a grid — it is `ListView`, which on this
  // account renders no posts at all. So the target cannot open at 390, and a
  // target that cannot open records an error (PR8), which would make every full
  // run incomplete forever. The honest model is that a target says which widths
  // it can be reached at, and is held to exactly those.
  const restricted = CANONICAL_MODALS.find((m) => m.widths);
  assert.ok(restricted, 'at least one target declares a width restriction');

  const run = makeRun();
  run.provenance.modals = [restricted.id];
  run.readings = [
    ...run.readings,
    ...restricted.widths.map((w) =>
      modalReadingFor(restricted.id, CANONICAL_VIEWPORTS.map(viewportKey).find((v) => v.startsWith(`${w}x`)))
    ),
  ];

  assert.equal(completeness(run).complete, true);
});

test('a width a restricted target does declare still owes a reading', () => {
  const restricted = CANONICAL_MODALS.find((m) => m.widths);
  const run = makeRun();
  run.provenance.modals = [restricted.id];
  // Every declared width but the first.
  run.readings = [
    ...run.readings,
    ...restricted.widths
      .slice(1)
      .map((w) =>
        modalReadingFor(restricted.id, CANONICAL_VIEWPORTS.map(viewportKey).find((v) => v.startsWith(`${w}x`)))
      ),
  ];

  const { complete, reason } = completeness(run);
  assert.equal(complete, false);
  assert.match(reason, new RegExp(`${restricted.id}@${restricted.widths[0]}x`));
});

test('an unrestricted target owes a reading at every width the run covered', () => {
  const open = CANONICAL_MODALS.find((m) => !m.widths);
  assert.ok(open, 'compose itself is reachable everywhere');
  const run = makeRun();
  run.provenance.modals = [open.id];
  run.readings = [...run.readings, modalReadingFor(open.id, '390x844')];

  assert.equal(completeness(run).complete, false);
});
