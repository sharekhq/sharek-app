// Compose's narrow layout is shape A (specs/017-compose-viewport, approved
// 2026-08-20): below `mobile` a segmented control swaps the single pane between
// Editor, Settings and Preview, instead of the two panes that need 769px.
//
// The view is store state, beside `tab` and `current` which are already the
// composer's view state — so it is tested here directly, with no mocks, the way
// store.publish.blockers.spec.tsx tests its slice. Rendering AddEditModal to
// reach it would mean stubbing 31 modules including CopilotKit and the editor,
// which tests the stubs.
//
// What this file does NOT cover, deliberately: that the panes are hidden with a
// class rather than unmounted. That is a DOM fact, not a state fact, and it is
// asserted against the deployed build at T060. The state guarantee below — that
// switching the view touches nothing the editor reads — is the half that can be
// proven here, and it is the half that would silently break.
import { useLaunchStore } from '@gitroom/frontend/components/new-launch/store';
import { PHONE_QUERY } from '@gitroom/react/helpers/use.media.query';

// The Tailwind config is CommonJS — PostCSS consumes it directly — so this is
// the only way to read the screens the component's classes resolve against.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const tailwind = require('../../../tailwind.config.cjs');

const state = () => useLaunchStore.getState();

describe('compose narrow view', () => {
  beforeEach(() => {
    state().reset();
  });

  it('opens on the editor', () => {
    expect(state().narrowView).toBe('editor');
  });

  it('records the view it was switched to', () => {
    state().setNarrowView('preview');

    expect(state().narrowView).toBe('preview');
  });

  // The publish-blockers lesson, applied: reset() merges initialState, so a
  // view declared anywhere else would outlive the composer and reopen it on
  // whichever pane the last post was left on.
  it('returns to the editor when the composer resets', () => {
    state().setNarrowView('settings');
    state().reset();

    expect(state().narrowView).toBe('editor');
  });

  // C6. The editor reads content out of `global`, `internal` and `current`; if a
  // view switch touched any of them, typed content would move or vanish on a tap
  // that is supposed to be a layout change.
  it('leaves everything the editor reads untouched', () => {
    state().setCurrent('int-1');
    state().setGlobalValue([
      { id: 'v1', content: 'a draft', delay: 0, media: [] },
    ] as never);
    const before = {
      current: state().current,
      global: state().global,
      internal: state().internal,
      tags: state().tags,
      tab: state().tab,
    };

    state().setNarrowView('preview');
    state().setNarrowView('settings');
    state().setNarrowView('editor');

    expect(state().current).toBe(before.current);
    expect(state().global).toStrictEqual(before.global);
    expect(state().internal).toStrictEqual(before.internal);
    expect(state().tags).toStrictEqual(before.tags);
    expect(state().tab).toBe(before.tab);
  });

  // `showSettings` is local to manage.modal.tsx and swaps the editor pane
  // between the content view and the per-channel settings view. The narrow
  // layout adds a third value to that idea rather than replacing it, so the
  // store must not have absorbed it.
  it('does not take over showSettings', () => {
    expect(state()).not.toHaveProperty('showSettings');
  });
});

// FR-007's threshold is `mobile` (≤1025), moved there from `phone` in Phase 2
// once compose-with-existing-data measured 891 and fitted at none of 769, 810
// or 820.
//
// **There is no JavaScript mirror of it, and that is the design.** Which pane
// compose shows depends on the view *and* on being narrow, and those compose in
// CSS: `clsx(narrowView === 'preview' && 'mobile:hidden')`. At 1026 and above
// both panes render whatever the view says, so C3 holds by construction rather
// than by a guard — and there is no first-render flash, which a `useMediaQuery`
// swap would have (it returns false on the server and on the first client
// render by design). A `MOBILE_QUERY` constant was written here and removed:
// nothing read it, and an unused export is the dead code Principle I forbids.
//
// PHONE_QUERY is different — it is read by four components, so the drift its own
// comment warns about is a live risk and this pins it.
describe('the phone query mirrors Tailwind', () => {
  it('PHONE_QUERY matches the phone screen', () => {
    expect(PHONE_QUERY).toBe(tailwind.theme.extend.screens.phone.raw);
  });

  it('the mobile screen is the wider band the narrow layout uses', () => {
    const width = (q: string) => Number(/(\d+)/.exec(q)?.[1]);
    const screens = tailwind.theme.extend.screens;

    expect(width(screens.mobile.raw)).toBeGreaterThan(width(screens.phone.raw));
  });
});
