import { Module } from '@nestjs/common';
import { SecurityRateLimitService } from './security-rate-limit.service';

@Module({
  providers: [SecurityRateLimitService],
  exports: [SecurityRateLimitService],
})
export class SecurityModule {}