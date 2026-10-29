import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';

// The customer selector names the customer it shows. The calendar hands it
// its own customer, which both of its selectors show (the inline one above
// 1025px and the one in the Select Channels sheet), so a pick in either one
// shows in the other. The composer hands it none, and the selector shows the
// customer picked in it.
jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (_key: string, fallback: string) => fallback,
}));
jest.mock('@gitroom/react/toaster/toaster', () => ({
  useToaster: () => ({ show: () => undefined }),
}));

import { SelectCustomer } from '@gitroom/frontend/components/launches/select.customer';
import { Integrations } from '@gitroom/frontend/components/launches/calendar.context';

const integrations = [
  { id: 'a', customer: { id: 'c1', name: 'Acme' } },
  { id: 'b', customer: { id: 'c2', name: 'Other' } },
] as unknown as Integrations[];

let root: Root;
let host: HTMLElement;

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = '';
});

const render = async (props: { customer?: string; list?: boolean }) => {
  await act(async () => {
    root.render(
      <SelectCustomer
        onChange={() => undefined}
        integrations={integrations}
        {...props}
      />
    );
  });
};

const click = async (node: Element) => {
  await act(async () => {
    node.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
};

const trigger = () =>
  host.querySelector<HTMLElement>('[data-tooltip-content="Select Customer"]')!;

describe('the customer selector', () => {
  it('shows the customer it is handed, as that customer changes', async () => {
    await render({ customer: 'c1' });
    expect(trigger().textContent).toContain('Acme');

    await render({ customer: 'c2' });

    expect(trigger().textContent).toContain('Other');
  });

  it('checks the customer it is handed in its list, as that customer changes', async () => {
    const checked = () =>
      Array.from(host.querySelectorAll('[role="radio"]'))
        .filter((radio) => radio.getAttribute('aria-checked') === 'true')
        .map((radio) => radio.textContent);
    await render({ customer: 'c1', list: true });
    expect(checked()).toEqual(['Acme']);

    await render({ customer: 'c2', list: true });

    expect(checked()).toEqual(['Other']);
  });

  it('shows the customer picked in it when it is handed none', async () => {
    await render({});
    expect(trigger().textContent).toContain('Select Customer');

    await click(trigger());
    await click(
      Array.from(host.querySelectorAll('div')).find(
        (row) => row.children.length === 1 && row.textContent === 'Other'
      )!
    );

    expect(trigger().textContent).toContain('Other');
  });
});
