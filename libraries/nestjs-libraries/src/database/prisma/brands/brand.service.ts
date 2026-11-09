import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { pick, uniq } from 'lodash';
import { BrandRepository } from '@gitroom/nestjs-libraries/database/prisma/brands/brand.repository';
import {
  BrandKitDto,
  CreateBrandDto,
} from '@gitroom/nestjs-libraries/dtos/brands/brand.dto';

export type BrandImage = { id: string; path: string | null; missing: boolean };

export type Brand = {
  id: string;
  name: string;
  kit: {
    logo: BrandImage | null;
    examples: BrandImage[];
    colours: string[];
    headingFont: string | null;
    bodyFont: string | null;
  };
};

// The kit as image generation uses it: only the images still in Media
export type KitForImage = {
  name: string;
  logoId?: string;
  exampleIds: string[];
  colours: string[];
  headingFont?: string;
  bodyFont?: string;
};

type StoredBrand = Awaited<ReturnType<BrandRepository['findLive']>>;
type MediaRow = Awaited<ReturnType<BrandRepository['mediaByIds']>>[number];

// The global ValidationPipe keeps keys the DTO doesn't declare
const KIT_FIELDS = [
  'logoId',
  'exampleIds',
  'colours',
  'headingFont',
  'bodyFont',
] as const;

const imageIds = (kit: Pick<BrandKitDto, 'logoId' | 'exampleIds'> | null) =>
  [kit?.logoId, ...(kit?.exampleIds ?? [])].filter(Boolean);

// A row deleted from Media keeps its path; a row that's gone has none
const imageOf = (rows: MediaRow[], id: string): BrandImage => {
  const row = rows.find((media) => media.id === id);
  return { id, path: row?.path ?? null, missing: !row || !!row.deletedAt };
};

const toBrand = (
  { id, name, brandKit }: StoredBrand,
  rows: MediaRow[]
): Brand => ({
  id,
  name,
  kit: {
    logo: brandKit?.logoId ? imageOf(rows, brandKit.logoId) : null,
    examples: (brandKit?.exampleIds ?? []).map((exampleId) =>
      imageOf(rows, exampleId)
    ),
    colours: brandKit?.colours ?? [],
    headingFont: brandKit?.headingFont ?? null,
    bodyFont: brandKit?.bodyFont ?? null,
  },
});

// Names the field, as class-validator's refusals do
const notInMedia = (field: keyof BrandKitDto) =>
  new HttpException(
    `${field} must be in your Media library`,
    HttpStatus.NOT_FOUND
  );

@Injectable()
export class BrandService {
  constructor(private _brandRepository: BrandRepository) {}

  async list(org: string): Promise<Brand[]> {
    const brands = await this._brandRepository.list(org);
    const rows = await this.images(
      org,
      brands.flatMap(({ brandKit }) => imageIds(brandKit))
    );

    return brands.map((brand) => toBrand(brand, rows));
  }

  async create(org: string, { name, moveUngrouped }: CreateBrandDto) {
    if (await this._brandRepository.findLiveByName(org, name)) {
      throw new HttpException(
        'A brand with this name already exists',
        HttpStatus.BAD_REQUEST
      );
    }

    // Only the first brand takes the channels that are in no brand
    const move =
      !!moveUngrouped && (await this._brandRepository.countLive(org)) === 0;

    return this._brandRepository.create(org, name, move);
  }

  async remove(org: string, id: string) {
    await this.liveBrand(org, id);
    return this._brandRepository.softDelete(org, id);
  }

  async saveKit(org: string, id: string, body: BrandKitDto): Promise<Brand> {
    const brand = await this.liveBrand(org, id);
    const kit: BrandKitDto = pick(body, KIT_FIELDS);

    // One read for the images sent and the ones the kit keeps
    const rows = await this.images(org, [
      ...imageIds(kit),
      ...imageIds(brand.brandKit),
    ]);
    if (kit.logoId && imageOf(rows, kit.logoId).missing) {
      throw notInMedia('logoId');
    }
    if (kit.exampleIds?.some((exampleId) => imageOf(rows, exampleId).missing)) {
      throw notInMedia('exampleIds');
    }

    if (kit.colours) {
      kit.colours = kit.colours.map((colour) => colour.toUpperCase());
    }

    const saved = await this._brandRepository.upsertKit(id, kit);
    return toBrand({ ...brand, brandKit: saved }, rows);
  }

  // Runs before every image render with a brand: one brand, never the list
  async kitFor(org: string, brandId: string): Promise<KitForImage> {
    const brand = await this.liveBrand(
      org,
      brandId,
      'That brand no longer exists. Pick another or No brand.'
    );
    const { name, kit } = toBrand(
      brand,
      await this.images(org, imageIds(brand.brandKit))
    );

    return {
      name,
      logoId: kit.logo && !kit.logo.missing ? kit.logo.id : undefined,
      exampleIds: kit.examples
        .filter((example) => !example.missing)
        .map((example) => example.id),
      colours: kit.colours,
      headingFont: kit.headingFont ?? undefined,
      bodyFont: kit.bodyFont ?? undefined,
    };
  }

  private async liveBrand(
    org: string,
    id: string,
    notFound = 'Brand not found'
  ) {
    const brand = await this._brandRepository.findLive(org, id);
    if (!brand) {
      throw new HttpException(notFound, HttpStatus.NOT_FOUND);
    }

    return brand;
  }

  private async images(org: string, ids: string[]): Promise<MediaRow[]> {
    if (!ids.length) {
      return [];
    }

    return this._brandRepository.mediaByIds(org, uniq(ids));
  }
}
