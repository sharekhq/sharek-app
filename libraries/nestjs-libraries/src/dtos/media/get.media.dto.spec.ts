// What the backend's global ValidationPipe({ transform: true }) runs on
// GET /public/v1/media's query.
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { GetMediaDto } from './get.media.dto';

const parse = async (query: Record<string, unknown>) => {
  const dto = plainToInstance(GetMediaDto, query);
  const failures = (await validate(dto)).map((error) => error.property).sort();
  return { dto, failures };
};

describe('GetMediaDto', () => {
  it('reads the first page when none is asked', async () => {
    const { dto, failures } = await parse({});

    expect(failures).toEqual([]);
    expect(dto.page).toBe(1);
  });

  it('reads the page from the query string as a number', async () => {
    const { dto, failures } = await parse({ page: '2' });

    expect(failures).toEqual([]);
    expect(dto.page).toBe(2);
  });

  // A refusal here is the 400 an API client reads, never a server error.
  it.each(['0', '-1', 'abc', ''])('refuses page %p', async (page) => {
    expect((await parse({ page })).failures).toEqual(['page']);
  });

  it('accepts a search by original filename', async () => {
    expect((await parse({ search: 'logo' })).failures).toEqual([]);
  });

  // ?search=a&search=b arrives as an array
  it('refuses a search given twice', async () => {
    expect((await parse({ search: ['a', 'b'] })).failures).toEqual(['search']);
  });
});
