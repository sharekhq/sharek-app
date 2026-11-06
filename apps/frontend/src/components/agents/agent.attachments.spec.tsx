import { act, ReactNode } from 'react';
import { createRoot, Root } from 'react-dom/client';

// What's attached to a Samy message before it's sent: the upload queue, the tiles
// in the box, the two buttons and the drop overlay. The uploader is Uppy, so what
// matters is the callbacks and the `error` listener handed to it. This double
// keeps the first render's callbacks, as the real hook does, and a failing upload
// reaches the queue the way the real hook delivers it: `onEnd` first, then
// `onUploadSuccess` with whatever saved.
type Row = { id: string; path: string };
type UploaderOptions = {
  allowedFileTypes: string;
  onStart: () => void;
  onEnd: () => void;
  onUploadSuccess: (rows: Row[]) => void;
};

const uploader: { options?: UploaderOptions } = {};
const listeners: Record<string, Array<() => void>> = {};
const uppyState = { currentUploads: {} as Record<string, unknown> };
const uppy = {
  addFile: jest.fn(),
  on: (event: string, listener: () => void) => {
    (listeners[event] = listeners[event] || []).push(listener);
  },
  off: (event: string, listener: () => void) => {
    listeners[event] = (listeners[event] || []).filter((l) => l !== listener);
  },
  getState: () => uppyState,
};
const show = jest.fn();
const openModal = jest.fn();
const aiImageProps: Array<Record<string, any>> = [];
const ai = { loading: false };
const translator = { prefix: '' };
const user: { tier: { ai?: boolean } } = { tier: { ai: true } };

jest.mock('@gitroom/frontend/components/media/new.uploader', () => ({
  useUppyUploader: (options: UploaderOptions) => {
    if (!uploader.options) {
      uploader.options = options;
    }
    return uppy;
  },
}));
jest.mock('@gitroom/frontend/components/media/media.component', () => ({
  MAX_UPLOAD_SIZE: 1000,
  mediaLibrarySize: () => 'library-size',
  MediaBox: () => null,
}));
// Renders the trigger it's handed, as the real one does, so the button is there.
jest.mock('@gitroom/frontend/components/launches/ai.image', () => ({
  AiImage: (props: {
    renderTrigger: (open: () => void, loading: boolean) => ReactNode;
  }) => {
    aiImageProps.push(props);
    return <>{props.renderTrigger(() => undefined, ai.loading)}</>;
  },
}));
jest.mock('@gitroom/frontend/components/layout/loading', () => ({
  __esModule: true,
  default: () => <span data-spinner="" />,
}));
jest.mock('@gitroom/react/helpers/video.frame', () => ({
  VideoFrame: ({ url }: { url: string }) => <video data-frame={url} />,
}));
jest.mock('@gitroom/frontend/components/layout/user.context', () => ({
  useUser: () => user,
}));
jest.mock('@gitroom/frontend/components/layout/new-modal', () => ({
  useModals: () => ({ openModal }),
}));
jest.mock('@gitroom/react/toaster/toaster', () => ({
  useToaster: () => ({ show }),
}));
jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  // The fallback with {{var}} filled in, because that is what t() renders.
  // `prefix` is read when the hook runs, as a real translator is bound to the
  // language of the render it came from.
  useT: () => {
    const { prefix } = translator;
    return (key: string, fallback?: string, params?: Record<string, unknown>) =>
      prefix +
      (fallback ?? key).replace(/{{(\w+)}}/g, (whole, name) =>
        params && name in params ? String(params[name]) : whole
      );
  },
}));

import {
  AttachmentsDropOverlay,
  AttachmentsProvider,
  AttachmentsTray,
  AttachmentTools,
  useAttachments,
} from '@gitroom/frontend/components/agents/agent.attachments';
import { MediaBox } from '@gitroom/frontend/components/media/media.component';

let attachments: ReturnType<typeof useAttachments>;
const Probe = () => {
  attachments = useAttachments();
  return null;
};

const mounted: Root[] = [];

const tree = () => (
  <AttachmentsProvider>
    <Probe />
    <div data-tray="">
      <AttachmentsTray />
    </div>
    <div data-tools="">
      <AttachmentTools value="what was typed" />
    </div>
  </AttachmentsProvider>
);

