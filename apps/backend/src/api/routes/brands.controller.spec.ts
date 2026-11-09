// The Brands page lists, creates and deletes brands and saves their kits
// through BrandService; the controller hands it the caller's organization and
// the body, and answers what it returns (contracts/brands-api.md). The
// service's imports drag in Prisma; none of that code runs here, so the module
// is swapped for an empty shell (same pattern as media.controller.spec).
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/brands/brand.service',
  () => ({ BrandService: class {} })
);

import { HttpException, RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { CHECK_POLICIES_KEY } from '@gitroom/backend/services/auth/permissions/permissions.ability';
import {
  BrandKitDto,
  CreateBrandDto,
} from '@gitroom/nestjs-libraries/dtos/brands/brand.dto';
import { BrandsController } from './brands.controller';

const org = { id: 'org-1' } as any;

const brand = {
  id: 'brand-1',
  name: 'Cold Brew Co',
  kit: {
    logo: null,
    examples: [],
    colours: ['#B3261E'],
    headingFont: null,
    bodyFont: null,
  },
};

const makeController = (brands: Record<string, any>) =>
  new BrandsController(brands as any);

describe('getBrands', () => {
  it("answers the organization's brands as the service lists them", async () => {
    const list = jest.fn().mockResolvedValue([brand]);

    await expect(makeController({ list }).getBrands(org)).resolves.toEqual([
      brand,
    ]);
    expect(list).toHaveBeenCalledWith('org-1');
  });
});

describe('createBrand', () => {
  const body: CreateBrandDto = { name: 'Cold Brew Co', moveUngrouped: true };

  it('creates the brand in the organization and answers its id', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'brand-1' });

    await expect(
      makeController({ create }).createBrand(org, body)
    ).resolves.toEqual({ id: 'brand-1' });
    expect(create).toHaveBeenCalledWith('org-1', body);
  });

  it('lets the service’s 400 for a taken name through', async () => {
    const taken = new HttpException(
      'A brand with this name already exists',
      400
    );
    const create = jest.fn().mockRejectedValue(taken);

    await expect(
      makeController({ create }).createBrand(org, body)
    ).rejects.toBe(taken);
  });
});

describe('deleteBrand', () => {
  it('deletes the brand of the organization and answers its id', async () => {
    const remove = jest.fn().mockResolvedValue({ id: 'brand-1' });

    await expect(
      makeController({ remove }).deleteBrand(org, 'brand-1')
    ).resolves.toEqual({ id: 'brand-1' });
    expect(remove).toHaveBeenCalledWith('org-1', 'brand-1');
  });

  // Another organization's brand, or one already deleted.
  it('lets the service’s 404 through', async () => {
    const notFound = new HttpException('Brand not found', 404);
    const remove = jest.fn().mockRejectedValue(notFound);

    await expect(
      makeController({ remove }).deleteBrand(org, 'brand-2')
    ).rejects.toBe(notFound);
  });
});

describe('saveKit', () => {
  const body: BrandKitDto = { colours: ['#B3261E'], headingFont: 'Cairo' };

  it('saves the kit of the organization’s brand and answers the brand', async () => {
    const saveKit = jest.fn().mockResolvedValue(brand);

    await expect(
      makeController({ saveKit }).saveKit(org, 'brand-1', body)
    ).resolves.toEqual(brand);
    expect(saveKit).toHaveBeenCalledWith('org-1', 'brand-1', body);
  });

  it('lets the service’s 404 for an image not in Media through', async () => {
    const notFound = new HttpException(
      'logoId must be in your Media library',
      404
    );
    const saveKit = jest.fn().mockRejectedValue(notFound);

    await expect(
      makeController({ saveKit }).saveKit(org, 'brand-1', {
        logoId: '00000000-0000-4000-8000-000000000001',
      })
    ).rejects.toBe(notFound);
  });
});

describe('BrandsController routes', () => {
  it('is served under /brands', () => {
    expect(Reflect.getMetadata(PATH_METADATA, BrandsController)).toBe(
      '/brands'
    );
  });

  // Every member edits brands, on every plan (FR-008, FR-009): a role or plan
  // check would be a policy the PoliciesGuard reads off the handler.
  it.each([
    { name: 'getBrands' as const, method: RequestMethod.GET, path: '/' },
    { name: 'createBrand' as const, method: RequestMethod.POST, path: '/' },
    {
      name: 'deleteBrand' as const,
      method: RequestMethod.DELETE,
      path: '/:id',
    },
    { name: 'saveKit' as const, method: RequestMethod.PUT, path: '/:id/kit' },
  ])(
    '$name is served at $path with no role or plan check',
    ({ name, method, path }) => {
      const handler = BrandsController.prototype[name];

      expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(method);
      expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(path);
      expect(Reflect.getMetadata(CHECK_POLICIES_KEY, handler)).toBeUndefined();
    }
  );

  // The global ValidationPipe validates a body against its parameter's type,
  // which is what turns a bad name or kit into a 400.
  it.each([
    { name: 'createBrand' as const, dto: CreateBrandDto },
    { name: 'saveKit' as const, dto: BrandKitDto },
  ])('$name takes its body as $dto.name', ({ name, dto }) => {
    expect(
      Reflect.getMetadata('design:paramtypes', BrandsController.prototype, name)
    ).toContain(dto);
  });
});
