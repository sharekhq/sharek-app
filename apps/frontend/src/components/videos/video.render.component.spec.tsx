import { act } from 'react';
import { createRoot } from 'react-dom/client';

// Spec 061 (T073, D13, FR-021a): a video tool page mounts VideoWrapper for the
// page's whole life, and the composer Create a post opens from it must still
// close, so mounting a video tool leaves the composer's close button on.
//
// The real providers register themselves on import; a stub stands in for them.
jest.mock(
  '@gitroom/frontend/components/videos/providers/image-text-slides.provider',
  () => ({})
);
jest.mock(
  '@gitroom/frontend/components/videos/providers/veo3.provider',
  () => ({})
);

import { videoWrapper } from '@gitroom/frontend/components/videos/video.wrapper';
import {
  VideoWrapper,
  videoOwnsActions,
  videoOwnsStage,
} from '@gitroom/frontend/components/videos/video.render.component';
import { useLaunchStore } from '@gitroom/frontend/components/new-launch/store';

const StubTool = () => <div>stub tool</div>;
videoWrapper('stub', StubTool);
videoWrapper('stub-workflow', StubTool, { ownsActions: true, ownsStage: true });

const mount = () => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(<VideoWrapper identifier="stub" />);
  });
  return { container, root };
};

describe('VideoWrapper and the composer close button', () => {
  beforeEach(() => {
    useLaunchStore.getState().reset();
  });

  it('leaves the close button on while a video tool is mounted', () => {
    const { container } = mount();

    expect(container.textContent).toBe('stub tool');
    expect(useLaunchStore.getState().activateExitButton).toBe(true);
  });

  // Guard: unmounting the tool leaves it on too.
  it('leaves the close button on after the tool unmounts', () => {
    const { root } = mount();
    act(() => {
      root.unmount();
    });

    expect(useLaunchStore.getState().activateExitButton).toBe(true);
  });
});

// The tool asks the registry, never the identifier, whether a provider fills
// its action bar or its stage (spec 061, review R7).
describe("the registry's options", () => {
  it('says a provider owns the stage only when it registered so', () => {
    expect(videoOwnsStage('stub-workflow')).toBe(true);
    expect(videoOwnsStage('stub')).toBe(false);
    expect(videoOwnsStage('unknown')).toBe(false);
  });

  // Guard: the action bar's option reads the same way.
  it('says a provider owns its actions only when it registered so', () => {
    expect(videoOwnsActions('stub-workflow')).toBe(true);
    expect(videoOwnsActions('stub')).toBe(false);
  });
});
