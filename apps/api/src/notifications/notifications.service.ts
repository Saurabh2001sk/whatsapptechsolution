import {
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as nodemailer from 'nodemailer';
import { PrismaService } from '../database/prisma.service';
import { env } from '../config/env';


type NotifyInput = {
  tenantId?: string | null;
  event: string;
  subject: string;
  text: string;
  metadata?: Prisma.InputJsonValue;
};

@Injectable()
export class NotificationsService implements OnModuleInit {
  private readonly logger = new Logger(NotificationsService.name);

  private readonly smtpFrom = env.smtpFrom;

  private readonly brevoApiKey = env.brevoApiKey;

  private readonly brevoSenderName = env.brevoSenderName;

  private readonly brevoSenderEmail = env.brevoSenderEmail;

  private readonly transporter: nodemailer.Transporter | null;

  constructor(private readonly prisma: PrismaService) {
    const smtpHost = env.smtpHost;
    const smtpPort = env.smtpPort;
    const smtpUser = env.smtpUser;
    const smtpPass = env.smtpPass;
    const smtpSecure = env.smtpSecure;

    this.transporter =
      smtpHost && this.smtpFrom
        ? nodemailer.createTransport({
            host: smtpHost,
            port: smtpPort,
            secure: smtpSecure,
            pool: true,
            maxConnections: 3,
            maxMessages: 100,
            auth:
              smtpUser && smtpPass
                ? {
                    user: smtpUser,
                    pass: smtpPass,
                  }
                : undefined,
          })
        : null;
  }

  async onModuleInit() {
    if (this.brevoApiKey && this.brevoSenderEmail) {
      this.logger.log(
        'Brevo HTTPS email delivery is configured.',
      );

      return;
    }

    if (!this.transporter || !this.smtpFrom) {
      this.logger.error(
        'Email delivery is not configured. Add BREVO_API_KEY and BREVO_SENDER_EMAIL.',
      );

      return;
    }

    try {
      await this.transporter.verify();

      this.logger.log(
        'SMTP connection verified successfully.',
      );
    } catch (error) {
      this.logger.error(
        `SMTP verification failed: ${
          error instanceof Error
            ? error.message
            : 'Unknown SMTP error'
        }`,
      );
    }
  }

  async sendToTenantAdmins(
    input: NotifyInput & { tenantId: string },
  ) {
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

    const fallbackEmail =
      env.billingAlertEmail;

    const recipients = users.map((user) => user.email);

    if (
      fallbackEmail &&
      !recipients.includes(fallbackEmail)
    ) {
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

  async sendToEmail(
    input: NotifyInput & { recipientEmail: string },
  ) {
    await this.sendEmail(input);
  }

  private async sendEmail(
    input: NotifyInput & { recipientEmail: string },
  ) {
    const recipientEmail = String(
      input.recipientEmail || '',
    ).trim();

    const subject = String(input.subject || '').trim();
    const text = String(input.text || '').trim();

    if (
      !recipientEmail ||
      !recipientEmail.includes('@')
    ) {
      return;
    }

    if (!subject || !text) {
      return;
    }

    if (this.brevoApiKey && this.brevoSenderEmail) {
      try {
        const response = await fetch(
          'https://api.brevo.com/v3/smtp/email',
          {
            method: 'POST',
            headers: {
              accept: 'application/json',
              'api-key': this.brevoApiKey,
              'content-type': 'application/json',
            },
            body: JSON.stringify({
              sender: {
                name: this.brevoSenderName,
                email: this.brevoSenderEmail,
              },
              to: [
                {
                  email: recipientEmail,
                },
              ],
              subject,
              textContent: text,
            }),
          },
        );

        if (!response.ok) {
          const responseText = await response.text();

          throw new Error(
            `Brevo API returned ${response.status}: ${responseText.slice(0, 500)}`,
          );
        }

        this.logger.log(
          `Email sent successfully through Brevo to ${recipientEmail}`,
        );

        await this.createLog({
          ...input,
          recipientEmail,
          subject,
          status: 'SENT',
        });

        return;
      } catch (error) {
        const errorMessage =
          error instanceof Error
            ? error.message
            : 'Brevo email send failed';

        this.logger.error(
          `Brevo email failed for ${recipientEmail}: ${errorMessage}`,
        );

        await this.createLog({
          ...input,
          recipientEmail,
          subject,
          status: 'FAILED',
          error: errorMessage,
        });

        return;
      }
    }

    if (!this.transporter || !this.smtpFrom) {
      this.logger.error(
        `Email skipped for ${recipientEmail}: email delivery is not configured`,
      );

      await this.createLog({
        ...input,
        recipientEmail,
        subject,
        status: 'SKIPPED',
        error: 'Email delivery is not configured',
      });

      return;
    }

    try {
await this.transporter.sendMail({
  from: this.smtpFrom,
  to: recipientEmail,
  subject,
  text,
});

      this.logger.log(
        `Email sent successfully through SMTP to ${recipientEmail}`,
      );
      await this.createLog({
        ...input,
        recipientEmail,
        subject,
        status: 'SENT',
      });

} catch (error) {
  const errorMessage =
    error instanceof Error
      ? error.message
      : 'Email send failed';

  this.logger.error(
    `Email failed for ${recipientEmail}: ${errorMessage}`,
  );

  await this.createLog({
    ...input,
    recipientEmail,
    subject,
    status: 'FAILED',
    error: errorMessage,
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