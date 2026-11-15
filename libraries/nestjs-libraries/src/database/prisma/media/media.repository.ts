import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import { SaveMediaInformationDto } from '@gitroom/nestjs-libraries/dtos/media/save.media.information.dto';
import {
  MediaLibraryDto,
  MediaMonthDto,
} from '@gitroom/nestjs-libraries/dtos/media/media.library.dto';
import { Prisma } from '@prisma/client';

// Four rows of the eight columns the library grid yields on a target screen.
// The composer's media picker reads the same endpoint, so it gets 32 too.
const MEDIA_PAGE_SIZE = 32;

// A file is a video when its address holds .mp4 in any case, as the tile's
// hasExtension reads it, so the list and the tile can't disagree. The type
// column (image on every row) and fileSize are never read (spec 057, Rule 7).
const MEDIA_VIDEO: Prisma.MediaWhereInput = {
  path: { contains: '.mp4', mode: 'insensitive' },
};
const MEDIA_STILL_ENDINGS = ['.jpg', '.jpeg', '.png'];

@Injectable()
export class MediaRepository {
  constructor(private _media: PrismaRepository<'media'>) {}

  saveFile(org: string, fileName: string, filePath: string, originalName?: string) {
    return this._media.model.media.create({
      data: {
        organization: {
          connect: {
            id: org,
          },
        },
        name: fileName,
        path: filePath,
        originalName: originalName || null,
      },
      select: {
        id: true,
        name: true,
        originalName: true,
        path: true,
        thumbnail: true,
        alt: true,
        status: true,
      },
    });
  }

  startProcessing(org: string, id: string) {
    return this._media.model.media.update({
      where: { id, organizationId: org },
      data: { status: 'processing', processingError: null },
      select: { id: true, status: true },
    });
  }

  finishProcessing(
    org: string,
    id: string,
    data: { name?: string; path?: string; fileSize?: number; error?: string }
  ) {
    return this._media.model.media.update({
      where: { id, organizationId: org },
      data: {
        ...(data.name ? { name: data.name } : {}),
        ...(data.path ? { path: data.path } : {}),
        ...(data.fileSize ? { fileSize: data.fileSize } : {}),
        status: data.error ? 'failed' : 'ready',
        processingError: data.error || null,
      },
      select: { id: true, status: true },
    });
  }

  getMediaStatus(org: string, id: string) {
    return this._media.model.media.findFirst({
      where: {
        id,
        organizationId: org,
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        originalName: true,
        path: true,
        thumbnail: true,
        alt: true,
        status: true,
        processingError: true,
      },
    });
  }

  getMediaById(id: string) {
    return this._media.model.media.findUnique({
      where: {
        id,
      },
    });
  }

  deleteMedia(org: string, id: string) {
    return this._media.model.media.update({
      where: {
        id,
        organizationId: org,
      },
      data: {
        deletedAt: new Date(),
      },
    });
  }

  saveMediaInformation(org: string, data: SaveMediaInformationDto) {
    return this._media.model.media.update({
      where: {
        id: data.id,
        organizationId: org,
      },
      data: {
        alt: data.alt,
        thumbnail: data.thumbnail,
        thumbnailTimestamp: data.thumbnailTimestamp,
      },
      select: {
        id: true,
        name: true,
        originalName: true,
        alt: true,
        thumbnail: true,
        path: true,
        thumbnailTimestamp: true,
      },
    });
  }

