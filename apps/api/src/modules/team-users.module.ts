import { Module } from '@nestjs/common';
import { AuthModule } from './auth.module';
import { BillingModule } from './billing.module';
import { DatabaseModule } from './database.module';
import { TeamUsersController } from '../controller/team-users.controller';
import { TeamUsersService } from '../services/team-users.service';

@Module({
imports: [DatabaseModule, AuthModule, BillingModule],
controllers: [TeamUsersController],
providers: [TeamUsersService],
})
export class TeamUsersModule {}