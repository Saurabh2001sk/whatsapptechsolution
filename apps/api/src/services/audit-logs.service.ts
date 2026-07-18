import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from './prisma.service';
import { env } from '../env';

const sensitiveMetadataKeys = [
  'access_token',
  'accesstoken',
  'authorization',
  'backupcode',
  'backupcodes',
  'code',
  'cookie',
  'jwt',
  'otp',
  'password',
  'passwordhash',
  'qrcode',
  'qr',
  'secret',
  'setupkey',
  'token',
  'twofactortoken',
];

const auditRetentionIntervalMs =
  24 * 60 * 60 * 1000;

export type AuditLogFilters = {
  q?: string;
  action?: string;
  actorUserId?: string;
  from?: string;
  to?: string;
  limit?: string;
};

@Injectable()
export class AuditLogsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AuditLogsService.name);
  private retentionTimer: NodeJS.Timeout | null = null;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    if (!env.auditRetentionEnabled) {
      this.logger.log(
        'Automatic audit retention cleanup is disabled',
      );

      return;
    }

    this.retentionTimer = setInterval(() => {
      void this.cleanupOldAuditLogs();
    }, auditRetentionIntervalMs);

    void this.cleanupOldAuditLogs();
  }

  onModuleDestroy() {
    if (this.retentionTimer) {
      clearInterval(this.retentionTimer);
    }
  }

  async getProductionReadiness(tenantId: string) {
const activeMetaAccount = await this.prisma.tenantMetaAccount.findFirst({
 where: {
   tenantId,
   isActive: true,
 },
 select: {
   id: true,
   wabaId: true,
   phoneNumberId: true,
   businessName: true,
 },
});

const checks = [
 this.readinessCheck(
   'node_env',
   'NODE_ENV is production',
   env.isProduction,
   `Current NODE_ENV: ${env.nodeEnv}`,
 ),
 this.readinessCheck(
   'web_origin',
   'WEB_ORIGIN is HTTPS in production',
   !env.isProduction || env.webOrigin.startsWith('https://'),
   env.isProduction
     ? 'Production frontend origin must use HTTPS'
     : 'Local development origin is allowed',
 ),
 this.readinessCheck(
   'database_url',
   'DATABASE_URL is configured',
   Boolean(env.databaseUrl),
   'Database connection string is present',
 ),
 this.readinessCheck(
   'jwt_secret',
   'JWT_SECRET is strong',
   env.jwtSecret.length >= 32,
   'JWT_SECRET must be at least 32 characters',
 ),
this.readinessCheck(
  'token_encryption_key',
  'TOKEN_ENCRYPTION_KEY is valid',
  this.isValidBase64EncryptionKey(env.tokenEncryptionKey),
  'TOKEN_ENCRYPTION_KEY must be a base64 encoded 32-byte key',
),
this.readinessCheck(
'media_storage_driver',
'Production media storage uses S3/R2/Spaces',
!env.isProduction || env.mediaStorageDriver === 's3',
env.isProduction
  ? `Current MEDIA_STORAGE_DRIVER: ${env.mediaStorageDriver}`
  : 'Local media storage is allowed only in development',
),
this.readinessCheck(
's3_media_config',
'S3 media configuration is complete',
!env.isProduction ||
  Boolean(env.s3Bucket && env.s3AccessKeyId && env.s3SecretAccessKey),
env.isProduction
  ? 'S3_BUCKET, S3_ACCESS_KEY_ID, and S3_SECRET_ACCESS_KEY are required'
  : 'S3 media config is optional in development',
),
 this.readinessCheck(
   'meta_app_id',
   'META_APP_ID is configured',
    Boolean(env.metaAppId),
   'Meta app id is required for Embedded Signup',
 ),
 this.readinessCheck(
   'meta_app_secret',
   'META_APP_SECRET is configured',
   Boolean(env.metaAppSecret),
   'Meta app secret is required for webhook signature verification',
 ),
 this.readinessCheck(
   'meta_webhook_verify_token',
   'META_WEBHOOK_VERIFY_TOKEN is configured',
   Boolean(String(env.metaWebhookVerifyToken || '').trim()),
   'Webhook verify token is required for Meta webhook setup',
 ),
 this.readinessCheck(
   'campaign_webhook_sync_secret',
   'CAMPAIGN_WEBHOOK_SYNC_SECRET is configured',
   Boolean(String(env.campaignWebhookSyncSecret || '').trim()),
   'Internal campaign webhook sync route must be secret protected',
 ),
 this.readinessCheck(
   'active_whatsapp_account',
   'Active WhatsApp account is connected',
   Boolean(activeMetaAccount),
   activeMetaAccount
     ? `Connected phone number id: ${activeMetaAccount.phoneNumberId}`
     : 'Connect one active Meta WhatsApp account',
 ),
];

return {
 ok: checks.every((check) => check.status !== 'fail'),
 checkedAt: new Date().toISOString(),
 environment: {
   nodeEnv: env.nodeEnv,
   isProduction: env.isProduction,
 },
 checks,
};
}

