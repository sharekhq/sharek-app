import { act, ReactElement, ReactNode } from 'react';
import { createRoot, Root } from 'react-dom/client';

jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  // The fallback with {{var}} filled in, because that is what t() renders.
  useT:
    () => (key: string, fallback: string, params?: Record<string, unknown>) =>
      fallback.replace(/{{(\w+)}}/g, (whole, name) =>
        params && name in params ? String(params[name]) : whole
      ),
}));
// The locked bar's Upgrade is a next/link.
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import {
  CreditsPill,
  WorkspaceFrame,
} from '@gitroom/frontend/components/studio/workspace.frame';
import { buttonClassName } from '@gitroom/react/form/button';

// The one frame every tool draws in every host (contracts/workspace-parts.md
// §1, FR-002, FR-015, FR-016a): on its Studio page the settings sit in a
// 360px panel on the start side with the action bar pinned under them and the
// stage fills the rest; in a window, and on a phone, the stage comes first,
// then the settings, then the bar, and after a result the settings fold into
// one row. The bar holds the credits left and the tool's actions, or, on a
// plan without AI, the cost and Upgrade (FR-003, FR-013, tasks D5).

const mounted: Root[] = [];

const mount = async (element: ReactElement) => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);

  await act(async () => {
    root.render(element);
  });
  return host;
};

const click = async (element: Element | null | undefined) => {
  await act(async () => {
    element?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
};

const tokens = (element: Element | null | undefined) =>
  (element?.getAttribute('class') || '').split(' ');
const byTestId = (host: HTMLElement, id: string) =>
  host.querySelector(`[data-testid="${id}"]`);
const follows = (
  later: Node | null | undefined,
  earlier: Node | null | undefined
) =>
  !!later &&
  !!earlier &&
  !!(earlier.compareDocumentPosition(later) & Node.DOCUMENT_POSITION_FOLLOWING);
const settingsRow = (host: HTMLElement) =>
  Array.from(host.querySelectorAll('button')).find((button) =>
    button.textContent?.startsWith('Settings')
  );
// The box the action bar draws: the one holding the tool's actions.
const bar = (host: HTMLElement) =>
  byTestId(host, 'action')?.closest('.border-t') ||
  host.querySelector('a[href="/billing"]')?.closest('.border-t');

const frame = (props: Partial<Parameters<typeof WorkspaceFrame>[0]> = {}) => (
  <WorkspaceFrame
    layout="page"
    head={<p data-testid="head">Veo 3</p>}
    settings={<input data-testid="field" />}
    stage={<p data-testid="stage">Sample</p>}
    actions={
      <button type="button" data-testid="action">
        Generate
      </button>
    }
    {...props}
  />
);

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
});

describe('the page layout', () => {
  it('puts the settings panel first, on the start side, with the head, the scroller and the bar', async () => {
    const host = await mount(frame());
    const root = host.firstElementChild!;
    const panel = root.children[0];

    expect(tokens(panel)).toEqual(
      expect.arrayContaining([
        'w-[360px]',
        'shrink-0',
        'border-e',
        'border-line',
      ])
    );
    const scroller = byTestId(host, 'field')!.closest('.overflow-y-auto');
    expect(tokens(scroller)).toEqual(
      expect.arrayContaining(['flex-1', 'min-h-0', 'overflow-y-auto'])
    );
    expect(tokens(bar(host))).toEqual(
      expect.arrayContaining(['border-t', 'border-line', 'bg-surface'])
    );
    // head, then the scroller, then the bar, all inside the panel
    expect(panel.contains(byTestId(host, 'head'))).toBe(true);
    expect(panel.contains(scroller)).toBe(true);
    expect(panel.contains(bar(host)!)).toBe(true);
    expect(follows(scroller, byTestId(host, 'head'))).toBe(true);
    expect(follows(bar(host), scroller)).toBe(true);
  });

  it('gives the rest to the stage, a size container stage parts measure', async () => {
    const host = await mount(frame());
    const stage = host.firstElementChild!.children[1];

    expect(stage.contains(byTestId(host, 'stage'))).toBe(true);
    expect(tokens(stage)).toEqual(
      expect.arrayContaining(['flex-1', 'min-w-0', '[container-type:size]'])
    );
  });

  // Above 1025px the page scrolls inside its card and the frame fills it, so
  // only the settings scroll; at 1025px and below the window scrolls.
  it('fills the page card above 1025px and takes its natural height below', async () => {
    const host = await mount(frame());

    expect(tokens(host.firstElementChild)).toEqual(
      expect.arrayContaining(['h-full', 'min-h-0', 'mobile:h-auto'])
    );
  });

  it('stacks on a phone: the stage first at its fixed height, the bar pinned at the bottom', async () => {
    const host = await mount(frame());
    const root = host.firstElementChild!;
    const [panel, stage] = Array.from(root.children);

    expect(tokens(root)).toContain('phone:flex-col');
    expect(tokens(stage)).toEqual(
      expect.arrayContaining([
        'phone:order-first',
        'phone:flex-none',
        'phone:h-[clamp(240px,45dvh,440px)]',
      ])
    );
    expect(tokens(panel)).toEqual(
      expect.arrayContaining(['phone:w-full', 'phone:border-e-0'])
    );
    // The window scrolls from 1025px down, the side-by-side page included,
    // so the bar sticks from there, a phone with it (FR-003).
    expect(tokens(bar(host))).toEqual(
      expect.arrayContaining(['mobile:sticky', 'mobile:bottom-0'])
    );
    expect(tokens(bar(host))).not.toContain('phone:sticky');
  });

  // The page keeps its settings open beside the result; only the phone's
  // stacked page folds them.
  it('folds the settings only on a phone', async () => {
    const host = await mount(
      frame({ folded: true, settingsSummary: 'Prompt, brand, shape and style' })
    );
    const scroller = byTestId(host, 'field')!.closest('.overflow-y-auto');

    expect(tokens(settingsRow(host))).toEqual(
      expect.arrayContaining(['hidden', 'phone:flex'])
    );
    expect(tokens(scroller)).toContain('phone:hidden');
    expect(tokens(scroller)).not.toContain('hidden');

    await click(settingsRow(host));

    expect(settingsRow(host)!.getAttribute('aria-expanded')).toBe('true');
    expect(tokens(scroller)).not.toContain('phone:hidden');
  });
});

