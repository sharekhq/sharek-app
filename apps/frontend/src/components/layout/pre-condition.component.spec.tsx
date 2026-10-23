// The dialog a trial user meets when the channel they connect was connected to another Sharek
// account before: what it says, and where its button goes.
import { act } from 'react';
import { createRoot } from 'react-dom/client';

// The English default with its {{placeholders}} filled, as the reader sees it, and the key each
// sentence was asked for by.
const mockKeys = new Map<string, string>();
jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT:
    () => (key: string, fallback: string, options?: Record<string, string>) => {
      const text = (fallback || '').replace(
        /{{(\w+)}}/g,
        (_m, name) => options?.[name] ?? ''
      );
      mockKeys.set(text, key);
      return text;
    },
}));
jest.mock('@gitroom/frontend/components/layout/new-modal', () => ({
  useModals: () => ({ closeCurrent: jest.fn(), openModal: jest.fn() }),
}));
jest.mock(
  '@gitroom/frontend/components/new-launch/modal.wrapper.component',
  () => ({
    ModalWrapperComponent: () => null,
  })
);
jest.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
}));

import { PreConditionComponentModal } from '@gitroom/frontend/components/layout/pre-condition.component';

const mounted: Array<{ unmount: () => void }> = [];
const render = async () => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);
  await act(async () => {
    root.render(<PreConditionComponentModal />);
  });
  return host;
};
const keyOf = (text: string | null) => mockKeys.get(text ?? '');
const location = window.location;

beforeEach(() => {
  mockKeys.clear();
});

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: location,
  });
});

describe('a channel already connected to another account, during a trial', () => {
  it("names Sharek and says ending the trial takes the plan's first payment today", async () => {
    const host = await render();
    const sentence = host.querySelector('.whitespace-pre-line')!.textContent;

    expect(sentence).toContain(
      'This social channel was previously connected to another Sharek account.'
    );
    expect(sentence).toContain(
      "your plan's first payment is charged today instead of at the end of the trial, and nothing extra is added."
    );
    expect(sentence).toContain(
      '** Please note this payment is final and not refundable.'
    );
    expect(host.textContent).not.toMatch(/postiz|fast-track/i);
    expect(keyOf(sentence)).toBe('channel_connected_to_another_account');
  });

  // The button reads as the billing page's own Finish trial confirmation.
  it('offers to end the trial and pay now', async () => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { href: '' },
    });
    const host = await render();
    const end = Array.from(host.querySelectorAll('button')).find(
      (b) => b.textContent === 'End trial and pay now'
    )!;

    expect(keyOf(end.textContent)).toBe('finish_trial_charge_me_now');
    await act(async () => {
      end.click();
    });

    expect(window.location.href).toBe('/billing?finishTrial=true');
  });
});
