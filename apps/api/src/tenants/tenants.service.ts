import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class TenantsService {
  constructor(private readonly prisma: PrismaService) {}

  async listTenants() {
    return this.prisma.tenant.findMany({
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async createTenant(
    input: { name?: string; slug?: string },
    actorUserId?: string,
  ) {
    const name = String(input.name || '').trim();
    const slug = String(input.slug || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

    if (!name || name.length < 2 || name.length > 100) {
      throw new BadRequestException('Tenant name must be 2 to 100 characters');
    }

    if (!slug || slug.length < 2 || slug.length > 80) {
      throw new BadRequestException('Tenant slug must be 2 to 80 characters');
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const tenant = await tx.tenant.create({
          data: {
            name,
            slug,
          },
        });

        await tx.auditLog.create({
          data: {
            tenantId: tenant.id,
            actorUserId: actorUserId || null,
            action: 'TENANT_CREATED',
            entityType: 'TENANT',
            entityId: tenant.id,
            metadata: {
              slug: tenant.slug,
              createdFrom: 'TENANTS_ADMIN_ROUTE',
            },
          },
        });

        return tenant;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Tenant slug already exists');
      }

      throw error;
    }
  }
}