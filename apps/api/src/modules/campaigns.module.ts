import { Module } from '@nestjs/common';
import { AuthModule } from './auth.module';
import { BillingModule } from './billing.module';
import { env } from '../env';
import { MediaModule } from './media.module';
import { MetaAccountsModule } from './meta-accounts.module';
import { CampaignsController } from '../controller/campaigns.controller';
import { CampaignsProcessor } from '../Processor/campaigns.processor';
import { CampaignQueue } from '../Queues/campaigns.queue';
import { CampaignsService } from '../services/campaigns.service';

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