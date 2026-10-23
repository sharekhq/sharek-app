// What the backend's global ValidationPipe({ transform: true }) runs on POST /user/timezone's body.
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { TimezoneDto } from './timezone.dto';

const failures = async (body: Record<string, unknown>) =>
  (await validate(plainToInstance(TimezoneDto, body))).map(
    (error) => error.property
  );

describe('TimezoneDto', () => {
  it.each(['Asia/Dubai', 'Asia/Riyadh', 'Africa/Cairo', 'UTC'])(
    'accepts %s',
    async (timezoneName) => {
      expect(await failures({ timezoneName })).toEqual([]);
    }
  );

  // The settings screen sends null for Automatic.
  it.each([
    ['null', { timezoneName: null }],
    ['no zone', {}],
  ])('accepts %s as Automatic', async (_name, body) => {
    expect(await failures(body)).toEqual([]);
  });

  // A refusal is the 400 the settings screen turns into its failure message.
  it.each(['Mars/Olympus', 'not a zone', ''])(
    'refuses %p',
    async (timezoneName) => {
      expect(await failures({ timezoneName })).toEqual(['timezoneName']);
    }
  );
});
