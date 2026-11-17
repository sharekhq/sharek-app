import { act, ReactElement, ReactNode } from 'react';
import { createRoot, Root } from 'react-dom/client';

jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  // The fallback with {{var}} filled in, because that is what t() renders.
  useT:
    () => (key: string, fallback: string, params?: Record<string, unknown>) =>
      fallback.replace(/{{(\w+)}}/g, (whole, name) =>
        params && name in params ? String(params[name]) : whole
      ),
}));
// The locked bar's Upgrade is a next/link.
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import {
  CreditsPill,
  GenerateButton,
  StageActions,
  StageProgress,
  StageResult,
  StageSample,
  VersionsStrip,
  WorkspaceFrame,
} from '@gitroom/frontend/components/studio/workspace.frame';
import { buttonClassName } from '@gitroom/react/form/button';

// The one frame every tool draws in every host (contracts/workspace-parts.md
// §1, FR-002, FR-015, FR-016a): on its Studio page the settings sit in a
// 360px panel on the start side with the action bar pinned under them and the
// stage fills the rest; in a window, and on a phone, the stage comes first,
// then the settings, then the bar, and after a result the settings fold into
// one row. The bar holds the credits left and the tool's actions, or, on a
// plan without AI, the cost and Upgrade (FR-003, FR-013, tasks D5).

const mounted: Root[] = [];

const mount = async (element: ReactElement) => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);

  await act(async () => {
    root.render(element);
  });
  return host;
};

const click = async (element: Element | null | undefined) => {
  await act(async () => {
    element?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
};

const tokens = (element: Element | null | undefined) =>
  (element?.getAttribute('class') || '').split(' ');
const byTestId = (host: HTMLElement, id: string) =>
  host.querySelector(`[data-testid="${id}"]`);
const follows = (
  later: Node | null | undefined,
  earlier: Node | null | undefined
) =>
  !!later &&
  !!earlier &&
  !!(earlier.compareDocumentPosition(later) & Node.DOCUMENT_POSITION_FOLLOWING);
const settingsRow = (host: HTMLElement) =>
  Array.from(host.querySelectorAll('button')).find((button) =>
    button.textContent?.startsWith('Settings')
  );
// The box the action bar draws: the one holding the tool's actions.
const bar = (host: HTMLElement) =>
  byTestId(host, 'action')?.closest('.border-t') ||
  host.querySelector('a[href="/billing"]')?.closest('.border-t');

const frame = (props: Partial<Parameters<typeof WorkspaceFrame>[0]> = {}) => (
  <WorkspaceFrame
    layout="page"
    head={<p data-testid="head">Veo 3</p>}
    settings={<input data-testid="field" />}
    stage={<p data-testid="stage">Sample</p>}
    actions={
      <button type="button" data-testid="action">
        Generate
      </button>
    }
    {...props}
  />
);

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
});

