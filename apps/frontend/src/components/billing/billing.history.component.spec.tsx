// The invoice history, on the billing page and in the header's window: which invoices it lists,
// what a row says, the search and the CSV export.
import { act, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import {
  browserTimezone,
  setUserTimezone,
} from '@gitroom/frontend/components/layout/set.timezone';

jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (_key: string, fallback: string) => fallback,
}));

// The invoice list is the whole question here, and SWR is where the component reads it.
type Invoice = Record<string, unknown>;
let mockInvoices: Invoice[] | undefined = [];
jest.mock('swr', () => ({
  __esModule: true,
  default: () => ({ data: mockInvoices, isLoading: false, error: undefined }),
}));
jest.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch: () => jest.fn(),
}));

import { BillingHistory } from '@gitroom/frontend/components/billing/billing.history.component';

// noon UTC, so a date reads the same in every machine timezone
const at = (y: number, m: number, d: number) =>
  Date.UTC(y, m - 1, d, 12) / 1000;
let serial = 0;
const invoice = (
  amount: number,
  status = 'paid',
  extra: Invoice = {}
): Invoice => ({
  id: `in_${++serial}`,
  number: `INV-00${serial}`,
  tier: 'TEAM',
  period: 'MONTHLY',
  description: null,
  amount,
  currency: 'usd',
  created: at(2026, 10, 14),
  periodEnd: at(2026, 11, 14),
  status,
  downloadUrl: 'https://pay.stripe.com/invoice/x/pdf',
  viewUrl: 'https://invoice.stripe.com/i/x',
  ...extra,
});

const mounted: Array<{ unmount: () => void }> = [];
const render = async (element: ReactNode) => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);
  await act(async () => {
    root.render(element);
  });
  return host;
};
// Read by class, since happy-dom's selector engine does not match a bracketed class such as
// min-h-[64px].
const rows = (host: HTMLElement) =>
  Array.from(host.querySelectorAll('*')).filter((el) =>
    el.classList.contains('min-h-[64px]')
  );
