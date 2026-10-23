import { act, createRef } from 'react';
import { createRoot } from 'react-dom/client';
import type { Editor } from '@tiptap/react';

// Upstream 774323e1. ProseMirror's own text parser splits pasted plain text on
// runs of newlines, so a blank line between two paragraphs (from a text
// editor, a spreadsheet or a web page) vanished on paste. The editor now keeps
// every line as a paragraph, the empty ones included.
//
// It mounts the real OnlyEditor with TipTap on happy-dom and pastes through
// EditorView.pasteText, which runs the clipboard text parser the same way a
// paste event does. Everything editor.tsx imports beyond TipTap is scenery.
jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (_key: string, fallback: string) => fallback,
}));
jest.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch: () => async () => new Response('[]'),
}));
jest.mock('@gitroom/react/toaster/toaster', () => ({
  useToaster: () => ({ show: () => {} }),
}));
jest.mock('@copilotkit/react-core', () => ({
  useCopilotAction: () => {},
  useCopilotReadable: () => {},
}));
jest.mock('emoji-picker-react', () => ({
  __esModule: true,
  default: () => null,
  Theme: {},
}));
jest.mock('@uppy/react', () => ({ Dashboard: () => null }));
jest.mock('@gitroom/frontend/components/media/new.uploader', () => ({
  useUppyUploader: () => ({ on: () => {}, off: () => {}, addFile: () => {} }),
}));
jest.mock('@gitroom/frontend/components/media/media.component', () => ({
  MultiMediaComponent: () => null,
}));
jest.mock('@gitroom/frontend/components/signature', () => ({
  SignatureBox: () => null,
}));
jest.mock(
  '@gitroom/frontend/components/launches/information.component',
  () => ({
    InformationComponent: () => null,
  })
);
jest.mock('@gitroom/react/helpers/delete.dialog', () => ({
  deleteDialog: async () => false,
}));
jest.mock('react-dropzone', () => ({
  useDropzone: () => ({ getRootProps: () => ({}), isDragActive: false }),
}));
jest.mock('@gitroom/frontend/components/new-launch/mention.component', () => ({
  suggestion: () => ({ items: async () => [], render: () => ({}) }),
}));

import { OnlyEditor } from '@gitroom/frontend/components/new-launch/editor';

const roots: Array<{ unmount: () => void }> = [];

beforeAll(() => {
  // ProseMirror watches the DOM, and pasteText builds a ClipboardEvent; the
  // shared harness installs both on window only.
  const globals = globalThis as unknown as Record<string, unknown>;
  const dom = window as unknown as Record<string, unknown>;
  globals.MutationObserver = dom.MutationObserver;
  globals.ClipboardEvent = dom.ClipboardEvent;
});

const mount = async (editorType: 'normal' | 'html') => {
  const ref = createRef<{ editor: Editor }>();
  const onChange = jest.fn();
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  roots.push(root);
  // `immediatelyRender: false`: the editor is created in an effect.
  await act(async () => {
    root.render(
      <OnlyEditor
        ref={ref}
        editorType={editorType}
        value=""
        onChange={onChange}
      />
    );
  });
  return { editor: ref.current.editor, onChange };
};

afterEach(() => {
  act(() => {
    roots.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
});

describe('pasting plain text into the editor', () => {
  it.each(['normal', 'html'] as const)(
    'keeps the blank line between two paragraphs (%s)',
    async (editorType) => {
      const { editor } = await mount(editorType);

      await act(async () => {
        editor.view.pasteText('First line\n\nSecond line');
      });

      expect(editor.getHTML()).toBe(
        '<p dir="auto">First line</p><p dir="auto"></p><p dir="auto">Second line</p>'
      );
    }
  );

  it('reads Windows line ends the same way', async () => {
    const { editor } = await mount('normal');

    await act(async () => {
      editor.view.pasteText('One\r\n\r\nTwo');
    });

    expect(editor.getHTML()).toBe(
      '<p dir="auto">One</p><p dir="auto"></p><p dir="auto">Two</p>'
    );
  });
});
