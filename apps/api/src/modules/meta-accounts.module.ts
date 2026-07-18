import { forwardRef, Module } from '@nestjs/common';
import { DripsModule } from './drips.module';
import { AuthModule } from './auth.module';
import { CryptoModule } from './crypto.module';
import { BillingModule } from './billing.module';
import { SecurityModule } from './security.module';
import { MetaAccountsController } from '../controller/meta-accounts.controller';
import { MetaAccountsService } from '../services/meta-accounts.service';

@Module({
  imports: [
    CryptoModule,
    AuthModule,
    BillingModule,
    SecurityModule,
    forwardRef(() => DripsModule),
  ],
  controllers: [MetaAccountsController],
  providers: [MetaAccountsService],
  exports: [MetaAccountsService],
})
export class MetaAccountsModule {}