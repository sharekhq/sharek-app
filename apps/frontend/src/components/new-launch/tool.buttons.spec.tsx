import 'reflect-metadata';
import { act, ReactElement } from 'react';
import { createRoot } from 'react-dom/client';

// The composer's tool buttons at 1025px and below (spec 044): real buttons with
// names, since there they are 44px tiles on the pinned bar with no label or
// hover to lean on.
jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT:
    () => (key: string, fallback?: string, params?: Record<string, unknown>) =>
      (fallback ?? key).replace(/{{(\w+)}}/g, (whole, name) =>
        params && name in params ? String(params[name]) : whole
      ),
}));
// The add-post button reads its enum through the providers' module, which
// brings the channel previews; scenery, as in high.order.provider.spec.tsx.
jest.mock(
  '@gitroom/frontend/components/launches/general.preview.component',
  () => ({ GeneralPreviewComponent: () => null })
);
jest.mock('@gitroom/frontend/components/launches/internal.channels', () => ({
  InternalChannels: () => null,
}));
// The signature tool's modal lists the saved signatures through CopilotKit's
// textarea, which ships ESM only; scenery here.
jest.mock('@gitroom/frontend/components/settings/signatures.component', () => ({
  SignaturesComponent: () => null,
}));

import { AddPostButton } from '@gitroom/frontend/components/new-launch/add.post.button';
import { HeadingComponent } from '@gitroom/frontend/components/new-launch/heading.component';
import { SignatureBox } from '@gitroom/frontend/components/signature';
import { UText } from '@gitroom/frontend/components/new-launch/u.text';
import { BoldText } from '@gitroom/frontend/components/new-launch/bold.text';
import { AComponent } from '@gitroom/frontend/components/new-launch/a.component';
import { Bullets } from '@gitroom/frontend/components/new-launch/bullets.component';
import { PostComment } from '@gitroom/frontend/components/new-launch/providers/post-comment.enum';

const mounted: Array<{ unmount: () => void }> = [];

const render = async (element: ReactElement) => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);
  await act(async () => {
    root.render(element);
  });
  return host;
};

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
});

describe('Add comment or post', () => {
  it('is a button with a focus ring, its label kept for screen readers when it hides', async () => {
    const onClick = jest.fn();
    const host = await render(
      <AddPostButton onClick={onClick} num={0} postComment={PostComment.ALL} />
    );
    const button = host.querySelector('button')!;

    expect(button.getAttribute('type')).toBe('button');
    expect(button.className).toContain('focus-visible:ring-brand');
    expect(button.textContent).toBe('Add comment or post');
    await act(async () => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe('the heading levels', () => {
  it('are three named 44px buttons at 1025px and below', async () => {
    const editor = {
      commands: {
        unsetUnderline: jest.fn(),
        unsetBold: jest.fn(),
        toggleHeading: jest.fn(),
      },
    };
    const host = await render(
      <HeadingComponent editor={editor} currentValue="" />
    );
    const levels = Array.from(host.querySelectorAll('button'));

    expect(levels.map((level) => level.getAttribute('aria-label'))).toEqual([
      'Heading 1',
      'Heading 2',
      'Heading 3',
    ]);
    levels.forEach((level) => {
      expect(level.getAttribute('type')).toBe('button');
      expect(level.className.split(' ')).toEqual(
        expect.arrayContaining([
          'mobile:w-[44px]',
          'mobile:h-[44px]',
          'focus-visible:ring-2',
          'focus-visible:ring-brand',
        ])
      );
    });
    await act(async () => {
      levels[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(editor.commands.toggleHeading).toHaveBeenCalledWith({ level: 2 });
  });
});

// The app's tooltip does not show on a touch screen, so each icon-only tool
// carries the name its tooltip gave it.
describe('the formatting tools', () => {
  it('are named by their tooltip', async () => {
    const names: string[] = [];
    for (const tool of [
      <SignatureBox key="signature" editor={undefined} />,
      <UText key="underline" editor={undefined} currentValue="" />,
      <BoldText key="bold" editor={undefined} currentValue="" />,
      <AComponent key="link" editor={undefined} currentValue="" />,
      <Bullets key="bullets" editor={undefined} currentValue="" />,
    ]) {
      const host = await render(tool);
      const control = host.querySelector('[data-tooltip-id="tooltip"]')!;
      names.push(control.getAttribute('aria-label')!);
    }

    expect(names).toEqual([
      'Add Signature',
      'Underline',
      'Bold Text',
      'Link',
      'Bullets',
    ]);
  });
});
