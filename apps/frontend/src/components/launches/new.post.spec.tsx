import { act } from 'react';
import { createRoot } from 'react-dom/client';

// The sidebar's two buttons are built the same way and have to look the same
// way. Add Channel (add.provider.component.tsx:72) sets its label `text-start`
// and nothing else, so the icon+label pair is centred by the button's own
// `justify-center`. Create Post added `flex-1` to that label, which makes the
// label eat the spare width and strands the plus glyph at the leading edge.
//
// This asserts the absence of two classes, which is a weak shape for a test —
// so it also asserts the thing their absence is *for*: that the button still
// declares the centring the pair now depends on. Remove `justify-center` and
// this fails too, which is the point.
jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (_key: string, fallback?: string) => fallback ?? _key,
}));
jest.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch: () => async () => ({ json: async () => ({ date: '2026-09-20' }) }),
}));
jest.mock('@gitroom/frontend/components/layout/new-modal', () => ({
  useModals: () => ({ openModal: () => undefined, closeAll: () => undefined }),
}));
jest.mock('@gitroom/frontend/components/launches/calendar.context', () => ({
  useCalendar: () => ({
    integrations: [],
    reloadCalendarView: () => undefined,
    sets: [],
  }),
}));
jest.mock('@gitroom/frontend/components/launches/calendar', () => ({
  SetSelectionModal: () => null,
}));
jest.mock('@gitroom/frontend/components/new-launch/add.edit.modal', () => ({
  AddEditModal: () => null,
}));
jest.mock(
  '@gitroom/frontend/components/new-launch/modal.wrapper.component',
  () => ({ ModalWrapperComponent: () => null })
);

import { NewPost } from '@gitroom/frontend/components/launches/new.post';

const render = async () => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  await act(async () => {
    createRoot(host).render(<NewPost />);
  });
  return host;
};

describe('the Create Post button', () => {
  const button = (host: HTMLElement) => host.querySelector('button')!;
  const label = (host: HTMLElement) =>
    Array.from(host.querySelectorAll('div')).find((node) =>
      (node.textContent || '').includes('Create Post')
    )!;

  it('centres the icon and the label as one pair', async () => {
    const host = await render();

    expect(button(host).className).toContain('justify-center');
  });

  it('does not let the label absorb the spare width', async () => {
    const host = await render();

    expect(label(host).className).not.toContain('flex-1');
  });

  it('does not start the label at the leading edge', async () => {
    const host = await render();

    expect(label(host).className).not.toContain('text-start');
  });

  it('keeps the label hidden when the rail is collapsed', async () => {
    const host = await render();

    expect(label(host).className).toContain('group-[.sidebar]:hidden');
  });
});
