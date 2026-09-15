import { act } from 'react';
import { createRoot } from 'react-dom/client';

import { LogoTextComponent } from '@gitroom/frontend/components/ui/logo-text.component';

const mounted: Array<{ unmount: () => void }> = [];

const render = () => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);
  act(() => {
    root.render(<LogoTextComponent />);
  });
  return host;
};

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
});

// All four are in the document and CSS picks one: the language, because two of
// the three call sites are server components where reading the resolved language
// is a hydration mismatch, and the width, because a 137px wordmark does not fit a
// 390px screen.
const pick = (host: HTMLElement, ...names: string[]) =>
  names.map((name) => {
    const svg = host.querySelector(`svg.${name}`);
    if (!svg) throw new Error(`no lockup ${name}`);
    return svg;
  });

const WORDMARKS = ['logo-lockup-latin', 'logo-lockup-arabic'];
const BADGES = ['logo-badge-latin', 'logo-badge-arabic'];

const translateX = (g: Element) => {
  const match = /translate\(\s*(-?[\d.]+)/.exec(g.getAttribute('transform') || '');
  if (!match) throw new Error(`no translate on ${g.getAttribute('transform')}`);
  return parseFloat(match[1]);
};

const composition = (svg: Element) => {
  const groups = Array.from(svg.children).filter(
    (child) => child.tagName.toLowerCase() === 'g'
  );
  const badge = groups.find((g) => g.querySelector('rect'));
  const wordmark = groups.find((g) => g !== badge);
  if (!badge || !wordmark) throw new Error('lockup is missing a part');
  return { badge: translateX(badge), wordmark: translateX(wordmark) };
};

describe('the brand lockup', () => {
  it('carries both scripts, each named in its own', () => {
    expect(
      pick(render(), ...WORDMARKS).map((svg) => svg.getAttribute('aria-label'))
    ).toEqual(['Sharek', 'شارك']);
  });

  // DESIGN.md:400 — RTL mirrors the composition rather than reusing the Latin
  // geometry: the Arabic lockup leads with the badge on the right, wordmark
  // flowing left of it. Arabic text beside a badge on the left is never correct.
  it('mirrors the composition for Arabic instead of copying the Latin one', () => {
    const [latin, arabic] = pick(render(), ...WORDMARKS).map(composition);

    expect(latin.badge).toBeLessThan(latin.wordmark);
    expect(arabic.badge).toBeGreaterThan(arabic.wordmark);
  });

  // DESIGN.md:401 — the badge is the sanctioned standalone form for tight
  // functional spaces. It is script-neutral, but it is still the brand, so it
  // keeps a name in the language it is being read in rather than defaulting to
  // English the way the strings on this screen used to.
  it('keeps a name in each script when it collapses to the badge', () => {
    const badges = pick(render(), ...BADGES);

    expect(badges.map((svg) => svg.getAttribute('aria-label'))).toEqual([
      'Sharek',
      'شارك',
    ]);
    for (const badge of badges) {
      expect(badge.querySelector('path[transform]')).toBeNull();
    }
  });

  // The dark badge inverts to a #F7F1EF tile with a pomegranate S, which the
  // theme already expresses as --badge-tile / --badge-s. Painting any of them
  // with a literal colour is how the retired rose mark would come back.
  it('paints every form through the theme rather than a literal colour', () => {
    const host = render();

    for (const svg of pick(host, ...WORDMARKS, ...BADGES)) {
      expect(svg.querySelectorAll('[fill]:not([fill="none"])')).toHaveLength(0);
      expect(svg.innerHTML).toContain('var(--badge-tile)');
      expect(svg.innerHTML).toContain('var(--badge-s)');
    }
    for (const svg of pick(host, ...WORDMARKS)) {
      expect(svg.innerHTML).toContain('var(--ink)');
    }
  });
});
