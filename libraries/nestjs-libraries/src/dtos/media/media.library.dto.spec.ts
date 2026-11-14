// What the backend's global ValidationPipe({ transform: true }) runs on the
// Media Library's requests: GET /media's query, GET /media/month's and
// /media/month/ids' query, and DELETE /media's body (contracts/media-api.md).
import { ClassConstructor, plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  DeleteMediaDto,
  MEDIA_DELETE_BATCH,
  MediaLibraryDto,
  MediaMonthDto,
} from './media.library.dto';

const parse = async <T extends object>(
  dto: ClassConstructor<T>,
  plain: Record<string, unknown>
) => {
  const instance = plainToInstance(dto, plain);
  const failures = (await validate(instance))
    .map((error) => error.property)
    .sort();
  return { dto: instance, failures };
};

const ids = (count: number) =>
  Array.from({ length: count }, (_, i) => `media-${i + 1}`);

describe('MediaLibraryDto', () => {
  const library = (query: Record<string, unknown>) =>
    parse(MediaLibraryDto, query);

  it('reads the first page when none is asked', async () => {
    const { dto, failures } = await library({});

    expect(failures).toEqual([]);
    expect(dto.page).toBe(1);
  });

  it('reads the page from the query string as a number', async () => {
    const { dto, failures } = await library({ page: '3' });

    expect(failures).toEqual([]);
    expect(dto.page).toBe(3);
  });

  it('refuses page 0', async () => {
    expect((await library({ page: '0' })).failures).toEqual(['page']);
  });

  it('accepts a search by original filename', async () => {
    expect((await library({ search: 'logo' })).failures).toEqual([]);
  });

  // ?search=a&search=b arrives as an array
  it('refuses a search given twice', async () => {
    expect((await library({ search: ['a', 'b'] })).failures).toEqual([
      'search',
    ]);
  });

  it.each(['image', 'image-static', 'video'])(
    'accepts type %p',
    async (type) => {
      expect((await library({ type })).failures).toEqual([]);
    }
  );

  it.each(['gif', 'IMAGE'])('refuses type %p', async (type) => {
    expect((await library({ type })).failures).toEqual(['type']);
  });

  it.each(['newest', 'oldest'])('accepts sort %p', async (sort) => {
    expect((await library({ sort })).failures).toEqual([]);
  });

  it('refuses sort "desc"', async () => {
    expect((await library({ sort: 'desc' })).failures).toEqual(['sort']);
  });
});

describe('MediaMonthDto', () => {
  // A month in the user's timezone, as the client sends it.
  const october = {
    from: '2026-10-01T04:00:00Z',
    to: '2026-11-01T04:00:00Z',
  };
  const month = (query: Record<string, unknown>) =>
    parse(MediaMonthDto, { ...october, ...query });

  it('accepts an ISO from and to', async () => {
    expect((await month({})).failures).toEqual([]);
  });

  it.each(['from', 'to'])('refuses a missing %s', async (field) => {
    expect((await month({ [field]: undefined })).failures).toEqual([field]);
  });

  it.each(['from', 'to'])('refuses a %s that is not a date', async (field) => {
    expect((await month({ [field]: 'october' })).failures).toEqual([field]);
  });

  it('accepts a search by original filename', async () => {
    expect((await month({ search: 'logo' })).failures).toEqual([]);
  });

  it('refuses a search given twice', async () => {
    expect((await month({ search: ['a', 'b'] })).failures).toEqual(['search']);
  });

  it.each(['image', 'image-static', 'video'])(
    'accepts type %p',
    async (type) => {
      expect((await month({ type })).failures).toEqual([]);
    }
  );

  it.each(['gif', 'IMAGE'])('refuses type %p', async (type) => {
    expect((await month({ type })).failures).toEqual(['type']);
  });
});

describe('DeleteMediaDto', () => {
  const deleting = (body: Record<string, unknown>) =>
    parse(DeleteMediaDto, body);

  // The client sends a larger selection in batches of this size.
  it('caps a batch at 500 ids', () => {
    expect(MEDIA_DELETE_BATCH).toBe(500);
  });

  it.each([1, 500])('accepts %p string ids', async (count) => {
    expect((await deleting({ ids: ids(count) })).failures).toEqual([]);
  });

  it.each([
    ['no ids', { ids: null }],
    ['an empty list', { ids: [] }],
    ['501 ids', { ids: ids(501) }],
    ['a number among the ids', { ids: ['media-1', 2] }],
    ['a body without ids', {}],
  ])('refuses %s', async (_, body) => {
    expect((await deleting(body)).failures).toEqual(['ids']);
  });
});
