import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'fs';
import { resolve, sep } from 'path';
import { BillingService } from '../billing/billing.service';
import { env } from '../config/env';
import { PrismaService } from '../database/prisma.service';

const MEDIA_ROOT = resolve(process.cwd(), 'private', 'media');
const MEDIA_STORAGE_DRIVER = env.mediaStorageDriver;

const MAX_MEDIA_FILE_SIZE_BYTES = env.mediaMaxFileSizeBytes;

const ALLOWED_MIME_TYPES = new Map<string, string>([
['image/jpeg', 'IMAGE'],
['image/png', 'IMAGE'],
['image/webp', 'IMAGE'],
['video/mp4', 'VIDEO'],
['application/pdf', 'DOCUMENT'],
]);

type StoredMediaObject = {
  buffer: Buffer;
  absolutePath: string | null;
};

@Injectable()
export class MediaService {
  private readonly s3Client =
    MEDIA_STORAGE_DRIVER === 's3'
      ? new S3Client({
          endpoint: env.s3Endpoint || undefined,
          region: env.s3Region,
          forcePathStyle: env.s3ForcePathStyle,
          credentials: {
            accessKeyId: env.s3AccessKeyId,
            secretAccessKey: env.s3SecretAccessKey,
          },
        })
      : null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly billingService: BillingService,
  ) {
    this.assertMediaStorageIsProductionSafe();
  }

listMedia(tenantId: string) {
return this.prisma.mediaFile.findMany({
where: {
tenantId,
},
orderBy: {
createdAt: 'desc',
},
});
}

async uploadMedia(tenantId: string, file?: Express.Multer.File) {
this.assertMediaStorageIsProductionSafe();

if (!file) {
  throw new BadRequestException('File is required');
}

const mediaType = ALLOWED_MIME_TYPES.get(file.mimetype);

if (!mediaType) {
  throw new BadRequestException(
    'Only JPG, PNG, WEBP, MP4, and PDF files are allowed',
  );
}

if (!file.buffer || file.buffer.length === 0) {
  throw new BadRequestException('Uploaded file is empty');
}

this.assertFileSignature(file.mimetype, file.buffer);

if (file.size > MAX_MEDIA_FILE_SIZE_BYTES) {
  throw new BadRequestException(
    `Media file is too large. Maximum allowed size is ${Math.floor(
      MAX_MEDIA_FILE_SIZE_BYTES / 1024 / 1024,
    )} MB.`,
  );
}

const extension = this.getFileExtension(file.originalname);

if (!extension) {
  throw new BadRequestException('Invalid media file extension');
}

const storedName = `${randomUUID()}${extension}`;
const storageKey = `${tenantId}/${storedName}`;

const media = await this.prisma.$transaction(
  async (tx) => {
    await this.billingService.assertCanUploadMediaInTransaction(
      tx,
      tenantId,
      file.size,
    );

    return tx.mediaFile.create({
      data: {
        tenantId,
        originalName: this.sanitizeOriginalName(file.originalname),
        storedName,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        mediaType,
        storageKey,
      },
    });
  },
  {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  },
);

try {
  await this.writeObject(storageKey, file.buffer, file.mimetype);
} catch {
  await this.prisma.mediaFile.delete({
    where: {
      id: media.id,
    },
  });

  throw new InternalServerErrorException('Failed to store uploaded media');
}

return media;

}

async getMediaForDownload(
  tenantId: string,
  mediaId: string,
): Promise<
  NonNullable<Awaited<ReturnType<PrismaService['mediaFile']['findFirst']>>> &
    StoredMediaObject
> {
this.assertMediaStorageIsProductionSafe();

const media = await this.prisma.mediaFile.findFirst({
  where: {
    id: mediaId,
    tenantId,
  },
});

if (!media) {
  throw new NotFoundException('Media file not found');
}

const storedObject = await this.readObject(media.storageKey);

return {
  ...media,
  ...storedObject,
};

}

async getMediaForMetaUpload(
  tenantId: string,
  mediaId: string,
): Promise<
  NonNullable<Awaited<ReturnType<PrismaService['mediaFile']['findFirst']>>> &
    StoredMediaObject
> {
this.assertMediaStorageIsProductionSafe();

const media = await this.prisma.mediaFile.findFirst({
  where: {
    id: mediaId,
    tenantId,
  },
});

if (!media) {
  throw new NotFoundException('Media file not found');
}

const storedObject = await this.readObject(media.storageKey);

return {
  ...media,
  ...storedObject,
};

}

async deleteMedia(tenantId: string, mediaId: string) {
this.assertMediaStorageIsProductionSafe();

const media = await this.prisma.mediaFile.findFirst({
  where: {
    id: mediaId,
    tenantId,
  },
});

if (!media) {
  throw new NotFoundException('Media file not found');
}

await this.deleteObject(media.storageKey);

await this.prisma.mediaFile.delete({
  where: {
    id: media.id,
  },
});

return {
  ok: true,
};

}

