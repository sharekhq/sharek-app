import { act } from 'react';
import { createRoot } from 'react-dom/client';

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
// The page asks for its channels and its sets; the tests set the sets.
let swrData: unknown;
jest.mock('swr', () => ({
  __esModule: true,
  default: (key: string) => ({
    data: key === 'sets' ? swrData : [],
    isLoading: false,
    mutate: jest.fn(),
  }),
}));
// The compose window a set opens in; the real one pulls the whole editor in,
// and this page imports it at load.
jest.mock('@gitroom/frontend/components/new-launch/add.edit.modal', () => ({
  AddEditModal: () => null,
}));

import { Sets } from '@gitroom/frontend/components/sets/sets';
import {
  buttonClassName,
  ButtonSize,
  ButtonVariant,
} from '@gitroom/react/form/button';

const mounted: Array<{ unmount: () => void }> = [];

const render = async () => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);

  await act(async () => {
    root.render(<Sets />);
  });

  return host;
};

const classes = (element: Element) => element.className.split(' ');
const look = (variant: ButtonVariant, size: ButtonSize) =>
  buttonClassName({ variant, size }).split(' ');
const button = (host: HTMLElement, text: string) =>
  Array.from(host.querySelectorAll('button')).find(
    (element) => element.textContent === text
  )!;

beforeEach(() => {
  swrData = [{ id: 'set-1', name: 'Launch week', content: '{}' }];
});

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
});

describe("a set row's buttons", () => {
  it('draw Edit as a small secondary button and Delete as a small red-text one, neither filled red', async () => {
    const host = await render();

    // An action on every row is never primary, and a row's Delete is red
    // text with no fill (FR-027, FR-028).
    const edit = button(host, 'Edit');
    const remove = button(host, 'Delete');
    expect(classes(edit)).toEqual(
      expect.arrayContaining(look('secondary', 'small'))
    );
    expect(classes(remove)).toEqual(
      expect.arrayContaining(look('dangerGhost', 'small'))
    );
    expect(classes(edit)).not.toContain('bg-error');
    expect(classes(remove)).not.toContain('bg-error');
  });

  it('keep Add a set the primary action under the list', async () => {
    const host = await render();

    expect(classes(button(host, 'Add a set'))).toEqual(
      expect.arrayContaining(look('primary', 'medium'))
    );
  });
});

describe("Sets' panel", () => {
  it('holds its rows in a card with 12px corners and a 1px line, under a 20px semibold heading', async () => {
    const host = await render();

    // FR-035: a Settings card has the dashboard's 12px corners, a panel's
    // heading is 20px semibold.
    const card = host.querySelector('.bg-sixth')!;
    expect(classes(card)).toEqual(
      expect.arrayContaining(['rounded-[12px]', 'border', 'border-fifth'])
    );
    expect(classes(card)).not.toContain('rounded-[4px]');
    expect(classes(host.querySelector('h3')!)).toEqual(
      expect.arrayContaining(['text-[20px]', 'font-[600]'])
    );
  });
});
