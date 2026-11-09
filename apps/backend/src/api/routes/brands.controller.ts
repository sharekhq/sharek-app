import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { Organization } from '@prisma/client';
import { ApiTags } from '@nestjs/swagger';
import { BrandService } from '@gitroom/nestjs-libraries/database/prisma/brands/brand.service';
import {
  BrandKitDto,
  CreateBrandDto,
} from '@gitroom/nestjs-libraries/dtos/brands/brand.dto';

@ApiTags('Brands')
@Controller('/brands')
export class BrandsController {
  constructor(private _brandService: BrandService) {}

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
}
