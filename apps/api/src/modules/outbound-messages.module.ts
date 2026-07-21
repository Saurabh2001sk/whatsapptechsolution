import { Module } from '@nestjs/common';
import { MessagesQueue } from '../Queues/messages.queue';

@Module({
  providers: [
    MessagesQueue,
  ],
  exports: [
    MessagesQueue,
  ],
})
export class OutboundMessagesModule {}