import { act, useEffect } from 'react';
import { createRoot } from 'react-dom/client';

// The pixel's browser half: useTrack posts the event to the API, which sets the
// tracking cookies and answers the id fbq is given. With no pixel configured it
// must call nothing, since those calls are the only way the cookies get set.
const mockRequest = jest.fn();
let mockPixel: string | undefined;

// This config maps no @gitroom/helpers path, so the fetch hook is mocked as a
// virtual module.
jest.mock(
  '@gitroom/helpers/utils/custom.fetch',
  () => ({ useFetch: () => mockRequest }),
  { virtual: true }
);
jest.mock('@gitroom/react/helpers/variable.context', () => ({
  useVariables: () => ({ facebookPixel: mockPixel }),
}));
jest.mock('@gitroom/frontend/components/layout/user.context', () => ({
  useUser: () => ({ id: 'user-1' }),
}));

import { TrackEnum } from '@gitroom/nestjs-libraries/user/track.enum';
import { useTrack } from './use.track';

let track: ReturnType<typeof useTrack>;
const Harness = (): null => {
  const send = useTrack();
  useEffect(() => {
    track = send;
  }, [send]);
  return null;
};

const mounted: Array<{ unmount: () => void }> = [];

const mount = async () => {
  const root = createRoot(document.createElement('div'));
  mounted.push(root);
  await act(async () => {
    root.render(<Harness />);
  });
};

beforeEach(() => {
  mockRequest
    .mockReset()
    .mockResolvedValue({ json: async () => ({ track: 'event-1' }) });
});

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
  });
});

describe('useTrack', () => {
  // The deployment passes some settings through as empty strings, so blank
  // must count as unset.
  it.each([
    ['blank', ''],
    ['unset', undefined],
  ])('calls nothing while the pixel is %s', async (_name, pixel) => {
    mockPixel = pixel;
    await mount();

    await track(TrackEnum.StartTrial);

    expect(mockRequest).not.toHaveBeenCalled();
  });

  it('posts the event once while the pixel is set', async () => {
    mockPixel = '1234567890';
    await mount();

    await track(TrackEnum.StartTrial, { value: 25 });

    expect(mockRequest).toHaveBeenCalledTimes(1);
    expect(mockRequest).toHaveBeenCalledWith(
      '/user/t',
      expect.objectContaining({ method: 'POST' })
    );
  });
});
