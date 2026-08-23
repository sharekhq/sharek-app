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
  reportableEscaped,
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
// Rule 1 — pair by line fragment, not by union box (021 FR-001)
// ---------------------------------------------------------------------------

// `getBoundingClientRect()` on an inline element that wraps returns the union
// of its line fragments — a rectangle the element does not occupy. An <a> whose
// text starts mid-line and finishes on the next measures the full content width
// by two line-heights, and that phantom box covers every inline sibling on both
// lines.
//
// Measured at `/auth@390` in both pointer modes: `a.underline.hover:font-bold`
// 89x15 against the same class at 320x33, `overlapPx: 89`. They are
// `register.tsx:207` and `:216` — Terms of Service and Privacy Policy, two
// links in one sentence with the second wrapped — and they do not overlap on
// screen at any width. **That reading is what rated finding 64 P1.**
//
// The squeeze/design test cannot catch it: the pair does stop overlapping when
// the viewport widens, because the wrap stops.
//
// probe.js keeps the sweep it has — a union-box intersection is a strict
// superset of a fragment intersection, so no true pair is lost by finding
// candidates that way — and now sends each participant's visible line fragments
// alongside. Which fragments actually meet is arithmetic over that geometry,
// and it is decided here where a test can reach it. The fragments are candidate
// data like `aFlow` and `bFlow`: they decide the finding without being part of
// it, so no reading grows a rect array.
const rect = (left, top, right, bottom) => ({ left, top, right, bottom });

test('two fragments of a wrapped link do not collide with a sibling on one line', () => {
  // /auth@390. The wrapped link occupies the tail of line one and the head of
  // line two; the sibling sits at the head of line one. The union box spans
  // both, so it covers the sibling — but neither fragment does.
  const { collisionCount, worstOverlapPx, collisions } = reportableCollisions([
    candidate(89, {
      a: { tag: 'a', cls: 'underline hover:font-bold', w: 89, h: 15, text: 'Terms of Service' },
      b: { tag: 'a', cls: 'underline hover:font-bold', w: 320, h: 33, text: 'Privacy Policy' },
      aRects: [rect(20, 100, 109, 115)],
      bRects: [rect(150, 100, 320, 115), rect(0, 118, 60, 133)],
    }),
  ]);

  assert.equal(collisionCount, 0);
  assert.equal(worstOverlapPx, 0);
  assert.deepEqual(collisions, []);
});

test('a fragment that only meets the other on a line it is not on is not a collision', () => {
  // The `Must not` the contract states outright: report a pair whose only
  // intersection is with a fragment the participant does not occupy. Here the
  // horizontal spans do overlap — 40px of them — but on different lines.
  const { collisionCount } = reportableCollisions([
    candidate(40, {
      aRects: [rect(20, 100, 109, 115)],
      bRects: [rect(0, 118, 60, 133)],
    }),
  ]);

  assert.equal(collisionCount, 0);
});

test('a single-line participant is measured exactly as it is today', () => {
  // The contract's second `Must`: one fragment is the bounding rect, so the
  // arithmetic is unchanged. This is `modal:compose-existing@1024` fine —
  // `div 84x20` and `div 119x21`, both single-line, `overlapPx: 84` — and it is
  // Rule 1's counter-case as well as its no-op case.
  const { collisionCount, worstOverlapPx } = reportableCollisions([
    candidate(84, {
      a: { tag: 'div', cls: '', w: 84, h: 20, text: 'Preview' },
      b: { tag: 'div', cls: '', w: 119, h: 21, text: '08/19/2026 02:10 PM' },
      aRects: [rect(300, 200, 384, 220)],
      bRects: [rect(300, 200, 419, 221)],
    }),
  ]);

  assert.equal(collisionCount, 1);
  assert.equal(worstOverlapPx, 84);
});

test('the worst fragment pair is the overlap reported, not the first', () => {
  // Two fragments of one participant can both meet the other. The finding is
  // the worst of them, the same rule the dedupe applies one level up.
  const { worstOverlapPx } = reportableCollisions([
    candidate(200, {
      aRects: [rect(0, 100, 200, 115), rect(0, 118, 200, 133)],
      bRects: [rect(180, 100, 400, 115), rect(150, 118, 400, 133)],
    }),
  ]);

  assert.equal(worstOverlapPx, 50);
});

test('a repeated day-label overlap still reports, and still once', () => {
  // The calendar's day headers, children of two different grid cells — the
  // finding this whole scan was built to catch, and the reason the pairing is
  // cousins rather than siblings. Every fragment is single-line, so Rule 1 is
  // silent on it, and the dedupe still collapses the week into one entry.
  const week = Array.from({ length: 7 }, (_, i) =>
    candidate(30 + i, {
      a: { tag: 'div', cls: 'text-[12px] font-[600] truncate', w: 44, h: 16, text: `Day ${i}` },
      b: { tag: 'div', cls: 'text-[12px] font-[600] truncate', w: 44, h: 16, text: `Day ${i + 1}` },
      // Each cell overlaps its neighbour a little harder than the last, so the
      // worst-instance rule has something to pick.
      aRects: [rect(i * 40, 60, i * 40 + 44, 76)],
      bRects: [rect(i * 40 + 14 - i, 60, i * 40 + 58, 76)],
    })
  );
  const { collisionCount, worstOverlapPx } = reportableCollisions(week);

  assert.equal(collisionCount, 1);
  assert.equal(worstOverlapPx, 36, 'the worst of the seven, measured on the lines they occupy');
});

test('a pair from before this rule is judged on its union overlap, unchanged', () => {
  // The safe direction. A candidate carrying no fragments — every retained
  // reading, and any run against an older probe — keeps the figure it was
  // measured with rather than silently reading as no collision at all.
  assert.equal(reportableCollisions([candidate(89)]).collisionCount, 1);
  assert.equal(reportableCollisions([candidate(89)]).worstOverlapPx, 89);
});

