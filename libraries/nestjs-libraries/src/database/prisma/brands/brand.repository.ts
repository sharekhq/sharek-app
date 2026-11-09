import {
  PrismaRepository,
  PrismaTransaction,
} from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import { BrandKitDto } from '@gitroom/nestjs-libraries/dtos/brands/brand.dto';

// A brand is a Customer, the group of channels; its kit is a BrandKit row.
const kitFields = {
  logoId: true,
  exampleIds: true,
  colours: true,
  headingFont: true,
  bodyFont: true,
} as const;

const brandFields = {
  id: true,
  name: true,
  brandKit: { select: kitFields },
} as const;

@Injectable()
export class BrandRepository {
  constructor(
    private _customer: PrismaRepository<'customer'>,
    private _brandKit: PrismaRepository<'brandKit'>,
    private _integration: PrismaRepository<'integration'>,
    private _media: PrismaRepository<'media'>,
    private _transaction: PrismaTransaction
  ) {}

  list(org: string) {
    return this._customer.model.customer.findMany({
      where: { orgId: org, deletedAt: null },
      orderBy: { name: 'asc' },
      select: brandFields,
    });
  }

  findLive(org: string, id: string) {
    return this._customer.model.customer.findFirst({
      where: { id, orgId: org, deletedAt: null },
      select: brandFields,
    });
  }

  // No deletedAt filter: an image deleted from Media shows as missing in the kit
  mediaByIds(org: string, ids: string[]) {
    return this._media.model.media.findMany({
      where: { organizationId: org, id: { in: ids } },
      select: { id: true, path: true, deletedAt: true, type: true },
    });
  }

  countLive(org: string) {
    return this._customer.model.customer.count({
      where: { orgId: org, deletedAt: null },
    });
  }

  findLiveByName(org: string, name: string) {
    return this._customer.model.customer.findFirst({
      where: { orgId: org, name, deletedAt: null },
      select: { id: true },
    });
  }

  create(org: string, name: string, moveUngrouped: boolean) {
    return this._transaction.model.$transaction(async (tx) => {
      const { id } = await tx.customer.create({
        data: { name, orgId: org },
        select: { id: true },
      });

      if (moveUngrouped) {
        await tx.integration.updateMany({
          where: { organizationId: org, customerId: null, deletedAt: null },
          data: { customerId: id },
        });
      }

      return { id };
    });
  }

  // The channels stay connected, in no brand; the kit's images stay in Media
  softDelete(org: string, id: string) {
    return this._transaction.model.$transaction(async (tx) => {
      const brand = await tx.customer.update({
        where: { id, orgId: org },
        data: { deletedAt: new Date() },
        select: { id: true },
      });

      await tx.integration.updateMany({
        where: { organizationId: org, customerId: id },
        data: { customerId: null },
      });

      await tx.brandKit.deleteMany({
        where: { customerId: id, customer: { orgId: org } },
      });

      return brand;
    });
  }

  // The lists are text[] with no default, so a new kit starts them empty, not
  // null. The caller has checked the brand is the asking organization's.
  upsertKit(customerId: string, kit: BrandKitDto) {
    return this._brandKit.model.brandKit.upsert({
      where: { customerId },
      update: kit,
      create: { customerId, exampleIds: [], colours: [], ...kit },
      select: kitFields,
    });
  }

  // An Integration row holds the channel's tokens, so only its brand is read
  async customerIdsOfChannels(org: string, ids: string[]) {
    const channels = await this._integration.model.integration.findMany({
      where: {
        organizationId: org,
        id: { in: ids },
        deletedAt: null,
        customerId: { not: null },
      },
      select: { customerId: true },
      distinct: ['customerId'],
    });

    return channels.map(({ customerId }) => customerId);
  }
}
