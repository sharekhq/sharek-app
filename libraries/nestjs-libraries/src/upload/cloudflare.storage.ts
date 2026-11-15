import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Upload } from '@aws-sdk/lib-storage';
import { Readable } from 'stream';
import 'multer';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';
import mime from 'mime-types';
// @ts-ignore
import { getExtension } from 'mime';
import { IUploadProvider, UploadedStream } from './upload.interface';
import axios from 'axios';
import { isSafePublicHttpsUrl } from '@gitroom/nestjs-libraries/dtos/webhooks/webhook.url.validator';
import { ssrfSafeDispatcher } from '@gitroom/nestjs-libraries/dtos/webhooks/ssrf.safe.dispatcher';
import { parseDataUrl } from '@gitroom/nestjs-libraries/upload/data.url';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { fileTypeFromBuffer } = require('file-type');

const ALLOWED_MIME_TYPES = new Set<string>([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/avif',
  'image/bmp',
  'image/tiff',
  'video/mp4',
  'audio/mpeg',
  'audio/mp4',
  'audio/wav',
  'audio/ogg',
]);

// Media library tiles, made by the zone's Image and Media Transformations: one
// 384 by 384 box for every tile, twice the widest, the whole file scaled down
// into it. A refused image redirects to the original; a video gives its
// opening frame only
const TILE_IMAGE_OPTIONS =
  'width=384,height=384,fit=scale-down,format=auto,onerror=redirect';
const TILE_FRAME_OPTIONS =
  'mode=frame,time=0s,width=384,height=384,fit=scale-down,format=jpg';

class CloudflareStorage implements IUploadProvider {
  private _client: S3Client;
  // The bucket's origin while CLOUDFLARE_TILE_IMAGES is "true", else null
  private _tileOrigin: string | null = null;

  constructor(
    accountID: string,
    accessKey: string,
    secretKey: string,
    private region: string,
    private _bucketName: string,
    private _uploadUrl: string
  ) {
    this._client = new S3Client({
      endpoint: `https://${accountID}.r2.cloudflarestorage.com`,
      region,
      credentials: {
        accessKeyId: accessKey,
        secretAccessKey: secretKey,
      },
      requestChecksumCalculation: 'WHEN_REQUIRED',
    });

    this._client.middlewareStack.add(
      (next) =>
        async (args): Promise<any> => {
          const request = args.request as RequestInit;

          // Remove checksum headers
          const headers = request.headers as Record<string, string>;
          delete headers['x-amz-checksum-crc32'];
          delete headers['x-amz-checksum-crc32c'];
          delete headers['x-amz-checksum-sha1'];
          delete headers['x-amz-checksum-sha256'];
          request.headers = headers;

          Object.entries(request.headers).forEach(
            // @ts-ignore
            ([key, value]: [string, string]): void => {
              if (!request.headers) {
                request.headers = {};
              }
              (request.headers as Record<string, string>)[key] = value;
            }
          );

          return next(args);
        },
      { step: 'build', name: 'customHeaders' }
    );

    // A bucket URL that can't be parsed leaves the tiles off rather than
    // stopping the backend from booting
    if (process.env.CLOUDFLARE_TILE_IMAGES === 'true') {
      try {
        this._tileOrigin = new URL(_uploadUrl).origin;
      } catch {
        this._tileOrigin = null;
      }
    }
  }

  async uploadSimple(path: string) {
    const dataUrl = path.startsWith('data:') ? parseDataUrl(path) : null;

    let body: Buffer;
    if (dataUrl) {
      body = dataUrl.buffer;
    } else {
      if (!(await isSafePublicHttpsUrl(path))) {
        throw new Error('Unsafe URL');
      }
      const loadImage = await fetch(path, {
        // @ts-ignore — undici option, not in lib.dom fetch types
        dispatcher: ssrfSafeDispatcher,
      });
      body = Buffer.from(await loadImage.arrayBuffer());
    }
    const detected = await fileTypeFromBuffer(body);
    if (!detected || !ALLOWED_MIME_TYPES.has(detected.mime)) {
      throw new Error('Unsupported file type.');
    }
    const extension = detected.ext;
    const safeContentType = detected.mime;
    const id = makeId(10);

    const params = {
      Bucket: this._bucketName,
      Key: `${id}.${extension}`,
      Body: body,
      ContentType: safeContentType,
      ChecksumMode: 'DISABLED',
    };

    const command = new PutObjectCommand({ ...params });
    await this._client.send(command);

    return `${this._uploadUrl}/${id}.${extension}`;
  }