describe('the stacked layout', () => {
  it('draws the stage, then the settings, then the bar', async () => {
    const host = await mount(frame({ layout: 'stacked' }));
    const stage = byTestId(host, 'stage')!.parentElement;
    const field = byTestId(host, 'field');

    expect(tokens(stage)).toEqual(
      expect.arrayContaining([
        'h-[clamp(240px,45dvh,440px)]',
        '[container-type:size]',
      ])
    );
    expect(follows(field, stage)).toBe(true);
    expect(follows(bar(host), field)).toBe(true);
    expect(tokens(bar(host))).toEqual(
      expect.arrayContaining([
        'sticky',
        'bottom-0',
        'border-t',
        'border-line',
        'bg-surface',
      ])
    );
  });

  it('shows the settings and no Settings row before a result', async () => {
    const host = await mount(frame({ layout: 'stacked' }));

    expect(settingsRow(host)).toBeUndefined();
    expect(tokens(byTestId(host, 'field')!.parentElement)).not.toContain(
      'hidden'
    );
  });

  it('folds the settings into one Settings row with their summary after a result', async () => {
    const host = await mount(
      frame({
        layout: 'stacked',
        folded: true,
        settingsSummary: 'Prompt, brand, shape and style',
      })
    );
    const row = settingsRow(host)!;
    const settings = byTestId(host, 'field')!.parentElement;

    expect(
      Array.from(host.querySelectorAll('button')).filter((button) =>
        button.textContent?.startsWith('Settings')
      )
    ).toHaveLength(1);
    expect(row.textContent).toContain('Prompt, brand, shape and style');
    expect(row.getAttribute('aria-expanded')).toBe('false');
    expect(tokens(row)).not.toContain('hidden');
    expect(tokens(settings)).toContain('hidden');

    await click(row);

    expect(row.getAttribute('aria-expanded')).toBe('true');
    expect(tokens(settings)).not.toContain('hidden');
  });

  it('rings the Settings row when focused and gives it 44px under a finger', async () => {
    const host = await mount(frame({ layout: 'stacked', folded: true }));

    expect(tokens(settingsRow(host))).toEqual(
      expect.arrayContaining([
        'focus-visible:ring-2',
        'focus-visible:ring-brand',
        'coarse:min-h-[44px]',
      ])
    );
  });
});

describe('the action bar', () => {
  it('shows the credits left beside the actions', async () => {
    const host = await mount(frame({ credits: <CreditsPill count={7} /> }));

    expect(bar(host)!.textContent).toContain('7 credits left');
    expect(bar(host)!.contains(byTestId(host, 'action'))).toBe(true);
  });

  // FR-013: a plan without AI opens the page with its settings and stage, and
  // the main button reads Upgrade and leads to Billing.
  it('shows the cost and Upgrade in place of the actions when locked', async () => {
    const host = await mount(
      frame({ locked: true, cost: 'Uses 1 image credit' })
    );
    const upgrade = host.querySelector('a[href="/billing"]');

    expect(upgrade?.textContent).toBe('Upgrade');
    expect(bar(host)!.textContent).toContain('Uses 1 image credit');
    expect(byTestId(host, 'action')).toBeNull();
    expect(byTestId(host, 'field')).not.toBeNull();
    expect(byTestId(host, 'stage')).not.toBeNull();
  });

  it('draws Upgrade as the large main button, ringed when focused', async () => {
    const host = await mount(
      frame({ locked: true, cost: 'Uses 1 image credit' })
    );

    expect(tokens(host.querySelector('a[href="/billing"]'))).toEqual(
      expect.arrayContaining([
        ...buttonClassName({ size: 'large' }).split(' '),
        'focus-visible:ring-2',
        'focus-visible:ring-brand',
      ])
    );
  });
});

describe('the settings scroller', () => {
  // Moved from ai.video.spec (tasks D15a). The ring is a 2px box-shadow
  // outside the field and overflow clips at the padding edge, so a scroller
  // padded on one side only cut the ring off on the others. The matching
  // negative margin keeps the fields exactly where an unpadded scroller had
  // them.
  it('leaves room for the focus ring on every side', async () => {
    const page = await mount(frame());
    const stacked = await mount(frame({ layout: 'stacked' }));

    [page, stacked].forEach((host) => {
      const classes = tokens(
        byTestId(host, 'field')!.closest('.overflow-y-auto')
      );
      expect(classes).toContain('p-[4px]');
      expect(classes).toContain('-m-[4px]');
    });
  });
});

describe('CreditsPill', () => {
  it('draws the credits left as the windows did', async () => {
    const host = await mount(<CreditsPill count={3} />);
    const pill = host.firstElementChild;

    expect(pill?.textContent).toBe('3 credits left');
    expect(tokens(pill)).toEqual(
      expect.arrayContaining([
        'bg-ai',
        'text-aiAccent',
        'rounded-full',
        'px-[12px]',
        'py-[4px]',
        'text-[12px]',
        'font-[600]',
      ])
    );
  });
});
