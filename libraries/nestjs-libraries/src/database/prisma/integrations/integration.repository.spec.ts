// The repository's constructor takes Prisma's model wrappers, and the real
// modules open a database client and a storage driver at import; only the
// query shape is under test (same pattern as media.repository.spec).
jest.mock('@gitroom/nestjs-libraries/database/prisma/prisma.service', () => ({
  PrismaRepository: class {},
}));
jest.mock('@gitroom/nestjs-libraries/upload/upload.factory', () => ({
  UploadFactory: { createStorage: () => ({}) },
}));

import { IntegrationRepository } from './integration.repository';

const makeRepository = (
  integration: Record<string, jest.Mock>,
  customer: Record<string, jest.Mock> = {}
) =>
  new IntegrationRepository(
    { model: { integration } } as unknown as ConstructorParameters<
      typeof IntegrationRepository
    >[0],
    {} as unknown as ConstructorParameters<typeof IntegrationRepository>[1],
    {} as unknown as ConstructorParameters<typeof IntegrationRepository>[2],
    {} as unknown as ConstructorParameters<typeof IntegrationRepository>[3],
    { model: { customer } } as unknown as ConstructorParameters<
      typeof IntegrationRepository
    >[4],
    {} as unknown as ConstructorParameters<typeof IntegrationRepository>[5]
  );

// An Integration row holds the channel's tokens, so a write answers
// with the id only (CLAUDE.md).
describe('IntegrationRepository.updateCustomName', () => {
  it('writes the trimmed name for the asking organization and returns only the id', async () => {
    const update = jest.fn().mockResolvedValue({ id: 'int-1' });

    await makeRepository({ update }).updateCustomName(
      'org-1',
      'int-1',
      '  My page  '
    );

    expect(update).toHaveBeenCalledWith({
      select: { id: true },
      where: { id: 'int-1', organizationId: 'org-1' },
      data: { customName: 'My page' },
    });
  });

  it('clears the custom name when the new name is blank', async () => {
    const update = jest.fn().mockResolvedValue({ id: 'int-1' });

    await makeRepository({ update }).updateCustomName('org-1', 'int-1', '   ');

    expect(update.mock.calls[0][0].data).toEqual({ customName: null });
  });
});

// Deleting is a write too: the web app and the public API hand its result back.
describe('IntegrationRepository.deleteChannel', () => {
  it("soft-deletes the asking organization's channel and returns only the id", async () => {
    const update = jest.fn().mockResolvedValue({ id: 'int-1' });

    await makeRepository({ update }).deleteChannel('org-1', 'int-1');

    expect(update).toHaveBeenCalledWith({
      select: { id: true },
      where: { id: 'int-1', organizationId: 'org-1' },
      data: { deletedAt: expect.any(Date) },
    });
  });
});

// Only the channels a lapsed plan disabled, never deleted ones.
describe('IntegrationRepository.enableAllIntegrations', () => {
  it("enables the organization's disabled, undeleted channels in one write", async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 2 });

    await makeRepository({ updateMany }).enableAllIntegrations('org-1');

    expect(updateMany).toHaveBeenCalledWith({
      where: { organizationId: 'org-1', disabled: true, deletedAt: null },
      data: { disabled: false },
    });
  });
});

// The channel menu's group, customer and avatar/nickname actions; any member
// of the team may call them, and the controllers hand the result back.
describe('IntegrationRepository.updateIntegrationGroup', () => {
  it("moves the asking organization's channel to the customer and returns only the id", async () => {
    const update = jest.fn().mockResolvedValue({ id: 'int-1' });

    await makeRepository({ update }).updateIntegrationGroup(
      'org-1',
      'int-1',
      'customer-1'
    );

    expect(update).toHaveBeenCalledWith({
      select: { id: true },
      where: { id: 'int-1', organizationId: 'org-1' },
      data: { customer: { connect: { id: 'customer-1' } } },
    });
  });
});

describe('IntegrationRepository.updateOnCustomerName', () => {
  it("takes the asking organization's channel off its customer and returns only the id", async () => {
    const update = jest.fn().mockResolvedValue({ id: 'int-1' });

    await makeRepository({ update }).updateOnCustomerName('org-1', 'int-1', '');

    expect(update).toHaveBeenCalledWith({
      select: { id: true },
      where: { id: 'int-1', organizationId: 'org-1' },
      data: { customer: { disconnect: true } },
    });
  });

  // A deleted brand keeps its name on a soft-deleted customer row, so saving
  // that name in the move dialog must start a new customer, never reconnect the
  // channel to the deleted one (feature 053-brands, R4).
  it('creates a new customer when the only one with the name was deleted', async () => {
    const findFirst = jest.fn(({ where }: { where: { deletedAt?: null } }) =>
      Promise.resolve(
        where.deletedAt === null ? null : { id: 'customer-deleted' }
      )
    );
    const create = jest.fn().mockResolvedValue({ id: 'customer-new' });
    const update = jest.fn().mockResolvedValue({ id: 'int-1' });

    await makeRepository(
      { update },
      { findFirst, create }
    ).updateOnCustomerName('org-1', 'int-1', 'Rawda');

    expect(create).toHaveBeenCalledWith({
      data: { name: 'Rawda', orgId: 'org-1' },
    });
    expect(update).toHaveBeenCalledWith({
      select: { id: true },
      where: { id: 'int-1', organizationId: 'org-1' },
      data: { customer: { connect: { id: 'customer-new' } } },
    });
  });
});

describe('IntegrationRepository.updateNameAndUrl', () => {
  it('writes the name and picture the network answered with and returns only the id', async () => {
    const update = jest.fn().mockResolvedValue({ id: 'int-1' });

    await makeRepository({ update }).updateNameAndUrl(
      'int-1',
      'Sharek Café',
      'https://media.sharek.app/int-1.png'
    );

    expect(update).toHaveBeenCalledWith({
      select: { id: true },
      where: { id: 'int-1' },
      data: {
        name: 'Sharek Café',
        picture: 'https://media.sharek.app/int-1.png',
      },
    });
  });
});

// The disconnect notice goes out only for the attempt this answers true to, so
// parallel failed refreshes of one channel notify once. The answer is that
// boolean, never the row with the channel's tokens (CLAUDE.md).
describe('IntegrationRepository.refreshNeeded', () => {
  it("flags the asking organization's channel only while the flag is still unset", async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });

    await makeRepository({ updateMany }).refreshNeeded('org-1', 'int-1');

    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'int-1', organizationId: 'org-1', refreshNeeded: false },
      data: { refreshNeeded: true },
    });
  });

  it('answers true to the attempt that flipped the flag, with no row', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });

    await expect(
      makeRepository({ updateMany }).refreshNeeded('org-1', 'int-1')
    ).resolves.toBe(true);
  });

  it('answers false to an attempt on a channel already flagged, with no row', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 0 });

    await expect(
      makeRepository({ updateMany }).refreshNeeded('org-1', 'int-1')
    ).resolves.toBe(false);
  });
});
