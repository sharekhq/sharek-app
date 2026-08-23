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
  CANONICAL_MODALS,
  CANONICAL_ROUTES,
  CANONICAL_VIEWPORTS,
  arrival,
  baseline,
  baselineEligibility,
  comparability,
  completeness,
  difference,
  preconditionVerdict,
  provenance,
  reachableWidths,
  reportableClipped,
  reportableCollisions,
  reportableEscaped,
  reportableUndersized,
  targetKey,
  viewportKey,
} from './reading.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const BASE = process.env.PROBE_BASE_URL || 'https://dash.sharek.app';
const EMAIL = process.env.PROBE_EMAIL;
const PASSWORD = process.env.PROBE_PASSWORD;
const SESSION = process.env.PROBE_SESSION || 'probe';
const WAIVED = !!process.env.PROBE_WAIVE_PRECONDITION;

// Whether a control clears 44px is a property of the pointer, not of the
// viewport — five of the seven routes report the same undersized count at every
// width — so half of what this instrument is for is invisible to a run that
// only varies width. PROBE_POINTER=coarse makes the browser report what a phone
// reports. Anything else, including nothing, leaves every existing invocation
// measuring exactly what it measured before.
const POINTER = process.env.PROBE_POINTER === 'coarse' ? 'coarse' : 'fine';
const CAPTURE_BASELINE = process.argv.includes('--capture-baseline');
const COMPARE = process.argv.includes('--compare');

// Layout depends on what the account contains — an account with one channel
// does not reproduce failures an account with six does, and the 2026-08-15
// tablet P0 is invisible on a clean account. Readings are a series per account;
// never diff one account's numbers against another's.
const ACCOUNT = process.env.PROBE_SKIP_LOGIN ? `session:${SESSION}` : EMAIL;

// A run covering surfaces outside the canonical seven declares what it set out
// to cover, and is judged against that declaration instead. It is never
// baseline-eligible and never competes with the canonical series — which is the
// whole point, because CANONICAL_ROUTES stays at seven and every retained
// reading back to baseline.json keeps its meaning.
//
//   PROBE_SURVEY=documentation/responsive-probe/surveys/batch-1.json
//
// The file is the declaration:
//
//   { "routes": [...],
//     "targets": [ { id, kind, route, open[], settle, arrived?, widths? } ],
//     "gaps":    [ { "surface": "/oauth/authorize", "reason": "…" } ] }
//
// It is a file rather than a handful of environment variables because a gap
// carries a sentence, a target carries its click steps, and both belong beside
// the reading they explain rather than in shell history.
const SURVEY = process.env.PROBE_SURVEY
  ? JSON.parse(readFileSync(process.env.PROBE_SURVEY, 'utf8'))
  : null;
const SURVEY_GAPS = SURVEY?.gaps || [];
const gapped = new Set(SURVEY_GAPS.map((g) => g.surface));

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
// A survey's routes come from its declaration, minus the surfaces it declared
// unreachable — those are gaps with reasons, not omissions, and attempting them
// would fill `errors` with things that were never going to work.
const ROUTES = SURVEY
  ? SURVEY.routes.filter((r) => !gapped.has(r))
  : process.env.PROBE_ROUTES
  ? process.env.PROBE_ROUTES.split(',').map((r) => r.trim())
  : CANONICAL_ROUTES;

// PROBE_MODALS=compose, or PROBE_MODALS=none to leave every surface closed.
// Narrowing works the way the two above do and means the same thing: a
// narrowed run is for iteration and can never be a baseline.
const TARGETS = SURVEY
  ? SURVEY.targets || []
  : process.env.PROBE_MODALS === 'none'
  ? []
  : process.env.PROBE_MODALS
  ? process.env.PROBE_MODALS.split(',')
      .map((id) => id.trim())
      .map((id) => {
        const target = CANONICAL_MODALS.find((m) => m.id === id);
        if (!target) throw new Error(`no modal target called ${id}`);
        return target;
      })
  : CANONICAL_MODALS;

