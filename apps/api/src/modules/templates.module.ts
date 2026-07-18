import { Module } from '@nestjs/common';
import { AuthModule } from './auth.module';
import { BillingModule } from './billing.module';
import { MediaModule } from './media.module';
import { MetaAccountsModule } from './meta-accounts.module';
import { TemplatesController } from '../controller/templates.controller';
import { TemplatesService } from '../services/templates.service';

@Module({
  imports: [MetaAccountsModule, MediaModule, AuthModule, BillingModule],
  controllers: [TemplatesController],
  providers: [TemplatesService],
})
export class TemplatesModule {}