#!/usr/bin/env node
// Drives probe.js over every route × viewport and prints one report.
//
// The probe is tooling, not app code: it never ships in the image and never
// runs on the server. It drives a browser against a deployed URL.
//
// Run it locally — the GitHub workflow is inert, see the header of
// .github/workflows/responsive-probe.yml for why:
//
//   PROBE_EMAIL=... PROBE_PASSWORD=... node tools/responsive-probe/run.mjs
//
// Export those two in your shell profile and it is a bare `node run.mjs`.
// Already signed in from an earlier run? Skip the login entirely:
//
//   PROBE_SKIP_LOGIN=1 PROBE_SESSION=sharek node tools/responsive-probe/run.mjs
//
// Narrow a run while iterating with PROBE_ROUTES and PROBE_VIEWPORTS; point it
// somewhere else with PROBE_BASE_URL.
//
// Requires agent-browser: npm i -g agent-browser && agent-browser install
//
// THE ACCOUNT MUST SPAN MORE THAN ONE CUSTOMER GROUPING. This is enforced, not
// advised: a pre-flight runs before any reading is recorded, and a run on an
// account that cannot reproduce the failure stops and says so.
//
// Layout failures land on whichever element loses the fight for width, and that
// depends on account contents. Concretely: `Select Customer` renders only when
// integrations span 2+ customer values — an unassigned channel counts as one
// (select.customer.tsx:48-58). That single control is ~157px, and it is what
// pushes the calendar column's minimum past the point where the channels rail
// collapses and takes Create Post with it.
//
// Measured 2026-08-15 at 1024px, same account before and after adding a
// customer:
//
//   1 channel,  0 customers  →  rail 221px, Create Post clickable   FALSE GREEN
//   2 channels, 1 customer   →  rail  64px, Create Post COVERED     correct
//
// So do not "tidy up" the probe account. Unassign its customer and the probe
// now refuses to run rather than going quiet while the app stays broken.
// Measuring such an environment deliberately is still possible:
//
//   PROBE_WAIVE_PRECONDITION=1 node tools/responsive-probe/run.mjs
//
// A waived run is marked as such and can never be accepted as a baseline.
//
// A complete run on a qualifying account can be kept as the reference the
// audit's later phases are measured against, and a fresh run held against it:
//
//   node tools/responsive-probe/run.mjs --capture-baseline
//   node tools/responsive-probe/run.mjs --compare
//
// The baseline is kept at documentation/responsive-probe/baseline.json, which
// is tracked in the private sharek-private overlay and not in this repository —
// a reading quotes on-page control text that can name the account's channels
// and customers. A baseline does exist; if there is none on disk here, you are
// working from a clone of the public fork and that is the expected state rather
// than a fault. Ask the maintainer for it. See that file's README for how one
// is captured and replaced.
//
// Findings never fail the run — whatever it measures, it exits 0. Exit 1 means
// the run could not be performed or trusted: sign-in failed, the target was
// unreachable, or the precondition was unmet. Failing on a regression waits for
// phases 3 and 4, when the numbers are worth defending.

import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CANONICAL_ROUTES,
  CANONICAL_VIEWPORTS,
  baseline,
  baselineEligibility,
  comparability,
  difference,
  preconditionVerdict,
  provenance,
  viewportKey,
} from './reading.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const BASE = process.env.PROBE_BASE_URL || 'https://dash.sharek.app';
const EMAIL = process.env.PROBE_EMAIL;
const PASSWORD = process.env.PROBE_PASSWORD;
const SESSION = process.env.PROBE_SESSION || 'probe';
const WAIVED = !!process.env.PROBE_WAIVE_PRECONDITION;
const CAPTURE_BASELINE = process.argv.includes('--capture-baseline');
const COMPARE = process.argv.includes('--compare');

// Layout depends on what the account contains — an account with one channel
// does not reproduce failures an account with six does, and the 2026-08-15
// tablet P0 is invisible on a clean account. Readings are a series per account;
// never diff one account's numbers against another's.
const ACCOUNT = process.env.PROBE_SKIP_LOGIN ? `session:${SESSION}` : EMAIL;

// What a full run covers lives in reading.mjs, because that is where a run is
// judged complete against it. These two only narrow it for iteration, and a
// narrowed run can never be a baseline.
//
// PROBE_VIEWPORTS=390x844,1024x768
const VIEWPORTS = process.env.PROBE_VIEWPORTS
  ? process.env.PROBE_VIEWPORTS.split(',').map((v) => {
      const [w, h] = v.trim().split('x').map(Number);
      return { w, h, label: `${w}×${h}` };
    })
  : CANONICAL_VIEWPORTS;

// PROBE_ROUTES=/launches,/media
const ROUTES = process.env.PROBE_ROUTES
  ? process.env.PROBE_ROUTES.split(',').map((r) => r.trim())
  : CANONICAL_ROUTES;