const probeSource = readFileSync(join(HERE, 'probe.js'), 'utf8');

const ab = (args, opts = {}) =>
  execFileSync('agent-browser', ['--session', SESSION, ...args], {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'inherit'],
    ...opts,
  });

// Three ways to ask for a coarse pointer, measured 2026-08-18 against
// agent-browser 0.27.0 rather than assumed, because two of them look right and
// do nothing:
//
//   set device "iPhone 12"               UA and DPR only — pointer stays fine
//   Emulation.setEmulatedMedia           has no pointer or hover among its
//                                        features; returns {} either way
//   Emulation.setTouchEmulationEnabled   pointer: coarse, hover: none, and the
//                                        viewport left alone            ← this
//
// setDeviceMetricsOverride({mobile:true}) also works and was rejected: it
// shortens the frame by the mobile browser chrome, which moves the width axis
// this run is supposed to hold still.
//
// The override is scoped to the CDP session, so the socket has to stay open for
// the whole run — Chrome drops it the moment the connection closes, leaving a
// run that says coarse in its provenance and measured a mouse. measure() checks
// every reading against what the page reports rather than trusting this.
async function emulateCoarsePointer() {
  const endpoint = ab(['get', 'cdp-url']).trim().split('\n').pop();
  const ws = new WebSocket(endpoint);

  let id = 0;
  const pending = new Map();
  const send = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const message = { id: ++id, method, params, ...(sessionId ? { sessionId } : {}) };
      pending.set(message.id, { resolve, reject });
      ws.send(JSON.stringify(message));
    });

  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    const waiting = message.id && pending.get(message.id);
    if (!waiting) return;
    pending.delete(message.id);
    if (message.error) waiting.reject(new Error(JSON.stringify(message.error)));
    else waiting.resolve(message.result);
  };

  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = () => reject(new Error(`could not reach the browser over CDP at ${endpoint}`));
  });

  // Every page target, not just the one that looks like the app: agent-browser
  // decides which tab it drives, and an override on a tab nothing visits costs
  // nothing. It survives navigation, so this runs once.
  const { targetInfos } = await send('Target.getTargets');
  const pages = targetInfos.filter((t) => t.type === 'page');
  if (!pages.length) {
    throw new Error('no page open to emulate a pointer on — open one before asking for coarse');
  }
  for (const page of pages) {
    const { sessionId } = await send('Target.attachToTarget', {
      targetId: page.targetId,
      flatten: true,
    });
    await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }, sessionId);
  }

  return ws;
}

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

  // networkidle can settle against the page being left behind, so the URL read
  // straight after a click is the sign-in page whether or not signing in
  // worked. A warm session redirects fast enough to hide that; a cold one does
  // not, and reported a successful login as a failure. Re-read for up to five
  // seconds before believing it, so the error below only ever means what it says.
  let url = ab(['get', 'url']).trim();
  for (let i = 0; i < 10 && /\/auth(\/|$)/.test(url); i++) {
    ab(['wait', '500']);
    url = ab(['get', 'url']).trim();
  }
  if (/\/auth(\/|$)/.test(url)) {
    throw new Error(`login failed — still at ${url}`);
  }
  console.log(`signed in, landed at ${url}\n`);
}

