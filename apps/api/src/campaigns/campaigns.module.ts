import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BillingModule } from '../billing/billing.module';
import { env } from '../config/env';
import { MediaModule } from '../media/media.module';
import { MetaAccountsModule } from '../meta-accounts/meta-accounts.module';
import { CampaignsController } from './campaigns.controller';
import { CampaignsProcessor } from './campaigns.processor';
import { CampaignQueue } from './campaigns.queue';
import { CampaignsService } from './campaigns.service';

const apiCampaignProcessorProviders =
env.enableApiCampaignProcessor ? [CampaignsProcessor] : [];

@Module({
imports: [MetaAccountsModule, AuthModule, BillingModule, MediaModule],
controllers: [CampaignsController],
providers: [
CampaignsService,
CampaignQueue,
...apiCampaignProcessorProviders,
],
exports: [CampaignsService],
})
export class CampaignsModule {}