import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { BillingService } from '../billing/billing.service';
import { PrismaService } from '../database/prisma.service';

const allowedTenantRoles = new Set(['admin', 'manager', 'agent']);

@Injectable()
export class TeamUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billingService: BillingService,
  ) {}

  listTeamUsers(tenantId: string) {
    return this.prisma.user.findMany({
      where: {
        tenantId,
      },
      orderBy: {
        createdAt: 'desc',
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        emailVerifiedAt: true,
        twoFactorEnabled: true,
        twoFactorConfirmedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async createTeamUser(
    tenantId: string,
    actorUserId: string,
    input: {
      name?: string;
      email?: string;
      role?: string;
      password?: string;
    },
  ) {
    const name = String(input.name || '').trim();
    const email = String(input.email || '').trim().toLowerCase();
    const role = String(input.role || 'agent').trim().toLowerCase();
    const password = String(input.password || '');

    if (!name || name.length < 2 || name.length > 80) {
      throw new BadRequestException('Name must be 2 to 80 characters.');
    }

    if (!email || !email.includes('@') || email.length > 160) {
      throw new BadRequestException('Valid email is required.');
    }

    if (!allowedTenantRoles.has(role)) {
      throw new BadRequestException('Role must be admin, manager, or agent.');
    }

    this.validateStrongPassword(password);

    const passwordHash = await bcrypt.hash(password, 12);

    try {
      return await this.prisma.$transaction(
        async (tx) => {
          await this.billingService.assertCanCreateTeamUsersInTransaction(
            tx,
            tenantId,
            1,
          );

          const user = await tx.user.create({
            data: {
              tenantId,
              name,
              email,
              role,
              passwordHash,
              isActive: true,
              emailVerifiedAt: new Date(),
            },
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
              isActive: true,
              emailVerifiedAt: true,
              twoFactorEnabled: true,
              twoFactorConfirmedAt: true,
              createdAt: true,
              updatedAt: true,
            },
          });

          await tx.auditLog.create({
            data: {
              tenantId,
              actorUserId,
              action: 'TEAM_USER_CREATED',
              entityType: 'USER',
              entityId: user.id,
              metadata: {
                email: user.email,
                role: user.role,
              },
            },
          });

          return user;
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('User email already exists.');
      }

      throw error;
    }
  }

  async deactivateTeamUser(
    tenantId: string,
    actorUserId: string,
    userId: string,
  ) {
    if (userId === actorUserId) {
      throw new BadRequestException('You cannot deactivate your own account.');
    }

    const user = await this.prisma.user.findFirst({
      where: {
        id: userId,
        tenantId,
      },
    });

    if (!user) {
      throw new NotFoundException('Team user not found.');
    }

    if (!user.isActive) {
      return {
        ok: true,
        skipped: true,
      };
    }

    if (user.role === 'admin') {
      const otherActiveAdmins = await this.prisma.user.count({
        where: {
          tenantId,
          role: 'admin',
          isActive: true,
          id: {
            not: user.id,
          },
        },
      });

      if (otherActiveAdmins < 1) {
        throw new BadRequestException(
          'Tenant must keep at least one active admin.',
        );
      }
    }

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: {
          id: user.id,
        },
        data: {
          isActive: false,
          sessionVersion: {
            increment: 1,
          },
        },
      }),
      this.prisma.auditLog.create({
        data: {
          tenantId,
          actorUserId,
          action: 'TEAM_USER_DEACTIVATED',
          entityType: 'USER',
          entityId: user.id,
          metadata: {
            email: user.email,
            role: user.role,
          },
        },
      }),
    ]);

    return {
      ok: true,
    };
  }

  private validateStrongPassword(password: string) {
    if (password.length < 10) {
      throw new BadRequestException('Password must be at least 10 characters');
    }

    if (!/[A-Z]/.test(password)) {
      throw new BadRequestException(
        'Password must include at least one uppercase letter',
      );
    }

    if (!/[a-z]/.test(password)) {
      throw new BadRequestException(
        'Password must include at least one lowercase letter',
      );
    }

    if (!/[0-9]/.test(password)) {
      throw new BadRequestException('Password must include at least one number');
    }

    if (!/[^A-Za-z0-9]/.test(password)) {
      throw new BadRequestException(
        'Password must include at least one special character',
      );
    }
  }
}