// Everything that happens once the surface is on screen, shared by both axes so
// that a modal reading is decided by exactly the same rules a route reading is.
function readPage() {
  const {
    clippedCandidates,
    collisionCandidates,
    undersizedCandidates,
    escapedCandidates,
    pointerCoarse,
    ...reading
  } =
    JSON.parse(ab(['eval', '--stdin'], { input: probeSource }));
  // The emulation lives on a socket that has to survive the whole run. If it
  // ever drops, every later reading quietly becomes a fine one filed under a
  // coarse provenance — precisely the mislabelling the pointer field was added
  // to prevent, so it is caught here rather than recorded.
  if (pointerCoarse !== (POINTER === 'coarse')) {
    throw new Error(
      `measured under a ${pointerCoarse ? 'coarse' : 'fine'} pointer, but this run is ${POINTER}`
    );
  }
  // The page reports every pair of text boxes that intersect; which of them is
  // a squeeze and which is the design is a rule, and rules live in reading.mjs.
  // Only the verdict is kept — the candidates never reach a stored reading.
  //
  // Touch targets are the same shape: the page measures every interactive
  // element, and the floor and the dedupe are decided there too. The deduped
  // count sits beside the instance count it corrects rather than replacing it,
  // so a reader sees both — /launches@820 on 2b50f37c reads 162 instances and
  // 15 controls, and neither half of that is the whole finding.
  //
  // Clipping is the third and last of them. Both rules that judge it need to
  // know whether a modal was open, and that is answered here rather than
  // inferred downstream: `reading.wrapper` is present only when the page found
  // a modal root, which is the same signal the modal axis already throws on a
  // few lines below when a target did not reach the screen. Inferring it from
  // the candidates instead would read a modal that clips nothing and covers
  // nothing as no modal at all, and silently reverse the collision rule on
  // exactly the readings that look cleanest.
  const modalOpen = !!reading.wrapper;
  const { distinctUnder44, undersized, wrappers, wrapperSignatures, inlineExempt, inlineSignatures } =
    reportableUndersized(undersizedCandidates, { modalOpen });
  return {
    ...reading,
    ...reportableClipped(clippedCandidates, { modalOpen }),
    ...reportableCollisions(collisionCandidates, { modalOpen }),
    // The fourth rule, and the one that answers a question the other three
    // cannot: content that is neither cut off nor overlapping text, painted
    // outside a container that does not clip it.
    ...reportableEscaped(escapedCandidates, { modalOpen }),
    // `wrappers` sits beside `distinctUnder44` because it is the other half of
    // the same count — how many candidates the wrapper rule moved out of it —
    // and `wrapperSignatures` beside `undersized` for the same reason the
    // detail lists already sit there: a count nobody can inspect is a count
    // nobody can check. `inlineExempt` and `inlineSignatures` are the second
    // such pair, on the same terms: a link inside a sentence leaves the floor
    // count and has to stay findable, or the exemption is a silencing.
    touch: { ...reading.touch, distinctUnder44, wrappers, inlineExempt },
    undersized,
    wrapperSignatures,
    inlineSignatures,
  };
}

function measure(route, viewport) {
  ab(['set', 'viewport', String(viewport.w), String(viewport.h)]);
  ab(['open', `${BASE}${route}`]);
  ab(['wait', '--load', 'networkidle']);
  ab(['wait', '1800']); // charts and lazy panels settle after networkidle
  return readPage();
}

