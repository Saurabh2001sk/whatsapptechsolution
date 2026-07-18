import { Module } from '@nestjs/common';
import { AuthModule } from './auth.module';
import { DatabaseModule } from './database.module';
import { AuditLogsController } from '../controller/audit-logs.controller';
import { AuditLogsService } from '../services/audit-logs.service';

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [AuditLogsController],
  providers: [AuditLogsService],
})
export class AuditLogsModule {}