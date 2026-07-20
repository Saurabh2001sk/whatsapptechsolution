import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { AuthModule } from './auth.module';
import { ContactTypesModule } from './contact-types.module';
import { ContactsModule } from './contacts.module';
import { CryptoModule } from './crypto.module';
import { DatabaseModule } from './database.module';
import { HealthController } from '../controller/health.controller';
import { MetaAccountsModule } from './meta-accounts.module';
import { TemplatesModule } from './templates.module';
import { TenantsModule } from './tenants.module';
import { MediaModule } from './media.module';
import { CampaignsModule } from './campaigns.module';
import { BillingModule } from './billing.module';
import { NotificationsModule } from './notifications.module';
import { AuditLogsModule } from './audit-logs.module';
import { SecurityModule } from './security.module';
import { PlatformAdminModule } from './platform-admin.module';
import { TeamUsersModule } from './team-users.module';
import { DripsModule } from './drips.module';
import { ConversationsModule } from './conversations.module';
import { SentryExceptionFilter } from '../security/sentry.filter';

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
    DripsModule,
    ConversationsModule,
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