// Is this selector laid out here? Asked before each click rather than clicking
// and forgiving what fails, because the two cases are not the same thing: the
// channels drawer toggle is `hidden phone:flex`, so at 1024 there is correctly
// nothing to click, while a Create Post button that has gone missing is the
// finding. Only a step declared optional is allowed to be absent.
const laidOut = (selector) =>
  ab(['eval', `!!document.querySelector(${JSON.stringify(selector)})?.getClientRects().length`])
    .trim()
    .split('\n')
    .pop()
    .replace(/"/g, '')
    .trim() === 'true';

// A target's reading: navigate, open the surface, let it settle, then measure it
// with readPage() exactly as a route is measured.
//
// One driver over both kinds. The navigate → click → settle → measure sequence
// is identical for a modal and for a tab panel; the only thing that differs is
// how the driver knows it got there, and that decision lives in reading.mjs
// where a test can reach it. A second near-identical `measurePanel` would be
// the divergent pattern the constitution's Principle I forbids, and it would
// drift the moment either of them gained a fix.
function measureTarget(target, viewport) {
  ab(['set', 'viewport', String(viewport.w), String(viewport.h)]);
  ab(['open', `${BASE}${target.route}`]);
  ab(['wait', '--load', 'networkidle']);
  ab(['wait', '1800']);

  for (const step of target.open) {
    if (!laidOut(step.click)) {
      if (step.optional) continue;
      throw new Error(`${step.click} is not on the page at ${viewport.w}px`);
    }
    // The calendar scrolls: its post sits at y=1428 in a 1180-tall frame, so a
    // click dispatched at the element's coordinates lands on nothing at all —
    // `elementFromPoint` at its centre returns null. Scrolling first is part of
    // reaching the control, not a workaround for the click.
    if (step.scrollIntoView) {
      ab(['eval', `document.querySelector(${JSON.stringify(step.click)}).scrollIntoView({block:'center'})`]);
      ab(['wait', '600']);
    }
    ab(['click', step.click]);
    ab(['wait', '400']);
  }
  ab(['wait', String(target.settle)]);

  const reading = readPage();
  // Whether the surface opened is decided by measuring for it, never inferred
  // from the clicks having been dispatched. A target that did not open is an
  // error and is recorded as one; it is never a reading whose width is zero,
  // which would read as "it fits" — the strongest false green this instrument
  // could emit (PR8).
  //
  // The facts are gathered here because only the driver can see a page; the
  // verdict is `arrival`'s because only reading.mjs can be tested. A panel's
  // selector is asked for only when a panel is what is being measured — a modal
  // has no selector to ask about.
  const { arrived, reason } = arrival(target, {
    modalOpen: !!reading.wrapper,
    selectorLaidOut: (target.kind || 'modal') === 'panel' ? laidOut(target.arrived) : null,
  });
  if (!arrived) throw new Error(reason);
  // Where the browser was standing. A target reading is taken on a route without
  // being a reading of it, and completeness() has to know which.
  return { ...reading, openedAt: target.route };
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

// The same check once everything has been measured, because a session can stop
// rendering the app partway through a run and every later reading is then of a
// shell with no content — filed under the route it was asked for, at the right
// url, invisible to every other check. Measured 2026-08-16 over four runs.
//
// Unlike the pre-flight this never exits: the readings are already taken, and
// throwing them away is completeness()'s decision to make, not this function's.
// A navigation that fails outright is the strongest possible answer to the
// question being asked, so it is recorded as one rather than propagated.
function postflight() {
  try {
    const reading = measure('/launches', { w: 1440, h: 900 });
    return preconditionVerdict({ ...reading.precondition, waived: WAIVED });
  } catch {
    return preconditionVerdict({
      pageRendered: false,
      customerControlPresent: false,
      waived: WAIVED,
    });
  }
}

const pad = (s, n) => String(s).padEnd(n);
const results = [];
const errors = [];

login();

// Held, not fired and forgotten: closing this reverts the browser to a mouse.
const pointerSocket = POINTER === 'coarse' ? await emulateCoarsePointer() : null;

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
  // Two failure modes, two column pairs: content cut off by an ancestor, and
  // content printed over other content. "cut" and "overlap" are their worsts.
  // "controls" is the deduped touch count and "touch <44" the instances behind
  // it, in that order because the first is the one to read.
  console.log(
    pad('route', 14) +
      pad('clipped', 9) +
      pad('cut', 8) +
      pad('collided', 10) +
      pad('overlap', 9) +
      pad('controls', 10) +
      pad('touch <44', 11) +
      'primary action'
  );
  for (const route of ROUTES) {
    if (gapped.has(`${route}@${viewportKey(viewport)}`)) continue;
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
        pad(r.collisionCount, 10) +
        pad(r.worstOverlapPx ? `${r.worstOverlapPx}px` : '—', 9) +
        pad(r.touch.distinctUnder44, 10) +
        pad(`${r.touch.under44}/${r.touch.total}`, 11) +
        (r.cta ? r.cta.verdict : '—')
    );
  }

  // The target axis, at the same width, straight after the routes. A target that
  // does not open lands in `errors` exactly as an unreachable route does — the
  // one thing it must never do is land in `results` carrying a zero.
  for (const target of TARGETS) {
    // Not every surface is reachable at every width, and a target says so. See
    // `compose-existing` in reading.mjs for the measurement behind its list.
    // One rule, shared with completeness(), so the two cannot disagree.
    if (!reachableWidths(target, [viewportKey(viewport)]).length) continue;
    const key = targetKey(target);
    // A surface the survey already declared unreachable here is not attempted:
    // it is a gap with a reason, and attempting it would fill `errors` with
    // something that was never going to work.
    if (gapped.has(key) || gapped.has(`${key}@${viewportKey(viewport)}`)) continue;
    let r;
    try {
      r = measureTarget(target, viewport);
    } catch (err) {
      const message = err.message.split('\n')[0];
      errors.push({ route: key, viewport: viewportKey(viewport), message });
      console.log(pad(key, 14) + `error: ${message}`);
      continue;
    }
    results.push({ route: key, viewport: viewportKey(viewport), ...r });
    console.log(
      pad(key, 14) +
        pad(r.clippedCount, 9) +
        pad(r.worstCutPx ? `${r.worstCutPx}px` : '—', 8) +
        pad(r.collisionCount, 10) +
        pad(r.worstOverlapPx ? `${r.worstOverlapPx}px` : '—', 9) +
        pad(r.touch.distinctUnder44, 10) +
        pad(`${r.touch.under44}/${r.touch.total}`, 11) +
        // The whole reason this axis exists, so it is printed rather than left
        // for the results file: how wide the surface is, against the frame it
        // opened in. A panel has no wrapper of its own — it is laid out inside
        // the page, not over it — so the column reads as the page's, which is
        // the honest answer rather than a zero that would read as "it fits".
        (r.wrapper
          ? `${r.wrapper.w}px in ${viewport.w}` +
            (r.wrapper.w > viewport.w ? `  OVER BY ${r.wrapper.w - viewport.w}` : '')
          : `in page at ${viewport.w}`)
    );
  }
  console.log('');
}

