import { renderToStaticMarkup } from 'react-dom/server';
import dayjs from 'dayjs';

// react-i18next suspends during a static render (no initialized backend here), and the label
// is not what this spec asserts — stub it down to its fallback text.
jest.mock('../translation/translated-label', () => ({
  TranslatedLabel: (props: { label: string }) => props.label,
}));
// The post picker behind the icon opens a modal; only the field is asserted here.
jest.mock(
  '../../../../apps/frontend/src/components/post-url-selector/post.url.selector',
  () => ({ useShowPostSelector: () => async () => '' })
);

import { Canonical } from './canonical';

// The canonical link field in the dev.to, Hashnode, Medium and Reddit settings. It declares
// no size, so it took the settings pane's 14px. 044 T071 F-2: under 16px, iOS Safari zooms the
// page when a field takes the focus and leaves it zoomed.
describe('Canonical under a finger', () => {
  it('types at 16px on a touch screen and keeps the size around it with a mouse', () => {
    const markup = renderToStaticMarkup(
      <Canonical
        label="Canonical Link"
        name="canonical"
        date={dayjs()}
        disableForm={true}
        value=""
        onChange={() => {
          /* controlled by the caller */
        }}
      />
    );
    const field = [...markup.matchAll(/<input[^>]*class="([^"]*)"/g)].map((m) =>
      m[1].split(/\s+/)
    );

    expect(field).toHaveLength(1);
    expect(field[0]).toContain('coarse:text-[16px]');
    expect(field[0].filter((c) => /^text-\[\d+px\]$/.test(c))).toEqual([]);
  });
});