private assertMediaStorageIsProductionSafe() {
  if (env.isProduction && MEDIA_STORAGE_DRIVER === 'local') {
    throw new InternalServerErrorException(
      'Local media storage is disabled in production. Configure S3/R2/Spaces before production media usage.',
    );
  }

  if (!['local', 's3'].includes(MEDIA_STORAGE_DRIVER)) {
    throw new InternalServerErrorException(
      'Invalid MEDIA_STORAGE_DRIVER. Use local or s3.',
    );
  }

  if (MEDIA_STORAGE_DRIVER === 's3') {
    const missing = [
      ['S3_BUCKET', env.s3Bucket],
      ['S3_ACCESS_KEY_ID', env.s3AccessKeyId],
      ['S3_SECRET_ACCESS_KEY', env.s3SecretAccessKey],
    ].filter(([, value]) => !value);

    if (missing.length > 0) {
      throw new InternalServerErrorException(
        `Missing S3 media configuration: ${missing
          .map(([name]) => name)
          .join(', ')}`,
      );
    }
  }
}

private async writeObject(
  storageKey: string,
  buffer: Buffer,
  mimeType: string,
) {
  if (MEDIA_STORAGE_DRIVER === 's3') {
    await this.s3Client!.send(
      new PutObjectCommand({
        Bucket: env.s3Bucket,
        Key: storageKey,
        Body: buffer,
        ContentType: mimeType,
        ServerSideEncryption: 'AES256',
      }),
    );

    return;
  }

  const tenantDir = this.getSafeAbsolutePath(storageKey.split('/')[0] || '');
  mkdirSync(tenantDir, { recursive: true });

  writeFileSync(this.getSafeAbsolutePath(storageKey), buffer, {
    flag: 'wx',
  });
}

private async readObject(storageKey: string): Promise<StoredMediaObject> {
  if (MEDIA_STORAGE_DRIVER === 's3') {
    const response = await this.s3Client!.send(
      new GetObjectCommand({
        Bucket: env.s3Bucket,
        Key: storageKey,
      }),
    );

    const chunks: Buffer[] = [];

    for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
      chunks.push(Buffer.from(chunk));
    }

return {
  buffer: Buffer.concat(chunks),
  absolutePath: null as string | null,
};
  }

  const absolutePath = this.getSafeAbsolutePath(storageKey);

  if (!existsSync(absolutePath)) {
    throw new NotFoundException('Media file missing from storage');
  }

  return {
    buffer: readFileSync(absolutePath),
    absolutePath,
  };
}

private async deleteObject(storageKey: string) {
  if (MEDIA_STORAGE_DRIVER === 's3') {
    await this.s3Client!.send(
      new DeleteObjectCommand({
        Bucket: env.s3Bucket,
        Key: storageKey,
      }),
    );

    return;
  }

  const absolutePath = this.getSafeAbsolutePath(storageKey);

  if (existsSync(absolutePath)) {
    unlinkSync(absolutePath);
  }
}

private getSafeAbsolutePath(storageKey: string) {
const cleanStorageKey = String(storageKey || '').trim();

if (
  !cleanStorageKey ||
  cleanStorageKey.includes('..') ||
  cleanStorageKey.startsWith('/') ||
  cleanStorageKey.startsWith('\\')
) {
  throw new InternalServerErrorException('Invalid media storage path');
}

const absolutePath = resolve(MEDIA_ROOT, cleanStorageKey);

if (
  absolutePath !== MEDIA_ROOT &&
  !absolutePath.startsWith(`${MEDIA_ROOT}${sep}`)
) {
  throw new InternalServerErrorException('Invalid media storage path');
}

return absolutePath;

}

private sanitizeOriginalName(value: string) {
const cleaned = String(value || 'file')
.replace(/[^\w. -]+/g, '')
.replace(/\s+/g, ' ')
.trim();

return cleaned.slice(0, 120) || 'file';

}

private assertFileSignature(mimeType: string, buffer: Buffer) {
  const hasBytes = (...bytes: number[]) =>
    bytes.every((byte, index) => buffer[index] === byte);

  let valid = false;

  if (mimeType === 'image/jpeg') {
    valid = buffer.length >= 3 && hasBytes(0xff, 0xd8, 0xff);
  }

  if (mimeType === 'image/png') {
    valid =
      buffer.length >= 8 &&
      hasBytes(
        0x89,
        0x50,
        0x4e,
        0x47,
        0x0d,
        0x0a,
        0x1a,
        0x0a,
      );
  }

  if (mimeType === 'image/webp') {
    valid =
      buffer.length >= 12 &&
      buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buffer.subarray(8, 12).toString('ascii') === 'WEBP';
  }

  if (mimeType === 'application/pdf') {
    valid =
      buffer.length >= 5 &&
      buffer.subarray(0, 5).toString('ascii') === '%PDF-';
  }

  if (mimeType === 'video/mp4') {
    valid =
      buffer.length >= 12 &&
      buffer.subarray(4, 8).toString('ascii') === 'ftyp';
  }

  if (!valid) {
    throw new BadRequestException(
      'Uploaded file content does not match its file type',
    );
  }
}

private getFileExtension(filename: string) {
const cleanName = filename.toLowerCase();

if (cleanName.endsWith('.jpg') || cleanName.endsWith('.jpeg')) {
  return '.jpg';
}

if (cleanName.endsWith('.png')) {
  return '.png';
}

if (cleanName.endsWith('.webp')) {
  return '.webp';
}

if (cleanName.endsWith('.mp4')) {
  return '.mp4';
}

if (cleanName.endsWith('.pdf')) {
  return '.pdf';
}

return '';

}
}