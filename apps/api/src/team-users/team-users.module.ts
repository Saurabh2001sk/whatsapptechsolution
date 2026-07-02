import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BillingModule } from '../billing/billing.module';
import { DatabaseModule } from '../database/database.module';
import { TeamUsersController } from './team-users.controller';
import { TeamUsersService } from './team-users.service';

@Module({
imports: [DatabaseModule, AuthModule, BillingModule],
controllers: [TeamUsersController],
providers: [TeamUsersService],
})
export class TeamUsersModule {}