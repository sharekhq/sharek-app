import { act } from 'react';
import { createRoot } from 'react-dom/client';

// One factory renders the page/account picker for six providers
// (continue-provider/list.tsx), so this is asserted once against a throwaway
// config rather than six times against real ones.
//
// Selection was `bg-brand` — the same solid pomegranate as the Save button
// below it, over the page's own logo (2026-09-14 screenshot). It becomes the
// recessed grey with a brand border. The tick is asserted alongside it because
// a grey fill is a weaker signal than a crimson one, and selection must not
// rest on colour alone once it stops shouting.
jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (_key: string, fallback?: string) => fallback ?? _key,
}));
jest.mock(
  '@gitroom/frontend/components/launches/helpers/use.custom.provider.function',
  () => ({ useCustomProviderFunction: () => ({ get: async () => [] }) })
);
jest.mock('@gitroom/react/form/button', () => ({
  Button: ({ children }: any) => <button type="button">{children}</button>,
}));

import { withContinueProvider } from '@gitroom/frontend/components/new-launch/providers/continue-provider/with-continue-provider';

type Item = { id: string; name: string };

const Picker = withContinueProvider<Item, { id: string }>({
  endpoint: 'pages',
  swrKey: 'test-pages',
  titleKey: 'select_page',
  titleDefault: 'Select Page:',
  emptyStateMessages: [{ key: 'none', text: 'Nothing here.' }],
  getItemId: (item) => item.id,
  getSelectionValue: (item) => ({ id: item.id }),
  transformSaveData: (selection) => ({ page: selection.id }),
  isSelected: (item, selection) => selection?.id === item.id,
  renderItem: (item) => <div>{item.name}</div>,
});

const render = async () => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  await act(async () => {
    createRoot(host).render(
      <Picker
        onSave={async () => undefined}
        existingId={[]}
        initialData={[
          { id: 'a', name: 'Sharek' },
          { id: 'b', name: 'Touriesta' },
        ]}
      />
    );
  });
  return host;
};

const cards = (host: HTMLElement) =>
  Array.from(host.querySelectorAll('.grid > div')) as HTMLElement[];

const pick = async (card: HTMLElement) => {
  await act(async () => {
    card.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
};

describe('the page picker', () => {
  it('does not fill the picked card with the brand', async () => {
    const host = await render();
    await pick(cards(host)[0]);

    expect(cards(host)[0].className).not.toContain('bg-brand');
  });

  it('fills it with the recessed grey and borders it with the brand', async () => {
    const host = await render();
    await pick(cards(host)[0]);

    expect(cards(host)[0].className).toContain('bg-surface2');
    expect(cards(host)[0].className).toContain('border-brand');
  });

  it('does not preview the brand on hover either', async () => {
    const host = await render();

    expect(cards(host)[0].className).not.toContain('hover:bg-brand');
    expect(cards(host)[0].className).toContain('hover:bg-surface2');
  });

  it('marks the picked card with something that is not a colour', async () => {
    const host = await render();
    await pick(cards(host)[0]);

    expect(cards(host)[0].querySelector('[data-selected-mark]')).toBeTruthy();
    expect(cards(host)[1].querySelector('[data-selected-mark]')).toBeNull();
  });

  it('leaves the unpicked card on the line colour the product uses', async () => {
    const host = await render();

    expect(cards(host)[1].className).toContain('border-line');
  });
});
