import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MetaAccountsModule } from '../meta-accounts/meta-accounts.module';
import { BillingModule } from '../billing/billing.module';
import { CampaignsController } from './campaigns.controller';
import { CampaignsProcessor } from './campaigns.processor';
import { CampaignQueue } from './campaigns.queue';
import { CampaignsService } from './campaigns.service';

@Module({
  imports: [MetaAccountsModule, AuthModule, BillingModule],
  controllers: [CampaignsController],
providers: [CampaignsService, CampaignQueue, CampaignsProcessor],
  exports: [CampaignsService],
})
export class CampaignsModule {}