test('fragments on one side only still judge on the other side union box', () => {
  // A wrapped participant beside one the scan sent no fragments for. The
  // missing side is its own box, which is what a single-fragment element's
  // rects would have said anyway.
  const { collisionCount } = reportableCollisions([
    candidate(89, { aRects: [rect(150, 100, 320, 115), rect(0, 118, 60, 133)] }),
  ]);

  assert.equal(collisionCount, 1, 'not silently dropped for a half-filled fact');
});

// ---------------------------------------------------------------------------
// Rule 4 — two different pairs are two entries (021 FR-004)
// ---------------------------------------------------------------------------

// `pairSignature` is `[a.tag + a.cls, b.tag + b.cls]`. When both participants
// carry no class attribute every such pair signs as `div | div`, and all but
// the worst are dropped as repeats.
//
// Measured at `modal:compose-existing@1440`: the report says
// `collisionCount: 1, worstOverlapPx: 25`. A hand-walk of probe.js's rules
// finds two — the date control over a `121` preview counter at 25px, and the
// same control over a `32` counter at 17px. Every retained reading back to
// `post-018-fine-final` carries the same understatement.
//
// The separator is the own-text excerpt, and it is used **only where the class
// is empty**. That scoping is the whole rule: it is what the finding asked for
// — "give the signature something to separate unclassed participants by" — and
// it is what keeps the calendar collapsing. Seven day-header pairs carry a
// class and differing text; a signature that always included text would report
// them seven times, which the contract forbids by name.
const counter = (text, w) => ({ tag: 'div', cls: '', w, h: 21, text });
const dateControl = { tag: 'div', cls: '', w: 155, h: 23, text: '08/19/2026 02:10 PM' };

test('one control over two different counters is two findings', () => {
  const { collisionCount, worstOverlapPx, collisions } = reportableCollisions([
    candidate(25, { a: dateControl, b: counter('121', 25) }),
    candidate(17, { a: dateControl, b: counter('32', 17) }),
  ]);

  assert.equal(collisionCount, 2);
  // The count moves and the worst figure does not: the second pair is the
  // smaller one, so `worstOverlapPx` is unchanged at 25. A movement in both
  // would mean the rule had done something else as well.
  assert.equal(worstOverlapPx, 25);
  assert.deepEqual(
    collisions.map((c) => c.overlapPx),
    [25, 17]
  );
});

test('the text excerpt separates only where the class is empty', () => {
  // The scoping, stated as a test. Two classed pairs differing only in text are
  // one finding — that is a repeating layout — while two unclassed pairs
  // differing in text are two.
  const classed = reportableCollisions([
    candidate(30, { a: participant('day-label'), b: { ...participant('day-label'), text: 'Mon' } }),
    candidate(24, { a: participant('day-label'), b: { ...participant('day-label'), text: 'Tue' } }),
  ]);
  assert.equal(classed.collisionCount, 1);

  const unclassed = reportableCollisions([
    candidate(30, { a: counter('121', 25), b: counter('date', 155) }),
    candidate(24, { a: counter('32', 17), b: counter('date', 155) }),
  ]);
  assert.equal(unclassed.collisionCount, 2);
});

test('two pairs identical in tag, class and text are still one finding', () => {
  const { collisionCount, worstOverlapPx } = reportableCollisions([
    candidate(25, { a: dateControl, b: counter('121', 25) }),
    candidate(17, { a: dateControl, b: counter('121', 25) }),
  ]);

  assert.equal(collisionCount, 1);
  assert.equal(worstOverlapPx, 25, 'and the worst instance is the one kept');
});

test('a pair is still unordered once text is in the signature', () => {
  // The property the signature has always had — the same two participants the
  // other way round is the same finding — must survive the new separator.
  const { collisionCount } = reportableCollisions([
    candidate(25, { a: dateControl, b: counter('121', 25) }),
    candidate(17, { a: counter('121', 25), b: dateControl }),
  ]);

  assert.equal(collisionCount, 1);
});

test('a pair from before this rule signs as it always did', () => {
  // No `text` on either participant is every retained reading. Unclassed
  // participants collapse exactly as they used to, which is the understatement
  // this rule fixes going forward without rewriting what was measured.
  const { collisionCount } = reportableCollisions([
    candidate(25, { a: { tag: 'div', cls: '', w: 155, h: 23 }, b: { tag: 'div', cls: '', w: 25, h: 21 } }),
    candidate(17, { a: { tag: 'div', cls: '', w: 155, h: 23 }, b: { tag: 'div', cls: '', w: 17, h: 21 } }),
  ]);

  assert.equal(collisionCount, 1);
});

