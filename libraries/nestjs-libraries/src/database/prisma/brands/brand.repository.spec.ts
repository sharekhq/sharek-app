// The repository's constructor takes Prisma's model wrappers, and the real
// module opens a database client at import; only the query shape is under
// test (same pattern as integration.repository.spec).
jest.mock('@gitroom/nestjs-libraries/database/prisma/prisma.service', () => ({
  PrismaRepository: class {},
  PrismaTransaction: class {},
}));

import { BrandRepository } from './brand.repository';

type Deps = ConstructorParameters<typeof BrandRepository>;
type Models = Record<string, Record<string, jest.Mock>>;

// A transaction hands its callback the models it runs on, so a write that
// must be atomic is one whose queries all go through `tx`.
const repositoryWith = (models: Models, tx: Models = {}) => {
  const $transaction = jest.fn((run: (client: Models) => unknown) => run(tx));
  const repository = new BrandRepository(
    { model: { customer: models.customer } } as unknown as Deps[0],
    { model: { brandKit: models.brandKit } } as unknown as Deps[1],
    { model: { integration: models.integration } } as unknown as Deps[2],
    { model: { media: models.media } } as unknown as Deps[3],
    { model: { $transaction } } as unknown as Deps[4]
  );

  return { repository, $transaction };
};

const kitFields = {
  logoId: true,
  exampleIds: true,
  colours: true,
  headingFont: true,
  bodyFont: true,
};

describe('BrandRepository.list', () => {
  it("reads the asking organization's live brands A to Z, each with its kit's fields only", async () => {
    const findMany = jest.fn().mockResolvedValue([]);

    await repositoryWith({ customer: { findMany } }).repository.list('org-1');

    expect(findMany).toHaveBeenCalledWith({
      where: { orgId: 'org-1', deletedAt: null },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, brandKit: { select: kitFields } },
    });
  });
});

// A delete, a kit save and every image render read one brand: never the list.
describe('BrandRepository.findLive', () => {
  it("reads one of the asking organization's live brands by id, with its name and its kit's fields only", async () => {
    const findFirst = jest.fn().mockResolvedValue(null);

    await repositoryWith({ customer: { findFirst } }).repository.findLive(
      'org-1',
      'brand-1'
    );

    expect(findFirst).toHaveBeenCalledWith({
      where: { id: 'brand-1', orgId: 'org-1', deletedAt: null },
      select: { id: true, name: true, brandKit: { select: kitFields } },
    });
  });
});

// The kit keeps an image the user later deleted from Media, so the read has no
// deletedAt filter: the service marks that image missing (FR-012).
describe('BrandRepository.mediaByIds', () => {
  it("reads the asking organization's rows by id, deleted ones too, with only their id, path and deletion", async () => {
    const findMany = jest.fn().mockResolvedValue([]);

    await repositoryWith({ media: { findMany } }).repository.mediaByIds(
      'org-1',
      ['media-1', 'media-2']
    );

    expect(findMany).toHaveBeenCalledWith({
      where: { organizationId: 'org-1', id: { in: ['media-1', 'media-2'] } },
      select: { id: true, path: true, deletedAt: true },
    });
  });
});

describe('BrandRepository.countLive', () => {
  it("counts the asking organization's live brands", async () => {
    const count = jest.fn().mockResolvedValue(2);

    await expect(
      repositoryWith({ customer: { count } }).repository.countLive('org-1')
    ).resolves.toBe(2);
    expect(count).toHaveBeenCalledWith({
      where: { orgId: 'org-1', deletedAt: null },
    });
  });
});

describe('BrandRepository.create', () => {
  it('creates the brand for the asking organization and returns only its id', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'brand-1' });
    const updateMany = jest.fn();
    const { repository, $transaction } = repositoryWith(
      {},
      { customer: { create }, integration: { updateMany } }
    );

    await expect(repository.create('org-1', 'Rawda', false)).resolves.toEqual({
      id: 'brand-1',
    });
    expect($transaction).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith({
      data: { name: 'Rawda', orgId: 'org-1' },
      select: { id: true },
    });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('moves every live channel of the organization with no brand into it, in the same transaction, when asked', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'brand-1' });
    const updateMany = jest.fn().mockResolvedValue({ count: 3 });
    const { repository, $transaction } = repositoryWith(
      {},
      { customer: { create }, integration: { updateMany } }
    );

    await expect(repository.create('org-1', 'Rawda', true)).resolves.toEqual({
      id: 'brand-1',
    });
    expect($transaction).toHaveBeenCalledTimes(1);
    expect(updateMany).toHaveBeenCalledWith({
      where: { organizationId: 'org-1', customerId: null, deletedAt: null },
      data: { customerId: 'brand-1' },
    });
  });
});

