import { act } from 'react';
import { createRoot } from 'react-dom/client';

// The top bar draws one separator after the streak and the switcher, hidden by
// `peer-empty:hidden` when neither shows (research R8). So the switcher renders
// nothing at all when it has nothing to switch to, and no separator of its own
// when it does. Its focusable box becomes the bar's 40px pill (R9); on the
// first-billing screen (`asOpenSelect`) the same box holds the open list, so it
// keeps today's classes there.
let mockOrganizations: {
  isLoading: boolean;
  data?: Array<{ id: string; name: string; users: { role: string }[] }>;
};

jest.mock('swr', () => ({
  __esModule: true,
  default: () => mockOrganizations,
}));
jest.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch: () => jest.fn(),
}));
jest.mock('@gitroom/frontend/components/layout/user.context', () => ({
  useUser: () => ({ orgId: 'org-1', tier: { current: 'PRO' } }),
}));
jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (_key: string, fallback: string) => fallback,
}));

import { OrganizationSelector } from '@gitroom/frontend/components/layout/organization.selector';

const CURRENT = { id: 'org-1', name: 'Concepta', users: [{ role: 'ADMIN' }] };
const OTHER = {
  id: 'org-2',
  name: 'Somewhere Else',
  users: [{ role: 'USER' }],
};

const mounted: Array<{ unmount: () => void }> = [];

const render = (asOpenSelect?: boolean) => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);
  act(() => {
    root.render(<OrganizationSelector asOpenSelect={asOpenSelect} />);
  });
  return host;
};

const box = (host: HTMLElement) =>
  host.querySelector('[tabindex="0"]') as HTMLElement;

const classesOf = (el: Element) =>
  (el.getAttribute('class') ?? '').split(/\s+/);

beforeEach(() => {
  mockOrganizations = { isLoading: false, data: [CURRENT, OTHER] };
});

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
});

describe('the switcher in the top bar', () => {
  it('renders one root and no separator of its own with two organizations', () => {
    const host = render();

    expect(host.childNodes).toHaveLength(1);
    expect(host.querySelector('.bg-blockSeparator')).toBeNull();
  });

  it('keeps its focusable box, its ring and its touch floors', () => {
    const host = render();

    expect(box(host)).toBeTruthy();
    expect(box(host).tabIndex).toBe(0);
    expect(classesOf(box(host))).toEqual(
      expect.arrayContaining([
        'focus-visible:ring-2',
        'focus-visible:ring-brand',
        'coarse:min-w-[44px]',
        'coarse:min-h-[44px]',
      ])
    );
  });

  // The canvas's `.tb-pill` centres its content; the box is a block today, so
  // the 24px icon would sit at the top of a 40px box without `flex items-center`.
  it('draws the box as a 40px pill with a grey square on hover', () => {
    const host = render();

    expect(classesOf(box(host))).toEqual(
      expect.arrayContaining([
        'h-[40px]',
        'px-[10px]',
        'rounded-[10px]',
        'hover:bg-boxFocused',
        'flex',
        'items-center',
      ])
    );
    expect(classesOf(box(host))).not.toContain('rounded-[6px]');
  });

  it('stays empty with one organization', () => {
    mockOrganizations = { isLoading: false, data: [CURRENT] };
    const host = render();

    expect(host.childNodes).toHaveLength(0);
  });

  it('stays empty while the organizations load', () => {
    mockOrganizations = { isLoading: true };
    const host = render();

    expect(host.childNodes).toHaveLength(0);
  });
});

describe('the switcher opened on the first-billing screen', () => {
  // The box holds the title and the list there, so a fixed height would clip it.
  it('keeps the box as it is, with no fixed height', () => {
    const host = render(true);

    expect(classesOf(box(host))).not.toContain('h-[40px]');
    expect(classesOf(box(host))).toContain('rounded-[6px]');
  });
});
