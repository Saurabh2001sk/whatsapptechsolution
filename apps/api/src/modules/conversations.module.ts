import { Module } from '@nestjs/common';
import { ConversationsController } from '../controller/conversations.controller';
import { ConversationsService } from '../services/conversations.service';
import { AuthModule } from './auth.module';
import { BillingModule } from './billing.module';

@Module({
  imports: [
    AuthModule,
    BillingModule,
  ],
  controllers: [
    ConversationsController,
  ],
  providers: [
    ConversationsService,
  ],
  exports: [
    ConversationsService,
  ],
})
export class ConversationsModule {}