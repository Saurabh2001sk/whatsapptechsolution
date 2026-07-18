import { Module, forwardRef } from '@nestjs/common';
import { DatabaseModule } from './database.module';
import { NotificationsModule } from './notifications.module';
import { SecurityModule } from './security.module';
import { TwoFactorModule } from './two-factor.module';
import { AuthController } from '../controller/auth.controller';
import { AuthService } from '../services/auth.service';

@Module({
  imports: [
    DatabaseModule,
    NotificationsModule,
    SecurityModule,
    forwardRef(() => TwoFactorModule),
  ],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}