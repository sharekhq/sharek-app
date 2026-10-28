import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';

jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (_key: string, fallback: string) => fallback,
}));
jest.mock('@gitroom/react/toaster/toaster', () => ({
  useToaster: () => ({ show: jest.fn() }),
}));
jest.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch: () => jest.fn(),
}));
jest.mock('@gitroom/frontend/components/layout/new-modal', () => ({
  useModals: () => ({ openModal: jest.fn(), closeAll: jest.fn() }),
}));
jest.mock('swr', () => ({
  __esModule: true,
  default: () => ({
    data: [
      { id: 'sig-1', content: 'Thanks for reading, the team', autoAdd: true },
      { id: 'sig-2', content: 'شكرًا لمتابعتكم دائمًا', autoAdd: false },
    ],
    mutate: jest.fn(),
  }),
}));
// The add/edit form's rich-text field; the real one pulls the whole assistant
// runtime in, and this page imports it at load.
jest.mock('@copilotkit/react-textarea', () => ({
  CopilotTextarea: ({ placeholder }: { placeholder?: string }) => (
    <textarea readOnly placeholder={placeholder} />
  ),
}));

import { SignaturesComponent } from '@gitroom/frontend/components/settings/signatures.component';

const mounted: Root[] = [];

const render = async (appendSignature?: (value: string) => void) => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);
  await act(async () => {
    root.render(<SignaturesComponent appendSignature={appendSignature} />);
  });
  return host;
};

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
});

const classes = (node: Element) => node.className.split(/\s+/);

// One wrapper per signature: `contents` in the table, a card up to 1025px.
const rows = (host: HTMLElement) =>
  Array.from(host.querySelectorAll('div')).filter((node) =>
    classes(node).includes('contents')
  );

const buttonCell = (row: Element, label: string) =>
  Array.from(row.querySelectorAll('button')).find(
    (b) => b.textContent === label
  )!;

// A list opened from the composer offers Use Signature; the settings tab does not.
describe.each([
  ['in Settings', undefined],
  ['from the composer', jest.fn()],
])('the signatures list %s, up to 1025px', (_where, appendSignature) => {
  it('hides the header row and draws each signature as a wrapping card', async () => {
    const host = await render(appendSignature);
    const grid = rows(host)[0].parentElement!;
    const headers = Array.from(grid.children).filter(
      (child) => !classes(child).includes('contents')
    );

    expect(headers).toHaveLength(appendSignature ? 5 : 4);
    for (const header of headers) {
      expect(classes(header)).toContain('mobile:hidden');
    }
    expect(classes(grid)).toEqual(
      expect.arrayContaining(['mobile:grid-cols-1', 'mobile:gap-y-[12px]'])
    );
    expect(rows(host)).toHaveLength(2);
    for (const row of rows(host)) {
      expect(classes(row)).toEqual(
        expect.arrayContaining([
          'mobile:flex',
          'mobile:flex-wrap',
          'mobile:border-fifth',
          'mobile:rounded-[8px]',
        ])
      );
    }
  });

  it('puts the text and "Auto Add? Yes/No" on lines of their own, the label inline and muted', async () => {
    const host = await render(appendSignature);

    for (const row of rows(host)) {
      const [text, autoAdd] = Array.from(row.children);
      expect(classes(text)).toContain('mobile:basis-full');
      expect(classes(autoAdd)).toContain('mobile:basis-full');
      const line = autoAdd.firstElementChild!;
      expect(classes(line)).toEqual(
        expect.arrayContaining(['mobile:text-[12px]', 'mobile:text-muted'])
      );
      const label = line.querySelector('span')!;
      expect(classes(label)).toEqual(['hidden', 'mobile:inline']);
      expect(label.textContent).toBe('Auto Add? ');
    }
    expect(
      rows(host).map((row) =>
        row.children[1].textContent!.replace('Auto Add? ', '')
      )
    ).toEqual(['Yes', 'No']);
  });

  it('lays Edit and Delete side by side and stretches every button across its line', async () => {
    const host = await render(appendSignature);

    for (const row of rows(host)) {
      for (const label of ['Edit', 'Delete']) {
        const cell = buttonCell(row, label).parentElement!.parentElement!;
        expect(classes(cell)).toContain('mobile:flex-1');
        expect(classes(buttonCell(row, label).parentElement!)).toContain(
          'mobile:w-full'
        );
      }
      if (appendSignature) {
        const use = buttonCell(row, 'Use Signature');
        expect(classes(use.parentElement!)).toContain('mobile:basis-full');
      }
    }
    for (const button of Array.from(host.querySelectorAll('button'))) {
      expect(classes(button)).toContain('mobile:w-full');
    }
  });

  it('keeps nothing at the 768px phone screen', async () => {
    const host = await render(appendSignature);

    expect(host.innerHTML).not.toMatch(/\bphone:/);
  });
});
