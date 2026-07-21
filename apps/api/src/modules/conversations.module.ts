import { Module } from '@nestjs/common';
import { ConversationsController } from '../controller/conversations.controller';
import { ConversationsService } from '../services/conversations.service';
import { AuthModule } from './auth.module';
import { BillingModule } from './billing.module';
import { OutboundMessagesModule } from './outbound-messages.module';
import { SecurityModule } from './security.module';

@Module({
  imports: [
    AuthModule,
    BillingModule,
    OutboundMessagesModule,
    SecurityModule,
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