describe('the page layout', () => {
  it('puts the settings panel first, on the start side, with the head, the scroller and the bar', async () => {
    const host = await mount(frame());
    const root = host.firstElementChild!;
    const panel = root.children[0];

    expect(tokens(panel)).toEqual(
      expect.arrayContaining([
        'w-[360px]',
        'shrink-0',
        'border-e',
        'border-line',
      ])
    );
    const scroller = byTestId(host, 'field')!.closest('.overflow-y-auto');
    expect(tokens(scroller)).toEqual(
      expect.arrayContaining(['flex-1', 'min-h-0', 'overflow-y-auto'])
    );
    expect(tokens(bar(host))).toEqual(
      expect.arrayContaining(['border-t', 'border-line', 'bg-surface'])
    );
    // head, then the scroller, then the bar, all inside the panel
    expect(panel.contains(byTestId(host, 'head'))).toBe(true);
    expect(panel.contains(scroller)).toBe(true);
    expect(panel.contains(bar(host)!)).toBe(true);
    expect(follows(scroller, byTestId(host, 'head'))).toBe(true);
    expect(follows(bar(host), scroller)).toBe(true);
  });

  it('gives the rest to the stage, a size container stage parts measure', async () => {
    const host = await mount(frame());
    const stage = host.firstElementChild!.children[1];

    expect(stage.contains(byTestId(host, 'stage'))).toBe(true);
    expect(tokens(stage)).toEqual(
      expect.arrayContaining(['flex-1', 'min-w-0', '[container-type:size]'])
    );
  });

  // Above 1025px the page scrolls inside its card and the frame fills it, so
  // only the settings scroll; at 1025px and below the window scrolls.
  it('fills the page card above 1025px and takes its natural height below', async () => {
    const host = await mount(frame());

    expect(tokens(host.firstElementChild)).toEqual(
      expect.arrayContaining(['h-full', 'min-h-0', 'mobile:h-auto'])
    );
  });

  it('stacks on a phone: the stage first at its fixed height, the bar pinned at the bottom', async () => {
    const host = await mount(frame());
    const root = host.firstElementChild!;
    const [panel, stage] = Array.from(root.children);

    expect(tokens(root)).toContain('phone:flex-col');
    expect(tokens(stage)).toEqual(
      expect.arrayContaining([
        'phone:order-first',
        'phone:flex-none',
        'phone:h-[clamp(240px,45dvh,440px)]',
      ])
    );
    expect(tokens(panel)).toEqual(
      expect.arrayContaining(['phone:w-full', 'phone:border-e-0'])
    );
    // The window scrolls from 1025px down, the side-by-side page included,
    // so the bar sticks from there, a phone with it (FR-003).
    expect(tokens(bar(host))).toEqual(
      expect.arrayContaining(['mobile:sticky', 'mobile:bottom-0'])
    );
    expect(tokens(bar(host))).not.toContain('phone:sticky');
  });

  // The page keeps its settings open beside the result; only the phone's
  // stacked page folds them.
  it('folds the settings only on a phone', async () => {
    const host = await mount(
      frame({ folded: true, settingsSummary: 'Prompt, brand, shape and style' })
    );
    const scroller = byTestId(host, 'field')!.closest('.overflow-y-auto');

    expect(tokens(settingsRow(host))).toEqual(
      expect.arrayContaining(['hidden', 'phone:flex'])
    );
    expect(tokens(scroller)).toContain('phone:hidden');
    expect(tokens(scroller)).not.toContain('hidden');

    await click(settingsRow(host));

    expect(settingsRow(host)!.getAttribute('aria-expanded')).toBe('true');
    expect(tokens(scroller)).not.toContain('phone:hidden');
  });
});

describe('the stacked layout', () => {
  it('draws the stage, then the settings, then the bar', async () => {
    const host = await mount(frame({ layout: 'stacked' }));
    const stage = byTestId(host, 'stage')!.parentElement;
    const field = byTestId(host, 'field');

    expect(tokens(stage)).toEqual(
      expect.arrayContaining([
        'h-[clamp(240px,45dvh,440px)]',
        '[container-type:size]',
      ])
    );
    expect(follows(field, stage)).toBe(true);
    expect(follows(bar(host), field)).toBe(true);
    expect(tokens(bar(host))).toEqual(
      expect.arrayContaining([
        'sticky',
        'bottom-0',
        'border-t',
        'border-line',
        'bg-surface',
      ])
    );
  });

  it('shows the settings and no Settings row before a result', async () => {
    const host = await mount(frame({ layout: 'stacked' }));

    expect(settingsRow(host)).toBeUndefined();
    expect(tokens(byTestId(host, 'field')!.parentElement)).not.toContain(
      'hidden'
    );
  });

  it('folds the settings into one Settings row with their summary after a result', async () => {
    const host = await mount(
      frame({
        layout: 'stacked',
        folded: true,
        settingsSummary: 'Prompt, brand, shape and style',
      })
    );
    const row = settingsRow(host)!;
    const settings = byTestId(host, 'field')!.parentElement;

    expect(
      Array.from(host.querySelectorAll('button')).filter((button) =>
        button.textContent?.startsWith('Settings')
      )
    ).toHaveLength(1);
    expect(row.textContent).toContain('Prompt, brand, shape and style');
    expect(row.getAttribute('aria-expanded')).toBe('false');
    expect(tokens(row)).not.toContain('hidden');
    expect(tokens(settings)).toContain('hidden');

    await click(row);

    expect(row.getAttribute('aria-expanded')).toBe('true');
    expect(tokens(settings)).not.toContain('hidden');
  });

  it('rings the Settings row when focused and gives it 44px under a finger', async () => {
    const host = await mount(frame({ layout: 'stacked', folded: true }));

    expect(tokens(settingsRow(host))).toEqual(
      expect.arrayContaining([
        'focus-visible:ring-2',
        'focus-visible:ring-brand',
        'coarse:min-h-[44px]',
      ])
    );
  });
});

