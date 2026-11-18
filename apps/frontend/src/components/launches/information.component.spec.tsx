import { act } from 'react';
import { createRoot } from 'react-dom/client';

let mockState: unknown;

jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (_key: string, fallback: string) => fallback,
}));
jest.mock('@gitroom/frontend/components/new-launch/store', () => ({
  useLaunchStore: (select: (state: unknown) => unknown) => select(mockState),
}));
jest.mock('@gitroom/react/helpers/safe.image', () => ({
  __esModule: true,
  default: () => null,
}));

import { InformationComponent } from '@gitroom/frontend/components/launches/information.component';

const channel = (id: string, identifier: string) => ({
  integration: { id, identifier, name: id, stripLinks: false },
});

// The pill is the first div of the component; its counter is the one text node
// shaped N/N before the panel's per-channel rows.
const renderPill = (text: string, chars: Record<string, number>) => {
  mockState = {
    current: 'global',
    selectedIntegrations: [channel('x1', 'x'), channel('o1', 'other')],
    internal: [],
    integrations: [],
  };
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(
      <InformationComponent
        chars={chars}
        totalChars={text.length}
        totalAllowedChars={2000}
        isPicture={false}
        text={text}
      />
    );
  });
  const pill = Array.from(host.querySelectorAll('div')).find((node) =>
    /^\d+\/\d+$/.test(node.textContent || '')
  );
  return { pill: pill?.textContent, unmount: () => act(() => root.unmount()) };
};

describe('InformationComponent pill', () => {
  it('shows the limit of the channel that is over', () => {
    const { pill, unmount } = renderPill('a'.repeat(411), {
      x1: 280,
      o1: 2000,
    });
    expect(pill).toBe('411/280');
    unmount();
  });

  it('falls back to the smallest limit when none is over', () => {
    const { pill, unmount } = renderPill('a'.repeat(100), {
      x1: 280,
      o1: 2000,
    });
    expect(pill).toBe('100/280');
    unmount();
  });
});
