import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as nodemailer from 'nodemailer';
import { PrismaService } from '../database/prisma.service';

type NotifyInput = {
  tenantId?: string | null;
  event: string;
  subject: string;
  text: string;
  metadata?: Prisma.InputJsonValue;
};

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async sendToTenantAdmins(input: NotifyInput & { tenantId: string }) {
    const users = await this.prisma.user.findMany({
      where: {
        tenantId: input.tenantId,
        isActive: true,
        role: {
          in: ['admin', 'owner'],
        },
      },
      select: {
        email: true,
      },
    });

    await Promise.all(
      users.map((user) =>
        this.sendEmail({
          ...input,
          recipientEmail: user.email,
        }),
      ),
    );
  }

  async sendToPlatformAdmins(input: NotifyInput) {
    const users = await this.prisma.user.findMany({
      where: {
        isActive: true,
        role: {
          in: ['platform_admin', 'super_admin'],
        },
      },
      select: {
        email: true,
      },
    });

    const fallbackEmail = String(process.env.BILLING_ALERT_EMAIL || '').trim();
    const recipients = users.map((user) => user.email);

    if (fallbackEmail && !recipients.includes(fallbackEmail)) {
      recipients.push(fallbackEmail);
    }

    await Promise.all(
      recipients.map((recipientEmail) =>
        this.sendEmail({
          ...input,
          recipientEmail,
        }),
      ),
    );
  }

  async sendToEmail(input: NotifyInput & { recipientEmail: string }) {
 await this.sendEmail(input);
}

  private async sendEmail(input: NotifyInput & { recipientEmail: string }) {
    const recipientEmail = String(input.recipientEmail || '').trim();
    const subject = String(input.subject || '').trim();
    const text = String(input.text || '').trim();

    if (!recipientEmail || !recipientEmail.includes('@')) {
      return;
    }

    if (!subject || !text) {
      return;
    }

    const smtpHost = String(process.env.SMTP_HOST || '').trim();
    const smtpPort = Number(process.env.SMTP_PORT || 587);
    const smtpUser = String(process.env.SMTP_USER || '').trim();
    const smtpPass = String(process.env.SMTP_PASS || '').trim();
    const smtpFrom = String(process.env.SMTP_FROM || '').trim();
    const smtpSecure = String(process.env.SMTP_SECURE || 'false') === 'true';

    if (!smtpHost || !smtpFrom) {
      await this.createLog({
        ...input,
        recipientEmail,
        subject,
        status: 'SKIPPED',
        error: 'SMTP is not configured',
      });
      return;
    }

    try {
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpSecure,
        auth:
          smtpUser && smtpPass
            ? {
                user: smtpUser,
                pass: smtpPass,
              }
            : undefined,
      });

      await transporter.sendMail({
        from: smtpFrom,
        to: recipientEmail,
        subject,
        text,
      });

      await this.createLog({
        ...input,
        recipientEmail,
        subject,
        status: 'SENT',
      });
    } catch (error) {
      await this.createLog({
        ...input,
        recipientEmail,
        subject,
        status: 'FAILED',
        error: error instanceof Error ? error.message : 'Email send failed',
      });
    }
  }

  private async createLog(input: {
    tenantId?: string | null;
    event: string;
    recipientEmail: string;
    subject: string;
    status: string;
    error?: string | null;
    metadata?: Prisma.InputJsonValue;
  }) {
    await this.prisma.notificationLog.create({
      data: {
        tenantId: input.tenantId || null,
        event: input.event,
        channel: 'email',
        recipientEmail: input.recipientEmail,
        subject: input.subject,
        status: input.status,
        error: input.error || null,
        metadata: input.metadata || undefined,
      },
    });
  }
}