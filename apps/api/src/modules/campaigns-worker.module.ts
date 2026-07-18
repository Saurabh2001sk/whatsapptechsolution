import { Module } from '@nestjs/common';
import { BillingModule } from './billing.module';
import { MediaModule } from './media.module';
import { MetaAccountsModule } from './meta-accounts.module';
import { CampaignsProcessor } from '../Processor/campaigns.processor';
import { CampaignQueue } from '../Queues/campaigns.queue';
import { CampaignsService } from '../services/campaigns.service';
import { DripsWorkerModule } from './drips-worker.module';

@Module({
  imports: [
    MetaAccountsModule,
    BillingModule,
    MediaModule,
    DripsWorkerModule,
  ],
  providers: [
    CampaignQueue,
    CampaignsService,
    CampaignsProcessor,
  ],
})

export class CampaignsWorkerModule {}