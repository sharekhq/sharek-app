// The Brands page lists, creates and deletes brands and saves their kits
// through BrandService, and fills a kit from a website through
// BrandWebsiteService; the controller hands them the caller's organization and
// the body, and answers what they return (contracts/brands-api.md). The
// services' imports drag in Prisma, storage and sharp; none of that code runs
// here, so the modules are swapped for empty shells (same pattern as
// media.controller.spec).
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/brands/brand.service',
  () => ({ BrandService: class {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/brands/brand.website.service',
  () => ({ BrandWebsiteService: class {} })
);

import {
  HttpException,
  INestApplication,
  RequestMethod,
  ValidationPipe,
} from '@nestjs/common';
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import { ThrottlerRealIpGuard } from '@gitroom/nestjs-libraries/throttler/throttler.provider';
import { CHECK_POLICIES_KEY } from '@gitroom/backend/services/auth/permissions/permissions.ability';
import {
  BrandKitDto,
  BrandKitFromWebsiteDto,
  BrandWebsiteDto,
  CreateBrandDto,
} from '@gitroom/nestjs-libraries/dtos/brands/brand.dto';
import {
  Brand,
  BrandService,
} from '@gitroom/nestjs-libraries/database/prisma/brands/brand.service';
import { BrandWebsiteService } from '@gitroom/nestjs-libraries/database/prisma/brands/brand.website.service';
import { BrandsController } from './brands.controller';

const org = { id: 'org-1' } as any;

const brand: Brand = {
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

const makeController = (
  brands: Record<string, any>,
  website: Record<string, any> = {}
) => new BrandsController(brands as any, website as any);

const suggestions = {
  foundOn: 'www.noordental.sa',
  logos: ['https://cdn.noordental.sa/logo.svg'],
  colours: ['#1F3A5F'],
};

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

describe('suggestFromWebsite', () => {
  it('looks the site up for the organization and answers the suggestions', async () => {
    const suggestFromWebsite = jest.fn().mockResolvedValue(suggestions);

    await expect(
      makeController({}, { suggestFromWebsite }).suggestFromWebsite(org, {
        url: 'https://www.noordental.sa/',
      })
    ).resolves.toEqual(suggestions);
    expect(suggestFromWebsite).toHaveBeenCalledWith(
      'org-1',
      'https://www.noordental.sa/'
    );
  });

  it('lets the service’s 422 for a site that couldn’t be read through', async () => {
    const unreadable = new HttpException("This site couldn't be read.", 422);
    const suggestFromWebsite = jest.fn().mockRejectedValue(unreadable);

    await expect(
      makeController({}, { suggestFromWebsite }).suggestFromWebsite(org, {
        url: 'https://www.noordental.sa/',
      })
    ).rejects.toBe(unreadable);
  });
});

describe('saveFromWebsite', () => {
  const body: BrandKitFromWebsiteDto = {
    logo: 'https://cdn.noordental.sa/logo.svg',
    colours: ['#1F3A5F'],
  };

  it('saves what was kept to the kit of the organization’s brand and answers the brand', async () => {
    const saveFromWebsite = jest.fn().mockResolvedValue(brand);

    await expect(
      makeController({}, { saveFromWebsite }).saveFromWebsite(
        org,
        'brand-1',
        body
      )
    ).resolves.toEqual(brand);
    expect(saveFromWebsite).toHaveBeenCalledWith('org-1', 'brand-1', body);
  });

  // The service writes a font only when it was sent, and null clears one, so
  // both must arrive as the body has them.
  it('hands the body’s fonts to the service, a cleared one as null', async () => {
    const saveFromWebsite = jest.fn().mockResolvedValue(brand);

    await makeController({}, { saveFromWebsite }).saveFromWebsite(
      org,
      'brand-1',
      { ...body, headingFont: 'IBM Plex Sans', bodyFont: null }
    );

    expect(saveFromWebsite).toHaveBeenCalledWith('org-1', 'brand-1', {
      logo: 'https://cdn.noordental.sa/logo.svg',
      colours: ['#1F3A5F'],
      headingFont: 'IBM Plex Sans',
      bodyFont: null,
    });
  });

  it.each([
    ['a logo that couldn’t be saved', "This logo couldn't be saved.", 422],
    ['a brand that isn’t one of the organization’s', 'Brand not found', 404],
  ])('lets the service’s refusal of %s through', async (_, message, status) => {
    const refusal = new HttpException(message, status);
    const saveFromWebsite = jest.fn().mockRejectedValue(refusal);

    await expect(
      makeController({}, { saveFromWebsite }).saveFromWebsite(
        org,
        'brand-1',
        body
      )
    ).rejects.toBe(refusal);
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
    {
      name: 'suggestFromWebsite' as const,
      method: RequestMethod.POST,
      path: '/website',
    },
    {
      name: 'saveFromWebsite' as const,
      method: RequestMethod.PUT,
      path: '/:id/kit/from-website',
    },
  ])(
    '$name is served at $path with no role or plan check',
    ({ name, method, path }) => {
      const handler = BrandsController.prototype[name];

      expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(method);
      expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(path);
      expect(Reflect.getMetadata(CHECK_POLICIES_KEY, handler)).toBeUndefined();
    }
  );

  // The lookup reads a site for whoever asks, so it takes 30 an hour, the cap
  // of the backend's other routes that send requests out. The global
  // ThrottlerBehindProxyGuard lets every route but the public API's posts
  // through, so the route carries its own guard (as support.controller.spec
  // notes); ThrottlerRealIpGuard counts by the address the proxy forwards.
  it('suggestFromWebsite takes 30 requests an hour from one address', () => {
    const handler = BrandsController.prototype.suggestFromWebsite;

    expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toEqual([
      ThrottlerRealIpGuard,
    ]);
    expect(Reflect.getMetadata('THROTTLER:LIMITdefault', handler)).toBe(30);
    expect(Reflect.getMetadata('THROTTLER:TTLdefault', handler)).toBe(
      3_600_000
    );
  });

  // The global ValidationPipe validates a body against its parameter's type,
  // which is what turns a bad name or kit into a 400.
  it.each([
    { name: 'createBrand' as const, dto: CreateBrandDto },
    { name: 'saveKit' as const, dto: BrandKitDto },
    { name: 'suggestFromWebsite' as const, dto: BrandWebsiteDto },
    { name: 'saveFromWebsite' as const, dto: BrandKitFromWebsiteDto },
  ])('$name takes its body as $dto.name', ({ name, dto }) => {
    expect(
      Reflect.getMetadata('design:paramtypes', BrandsController.prototype, name)
    ).toContain(dto);
  });
});

// Real routing, the route's own throttler and the global ValidationPipe, as
// main.ts sets it: "website" must reach the lookup rather than be read as a
// brand's id, the lookup answers POST's 201 as the backend's other POSTs that
// save nothing do, a bare domain arrives with https:// while anything
// readOrFetch would read as a local path stops at a 400, and one address gets
// 30 lookups an hour.
describe('Fill from my website, through the router', () => {
  const website = {
    suggestFromWebsite: jest.fn(),
    saveFromWebsite: jest.fn(),
  };
  let app: INestApplication;
  let url: string;

  const send = (method: string, path: string, body: object, headers = {}) =>
    fetch(url + path, {
      method,
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot({
          throttlers: [{ ttl: 3_600_000, limit: 90 }],
        }),
      ],
      controllers: [BrandsController],
      providers: [
        { provide: BrandService, useValue: {} },
        { provide: BrandWebsiteService, useValue: website },
      ],
    }).compile();
    app = module.createNestApplication();
    app.use((req: { org: unknown }, _res: unknown, next: () => void) => {
      req.org = { id: 'org-1' };
      next();
    });
    app.useGlobalPipes(new ValidationPipe({ transform: true }));
    await app.listen(0, '127.0.0.1');
    url = await app.getUrl();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    website.suggestFromWebsite.mockReset().mockResolvedValue(suggestions);
    website.saveFromWebsite.mockReset().mockResolvedValue(brand);
  });

  it('POST /brands/website looks a bare domain up on https:// and answers 201 with the suggestions', async () => {
    const response = await send('POST', '/brands/website', {
      url: 'noordental.sa',
    });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual(suggestions);
    expect(website.suggestFromWebsite).toHaveBeenCalledWith(
      'org-1',
      'https://noordental.sa'
    );
  });

  // Colours come with the site's branding, not from the picked logo, so the
  // route that read them from an image is gone (contracts/brands-website.md).
  it('POST /brands/website/colours is no longer served and answers 404', async () => {
    const response = await send('POST', '/brands/website/colours', {
      logo: 'https://cdn.noordental.sa/logo.png',
    });

    expect(response.status).toBe(404);
  });

  it('PUT /brands/:id/kit/from-website answers 200 with the saved brand', async () => {
    const response = await send('PUT', '/brands/brand-1/kit/from-website', {
      logo: 'https://cdn.noordental.sa/logo.svg',
      colours: ['#1F3A5F'],
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(brand);
    expect(website.saveFromWebsite).toHaveBeenCalledWith('org-1', 'brand-1', {
      logo: 'https://cdn.noordental.sa/logo.svg',
      colours: ['#1F3A5F'],
    });
  });

  it.each([
    ['POST', '/brands/website', { url: 'file:///etc/passwd' }],
    [
      'PUT',
      '/brands/brand-1/kit/from-website',
      { logo: '../../etc/passwd', colours: [] },
    ],
  ])(
    '%s %s refuses an address that is no http(s) link with a 400, before the service',
    async (method, path, body) => {
      const response = await send(method, path, body);

      expect(response.status).toBe(400);
      expect(website.suggestFromWebsite).not.toHaveBeenCalled();
      expect(website.saveFromWebsite).not.toHaveBeenCalled();
    }
  );

  // The route counts by the address the proxy forwards.
  it('POST /brands/website refuses a 31st request within the hour from one address with a 429, before the service', async () => {
    const from = { 'x-forwarded-for': '203.0.113.7' };
    const body = { url: 'https://www.noordental.sa/' };
    const statuses: number[] = [];
    for (let n = 0; n < 31; n++) {
      statuses.push((await send('POST', '/brands/website', body, from)).status);
    }

    expect(statuses).toEqual([...Array(30).fill(201), 429]);
    expect(website.suggestFromWebsite).toHaveBeenCalledTimes(30);
  });
});
