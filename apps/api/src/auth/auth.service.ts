import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';
import * as jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { PrismaService } from '../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { TwoFactorService } from '../two-factor/two-factor.service';

@Injectable()
export class AuthService {
    private readonly authEmailCooldownMs = 2 * 60 * 1000;
  private readonly passwordResetExpiryMs = 30 * 60 * 1000;
  private readonly emailVerificationExpiryMs = 24 * 60 * 60 * 1000;
    private readonly accessTokenExpiresIn = '12h';
      private readonly trustedDeviceExpiryMs = 30 * 24 * 60 * 60 * 1000;
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly twoFactorService: TwoFactorService,
  ) {}

  async register(input: {
    businessName?: string;
    slug?: string;
    name?: string;
    email?: string;
    password?: string;
  }) {
    const businessName = String(input.businessName || '').trim();
    const slug = this.cleanSlug(input.slug);
    const name = String(input.name || '').trim();
    const email = String(input.email || '').trim().toLowerCase();
    const password = String(input.password || '');

    if (!businessName) {
      throw new BadRequestException('Business name is required');
    }

    if (!slug) {
      throw new BadRequestException('Business slug is required');
    }

    if (!name) {
      throw new BadRequestException('Name is required');
    }

    if (!email || !email.includes('@')) {
      throw new BadRequestException('Valid email is required');
    }

    this.validateStrongPassword(password);

    const passwordHash = await bcrypt.hash(password, 12);

    try {
      const tenant = await this.prisma.tenant.create({
        data: {
          name: businessName,
          slug,
          users: {
            create: {
              name,
              email,
              passwordHash,
              role: 'admin',
            },
          },
        },
        include: {
          users: true,
        },
      });

const user = tenant.users[0];
await this.sendEmailVerification({
id: user.id,
tenantId: user.tenantId,
name: user.name,
email: user.email,
});

await this.createAuthAuditLog({
  tenantId: user.tenantId,
  actorUserId: user.id,
  action: 'USER_REGISTERED',
  entityId: user.id,
  metadata: {
    email: user.email,
    tenantSlug: tenant.slug,
  },
});

return {
  requiresEmailVerification: true,
  tenant: {
    id: tenant.id,
    name: tenant.name,
    slug: tenant.slug,
    status: tenant.status,
  },
  user: {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    emailVerifiedAt: user.emailVerifiedAt,
    twoFactorEnabled: user.twoFactorEnabled,
  },
};

    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Business slug or email already exists');
      }

      throw error;
    }
  }

