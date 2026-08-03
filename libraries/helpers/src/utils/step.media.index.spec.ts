import { stepMediaIndex } from './step.media.index';

describe('stepMediaIndex', () => {
  it('moves forward through the list', () => {
    expect(stepMediaIndex({ current: 2, total: 10, direction: 'next' })).toBe(
      3
    );
  });

  it('moves back through the list', () => {
    expect(
      stepMediaIndex({ current: 2, total: 10, direction: 'previous' })
    ).toBe(1);
  });

  it('clamps at the first item rather than wrapping', () => {
    expect(
      stepMediaIndex({ current: 0, total: 10, direction: 'previous' })
    ).toBe(0);
  });

  it('clamps at the last item rather than wrapping', () => {
    expect(stepMediaIndex({ current: 9, total: 10, direction: 'next' })).toBe(
      9
    );
  });

  it('reads a right press as forward when the interface is left-to-right', () => {
    expect(stepMediaIndex({ current: 2, total: 10, direction: 'right' })).toBe(
      3
    );
    expect(stepMediaIndex({ current: 2, total: 10, direction: 'left' })).toBe(1);
  });

  // The point of the helper: an unmirrored arrow is invisible in English and
  // steps the wrong way in Arabic.
  it('mirrors a physical press when the interface is right-to-left', () => {
    expect(
      stepMediaIndex({ current: 2, total: 10, direction: 'left', rtl: true })
    ).toBe(3);
    expect(
      stepMediaIndex({ current: 2, total: 10, direction: 'right', rtl: true })
    ).toBe(1);
  });

  it('leaves a logical direction alone in a right-to-left interface', () => {
    expect(
      stepMediaIndex({ current: 2, total: 10, direction: 'next', rtl: true })
    ).toBe(3);
    expect(
      stepMediaIndex({
        current: 2,
        total: 10,
        direction: 'previous',
        rtl: true,
      })
    ).toBe(1);
  });
});
