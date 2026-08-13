// Guards the composer's per-channel publish gate (feature 012-tiktok-ux-compliance).
//
// The gate is deliberately provider-agnostic: the store holds an integration id
// and an opaque, already-translated reason string, and knows nothing about the
// channel that raised it.
//
// The reset() case is the one that matters most. useLaunchStore is a
// module-level singleton and reset() merges initialState — so if
// publishBlockers were declared outside initialState, a stale blocker would
// survive the composer closing and disable publishing for *every* provider
// until a page reload.
import { useLaunchStore } from '@gitroom/frontend/components/new-launch/store';

const state = () => useLaunchStore.getState();

describe('publish blockers', () => {
  beforeEach(() => {
    state().reset();
  });

  it('starts with no blocker', () => {
    expect(state().publishBlockers).toStrictEqual({});
  });

  it('records a reason against the channel that raised it', () => {
    state().setPublishBlocker('int-1', 'TikTok (@sharek): pick an option');

    expect(state().publishBlockers).toStrictEqual({
      'int-1': 'TikTok (@sharek): pick an option',
    });
  });

  it('replaces the reason when the same channel raises a different one', () => {
    state().setPublishBlocker('int-1', 'TikTok (@sharek): pick an option');
    state().setPublishBlocker('int-1', 'TikTok (@sharek): video is too long');

    expect(state().publishBlockers).toStrictEqual({
      'int-1': 'TikTok (@sharek): video is too long',
    });
  });

  it('removes the key entirely when cleared, not just its value', () => {
    state().setPublishBlocker('int-1', 'TikTok (@sharek): pick an option');
    state().setPublishBlocker('int-1', undefined);

    // A key left behind holding undefined still counts as a blocked channel to
    // anything that reads Object.keys, which is how the footer decides whether
    // to disable publishing.
    expect(Object.keys(state().publishBlockers)).toEqual([]);
    expect(state().publishBlockers).toStrictEqual({});
  });

  it('blocks two channels independently', () => {
    state().setPublishBlocker('int-1', 'TikTok (@one): pick an option');
    state().setPublishBlocker('int-2', 'TikTok (@two): video is too long');

    expect(state().publishBlockers).toStrictEqual({
      'int-1': 'TikTok (@one): pick an option',
      'int-2': 'TikTok (@two): video is too long',
    });

    // Clearing one leaves the other standing.
    state().setPublishBlocker('int-1', undefined);

    expect(state().publishBlockers).toStrictEqual({
      'int-2': 'TikTok (@two): video is too long',
    });
  });

  it('clears every blocker on reset, so none survives the composer closing', () => {
    state().setPublishBlocker('int-1', 'TikTok (@one): pick an option');
    state().setPublishBlocker('int-2', 'TikTok (@two): video is too long');

    state().reset();

    expect(state().publishBlockers).toStrictEqual({});
  });

  it('clears a blocker raised after a reset, so reset does not detach the record', () => {
    // reset() merges a shared initialState object. If setPublishBlocker
    // mutated that object rather than replacing it, blockers would leak from
    // one composer session into the next.
    state().setPublishBlocker('int-1', 'TikTok (@one): pick an option');
    state().reset();
    state().setPublishBlocker('int-2', 'TikTok (@two): video is too long');
    state().reset();

    expect(state().publishBlockers).toStrictEqual({});
  });
});
