import { act, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';

// Upstream d5c95a70, in Sharek's media settings. A video's cover can be a
// picture from the media library: "From gallery" opens the library on JPEG and
// PNG pictures only, the picked one becomes the cover, and a frame picked
// earlier is dropped with its timestamp.
const opened: Array<{
  title: ReactNode;
  children: (close: () => void) => ReactNode;
}> = [];
type Picked = Array<{ id: string; path: string }>;
type BoxProps = {
  type: string;
  max?: number;
  closeModal: () => void;
  setMedia: (picked: Picked) => void;
};
const box: { props?: BoxProps } = {};
const requests: Array<{ url: string; body?: unknown }> = [];

jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (_key: string, fallback: string) => fallback,
}));
jest.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch: () => async (url: string, init?: { body?: string }) => {
    requests.push({ url, body: init?.body && JSON.parse(init.body) });
    return new Response(JSON.stringify({ id: 'm1', saved: true }));
  },
}));
jest.mock('@gitroom/frontend/components/layout/new-modal', () => ({
  useModals: () => ({
    openModal: (params: (typeof opened)[number]) => {
      opened.push(params);
    },
  }),
}));
jest.mock('@gitroom/frontend/components/media/media.component', () => ({
  MediaBox: (props: BoxProps) => {
    box.props = props;
    return null;
  },
  mediaLibrarySize: () => 'calc(100% - 80px)',
}));
jest.mock('@gitroom/frontend/components/ui/icons', () => ({
  DesignMediaIcon: () => <i data-icon="design" />,
  InsertMediaIcon: () => <i data-icon="insert" />,
}));
// Scenery: the alt-text field is not under test.
jest.mock('@gitroom/react/form/input', () => ({
  Input: () => <input />,
}));
jest.mock(
  '@gitroom/frontend/components/launches/helpers/top.title.component',
  () => ({ TopTitle: () => null })
);

import { MediaComponentInner } from '@gitroom/frontend/components/launches/helpers/media.settings.component';

const video = {
  id: 'm1',
  name: 'clip.mp4',
  path: 'https://media/clip.mp4',
  thumbnail: '',
  alt: '',
  thumbnailTimestamp: 1234,
};

const roots: Array<{ unmount: () => void }> = [];

const render = (media: typeof video = video) => {
  const onSelect = jest.fn();
  const onClose = jest.fn();
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  act(() => {
    root.render(
      <MediaComponentInner
        media={media}
        onSelect={onSelect}
        onClose={onClose}
      />
    );
  });
  return { container, onSelect, onClose };
};

const button = (container: HTMLElement, text: string) =>
  Array.from(container.querySelectorAll('button')).find(
    (node) => node.textContent === text
  ) as HTMLButtonElement | undefined;

const click = async (node?: Element) => {
  await act(async () => {
    node?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
};

// Renders the library the button opened, which is where MediaBox gets its props.
const openLibrary = async (container: HTMLElement) => {
  await click(button(container, 'From gallery'));
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  roots.push(root);
  act(() => {
    root.render(<>{opened[0].children(() => {})}</>);
  });
};

afterEach(() => {
  act(() => {
    roots.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
  opened.length = 0;
  requests.length = 0;
  box.props = undefined;
});

describe('the cover of a video', () => {
  it('offers a picture from the library, as a quiet button with a focus ring', () => {
    const { container } = render();
    const fromGallery = button(container, 'From gallery');

    expect(fromGallery).toBeDefined();
    expect(fromGallery!.className).toContain('bg-quiet');
    expect(fromGallery!.className).toContain('focus-visible:ring-2');
  });

  it('opens the media library on JPEG and PNG pictures', async () => {
    const { container } = render();

    await openLibrary(container);

    expect(opened).toHaveLength(1);
    expect(opened[0].title).toBe('Media Library');
    expect(box.props.type).toBe('image-static');
  });

  // A second pick gets the library's own one-image message
  // (media.component.limit.spec.tsx), instead of being dropped in silence.
  it('takes one picture from the library', async () => {
    const { container } = render();

    await openLibrary(container);

    expect(box.props.max).toBe(1);
  });

  it('saves the picked picture as the cover and drops the picked frame', async () => {
    const { container, onSelect, onClose } = render();
    await openLibrary(container);

    act(() => {
      box.props.setMedia([{ id: 'p1', path: 'https://media/cover.png' }]);
    });
    expect(container.querySelector('img')?.getAttribute('src')).toBe(
      'https://media/cover.png'
    );

    await click(button(container, 'Save changes'));

    expect(requests).toEqual([
      {
        url: '/media/information',
        body: {
          id: 'm1',
          alt: '',
          thumbnail: 'https://media/cover.png',
          thumbnailTimestamp: null,
        },
      },
    ]);
    expect(onSelect).toHaveBeenCalledWith({ id: 'm1', saved: true });
    expect(onClose).toHaveBeenCalled();
  });

  it('keeps the cover when the library closes with nothing picked', async () => {
    const { container } = render({
      ...video,
      thumbnail: 'https://media/old.png',
    });
    await openLibrary(container);

    act(() => {
      box.props.setMedia([]);
    });

    expect(container.querySelector('img')?.getAttribute('src')).toBe(
      'https://media/old.png'
    );
  });

  // Three actions do not fit one line on a phone.
  it('lets the cover actions wrap', () => {
    const { container } = render();

    expect(
      button(container, 'From gallery')!.parentElement!.className
    ).toContain('flex-wrap');
  });

  it('marks the frame actions with the frame icon and the library with its own', () => {
    const { container } = render();
    const icons = (text: string) =>
      button(container, text)!
        .querySelector('[data-icon]')!
        .getAttribute('data-icon');

    expect(icons('Create thumbnail')).toBe('design');
    expect(icons('From gallery')).toBe('insert');
  });

  it('offers no cover for a picture', () => {
    const { container } = render({
      ...video,
      name: 'a.png',
      path: 'https://media/a.png',
    });

    expect(button(container, 'From gallery')).toBeUndefined();
  });
});