const press = async (element: Element) => {
  await act(async () => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
};
const type = async (input: HTMLInputElement, value: string) => {
  const setValue = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value'
  )!.set!;
  await act(async () => {
    setValue.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

beforeEach(() => {
  serial = 0;
  mockInvoices = [];
});

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
});

describe('which invoices are listed', () => {
  it('lists every invoice above $0, the small ones included', async () => {
    mockInvoices = [invoice(4500), invoice(500), invoice(1)];
    const host = await render(<BillingHistory />);

    expect(rows(host).map((row) => row.textContent)).toEqual([
      expect.stringContaining('$45.00'),
      expect.stringContaining('$5.00'),
      expect.stringContaining('$0.01'),
    ]);
  });

  // A trial's start invoice is $0.
  it('leaves out $0 invoices and credits', async () => {
    mockInvoices = [invoice(4500), invoice(0), invoice(-1000, 'void')];
    const host = await render(<BillingHistory />);

    expect(rows(host)).toHaveLength(1);
    expect(host.textContent).not.toContain('$0.00');
  });

  it("says there are none yet in the header's window", async () => {
    mockInvoices = [invoice(0)];
    const host = await render(<BillingHistory modal={true} />);

    expect(host.textContent).toBe('No invoices yet');
  });

  it('stays off the billing page until there is an invoice', async () => {
    mockInvoices = [invoice(0)];
    const host = await render(<BillingHistory />);

    expect(host.textContent).toBe('');
  });

  it('shows ten at a time', async () => {
    mockInvoices = Array.from({ length: 12 }, () => invoice(4500));
    const host = await render(<BillingHistory />);

    expect(rows(host)).toHaveLength(10);
    await press(
      Array.from(host.querySelectorAll('button')).find(
        (b) => b.textContent === '+ Show more'
      )!
    );
    expect(rows(host)).toHaveLength(12);
  });
});

describe('each row', () => {
  it('shows the plan, the period and number, the amount, both dates and the status', async () => {
    mockInvoices = [invoice(4500)];
    const host = await render(<BillingHistory />);
    const text = rows(host)[0].textContent;

    expect(text).toContain('Team');
    expect(text).toContain('Monthly · INV-001');
    expect(text).toContain('$45.00');
    expect(text).toContain('14 Oct, 2026');
    expect(text).toContain('14 Nov, 2026');
    expect(text).toContain('Paid');
  });

  it.each([
    ['paid', 'text-success'],
    ['pending', 'text-warning'],
    ['failed', 'text-error'],
    ['void', 'text-textItemBlur'],
  ])("colours a %s invoice with Sharek's %s", async (status, token) => {
    mockInvoices = [invoice(4500, status)];
    const host = await render(<BillingHistory />);
    const dot = rows(host)[0].querySelector('[class~="bg-current"]')!;

    expect(dot.parentElement!.className).toContain(token);
  });
});

describe('search and export', () => {
  it('finds invoices by what the row shows', async () => {
    mockInvoices = [invoice(4500), invoice(2500, 'paid', { tier: 'STANDARD' })];
    const host = await render(<BillingHistory />);

    await type(host.querySelector('input')!, 'standard');

    expect(rows(host)).toHaveLength(1);
    expect(rows(host)[0].textContent).toContain('$25.00');
  });

  it('exports the rows it shows as a CSV that spreadsheets read as UTF-8', async () => {
    mockInvoices = [invoice(4500)];
    const created: Blob[] = [];
    const createObjectURL = jest.fn((blob: Blob) => {
      created.push(blob);
      return 'blob:billing-history';
    });
    Object.assign(URL, { createObjectURL, revokeObjectURL: jest.fn() });
    const click = jest
      .spyOn(window.HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    const host = await render(<BillingHistory />);

    await press(
      Array.from(host.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Export')
      )!
    );

    // Read as bytes: Blob.text() decodes as UTF-8 and drops the byte-order mark being checked.
    const bytes = new Uint8Array(await created[0].arrayBuffer());
    expect(Array.from(bytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
    const csv = new TextDecoder().decode(bytes.slice(3));
    expect(
      csv.startsWith(
        '"Plan","Amount","Purchase Date","End Date","Status","Invoice"'
      )
    ).toBe(true);
    expect(csv).toContain(
      '"Team - Monthly","$45.00","14 Oct, 2026","14 Nov, 2026","Paid"'
    );
    expect(click).toHaveBeenCalledTimes(1);
    click.mockRestore();
  });
});

describe("an invoice's date with a zone chosen", () => {
  const ZONE = 'Asia/Tokyo';
  // 16:00 UTC on 31 October is already 1 November in Tokyo, and still 31 October on every machine
  // the gate uses
  const LATE = Date.UTC(2026, 9, 31, 16) / 1000;

  beforeEach(() => {
    mockInvoices = [invoice(4500, 'paid', { created: LATE })];
  });
  afterEach(() => setUserTimezone(null));

  it('runs on a machine outside the chosen zone', () => {
    expect(browserTimezone()).not.toBe(ZONE);
  });

  it('is the day in the zone', async () => {
    setUserTimezone(ZONE);
    const host = await render(<BillingHistory />);

    expect(rows(host)[0].textContent).toContain('1 Nov, 2026');
  });

  it("is the day in the browser's zone on Automatic", async () => {
    const host = await render(<BillingHistory />);

    expect(rows(host)[0].textContent).toContain('31 Oct, 2026');
  });
});

describe("Sharek's style", () => {
  it('rings every control on keyboard focus', async () => {
    mockInvoices = Array.from({ length: 11 }, () => invoice(4500));
    const host = await render(<BillingHistory />);
    const controls = [
      host.querySelector('input')!,
      ...Array.from(host.querySelectorAll('button')),
      ...Array.from(host.querySelectorAll('a')),
    ];

    expect(controls.length).toBeGreaterThan(20);
    expect(
      controls
        .filter((c) => !c.className.includes('focus-visible:ring-2'))
        .map((c) => c.outerHTML.slice(0, 60))
    ).toEqual([]);
  });

  it('uses no purple, stock palette or opacity-on-variable class, and no upstream mobile: class', async () => {
    mockInvoices = [invoice(4500, 'paid'), invoice(4500, 'failed')];
    const host = await render(<BillingHistory />);
    const classes = Array.from(host.querySelectorAll('*')).map(
      (el) => el.getAttribute('class') || ''
    );

    expect(
      classes.filter((c) =>
        /#[0-9a-f]{6}|\b(bg|text|border)-(red|green|amber|purple)-\d{3}|(brand|success|warning|error)\/\d+|\bmobile:/i.test(
          c
        )
      )
    ).toEqual([]);
  });
});
