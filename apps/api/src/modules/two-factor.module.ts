import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from './auth.module';
import { CryptoModule } from './crypto.module';
import { DatabaseModule } from './database.module';
import { SecurityModule } from './security.module';
import { TwoFactorController } from '../controller/two-factor.controller';
import { TwoFactorService } from '../services/two-factor.service';

@Module({
  imports: [
    DatabaseModule,
    CryptoModule,
    SecurityModule,
    forwardRef(() => AuthModule),
  ],
  controllers: [TwoFactorController],
  providers: [TwoFactorService],
  exports: [TwoFactorService],
})
export class TwoFactorModule {}