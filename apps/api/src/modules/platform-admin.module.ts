import { Module } from '@nestjs/common';
import { AuthModule } from './auth.module';
import { DatabaseModule } from './database.module';
import { PlatformAdminController } from '../controller/platform-admin.controller';
import { PlatformAdminService } from '../services/platform-admin.service';

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [PlatformAdminController],
  providers: [PlatformAdminService],
})
export class PlatformAdminModule {}