  async uploadFile(file: Express.Multer.File): Promise<any> {
    try {
      const detected = await fileTypeFromBuffer(file.buffer);
      if (!detected || !ALLOWED_MIME_TYPES.has(detected.mime)) {
        throw new Error('Unsupported file type.');
      }
      const id = makeId(10);
      const extension = detected.ext;
      const safeContentType = detected.mime;

      // Create the PutObjectCommand to upload the file to Cloudflare R2
      const command = new PutObjectCommand({
        Bucket: this._bucketName,
        ACL: 'public-read',
        Key: `${id}.${extension}`,
        Body: file.buffer,
        ContentType: safeContentType,
      });

      await this._client.send(command);

      return {
        filename: `${id}.${extension}`,
        mimetype: file.mimetype,
        size: file.size,
        buffer: file.buffer,
        originalname: `${id}.${extension}`,
        fieldname: 'file',
        path: `${this._uploadUrl}/${id}.${extension}`,
        destination: `${this._uploadUrl}/${id}.${extension}`,
        encoding: '7bit',
        stream: file.buffer as any,
      };
    } catch (err) {
      console.error('Error uploading file to Cloudflare R2:', err);
      throw err;
    }
  }

  async uploadStream(
    stream: Readable,
    mimetype: string,
    ext: string
  ): Promise<UploadedStream> {
    try {
      if (!ALLOWED_MIME_TYPES.has(mimetype)) {
        throw new Error('Unsupported file type.');
      }
      const id = makeId(10);
      const key = `${id}.${ext}`;

      // Multipart upload holds only a few parts in memory at a time instead
      // of the whole body, and does not need to know the length up front
      const upload = new Upload({
        client: this._client,
        params: {
          Bucket: this._bucketName,
          ACL: 'public-read',
          Key: key,
          Body: stream,
          ContentType: mimetype,
        },
      });
      await upload.done();

      return {
        filename: key,
        mimetype,
        originalname: key,
        path: `${this._uploadUrl}/${key}`,
      };
    } catch (err) {
      console.error('Error streaming file to Cloudflare R2:', err);
      throw err;
    }
  }

  async signDownloadUrl(fileName: string) {
    return getSignedUrl(
      this._client,
      new GetObjectCommand({ Bucket: this._bucketName, Key: fileName }),
      { expiresIn: 3 * 3600 }
    );
  }

  async signUploadUrl(fileName: string, contentType: string) {
    return getSignedUrl(
      this._client,
      new PutObjectCommand({
        Bucket: this._bucketName,
        Key: fileName,
        ContentType: contentType,
      }),
      { expiresIn: 3 * 3600 }
    );
  }

  publicUrl(fileName: string) {
    return `${this._uploadUrl}/${fileName}`;
  }

  // The transformations take the stored address whole as their source, and
  // only for a file in the bucket's own zone
  tileImage(path: string, kind: 'image' | 'video'): string {
    if (!this._tileOrigin || !path.startsWith(`${this._tileOrigin}/`)) {
      return path;
    }

    return kind === 'image'
      ? `${this._tileOrigin}/cdn-cgi/image/${TILE_IMAGE_OPTIONS}/${path}`
      : `${this._tileOrigin}/cdn-cgi/media/${TILE_FRAME_OPTIONS}/${path}`;
  }

  async readFile(fileName: string) {
    const { Body } = await this._client.send(
      new GetObjectCommand({ Bucket: this._bucketName, Key: fileName })
    );

    return Body!.transformToString();
  }

  async writeFile(fileName: string, body: string, contentType: string) {
    await this._client.send(
      new PutObjectCommand({
        Bucket: this._bucketName,
        Key: fileName,
        Body: body,
        ContentType: contentType,
      })
    );
  }

  // Accepts either the public URL or the bare key
  async removeFile(filePath: string): Promise<void> {
    const fileName = filePath.split('/').pop();
    if (!fileName) {
      return;
    }

    await this._client.send(
      new DeleteObjectCommand({
        Bucket: this._bucketName,
        Key: fileName,
      })
    );
  }
}

export { CloudflareStorage };
export default CloudflareStorage;
