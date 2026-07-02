import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';
import { CryptoService } from '../crypto/crypto.service';
import { PrismaService } from '../database/prisma.service';
import { SecurityRateLimitService } from '../security/security-rate-limit.service';
import type { Prisma } from '@prisma/client';

const QRCode = require('qrcode') as {
  toDataURL(value: string): Promise<string>;
};

type SecondFactorResult = {
  method: 'totp' | 'backup_code';
  backupCodeId?: string;
};

@Injectable()
export class TwoFactorService {
    private readonly maxLoginChallengeAttempts = 5;
constructor(
  private readonly prisma: PrismaService,
  private readonly crypto: CryptoService,
  private readonly rateLimiter: SecurityRateLimitService,
) {}

  async getStatus(userId: string, tenantId: string, role: string) {
    const user = await this.prisma.user.findFirst({
      where: {
        id: userId,
        tenantId,
        isActive: true,
      },
      select: {
        id: true,
        twoFactorEnabled: true,
        twoFactorConfirmedAt: true,
        twoFactorLastUsedAt: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('Not authenticated');
    }

    const backupCodesRemaining = await this.prisma.twoFactorBackupCode.count({
      where: {
        userId: user.id,
        usedAt: null,
      },
    });

    return {
      enabled: user.twoFactorEnabled,
      confirmedAt: user.twoFactorConfirmedAt,
      lastUsedAt: user.twoFactorLastUsedAt,
      required: this.isRequiredForRole(role),
      backupCodesRemaining,
    };
  }

async startSetup(userId: string, tenantId: string, password?: string) {
  const cleanPassword = String(password || '');

  if (!cleanPassword) {
    throw new BadRequestException('Password is required');
  }
    const user = await this.prisma.user.findFirst({
      where: {
        id: userId,
        tenantId,
        isActive: true,
      },
select: {
  id: true,
  email: true,
  passwordHash: true,
  twoFactorEnabled: true,
},
    });

    if (!user) {
      throw new UnauthorizedException('Not authenticated');
    }

if (user.twoFactorEnabled) {
  throw new BadRequestException('2FA is already enabled');
}

await this.rateLimiter.consume('two_factor_setup_user', user.id, {
  limit: 8,
  windowMs: 15 * 60 * 1000,
  message: 'Too many 2FA setup attempts. Please try again later.',
});

const passwordOk = await bcrypt.compare(cleanPassword, user.passwordHash);

if (!passwordOk) {
  await this.createAuditLog(user.id, tenantId, 'TWO_FACTOR_SETUP_PASSWORD_FAILED');

  throw new ForbiddenException('Invalid password');
}

const secret = this.generateBase32Secret();
    const encryptedSecret = this.crypto.encrypt(secret);
    const issuer = String(
      process.env.TWO_FACTOR_ISSUER || 'WhatsApp SaaS Platform',
    );
    const label = `${issuer}:${user.email}`;
    const otpauthUrl = `otpauth://totp/${encodeURIComponent(
      label,
    )}?secret=${encodeURIComponent(secret)}&issuer=${encodeURIComponent(
      issuer,
    )}&algorithm=SHA1&digits=6&period=30`;

    const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);

    await this.prisma.user.update({
      where: {
        id: user.id,
      },
      data: {
        twoFactorSecretEncrypted: encryptedSecret,
        twoFactorEnabled: false,
        twoFactorConfirmedAt: null,
        twoFactorLastUsedAt: null,
      },
    });
    await this.createAuditLog(user.id, tenantId, 'TWO_FACTOR_SETUP_STARTED');
    return {
      setupKey: secret,
      qrCodeDataUrl,
    };
  }

  async confirmSetup(userId: string, tenantId: string, code?: string) {
    const cleanCode = this.cleanCode(code);

    const user = await this.prisma.user.findFirst({
      where: {
        id: userId,
        tenantId,
        isActive: true,
      },
      select: {
        id: true,
        twoFactorSecretEncrypted: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('Not authenticated');
    }

    if (!user.twoFactorSecretEncrypted) {
      throw new BadRequestException('Start 2FA setup first');
    }

    await this.rateLimiter.consume('two_factor_confirm_user', user.id, {
  limit: 8,
  windowMs: 15 * 60 * 1000,
  message: 'Too many 2FA confirmation attempts. Please try again later.',
});

    const secret = this.crypto.decrypt(user.twoFactorSecretEncrypted);

    if (!this.verifyTotpCode(cleanCode, secret)) {
      throw new BadRequestException('Invalid authenticator code');
    }

    const backupCodes = this.generateBackupCodes();
    const backupCodeRows = await this.hashBackupCodes(user.id, backupCodes);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: {
          id: user.id,
        },
        data: {
          twoFactorEnabled: true,
          twoFactorConfirmedAt: new Date(),
          twoFactorLastUsedAt: new Date(),
        },
      }),
      this.prisma.twoFactorBackupCode.deleteMany({
        where: {
          userId: user.id,
        },
      }),
      this.prisma.twoFactorBackupCode.createMany({
        data: backupCodeRows,
      }),
    ]);

