import { Module } from '@nestjs/common';
import { ConversationsController } from '../controller/conversations.controller';
import { ConversationsService } from '../services/conversations.service';
import { AuthModule } from './auth.module';

@Module({
  imports: [AuthModule],
  controllers: [ConversationsController],
  providers: [ConversationsService],
  exports: [ConversationsService],
})
export class ConversationsModule {}