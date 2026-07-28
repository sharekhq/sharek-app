import { FC, act, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import type { AddEditModalProps } from '@gitroom/frontend/components/new-launch/add.edit.modal';

dayjs.extend(utc);

// agent.chat.tsx pulls the whole chat surface in at module scope. None of it takes part in the
// manualPosting queue, so it is stubbed out to keep the spec to the modal loop.
jest.mock('@copilotkit/react-ui', () => ({ CopilotChat: () => null }));
jest.mock('@copilotkit/react-core', () => ({
  CopilotKit: () => null,
  useCopilotAction: () => {},
  useCopilotMessagesContext: () => ({ setMessages: () => {} }),
}));
jest.mock('@copilotkit/runtime-client-gql', () => ({ TextMessage: class {} }));
jest.mock('@gitroom/frontend/components/agents/agent.input', () => ({
  Input: () => null,
}));
jest.mock('@gitroom/frontend/components/agents/agent', () => ({
  MediaPortal: () => null,
  PropertiesContext: require('react').createContext({ properties: [] }),
}));
jest.mock('@gitroom/react/helpers/variable.context', () => ({
  useVariables: () => ({ backendUrl: '' }),
}));
jest.mock('next/navigation', () => ({ useParams: () => ({ id: 'new' }) }));
jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (key: string, fallback: string) => fallback,
}));
jest.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch: () => async () => ({
    json: async () => ({ integrations: [{ id: 'ig-1', name: 'Instagram' }] }),
  }),
}));

// Stands in for the real editor, with one button per way out of it. Both mirror ManageModal:
// a save calls `mutate()` and then closes every modal (manage.modal.tsx:418-432), and the close
// button calls `customClose()` when the caller passed one, falling back to closing every modal
// as well (manage.modal.tsx:163-167).
jest.mock('@gitroom/frontend/components/new-launch/add.edit.modal', () => {
  const React = require('react');
  const {
    useModals,
  } = require('@gitroom/frontend/components/layout/new-modal');

  return {
    AddEditModal: ({ mutate, customClose, onlyValues }: AddEditModalProps) => {
      const modals = useModals();
      return React.createElement(
        'div',
        { 'data-testid': 'editor' },
        React.createElement(
          'span',
          { 'data-testid': 'editor-content' },
          onlyValues?.[0].content
        ),
        React.createElement('button', {
          'data-testid': 'save',
          onClick: () => {
            mutate();
            modals.closeAll();
          },
        }),
        React.createElement('button', {
          'data-testid': 'close',
          onClick: () => (customClose ? customClose() : modals.closeAll()),
        })
      );
    },
  };
});

import { OpenModal } from '@gitroom/frontend/components/agents/agent.chat';
import {
  ModalManagerInner,
  useModals,
} from '@gitroom/frontend/components/layout/new-modal';

const entry = (content: string) => ({
  integrationIds: ['ig-1'],
  date: '2026-08-01T10:00:00.000Z',
  posts: [{ content, attachments: [] }],
});

// The modal manager keeps its open modals in a module-level store, so anything a test leaves
// behind is still there for the next one. This hands afterEach a way to empty it.
let closeEveryModal: (() => void) | undefined;
const CaptureModals: FC = () => {
  const { closeAll } = useModals();
  useEffect(() => {
    closeEveryModal = closeAll;
  }, [closeAll]);
  return null;
};

const Harness: FC<{
  respond: (value: string) => void;
  contents: string[];
}> = ({ respond, contents }) => (
  <>
    <CaptureModals />
    <ModalManagerInner />
    <OpenModal args={{ list: contents.map(entry) }} respond={respond} />
  </>
);

/** Lets the integrations fetch, the queue and React settle. */
const flush = async () => {
  await act(async () => {
    await new Promise((res) => setTimeout(res, 0));
  });
};

const mounted: Array<{ unmount: () => void }> = [];

const queue = async (...contents: string[]) => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const respond = jest.fn();
  const root = createRoot(host);
  mounted.push(root);

  await act(async () => {
    root.render(<Harness respond={respond} contents={contents} />);
  });
  await flush();

  const editors = () =>
    Array.from(document.querySelectorAll('[data-testid="editor"]'));

  const press = async (testId: string) => {
    const open = editors();
    const button = open[open.length - 1]?.querySelector(
      `[data-testid="${testId}"]`
    );
    if (!button) throw new Error(`no editor to ${testId}`);
    await act(async () => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await flush();
  };

  return {
    respond,
    editors,
    /** What the editor on screen is being asked to post. */
    openContent: () =>
      editors().pop()?.querySelector('[data-testid="editor-content"]')
        ?.textContent,
    save: () => press('save'),
    close: () => press('close'),
    /** Escape, the modal manager's own way out: confirm dialog, then close. */
    escape: async () => {
      await act(async () => {
        // react-hotkeys-hook matches on `code`, not `key`.
        document.dispatchEvent(
          new KeyboardEvent('keydown', {
            key: 'Escape',
            code: 'Escape',
            bubbles: true,
          })
        );
      });
      await flush();

      const yes = Array.from(document.querySelectorAll('button')).find(
        (b) => b.textContent === 'Yes'
      );
      if (!yes)
        throw new Error(
          `no confirmation to approve in: ${document.body.innerHTML}`
        );
      await act(async () => {
        yes.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      await flush();
    },
  };
};

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
    closeEveryModal?.();
  });
  document.body.innerHTML = '';
});

describe('manualPosting queue', () => {
  it('opens the queued posts one editor at a time', async () => {
    const run = await queue('first post', 'second post');

    expect(run.editors()).toHaveLength(1);
    expect(run.openContent()).toBe('first post');

    await run.save();
    expect(run.editors()).toHaveLength(1);
    expect(run.openContent()).toBe('second post');
  });

  it('reports back once the whole queue is saved', async () => {
    const run = await queue('first post', 'second post');
    await run.save();
    expect(run.respond).not.toHaveBeenCalled();

    await run.save();
    expect(run.respond).toHaveBeenCalledTimes(1);
    expect(run.respond.mock.calls[0][0]).toContain('saved all 2');
  });

  it('moves on to the next post when an editor is closed without saving', async () => {
    const run = await queue('first post', 'second post');

    await run.close();
    expect(run.editors()).toHaveLength(1);
    expect(run.openContent()).toBe('second post');
  });

  it('moves on when an editor is closed with Escape', async () => {
    const run = await queue('first post', 'second post');

    await run.escape();
    expect(run.openContent()).toBe('second post');
  });

  it('finishes the action instead of hanging when the last editor is closed', async () => {
    const run = await queue('only post');

    await run.close();
    expect(run.editors()).toHaveLength(0);
    expect(run.respond).toHaveBeenCalledTimes(1);
  });

  it('tells the agent nothing was scheduled when every editor is closed', async () => {
    const run = await queue('first post', 'second post');
    await run.close();
    await run.close();

    const message = run.respond.mock.calls[0][0];
    expect(message).toContain('closed');
    expect(message).toContain('nothing was scheduled');
    expect(message).not.toContain('saved');
  });

  it('tells the agent how many posts survived a partial cancel', async () => {
    const run = await queue('first post', 'second post');
    await run.save();
    await run.close();

    expect(run.respond.mock.calls[0][0]).toContain('saved 1 of 2');
  });
});
