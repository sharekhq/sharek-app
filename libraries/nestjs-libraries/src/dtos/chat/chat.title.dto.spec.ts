// What the backend's global ValidationPipe({ transform: true }) runs on PUT /copilot/:thread/title's body.
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ChatTitleDto } from './chat.title.dto';

const failures = async (body: Record<string, unknown>) =>
  (await validate(plainToInstance(ChatTitleDto, body))).map(
    (error) => error.property
  );

describe('ChatTitleDto', () => {
  // The trim runs before the length is measured, so spaces around a title
  // don't count towards its 100 characters.
  it.each([
    ['one character', 'P'],
    ['a title', 'Cold brew launch plan'],
    ['100 characters', 'a'.repeat(100)],
    ['100 characters inside spaces', `  ${'a'.repeat(100)}  `],
  ])('accepts %s', async (_name, title) => {
    expect(await failures({ title })).toEqual([]);
  });

  it('trims the title', () => {
    expect(
      plainToInstance(ChatTitleDto, { title: '  Cold brew launch plan \n' })
        .title
    ).toBe('Cold brew launch plan');
  });

  // A refusal is a 400. The Samy page sends none of these, so it guards other callers.
  it.each([
    ['a missing title', {}],
    ['null', { title: null }],
    ['a number', { title: 42 }],
    ['an empty title', { title: '' }],
    ['a whitespace-only title', { title: '   ' }],
    ['101 characters', { title: 'a'.repeat(101) }],
  ])('refuses %s', async (_name, body) => {
    expect(await failures(body)).toEqual(['title']);
  });
});
