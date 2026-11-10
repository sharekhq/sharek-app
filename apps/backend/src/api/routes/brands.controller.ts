import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { Organization } from '@prisma/client';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ThrottlerRealIpGuard } from '@gitroom/nestjs-libraries/throttler/throttler.provider';
import { BrandService } from '@gitroom/nestjs-libraries/database/prisma/brands/brand.service';
import { BrandWebsiteService } from '@gitroom/nestjs-libraries/database/prisma/brands/brand.website.service';
import {
  BrandKitDto,
  BrandKitFromWebsiteDto,
  BrandWebsiteColoursDto,
  BrandWebsiteDto,
  CreateBrandDto,
} from '@gitroom/nestjs-libraries/dtos/brands/brand.dto';

@ApiTags('Brands')
@Controller('/brands')
export class BrandsController {
  constructor(
    private _brandService: BrandService,
    private _brandWebsiteService: BrandWebsiteService
  ) {}

  @Get('/')
  async getBrands(@GetOrgFromRequest() org: Organization) {
    return this._brandService.list(org.id);
  }

  @Post('/')
  async createBrand(
    @GetOrgFromRequest() org: Organization,
    @Body() body: CreateBrandDto
  ) {
    return this._brandService.create(org.id, body);
  }

  // Each lookup reads a site or an image for whoever asks, so it is capped per
  // client, as the other routes that send requests out are
  @UseGuards(ThrottlerRealIpGuard)
  @Throttle({ default: { limit: 30, ttl: 3600000 } })
  @Post('/website')
  async suggestFromWebsite(
    @GetOrgFromRequest() org: Organization,
    @Body() body: BrandWebsiteDto
  ) {
    return this._brandWebsiteService.suggestFromWebsite(org.id, body.url);
  }

  @UseGuards(ThrottlerRealIpGuard)
  @Throttle({ default: { limit: 30, ttl: 3600000 } })
  @Post('/website/colours')
  async coloursFromLogo(@Body() body: BrandWebsiteColoursDto) {
    return {
      colours: await this._brandWebsiteService.coloursFromLogo(body.logo),
    };
  }

  @Delete('/:id')
  async deleteBrand(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string
  ) {
    return this._brandService.remove(org.id, id);
  }

  @Put('/:id/kit')
  async saveKit(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string,
    @Body() body: BrandKitDto
  ) {
    return this._brandService.saveKit(org.id, id, body);
  }

  @Put('/:id/kit/from-website')
  async saveFromWebsite(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string,
    @Body() body: BrandKitFromWebsiteDto
  ) {
    return this._brandWebsiteService.saveFromWebsite(org.id, id, body);
  }
}
