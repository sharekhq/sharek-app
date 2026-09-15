import { act } from 'react';
import { createRoot } from 'react-dom/client';

// The list is module-private, so it is exercised through the rendered component.
// Only the account shape is a seam — everything the list branches on comes from
// the user, and both branches are what must survive the rewrite.
let mockUser: any;

jest.mock('@gitroom/frontend/components/layout/user.context', () => ({
  useUser: () => mockUser,
}));
jest.mock('@gitroom/react/helpers/variable.context', () => ({
  useVariables: () => ({ isGeneral: true }),
}));
jest.mock(
  '@gitroom/frontend/components/settings/delete-account.component',
  () => ({ __esModule: true, default: () => null })
);

import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { FAQComponent } from '@gitroom/frontend/components/billing/faq.component';

// No resources: t(key, default) hands back the default, so what is asserted is
// the copy the component itself ships. Whether those keys exist in every locale
// is paywall.locale.keys.spec's job, not this one's.
const i18n = createInstance();

beforeAll(async () => {
  await i18n.init({ lng: 'en', resources: { en: { translation: {} } } });
});

const mounted: Array<{ unmount: () => void }> = [];

const render = (user: any) => {
  mockUser = user;
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);
  act(() => {
    root.render(
      <I18nextProvider i18n={i18n}>
        <FAQComponent />
      </I18nextProvider>
    );
  });
  return host;
};

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
});

const entries = (host: HTMLElement) => Array.from(host.querySelectorAll('.bg-sixth'));
const titles = (host: HTMLElement) =>
  entries(host).map((entry) => entry.querySelector('.flex-1')?.textContent);

const TRIALLING_FREE = { allowTrial: true, tier: { current: 'FREE' } };

describe('the paywall FAQ', () => {
  it('answers the six questions that are actually being asked, in order', () => {
    expect(titles(render(TRIALLING_FREE))).toEqual([
      'Am I going to be charged by Sharek?',
      'Who is Samy?',
      'Can Sharek create images and video for me?',
      'Which channels can I publish to?',
      'Can my team and clients work together in Sharek?',
      'How can I delete my account?',
    ]);
  });

  // The answer this screen used to lead with was that the product is
  // open-source, with a link to the repository — on the page that asks for
  // money, to a reader deciding whether to pay for it.
  it('says nothing about the source code or the licence', () => {
    const text = render(TRIALLING_FREE).textContent ?? '';

    for (const term of ['open-source', 'open source', 'licence', 'license', 'github']) {
      expect(text.toLowerCase()).not.toContain(term);
    }
    expect(render(TRIALLING_FREE).querySelector('a[href*="github"]')).toBeNull();
  });

  // The tier cards sell "10 channels" as a unit, so the list has to keep saying
  // what one is even though the question asking it changed.
  it('still says what a channel is, because the plans are sold by the channel', () => {
    const channels = entries(render(TRIALLING_FREE))[3];

    expect(channels?.textContent).toMatch(/A channel is one connected account/);
  });

  it('drops the charge question for an account with no trial to offer', () => {
    const host = render({ allowTrial: false, tier: { current: 'FREE' } });

    expect(titles(host)).not.toContain('Am I going to be charged by Sharek?');
    expect(entries(host)).toHaveLength(5);
  });

  it('drops the delete question once the account is paying', () => {
    const host = render({ allowTrial: true, tier: { current: 'STANDARD' } });

    expect(titles(host)).not.toContain('How can I delete my account?');
    expect(entries(host)).toHaveLength(5);
  });

  // Six answers opened at once is a wall of text on a phone, which is the width
  // this block has never been shown at.
  it('opens collapsed, every entry', () => {
    for (const entry of entries(render(TRIALLING_FREE))) {
      expect(entry.querySelector('.max-h-\\[0\\]')).not.toBeNull();
    }
  });
});