const postcondition = postflight();
if (postcondition.verdict !== 'qualified' && postcondition.verdict !== 'waived') {
  console.log(`closing check: ${postcondition.verdict} — ${postcondition.reason}`);
  console.log(
    'the app stopped rendering for this account during the run, so an unknown number of the\n' +
      'readings below hold a shell with no content. They are written out and reported, and the\n' +
      'run is not complete and cannot become a baseline.\n'
  );
} else {
  console.log(`closing check: ${postcondition.verdict}\n`);
}

const covered = results.filter((r) => r.cta?.verdict === 'COVERED');
const clipped = results.filter((r) => r.clippedCount > 0);
const collided = results.filter((r) => r.collisionCount > 0);
const touch = results.filter((r) => r.touch.distinctUnder44 > 0);
const escaped = results.filter((r) => r.escapedCount > 0);

console.log('--- summary ---');
console.log(`readings          ${results.length}`);
console.log(`primary action covered  ${covered.length}   ${covered.map((r) => `${r.route}@${r.viewport}`).join(', ') || '—'}`);
console.log(`routes with clipping    ${clipped.length}`);
// Listed rather than counted, for the reason the collision line is: this
// reading is new, and which container spills where is the finding itself.
console.log(
  `routes with content escaping its container  ${escaped.length}   ` +
    (escaped.map((r) => `${r.route}@${r.viewport} ${r.worstEscapePx}px`).join(', ') || '—')
);
// Listed, not just counted: this reading is new, so which route and width
// collides is the finding rather than a detail of it.
console.log(`routes with colliding text  ${collided.length}   ${collided.map((r) => `${r.route}@${r.viewport}`).join(', ') || '—'}`);
// Counted by distinct control, not by instance: one hour cell repeated 150
// times across the calendar is one control to fix, and counting the repeats
// made this figure follow the day rather than the build.
console.log(`routes under the touch floor  ${touch.length}   worst ${Math.max(0, ...results.map((r) => r.touch.distinctUnder44))} controls on one reading`);
const over = results.filter((r) => r.wrapper && r.wrapper.w > Number(r.viewport.split('x')[0]));
console.log(
  `modals wider than the screen  ${over.length}   ` +
    (over.map((r) => `${r.route}@${r.viewport} ${r.wrapper.w}px`).join(', ') || '—')
);
// Listed by route and width for the reason the collision line is: a modal
// cutting off its own content is the finding, and a figure that lives only in
// the stored reading is a figure nobody acts on. The document-wide count above
// cannot show this — it mixes the modal with the page it covers, which is how
// seven clipped controls inside compose's editor pane survived five phases of
// measurement while every number on the page read clean.
const clippingSelf = results.filter((r) => r.clippedInside > 0);
console.log(
  `modals clipping their own content  ${clippingSelf.length}   ` +
    (clippingSelf.map((r) => `${r.route}@${r.viewport} ${r.clippedInside}`).join(', ') || '—')
);

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
    // Modal ids only, because that is what this field has always meant. A
    // survey's targets — panels included — are carried by the declaration
    // below, which is where a survey is judged from.
    modals: (() => {
      const ids = TARGETS.filter((t) => (t.kind || 'modal') === 'modal').map((t) => t.id);
      return ids.length ? ids : null;
    })(),
    pointer: POINTER,
    precondition,
    postcondition,
    // What this run set out to cover, when that is not the canonical seven. The
    // targets are reduced to what completeness() judges against — an id and the
    // widths it owes — rather than carrying the click steps into the record.
    survey: SURVEY
      ? {
          routes: SURVEY.routes,
          targets: TARGETS.map(({ id, kind, widths }) => ({ id, kind: kind || 'modal', widths })),
          gaps: SURVEY_GAPS,
        }
      : null,
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
console.log(`modals      ${run.provenance.modals?.join(' ') || 'none opened'}`);
if (run.provenance.survey) {
  const { routes, targets, gaps } = run.provenance.survey;
  console.log(`survey      ${routes.length} routes declared, ${targets.length} targets, ${gaps.length} gaps`);
  console.log(`            never baseline-eligible — judged against its own declaration`);
  // Printed rather than left in the file, because a gap nobody reads is the
  // silence this whole axis exists to replace.
  for (const g of gaps) console.log(`  gap       ${g.surface} — ${g.reason || 'NO REASON GIVEN'}`);
}
console.log(`pointer     ${run.provenance.pointer}`);
console.log(`precondition ${run.provenance.precondition.verdict}`);
console.log(`closing check ${run.provenance.postcondition.verdict}`);

