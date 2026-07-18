import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import type { CurrentUser } from '../current-user';
import { env } from '../env';
import { PrismaService } from './prisma.service';

const impersonationExpiryMs = 30 * 60 * 1000;
const platformAdminRoles = ['platform_admin', 'super_admin'];

@Injectable()
export class PlatformAdminService {
  constructor(private readonly prisma: PrismaService) {}

  async startImpersonation(actor: CurrentUser, targetTenantId?: string) {
    const tenantId = String(targetTenantId || '').trim();

    if (!tenantId) {
      throw new BadRequestException('Target tenant id is required');
    }

    const [actorUser, targetTenant] = await Promise.all([
      this.prisma.user.findFirst({
        where: {
          id: actor.userId,
          tenantId: actor.tenantId,
          isActive: true,
        },
        include: {
          tenant: true,
        },
      }),
      this.prisma.tenant.findFirst({
        where: {
          id: tenantId,
          status: 'active',
        },
      }),
    ]);

    if (!actorUser || actorUser.tenant.status !== 'active') {
      throw new BadRequestException('Platform admin account is not active');
    }

    if (!platformAdminRoles.includes(actorUser.role)) {
      throw new ForbiddenException('Only platform admins can impersonate tenants');
    }

    if (!actorUser.twoFactorEnabled || !actorUser.twoFactorConfirmedAt) {
      throw new ForbiddenException(
        'Two-factor authentication is required for impersonation',
      );
    }

    if (!targetTenant) {
      throw new BadRequestException('Target tenant is not active');
    }

    if (targetTenant.id === actorUser.tenantId) {
      throw new BadRequestException('Cannot impersonate your own platform tenant');
    }

    const expiresAt = new Date(Date.now() + impersonationExpiryMs);

    const token = jwt.sign(
      {
        sub: actorUser.id,
        tenantId: targetTenant.id,
        role: 'admin',
        sessionVersion: actorUser.sessionVersion,
        impersonating: true,
        impersonatorUserId: actorUser.id,
        impersonatorTenantId: actorUser.tenantId,
        impersonatorRole: actorUser.role,
        impersonationExpiresAt: expiresAt.toISOString(),
      },
      env.jwtSecret,
      {
        expiresIn: '30m',
      },
    );

    await this.prisma.$transaction([
      this.prisma.auditLog.create({
        data: {
          tenantId: actorUser.tenantId,
          actorUserId: actorUser.id,
          action: 'PLATFORM_IMPERSONATION_STARTED_BY_ADMIN',
          entityType: 'TENANT',
          entityId: targetTenant.id,
          metadata: {
            targetTenantId: targetTenant.id,
            targetTenantSlug: targetTenant.slug,
            impersonatorRole: actorUser.role,
            expiresAt: expiresAt.toISOString(),
          },
        },
      }),
      this.prisma.auditLog.create({
        data: {
          tenantId: targetTenant.id,
          actorUserId: actorUser.id,
          action: 'PLATFORM_IMPERSONATION_STARTED',
          entityType: 'TENANT',
          entityId: targetTenant.id,
          metadata: {
            targetTenantSlug: targetTenant.slug,
            impersonatorTenantId: actorUser.tenantId,
            impersonatorRole: actorUser.role,
            expiresAt: expiresAt.toISOString(),
          },
        },
      }),
    ]);

    return {
      token,
      expiresAt,
      tenant: {
        id: targetTenant.id,
        name: targetTenant.name,
        slug: targetTenant.slug,
        status: targetTenant.status,
      },
      user: {
        id: actorUser.id,
        name: actorUser.name,
        email: actorUser.email,
        role: 'admin',
        emailVerifiedAt: actorUser.emailVerifiedAt,
        twoFactorEnabled: actorUser.twoFactorEnabled,
        twoFactorConfirmedAt: actorUser.twoFactorConfirmedAt,
      },
      impersonation: {
        active: true,
        impersonatorUserId: actorUser.id,
        impersonatorRole: actorUser.role,
        impersonatorTenantId: actorUser.tenantId,
        targetTenantId: targetTenant.id,
        expiresAt: expiresAt.toISOString(),
      },
    };
  }

  async stopImpersonation(session: CurrentUser) {
    if (!session.impersonating || !session.impersonatorTenantId) {
      throw new BadRequestException('No active impersonation session');
    }

    const actorUser = await this.prisma.user.findFirst({
      where: {
        id: session.userId,
        tenantId: session.impersonatorTenantId,
        isActive: true,
      },
      include: {
        tenant: true,
      },
    });

    if (!actorUser || actorUser.tenant.status !== 'active') {
      throw new BadRequestException('Platform admin account is not active');
    }

    if (!platformAdminRoles.includes(actorUser.role)) {
      throw new ForbiddenException('Only platform admins can stop impersonation');
    }

    const token = jwt.sign(
      {
        sub: actorUser.id,
        tenantId: actorUser.tenantId,
        role: actorUser.role,
        sessionVersion: actorUser.sessionVersion,
      },
      env.jwtSecret,
      {
        expiresIn: '12h',
      },
    );

    await this.prisma.$transaction([
      this.prisma.auditLog.create({
        data: {
          tenantId: actorUser.tenantId,
          actorUserId: actorUser.id,
          action: 'PLATFORM_IMPERSONATION_STOPPED_BY_ADMIN',
          entityType: 'TENANT',
          entityId: session.tenantId,
          metadata: {
            targetTenantId: session.tenantId,
            impersonatorRole: actorUser.role,
          },
        },
      }),
      this.prisma.auditLog.create({
        data: {
          tenantId: session.tenantId,
          actorUserId: actorUser.id,
          action: 'PLATFORM_IMPERSONATION_STOPPED',
          entityType: 'TENANT',
          entityId: session.tenantId,
          metadata: {
            impersonatorTenantId: actorUser.tenantId,
            impersonatorRole: actorUser.role,
          },
        },
      }),
    ]);

    return {
      token,
      tenant: {
        id: actorUser.tenant.id,
        name: actorUser.tenant.name,
        slug: actorUser.tenant.slug,
        status: actorUser.tenant.status,
      },
      user: {
        id: actorUser.id,
        name: actorUser.name,
        email: actorUser.email,
        role: actorUser.role,
        emailVerifiedAt: actorUser.emailVerifiedAt,
        twoFactorEnabled: actorUser.twoFactorEnabled,
        twoFactorConfirmedAt: actorUser.twoFactorConfirmedAt,
      },
      impersonation: {
        active: false,
      },
    };
  }
}