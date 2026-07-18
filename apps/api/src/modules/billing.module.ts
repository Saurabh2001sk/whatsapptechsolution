import { Module } from '@nestjs/common';
import { AuthModule } from './auth.module';
import { BillingController } from '../controller/billing.controller';
import { BillingService } from '../services/billing.service';
import { NotificationsModule } from './notifications.module';

@Module({
  imports: [AuthModule, NotificationsModule],
  controllers: [BillingController],
  providers: [BillingService],
  exports: [BillingService],
})
export class BillingModule {}