async login(input: {
email?: string;
password?: string;
trustedDeviceToken?: string;
userAgent?: string;
}) {
    const email = String(input.email || '').trim().toLowerCase();
    const password = String(input.password || '');

    if (!email || !email.includes('@')) {
      throw new BadRequestException('Valid email is required');
    }

    if (!password) {
      throw new BadRequestException('Password is required');
    }

    const user = await this.prisma.user.findUnique({
      where: {
        email,
      },
      include: {
        tenant: true,
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (user.tenant.status !== 'active') {
      throw new UnauthorizedException('Tenant is not active');
    }

    const passwordOk = await bcrypt.compare(password, user.passwordHash);

    if (!passwordOk) {
      await this.createAuthAuditLog({
        tenantId: user.tenantId,
        actorUserId: user.id,
        action: 'LOGIN_FAILED',
        entityId: user.id,
        metadata: {
          reason: 'INVALID_PASSWORD',
        },
      });

      throw new UnauthorizedException('Invalid email or password');
    }

    if (!user.emailVerifiedAt) {
  await this.createAuthAuditLog({
    tenantId: user.tenantId,
    actorUserId: user.id,
    action: 'LOGIN_BLOCKED_EMAIL_UNVERIFIED',
    entityId: user.id,
  });

  await this.sendEmailVerification({
    id: user.id,
    tenantId: user.tenantId,
    name: user.name,
    email: user.email,
  });

  throw new UnauthorizedException('Please verify your email before login');
}

    if (user.twoFactorEnabled) {
const trustedDeviceOk = await this.isValidTrustedDevice(
user.id,
input.trustedDeviceToken,
input.userAgent,
);

      if (!trustedDeviceOk) {
        const twoFactorToken =
          await this.twoFactorService.createLoginChallenge(user.id);

        await this.createAuthAuditLog({
          tenantId: user.tenantId,
          actorUserId: user.id,
          action: 'LOGIN_PASSWORD_VERIFIED_2FA_REQUIRED',
          entityId: user.id,
        });

        return {
          requiresTwoFactor: true,
          twoFactorToken,
          user: {
            email: user.email,
          },
        };
      }

      await this.createAuthAuditLog({
        tenantId: user.tenantId,
        actorUserId: user.id,
        action: 'LOGIN_SUCCESS_TRUSTED_DEVICE',
        entityId: user.id,
      });
    }

const token = jwt.sign(
  {
    sub: user.id,
    tenantId: user.tenant.id,
    role: user.role,
    sessionVersion: user.sessionVersion,
  },
  env.jwtSecret,
  {
    expiresIn: this.accessTokenExpiresIn,
  },
);

        await this.createAuthAuditLog({
      tenantId: user.tenantId,
      actorUserId: user.id,
      action: 'LOGIN_SUCCESS',
      entityId: user.id,
    });

    return {
      token,
      tenant: {
        id: user.tenant.id,
        name: user.tenant.name,
        slug: user.tenant.slug,
        status: user.tenant.status,
      },
user: {
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
  emailVerifiedAt: user.emailVerifiedAt,
  twoFactorEnabled: user.twoFactorEnabled,
  twoFactorConfirmedAt: user.twoFactorConfirmedAt,
},
    };
  }

async validateSession(token?: string) {
  if (!token) {
    throw new UnauthorizedException('Not authenticated');
  }

  try {
    const payload = jwt.verify(token, env.jwtSecret) as {
      sub?: string;
      tenantId?: string;
      role?: string;
      sessionVersion?: number;
      impersonating?: boolean;
      impersonatorUserId?: string;
      impersonatorTenantId?: string;
      impersonatorRole?: string;
      impersonationExpiresAt?: string;
    };

    if (
      !payload.sub ||
      !payload.tenantId ||
      !payload.role ||
      typeof payload.sessionVersion !== 'number'
    ) {
      throw new UnauthorizedException('Not authenticated');
    }

    if (payload.impersonating) {
      if (
        !payload.impersonatorUserId ||
        !payload.impersonatorTenantId ||
        !payload.impersonatorRole ||
        !payload.impersonationExpiresAt ||
        new Date(payload.impersonationExpiresAt).getTime() <= Date.now()
      ) {
        throw new UnauthorizedException('Impersonation session expired');
      }

      const [actorUser, targetTenant] = await Promise.all([
        this.prisma.user.findFirst({
          where: {
            id: payload.impersonatorUserId,
            tenantId: payload.impersonatorTenantId,
            isActive: true,
          },
          include: {
            tenant: true,
          },
        }),
        this.prisma.tenant.findFirst({
          where: {
            id: payload.tenantId,
            status: 'active',
          },
        }),
      ]);

      if (
      !actorUser ||
      !targetTenant ||
      actorUser.tenant.status !== 'active' ||
      actorUser.sessionVersion !== payload.sessionVersion ||
      !actorUser.emailVerifiedAt ||
      !['platform_admin', 'super_admin'].includes(actorUser.role) ||
      !actorUser.twoFactorEnabled ||
      !actorUser.twoFactorConfirmedAt
      ) {
        throw new UnauthorizedException('Not authenticated');
      }

      return {
        userId: actorUser.id,
        tenantId: targetTenant.id,
        role: 'admin',
        sessionVersion: actorUser.sessionVersion,
        emailVerifiedAt: actorUser.emailVerifiedAt,
        twoFactorEnabled: actorUser.twoFactorEnabled,
        twoFactorConfirmedAt: actorUser.twoFactorConfirmedAt,
        impersonating: true,
        impersonatorUserId: actorUser.id,
        impersonatorTenantId: actorUser.tenantId,
        impersonatorRole: actorUser.role,
        impersonationExpiresAt: payload.impersonationExpiresAt,
      };
    }

    const user = await this.prisma.user.findFirst({
      where: {
        id: payload.sub,
        tenantId: payload.tenantId,
        isActive: true,
      },
      include: {
        tenant: true,
      },
    });

    if (
      !user ||
      user.tenant.status !== 'active' ||
      user.sessionVersion !== payload.sessionVersion ||
      !user.emailVerifiedAt
    ) {
      throw new UnauthorizedException('Not authenticated');
    }

    return {
      userId: user.id,
      tenantId: user.tenantId,
      role: user.role,
      sessionVersion: user.sessionVersion,
      emailVerifiedAt: user.emailVerifiedAt,
      twoFactorEnabled: user.twoFactorEnabled,
      twoFactorConfirmedAt: user.twoFactorConfirmedAt,
    };
  } catch {
    throw new UnauthorizedException('Not authenticated');
  }
}

async requireUserFromRequest(request: { cookies?: { access_token?: string } }) {
  return this.validateSession(request.cookies?.access_token);
}

async getMe(token?: string) {
  const session = await this.validateSession(token);

  if (session.impersonating) {
    const [actorUser, targetTenant] = await Promise.all([
      this.prisma.user.findFirst({
        where: {
          id: session.userId,
          tenantId: session.impersonatorTenantId,
          isActive: true,
        },
        include: {
          tenant: true,
        },
      }),
      this.prisma.tenant.findFirst({
        where: {
          id: session.tenantId,
          status: 'active',
        },
      }),
    ]);

    if (!actorUser || !targetTenant || actorUser.tenant.status !== 'active') {
      throw new UnauthorizedException('Not authenticated');
    }

    return {
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
        expiresAt: session.impersonationExpiresAt,
      },
    };
  }

  const user = await this.prisma.user.findFirst({
    where: {
      id: session.userId,
      tenantId: session.tenantId,
      isActive: true,
    },
    include: {
      tenant: true,
    },
  });

  if (!user || user.tenant.status !== 'active') {
    throw new UnauthorizedException('Not authenticated');
  }

  return {
    tenant: {
      id: user.tenant.id,
      name: user.tenant.name,
      slug: user.tenant.slug,
      status: user.tenant.status,
    },
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      emailVerifiedAt: user.emailVerifiedAt,
      twoFactorEnabled: user.twoFactorEnabled,
      twoFactorConfirmedAt: user.twoFactorConfirmedAt,
    },
    impersonation: {
      active: false,
    },
  };
}

async completeTwoFactorLogin(input: {
  twoFactorToken?: string;
  code?: string;
  trustDevice?: boolean;
  userAgent?: string;
  ipAddress?: string;
}) {
  const user = await this.twoFactorService.verifyLoginChallenge(
    input.twoFactorToken,
    input.code,
  );

const token = jwt.sign(
  {
    sub: user.id,
    tenantId: user.tenant.id,
    role: user.role,
    sessionVersion: user.sessionVersion,
  },
  env.jwtSecret,
  {
    expiresIn: this.accessTokenExpiresIn,
  },
);

await this.createAuthAuditLog({
  tenantId: user.tenantId,
  actorUserId: user.id,
  action: 'LOGIN_SUCCESS',
  entityId: user.id,
  metadata: {
    secondFactor: true,
  },
});

const trustedDeviceToken = input.trustDevice
  ? await this.createTrustedDevice({
      userId: user.id,
      userAgent: input.userAgent,
      ipAddress: input.ipAddress,
    })
  : null;

return {
    token,
    trustedDeviceToken,
    tenant: {
      id: user.tenant.id,
      name: user.tenant.name,
      slug: user.tenant.slug,
      status: user.tenant.status,
    },
user: {
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
  emailVerifiedAt: user.emailVerifiedAt,
  twoFactorEnabled: user.twoFactorEnabled,
  twoFactorConfirmedAt: user.twoFactorConfirmedAt,
},
  };
}

async requestEmailVerification(input: { email?: string }) {
const email = String(input.email || '').trim().toLowerCase();

if (!email || !email.includes('@')) {
throw new BadRequestException('Valid email is required');
}

const user = await this.prisma.user.findUnique({
where: {
  email,
},
include: {
  tenant: true,
},
});

if (
!user ||
!user.isActive ||
user.tenant.status !== 'active' ||
user.emailVerifiedAt
) {
return;
}

await this.sendEmailVerification(user);
}

async verifyEmail(input: { token?: string }) {
  const token = String(input.token || '').trim();

  if (!token) {
    throw new BadRequestException('Verification token is required');
  }

  const tokenHash = this.hashResetToken(token);

  const verificationToken =
    await this.prisma.emailVerificationToken.findUnique({
      where: {
        tokenHash,
      },
      include: {
        user: {
          include: {
            tenant: true,
          },
        },
      },
    });

  if (
    !verificationToken ||
    verificationToken.usedAt ||
    verificationToken.expiresAt.getTime() < Date.now() ||
    !verificationToken.user.isActive ||
    verificationToken.user.tenant.status !== 'active'
  ) {
    throw new BadRequestException('Verification link is invalid or expired');
  }

  await this.prisma.$transaction([
    this.prisma.user.update({
      where: {
        id: verificationToken.userId,
      },
      data: {
        emailVerifiedAt: verificationToken.user.emailVerifiedAt || new Date(),
        sessionVersion: {
          increment: 1,
        },
      },
    }),
    this.prisma.emailVerificationToken.update({
      where: {
        id: verificationToken.id,
      },
      data: {
        usedAt: new Date(),
      },
    }),
    this.prisma.emailVerificationToken.deleteMany({
      where: {
        userId: verificationToken.userId,
        id: {
          not: verificationToken.id,
        },
      },
    }),
  ]);

  await this.notifications.sendToEmail({
    tenantId: verificationToken.user.tenantId,
    event: 'EMAIL_VERIFIED',
    recipientEmail: verificationToken.user.email,
    subject: 'Email verified successfully',
    text: [
      `Hi ${verificationToken.user.name},`,
      '',
      'Your email has been verified successfully.',
    ].join('\n'),
    metadata: {
      userId: verificationToken.user.id,
    },
  });

  await this.createAuthAuditLog({
    tenantId: verificationToken.user.tenantId,
    actorUserId: verificationToken.user.id,
    action: 'EMAIL_VERIFIED',
    entityId: verificationToken.user.id,
  });
}

private async sendEmailVerification(user: {
id: string;
tenantId: string;
name: string;
email: string;
}) {

  const recentToken = await this.prisma.emailVerificationToken.findFirst({
  where: {
    userId: user.id,
    usedAt: null,
    createdAt: {
      gte: new Date(Date.now() - this.authEmailCooldownMs),
    },
  },
  select: {
    id: true,
  },
});

if (recentToken) {
  return;
}
await this.prisma.emailVerificationToken.deleteMany({
where: {
  userId: user.id,
  usedAt: null,
},
});

const token = randomBytes(32).toString('hex');
const tokenHash = this.hashResetToken(token);
const expiresAt = new Date(Date.now() + this.emailVerificationExpiryMs);
const frontendUrl = String(process.env.FRONTEND_URL || 'http://localhost:5173')
.trim()
.replace(/\/$/, '');
const verifyUrl = `${frontendUrl}/?verifyEmailToken=${token}`;

await this.prisma.emailVerificationToken.create({
data: {
  userId: user.id,
  tokenHash,
  expiresAt,
},
});

await this.notifications.sendToEmail({
tenantId: user.tenantId,
event: 'EMAIL_VERIFICATION_REQUESTED',
recipientEmail: user.email,
subject: 'Verify your email',
text: [
  `Hi ${user.name},`,
  '',
  'Please verify your email address. This link expires in 24 hours.',
  verifyUrl,
  '',
  'If you did not create this account, you can ignore this email.',
].join('\n'),
metadata: {
  userId: user.id,
  expiresAt: expiresAt.toISOString(),
},
});


await this.createAuthAuditLog({
  tenantId: user.tenantId,
  actorUserId: user.id,
  action: 'EMAIL_VERIFICATION_REQUESTED',
  entityId: user.id,
  metadata: {
    expiresAt: expiresAt.toISOString(),
  },
});

}


async requestPasswordReset(input: { email?: string }) {
 const email = String(input.email || '').trim().toLowerCase();

 if (!email || !email.includes('@')) {
   throw new BadRequestException('Valid email is required');
 }

 const user = await this.prisma.user.findUnique({
   where: {
     email,
   },
   include: {
     tenant: true,
   },
 });

 if (!user || !user.isActive || user.tenant.status !== 'active') {
   return;
 }

  const recentToken = await this.prisma.passwordResetToken.findFirst({
   where: {
     userId: user.id,
     usedAt: null,
     createdAt: {
       gte: new Date(Date.now() - this.authEmailCooldownMs),
     },
   },
   select: {
     id: true,
   },
 });

 if (recentToken) {
   return;
 }

 await this.prisma.passwordResetToken.deleteMany({
   where: {
     userId: user.id,
     usedAt: null,
   },
 });

 const token = randomBytes(32).toString('hex');
 const tokenHash = this.hashResetToken(token);
 const expiresAt = new Date(Date.now() + this.passwordResetExpiryMs);
 const frontendUrl = String(process.env.FRONTEND_URL || 'http://localhost:5173')
   .trim()
   .replace(/\/$/, '');
 const resetUrl = `${frontendUrl}/?resetToken=${token}`;

 await this.prisma.passwordResetToken.create({
   data: {
     userId: user.id,
     tokenHash,
     expiresAt,
   },
 });

 await this.notifications.sendToEmail({
   tenantId: user.tenantId,
   event: 'PASSWORD_RESET_REQUESTED',
   recipientEmail: user.email,
   subject: 'Reset your password',
   text: [
     `Hi ${user.name},`,
     '',
     'Use this link to reset your password. This link expires in 30 minutes.',
     resetUrl,
     '',
     'If you did not request this, you can ignore this email.',
   ].join('\n'),
   metadata: {
     userId: user.id,
     expiresAt: expiresAt.toISOString(),
   },
 });

await this.createAuthAuditLog({
  tenantId: user.tenantId,
  actorUserId: user.id,
  action: 'PASSWORD_RESET_REQUESTED',
  entityId: user.id,
  metadata: {
    expiresAt: expiresAt.toISOString(),
  },
});
}

async resetPassword(input: { token?: string; password?: string }) {
 const token = String(input.token || '').trim();
 const password = String(input.password || '');

 if (!token) {
   throw new BadRequestException('Reset token is required');
 }

 this.validateStrongPassword(password);
 const tokenHash = this.hashResetToken(token);

 const resetToken = await this.prisma.passwordResetToken.findUnique({
   where: {
     tokenHash,
   },
   include: {
     user: {
       include: {
         tenant: true,
       },
     },
   },
 });

 if (
   !resetToken ||
   resetToken.usedAt ||
   resetToken.expiresAt.getTime() < Date.now() ||
   !resetToken.user.isActive ||
   resetToken.user.tenant.status !== 'active'
 ) {
   throw new BadRequestException('Reset link is invalid or expired');
 }

 const samePassword = await bcrypt.compare(
   password,
   resetToken.user.passwordHash,
 );

 if (samePassword) {
   throw new BadRequestException('New password must be different');
 }

 const passwordHash = await bcrypt.hash(password, 12);

 await this.prisma.$transaction([
   this.prisma.user.update({
     where: {
       id: resetToken.userId,
     },
data: {
  passwordHash,
  sessionVersion: {
    increment: 1,
  },
},
   }),
   this.prisma.passwordResetToken.update({
     where: {
       id: resetToken.id,
     },
     data: {
       usedAt: new Date(),
     },
   }),
   this.prisma.passwordResetToken.deleteMany({
     where: {
       userId: resetToken.userId,
       id: {
         not: resetToken.id,
       },
     },
   }),
 ]);

 await this.notifications.sendToEmail({
   tenantId: resetToken.user.tenantId,
   event: 'PASSWORD_RESET_COMPLETED',
   recipientEmail: resetToken.user.email,
   subject: 'Your password was changed',
   text: [
     `Hi ${resetToken.user.name},`,
     '',
     'Your password was changed successfully.',
     '',
     'If this was not you, contact platform support immediately.',
   ].join('\n'),
   metadata: {
     userId: resetToken.user.id,
   },
 });

await this.createAuthAuditLog({
  tenantId: resetToken.user.tenantId,
  actorUserId: resetToken.user.id,
  action: 'PASSWORD_RESET_COMPLETED',
  entityId: resetToken.user.id,
});

}

private async createAuthAuditLog(input: {
  tenantId?: string | null;
  actorUserId?: string | null;
  action: string;
  entityId?: string | null;
  metadata?: Prisma.InputJsonValue;
}) {
  await this.prisma.auditLog.create({
    data: {
      tenantId: input.tenantId || null,
      actorUserId: input.actorUserId || null,
      action: input.action,
      entityType: 'AUTH_SECURITY',
      entityId: input.entityId || input.actorUserId || null,
      ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
    },
  });
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

  const commonPasswords = new Set([
    'password',
    'password123',
    'admin123',
    'admin@123',
    'qwerty123',
    'welcome123',
    '12345678',
    '123456789',
    '1234567890',
  ]);

  if (commonPasswords.has(password.toLowerCase())) {
    throw new BadRequestException('Password is too common');
  }
}

private hashResetToken(token: string) {
 return createHash('sha256').update(token).digest('hex');
}

async revokeTrustedDevice(token?: string) {
  const tokenHash = this.hashTrustedDeviceToken(token);

  if (!tokenHash) {
    return;
  }

  await this.prisma.trustedDevice.updateMany({
    where: {
      tokenHash,
      revokedAt: null,
    },
    data: {
      revokedAt: new Date(),
    },
  });
}

private async isValidTrustedDevice(
userId: string,
token?: string,
userAgent?: string,
) {
const tokenHash = this.hashTrustedDeviceToken(token);

if (!tokenHash) {
 return false;
}

const trustedDevice = await this.prisma.trustedDevice.findFirst({
 where: {
   userId,
   tokenHash,
   revokedAt: null,
   expiresAt: {
     gt: new Date(),
   },
 },
 select: {
   id: true,
   userAgent: true,
 },
});

if (!trustedDevice) {
 return false;
}

const cleanUserAgent = String(userAgent || '').slice(0, 300) || null;

if (trustedDevice.userAgent && trustedDevice.userAgent !== cleanUserAgent) {
 return false;
}

await this.prisma.trustedDevice.update({
 where: {
   id: trustedDevice.id,
 },
 data: {
   lastUsedAt: new Date(),
 },
});

return true;
}

private async createTrustedDevice(input: {
  userId: string;
  userAgent?: string;
  ipAddress?: string;
}) {
  const token = randomBytes(32).toString('hex');
  const tokenHash = this.hashTrustedDeviceToken(token);

  if (!tokenHash) {
    throw new UnauthorizedException('Trusted device token could not be created');
  }

  await this.prisma.trustedDevice.create({
    data: {
      userId: input.userId,
      tokenHash,
      userAgent: String(input.userAgent || '').slice(0, 300) || null,
      ipAddress: String(input.ipAddress || '').slice(0, 80) || null,
      expiresAt: new Date(Date.now() + this.trustedDeviceExpiryMs),
      lastUsedAt: new Date(),
    },
  });

  return token;
}

private hashTrustedDeviceToken(token?: string) {
  const cleanToken = String(token || '').trim();

  if (!cleanToken) {
    return null;
  }

  return createHash('sha256').update(cleanToken).digest('hex');
}

  private cleanSlug(value?: string) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }
}