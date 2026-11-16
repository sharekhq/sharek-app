// The Teams tab in the dashboard's one look: a member's Remove is small red
// text with no fill, the tab's card has 12px corners and its heading is 20px
// semibold.
import { act, ReactElement } from 'react';
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
jest.mock('@gitroom/frontend/components/layout/user.context', () => ({
  useUser: () => ({ role: 'SUPERADMIN' }),
}));
jest.mock('@hookform/resolvers/class-validator', () => ({
  classValidatorResolver: () => undefined,
}));
jest.mock(
  '@gitroom/nestjs-libraries/dtos/settings/add.team.member.dto',
  () => ({ AddTeamMemberDto: class {} })
);
jest.mock('@gitroom/react/helpers/delete.dialog', () => ({
  deleteDialog: async () => false,
}));
// A super admin sees Remove on every member below their own level.
jest.mock('swr', () => ({
  __esModule: true,
  default: () => ({
    data: [
      { role: 'SUPERADMIN', user: { id: 'u-1', email: 'owner@example.com' } },
      { role: 'ADMIN', user: { id: 'u-2', email: 'sara.ali@example.com' } },
      { role: 'USER', user: { id: 'u-3', email: 'omar@example.com' } },
    ],
    mutate: jest.fn(),
  }),
}));

import {
  AddMember,
  TeamsComponent,
} from '@gitroom/frontend/components/settings/teams.component';

const mounted: Root[] = [];

const render = async (element: ReactElement = <TeamsComponent />) => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);
  await act(async () => {
    root.render(element);
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

const buttons = (host: HTMLElement, label: string) =>
  Array.from(host.querySelectorAll('button')).filter(
    (b) => b.textContent === label
  );

describe('the teams tab in the dashboard look', () => {
  it("draws a member's Remove as small red text with no fill, none of its own overrides", async () => {
    const host = await render();
    const removes = buttons(host, 'Remove');

    expect(removes).toHaveLength(2);
    for (const remove of removes) {
      const button = classes(remove);
      expect(button).toEqual(
        expect.arrayContaining([
          'bg-transparent',
          'text-error',
          'h-[32px]',
          'px-[12px]',
          'text-[13px]',
          'rounded-[8px]',
        ])
      );
      for (const override of [
        '!bg-surface2',
        '!h-[24px]',
        'rounded-[4px]',
        'text-[12px]',
        'border',
        'border-muted',
        'bg-quiet',
      ]) {
        expect(button).not.toContain(override);
      }
    }
  });

  it("sets Remove's icon 16px, 6px from its label", async () => {
    const host = await render();

    for (const remove of buttons(host, 'Remove')) {
      const icon = remove.querySelector('svg')!;
      expect(icon.getAttribute('width')).toBe('16');
      expect(icon.getAttribute('height')).toBe('16');
      const line = classes(icon.parentElement!.parentElement!);
      expect(line).toContain('gap-[6px]');
      expect(line).not.toContain('gap-[4px]');
    }
  });

  it('keeps Add another member the medium primary button', async () => {
    const host = await render();
    const [add] = buttons(host, 'Add another member');

    expect(classes(add)).toEqual(
      expect.arrayContaining(['bg-brand', 'h-[40px]'])
    );
  });

  // Its content sits 20px in, 16px at 1025px and below (spec 060 FR-022).
  it('rounds the card 12px and sets the heading 20px semibold', async () => {
    const host = await render();
    const card = host.querySelector('.bg-sixth')!;

    expect(classes(card)).toEqual(
      expect.arrayContaining([
        'bg-sixth',
        'border-fifth',
        'rounded-[12px]',
        'p-[20px]',
        'mobile:p-[16px]',
      ])
    );
    expect(classes(card)).not.toContain('rounded-[4px]');
    expect(classes(card)).not.toContain('p-[24px]');
    expect(classes(host.querySelector('h3')!)).toEqual(
      expect.arrayContaining(['text-[20px]', 'font-[600]'])
    );
  });

  // A window's action row is one height: its buttons are large (spec 060
  // FR-026).
  it("draws the invite window's Send Invitation Link as a large button", async () => {
    const host = await render(<AddMember />);
    const [send] = buttons(host, 'Send Invitation Link');

    expect(classes(send)).toEqual(
      expect.arrayContaining(['h-[44px]', 'px-[20px]'])
    );
  });
});