const render = async () => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);
  await act(async () => {
    root.render(tree());
  });
  return { host, root };
};

const file = (name: string, type = 'image/png', size = 1) =>
  new File([new Uint8Array(size)], name, { type, lastModified: 1 });
const row = (id: string, ext = 'png'): Row => ({
  id,
  path: `https://media/${id}.${ext}`,
});

const removeButtons = (host: HTMLElement) =>
  Array.from(
    host.querySelectorAll<HTMLButtonElement>(
      'button[aria-label^="Remove attachment"]'
    )
  );
const tiles = (host: HTMLElement) =>
  removeButtons(host).map((button) => button.parentElement as HTMLElement);
const pictures = (host: HTMLElement) =>
  Array.from(host.querySelectorAll('[data-tray] img')).map((img) =>
    img.getAttribute('src')
  );
const classes = (node: Element) => node.className.split(/\s+/);

const click = async (node: Element) => {
  await act(async () => {
    node.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
};

const add = async (...files: File[]) => {
  await act(async () => attachments.addFiles(files));
};

// What the real hook does when an upload finishes: `onEnd`, then the rows.
const finishUpload = async (...rows: Row[]) => {
  await act(async () => {
    uploader.options!.onEnd();
    uploader.options!.onUploadSuccess(rows);
  });
};

const fireError = async () => {
  await act(async () => {
    (listeners.error || []).forEach((listener) => listener());
  });
};

beforeEach(() => {
  (URL as any).createObjectURL = jest.fn((f: File) => `blob:${f.name}`);
  (URL as any).revokeObjectURL = jest.fn();
  uppyState.currentUploads = {};
  user.tier = { ai: true };
  ai.loading = false;
  translator.prefix = '';
});

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
  uploader.options = undefined;
  aiImageProps.length = 0;
  Object.keys(listeners).forEach((event) => delete listeners[event]);
  jest.clearAllMocks();
});

