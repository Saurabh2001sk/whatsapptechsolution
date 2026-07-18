import { Module } from '@nestjs/common';
import { AuthModule } from './auth.module';
import { TenantsController } from '../controller/tenants.controller';
import { TenantsService } from '../services/tenants.service';

@Module({
  imports: [AuthModule],
  controllers: [TenantsController],
  providers: [TenantsService],
  exports: [TenantsService],
})
export class TenantsModule {}