  // The public API and Samy read without options and get today's query; the
  // Media library's options add the type and break ties by id, so rows that
  // share a timestamp keep one order between loads (spec 057, Rule 3).
  async getMedia(
    org: string,
    page: number,
    search?: string,
    options?: Pick<MediaLibraryDto, 'type' | 'sort'>
  ) {
    const pageNum = (page || 1) - 1;
    const searchFilter = this.searchFilter(search);
    const typeFilter = this.typeFilter(options?.type);
    const order = options?.sort === 'oldest' ? 'asc' : 'desc';
    const query = {
      where: {
        organization: {
          id: org,
        },
        deletedAt: null,
        status: { not: 'processing' },
        ...searchFilter,
        ...typeFilter,
      },
    };
    const pages = Math.ceil(
      (await this._media.model.media.count(query)) / MEDIA_PAGE_SIZE
    );
    const results = await this._media.model.media.findMany({
      where: {
        organizationId: org,
        deletedAt: null,
        // still being normalized: it shows up once the workflow releases it
        status: { not: 'processing' },
        ...searchFilter,
        ...typeFilter,
      },
      orderBy: options
        ? [{ createdAt: order }, { id: order }]
        : {
            createdAt: 'desc',
          },
      select: {
        id: true,
        name: true,
        originalName: true,
        path: true,
        thumbnail: true,
        alt: true,
        thumbnailTimestamp: true,
        createdAt: true,
      },
      skip: pageNum * MEDIA_PAGE_SIZE,
      take: MEDIA_PAGE_SIZE,
    });

    return {
      pages,
      results,
    };
  }

  // The rows a render's references name. Scoped to the organization and to
  // live rows, so another workspace's id or a deleted image reads as missing.
  getMediaByIds(org: string, ids: string[]) {
    return this._media.model.media.findMany({
      where: {
        organizationId: org,
        id: { in: ids },
        deletedAt: null,
      },
      select: {
        id: true,
        path: true,
      },
    });
  }

  getMediaByPaths(org: string, paths: string[]) {
    return this._media.model.media.findMany({
      where: {
        organizationId: org,
        path: { in: paths },
        deletedAt: null,
      },
      select: {
        id: true,
        path: true,
      },
    });
  }

  countMediaInRange(org: string, query: MediaMonthDto): Promise<number> {
    return this._media.model.media.count({
      where: this.rangeWhere(org, query),
    });
  }

  async getMediaIdsInRange(
    org: string,
    query: MediaMonthDto
  ): Promise<string[]> {
    const rows = await this._media.model.media.findMany({
      where: this.rangeWhere(org, query),
      select: { id: true },
    });
    return rows.map(({ id }) => id);
  }

  // One statement for a batch of ids, scoped to the organization's live rows:
  // another workspace's id matches nothing, and a file another tab already
  // deleted keeps its first stamp. Storage keeps the file (spec 057, FR-057).
  async deleteManyMedia(org: string, ids: string[]): Promise<void> {
    await this._media.model.media.updateMany({
      where: {
        organizationId: org,
        id: { in: ids },
        deletedAt: null,
      },
      data: {
        deletedAt: new Date(),
      },
    });
  }

  private searchFilter(search?: string) {
    const trimmedSearch = search?.trim();
    return trimmedSearch
      ? {
          originalName: {
            contains: trimmedSearch,
            mode: 'insensitive' as const,
          },
        }
      : {};
  }

  private typeFilter(type?: MediaLibraryDto['type']): Prisma.MediaWhereInput {
    switch (type) {
      case 'video':
        return MEDIA_VIDEO;
      case 'image':
        return { NOT: MEDIA_VIDEO };
      case 'image-static':
        return {
          OR: MEDIA_STILL_ENDINGS.map((ending) => ({
            path: { contains: ending, mode: 'insensitive' as const },
          })),
        };
      default:
        return {};
    }
  }

  // A month of the Media library: the list's filters within [from, to), the
  // bounds of the month in the user's timezone (spec 057, R4, R5).
  private rangeWhere(
    org: string,
    query: MediaMonthDto
  ): Prisma.MediaWhereInput {
    return {
      organizationId: org,
      deletedAt: null,
      status: { not: 'processing' },
      ...this.searchFilter(query.search),
      ...this.typeFilter(query.type),
      createdAt: { gte: new Date(query.from), lt: new Date(query.to) },
    };
  }
}
