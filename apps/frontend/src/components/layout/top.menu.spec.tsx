import { act } from 'react';
import { createRoot } from 'react-dom/client';

// "Make UGC" opens upstream's AgentMedia offer, which Sharek hides behind
// `showUpstreamExtras`, the default-off build-time flag that also hides the
// Generate Posts trigger and the Affiliate link. The stage-2 merge renamed the
// entry's key (UGC → make_ugc) inside upstream's hunk, and the flag sits outside
// it, so this pins that the entry still carries it.
const variables = {
  isGeneral: true,
  billingEnabled: true,
  showUpstreamExtras: false,
  showThirdParty: false,
  supportEnabled: false,
};

jest.mock('@gitroom/react/helpers/variable.context', () => ({
  useVariables: () => variables,
}));
jest.mock('@gitroom/frontend/components/layout/user.context', () => ({
  useUser: () => ({ orgId: 'org-1', tier: 'STANDARD', role: 'ADMIN' }),
}));
jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (_key: string, fallback?: string) => fallback ?? _key,
}));
// The rail item is replaced by its label: what is under test is which entries
// the menu decides to render, not how an entry looks.
jest.mock('@gitroom/frontend/components/new-layout/menu-item', () => ({
  MenuItem: ({ label }: { label: string }) => <div data-menu-item>{label}</div>,
}));
jest.mock('@gitroom/frontend/components/layout/new-modal', () => ({
  useModals: () => ({ openModal: () => undefined }),
}));
jest.mock('@gitroom/frontend/components/layout/agent.media.modal', () => ({
  AgentMediaModal: () => null,
}));

import { TopMenu } from '@gitroom/frontend/components/layout/top.menu';

const mounted: Array<{ unmount: () => void }> = [];

const menu = async () => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);

  await act(async () => {
    root.render(<TopMenu />);
  });

  return Array.from(host.querySelectorAll('[data-menu-item]')).map(
    (item) => item.textContent
  );
};

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
});

describe('the Make UGC entry', () => {
  beforeEach(() => {
    variables.showUpstreamExtras = false;
  });

  it('is not rendered while upstream extras are hidden', async () => {
    const items = await menu();

    expect(items).not.toContain('Make UGC');
    // The menu did render: an unrelated empty rail would otherwise pass.
    expect(items).toContain('Settings');
  });

  it('comes back when the flag is set, so nothing is deleted', async () => {
    variables.showUpstreamExtras = true;

    expect(await menu()).toContain('Make UGC');
  });
});
