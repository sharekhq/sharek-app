import { FC, act } from 'react';
import { createRoot } from 'react-dom/client';
import { FormProvider, useForm } from 'react-hook-form';

/** The slice of the media picker's props this spec reads. */
interface MediaRowProps {
  designNotAvailable?: boolean;
  aiNotAvailable?: boolean;
}

jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (key: string, fallback: string) => fallback,
}));
jest.mock('@gitroom/frontend/components/videos/video.context.wrapper', () => ({
  useVideo: () => ({ value: '' }),
}));

/** Stands in for the media picker: it shows what the row was handed. */
jest.mock('@gitroom/frontend/components/media/media.component', () => {
  const React = require('react');
  return {
    MultiMediaComponent: ({
      designNotAvailable,
      aiNotAvailable,
    }: MediaRowProps) =>
      React.createElement('div', {
        'data-testid': 'media-row',
        'data-design': String(!designNotAvailable),
        'data-ai-not-available': String(!!aiNotAvailable),
      }),
  };
});

import { videosList } from '@gitroom/frontend/components/videos/video.wrapper';
import '@gitroom/frontend/components/videos/providers/seedance.provider';

const Seedance = videosList.find((p) => p.identifier === 'seedance')!.Component;

const mounted: Array<{ unmount: () => void }> = [];

const render = async () => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);

  const Harness: FC = () => {
    const methods = useForm();
    return (
      <FormProvider {...methods}>
        <Seedance />
      </FormProvider>
    );
  };

  await act(async () => {
    root.render(<Harness />);
  });
};

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
});

// Its images are what the video draws on, as Veo 3's reference images are: an
// AI image made from its row goes to that row, not to the post, and the row
// offers neither Design nor an AI video (spec 061, review C1).
describe('seedance reference images', () => {
  it('takes its images through a reference row, with no Design or AI button', async () => {
    await render();
    const row = document.querySelector('[data-testid="media-row"]');

    expect(row?.getAttribute('data-design')).toBe('false');
    expect(row?.getAttribute('data-ai-not-available')).toBe('true');
  });

  it('the reference images row offers no AI tool', async () => {
    await render();
    const row = document.querySelector('[data-testid="media-row"]');

    expect(row?.getAttribute('data-ai-not-available')).toBe('true');
  });
});
