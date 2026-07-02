import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { AuthModule } from './auth/auth.module';
import { ContactTypesModule } from './contact-types/contact-types.module';
import { ContactsModule } from './contacts/contacts.module';
import { CryptoModule } from './crypto/crypto.module';
import { DatabaseModule } from './database/database.module';
import { HealthController } from './health.controller';
import { MetaAccountsModule } from './meta-accounts/meta-accounts.module';
import { TemplatesModule } from './templates/templates.module';
import { TenantsModule } from './tenants/tenants.module';
import { MediaModule } from './media/media.module';
import { CampaignsModule } from './campaigns/campaigns.module';
import { BillingModule } from './billing/billing.module';
import { NotificationsModule } from './notifications/notifications.module';
import { AuditLogsModule } from './audit-logs/audit-logs.module';
import { SecurityModule } from './security/security.module';
import { PlatformAdminModule } from './platform-admin/platform-admin.module';
import { TeamUsersModule } from './team-users/team-users.module';
import { SentryExceptionFilter } from './security/sentry.filter';

@Module({
  imports: [
    DatabaseModule,
    TenantsModule,
    AuthModule,
    ContactsModule,
    ContactTypesModule,
    TemplatesModule,
    CryptoModule,
    MetaAccountsModule,
    MediaModule,
    CampaignsModule,
    BillingModule,
    NotificationsModule,
    AuditLogsModule,
    SecurityModule,
    PlatformAdminModule,
    TeamUsersModule,
  ],
  controllers: [HealthController],
  providers: [
    {
      provide: APP_FILTER,
      useClass: SentryExceptionFilter,
    },
  ],
})
export class AppModule {}