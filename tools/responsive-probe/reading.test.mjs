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
  CANONICAL_ROUTES,
  CANONICAL_VIEWPORTS,
  VARIANCE,
  baseline,
  baselineEligibility,
  comparability,
  completeness,
  difference,
  preconditionVerdict,
  provenance,
  reportableCollisions,
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