test('the ordering and the cap are unchanged by the new signature', () => {
  // Smallest-last, capped at six, with the count reporting survivors rather
  // than what fitted — three properties this rule must not disturb while it
  // stops the collapse that was hiding entries behind the cap.
  const many = [12, 40, 9, 33, 21, 55, 17, 28].map((px, i) =>
    candidate(px, { a: counter(`a-${i}`, 40), b: counter(`b-${i}`, 40) })
  );
  const { collisions, collisionCount, worstOverlapPx } = reportableCollisions(many);

  assert.deepEqual(
    collisions.map((c) => c.overlapPx),
    [55, 40, 33, 28, 21, 17]
  );
  assert.equal(worstOverlapPx, 55);
  assert.equal(collisionCount, 8);
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

// The two relocation buckets `021` added are part of this shape and are
// asserted with it: a report that dropped them on an empty page would be
// answering "not measured" where it means "measured none", which is the
// distinction every other field here keeps.
const NOTHING_CLIPPED = {
  clippedCount: 0,
  worstCutPx: 0,
  clipped: [],
  fieldTruncated: 0,
  fieldTruncatedSignatures: [],
  marginCompensated: 0,
  marginCompensatedSignatures: [],
};

test('an empty candidate list reports zero clipping, not absent', () => {
  assert.deepEqual(reportableClipped([], { modalOpen: false }), NOTHING_CLIPPED);
});

test('a page whose every clip candidate is filtered out reads the same as one with none', () => {
  const filtered = reportableClipped([clipCandidate(3), clipCandidate(8)], { modalOpen: false });
  assert.deepEqual(filtered, NOTHING_CLIPPED);
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
  assert.deepEqual(Object.keys(decided), [
    'clippedCount',
    'worstCutPx',
    'clipped',
    'fieldTruncated',
    'fieldTruncatedSignatures',
    'marginCompensated',
    'marginCompensatedSignatures',
  ]);

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
// Rule 3 — clipped by a truncating field is not clipped content (021 FR-003)
// ---------------------------------------------------------------------------

// `clipper()` returns the nearest ancestor that hides overflow, which is the
// right frame to measure loss against — until that ancestor is a field whose
// whole job is to truncate. Then `lostPx` measures how long the string is, not
// how much of it a person cannot reach.
//
// The case that made this a P1: `panel:settings-developers@390` reported
// `span.blur-sm.select-none` 496px wide losing 257, and that figure — "two
// thirds of the screen" — is what rated finding 63. The clipper is the API
// key's own field, `public.component.tsx:598`'s `h-[44px] overflow-hidden`
// around `:599`'s `code.truncate`, and `sidewaysScrollPx: 0` in the same
// reading: nothing leaves the document.
//
// probe.js observes whether the clipper suppresses wrapping on a box one line
// tall — a fact about the *clipper*, never about the candidate's own styles.
const truncated = (over = {}) =>
  clipCandidate(257, { w: 496, tag: 'span', cls: 'blur-sm select-none', clipperIsField: true, ...over });

test('a value truncated inside its own single-line field is not clipped content', () => {
  const { clippedCount, worstCutPx, clipped, fieldTruncated, fieldTruncatedSignatures } =
    reportableClipped([truncated()], { modalOpen: false });

  assert.equal(clippedCount, 0);
  assert.equal(worstCutPx, 0);
  assert.deepEqual(clipped, []);
  // Relocated, never dropped — `wrapperSignatures`' precedent, and FR-008.
  assert.equal(fieldTruncated, 1);
  assert.deepEqual(fieldTruncatedSignatures, [
    { lostPx: 257, w: 496, tag: 'span', cls: 'blur-sm select-none' },
  ]);
});

test('the field exclusion is deduped by signature like every other bucket', () => {
  const { fieldTruncated, fieldTruncatedSignatures } = reportableClipped(
    [truncated({ lostPx: 120 }), truncated(), truncated({ lostPx: 40 })],
    { modalOpen: false }
  );

  assert.equal(fieldTruncated, 1);
  // The deepest instance represents the signature, exactly as it does in the
  // reported bucket — a relocated finding keeps the figure it was measured at.
  assert.equal(fieldTruncatedSignatures[0].lostPx, 257);
});

// The counter-cases. All three are real, all three are `panel:settings-*`
// findings that this feature's own US3 exists to fix, and a rule that took any
// of them would be hiding the work rather than measuring it.

test('a pane squeezed by its layout row still reports', () => {
  // panel:settings-developers@820 — the 117px content pane, and the finding US3
  // actually closes. Its clipper is the layout row, not a field.
  const { clippedCount, worstCutPx, fieldTruncated } = reportableClipped(
    [
      clipCandidate(117, {
        w: 654,
        tag: 'div',
        cls: 'bg-newBgColorInner flex-1 flex-col flex p-[20px] gap-[12px]',
        clipperIsField: false,
      }),
    ],
    { modalOpen: false }
  );

  assert.equal(clippedCount, 1);
  assert.equal(worstCutPx, 117);
  assert.equal(fieldTruncated, 0);
});

test('a button pushed off the panel still reports', () => {
  // panel:settings-developers@390 — 91 of the button's 95 pixels gone. This is
  // the finding the 257px reading buried, and the one US3's `flex-wrap` closes.
  const { clippedCount, worstCutPx } = reportableClipped(
    [
      clipCandidate(91, {
        w: 95,
        tag: 'button',
        cls: 'cursor-pointer px-[16px] h-[36px] bg-btnSimple hover:bg-boxHover transition-co',
        clipperIsField: false,
      }),
    ],
    { modalOpen: false }
  );

  assert.equal(clippedCount, 1);
  assert.equal(worstCutPx, 91);
});

test('019 settings bleed still reports', () => {
  // The 28px bleed `019` fixed with `min-w-0`. Its clipper is a layout
  // container, so the rule never reaches it.
  assert.equal(
    reportableClipped([clipCandidate(28, { clipperIsField: false })], { modalOpen: false })
      .clippedCount,
    1
  );
});

test('the question is about the clipper, never the candidate own styles', () => {
  // A `truncate`d element clipped by a *layout* container is losing content:
  // the truncation is its own, the loss is the row's. Reading the candidate's
  // classes instead of the clipper's box would exempt it and hide a real
  // squeeze — which is why the fact probe.js sends is about the ancestor.
  const { clippedCount } = reportableClipped(
    [clipCandidate(117, { cls: 'truncate flex-1', clipperIsField: false })],
    { modalOpen: false }
  );

  assert.equal(clippedCount, 1);
});

test('a clip candidate from before this rule is never exempted for lacking the fact', () => {
  // `clipperIsField: undefined` is not true. The safe direction is to keep
  // reporting, so every retained reading keeps meaning what it meant.
  const { clippedCount, fieldTruncated } = reportableClipped([clipCandidate(257)], {
    modalOpen: false,
  });

  assert.equal(clippedCount, 1);
  assert.equal(fieldTruncated, 0);
});

// ---------------------------------------------------------------------------
// Rule 5 — an overhang its own negative margin pays for is not a clip
// ---------------------------------------------------------------------------

// Finding 65 defect 2, and the one defect `contracts/report-rules.md` does not
// carry a rule for. It is in the spec all the same — acceptance scenario 2 and
// the quickstart movement table both require `/modal/dark/all` to report
// `clippedCount: 0` at all four widths — and the four contracted rules cannot
// reach it: its clipper is `w-screen h-screen overflow-hidden`, which is a
// layout container and not a field, so Rule 3 is silent on it. Written here as
// the fifth rule, held to FR-005 and FR-006 like the other four.
//
// The compensation is deliberate and it is documented in the page it lives on:
// `app/(extension)/modal/[style]/[platform]/page.tsx:13` is
// `w-[calc(100vw+80px)] -m-[40px]`, dropping to `+24px` / `-12px` under
// `mobile:`, so compose's own padding is cancelled and the modal fills the
// frame. The box overhangs by exactly what its margin pulls back, at every
// width — 40 where the margin is 40, 12 where it is 12.
//
// probe.js observes how much negative margin lies between the box and its
// clipper; whether that pays for the overhang is decided here.
const compensated = (over = {}) =>
  clipCandidate(40, {
    w: 1520,
    cls: 'text-textColor h-[calc(100vh+80px)] w-[calc(100vw+80px)] -m-[40px] mobile:h-[calc(100vh+24',
    compensatedPx: 40,
    ...over,
  });

test('a box overhanging by exactly its own negative margin is not clipped content', () => {
  const { clippedCount, worstCutPx, marginCompensated, marginCompensatedSignatures } =
    reportableClipped([compensated()], { modalOpen: false });

  assert.equal(clippedCount, 0);
  assert.equal(worstCutPx, 0);
  assert.equal(marginCompensated, 1);
  assert.equal(marginCompensatedSignatures[0].lostPx, 40);
});

test('a child inheriting the overhang is compensated by the ancestor that pays for it', () => {
  // The second of the two boxes `/modal/dark/all` reports. It carries no margin
  // of its own — it is `w-full` inside the compensating parent — so a rule that
  // asked only about the candidate's own margin would leave the surface at
  // `clippedCount: 1` and the movement table's `2 → 0` unmet. The compensation
  // is measured between the box and its clipper, which is where it acts.
  const { clippedCount, marginCompensated } = reportableClipped(
    [
      compensated(),
      compensated({ cls: 'w-full h-full flex-1 p-[40px] mobile:p-[12px] flex relative' }),
    ],
    { modalOpen: false }
  );

  assert.equal(clippedCount, 0);
  assert.equal(marginCompensated, 2);
});

test('the same surface at phone width, where the compensation is 12 and not 40', () => {
  // `mobile:` is `(max-width: 1025px)`, so 390, 820 and 1024 all read 12 and
  // only 1440 reads 40. The rule is a comparison and not a constant, so both
  // ends of that have to hold.
  const { clippedCount } = reportableClipped(
    [compensated({ lostPx: 12, compensatedPx: 12, w: 414 })],
    { modalOpen: false }
  );

  assert.equal(clippedCount, 0);
});

test('an overhang larger than the margin that pays for it still reports, in full', () => {
  // The narrowness of the rule, and the only thing standing between it and a
  // silenced finding. A control with `-ms-[6px]` losing 300px has lost 300px.
  const { clippedCount, worstCutPx, marginCompensated } = reportableClipped(
    [clipCandidate(300, { compensatedPx: 6 })],
    { modalOpen: false }
  );

  assert.equal(clippedCount, 1);
  assert.equal(worstCutPx, 300, 'the whole overhang is reported, not the uncompensated part');
  assert.equal(marginCompensated, 0);
});

test('the three real clips carry no compensation and are untouched by this rule', () => {
  const { clippedCount, marginCompensated } = reportableClipped(
    [
      clipCandidate(117, { cls: 'bg-newBgColorInner flex-1', compensatedPx: 0 }),
      clipCandidate(91, { tag: 'button', cls: 'cursor-pointer px-[16px]', compensatedPx: 0 }),
      clipCandidate(28, { cls: 'settings bleed', compensatedPx: 0 }),
    ],
    { modalOpen: false }
  );

  assert.equal(clippedCount, 3);
  assert.equal(marginCompensated, 0);
});

test('a clip candidate from before this rule is never exempted for lacking the fact', () => {
  const { clippedCount, marginCompensated } = reportableClipped([clipCandidate(40)], {
    modalOpen: false,
  });

  assert.equal(clippedCount, 1);
  assert.equal(marginCompensated, 0);
});

test('an empty candidate list reports both clip exemption buckets as zero, not absent', () => {
  const { fieldTruncated, fieldTruncatedSignatures, marginCompensated, marginCompensatedSignatures } =
    reportableClipped([], { modalOpen: false });

  assert.equal(fieldTruncated, 0);
  assert.deepEqual(fieldTruncatedSignatures, []);
  assert.equal(marginCompensated, 0);
  assert.deepEqual(marginCompensatedSignatures, []);
});

test('an exempted box never reaches the inside-the-modal count either', () => {
  // `clippedInside` is deduped over the inside candidates on their own, so it
  // has to apply the same exclusions — otherwise a modal reading reports a
  // truncated field the document-wide figure has already excused.
  const { clippedCount, clippedInside } = reportableClipped(
    [truncated({ inModal: true }), clipCandidate(90, { inModal: true, cls: 'real' })],
    { modalOpen: true }
  );

  assert.equal(clippedCount, 1);
  assert.equal(clippedInside, 1);
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
const NOTHING_UNDERSIZED = {
  distinctUnder44: 0,
  undersized: [],
  wrappers: 0,
  wrapperSignatures: [],
  inlineExempt: 0,
  inlineSignatures: [],
};

test('an empty candidate list reports zero, not absent', () => {
  assert.deepEqual(reportableUndersized([]), NOTHING_UNDERSIZED);
});

test('a page whose every target clears the floor reads the same as one with none', () => {
  assert.deepEqual(reportableUndersized([target(), target({ w: 120, h: 48 })]), NOTHING_UNDERSIZED);
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
// Rule 2 — a target inside a sentence is exempt from the floor (021 FR-002)
// ---------------------------------------------------------------------------

// WCAG 2.5.5, the criterion this whole scan cites, exempts a target that is "in
// a sentence or block of text". A link in running prose cannot be padded to 44px
// without breaking the line it sits in, so counting it produces a finding with
// no remedy — and five of the six items that rated finding 64 P1 are exactly
// that (020-findings.md, finding 65 defect 3, second half).
//
// The exemption is structural or it is nothing: the element is inline-level and
// its parent renders text of its own around it. probe.js observes that pair of
// facts as `inlineInText`; whether it exempts anything is decided here, and the
// "is it a link" half is decided here too — the tag is already in the candidate
// and the observation stays a plain structural one.
const inlineLink = (over = {}) =>
  ({ tag: 'a', cls: 'underline hover:font-bold', w: 89, h: 15, inlineInText: true, ...over });

test('a link inside a sentence leaves the floor count and lands in its own bucket', () => {
  // The real ones: `register.tsx:207` and `:216` — Terms of Service and Privacy
  // Policy inside "By registering you agree to our … and …" — and
  // `login.tsx:136`'s Sign Up after "Don't Have An Account?".
  //
  // Not `/auth/forgot`'s "Go back to login", which the contract first listed
  // here and the baseline refuted: `forgot.tsx:67` is `<p><Link/></p>` with no
  // text beside it, so it is a link alone in its container and is counted. It
  // has its own counter-case below.
  const { distinctUnder44, undersized, inlineExempt, inlineSignatures } = reportableUndersized([
    inlineLink({ w: 89, h: 15 }),
    inlineLink({ cls: 'underline cursor-pointer', w: 48, h: 18 }),
    inlineLink({ cls: 'underline hover:font-bold text-[12px]', w: 101, h: 18 }),
  ]);

  assert.equal(distinctUnder44, 0);
  assert.deepEqual(undersized, []);
  assert.equal(inlineExempt, 3);
  // Relocated, never dropped — the treatment wrapperSignatures already gets,
  // and the whole of FR-008. A candidate that vanished from both counts would
  // be a defect in this rule rather than a fix.
  // Smallest-first on the dimension that misses the floor, area breaking the
  // tie — the order the reported bucket is already in, and a relocated finding
  // is ordered like a reported one.
  assert.deepEqual(
    inlineSignatures.map((s) => [s.tag, s.w, s.h]),
    [
      ['a', 89, 15],
      ['a', 48, 18],
      ['a', 101, 18],
    ]
  );
});

test('an exempted link is counted by signature, like every other bucket', () => {
  const { inlineExempt, inlineSignatures } = reportableUndersized([
    inlineLink(),
    inlineLink(),
    inlineLink(),
  ]);

  assert.equal(inlineExempt, 1);
  assert.equal(inlineSignatures[0].instances, 3);
});

// The counter-cases. Each one names a real finding from this audit's record
// that must keep reporting (FR-006) — a rule that took any of these with it
// would be silencing findings, not repairing an instrument.

test('a chip in a row of chips is still counted, however inline it looks', () => {
  // /support's category chip, `button 124x42` — finding 67. It is not a link,
  // and the exemption is for links in prose. A rule that read "inline" off the
  // geometry rather than off the tag would take this with it.
  const { distinctUnder44, inlineExempt } = reportableUndersized([
    { tag: 'button', cls: 'h-[42px] px-[16px]', w: 124, h: 42, inlineInText: true },
  ]);

  assert.equal(distinctUnder44, 1);
  assert.equal(inlineExempt, 0);
});

test('a lone link in its own container is still counted', () => {
  // /p/[id]'s logo link, `a 137x40` — finding 62, and the only majority-mobile
  // surface in the product. It is a link, but nothing renders text around it:
  // page.tsx:54 gives it `flex items-center justify-center`, so it is not
  // inline-level and its parent has no text of its own. Both halves fail.
  const { distinctUnder44, inlineExempt } = reportableUndersized([
    { tag: 'a', cls: 'text-2xl flex items-center justify-center gap-[10px]', w: 137, h: 40, inlineInText: false },
  ]);

  assert.equal(distinctUnder44, 1);
  assert.equal(inlineExempt, 0);
});

test('a heading that only looks like a control is still counted', () => {
  // `h1 326x36` with cursor-pointer and no handler — finding 64's real defect,
  // and the one item of the six that must survive the exemption. It is not a
  // link, so it is not exempt however its parent renders.
  const { distinctUnder44, inlineExempt } = reportableUndersized([
    { tag: 'h1', cls: 'text-[24px] cursor-pointer', w: 326, h: 36, inlineInText: true },
  ]);

  assert.equal(distinctUnder44, 1);
  assert.equal(inlineExempt, 0);
});

test('a candidate from before this rule is never exempted for lacking the fact', () => {
  // The safe direction, and the same strictness `semantic === false` already
  // keeps. A retained reading carries `inlineInText: undefined`, which is not
  // true — so it stays reported and the reading keeps meaning what it meant.
  const { distinctUnder44, inlineExempt } = reportableUndersized([
    { tag: 'a', cls: 'underline hover:font-bold', w: 89, h: 15 },
  ]);

  assert.equal(distinctUnder44, 1);
  assert.equal(inlineExempt, 0);
});

test('an exempted link never also lands in the wrapper bucket', () => {
  // The two reclassifications are exclusive by construction — `decorative`
  // requires `semantic === false` and a link is semantic — but a candidate
  // counted twice would break the arithmetic FR-008 rests on, so it is pinned
  // rather than left to follow from a definition somewhere else.
  const { distinctUnder44, inlineExempt, wrappers } = reportableUndersized([
    inlineLink({ semantic: true, enclosing: { w: 340, h: 60 } }),
  ]);

  assert.equal(distinctUnder44, 0);
  assert.equal(inlineExempt, 1);
  assert.equal(wrappers, 0);
});

test('an empty candidate list reports both exemption buckets as zero, not absent', () => {
  // "measured none" and "not measured" are different answers, and every other
  // field in this report keeps them apart.
  const { inlineExempt, inlineSignatures } = reportableUndersized([]);

  assert.equal(inlineExempt, 0);
  assert.deepEqual(inlineSignatures, []);
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

// ---------------------------------------------------------------------------
// The predicted movement — 021 FR-007, SC-002
// ---------------------------------------------------------------------------

// Every row of the quickstart movement table, pinned as a regression.
//
// FR-007 asks that the repaired instrument be shown to change only what it
// claims to change, and it was written expecting the `020` candidates to be
// re-judged. **They do not exist.** No reading under
// `documentation/responsive-probe/readings/` carries a `*Candidates` key: every
// retained file holds `{provenance, readings, errors}` and each reading holds
// only the *reported* entries, because candidates are dropped once the report
// is built. So the fixtures below are reconstructed from what was retained —
// `tag`, `cls`, `w`, `h`, `lostPx` and `overlapPx`, all of which survive — plus
// the facts the repaired scan now sends, read off the source of the surface
// each row names.
//
// That discharges half of FR-007. The other half — "and no other figure moves"
// — cannot be reached from fixtures at all, and is carried by US2's re-take on
// the repaired instrument against an unchanged app, where every difference from
// `020` must be attributed to a named defect (FR-012). A row here is a claim
// about one surface; the baseline is the claim about the rest.

test('movement — modal:compose-existing@1440 reports two collisions, worst still 25', () => {
  // post-020-rebase-{fine,coarse}.json. One entry reported, `div 155x23` over
  // `div 25x21` at 25px; the hand-walk in 020-findings.md finds a second, the
  // same control over a 17x21 counter at 17px, dropped because both pairs sign
  // as `div | div`.
  const control = { tag: 'div', cls: '', w: 155, h: 23, text: '08/19/2026 02:10 PM' };
  const { collisionCount, worstOverlapPx } = reportableCollisions([
    candidate(25, {
      a: control,
      b: { tag: 'div', cls: '', w: 25, h: 21, text: '121' },
      aRects: [rect(600, 300, 755, 323)],
      bRects: [rect(730, 300, 755, 321)],
    }),
    candidate(17, {
      a: control,
      b: { tag: 'div', cls: '', w: 17, h: 21, text: '32' },
      aRects: [rect(600, 300, 755, 323)],
      bRects: [rect(738, 300, 755, 321)],
    }),
  ]);

  assert.equal(collisionCount, 2);
  assert.equal(worstOverlapPx, 25, 'the count moves and the worst figure does not');
});

test('movement — modal:compose-existing@1024 fine is unchanged at 84', () => {
  // The counter-case in the same modal: two single-line unclassed boxes. Rule 1
  // is arithmetically silent on single lines and Rule 4 separates rather than
  // merges, so a surface with one pair keeps one pair.
  const { collisionCount, worstOverlapPx } = reportableCollisions([
    candidate(84, {
      a: { tag: 'div', cls: '', w: 84, h: 20, text: 'Preview' },
      b: { tag: 'div', cls: '', w: 119, h: 21, text: '08/19/2026 02:10 PM' },
      aRects: [rect(300, 200, 384, 220)],
      bRects: [rect(300, 200, 419, 221)],
    }),
  ]);

  assert.equal(collisionCount, 1);
  assert.equal(worstOverlapPx, 84);
});

test('movement — /auth@390 reports no collision in either pointer mode', () => {
  // post-020-batch1b-{fine,coarse}.json, `overlapPx: 89` between two
  // `a.underline.hover:font-bold`. register.tsx:207 and :216 — Terms of Service
  // and Privacy Policy in one sentence, the second wrapped over two lines at
  // 390. The 320x33 box is the union of those lines and is on no line at all.
  const { collisionCount, worstOverlapPx } = reportableCollisions([
    candidate(89, {
      a: { tag: 'a', cls: 'underline hover:font-bold', w: 89, h: 15, text: 'Terms of Service' },
      b: { tag: 'a', cls: 'underline hover:font-bold', w: 320, h: 33, text: 'Privacy Policy' },
      aRects: [rect(35, 604, 124, 619)],
      bRects: [rect(196, 604, 355, 619), rect(35, 622, 137, 637)],
    }),
  ]);

  assert.equal(collisionCount, 0);
  assert.equal(worstOverlapPx, 0);
});

test('movement — /modal/dark/all reports nothing clipped, at all four widths', () => {
  // post-020-batch2-{fine,coarse}.json: two boxes at every width, losing 12
  // below 1025 and 40 above it — exactly the compensation
  // `(extension)/modal/[style]/[platform]/page.tsx:13` applies at that width.
  // The first carries the negative margin; the second is `w-full` inside it and
  // inherits the overhang without carrying a margin of its own.
  const surface = (px) => [
    clipCandidate(px, {
      w: px === 40 ? 1520 : 414,
      cls: 'text-textColor h-[calc(100vh+80px)] w-[calc(100vw+80px)] -m-[40px] mobile:h-[calc(100vh+24',
      compensatedPx: px,
    }),
    clipCandidate(px, {
      w: px === 40 ? 1520 : 414,
      cls: 'w-full h-full flex-1 p-[40px] mobile:p-[12px] flex relative',
      compensatedPx: px,
    }),
  ];

  for (const px of [12, 12, 12, 40]) {
    const { clippedCount, worstCutPx, marginCompensated } = reportableClipped(surface(px), {
      modalOpen: false,
    });
    assert.equal(clippedCount, 0);
    assert.equal(worstCutPx, 0);
    assert.equal(marginCompensated, 2, 'both boxes are findable in the bucket they moved to');
  }
});

test('movement — panel:settings-developers@390 reports two clipped, worst 91', () => {
  // post-020-batch3-panels-{fine,coarse}.json reports three, worst 257. The
  // 257 is the API key overhanging its own truncating field — the figure that
  // rated finding 63 P1 — and it leaves. The button losing 91 of its 95 pixels
  // and the 21px svg are the real ones, and they stay.
  const { clippedCount, worstCutPx, clipped, fieldTruncated } = reportableClipped(
    [
      clipCandidate(257, { w: 496, tag: 'span', cls: 'blur-sm select-none', clipperIsField: true }),
      clipCandidate(91, {
        w: 95,
        tag: 'button',
        cls: 'cursor-pointer px-[16px] h-[36px] bg-btnSimple hover:bg-boxHover transition-colors round',
        clipperIsField: false,
      }),
      clipCandidate(21, { w: 9, tag: 'svg', cls: '', clipperIsField: false }),
    ],
    { modalOpen: false }
  );

  assert.equal(clippedCount, 2);
  assert.equal(worstCutPx, 91);
  assert.deepEqual(
    clipped.map((c) => c.tag),
    ['button', 'svg']
  );
  assert.equal(fieldTruncated, 1, 'the 257 is relocated, not dropped');
});

test('movement — panel:settings-developers@820 is unchanged at ten clipped, worst 117', () => {
  // The counter-case that keeps Rule 3 narrow. Every one of these is clipped by
  // a layout container, and this is the finding US3 actually closes — a rule
  // that emptied /modal/dark/all by being broad would empty this too.
  const pane = [
    clipCandidate(117, { w: 654, cls: 'bg-newBgColorInner flex-1 flex-col flex p-[20px] gap-[12px]' }),
    clipCandidate(97, { w: 614, tag: 'form', cls: '' }),
    clipCandidate(97, { w: 614, cls: 'w-full mx-auto gap-[24px] flex flex-col relative rounded-[4px]' }),
    clipCandidate(97, { w: 614, cls: '' }),
    clipCandidate(97, { w: 614, cls: 'flex flex-col gap-[20px]' }),
    clipCandidate(97, { w: 614, tag: 'h3', cls: 'text-[20px]' }),
    ...Array.from({ length: 4 }, (_, i) => clipCandidate(60 + i, { w: 600, cls: `row-${i}` })),
  ].map((c) => ({ ...c, clipperIsField: false, compensatedPx: 0 }));

  const { clippedCount, worstCutPx, fieldTruncated, marginCompensated } = reportableClipped(pane, {
    modalOpen: false,
  });

  assert.equal(clippedCount, 10);
  assert.equal(worstCutPx, 117);
  assert.equal(fieldTruncated, 0);
  assert.equal(marginCompensated, 0);
});

test('movement — the /auth* funnel keeps one floor finding per route, not two', () => {
  // post-020-batch1b-coarse.json reads `distinctUnder44: 2` on /auth,
  // /auth/activate and /auth/forgot alike. One of the two is a link inside a
  // sentence and leaves; the other is the h1 with a cursor and no handler,
  // which is finding 64's real defect and must stay. /auth carries two inline
  // links and so goes to 0 — both of its items are in prose.
  const heading = { tag: 'h1', cls: 'text-[24px] cursor-pointer', w: 326, h: 36, inlineInText: false };
  const link = (w, h, cls) => ({ tag: 'a', cls, w, h, inlineInText: true });

  const forgot = reportableUndersized([heading, link(101, 18, 'underline')]);
  assert.equal(forgot.distinctUnder44, 1);
  assert.equal(forgot.undersized[0].tag, 'h1');
  assert.equal(forgot.inlineExempt, 1);

  const register = reportableUndersized([
    link(89, 15, 'underline hover:font-bold'),
    link(74, 15, 'underline hover:font-bold text-[12px]'),
  ]);
  assert.equal(register.distinctUnder44, 0);
  assert.equal(register.inlineExempt, 2);
});

test('movement — /support coarse is unchanged at one finding over four instances', () => {
  // post-020-batch1-coarse.json: `distinctUnder44: 1`, the category chip, and
  // the report already says `instances: 4` — finding 67 is the chip row and not
  // a chip. It is a <button>, so no exemption reaches it.
  const chip = { tag: 'button', cls: 'h-[42px] px-[16px] rounded-[8px]', w: 124, h: 42, inlineInText: true };
  const { distinctUnder44, undersized, inlineExempt } = reportableUndersized([chip, chip, chip, chip]);

  assert.equal(distinctUnder44, 1);
  assert.equal(undersized[0].instances, 4);
  assert.equal(inlineExempt, 0);
});

// ---- Rule 6 — content that escapes a container which does not clip it ----
//
// The blind spot finding 69 fell through. The clip sweep asks an element
// whether an *ancestor* cuts it off, and `clipper()` answers null twice over:
// once when an ancestor scrolls, and once when nothing clips at all. The second
// answer is not "contained" — it is content painting over whatever sits beside
// it, and no rule in this file could see it.
//
// `/launches` under a coarse pointer is the case. The calendar's post card
// carries a `flex items-center justify-center` strip holding a state chip and
// four 44px action targets — roughly 290px of content that cannot shrink,
// because `.cal-chip` is `whitespace-nowrap` and each icon carries
// `coarse:min-w-[44px]`. The week grid gives that strip a 58px column
// (`minmax(58px, 1fr)`), so it paints ~116px past each edge of its own card and
// over the neighbouring days. `post-020-rebase-coarse.json` measured that exact
// surface on a build that already had the defect and reported `clippedCount: 0`,
// `collisionCount: 0`, `sidewaysScrollPx: 0` — three zeroes and nothing wrong.
//
// Nothing clips it, so it is not clipped. Neither participant renders text, so
// the collision sweep never pairs it. The scroll is on an inner container, so
// the document never widens. The rule has to be asked of the *container*.
const escapeCandidate = (escapedPx, over = {}) => ({
  escapedPx,
  w: 58,
  tag: 'div',
  cls: 'text-[11px] h-[24px] coarse:h-[44px] w-full flex items-center justify-center gap-[10px]',
  inModal: false,
  compensatedPx: 0,
  ...over,
});

// The relocation bucket is part of the shape, asserted with it for the same
// reason the clip report's two are: "measured none" and "not measured" are
// different answers, and FR-008 requires a candidate that left the count to be
// findable rather than gone.
const NOTHING_ESCAPED = {
  escapedCount: 0,
  worstEscapePx: 0,
  escaped: [],
  escapeCompensated: 0,
  escapeCompensatedSignatures: [],
};

test('an empty candidate list reports zero escaping, not absent', () => {
  assert.deepEqual(reportableEscaped([], { modalOpen: false }), NOTHING_ESCAPED);
});

test('a page whose every escape candidate is filtered out reads the same as one with none', () => {
  const filtered = reportableEscaped([escapeCandidate(3), escapeCandidate(8)], { modalOpen: false });
  assert.deepEqual(filtered, NOTHING_ESCAPED);
});

test('an escape at or below 8px is not a finding', () => {
  // The same floor the clip and collision sweeps answer to. A child a few
  // pixels proud of its parent is a rounding artefact, not a layout failure.
  assert.equal(reportableEscaped([escapeCandidate(8)], { modalOpen: false }).escapedCount, 0);
  assert.equal(reportableEscaped([escapeCandidate(9)], { modalOpen: false }).escapedCount, 1);
});

test('the calendar post strip escaping its column is reported with its geometry', () => {
  // Finding 69. The figure that matters is how far it paints outside, not how
  // wide the content is: a person sees icons on top of Thursday.
  const { escapedCount, worstEscapePx, escaped } = reportableEscaped([escapeCandidate(116)], {
    modalOpen: false,
  });

  assert.equal(escapedCount, 1);
  assert.equal(worstEscapePx, 116);
  assert.deepEqual(escaped, [
    {
      escapedPx: 116,
      w: 58,
      tag: 'div',
      cls: 'text-[11px] h-[24px] coarse:h-[44px] w-full flex items-center justify-center gap-[10px]',
    },
  ]);
});

test('the boundary flag is not part of the escape finding', () => {
  // `inModal` decides which figure a candidate counts toward and is not part of
  // what is reported, exactly as it is not for a clipped box.
  const { escaped } = reportableEscaped([escapeCandidate(116, { inModal: true })], {
    modalOpen: true,
  });
  assert.equal(Object.hasOwn(escaped[0], 'inModal'), false);
});

test('one strip repeated across a week is one entry, at its deepest instance', () => {
  // Seven day columns render the same strip from the same classes. That is one
  // thing to fix however many times the grid repeats it — the dedupe every
  // other rule in this file already applies, worst-wins so the figure reported
  // is the one actually measured at its worst.
  const { escapedCount, worstEscapePx, escaped } = reportableEscaped(
    [escapeCandidate(40), escapeCandidate(116), escapeCandidate(72)],
    { modalOpen: false }
  );

  assert.equal(escapedCount, 1);
  assert.equal(worstEscapePx, 116);
  assert.equal(escaped.length, 1);
});

test('two different containers escaping are two entries', () => {
  const { escapedCount, worstEscapePx } = reportableEscaped(
    [escapeCandidate(116), escapeCandidate(31, { cls: 'flex gap-[8px] px-[5px]', w: 318 })],
    { modalOpen: false }
  );

  assert.equal(escapedCount, 2);
  assert.equal(worstEscapePx, 116);
});

test('the count is what survived the rules, not what fitted in the report', () => {
  // The same split `clippedCount` and `collisionCount` keep: a count that
  // quietly capped at six would read identically on a page with seven escaping
  // containers and one with seventy.
  const many = Array.from({ length: 9 }, (_, i) =>
    escapeCandidate(20 + i, { cls: `flex justify-center w-[${i}px]` })
  );
  const { escapedCount, escaped } = reportableEscaped(many, { modalOpen: false });

  assert.equal(escapedCount, 9);
  assert.equal(escaped.length, 6);
});

// The counter-cases. A rule that took either of these would be hiding a
// deliberate layout, which is the half of finding 65 that invented findings
// rather than the half that dropped them.

test('an overhang the layout pays for in negative margin is not an escape', () => {
  // `/modal/dark/all` again — `w-[calc(100vw+80px)] -m-[40px]` so that
  // compose's own padding is cancelled and the modal fills its frame. The child
  // is pulled back by exactly as much as it sticks out. Same shape, same
  // precedent and the same `paidForByMargin` test the clip rule already uses.
  const { escapedCount, escapeCompensated, escapeCompensatedSignatures } = reportableEscaped(
    // `inModal`, because that is where this box is: the reading is of the modal
    // and the filter above would otherwise drop it as page furniture.
    [
      escapeCandidate(40, {
        compensatedPx: 40,
        w: 1024,
        cls: 'w-[calc(100vw+80px)] -m-[40px]',
        inModal: true,
      }),
    ],
    { modalOpen: true }
  );

  assert.equal(escapedCount, 0);
  // Relocated, never dropped.
  assert.equal(escapeCompensated, 1);
  assert.equal(escapeCompensatedSignatures[0].escapedPx, 40);
});

test('an overhang wider than its compensation still reports all of it', () => {
  // Narrow on purpose, and the comparison is what makes it narrow: a container
  // with `-ms-[6px]` whose child escapes by 300 has escaped by 300.
  const { escapedCount, worstEscapePx, escapeCompensated } = reportableEscaped(
    [escapeCandidate(300, { compensatedPx: 6 })],
    { modalOpen: false }
  );

  assert.equal(escapedCount, 1);
  assert.equal(worstEscapePx, 300);
  assert.equal(escapeCompensated, 0);
});

test('a candidate carrying no compensation figure is treated as not compensated', () => {
  // Every retained reading predates this rule and carries no `compensatedPx`.
  // A missing fact must never read as an exemption — the same way
  // `clipperIsField: undefined` and `inlineInText: undefined` do not.
  const { escapedCount, escapeCompensated } = reportableEscaped(
    [{ escapedPx: 116, w: 58, tag: 'div', cls: 'flex justify-center', inModal: false }],
    { modalOpen: false }
  );

  assert.equal(escapedCount, 1);
  assert.equal(escapeCompensated, 0);
});

test('a modal reading judges the modal, not the page behind it', () => {
  // The rule `reportableCollisions` and `reportableUndersized` both apply: what
  // is being measured is the modal, and a container escaping out on the page
  // underneath is a fact about the page. `clipped` keeps a separate inside
  // figure instead — that asymmetry is deliberate and documented at the call.
  const behind = escapeCandidate(240, { cls: 'flex justify-center behind', inModal: false });
  const inside = escapeCandidate(31, { cls: 'flex justify-center inside', inModal: true });

  const closed = reportableEscaped([behind, inside], { modalOpen: false });
  assert.equal(closed.escapedCount, 2);
  assert.equal(closed.worstEscapePx, 240);

  const open = reportableEscaped([behind, inside], { modalOpen: true });
  assert.equal(open.escapedCount, 1);
  assert.equal(open.worstEscapePx, 31);
  assert.equal(Object.hasOwn(open, 'escapedInside'), false);
});
