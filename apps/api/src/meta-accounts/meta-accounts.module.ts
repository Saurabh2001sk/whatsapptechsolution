import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CryptoModule } from '../crypto/crypto.module';
import { BillingModule } from '../billing/billing.module';
import { MetaAccountsController } from './meta-accounts.controller';
import { MetaAccountsService } from './meta-accounts.service';

@Module({
  imports: [CryptoModule, AuthModule ,BillingModule],
  controllers: [MetaAccountsController],
  providers: [MetaAccountsService],
  exports: [MetaAccountsService],
})
export class MetaAccountsModule {}