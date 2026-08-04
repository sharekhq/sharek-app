import {
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  Param,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
  UsePipes,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { Organization } from '@prisma/client';
import { MediaService } from '@gitroom/nestjs-libraries/database/prisma/media/media.service';
import { ApiTags } from '@nestjs/swagger';
import handleR2Upload from '@gitroom/nestjs-libraries/upload/r2.uploader';
import { FileInterceptor } from '@nestjs/platform-express';
import { CustomFileValidationPipe } from '@gitroom/nestjs-libraries/upload/custom.upload.validation';
import { UploadFactory } from '@gitroom/nestjs-libraries/upload/upload.factory';
import { SaveMediaInformationDto } from '@gitroom/nestjs-libraries/dtos/media/save.media.information.dto';
import { GenerateImageWithPromptDto } from '@gitroom/nestjs-libraries/dtos/media/generate.image.dto';
import {
  CreateVideoDto,
  VideoDto,
} from '@gitroom/nestjs-libraries/dtos/videos/video.dto';
import { VideoFunctionDto } from '@gitroom/nestjs-libraries/dtos/videos/video.function.dto';
import { withHeartbeat } from '@gitroom/nestjs-libraries/agent/heartbeat';

@ApiTags('Media')
@Controller('/media')
export class MediaController {
  private storage = UploadFactory.createStorage();
  constructor(private _mediaService: MediaService) {}

  @Delete('/:id')
  deleteMedia(@GetOrgFromRequest() org: Organization, @Param('id') id: string) {
    return this._mediaService.deleteMedia(org.id, id);
  }

  @Post('/generate-video')
  async generateVideo(
    @GetOrgFromRequest() org: Organization,
    @Body() body: VideoDto,
    @Res({ passthrough: false }) res: Response
  ) {
    // Same contract as the two-phase route below: everything that can fail
    // with a meaningful status (credits, trial, unknown type, validation)
    // fails before the first byte, because the billing and finish-trial
    // dialogs key off the status code.
    const video = await this._mediaService.resolveVideo(org, body);

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    // Tell nginx not to buffer this NDJSON stream — buffered heartbeats cannot
    // keep the proxy connection alive.
    res.setHeader('X-Accel-Buffering', 'no');
    const write = (payload: object) => {
      res.write(JSON.stringify(payload) + '\n');
      (res as { flush?: () => void }).flush?.();
    };

    // A one-shot render has no yield points, so unlike the two-phase route a
    // disconnect cannot cancel it: the render finishes on the committed
    // credit and the video still lands in the media library.
    let disconnected = false;
    res.on('close', () => {
      disconnected = true;
    });

    try {
      for await (const event of withHeartbeat(
        this._mediaService.processVideo(org, body, video),
        20_000,
        () => ({ name: 'heartbeat' })
      )) {
        if (disconnected) {
          break;
        }
        write(event);
      }
    } catch (err) {
      // The stream has already started, so a normal HTTP error is no longer
      // possible. Emit a final error event instead; processVideo normalises
      // everything through generationError, so an HttpException here carries
      // a message written for the user.
      const message =
        err instanceof HttpException
          ? err.message
          : 'Something went wrong while creating your video, please try again.';
      write({ name: 'error', error: true, message });
    }

    res.end();
  }

  @Post('/generate-video/plan')
  planVideo(@GetOrgFromRequest() org: Organization, @Body() body: VideoDto) {
    return this._mediaService.planVideo(org, body);
  }

  @Post('/generate-video/create')
  async createVideo(
    @GetOrgFromRequest() org: Organization,
    @Body() body: CreateVideoDto,
    @Res({ passthrough: false }) res: Response
  ) {
    // Deliberately outside the try below: credit, trial and provider checks must
    // still be able to fail with a real status code. Once a byte is written the
    // status line is fixed at 200, and the billing and finish-trial dialogs key
    // off the status, not the body.
    const video = await this._mediaService.resolveTwoPhaseVideo(org, body);

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    // Tell nginx not to buffer this NDJSON stream — buffered heartbeats cannot
    // keep the proxy connection alive.
    res.setHeader('X-Accel-Buffering', 'no');
    // compression() buffers responses; flush after each event so it actually
    // leaves the process while the render is still running.
    const write = (payload: object) => {
      res.write(JSON.stringify(payload) + '\n');
      (res as { flush?: () => void }).flush?.();
    };

    // Writing to a closed socket does not throw, so without this the loop would
    // run the render to completion for a client that has gone away. Breaking
    // closes the generator chain, which stops the render and refunds the credit.
    // Worst case it is noticed one heartbeat late, which is close enough.
    let disconnected = false;
    res.on('close', () => {
      disconnected = true;
    });

    try {
      for await (const event of withHeartbeat(
        this._mediaService.createVideo(org, body, video),
        20_000,
        () => ({ name: 'heartbeat' })
      )) {
        if (disconnected) {
          break;
        }
        write(event);
      }
    } catch (err) {
      // The stream has already started, so a normal HTTP error is no longer
      // possible. Emit a final error event instead. createVideo normalises
      // everything through generationError, so an HttpException here carries a
      // message written for the user.
      const message =
        err instanceof HttpException
          ? err.message
          : 'Something went wrong while creating your video, please try again.';
      write({ name: 'error', error: true, message });
    }

    res.end();
  }

  @Post('/generate-image')
  async generateImage(
    @GetOrgFromRequest() org: Organization,
    @Req() req: Request,
    @Body('prompt') prompt: string
  ) {
    return {
      output:
        'data:image/png;base64,' +
        (await this._mediaService.generateImage(prompt, org)),
    };
  }

  @Post('/generate-image-with-prompt')
  async generateImageFromText(
    @GetOrgFromRequest() org: Organization,
    @Body() body: GenerateImageWithPromptDto
  ) {
    const image = await this._mediaService.generateImageWithPrompt(body, org);
    const file = await this.storage.uploadSimple(
      'data:image/jpeg;base64,' + image
    );

    return this._mediaService.saveFile(org.id, file.split('/').pop(), file);
  }

  @Post('/upload-server')
  @UseInterceptors(FileInterceptor('file'))
  @UsePipes(new CustomFileValidationPipe())
  async uploadServer(
    @GetOrgFromRequest() org: Organization,
    @UploadedFile() file: Express.Multer.File
  ) {
    const originalName = file?.originalname || '';
    const uploadedFile = await this.storage.uploadFile(file);
    return this._mediaService.saveFile(
      org.id,
      uploadedFile.originalname,
      uploadedFile.path,
      originalName
    );
  }

  @Post('/save-media')
  async saveMedia(
    @GetOrgFromRequest() org: Organization,
    @Req() req: Request,
    @Body('name') name: string,
    @Body('originalName') originalName: string
  ) {
    if (!name) {
      return false;
    }
    return this._mediaService.saveFile(
      org.id,
      name,
      process.env.CLOUDFLARE_BUCKET_URL + '/' + name,
      originalName || undefined
    );
  }

  @Post('/information')
  saveMediaInformation(
    @GetOrgFromRequest() org: Organization,
    @Body() body: SaveMediaInformationDto
  ) {
    return this._mediaService.saveMediaInformation(org.id, body);
  }

  @Post('/upload-simple')
  @UseInterceptors(FileInterceptor('file'))
  @UsePipes(new CustomFileValidationPipe())
  async uploadSimple(
    @GetOrgFromRequest() org: Organization,
    @UploadedFile('file') file: Express.Multer.File,
    @Body('preventSave') preventSave: string = 'false'
  ) {
    const originalName = file.originalname;
    const getFile = await this.storage.uploadFile(file);

    if (preventSave === 'true') {
      const { path } = getFile;
      return { path };
    }

    return this._mediaService.saveFile(
      org.id,
      getFile.originalname,
      getFile.path,
      originalName
    );
  }

  @Post('/:endpoint')
  async uploadFile(
    @GetOrgFromRequest() org: Organization,
    @Req() req: Request,
    @Res() res: Response,
    @Param('endpoint') endpoint: string
  ) {
    const upload = await handleR2Upload(endpoint, req, res);
    if (endpoint !== 'complete-multipart-upload') {
      return upload;
    }

    // @ts-ignore
    const name = upload.Location.split('/').pop();
    const originalName = req.body?.file?.name;

    const saveFile = await this._mediaService.saveFile(
      org.id,
      name,
      // @ts-ignore
      upload.Location,
      originalName || undefined
    );

    res.status(200).json({ ...upload, saved: saveFile });
  }

  @Get('/')
  getMedia(
    @GetOrgFromRequest() org: Organization,
    @Query('page') page: number,
    @Query('search') search?: string
  ) {
    return this._mediaService.getMedia(org.id, page, search);
  }

  @Get('/video-options')
  getVideos() {
    return this._mediaService.getVideoOptions();
  }

  @Post('/video/function')
  videoFunction(
    @Body() body: VideoFunctionDto
  ) {
    return this._mediaService.videoFunction(body.identifier, body.functionName, body.params);
  }

  @Get('/generate-video/:type/allowed')
  generateVideoAllowed(
    @GetOrgFromRequest() org: Organization,
    @Param('type') type: string
  ) {
    return this._mediaService.generateVideoAllowed(org, type);
  }
}
