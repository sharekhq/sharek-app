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
  baseline,
  baselineEligibility,
  comparability,
  completeness,
  difference,
  preconditionVerdict,
  provenance,
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
