// The options the Media library's viewer opens with. Every one is load-bearing
// (see mediaPreviewModal), and Samy's chat opens the same viewer, so they live
// beside it rather than in two callers. The element is read, not rendered: what
// the viewer does with its items is the viewer's own business.
jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (_key: string, fallback?: string) => fallback ?? _key,
}));
jest.mock('@gitroom/react/helpers/use.media.directory', () => ({
  useMediaDirectory: () => ({ set: (path: string) => path }),
}));
jest.mock('@gitroom/frontend/components/layout/new-modal', () => ({
  ModalHeaderSlot: () => null,
  ModalHeaderSlotTarget: () => null,
}));

import { ModalHeaderSlotTarget } from '@gitroom/frontend/components/layout/new-modal';
import {
  MediaPreview,
  mediaPreviewModal,
} from '@gitroom/frontend/components/media/media.preview';

const items = [
  { id: 'a', name: 'a.png', path: 'https://media/a.png' },
  { id: 'b', name: 'b.mp4', path: 'https://media/b.mp4' },
];

describe('mediaPreviewModal', () => {
  it('keeps the card out of the centring branch, at the viewport less its margins', () => {
    expect(mediaPreviewModal(items, 1)).toMatchObject({
      top: 20,
      size: 'min(1120px, calc(100vw - 40px))',
      height: 'calc(100vh - 40px)',
      cardClassName: 'phone:!p-[16px]',
    });
  });

  it('gives the header to the viewer, through the slot in the title', () => {
    expect(mediaPreviewModal(items, 1).title.type).toBe(ModalHeaderSlotTarget);
  });

  it('opens the viewer on those items at that position', () => {
    const { children } = mediaPreviewModal(items, 1);

    expect(children.type).toBe(MediaPreview);
    expect(children.props).toEqual({ items, index: 1 });
  });
});