describe('the upload queue', () => {
  it('uses the uploader the rest of the app uses, for images and mp4s', async () => {
    await render();

    expect(uploader.options?.allowedFileTypes).toBe('image/*,video/mp4');
  });

  it('shows every file at once, dimmed with a spinner, and hands Uppy one at a time', async () => {
    const { host } = await render();
    const [a, b, c] = [file('a.png'), file('b.png'), file('c.png')];

    await add(a, b, c);

    expect(pictures(host)).toEqual(['blob:a.png', 'blob:b.png', 'blob:c.png']);
    for (const tile of tiles(host)) {
      expect(classes(tile.querySelector('img')!)).toContain('opacity-[0.45]');
      expect(tile.querySelector('[data-spinner]')).not.toBeNull();
    }
    expect(uppy.addFile).toHaveBeenCalledTimes(1);
    expect(uppy.addFile).toHaveBeenCalledWith(a);
  });

  // `complete` calls onEnd before onUploadSuccess on every success, so a queue
  // that moved on onEnd would hand Uppy the next file too early, and the row
  // that follows would be read as that file's.
  it('moves on the rows, not on onEnd', async () => {
    const { host } = await render();
    const [a, b] = [file('a.png'), file('b.png')];
    await add(a, b);

    await act(async () => uploader.options!.onEnd());

    expect(uppy.addFile).toHaveBeenCalledTimes(1);
    expect(pictures(host)[0]).toBe('blob:a.png');

    await act(async () => uploader.options!.onUploadSuccess([row('a')]));

    expect(pictures(host)).toEqual(['https://media/a.png', 'blob:b.png']);
    expect(classes(tiles(host)[0].querySelector('img')!)).not.toContain(
      'opacity-[0.45]'
    );
    expect(tiles(host)[0].querySelector('[data-spinner]')).toBeNull();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:a.png');
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(uppy.addFile).toHaveBeenCalledTimes(2);
    expect(uppy.addFile).toHaveBeenLastCalledWith(b);
    expect(attachments.attached).toEqual([row('a')]);
  });

  // The hook's preprocessor has already said why, and removed the file.
  it('lets a refused file go with no message on top of the hook’s, and carries on', async () => {
    const { host } = await render();
    const [a, b] = [file('a.txt', 'text/plain'), file('b.png')];
    await add(a, b);

    await fireError();

    expect(pictures(host)).toEqual(['blob:b.png']);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:a.txt');
    expect(uppy.addFile).toHaveBeenLastCalledWith(b);
    expect(show).not.toHaveBeenCalled();
  });

  // Nothing else shows this one: no `complete` follows, so the hook says nothing,
  // and this box mounts no Uppy UI for `uppy.info`.
  it('says why when an upload that started fails with no complete', async () => {
    const { host } = await render();
    const [a, b] = [file('a.png'), file('b.png')];
    await add(a, b);
    await act(async () => uploader.options!.onStart());

    await fireError();

    expect(pictures(host)).toEqual(['blob:b.png']);
    expect(uppy.addFile).toHaveBeenLastCalledWith(b);
    expect(show).toHaveBeenCalledTimes(1);
    expect(show).toHaveBeenCalledWith(
      'Some files failed to upload, please try again',
      'warning'
    );
  });

  // The hook keeps the first render's callbacks, and the error listener outlives
  // renders too. Neither may keep that render's translator.
  it('says why in the language of the latest render', async () => {
    const { root } = await render();
    await add(file('a.png'));
    await act(async () => uploader.options!.onStart());

    translator.prefix = 'ar:';
    await act(async () => {
      root.render(tree());
    });
    await fireError();

    expect(show).toHaveBeenCalledWith(
      'ar:Some files failed to upload, please try again',
      'warning'
    );
  });

  // The next file starts fresh, so its own refusal doesn't read as a failed upload.
  it('forgets that the last upload started', async () => {
    await render();
    await add(file('a.png'), file('b.txt', 'text/plain'));
    await act(async () => uploader.options!.onStart());
    await finishUpload(row('a'));

    await fireError();

    expect(show).not.toHaveBeenCalled();
  });

  // One file failing leaves the batch running, and `complete` reports it.
  it('waits for complete when an upload is still running', async () => {
    const { host } = await render();
    await add(file('a.png'), file('b.png'));
    uppyState.currentUploads = { one: {} };

    await fireError();

    expect(pictures(host)).toEqual(['blob:a.png', 'blob:b.png']);
    expect(uppy.addFile).toHaveBeenCalledTimes(1);
  });

  // The hook has already shown `some_files_failed_to_upload` for this path.
  it('lets a failed upload go when nothing saved, and carries on', async () => {
    const { host } = await render();
    const [a, b] = [file('a.png'), file('b.png')];
    await add(a, b);

    await finishUpload();

    expect(pictures(host)).toEqual(['blob:b.png']);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:a.png');
    expect(uppy.addFile).toHaveBeenLastCalledWith(b);
    expect(show).not.toHaveBeenCalled();
  });

  it('survives Uppy refusing a file outright, and says why', async () => {
    const { host } = await render();
    const [a, b] = [file('a.png'), file('b.png')];
    uppy.addFile.mockImplementationOnce(() => {
      throw new Error('This file exceeds the maximum allowed size');
    });

    await add(a, b);

    expect(pictures(host)).toEqual(['blob:b.png']);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:a.png');
    expect(uppy.addFile).toHaveBeenCalledTimes(2);
    expect(uppy.addFile).toHaveBeenLastCalledWith(b);
    expect(show).toHaveBeenCalledWith(
      'Upload size limit exceeded. Maximum 1 GB per upload session.',
      'warning'
    );
  });

  it('ignores the same ending reported twice', async () => {
    const { host } = await render();
    await add(file('a.png'));

    await finishUpload(row('a'));
    await finishUpload();
    await fireError();

    expect(pictures(host)).toEqual(['https://media/a.png']);
    expect(show).not.toHaveBeenCalled();
  });

  it('never uploads a queued tile that was removed', async () => {
    const { host } = await render();
    const [a, b, c] = [file('a.png'), file('b.png'), file('c.png')];
    await add(a, b, c);

    await click(removeButtons(host)[1]);

    expect(pictures(host)).toEqual(['blob:a.png', 'blob:c.png']);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:b.png');

    await finishUpload(row('a'));

    expect(uppy.addFile).toHaveBeenCalledTimes(2);
    expect(uppy.addFile).toHaveBeenLastCalledWith(c);
  });

  // The upload can't be told apart from the next one's, so the next file waits
  // for this one's result, and the file stays in the Media library.
  it('ignores the result of an uploading tile that was removed, and it stays gone', async () => {
    const { host } = await render();
    const [a, b] = [file('a.png'), file('b.png')];
    await add(a, b);

    await click(removeButtons(host)[0]);

    expect(pictures(host)).toEqual(['blob:b.png']);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:a.png');
    expect(uppy.addFile).toHaveBeenCalledTimes(1);

    await finishUpload(row('a'));

    expect(pictures(host)).toEqual(['blob:b.png']);
    expect(attachments.attached).toEqual([]);
    expect(uppy.addFile).toHaveBeenCalledTimes(2);
    expect(uppy.addFile).toHaveBeenLastCalledWith(b);
  });

  it('counts a removed upload as nothing to wait for', async () => {
    const { host } = await render();
    await add(file('a.png'));

    await click(removeButtons(host)[0]);

    expect(attachments.uploading).toBe(false);
  });

  it('attaches one Media row once, whichever way it comes in', async () => {
    const { host } = await render();
    await add(file('a.png'));
    await finishUpload(row('a'));

    await act(async () => attachments.addMedia(row('a')));
    await act(async () => attachments.addMedia([row('a'), row('b'), row('b')]));

    expect(attachments.attached).toEqual([row('a'), row('b')]);
    expect(tiles(host)).toHaveLength(2);
  });

  it('drops the tile of an upload whose row is already attached', async () => {
    const { host } = await render();
    await act(async () => attachments.addMedia(row('a')));
    await add(file('a.png'));

    await finishUpload(row('a'));

    expect(attachments.attached).toEqual([row('a')]);
    expect(tiles(host)).toHaveLength(1);
  });

  // Each upload makes a new row, so the row's id can't catch this.
  it('ignores a file already on this message, by name, size and date', async () => {
    const { host } = await render();
    await add(file('a.png'));
    await add(file('a.png'));

    expect(tiles(host)).toHaveLength(1);

    await finishUpload(row('a'));
    await add(file('a.png'));

    expect(tiles(host)).toHaveLength(1);
    expect(uppy.addFile).toHaveBeenCalledTimes(1);

    await click(removeButtons(host)[0]);
    await add(file('a.png'));

    expect(tiles(host)).toHaveLength(1);
    expect(uppy.addFile).toHaveBeenCalledTimes(2);
  });

  it('refuses more than the session limit in one go, with the existing message', async () => {
    const { host } = await render();

    await add(file('a.png', 'image/png', 600), file('b.png', 'image/png', 600));

    expect(tiles(host)).toHaveLength(0);
    expect(uppy.addFile).not.toHaveBeenCalled();
    expect(show).toHaveBeenCalledWith(
      'Upload size limit exceeded. Maximum 1 GB per upload session.',
      'warning'
    );
  });

  it('counts as uploading while anything is queued or uploading', async () => {
    await render();

    expect(attachments.uploading).toBe(false);

    await add(file('a.png'), file('b.png'));
    expect(attachments.uploading).toBe(true);

    await finishUpload(row('a'));
    expect(attachments.uploading).toBe(true);

    await finishUpload(row('b'));
    expect(attachments.uploading).toBe(false);
  });

  it('adds a drop during an upload to the queue', async () => {
    const { host } = await render();
    const [a, b] = [file('a.png'), file('b.png')];
    await add(a);

    await add(b);

    expect(pictures(host)).toEqual(['blob:a.png', 'blob:b.png']);
    expect(uppy.addFile).toHaveBeenCalledTimes(1);

    await finishUpload(row('a'));

    expect(uppy.addFile).toHaveBeenLastCalledWith(b);
  });

  it('empties when told to, for a sent message', async () => {
    const { host } = await render();
    await act(async () => attachments.addMedia(row('a')));

    await act(async () => attachments.clear());

    expect(attachments.attached).toEqual([]);
    expect(tiles(host)).toHaveLength(0);
  });

  it('revokes what is left when it goes away, and starts nothing more', async () => {
    const { root } = await render();
    await add(file('a.png'), file('b.png'));

    act(() => root.unmount());

    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:a.png');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:b.png');

    await act(async () => uploader.options!.onUploadSuccess([row('a')]));

    expect(uppy.addFile).toHaveBeenCalledTimes(1);
  });
});

