import { Module } from '@nestjs/common';
import { DatabaseModule } from './database.module';
import { NotificationsService } from '../services/notifications.service';

@Module({
  imports: [DatabaseModule],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}