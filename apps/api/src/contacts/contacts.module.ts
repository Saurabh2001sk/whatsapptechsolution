import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BillingModule } from '../billing/billing.module';
import { DatabaseModule } from '../database/database.module';
import { ContactsController } from './contacts.controller';
import { ContactsService } from './contacts.service';

@Module({
imports: [DatabaseModule, AuthModule, BillingModule],
  controllers: [ContactsController],
  providers: [ContactsService],
})
export class ContactsModule {}