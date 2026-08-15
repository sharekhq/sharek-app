#!/usr/bin/env node
// Drives probe.js over every route × viewport and prints one report.
//
// The probe is tooling, not app code: it never ships in the image and never
// runs on the server. It drives a browser (yours, or a CI runner's) against a
// deployed URL.
//
//   PROBE_EMAIL=... PROBE_PASSWORD=... node tools/responsive-probe/run.mjs
//   PROBE_BASE_URL=https://dash.sharek.app node tools/responsive-probe/run.mjs
//
// Requires agent-browser: npm i -g agent-browser && agent-browser install
//
// Report-only: it always exits 0. Once phases 3 and 4 land and the numbers are
// worth defending, add a baseline and flip it to exit 1 on regression.

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const BASE = process.env.PROBE_BASE_URL || 'https://dash.sharek.app';
const EMAIL = process.env.PROBE_EMAIL;
const PASSWORD = process.env.PROBE_PASSWORD;
const SESSION = process.env.PROBE_SESSION || 'probe';

// PROBE_VIEWPORTS=390x844,1024x768 narrows a run while iterating.
const VIEWPORTS = (
  process.env.PROBE_VIEWPORTS
    ? process.env.PROBE_VIEWPORTS.split(',').map((v) => {
        const [w, h] = v.trim().split('x').map(Number);
        return { w, h, label: `${w}×${h}` };
      })
    : [
        { w: 390, h: 844, label: 'phone' },
        { w: 820, h: 1180, label: 'tablet portrait' },
        { w: 1024, h: 768, label: 'tablet landscape' },
        { w: 1440, h: 900, label: 'desktop' },
      ]
);

// The eight routes the 2026-08-15 audit measured. Nineteen of the app's
// twenty-seven routes are still unmeasured — /p/[id] (the public share page,
// the only majority-mobile surface) and the signup funnel matter most.
// PROBE_ROUTES=/launches,/media narrows a run while iterating.
const ROUTES = process.env.PROBE_ROUTES
  ? process.env.PROBE_ROUTES.split(',').map((r) => r.trim())
  : ['/launches', '/analytics', '/settings', '/media', '/plugs', '/billing', '/agents'];

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

const pad = (s, n) => String(s).padEnd(n);
const results = [];

login();

for (const viewport of VIEWPORTS) {
  console.log(`=== ${viewport.w}×${viewport.h} — ${viewport.label} ===`);
  console.log(pad('route', 14) + pad('clipped', 9) + pad('worst', 8) + pad('touch <44', 11) + 'primary action');
  for (const route of ROUTES) {
    let r;
    try {
      r = measure(route, viewport);
    } catch (err) {
      console.log(pad(route, 14) + `error: ${err.message.split('\n')[0]}`);
      continue;
    }
    results.push({ route, viewport: `${viewport.w}x${viewport.h}`, ...r });
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

writeFileSync(join(HERE, 'probe-results.json'), JSON.stringify(results, null, 2));
console.log('\nwrote tools/responsive-probe/probe-results.json');
