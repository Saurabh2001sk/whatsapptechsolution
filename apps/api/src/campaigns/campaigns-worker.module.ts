import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { MediaModule } from '../media/media.module';
import { MetaAccountsModule } from '../meta-accounts/meta-accounts.module';
import { CampaignsProcessor } from './campaigns.processor';
import { CampaignQueue } from './campaigns.queue';
import { CampaignsService } from './campaigns.service';

@Module({
imports: [MetaAccountsModule, BillingModule, MediaModule],
providers: [CampaignQueue, CampaignsService, CampaignsProcessor],
})
export class CampaignsWorkerModule {}