import { HttpException } from '@nestjs/common';
import { generationError, isSafetyRejection } from './generation.error';

// Real bodies, not invented ones: fal wraps a provider content flag in a
// detail object whose type is content_policy_violation, while a parameter
// problem arrives as a pydantic-style detail list. The distinction is what
// keeps invalid-parameter 400s from being reported as safety violations.
const FAL_SAFETY_BODY =
  'fal ideogram/v4 returned no image: {"detail":{"type":"content_policy_violation","message":"The content could not be processed because it contained material flagged by a content checker"}}';
const FAL_VALIDATION_BODY =
  'fal ideogram/v4 returned no image: {"detail":[{"loc":["body","image_size"],"msg":"value is not a valid integer"}]}';

describe('isSafetyRejection', () => {
  it('recognises a fal content policy rejection', () => {
    expect(isSafetyRejection(new Error(FAL_SAFETY_BODY))).toBe(true);
  });

  it('recognises an OpenAI safety system message', () => {
    expect(
      isSafetyRejection(
        new Error(
          '400 Your request was rejected as a result of our safety system.'
        )
      )
    ).toBe(true);
  });

  it('does not flag a fal validation error', () => {
    expect(isSafetyRejection(new Error(FAL_VALIDATION_BODY))).toBe(false);
  });

  it('does not flag a plain failure', () => {
    expect(isSafetyRejection(new Error('socket hang up'))).toBe(false);
  });
});

describe('generationError', () => {
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => errorSpy.mockRestore());

  it('maps a provider safety rejection to a 422 with the safety message', () => {
    const mapped = generationError(new Error(FAL_SAFETY_BODY));
    expect(mapped.getStatus()).toBe(422);
    expect(mapped.message).toContain('rejected by the AI safety system');
  });

  it('maps anything else to a generic 500', () => {
    const mapped = generationError(new Error('socket hang up'));
    expect(mapped.getStatus()).toBe(500);
    expect(mapped.message).toContain('AI generation failed');
  });

  // The mapped exception is all the user sees and all the server used to keep:
  // the original body (which provider, which slide, what was flagged) was
  // discarded, leaving no trace to debug a rejection from.
  it('logs the original error before normalising it', () => {
    const original = new Error(FAL_SAFETY_BODY);
    generationError(original);
    expect(errorSpy).toHaveBeenCalledWith(expect.any(String), original);
  });

  it('passes an intentional HttpException through without logging', () => {
    const intentional = new HttpException('This video has no slides', 400);
    expect(generationError(intentional)).toBe(intentional);
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
