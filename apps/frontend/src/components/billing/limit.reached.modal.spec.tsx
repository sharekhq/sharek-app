import { act } from 'react';
import { createRoot } from 'react-dom/client';

// Returns the English default with its placeholders filled, so a spec can read
// the sentence the customer would read rather than a key.
jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT:
    () =>
    (key: string, fallback: string, options?: Record<string, any>) =>
      Object.entries(options || {}).reduce(
        (text, [name, value]) =>
          text.replace(new RegExp(`{{${name}}}`, 'g'), String(value)),
        fallback
      ),
}));

import {
  pricing,
  PricingInnerInterface,
} from '@gitroom/nestjs-libraries/database/prisma/subscriptions/pricing';
import { UserContext } from '@gitroom/frontend/components/layout/user.context';
import {
  LIMIT_SECTIONS,
  limitCopyFor,
  limitSectionFor,
} from '@gitroom/frontend/components/billing/limit.sections';
import { LimitReachedModal } from '@gitroom/frontend/components/billing/limit.reached.modal';

const mounted: Array<{ unmount: () => void }> = [];

// `null` stands for a surface with no user context at all — an explicit
// `undefined` would silently take the default below.
const render = async (
  props: { section?: string; message?: string; resetsAt?: string },
  user: { tier?: PricingInnerInterface; role?: string } | null = {
    tier: pricing.STANDARD,
    role: 'ADMIN',
  }
) => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);

  await act(async () => {
    root.render(
      <UserContext.Provider value={(user ?? undefined) as any}>
        <LimitReachedModal {...props} />
      </UserContext.Provider>
    );
  });

  return host;
};

const buttons = (host: HTMLElement) =>
  Array.from(host.querySelectorAll('button')).map(
    (button) => button.textContent?.trim() || ''
  );

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
});

// Driven by iterating the table, so a section that renders only because it was
// special-cased in the component fails here (FR-017).
describe.each(Object.keys(LIMIT_SECTIONS))('the %s refusal', (section) => {
  const entry = LIMIT_SECTIONS[section];

  it('says what was reached and why', async () => {
    const host = await render({ section });
    const copy = limitCopyFor(entry, pricing.STANDARD);

    // Plan names stay Latin and title-cased, as on the marketing site (VR-005).
    expect(host.textContent).toContain(
      copy.title.defaultValue.replace('{{plan}}', 'Standard')
    );
    expect(host.textContent!.length).toBeGreaterThan(
      copy.title.defaultValue.length
    );
  });

  it('states the reset only for a pool that resets', async () => {
    const host = await render({
      section,
      resetsAt: '2026-09-12T08:31:04.000Z',
    });

    const saysReset = /reset/i.test(host.textContent || '');
    expect(saysReset).toBe(entry.shape === 'allowance');
  });

  it('offers no upgrade for a permission', async () => {
    const host = await render({ section });

    if (entry.shape === 'permission') {
      expect(buttons(host)).not.toContain('Upgrade plan');
    } else {
      expect(host.textContent).toBeTruthy();
    }
  });
});

describe('the reset sentence', () => {
  it('names the date the 402 carried', async () => {
    const host = await render({
      section: 'videos_per_month',
      resetsAt: '2026-09-12T08:31:04.000Z',
    });

    // Day and month order follows the viewer's locale, so this asserts the
    // date is named — not one locale's ordering of it.
    expect(host.textContent).toContain('Your credits reset on');
    expect(host.textContent).toContain('September');
    expect(host.textContent).toContain('12');
  });

  // The posts refusal comes from the permissions guard, which knows no date —
  // so the copy has to degrade on its own rather than invent one.
  it('goes undated when the 402 carried no date', async () => {
    const host = await render({ section: 'posts_per_month' });

    expect(host.textContent).toContain(
      'Your monthly limit resets each billing month.'
    );
  });

  it('says credits for a credit pool and not for posts', async () => {
    const credits = await render({ section: 'images_per_month' });
    const posts = await render({ section: 'posts_per_month' });

    expect(credits.textContent).toContain('credits reset');
    expect(posts.textContent).not.toContain('credits reset');
    // "allowance" is a second word for the same thing; the card must not use it.
    expect(credits.textContent).not.toMatch(/allowance/i);
  });
});

describe('an unknown section', () => {
  it("speaks with the 402's own message when it has one", async () => {
    const host = await render({
      section: 'community_features',
      message: 'You have reached the maximum number of somethings.',
    });

    expect(host.textContent).toContain(
      'You have reached the maximum number of somethings.'
    );
  });

  it('falls back to the generic line when it has none', async () => {
    const host = await render({ section: 'community_features' });

    expect(host.textContent).toContain(
      limitSectionFor('community_features').body.defaultValue
    );
  });

  it('offers no upgrade either way', async () => {
    const host = await render({ section: 'community_features' });

    expect(buttons(host)).not.toContain('Upgrade plan');
  });
});

describe('a viewer who can buy', () => {
  it('is shown what the next tier gives, and a way to it', async () => {
    const host = await render({ section: 'videos_per_month' });

    expect(host.textContent).toContain('AI videos per month');
    expect(buttons(host)).toContain('Upgrade plan');
    expect(buttons(host)).toContain('Not now');
  });
});

describe('a viewer who cannot buy', () => {
  const asUser = { tier: pricing.STANDARD, role: 'USER' };

  it('is not shown a price list they cannot act on', async () => {
    const host = await render({ section: 'videos_per_month' }, asUser);

    expect(host.textContent).not.toContain('AI videos per month');
    expect(buttons(host)).not.toContain('Upgrade plan');
  });

  it('is told who to ask, and gets one way out', async () => {
    const host = await render({ section: 'videos_per_month' }, asUser);

    expect(host.textContent).toContain(
      'Ask an account owner or admin to upgrade your plan.'
    );
    expect(buttons(host).filter(Boolean)).toEqual(['Got it']);
  });

  // A member who cannot buy still needs to know exactly what to ask for.
  it('reads the same refusal an admin reads', async () => {
    const admin = await render({
      section: 'videos_per_month',
      resetsAt: '2026-09-12T08:31:04.000Z',
    });
    const user = await render(
      { section: 'videos_per_month', resetsAt: '2026-09-12T08:31:04.000Z' },
      asUser
    );

    const headlineAndBody = (host: HTMLElement) =>
      Array.from(host.querySelectorAll('h2, p'))
        .slice(0, 3)
        .map((node) => node.textContent);

    expect(headlineAndBody(user)).toEqual(headlineAndBody(admin));
  });

  it('treats a surface with no user context the same way', async () => {
    const host = await render({ section: 'videos_per_month' }, null);

    expect(buttons(host)).not.toContain('Upgrade plan');
    expect(buttons(host).filter(Boolean)).toEqual(['Got it']);
  });
});

// global.scss:19-21 sets `body * { outline: none !important }` and the shared
// Button declares no focus styles, so a dropped ring leaves the card invisible
// to the keyboard (VR-006).
describe('keyboard visibility', () => {
  it.each([
    ['an admin', { tier: pricing.STANDARD, role: 'ADMIN' }],
    ['a member', { tier: pricing.STANDARD, role: 'USER' }],
  ])('rings every interactive element for %s', async (_who, user) => {
    const host = await render({ section: 'videos_per_month' }, user);
    const interactive = Array.from(host.querySelectorAll('button'));

    expect(interactive.length).toBeGreaterThan(0);
    interactive.forEach((element) => {
      expect(element.className).toContain('focus-visible:ring-2');
      expect(element.className).toContain('focus-visible:ring-brand');
    });
  });
});
