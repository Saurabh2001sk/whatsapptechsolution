import { Module } from '@nestjs/common';
import { AuthModule } from './auth.module';
import { BillingModule } from './billing.module';
import { MediaController } from '../controller/media.controller';
import { MediaService } from '../services/media.service';

@Module({
  imports: [AuthModule, BillingModule],
  controllers: [MediaController],
  providers: [MediaService],
  exports: [MediaService],
})
export class MediaModule {}