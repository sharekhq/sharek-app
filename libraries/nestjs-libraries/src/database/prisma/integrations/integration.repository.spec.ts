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

const makeRepository = (integration: Record<string, jest.Mock>) =>
  new IntegrationRepository(
    { model: { integration } } as unknown as ConstructorParameters<
      typeof IntegrationRepository
    >[0],
    {} as unknown as ConstructorParameters<typeof IntegrationRepository>[1],
    {} as unknown as ConstructorParameters<typeof IntegrationRepository>[2],
    {} as unknown as ConstructorParameters<typeof IntegrationRepository>[3],
    {} as unknown as ConstructorParameters<typeof IntegrationRepository>[4],
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