    await this.createAuditLog(user.id, tenantId, 'TWO_FACTOR_ENABLED');
    await this.createAuditLog(
      user.id,
      tenantId,
      'TWO_FACTOR_BACKUP_CODES_CREATED',
    );

    return {
      ok: true,
      backupCodes,
    };
  }

  async regenerateBackupCodes(
    userId: string,
    tenantId: string,
    password?: string,
    code?: string,
  ) {
    const cleanPassword = String(password || '');

    if (!cleanPassword) {
      throw new BadRequestException('Password is required');
    }

    const user = await this.prisma.user.findFirst({
      where: {
        id: userId,
        tenantId,
        isActive: true,
      },
      select: {
        id: true,
        passwordHash: true,
        twoFactorEnabled: true,
        twoFactorSecretEncrypted: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('Not authenticated');
    }

    if (!user.twoFactorEnabled || !user.twoFactorSecretEncrypted) {
      throw new BadRequestException('2FA is not enabled');
    }

    await this.rateLimiter.consume('two_factor_backup_regenerate_user', user.id, {
  limit: 6,
  windowMs: 15 * 60 * 1000,
  message: 'Too many backup code regeneration attempts. Please try again later.',
});

    const passwordOk = await bcrypt.compare(cleanPassword, user.passwordHash);

    if (!passwordOk) {
      throw new ForbiddenException('Invalid password');
    }

    const secondFactor = await this.verifySecondFactorForUser(
      user.id,
      user.twoFactorSecretEncrypted,
      code,
    );

    const backupCodes = this.generateBackupCodes();
    const backupCodeRows = await this.hashBackupCodes(user.id, backupCodes);

    await this.prisma.$transaction([
      this.prisma.twoFactorBackupCode.deleteMany({
        where: {
          userId: user.id,
        },
      }),
      this.prisma.twoFactorBackupCode.createMany({
        data: backupCodeRows,
      }),
    ]);

    if (secondFactor.method === 'backup_code') {
      await this.createAuditLog(
        user.id,
        tenantId,
        'TWO_FACTOR_BACKUP_CODE_USED',
      );
    }

    await this.createAuditLog(
      user.id,
      tenantId,
      'TWO_FACTOR_BACKUP_CODES_REGENERATED',
    );

    return {
      ok: true,
      backupCodes,
    };
  }

  async disable(userId: string, tenantId: string, password?: string, code?: string) {
    const cleanPassword = String(password || '');
    const cleanCode = this.cleanCode(code);

    if (!cleanPassword) {
      throw new BadRequestException('Password is required');
    }

    const user = await this.prisma.user.findFirst({
      where: {
        id: userId,
        tenantId,
        isActive: true,
      },
      select: {
        id: true,
        passwordHash: true,
        twoFactorEnabled: true,
        twoFactorSecretEncrypted: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('Not authenticated');
    }

    if (!user.twoFactorEnabled || !user.twoFactorSecretEncrypted) {
      throw new BadRequestException('2FA is not enabled');
    }

    await this.rateLimiter.consume('two_factor_disable_user', user.id, {
  limit: 6,
  windowMs: 15 * 60 * 1000,
  message: 'Too many 2FA disable attempts. Please try again later.',
});

    const passwordOk = await bcrypt.compare(cleanPassword, user.passwordHash);

    if (!passwordOk) {
      throw new ForbiddenException('Invalid password');
    }

    const secret = this.crypto.decrypt(user.twoFactorSecretEncrypted);

    if (!this.verifyTotpCode(cleanCode, secret)) {
      throw new BadRequestException('Invalid authenticator code');
    }

await this.prisma.$transaction([
this.prisma.user.update({
 where: {
   id: user.id,
 },
 data: {
   twoFactorEnabled: false,
   twoFactorSecretEncrypted: null,
   twoFactorConfirmedAt: null,
   twoFactorLastUsedAt: null,
   sessionVersion: {
     increment: 1,
   },
 },
}),
this.prisma.twoFactorBackupCode.deleteMany({
 where: {
   userId: user.id,
 },
}),
this.prisma.twoFactorLoginChallenge.deleteMany({
 where: {
   userId: user.id,
 },
}),
this.prisma.trustedDevice.updateMany({
 where: {
   userId: user.id,
   revokedAt: null,
 },
 data: {
   revokedAt: new Date(),
 },
}),
]);

    await this.createAuditLog(user.id, tenantId, 'TWO_FACTOR_DISABLED');

    return {
      ok: true,
    };
  }

  async createLoginChallenge(userId: string) {
    await this.prisma.twoFactorLoginChallenge.deleteMany({
      where: {
        userId,
        usedAt: null,
      },
    });

    const token = randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(token);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await this.prisma.twoFactorLoginChallenge.create({
      data: {
        userId,
        tokenHash,
        expiresAt,
      },
    });

    return token;
  }

  async verifyLoginChallenge(challengeToken?: string, code?: string) {
    const token = String(challengeToken || '').trim();

    if (!token) {
      throw new BadRequestException('2FA login token is required');
    }

    const tokenHash = this.hashToken(token);

    const challenge = await this.prisma.twoFactorLoginChallenge.findUnique({
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
      !challenge ||
    challenge.usedAt ||
    challenge.lockedAt ||
    challenge.expiresAt.getTime() < Date.now() ||
      !challenge.user.isActive ||
      challenge.user.tenant.status !== 'active' ||
      !challenge.user.twoFactorEnabled ||
      !challenge.user.twoFactorSecretEncrypted
    ) {
      throw new UnauthorizedException('Invalid or expired 2FA login');
    }

    let secondFactor: SecondFactorResult;

    try {
      secondFactor = await this.verifySecondFactorForUser(
        challenge.user.id,
        challenge.user.twoFactorSecretEncrypted,
        code,
      );
    } catch (error) {
      const failedAttempts = challenge.failedAttempts + 1;

      await this.prisma.twoFactorLoginChallenge.update({
        where: {
          id: challenge.id,
        },
        data: {
          failedAttempts,
          lockedAt:
            failedAttempts >= this.maxLoginChallengeAttempts
              ? new Date()
              : null,
        },
      });

      await this.createAuditLog(
        challenge.user.id,
        challenge.user.tenantId,
        failedAttempts >= this.maxLoginChallengeAttempts
          ? 'TWO_FACTOR_LOGIN_LOCKED'
          : 'TWO_FACTOR_LOGIN_FAILED',
      );

      throw error;
    }

const transactionItems: Prisma.PrismaPromise<unknown>[] = [
  this.prisma.twoFactorLoginChallenge.update({
    where: {
      id: challenge.id,
    },
    data: {
      usedAt: new Date(),
    },
  }),
  this.prisma.user.update({
    where: {
      id: challenge.userId,
    },
    data: {
      twoFactorLastUsedAt: new Date(),
    },
  }),
];

    if (secondFactor.backupCodeId) {
      transactionItems.push(
        this.prisma.twoFactorBackupCode.update({
          where: {
            id: secondFactor.backupCodeId,
          },
          data: {
            usedAt: new Date(),
          },
        }),
      );
    }

    await this.prisma.$transaction(transactionItems);

        await this.prisma.twoFactorLoginChallenge.deleteMany({
      where: {
        userId: challenge.userId,
        id: {
          not: challenge.id,
        },
      },
    });

    if (secondFactor.method === 'backup_code') {
      await this.createAuditLog(
        challenge.user.id,
        challenge.user.tenantId,
        'TWO_FACTOR_BACKUP_CODE_USED',
      );
    }

    await this.createAuditLog(
      challenge.user.id,
      challenge.user.tenantId,
      'TWO_FACTOR_LOGIN_VERIFIED',
    );

    return challenge.user;
  }

  isRequiredForRole(role: string) {
    return ['platform_admin', 'super_admin'].includes(role);
  }

  private async verifySecondFactorForUser(
    userId: string,
    encryptedSecret: string,
    code?: string,
  ): Promise<SecondFactorResult> {
    const rawCode = String(code || '').trim();

    if (!rawCode) {
      throw new BadRequestException('2FA code is required');
    }

    const secret = this.crypto.decrypt(encryptedSecret);
    const numericCode = rawCode.replace(/\D/g, '');

    if (
      numericCode.length === 6 &&
      this.verifyTotpCode(numericCode, secret)
    ) {
      return {
        method: 'totp',
      };
    }

    const backupCode = await this.findMatchingBackupCode(userId, rawCode);

    if (!backupCode) {
      throw new UnauthorizedException('Invalid authenticator or backup code');
    }

    return {
      method: 'backup_code',
      backupCodeId: backupCode.id,
    };
  }

  private async findMatchingBackupCode(userId: string, code: string) {
    const normalizedCode = this.normalizeBackupCode(code);

    if (!normalizedCode) {
      return null;
    }

    const backupCodes = await this.prisma.twoFactorBackupCode.findMany({
      where: {
        userId,
        usedAt: null,
      },
      select: {
        id: true,
        codeHash: true,
      },
    });

    for (const backupCode of backupCodes) {
      const isMatch = await bcrypt.compare(normalizedCode, backupCode.codeHash);

      if (isMatch) {
        return backupCode;
      }
    }

    return null;
  }

  private generateBackupCodes() {
    return Array.from({ length: 10 }, () => this.generateBackupCode());
  }

  private generateBackupCode() {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const bytes = randomBytes(12);
    let value = '';

    for (const byte of bytes) {
      value += alphabet[byte % alphabet.length];
    }

    return `${value.slice(0, 4)}-${value.slice(4, 8)}-${value.slice(8, 12)}`;
  }

  private async hashBackupCodes(userId: string, backupCodes: string[]) {
    const rows = [];

    for (const code of backupCodes) {
      rows.push({
        userId,
        codeHash: await bcrypt.hash(this.normalizeBackupCode(code), 12),
      });
    }

    return rows;
  }

  private normalizeBackupCode(code: string) {
    return String(code || '')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');
  }

  private generateBase32Secret() {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    const bytes = randomBytes(20);

    let secret = '';

    for (const byte of bytes) {
      secret += alphabet[byte % alphabet.length];
    }

    return secret;
  }

  private verifyTotpCode(token: string, secret: string) {
    const cleanToken = String(token || '').replace(/\D/g, '');

    if (cleanToken.length !== 6) {
      return false;
    }

    const currentCounter = Math.floor(Date.now() / 30000);

    for (let offset = -1; offset <= 1; offset += 1) {
      const expectedToken = this.generateTotpCode(secret, currentCounter + offset);

      if (expectedToken === cleanToken) {
        return true;
      }
    }

    return false;
  }

  private generateTotpCode(secret: string, counter: number) {
    const key = this.decodeBase32(secret);
    const counterBuffer = Buffer.alloc(8);
    const crypto = require('crypto') as typeof import('crypto');

    counterBuffer.writeBigUInt64BE(BigInt(counter));

    const digest = crypto
      .createHmac('sha1', key)
      .update(counterBuffer)
      .digest();

    const offset = digest[digest.length - 1] & 0x0f;
    const binaryCode =
      (((digest[offset] & 0x7f) << 24) |
        ((digest[offset + 1] & 0xff) << 16) |
        ((digest[offset + 2] & 0xff) << 8) |
        (digest[offset + 3] & 0xff)) >>> 0;

    return String(binaryCode % 1000000).padStart(6, '0');
  }

  private decodeBase32(value: string) {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    const cleanValue = String(value || '')
      .replace(/=+$/g, '')
      .replace(/\s/g, '')
      .toUpperCase();

    let bits = '';
    const bytes: number[] = [];

    for (const char of cleanValue) {
      const index = alphabet.indexOf(char);

      if (index === -1) {
        throw new BadRequestException('Invalid 2FA secret');
      }

      bits += index.toString(2).padStart(5, '0');
    }

    for (let index = 0; index + 8 <= bits.length; index += 8) {
      bytes.push(parseInt(bits.slice(index, index + 8), 2));
    }

    return Buffer.from(bytes);
  }

  private cleanCode(code?: string) {
    const cleanCode = String(code || '').replace(/\D/g, '');

    if (cleanCode.length !== 6) {
      throw new BadRequestException('Enter a valid 6-digit authenticator code');
    }

    return cleanCode;
  }

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

private async createAuditLog(userId: string, tenantId: string, action: string) {
  await this.prisma.auditLog.create({
    data: {
      tenantId,
      actorUserId: userId,
      action,
      entityType: 'USER_SECURITY',
      entityId: userId,
    },
  });
}
}