const probeSource = readFileSync(join(HERE, 'probe.js'), 'utf8');

const ab = (args, opts = {}) =>
  execFileSync('agent-browser', ['--session', SESSION, ...args], {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'inherit'],
    ...opts,
  });

function login() {
  // Locally you are usually already signed in from an earlier run:
  //   PROBE_SKIP_LOGIN=1 PROBE_SESSION=sharek node tools/responsive-probe/run.mjs
  if (process.env.PROBE_SKIP_LOGIN) {
    console.log(`reusing session "${SESSION}"\n`);
    return;
  }
  if (!EMAIL || !PASSWORD) {
    throw new Error('PROBE_EMAIL and PROBE_PASSWORD are required');
  }
  ab(['set', 'viewport', '1440', '900']);
  ab(['open', `${BASE}/auth/login`]);
  ab(['wait', '--load', 'networkidle']);
  // The password reaches agent-browser as an argument. Acceptable on an
  // ephemeral single-tenant CI runner and on your own machine; do not run this
  // on a shared host.
  ab(['fill', 'input[type=email]', EMAIL]);
  ab(['fill', 'input[type=password]', PASSWORD]);
  ab(['click', 'button[type=submit]']);
  ab(['wait', '--load', 'networkidle']);
  const url = ab(['get', 'url']).trim();
  if (/\/auth(\/|$)/.test(url)) {
    throw new Error(`login failed — still at ${url}`);
  }
  console.log(`signed in, landed at ${url}\n`);
}

function measure(route, viewport) {
  ab(['set', 'viewport', String(viewport.w), String(viewport.h)]);
  ab(['open', `${BASE}${route}`]);
  ab(['wait', '--load', 'networkidle']);
  ab(['wait', '1800']); // charts and lazy panels settle after networkidle
  return JSON.parse(ab(['eval', '--stdin'], { input: probeSource }));
}

// One navigation, before anything is recorded, to establish that this account
// can still reproduce the failure the probe exists to catch. /launches at
// desktop width because that is where the control lives and where it is
// certain to have room to render — the point is whether the account has it at
// all, not whether it survives a narrow viewport.
function preflight() {
  let reading;
  try {
    reading = measure('/launches', { w: 1440, h: 900 });
  } catch (err) {
    // Not a precondition answer at all — we never got to ask. Kept distinct
    // from both failing verdicts so the three are never confused.
    console.error(`could not reach ${BASE}/launches — ${err.message.split('\n')[0]}`);
    process.exit(1);
  }
  return {
    precondition: preconditionVerdict({ ...reading.precondition, waived: WAIVED }),
    // Read here rather than in the loop: the rail is on screen at desktop width
    // and this is the one navigation guaranteed to happen on every run.
    build: reading.build,
  };
}

const pad = (s, n) => String(s).padEnd(n);
const results = [];
const errors = [];

login();

const { precondition, build } = preflight();
console.log(`pre-flight: ${precondition.verdict} — ${precondition.reason}`);
if (precondition.verdict !== 'qualified' && precondition.verdict !== 'waived') {
  console.error(`\n${precondition.remedy}`);
  console.error('\nnothing was measured and no results file was written.');
  process.exit(1);
}
console.log('');

console.log(
  `measuring ${BASE} as ${ACCOUNT}\n` +
    'layout depends on account contents — compare only against runs on this same account\n'
);

for (const viewport of VIEWPORTS) {
  console.log(`=== ${viewport.w}×${viewport.h} — ${viewport.label} ===`);
  console.log(pad('route', 14) + pad('clipped', 9) + pad('worst', 8) + pad('touch <44', 11) + 'primary action');
  for (const route of ROUTES) {
    let r;
    try {
      r = measure(route, viewport);
    } catch (err) {
      const message = err.message.split('\n')[0];
      // Recorded, not just printed: a run missing a route is not complete, and
      // that has to survive into the results file to be judged there.
      errors.push({ route, viewport: viewportKey(viewport), message });
      console.log(pad(route, 14) + `error: ${message}`);
      continue;
    }
    results.push({ route, viewport: viewportKey(viewport), ...r });
    console.log(
      pad(route, 14) +
        pad(r.clippedCount, 9) +
        pad(r.worstCutPx ? `${r.worstCutPx}px` : '—', 8) +
        pad(`${r.touch.under44}/${r.touch.total}`, 11) +
        (r.cta ? r.cta.verdict : '—')
    );
  }
  console.log('');
}

const covered = results.filter((r) => r.cta?.verdict === 'COVERED');
const clipped = results.filter((r) => r.clippedCount > 0);
const touch = results.filter((r) => r.touch.under44 > 0);

