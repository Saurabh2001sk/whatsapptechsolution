import {
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as nodemailer from 'nodemailer';
import { PrismaService } from './prisma.service';
import { env } from '../env';


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
            connectionTimeout: 10_000,
            greetingTimeout: 10_000,
            socketTimeout: 15_000,
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
  `SMTP verification failed: ${this.sanitizeNotificationError(
    error instanceof Error
      ? error.message
      : 'Unknown SMTP error',
  )}`,
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

const recipients = this.getUniqueRecipients(
  users.map((user) => user.email),
);

await Promise.all(
  recipients.map((recipientEmail) =>
    this.sendEmail({
      ...input,
      recipientEmail,
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

const recipients = this.getUniqueRecipients([
  ...users.map((user) => user.email),
  fallbackEmail,
]);

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

const subject = String(
  input.subject || '',
)
  .replace(/[\r\n]+/g, ' ')
  .trim()
  .slice(0, 200);

const text = String(
  input.text || '',
)
  .trim()
  .slice(0, 10_000);

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
    signal: AbortSignal.timeout(15_000),
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
  await response.body?.cancel();

  throw new Error(
    `Brevo API returned HTTP ${response.status}`,
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
  this.sanitizeNotificationError(
    error instanceof Error
      ? error.message
      : 'Brevo email send failed',
  );

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
  this.sanitizeNotificationError(
    error instanceof Error
      ? error.message
      : 'Email send failed',
  );

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

private sanitizeNotificationError(
  value: unknown,
) {
  return String(
    value || 'Email delivery failed',
  )
    .replace(
      /Bearer\s+[A-Za-z0-9._~+/=-]+/gi,
      'Bearer [REDACTED]',
    )
    .replace(
      /(["']?api-key["']?\s*[:=]\s*["']?)[^"',\s}]+/gi,
      '$1[REDACTED]',
    )
    .replace(
      /([?&](?:api_key|apikey|access_token|token)=)[^&\s]+/gi,
      '$1[REDACTED]',
    )
    .replace(
      /(smtp:\/\/[^:\s/@]+:)[^@\s/]+@/gi,
      '$1[REDACTED]@',
    )
    .replace(
      /(["']?(?:password|smtpPass|smtp_pass)["']?\s*[:=]\s*["']?)[^"',\s}]+/gi,
      '$1[REDACTED]',
    )
    .slice(0, 1000);
}

  private getUniqueRecipients(
  values: Array<string | null | undefined>,
) {
  const recipients = new Map<string, string>();

  for (const value of values) {
    const email = String(value || '')
      .trim()
      .toLowerCase();

    if (!email || !email.includes('@')) {
      continue;
    }

    if (!recipients.has(email)) {
      recipients.set(email, email);
    }
  }

  return Array.from(recipients.values());
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