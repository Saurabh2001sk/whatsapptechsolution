import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { MetaAccountsModule } from '../meta-accounts/meta-accounts.module';
import { CampaignsProcessor } from './campaigns.processor';
import { CampaignQueue } from './campaigns.queue';
import { CampaignsService } from './campaigns.service';

@Module({
  imports: [MetaAccountsModule, BillingModule],
  providers: [CampaignQueue, CampaignsService, CampaignsProcessor],
})
export class CampaignsWorkerModule {}