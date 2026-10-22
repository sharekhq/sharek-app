// Guards the composer's per-channel dates: a post saved for several channels
// keeps each channel's own date when it is opened again.
//
// useLaunchStore is a module-level singleton and reset() merges initialState,
// so channelDates must live inside initialState: declared anywhere else, the
// dates of one post would survive the composer closing and be offered to the
// next post opened.
import dayjs from 'dayjs';
import { useLaunchStore } from '@gitroom/frontend/components/new-launch/store';

const state = () => useLaunchStore.getState();

describe('channel dates', () => {
  beforeEach(() => {
    state().reset();
  });

  it('starts with no date of its own for any channel', () => {
    expect(state().channelDates).toStrictEqual({});
  });

  it('records a date against its channel without touching the others', () => {
    const morning = dayjs('2026-11-02T09:00:00');
    const evening = dayjs('2026-11-03T18:30:00');

    state().setChannelDate('int-1', morning);
    state().setChannelDate('int-2', evening);
    state().setChannelDate('int-1', evening);

    expect(Object.keys(state().channelDates).sort()).toEqual(['int-1', 'int-2']);
    expect(state().channelDates['int-1'].isSame(evening)).toBe(true);
    expect(state().channelDates['int-2'].isSame(evening)).toBe(true);
  });

  it('clears every channel date on reset, so none survives the composer closing', () => {
    state().setChannelDate('int-1', dayjs('2026-11-02T09:00:00'));

    state().reset();

    expect(state().channelDates).toStrictEqual({});
  });
});