describe('the action bar', () => {
  it('shows the credits left beside the actions', async () => {
    const host = await mount(frame({ credits: <CreditsPill count={7} /> }));

    expect(bar(host)!.textContent).toContain('7 credits left');
    expect(bar(host)!.contains(byTestId(host, 'action'))).toBe(true);
  });

  // FR-013: a plan without AI opens the page with its settings and stage, and
  // the main button reads Upgrade and leads to Billing.
  it('shows the cost and Upgrade in place of the actions when locked', async () => {
    const host = await mount(
      frame({ locked: true, cost: 'Uses 1 image credit' })
    );
    const upgrade = host.querySelector('a[href="/billing"]');

    expect(upgrade?.textContent).toBe('Upgrade');
    expect(bar(host)!.textContent).toContain('Uses 1 image credit');
    expect(byTestId(host, 'action')).toBeNull();
    expect(byTestId(host, 'field')).not.toBeNull();
    expect(byTestId(host, 'stage')).not.toBeNull();
  });

  it('draws Upgrade as the large main button, ringed when focused', async () => {
    const host = await mount(
      frame({ locked: true, cost: 'Uses 1 image credit' })
    );

    expect(tokens(host.querySelector('a[href="/billing"]'))).toEqual(
      expect.arrayContaining([
        ...buttonClassName({ size: 'large' }).split(' '),
        'focus-visible:ring-2',
        'focus-visible:ring-brand',
      ])
    );
  });
});

describe('the settings scroller', () => {
  // Moved from ai.video.spec (tasks D15a). The ring is a 2px box-shadow
  // outside the field and overflow clips at the padding edge, so a scroller
  // padded on one side only cut the ring off on the others. The matching
  // negative margin keeps the fields exactly where an unpadded scroller had
  // them.
  it('leaves room for the focus ring on every side', async () => {
    const page = await mount(frame());
    const stacked = await mount(frame({ layout: 'stacked' }));

    [page, stacked].forEach((host) => {
      const classes = tokens(
        byTestId(host, 'field')!.closest('.overflow-y-auto')
      );
      expect(classes).toContain('p-[4px]');
      expect(classes).toContain('-m-[4px]');
    });
  });
});

describe('CreditsPill', () => {
  it('draws the credits left as the windows did', async () => {
    const host = await mount(<CreditsPill count={3} />);
    const pill = host.firstElementChild;

    expect(pill?.textContent).toBe('3 credits left');
    expect(tokens(pill)).toEqual(
      expect.arrayContaining([
        'bg-ai',
        'text-aiAccent',
        'rounded-full',
        'px-[12px]',
        'py-[4px]',
        'text-[12px]',
        'font-[600]',
      ])
    );
  });
});

