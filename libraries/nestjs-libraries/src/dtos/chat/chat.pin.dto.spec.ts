// What the backend's global ValidationPipe({ transform: true }) runs on PUT /copilot/:thread/pin's body.
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ChatPinDto } from './chat.pin.dto';

const failures = async (body: Record<string, unknown>) =>
  (await validate(plainToInstance(ChatPinDto, body))).map(
    (error) => error.property
  );

describe('ChatPinDto', () => {
  it.each([true, false])('accepts %p', async (pinned) => {
    expect(await failures({ pinned })).toEqual([]);
  });

  // The pipe converts nothing implicitly, so a string or a number stays one.
  it.each([
    ['a missing value', {}],
    ['the string "true"', { pinned: 'true' }],
    ['1', { pinned: 1 }],
  ])('refuses %s', async (_name, body) => {
    expect(await failures(body)).toEqual(['pinned']);
  });
});