console.log('--- summary ---');
console.log(`readings          ${results.length}`);
console.log(`primary action covered  ${covered.length}   ${covered.map((r) => `${r.route}@${r.viewport}`).join(', ') || '—'}`);
console.log(`routes with clipping    ${clipped.length}`);
console.log(`routes under the touch floor  ${touch.length}`);

// Everything needed to judge whether another reading is comparable to this one.
// Without it two runs on different accounts, or against different builds, look
// alike on paper — which is how the audit ended up with three tables that could
// not be held against each other.
const run = {
  provenance: provenance({
    account: ACCOUNT,
    baseUrl: BASE,
    build,
    capturedAt: new Date().toISOString(),
    routes: ROUTES,
    viewports: VIEWPORTS.map(viewportKey),
    precondition,
  }),
  readings: results,
  errors,
};

console.log('\n--- provenance ---');
console.log(`account     ${run.provenance.account}`);
console.log(`target      ${run.provenance.baseUrl}`);
console.log(`build       ${run.provenance.build || 'unknown — the rail printed no commit SHA'}`);
console.log(`captured    ${run.provenance.capturedAt}`);
console.log(`routes      ${run.provenance.routes.join(' ')}`);
console.log(`widths      ${run.provenance.viewports.join(' ')}`);
console.log(`precondition ${run.provenance.precondition.verdict}`);

writeFileSync(join(HERE, 'probe-results.json'), JSON.stringify(run, null, 2));
console.log(`\nwrote tools/responsive-probe/probe-results.json  (account: ${ACCOUNT})`);
console.log('readings are comparable only against earlier runs on the SAME account');

// ---------------------------------------------------------------------------
// The baseline
// ---------------------------------------------------------------------------

// The accepted "before" the audit's later phases are measured against. It is
// kept in documentation/responsive-probe/, which is tracked in the sharek-private
// overlay rather than in this repository, because a reading records excerpts of
// on-page control text that can name the account's channels and customers.
//
// So: if you cloned this fork and there is no baseline on disk, that is the
// expected state, not a fault and not "nothing has ever been measured". Ask the
// maintainer for it. Replacing one is an overlay commit, which is what makes it
// a deliberate act — an ordinary run never opens this path for writing.
const BASELINE = join(HERE, '..', '..', 'documentation', 'responsive-probe', 'baseline.json');

if (COMPARE) {
  let stored;
  try {
    stored = JSON.parse(readFileSync(BASELINE, 'utf8'));
  } catch (err) {
    // "No baseline" is not "no differences", so say which it is.
    console.error(
      `\nno baseline to compare against — ${err.code === 'ENOENT' ? 'documentation/responsive-probe/baseline.json does not exist' : err.message}`
    );
    console.error(
      'it is kept in the sharek-private overlay, not in this repository; an absent baseline in a ' +
        'clone of the fork is expected. Capture one with --capture-baseline.'
    );
    process.exit(1);
  }

  console.log('\n--- against the baseline ---');
  console.log(`baseline captured ${stored.provenance.capturedAt} on build ${stored.provenance.build || 'unknown'}`);

  const { comparable, reason } = comparability(stored, run);
  if (!comparable) {
    // Shown instead of a diff, never as a difference (FR-011).
    console.log(`not comparable: ${reason}`);
  } else {
    const { changes, advisory } = difference(stored, run);
    console.log(
      changes.length ? `${changes.length} change(s) in fields the baseline calls stable:` : 'no change in any field the baseline calls stable'
    );
    for (const c of changes) {
      console.log(`  ${pad(`${c.route}@${c.viewport}`, 26)}${pad(c.field, 16)}${JSON.stringify(c.from)} → ${JSON.stringify(c.to)}`);
    }
    if (advisory.length) {
      console.log(`\n${advisory.length} movement(s) in fields the baseline calls advisory — shown, not counted:`);
      for (const a of advisory) {
        console.log(`  ${pad(`${a.route}@${a.viewport}`, 26)}${pad(a.field, 16)}${JSON.stringify(a.from)} → ${JSON.stringify(a.to)}`);
      }
    }
  }
}

if (CAPTURE_BASELINE) {
  const { eligible, reason } = baselineEligibility(run);
  if (!eligible) {
    console.error(`\nrefusing to capture a baseline: ${reason}`);
    console.error('the baseline on disk is unchanged.');
    process.exit(1);
  }
  // The directory arrives with the overlay checkout, but a machine that has the
  // fork and not the overlay should still be able to capture one.
  mkdirSync(dirname(BASELINE), { recursive: true });
  writeFileSync(BASELINE, JSON.stringify(baseline(run), null, 2));
  console.log('\ncaptured baseline → documentation/responsive-probe/baseline.json');
  console.log('it lives in the sharek-private overlay — commit it there with explicit paths.');
}