// Every run is judged, not just one being captured or compared. Until 020 this
// was only evaluated on the --capture-baseline and --compare paths, so an
// ordinary run could finish looking clean while `completeness()` would have
// refused it — and the first survey run hit exactly that: /billing/lifetime
// answered with a reading of /billing (lifetime.deal.tsx:74 does
// `router.replace('/billing')` for a paid account), twelve readings said
// `clipped 0` and nothing said the route had never been reached.
//
// A finding still never fails the run. This prints a verdict; it does not
// change the exit code, because whether a run is complete is a property of the
// record and not a reason to throw away what was measured.
const verdict = completeness(run);
console.log(`\ncompleteness  ${verdict.complete ? 'complete' : 'INCOMPLETE'}`);
if (!verdict.complete) console.log(`              ${verdict.reason}`);

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
    const { changes, advisory, introduced, unpaired } = difference(stored, run);
    // Above the changes, because it is the frame they are read in: a field the
    // baseline predates has no "from", so its absence from the diff below is
    // the tool having nothing to compare, not the app having nothing to move.
    if (introduced.length) {
      console.log(
        `\n${introduced.length} field(s) measured here that the baseline predates — reported as new, not as change:`
      );
      console.log(`  ${introduced.join(', ')}\n`);
    }
    if (unpaired.length) {
      console.log(
        `\n${unpaired.length} reading(s) taken here that the baseline never held — nothing to compare them against:`
      );
      console.log(`  ${unpaired.map((u) => `${u.route}@${u.viewport}`).join(', ')}\n`);
    }
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