describe('a tile', () => {
  it('measures 96px with 12px corners, 76px on a phone, in a row that scrolls', async () => {
    const { host } = await render();
    await act(async () => attachments.addMedia([row('a'), row('b')]));

    for (const tile of tiles(host)) {
      expect(classes(tile)).toEqual(
        expect.arrayContaining([
          'w-[96px]',
          'h-[96px]',
          'rounded-[12px]',
          'phone:w-[76px]',
          'phone:h-[76px]',
          'flex-none',
        ])
      );
    }
    expect(classes(tiles(host)[0].parentElement!)).toEqual(
      expect.arrayContaining(['flex', 'overflow-x-auto'])
    );
    expect(classes(tiles(host)[0].parentElement!)).not.toContain('flex-wrap');
  });

  it('draws no row at all with nothing attached', async () => {
    const { host } = await render();

    expect(host.querySelector('[data-tray]')!.children).toHaveLength(0);
  });

  it('names each picture by its position', async () => {
    const { host } = await render();
    await act(async () => attachments.addMedia([row('a'), row('b')]));

    expect(
      Array.from(host.querySelectorAll('[data-tray] img')).map((img) =>
        img.getAttribute('alt')
      )
    ).toEqual(['Attached image 1', 'Attached image 2']);
  });

  // A picture dragged inside the page reads as a file drop, and would come back
  // as a new upload of the same image.
  it('can’t be dragged back onto the chat', async () => {
    const { host } = await render();
    await act(async () => attachments.addMedia(row('a')));

    expect(tiles(host)[0].querySelector('img')!.getAttribute('draggable')).toBe(
      'false'
    );
  });

  it('has one named remove button, a 44px target with a focus ring', async () => {
    const { host } = await render();
    await act(async () => attachments.addMedia(row('a')));
    const tile = tiles(host)[0];
    const button = removeButtons(host)[0];

    expect(tile.querySelectorAll('button')).toHaveLength(1);
    expect(button.getAttribute('aria-label')).toBe('Remove attachment 1');
    expect(button.getAttribute('type')).toBe('button');
    expect(classes(button)).toEqual(
      expect.arrayContaining([
        'coarse:w-[44px]',
        'coarse:h-[44px]',
        'focus-visible:ring-2',
        'focus-visible:ring-brand',
      ])
    );
  });

  // What the composer's thumbnail carries, and FR-005 leaves out here.
  it('has no drag handle, settings overlay or red badge', async () => {
    const { host } = await render();
    await act(async () => attachments.addMedia(row('a')));

    expect(host.querySelector('[data-tray] .dragging')).toBeNull();
    expect(host.querySelector('[data-tray] .cursor-move')).toBeNull();
    expect(host.querySelector('[data-tray] .bg-error')).toBeNull();
    expect(host.querySelector('[data-tray] .sortable-container')).toBeNull();
  });

  it('only takes the item off the message when removed', async () => {
    const { host } = await render();
    await act(async () => attachments.addMedia([row('a'), row('b')]));

    await click(removeButtons(host)[0]);

    expect(attachments.attached).toEqual([row('b')]);
    expect(pictures(host)).toEqual(['https://media/b.png']);
  });

  it('shows a video as a frame with a play badge, under its own name', async () => {
    const { host } = await render();
    await act(async () => attachments.addMedia(row('v', 'mp4')));
    const tile = tiles(host)[0];

    expect(tile.querySelector('video')?.getAttribute('data-frame')).toBe(
      'https://media/v.mp4'
    );
    expect(tile.querySelector('img')).toBeNull();
    expect(
      tile.querySelector('[role="img"]')?.getAttribute('aria-label')
    ).toBe('Attached video 1');
    const badge = tile.querySelector('.pointer-events-none')!;
    expect(badge.getAttribute('aria-hidden')).toBe('true');
    expect(badge.querySelector('svg')).not.toBeNull();
  });

  it('shows a video being uploaded from its file', async () => {
    const { host } = await render();
    await add(file('v.mp4', 'video/mp4'));
    const tile = tiles(host)[0];

    expect(tile.querySelector('video')?.getAttribute('data-frame')).toBe(
      'blob:v.mp4'
    );
    expect(tile.querySelector('[data-spinner]')).not.toBeNull();
  });
});