private isValidBase64EncryptionKey(value: string) {
  try {
    return Buffer.from(value, 'base64').length === 32;
  } catch {
    return false;
  }
}

private readinessCheck(
key: string,
title: string,
passed: boolean,
details: string,
) {
return {
 key,
 title,
 status: passed ? 'pass' : 'fail',
 details,
};
}

  async cleanupOldAuditLogs() {
    const cutoffDate = new Date(
      Date.now() -
        env.auditRetentionDays *
          24 *
          60 *
          60 *
          1000,
    );

    try {
      const [securityLogs, billingLogs, campaignLogs, notificationLogs] =
        await this.prisma.$transaction([
          this.prisma.auditLog.deleteMany({
            where: {
              createdAt: {
                lt: cutoffDate,
              },
            },
          }),
          this.prisma.billingAuditLog.deleteMany({
            where: {
              createdAt: {
                lt: cutoffDate,
              },
            },
          }),
          this.prisma.campaignAuditLog.deleteMany({
            where: {
              createdAt: {
                lt: cutoffDate,
              },
            },
          }),
          this.prisma.notificationLog.deleteMany({
            where: {
              createdAt: {
                lt: cutoffDate,
              },
            },
          }),
        ]);

      const deletedCount =
        securityLogs.count +
        billingLogs.count +
        campaignLogs.count +
        notificationLogs.count;

      if (deletedCount > 0) {
        this.logger.log(
          `Audit retention cleanup deleted ${deletedCount} logs older than ${env.auditRetentionDays} days`,
        );
      }
    } catch (error) {
      this.logger.error(
        error instanceof Error
          ? `Audit retention cleanup failed: ${error.message}`
          : 'Audit retention cleanup failed',
      );
    }
  }

  async listTenantAuditLogs(tenantId: string, filters: AuditLogFilters = {}) {
    const logs = await this.prisma.auditLog.findMany({
      where: this.buildAuditWhere(tenantId, filters),
      orderBy: {
        createdAt: 'desc',
      },
      take: this.getSafeLimit(filters.limit),
      select: {
        id: true,
        action: true,
        entityType: true,
        entityId: true,
        actorUserId: true,
        createdAt: true,
        metadata: true,
      },
    });

    return logs.map((log) => ({
      ...log,
      metadata: this.sanitizeMetadata(log.metadata),
    }));
  }

  async listTenantBillingAuditLogs(
    tenantId: string,
    filters: AuditLogFilters = {},
  ) {
    const logs = await this.prisma.billingAuditLog.findMany({
      where: this.buildBillingAuditWhere(tenantId, filters),
      orderBy: {
        createdAt: 'desc',
      },
      take: this.getSafeLimit(filters.limit),
      select: {
        id: true,
        action: true,
        entityType: true,
        entityId: true,
        actorUserId: true,
        createdAt: true,
        metadata: true,
      },
    });

    return logs.map((log) => ({
      ...log,
      metadata: this.sanitizeMetadata(log.metadata),
    }));
  }

  async listTenantCampaignAuditLogs(
    tenantId: string,
    filters: AuditLogFilters = {},
  ) {
    const logs = await this.prisma.campaignAuditLog.findMany({
      where: this.buildCampaignAuditWhere(tenantId, filters),
      orderBy: {
        createdAt: 'desc',
      },
      take: this.getSafeLimit(filters.limit),
      select: {
        id: true,
        campaignId: true,
        actorUserId: true,
        action: true,
        createdAt: true,
        metadata: true,
      },
    });

    return logs.map((log) => ({
      ...log,
      metadata: this.sanitizeMetadata(log.metadata),
    }));
  }

  async listTenantNotificationLogs(
    tenantId: string,
    filters: AuditLogFilters = {},
  ) {
    const logs = await this.prisma.notificationLog.findMany({
      where: this.buildNotificationWhere(tenantId, filters),
      orderBy: {
        createdAt: 'desc',
      },
      take: this.getSafeLimit(filters.limit),
      select: {
        id: true,
        event: true,
        channel: true,
        recipientEmail: true,
        subject: true,
        status: true,
        error: true,
        metadata: true,
        createdAt: true,
      },
    });

    return logs.map((log) => ({
      ...log,
      error: this.redactText(log.error),
      metadata: this.sanitizeMetadata(log.metadata),
    }));
  }

  async exportTenantAuditLogsCsv(
    tenantId: string,
    source: 'security' | 'billing' | 'campaigns' | 'notifications',
    filters: AuditLogFilters = {},
  ) {
    const safeFilters = {
      ...filters,
      limit: '200',
    };

    const logs =
      source === 'billing'
        ? await this.listTenantBillingAuditLogs(tenantId, safeFilters)
        : source === 'campaigns'
          ? await this.listTenantCampaignAuditLogs(tenantId, safeFilters)
          : source === 'notifications'
            ? await this.listTenantNotificationLogs(tenantId, safeFilters)
            : await this.listTenantAuditLogs(tenantId, safeFilters);

    const rows = logs.map((log) => ({
      source,
      id: String(log.id || ''),
      action: String(
        'action' in log
          ? log.action || ''
          : 'event' in log
            ? log.event || ''
            : '',
      ),
      entity: this.getExportEntity(log),
      actor: String(
        'actorUserId' in log
          ? log.actorUserId || 'System'
          : 'recipientEmail' in log
            ? log.recipientEmail || ''
            : '',
      ),
      status: String('status' in log ? log.status || '' : ''),
      createdAt: new Date(log.createdAt).toISOString(),
      metadata: JSON.stringify(this.sanitizeMetadata(log.metadata || {})),
    }));

    return this.toCsv(rows);
  }

  private buildAuditWhere(
    tenantId: string,
    filters: AuditLogFilters,
  ): Prisma.AuditLogWhereInput {
    return {
      tenantId,
      ...this.buildCommonWhere(filters),
      ...(filters.q
        ? {
            OR: [
              {
                action: {
                  contains: filters.q,
                  mode: 'insensitive',
                },
              },
              {
                entityType: {
                  contains: filters.q,
                  mode: 'insensitive',
                },
              },
              {
                entityId: {
                  contains: filters.q,
                  mode: 'insensitive',
                },
              },
            ],
          }
        : {}),
    };
  }

  private buildBillingAuditWhere(
    tenantId: string,
    filters: AuditLogFilters,
  ): Prisma.BillingAuditLogWhereInput {
    return {
      tenantId,
      ...this.buildCommonWhere(filters),
      ...(filters.q
        ? {
            OR: [
              {
                action: {
                  contains: filters.q,
                  mode: 'insensitive',
                },
              },
              {
                entityType: {
                  contains: filters.q,
                  mode: 'insensitive',
                },
              },
              {
                entityId: {
                  contains: filters.q,
                  mode: 'insensitive',
                },
              },
            ],
          }
        : {}),
    };
  }

  private buildCampaignAuditWhere(
    tenantId: string,
    filters: AuditLogFilters,
  ): Prisma.CampaignAuditLogWhereInput {
    return {
      tenantId,
      ...this.buildCommonWhere(filters),
      ...(filters.q
        ? {
            OR: [
              {
                action: {
                  contains: filters.q,
                  mode: 'insensitive',
                },
              },
              {
                campaignId: {
                  contains: filters.q,
                  mode: 'insensitive',
                },
              },
            ],
          }
        : {}),
    };
  }

  private buildNotificationWhere(
    tenantId: string,
    filters: AuditLogFilters,
  ): Prisma.NotificationLogWhereInput {
    return {
      tenantId,
      ...(filters.from || filters.to
        ? {
            createdAt: this.buildDateWhere(filters),
          }
        : {}),
      ...(filters.action
        ? {
            event: {
              contains: filters.action,
              mode: 'insensitive',
            },
          }
        : {}),
      ...(filters.q
        ? {
            OR: [
              {
                event: {
                  contains: filters.q,
                  mode: 'insensitive',
                },
              },
              {
                recipientEmail: {
                  contains: filters.q,
                  mode: 'insensitive',
                },
              },
              {
                subject: {
                  contains: filters.q,
                  mode: 'insensitive',
                },
              },
              {
                status: {
                  contains: filters.q,
                  mode: 'insensitive',
                },
              },
            ],
          }
        : {}),
    };
  }

  private buildCommonWhere(filters: AuditLogFilters) {
    return {
      ...(filters.from || filters.to
        ? {
            createdAt: this.buildDateWhere(filters),
          }
        : {}),
      ...(filters.action
        ? {
            action: {
              contains: filters.action,
              mode: 'insensitive' as const,
            },
          }
        : {}),
      ...(filters.actorUserId
        ? {
            actorUserId: {
              contains: filters.actorUserId,
              mode: 'insensitive' as const,
            },
          }
        : {}),
    };
  }

  private buildDateWhere(filters: AuditLogFilters) {
    const dateFilter: Prisma.DateTimeFilter = {};

    if (filters.from) {
      const fromDate = new Date(filters.from);

      if (Number.isNaN(fromDate.getTime())) {
        throw new BadRequestException('Invalid from date');
      }

      dateFilter.gte = fromDate;
    }

    if (filters.to) {
      const toDate = new Date(filters.to);

      if (Number.isNaN(toDate.getTime())) {
        throw new BadRequestException('Invalid to date');
      }

      dateFilter.lte = toDate;
    }

    return dateFilter;
  }

  private getSafeLimit(limit?: string) {
    const parsedLimit = Number(limit || 50);

    if (!Number.isFinite(parsedLimit)) {
      return 50;
    }

    return Math.min(Math.max(Math.floor(parsedLimit), 1), 200);
  }

  private getExportEntity(log: Record<string, unknown>) {
    if (typeof log.campaignId === 'string') {
      return log.campaignId;
    }

    if (typeof log.entityType === 'string') {
      return `${log.entityType}${log.entityId ? `:${log.entityId}` : ''}`;
    }

    if (typeof log.channel === 'string') {
      return `${log.channel}:${log.status || ''}`;
    }

    return '';
  }

  private toCsv(rows: Array<Record<string, string>>) {
    const headers = [
      'source',
      'id',
      'action',
      'entity',
      'actor',
      'status',
      'createdAt',
      'metadata',
    ];

    const lines = [
      headers.join(','),
      ...rows.map((row) =>
        headers.map((header) => this.escapeCsv(row[header] || '')).join(','),
      ),
    ];

    return lines.join('\n');
  }

  private escapeCsv(value: string) {
    const rawValue = String(value ?? '');
    const safeValue = /^[=+\-@]/.test(rawValue) ? `'${rawValue}` : rawValue;

    return `"${safeValue.replace(/"/g, '""')}"`;
  }

  private sanitizeMetadata(value: unknown): unknown {
    if (!value) {
      return value;
    }

    if (Array.isArray(value)) {
      return value.map((item) => this.sanitizeMetadata(item));
    }

    if (typeof value === 'object') {
      const cleanObject: Record<string, unknown> = {};

      for (const [key, childValue] of Object.entries(value)) {
        if (this.isSensitiveKey(key)) {
          cleanObject[key] = '[REDACTED]';
          continue;
        }

        cleanObject[key] = this.sanitizeMetadata(childValue);
      }

      return cleanObject;
    }

    if (typeof value === 'string') {
      return this.redactText(value);
    }

    return value;
  }

  private isSensitiveKey(key: string) {
    const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');

    return sensitiveMetadataKeys.some((sensitiveKey) =>
      normalizedKey.includes(sensitiveKey),
    );
  }

  private redactText(value: string | null) {
    if (!value) {
      return value;
    }

    return value
      .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]')
      .replace(/access_token=([^&\s]+)/gi, 'access_token=[REDACTED]')
      .replace(/token=([^&\s]+)/gi, 'token=[REDACTED]')
      .replace(/password=([^&\s]+)/gi, 'password=[REDACTED]')
      .replace(/secret=([^&\s]+)/gi, 'secret=[REDACTED]');
  }
}