// The bar's main button, worded the one way every tool words it (tasks D6).
describe('GenerateButton', () => {
  it('reads Generate, Generate again once a window has a result, and Creating… while a render runs', async () => {
    const first = await mount(<GenerateButton working={false} again={false} />);
    const again = await mount(<GenerateButton working={false} again />);
    const working = await mount(<GenerateButton working again />);

    expect(first.querySelector('button')?.textContent).toBe('Generate');
    expect(again.querySelector('button')?.textContent).toBe('Generate again');
    expect(working.querySelector('button')?.textContent).toBe('Creating…');
    expect(working.querySelector('button')?.getAttribute('aria-busy')).toBe(
      'true'
    );
    expect(first.querySelector('button')?.getAttribute('aria-busy')).not.toBe(
      'true'
    );
  });

  it('draws at the large size and passes on its press, its type and whether it is held', async () => {
    const onClick = jest.fn();
    const host = await mount(
      <GenerateButton
        working={false}
        again={false}
        type="submit"
        onClick={onClick}
      />
    );
    const held = await mount(
      <GenerateButton working={false} again={false} disabled />
    );
    const button = host.querySelector('button')!;

    expect(tokens(button)).toEqual(
      expect.arrayContaining(buttonClassName({ size: 'large' }).split(' '))
    );
    expect(button.getAttribute('type')).toBe('submit');
    expect(held.querySelector('button')?.disabled).toBe(true);

    await click(button);

    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

// The stage parts (contracts/workspace-parts.md §3, FR-006 to FR-008): what
// the stage shows in turn, the sample before anything is made, the wait, then
// the result with every version made since the page opened. They take words,
// never keys, but the ones they own: each tool translates its own.

describe('StageSample', () => {
  const sample = (props: Partial<Parameters<typeof StageSample>[0]> = {}) => (
    <StageSample
      cover="/studio/covers/ai-image.webp"
      icon={<svg data-testid="glyph" />}
      title="Your image appears here"
      body="Describe it, pick a shape and a style, then press Generate."
      {...props}
    />
  );

  it('shows the cover marked as a sample, the title and the line on what to do', async () => {
    const host = await mount(sample());

    expect(host.querySelector('img')?.getAttribute('src')).toBe(
      '/studio/covers/ai-image.webp'
    );
    expect(byTestId(host, 'glyph')).toBeNull();
    expect(host.textContent).toContain('Sample');
    expect(host.textContent).toContain('Your image appears here');
    expect(host.textContent).toContain(
      'Describe it, pick a shape and a style, then press Generate.'
    );
  });

  it('shows the given icon when the tool has no cover', async () => {
    const host = await mount(sample({ cover: undefined }));

    expect(host.querySelector('img')).toBeNull();
    expect(byTestId(host, 'glyph')).not.toBeNull();
    expect(host.textContent).toContain('Sample');
  });

  // As the Studio card and the switcher do: a broken picture is no sample.
  it('gives way to the icon when the cover does not load', async () => {
    const host = await mount(sample());

    await act(async () => {
      host.querySelector('img')?.dispatchEvent(new Event('error'));
    });

    expect(host.querySelector('img')).toBeNull();
    expect(byTestId(host, 'glyph')).not.toBeNull();
    expect(host.textContent).toContain('Sample');
  });

  it('offers no examples when the tool has none', async () => {
    const host = await mount(sample());

    expect(host.textContent).not.toContain('Try one');
    expect(host.querySelectorAll('button')).toHaveLength(0);
  });

  // An example fills the prompt; it never renders by itself.
  it('offers at most three examples, each handing its text back', async () => {
    const onExample = jest.fn();
    const host = await mount(
      sample({
        examples: [
          'Iced lemonade on a sunny terrace',
          'Coffee on a marble table, morning light',
          'Ramadan sweets from above',
          'A fourth one',
        ],
        onExample,
      })
    );
    const chips = Array.from(host.querySelectorAll('button'));

    expect(host.textContent).toContain('Try one');
    expect(chips.map((chip) => chip.textContent)).toEqual([
      'Iced lemonade on a sunny terrace',
      'Coffee on a marble table, morning light',
      'Ramadan sweets from above',
    ]);
    expect(chips.every((chip) => chip.getAttribute('type') === 'button')).toBe(
      true
    );

    await click(chips[1]);

    expect(onExample).toHaveBeenCalledTimes(1);
    expect(onExample).toHaveBeenCalledWith(
      'Coffee on a marble table, morning light'
    );
  });
});

describe('StageProgress', () => {
  const progress = (
    props: Partial<Parameters<typeof StageProgress>[0]> = {}
  ) => (
    <StageProgress
      ratio={9 / 16}
      title="Creating your video…"
      detail="Usually takes a few minutes"
      note="You can leave this page."
      {...props}
    />
  );
  const placeholder = (host: HTMLElement) =>
    host.querySelector<HTMLElement>('.motion-safe\\:animate-pulse');

  // The wait draws the shape that is coming, as large as the stage allows:
  // as tall as the room, never wider than it.
  it('draws a placeholder of the chosen shape, as large as the stage allows', async () => {
    const host = await mount(progress());
    const box = placeholder(host)!;

    expect(parseFloat(box.style.aspectRatio)).toBeCloseTo(9 / 16, 5);
    expect(box.style.width).toBe(`calc(100cqh * ${9 / 16})`);
    expect(tokens(box)).toContain('max-w-full');
    // the room is a size container of its own, so the words below keep theirs
    expect(tokens(box.parentElement)).toContain('[container-type:size]');
  });

  it('says what it is making, how long it takes and that the member can leave', async () => {
    const host = await mount(progress());

    expect(host.textContent).toContain('Creating your video…');
    expect(host.textContent).toContain('Usually takes a few minutes');
    expect(host.textContent).toContain('You can leave this page.');
    expect(host.textContent).not.toContain('elapsed');
  });

  it('adds the elapsed time when it is given', async () => {
    const host = await mount(progress({ elapsed: '0:42 elapsed' }));

    expect(host.textContent).toContain(
      'Usually takes a few minutes · 0:42 elapsed'
    );
  });

  // Marked by shape as well as colour: a tick when done, a turning ring while
  // running, an empty one until then.
  it('lists the steps done, at work and to come, with the count of the one at work', async () => {
    const host = await mount(
      progress({
        steps: [
          { label: 'Writing the script', state: 'done' },
          { label: 'Drawing the slides', state: 'now', count: '2/4' },
          { label: 'Putting the video together', state: 'todo' },
        ],
      })
    );
    const row = (label: string) =>
      Array.from(host.querySelectorAll('div')).find(
        (node) =>
          node.children.length === 2 && node.textContent?.startsWith(label)
      );
    const mark = (label: string) => row(label)?.firstElementChild;

    expect(tokens(row('Writing the script'))).toContain('text-inkSoft');
    expect(mark('Writing the script')?.querySelector('svg')).not.toBeNull();
    expect(tokens(row('Drawing the slides'))).toEqual(
      expect.arrayContaining(['text-ink', 'font-[600]'])
    );
    expect(tokens(mark('Drawing the slides'))).toContain(
      'motion-safe:animate-spin'
    );
    expect(row('Drawing the slides')?.textContent).toBe(
      'Drawing the slides · 2/4'
    );
    expect(
      row('Drawing the slides')?.querySelector('[dir="ltr"]')?.textContent
    ).toBe(' · 2/4');
    expect(tokens(row('Putting the video together'))).toContain('text-muted');
    expect(mark('Putting the video together')?.querySelector('svg')).toBeNull();
  });
});

describe('StageResult', () => {
  const result = (props: Partial<Parameters<typeof StageResult>[0]> = {}) => (
    <StageResult
      media={{ path: 'https://cdn.example/lemonade.png' }}
      kind="image"
      ratio={1}
      alt="Iced lemonade on a sunny terrace"
      caption={<span data-testid="caption">Square · Photo</span>}
      actions={
        <button type="button" data-testid="download">
          Download
        </button>
      }
      {...props}
    />
  );

  // The result fills the box the placeholder drew.
  it('opens an image full size in a new tab, in the placeholder box', async () => {
    const host = await mount(result());
    const link = host.querySelector<HTMLElement>('a[target="_blank"]')!;
    const image = link.querySelector('img')!;

    expect(link.getAttribute('href')).toBe('https://cdn.example/lemonade.png');
    expect(image.getAttribute('src')).toBe('https://cdn.example/lemonade.png');
    expect(image.getAttribute('alt')).toBe('Iced lemonade on a sunny terrace');
    expect(tokens(image)).toContain('object-cover');
    expect(parseFloat(link.style.aspectRatio)).toBeCloseTo(1, 5);
    expect(link.style.width).toBe('calc(100cqh * 1)');
    expect(tokens(link)).toEqual(
      expect.arrayContaining([
        'max-w-full',
        'focus-visible:ring-2',
        'focus-visible:ring-brand',
      ])
    );
  });

  it('plays a video where it sits', async () => {
    const host = await mount(
      result({
        kind: 'video',
        ratio: 16 / 9,
        media: { path: 'https://cdn.example/clip.mp4' },
      })
    );
    const video = host.querySelector<HTMLElement>('video')!;

    expect(host.querySelector('a')).toBeNull();
    expect(video.getAttribute('src')).toBe('https://cdn.example/clip.mp4');
    expect(video.hasAttribute('controls')).toBe(true);
    expect(video.hasAttribute('playsinline')).toBe(true);
    expect(parseFloat(video.style.aspectRatio)).toBeCloseTo(16 / 9, 5);
  });

  it('says it is saved and holds the caption, the actions, the versions and what goes below', async () => {
    const host = await mount(
      result({
        versions: <div data-testid="versions" />,
        below: <div data-testid="edit-bar" />,
      })
    );

    expect(host.textContent).toContain('Saved to your Media library');
    expect(byTestId(host, 'caption')).not.toBeNull();
    expect(byTestId(host, 'download')).not.toBeNull();
    expect(byTestId(host, 'versions')).not.toBeNull();
    expect(byTestId(host, 'edit-bar')).not.toBeNull();
    expect(
      follows(byTestId(host, 'edit-bar'), byTestId(host, 'versions'))
    ).toBe(true);
  });
});

// The result's actions, chosen on the host rather than the destination
// (contracts/workspace-parts.md §3, FR-007): a window, which accepts, hands
// the result over; the Studio page, which does not, makes a post from it
// when there is a channel to post it to; Download in every host.
describe('StageActions', () => {
  const media = { id: 'media-1', path: 'https://cdn.example/lemonade.png' };
  const actions = (props: Partial<Parameters<typeof StageActions>[0]> = {}) => (
    <StageActions media={media} kind="image" destination="post" {...props} />
  );
  const named = (host: HTMLElement, label: string) =>
    Array.from(host.querySelectorAll('button')).find(
      (button) => button.textContent === label
    );
  const large = buttonClassName({ size: 'large' }).split(' ');

  // A tab, not the page, when the browser ignores `download` for a file on
  // another origin: leaving the page would lose its versions.
  it('offers Download in every host, a large secondary link to the file in a new tab', async () => {
    const onPage = await mount(actions({ destination: 'media' }));
    const inWindow = await mount(
      actions({
        kind: 'video',
        media: { id: 'media-2', path: 'https://cdn.example/clip.mp4' },
        onAccept: jest.fn(),
      })
    );

    (
      [
        [onPage, 'https://cdn.example/lemonade.png'],
        [inWindow, 'https://cdn.example/clip.mp4'],
      ] as const
    ).forEach(([host, path]) => {
      const download = host.querySelector('a[download]');
      expect(download?.textContent).toBe('Download');
      expect(download?.getAttribute('href')).toBe(path);
      expect(download?.getAttribute('target')).toBe('_blank');
      expect(tokens(download)).toEqual(
        expect.arrayContaining(
          buttonClassName({ variant: 'secondary', size: 'large' }).split(' ')
        )
      );
    });
  });

  it('in a window offers Use image or Use video, at the large size, and no Create a post', async () => {
    const onAccept = jest.fn();
    const image = await mount(actions({ onAccept, onCreatePost: jest.fn() }));
    const video = await mount(
      actions({ kind: 'video', destination: 'reference', onAccept })
    );

    expect(tokens(named(image, 'Use image'))).toEqual(
      expect.arrayContaining(large)
    );
    expect(named(image, 'Create a post')).toBeUndefined();
    expect(named(video, 'Use video')).toBeTruthy();

    await click(named(image, 'Use image'));

    expect(onAccept).toHaveBeenCalledTimes(1);
  });

  // A window with nothing to attach the result to, as Studio opens one for a
  // video model with no page: Done, which raises Studio's saved notice.
  it('in a window for the Media library words the accept Done', async () => {
    const onAccept = jest.fn();
    const host = await mount(actions({ destination: 'media', onAccept }));

    expect(named(host, 'Use image')).toBeUndefined();

    await click(named(host, 'Done'));

    expect(onAccept).toHaveBeenCalledTimes(1);
  });

  it('on the page offers Create a post only with a channel, and nothing to accept', async () => {
    const onCreatePost = jest.fn();
    const channel = await mount(
      actions({ destination: 'media', onCreatePost })
    );
    const none = await mount(actions({ destination: 'media' }));
    const create = Array.from(channel.querySelectorAll('button')).find(
      (button) => button.textContent?.includes('Create a post')
    );

    expect(tokens(create)).toEqual(expect.arrayContaining(large));
    expect(named(channel, 'Done')).toBeUndefined();
    expect(none.querySelectorAll('button')).toHaveLength(0);
    expect(none.querySelector('a[download]')).not.toBeNull();

    await click(create);

    expect(onCreatePost).toHaveBeenCalledWith(media);
  });

  // Image Text Slides' Edit script (tasks D7): back to an earlier screen.
  it("leads with a workflow's way back, a large secondary action", async () => {
    const onClick = jest.fn();
    const host = await mount(
      actions({ kind: 'video', back: { label: 'Edit script', onClick } })
    );
    const back = named(host, 'Edit script');

    expect(tokens(back)).toEqual(
      expect.arrayContaining(
        buttonClassName({ variant: 'secondary', size: 'large' }).split(' ')
      )
    );
    expect(follows(host.querySelector('a[download]'), back)).toBe(true);

    await click(back);

    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe('VersionsStrip', () => {
  const images = [
    { path: 'https://cdn.example/1.png', kind: 'image' as const },
    { path: 'https://cdn.example/2.png', kind: 'image' as const },
    { path: 'https://cdn.example/3.png', kind: 'image' as const },
  ];

  it('draws nothing while there is one version', async () => {
    const host = await mount(
      <VersionsStrip
        versions={images.slice(0, 1)}
        shown={0}
        onSelect={jest.fn()}
      />
    );

    expect(host.innerHTML).toBe('');
  });

  it('draws one button per version from two, the one on screen pressed', async () => {
    const onSelect = jest.fn();
    const host = await mount(
      <VersionsStrip versions={images} shown={1} onSelect={onSelect} />
    );
    const buttons = Array.from(host.querySelectorAll('button'));

    expect(
      host.querySelector('[role="group"]')?.getAttribute('aria-label')
    ).toBe('Versions');
    expect(buttons.map((button) => button.getAttribute('aria-label'))).toEqual([
      'Version 1',
      'Version 2',
      'Version 3',
    ]);
    expect(
      buttons.map((button) => button.getAttribute('aria-pressed'))
    ).toEqual(['false', 'true', 'false']);
    expect(tokens(buttons[0])).toEqual(
      expect.arrayContaining([
        'focus-visible:ring-2',
        'focus-visible:ring-brand',
      ])
    );

    await click(buttons[2]);

    expect(onSelect).toHaveBeenCalledWith(2);
  });

  // A video version shows its first frame, the poster a strip can carry.
  it('draws a video version from its first frame', async () => {
    const host = await mount(
      <VersionsStrip
        versions={[
          images[0],
          { path: 'https://cdn.example/clip.mp4', kind: 'video' },
        ]}
        shown={0}
        onSelect={jest.fn()}
      />
    );
    const video = host.querySelector('video')!;

    expect(video.getAttribute('src')).toBe(
      'https://cdn.example/clip.mp4#t=0.1'
    );
    expect(video.getAttribute('preload')).toBe('metadata');
    expect(video.hasAttribute('controls')).toBe(false);
  });
});
