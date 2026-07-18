import { Module } from '@nestjs/common';
import { AuthModule } from './auth.module';
import { BillingModule } from './billing.module';
import { DatabaseModule } from './database.module';
import { ContactsController } from '../controller/contacts.controller';
import { ContactsService } from '../services/contacts.service';
import { DripsModule } from './drips.module';

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    BillingModule,
    DripsModule,
  ],
  controllers: [ContactsController],
  providers: [ContactsService],
})
export class ContactsModule {}