// Deleting a brand leaves its channels connected and its images in Media; the
// channels go to No brand and the kit goes with the brand (R4).
describe('BrandRepository.softDelete', () => {
  it("marks the asking organization's brand deleted, takes its channels out and deletes its kit, in one transaction", async () => {
    const update = jest.fn().mockResolvedValue({ id: 'brand-1' });
    const updateMany = jest.fn().mockResolvedValue({ count: 2 });
    const deleteMany = jest.fn().mockResolvedValue({ count: 1 });
    const { repository, $transaction } = repositoryWith(
      {},
      {
        customer: { update },
        integration: { updateMany },
        brandKit: { deleteMany },
      }
    );

    await expect(repository.softDelete('org-1', 'brand-1')).resolves.toEqual({
      id: 'brand-1',
    });
    expect($transaction).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith({
      where: { id: 'brand-1', orgId: 'org-1' },
      data: { deletedAt: expect.any(Date) },
      select: { id: true },
    });
    expect(updateMany).toHaveBeenCalledWith({
      where: { organizationId: 'org-1', customerId: 'brand-1' },
      data: { customerId: null },
    });
    expect(deleteMany).toHaveBeenCalledWith({
      where: { customerId: 'brand-1', customer: { orgId: 'org-1' } },
    });
  });
});

// Only the fields sent change; the service has checked the brand is the asking
// organization's before it gets here.
describe('BrandRepository.upsertKit', () => {
  it("changes only the fields sent, starts a new kit's lists empty, and returns the kit's fields only", async () => {
    const upsert = jest.fn().mockResolvedValue({});

    await repositoryWith({ brandKit: { upsert } }).repository.upsertKit(
      'brand-1',
      { colours: ['#B5542C'] }
    );

    expect(upsert).toHaveBeenCalledWith({
      where: { customerId: 'brand-1' },
      update: { colours: ['#B5542C'] },
      create: { customerId: 'brand-1', exampleIds: [], colours: ['#B5542C'] },
      select: kitFields,
    });
  });
});

// Samy's selected channels come from the browser, so their brands are read
// back from the database (R9). An Integration row holds the channel's tokens:
// only the customer id leaves this query (CLAUDE.md).
describe('BrandRepository.customerIdsOfChannels', () => {
  it("reads the brands of the asking organization's live channels by id, each once, without channels in no brand", async () => {
    const findMany = jest
      .fn()
      .mockResolvedValue([
        { customerId: 'brand-1' },
        { customerId: 'brand-2' },
      ]);

    await expect(
      repositoryWith({
        integration: { findMany },
      }).repository.customerIdsOfChannels('org-1', ['int-1', 'int-2', 'int-3'])
    ).resolves.toEqual(['brand-1', 'brand-2']);
    expect(findMany).toHaveBeenCalledWith({
      where: {
        organizationId: 'org-1',
        id: { in: ['int-1', 'int-2', 'int-3'] },
        deletedAt: null,
        customerId: { not: null },
      },
      select: { customerId: true },
      distinct: ['customerId'],
    });
  });
});

// A deleted brand's name is free again (R4).
describe('BrandRepository.findLiveByName', () => {
  it("looks the name up among the asking organization's live brands and returns only the id", async () => {
    const findFirst = jest.fn().mockResolvedValue(null);

    await repositoryWith({ customer: { findFirst } }).repository.findLiveByName(
      'org-1',
      'Rawda'
    );

    expect(findFirst).toHaveBeenCalledWith({
      where: { orgId: 'org-1', name: 'Rawda', deletedAt: null },
      select: { id: true },
    });
  });
});
