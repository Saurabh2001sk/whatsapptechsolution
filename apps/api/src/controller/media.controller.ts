import {
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Post,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request, Response } from 'express';
import { memoryStorage } from 'multer';
import { AuthService } from '../services/auth.service';
import type { CurrentUser } from '../current-user';
import { MediaService } from '../services/media.service';
import { env } from '../env';

@Controller('media')
export class MediaController {
  constructor(
    private readonly mediaService: MediaService,
    private readonly authService: AuthService,
  ) {}

  @Get()
  async listMedia(@Req() request: Request) {
    const user = await this.authService.requireUserFromRequest(request);

    return this.mediaService.listMedia(user.tenantId);
  }

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
   limits: {
     fileSize: env.mediaMaxFileSizeBytes,
   },
    }),
  )
  async uploadMedia(
    @Req() request: Request,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const user = await this.authService.requireUserFromRequest(request);

    this.blockImpersonationWrites(user, 'upload media');

    return this.mediaService.uploadMedia(user.tenantId, file);
  }

  @Get(':id/download')
  async downloadMedia(
    @Req() request: Request,
    @Param('id') mediaId: string,
    @Res() response: Response,
  ) {
    const user = await this.authService.requireUserFromRequest(request);

    const media = await this.mediaService.getMediaForDownload(
      user.tenantId,
      mediaId,
    );

response.setHeader('Content-Type', media.mimeType);
response.setHeader(
  'Content-Disposition',
  `inline; filename="${this.sanitizeOriginalName(media.originalName)}"`,
);

if (media.absolutePath) {
  return response.sendFile(media.absolutePath);
}

return response.send(media.buffer);
  }

  @Delete(':id')
  async deleteMedia(@Req() request: Request, @Param('id') mediaId: string) {
    const user = await this.authService.requireUserFromRequest(request);

    this.blockImpersonationWrites(user, 'delete media');

    return this.mediaService.deleteMedia(user.tenantId, mediaId);
  }

  private blockImpersonationWrites(user: CurrentUser, action: string) {
    if (user.impersonating) {
      throw new ForbiddenException(`Impersonation cannot ${action}.`);
    }
  }

  private sanitizeOriginalName(value: string) {
    const cleaned = String(value || 'file')
      .replace(/[^\w.\- ]+/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    return cleaned.slice(0, 120) || 'file';
  }
}