describe('the two buttons', () => {
  const tools = (host: HTMLElement) =>
    host.querySelector('[data-tools]')!.firstElementChild as HTMLElement;

  it('are Insert Media and AI Image, named at every width', async () => {
    const { host } = await render();
    const buttons = Array.from(tools(host).querySelectorAll('button'));

    expect(buttons.map((button) => button.textContent)).toEqual([
      'Insert Media',
      'AI Image',
    ]);
    for (const button of buttons) {
      expect(button.getAttribute('type')).toBe('button');
      expect(button.innerHTML).not.toContain('mobile:hidden');
      expect(button.innerHTML).not.toContain('phone:hidden');
      // `.agent` paints this class's last child as Send.
      expect(classes(button)).not.toContain('copilotKitInputControlButton');
      expect(classes(button)).toEqual(
        expect.arrayContaining([
          'h-[32px]',
          'coarse:h-[44px]',
          'phone:h-[44px]',
          'focus-visible:ring-2',
          'focus-visible:ring-brand',
        ])
      );
    }
  });

  it('are one button with no AI image access', async () => {
    user.tier = {};
    const { host } = await render();

    expect(
      Array.from(tools(host).querySelectorAll('button')).map(
        (button) => button.textContent
      )
    ).toEqual(['Insert Media']);
    expect(aiImageProps).toHaveLength(0);
  });

  it('open the Media library with no limit on type or number', async () => {
    const { host } = await render();
    const close = jest.fn();

    await click(tools(host).querySelector('button')!);

    expect(openModal).toHaveBeenCalledTimes(1);
    const options = openModal.mock.calls[0][0];
    expect(options).toMatchObject({
      title: 'Media Library',
      askClose: false,
      closeOnEscape: true,
      fullScreen: true,
      size: 'library-size',
      height: 'library-size',
    });
    const box = options.children(close);
    expect(box.type).toBe(MediaBox);
    expect(box.props.closeModal).toBe(close);
    expect(box.props).not.toHaveProperty('type');
    expect(box.props).not.toHaveProperty('max');

    await act(async () => box.props.setMedia([row('a'), row('b')]));

    expect(attachments.attached).toEqual([row('a'), row('b')]);
  });

  // FR-049: the window itself must not change for anyone else, so nothing here
  // gets to ask it to.
  it('hand AI Image what was typed, and take what it makes', async () => {
    await render();
    const props = aiImageProps[aiImageProps.length - 1];

    expect(typeof props.renderTrigger).toBe('function');
    expect(props.value).toBe('what was typed');
    expect(props).not.toHaveProperty('destination');

    await act(async () => props.onChange(row('made')));

    expect(attachments.attached).toEqual([row('made')]);
  });

  // Its window can be closed while it renders, and the image still arrives here.
  it('hold AI Image while it renders, with the name still showing', async () => {
    ai.loading = true;
    const { host } = await render();
    const button = tools(host).querySelectorAll('button')[1];

    expect(button.disabled).toBe(true);
    expect(button.textContent).toBe('AI Image');
    // The spinner takes the icon's place.
    expect(button.querySelector('svg')).toBeNull();
    expect(button.querySelector('[data-spinner]')).not.toBeNull();
  });

  // The input's row ends in a growing spacer before Send. A toolbar that grows
  // too splits the free space with it, and on a phone that cut a button off.
  it('are as wide as they need, so the spacer before Send keeps the free space', async () => {
    const { host } = await render();

    expect(
      classes(tools(host)).filter((c) =>
        /^(flex-1|flex-auto|grow|flex-grow)$/.test(c)
      )
    ).toEqual([]);
    expect(classes(tools(host))).toContain('min-w-0');
  });
});

describe('the drop overlay', () => {
  it('names what a drop does, and never takes the drop itself', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    mounted.push(root);
    await act(async () => {
      root.render(<AttachmentsDropOverlay />);
    });
    const overlay = host.firstElementChild!;

    expect(overlay.textContent).toContain('Drop your images here');
    expect(overlay.textContent).toContain("They'll be added to your message");
    expect(classes(overlay)).toEqual(
      expect.arrayContaining([
        'absolute',
        'inset-[10px]',
        'border-dashed',
        'border-brand',
        'rounded-[16px]',
        'pointer-events-none',
      ])
    );
  });
});
