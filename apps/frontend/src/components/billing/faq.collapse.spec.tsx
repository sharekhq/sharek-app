import { act } from 'react';
import { createRoot } from 'react-dom/client';

jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (_key: string, fallback?: string) => fallback ?? _key,
}));
jest.mock('@gitroom/frontend/components/layout/user.context', () => ({
  useUser: () => ({ allowTrial: false, tier: { current: 'STANDARD' } }),
}));
// Only reachable from the FREE-tier question, which this user does not have;
// it pulls the whole settings stack in at module scope regardless.
jest.mock(
  '@gitroom/frontend/components/settings/delete-account.component',
  () => ({ __esModule: true, default: () => null })
);

import { FAQComponent } from '@gitroom/frontend/components/billing/faq.component';

const mounted: Array<{ unmount: () => void }> = [];

const render = () => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);
  act(() => {
    root.render(<FAQComponent />);
  });
  return host;
};

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
});

const heading = (host: HTMLElement) => {
  const el = host.querySelector('h3');
  if (!el) throw new Error('no FAQ heading');
  return el;
};

const list = (host: HTMLElement) => {
  const el = host.querySelector('[data-faq-list]');
  if (!el) throw new Error('no FAQ list');
  return el;
};

const click = (el: Element) => {
  act(() => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
};

describe('FAQ block collapse', () => {
  it('starts collapsed, so a phone is not handed six questions it did not ask for', () => {
    expect(list(render()).className).toContain('mobile:hidden');
  });

  it('opens and closes again from the heading', () => {
    const host = render();
    click(heading(host));
    expect(list(host).className).not.toContain('mobile:hidden');
    click(heading(host));
    expect(list(host).className).toContain('mobile:hidden');
  });

  // The whole contract: every class that can hide the list is mobile-scoped, so
  // no state this component can reach collapses it on a desktop viewport.
  it('never hides the list on desktop, in either state', () => {
    const host = render();
    const hiders = () =>
      list(host)
        .className.split(/\s+/)
        .filter((c) => c.endsWith('hidden') || c.endsWith('max-h-[0]'));

    expect(hiders().every((c) => c.startsWith('mobile:'))).toBe(true);
    click(heading(host));
    expect(hiders().every((c) => c.startsWith('mobile:'))).toBe(true);
  });

  // The affordance and the touch floor are the toggle's, not the heading's:
  // on desktop the heading is a heading and nothing suggests otherwise.
  it('offers the toggle only where it does something', () => {
    const toggle = render().querySelector('[data-faq-toggle]');
    if (!toggle) throw new Error('no FAQ toggle');
    expect(toggle.className).toContain('mobile:flex');
    expect(toggle.className).toContain('hidden');
    // Unstacked `coarse:` is only correct because the element itself is
    // mobile-only; on the heading it would floor a touchscreen desktop too.
    expect(toggle.className).toContain('coarse:min-h-[44px]');
    expect(toggle.className).toContain('coarse:min-w-[44px]');
  });

  // The one heading on this page that was not bold; the other two section
  // headings next to it are text-[24px] font-[700].
  it('matches the weight of the other section headings', () => {
    expect(heading(render()).className).toContain('font-[700]');
  });

  it('still renders every question, so they are searchable and indexable', () => {
    const host = render();
    expect(host.querySelectorAll('[data-faq-list] > div').length).toBe(4);
  });
});
