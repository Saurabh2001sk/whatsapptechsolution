import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class ContactTypesService {
  constructor(private readonly prisma: PrismaService) {}

  listContactTypes(tenantId: string) {
    return this.prisma.contactType.findMany({
      where: {
        tenantId,
      },
      orderBy: {
        name: 'asc',
      },
    });
  }

  async createContactType(
    tenantId: string,
    input: {
      name?: string;
      color?: string;
    },
  ) {
    const name = String(input.name || '').trim();
    const color = this.cleanColor(input.color);

    if (!name) {
      throw new BadRequestException('Contact type name is required');
    }

const existingType = await this.prisma.contactType.findFirst({
  where: {
    tenantId,
    name: {
      equals: name,
      mode: 'insensitive',
    },
  },
});

if (existingType) {
  throw new ConflictException('Contact type already exists');
}

    try {
      return await this.prisma.contactType.create({
        data: {
          tenantId,
          name,
          color,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Contact type already exists');
      }

      throw error;
    }
  }

  async deleteContactType(tenantId: string, contactTypeId: string) {
    const contactType = await this.prisma.contactType.findFirst({
      where: {
        id: contactTypeId,
        tenantId,
      },
    });

    if (!contactType) {
      throw new NotFoundException('Contact type not found');
    }

    await this.prisma.contact.updateMany({
      where: {
        tenantId,
        contactTypeId: contactType.id,
      },
      data: {
        contactTypeId: null,
      },
    });

    await this.prisma.contactType.delete({
      where: {
        id: contactType.id,
      },
    });

    return {
      ok: true,
    };
  }

  private cleanColor(value?: string) {
    const color = String(value || '').trim();

    if (!color) {
      return null;
    }

    if (!/^#[0-9a-fA-F]{6}$/.test(color)) {
      throw new BadRequestException('Contact type color must be a valid hex color');
    }

    return color;
  }
}