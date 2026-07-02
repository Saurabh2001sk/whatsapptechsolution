import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BillingModule } from '../billing/billing.module';
import { MediaModule } from '../media/media.module';
import { MetaAccountsModule } from '../meta-accounts/meta-accounts.module';
import { TemplatesController } from './templates.controller';
import { TemplatesService } from './templates.service';

@Module({
  imports: [MetaAccountsModule, MediaModule, AuthModule, BillingModule],
  controllers: [TemplatesController],
  providers: [TemplatesService],
})
export class TemplatesModule {}