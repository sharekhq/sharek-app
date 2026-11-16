import { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { Button, buttonClassName } from './button';

// One button set for the whole dashboard (spec 059, FR-026 to FR-031): four kinds (plus a
// red-text row action) in three sizes, 8px corners, 14px semibold text (13px small), 6px
// between an icon and its label, and at least 44px under a finger.
const EVERY_LOOK = [
  'flex',
  'items-center',
  'justify-center',
  'gap-[6px]',
  'rounded-[8px]',
  'font-[600]',
  'cursor-pointer',
  'relative',
  'coarse:min-h-[44px]',
  'focus-visible:ring-2',
  'focus-visible:ring-brand',
];
const KIND = {
  primary: ['bg-brand', 'text-white'],
  secondary: [
    'bg-quiet',
    'text-ink',
    'border',
    'border-line',
    'hover:bg-surface2',
  ],
  ghost: ['bg-transparent', 'text-ink', 'hover:bg-boxHover'],
  danger: ['bg-error', 'text-white'],
  dangerGhost: ['bg-transparent', 'text-error', 'hover:bg-boxHover'],
} as const;
const MEDIUM = ['h-[40px]', 'px-[16px]', 'text-[14px]'];

const classAttributes = (element: ReactElement): string[][] =>
  [...renderToStaticMarkup(element).matchAll(/class="([^"]*)"/g)].map((m) =>
    m[1].split(/\s+/).filter(Boolean)
  );

/** The <button>'s own classes: the first class attribute in the markup. */
const buttonClasses = (element: ReactElement): string[] =>
  classAttributes(element)[0];

const sorted = (classes: readonly string[]): string[] => [...classes].sort();

describe('Button', () => {
  it('is primary and medium when nothing is asked for', () => {
    expect(sorted(buttonClasses(<Button>Save</Button>))).toEqual(
      sorted([...EVERY_LOOK, ...KIND.primary, ...MEDIUM])
    );
  });

  it('is 44px high with 20px sides at size="large"', () => {
    expect(buttonClasses(<Button size="large">Save</Button>)).toEqual(
      expect.arrayContaining(['h-[44px]', 'px-[20px]', 'text-[14px]'])
    );
  });

  it('is 32px high with 12px sides and 13px text at size="small"', () => {
    const classes = buttonClasses(<Button size="small">Save</Button>);

    expect(classes).toEqual(
      expect.arrayContaining(['h-[32px]', 'px-[12px]', 'text-[13px]'])
    );
    expect(classes).not.toContain('text-[14px]');
  });

  it.each(Object.keys(KIND) as (keyof typeof KIND)[])(
    'draws exactly the %s classes',
    (variant) => {
      expect(
        sorted(buttonClasses(<Button variant={variant}>Save</Button>))
      ).toEqual(sorted([...EVERY_LOOK, ...KIND[variant], ...MEDIUM]));
    }
  );

  it('draws ghost with no border', () => {
    expect(buttonClasses(<Button variant="ghost">Save</Button>)).not.toContain(
      'border'
    );
  });

  it('draws the legacy secondary prop as the secondary kind', () => {
    expect(sorted(buttonClasses(<Button secondary>Save</Button>))).toEqual(
      sorted([...EVERY_LOOK, ...KIND.secondary, ...MEDIUM])
    );
  });

  it('lets variant win over the legacy secondary prop', () => {
    expect(
      sorted(
        buttonClasses(
          <Button secondary variant="ghost">
            Save
          </Button>
        )
      )
    ).toEqual(sorted([...EVERY_LOOK, ...KIND.ghost, ...MEDIUM]));
  });

  it('renders buttonClassName before the caller className', () => {
    expect(
      buttonClasses(
        <Button variant="danger" size="small" className="w-full">
          Delete
        </Button>
      )
    ).toEqual([
      ...buttonClassName({ variant: 'danger', size: 'small' }).split(' '),
      'w-full',
    ]);
    expect(buttonClasses(<Button>Save</Button>)).toEqual(
      buttonClassName().split(' ')
    );
  });

  it('spaces an icon 6px from its label in the label box', () => {
    const label = classAttributes(
      <Button innerClassName="extra">Save</Button>
    )[1];

    expect(label).toEqual(
      expect.arrayContaining([
        'flex-1',
        'items-center',
        'justify-center',
        'flex',
        'gap-[6px]',
        'extra',
      ])
    );
  });

  it('fades and blocks the pointer while disabled', () => {
    expect(buttonClasses(<Button disabled>Save</Button>)).toEqual(
      expect.arrayContaining(['opacity-50', 'pointer-events-none'])
    );
  });

  it('fades, blocks the pointer, shows the spinner and hides the label while loading', () => {
    const element = <Button loading>Save</Button>;
    const [button, spinnerBox, label] = classAttributes(element);

    expect(button).toEqual(
      expect.arrayContaining(['opacity-50', 'pointer-events-none'])
    );
    expect(spinnerBox).toEqual(expect.arrayContaining(['absolute', 'inset-0']));
    expect(label).toContain('invisible');
    expect(classAttributes(<Button>Save</Button>).flat()).not.toContain(
      'invisible'
    );
  });

  it('is type="button" unless told otherwise', () => {
    expect(renderToStaticMarkup(<Button>Save</Button>)).toContain(
      'type="button"'
    );
    expect(renderToStaticMarkup(<Button type="submit">Save</Button>)).toContain(
      'type="submit"'
    );
  });
});
