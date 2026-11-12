import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { pick, pickBy, uniq } from 'lodash';
import {
  BrandRepository,
  detailFields,
  kitFields,
} from '@gitroom/nestjs-libraries/database/prisma/brands/brand.repository';
import {
  BrandKitDto,
  CreateBrandDto,
  EACH_BRAND,
  NO_BRAND,
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
  details: {
    about: string | null;
    toneOfVoice: string | null;
    postLanguage: string | null;
    callToAction: string | null;
    hashtags: string | null;
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

// No one brand in use: none, the selected channels' brands, the workspace's
// brands with none picked, or a name that matches none of them
type NoBrandInUse =
  | { none: true }
  | { several: string[] }
  | { ask: string[] }
  | { unknown: string; brands: string[] };

// What Samy is told about the brand in use: only the kit's images still in
// Media, each example with its number on the Brands page, and only the details
// that are set
export type SamyBrandSummary =
  | {
      name: string;
      logo?: { path: string };
      examples: { n: number; path: string }[];
      colours: string[];
      headingFont?: string;
      bodyFont?: string;
      details: Partial<Record<keyof Brand['details'], string>>;
    }
  | NoBrandInUse;

type SamyBrandRequest = { chip?: string; input?: string; channelIds: string[] };

type StoredBrand = Awaited<ReturnType<BrandRepository['findLive']>>;
type MediaRow = Awaited<ReturnType<BrandRepository['mediaByIds']>>[number];

// The brand in use, as data: the list's row, so it isn't read again, or why
// there's no one brand
type BrandPick = { brand: StoredBrand } | NoBrandInUse;

// The global ValidationPipe keeps keys the DTO doesn't declare
const KIT_FIELDS = Object.keys({ ...kitFields, ...detailFields }) as (
  | keyof typeof kitFields
  | keyof typeof detailFields
)[];

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
  details: {
    about: brandKit?.about ?? null,
    toneOfVoice: brandKit?.toneOfVoice ?? null,
    postLanguage: brandKit?.postLanguage ?? null,
    callToAction: brandKit?.callToAction ?? null,
    hashtags: brandKit?.hashtags ?? null,
  },
});

// The examples still in Media, each with its number on the Brands page, a
// missing one counted
const liveExamples = (kit: Brand['kit']) =>
  kit.examples.flatMap((example, position) =>
    example.missing ? [] : [{ ...example, n: position + 1 }]
  );

type Named = { id: string; name: string };

const namesOf = (brands: Named[]) => brands.map(({ name }) => name);

// The model may change a name's case; the exact name wins over another case
const brandNamed = <T extends Named>(brands: T[], wanted: string) => {
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

  async get(org: string, id: string): Promise<Brand> {
    const brand = await this.liveBrand(org, id);
    return toBrand(brand, await this.images(org, imageIds(brand.brandKit)));
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
      examples: liveExamples(kit).map(({ id, n }) => ({ id, n })),
      colours: kit.colours,
      headingFont: kit.headingFont ?? undefined,
      bodyFont: kit.bodyFont ?? undefined,
    };
  }

  // FR-017's order (R8). Names, not ids, because they are what the user sees
  // and Samy says back; a refusal makes no image and spends no credit.
  async resolveForSamy(
    org: string,
    request: SamyBrandRequest
  ): Promise<SamyBrand> {
    const pick = await this.pickBrand(org, request);
    if ('brand' in pick) {
      return { brandId: pick.brand.id };
    }
    if ('unknown' in pick) {
      const names = pick.brands.join(', ');
      return {
        error: `There's no brand called "${pick.unknown}". The brands are: ${names}. Ask the user which one, or none.`,
      };
    }
    if ('several' in pick) {
      const names = pick.several.join(', ');
      return {
        error: `The selected channels belong to ${pick.several.length} brands: ${names}. Tell the user you'll make one image per brand, each in its own look, at one credit each, and wait for a yes. Then call once per brand with brand set to its name.`,
      };
    }
    if ('ask' in pick) {
      const names = pick.ask.join(', ');
      return {
        error: `This workspace has ${pick.ask.length} brands: ${names}. Ask the user which brand this image is for, or none, and keep their answer for the rest of the chat.`,
      };
    }

    return {};
  }

  // What Samy is told about the brand in use, in every turn's brand block and
  // by brandKitTool (FR-008, FR-014), picked as resolveForSamy picks it: one
  // brands read and one media read
  async summaryForSamy(
    org: string,
    request: SamyBrandRequest
  ): Promise<SamyBrandSummary> {
    const pick = await this.pickBrand(org, request);
    if (!('brand' in pick)) {
      return pick;
    }

    const { name, kit, details } = toBrand(
      pick.brand,
      await this.images(org, imageIds(pick.brand.brandKit))
    );

    return {
      name,
      logo: kit.logo && !kit.logo.missing ? { path: kit.logo.path } : undefined,
      examples: liveExamples(kit).map(({ n, path }) => ({ n, path })),
      colours: kit.colours,
      headingFont: kit.headingFont ?? undefined,
      bodyFont: kit.bodyFont ?? undefined,
      details: pickBy(details, Boolean),
    };
  }

  // FR-017's order (R8), as data, for resolveForSamy and summaryForSamy
  private async pickBrand(
    org: string,
    { chip, input, channelIds }: SamyBrandRequest
  ): Promise<BrandPick> {
    // The brand chip's choice comes first (R14): none goes without a kit, and
    // a live brand of the organization, checked against the list below, wins
    // over the input. Each, or anything else the browser sent (another
    // organization's brand, a deleted one), leaves the brand to the input and
    // the channels, as no chip does.
    if (chip === NO_BRAND) {
      return { none: true };
    }
    const picked = !!chip && chip !== EACH_BRAND;

    // In any case, as brandNamed matches a name. A brand on the chip outranks
    // it, so then it waits for the list.
    const wanted = input?.trim();
    const noBrand = wanted?.toLowerCase() === NO_BRAND;
    if (noBrand && !picked) {
      return { none: true };
    }

    const brands = await this._brandRepository.list(org);
    const onChip = brands.find(({ id }) => id === chip);
    if (onChip) {
      return { brand: onChip };
    }

    // An organization with no brands goes without a kit, as today
    if (noBrand || !brands.length) {
      return { none: true };
    }

    if (wanted) {
      const brand = brandNamed(brands, wanted);
      return brand ? { brand } : { unknown: wanted, brands: namesOf(brands) };
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
        return { several: namesOf(theirs) };
      }

      return theirs.length ? { brand: theirs[0] } : { none: true };
    }

    if (brands.length > 1) {
      return { ask: namesOf(brands) };
    }

    return { brand: brands[0] };
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
