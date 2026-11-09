import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { pick, uniq } from 'lodash';
import {
  BrandRepository,
  kitFields,
} from '@gitroom/nestjs-libraries/database/prisma/brands/brand.repository';
import {
  BrandKitDto,
  CreateBrandDto,
} from '@gitroom/nestjs-libraries/dtos/brands/brand.dto';
import { ImageBrandRefusal } from '@gitroom/nestjs-libraries/dtos/media/image.generation.catalog';

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

// The kit as image generation uses it: only the images still in Media, each
// example with its number on the Brands page, a missing one counted
export type KitForImage = {
  name: string;
  logoId?: string;
  examples: { id: string; n: number }[];
  colours: string[];
  headingFont?: string;
  bodyFont?: string;
};

// Samy's brand for one image: a brand's id, none for no kit, or words for Samy
export type SamyBrand = { brandId?: string } | { error: string };

type StoredBrand = Awaited<ReturnType<BrandRepository['findLive']>>;
type MediaRow = Awaited<ReturnType<BrandRepository['mediaByIds']>>[number];

// The global ValidationPipe keeps keys the DTO doesn't declare
const KIT_FIELDS = Object.keys(kitFields) as (keyof typeof kitFields)[];

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

type Named = { id: string; name: string };

const namesOf = (brands: Named[]) => brands.map(({ name }) => name).join(', ');

// The model may change a name's case; the exact name wins over another case
const brandNamed = (brands: Named[], wanted: string) => {
  const sameName = brands.filter(
    ({ name }) => name.toLowerCase() === wanted.toLowerCase()
  );
  return (
    sameName.find(({ name }) => name === wanted) ??
    (sameName.length === 1 ? sameName[0] : undefined)
  );
};

// Names the field, as class-validator's refusals do
const notInMedia = (field: keyof BrandKitDto) =>
  new HttpException(
    `${field} must be in your Media library`,
    HttpStatus.NOT_FOUND
  );
// The item is there, so a bad request rather than a missing one
const notAnImage = (field: keyof BrandKitDto) =>
  new HttpException(`${field} must be an image`, HttpStatus.BAD_REQUEST);

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
    const kept = imageIds(brand.brandKit);
    const rows = await this.images(org, [...imageIds(kit), ...kept]);

    // An image already in the kit may be missing, so replacing one missing
    // image keeps the others (FR-012); a new one must be in the org's Media,
    // and be an image, since Media holds videos too
    const added = (imageId: string) => !kept.includes(imageId);
    const refused = (imageId: string) =>
      added(imageId) && imageOf(rows, imageId).missing;
    const otherType = (imageId: string) =>
      added(imageId) &&
      rows.find((media) => media.id === imageId)?.type !== 'image';
    if (kit.logoId && refused(kit.logoId)) {
      throw notInMedia('logoId');
    }
    if (kit.exampleIds?.some(refused)) {
      throw notInMedia('exampleIds');
    }
    if (kit.logoId && otherType(kit.logoId)) {
      throw notAnImage('logoId');
    }
    if (kit.exampleIds?.some(otherType)) {
      throw notAnImage('exampleIds');
    }

    if (kit.colours) {
      kit.colours = kit.colours.map((colour) => colour.toUpperCase());
    }

    const saved = await this._brandRepository.upsertKit(id, kit);
    return toBrand({ ...brand, brandKit: saved }, rows);
  }

  // Runs before every image render with a brand: one brand, never the list.
  // A deleted one is refused with a code the AI image dialog says in its own
  // words; Samy reads the message
  async kitFor(org: string, brandId: string): Promise<KitForImage> {
    const brand = await this.liveBrand(org, brandId, {
      message: 'That brand no longer exists. Pick another or No brand.',
      code: 'brand_missing',
    });
    const { name, kit } = toBrand(
      brand,
      await this.images(org, imageIds(brand.brandKit))
    );

    return {
      name,
      logoId: kit.logo && !kit.logo.missing ? kit.logo.id : undefined,
      examples: kit.examples.flatMap((example, position) =>
        example.missing ? [] : [{ id: example.id, n: position + 1 }]
      ),
      colours: kit.colours,
      headingFont: kit.headingFont ?? undefined,
      bodyFont: kit.bodyFont ?? undefined,
    };
  }

  // The brand chip's choice, checked before every Samy run (R14)
  async isLive(org: string, id: string) {
    return !!(await this._brandRepository.findLive(org, id));
  }

  // FR-017's order (R8). Names, not ids, because they are what the user sees
  // and Samy says back; a refusal makes no image and spends no credit.
  async resolveForSamy(
    org: string,
    {
      chip,
      input,
      channelIds,
    }: { chip?: string; input?: string; channelIds: string[] }
  ): Promise<SamyBrand> {
    // The brand chip's choice comes first. The copilot controller keeps only
    // none, each or a live brand of the organization (R14), so a brand id is
    // taken as it is, and each leaves the brand to the steps below.
    if (chip === 'none') {
      return {};
    }
    if (chip && chip !== 'each') {
      return { brandId: chip };
    }

    // In any case, as brandNamed matches a name
    const wanted = input?.trim();
    if (wanted?.toLowerCase() === 'none') {
      return {};
    }

    // An organization with no brands goes without a kit, as today
    const brands = await this._brandRepository.list(org);
    if (!brands.length) {
      return {};
    }
    const names = namesOf(brands);

    if (wanted) {
      const brand = brandNamed(brands, wanted);
      return brand
        ? { brandId: brand.id }
        : {
            error: `There's no brand called "${wanted}". The brands are: ${names}. Ask the user which one, or none.`,
          };
    }

    // Channels in no brand never count, so ticked channels that are all in
    // no brand go without a kit (FR-017)
    if (channelIds.length) {
      const ids = await this._brandRepository.customerIdsOfChannels(
        org,
        channelIds
      );
      const theirs = brands.filter(({ id }) => ids.includes(id));
      if (theirs.length > 1) {
        const theirNames = namesOf(theirs);
        return {
          error: `The selected channels belong to ${theirs.length} brands: ${theirNames}. Tell the user you'll make one image per brand, each in its own look, at one credit each, and wait for a yes. Then call once per brand with brand set to its name.`,
        };
      }

      return { brandId: theirs[0]?.id };
    }

    if (brands.length > 1) {
      return {
        error: `This workspace has ${brands.length} brands: ${names}. Ask the user which brand this image is for, or none, and keep their answer for the rest of the chat.`,
      };
    }

    return { brandId: brands[0].id };
  }

  private async liveBrand(
    org: string,
    id: string,
    notFound:
      | string
      | { message: string; code: ImageBrandRefusal } = 'Brand not found'
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
