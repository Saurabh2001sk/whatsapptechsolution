import { forwardRef, Module } from '@nestjs/common';
import { AuthModule } from './auth.module';
import { BillingModule } from './billing.module';
import { MediaModule } from './media.module';
import { MetaAccountsModule } from './meta-accounts.module';
import { SecurityModule } from './security.module';
import { DripsController } from '../controller/drips.controller';
import { DripsService } from '../services/drips.service';
import { DripsQueue } from '../Queues/drips.queue';

@Module({
  imports: [
    AuthModule,
    BillingModule,
    MediaModule,
    SecurityModule,
    forwardRef(() => MetaAccountsModule),
  ],
  controllers: [DripsController],
  providers: [DripsService, DripsQueue],
  exports: [DripsService, DripsQueue],
})
export class DripsModule {}
