import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ContactTypesController } from './contact-types.controller';
import { ContactTypesService } from './contact-types.service';

@Module({
  imports: [AuthModule],
  controllers: [ContactTypesController],
  providers: [ContactTypesService],
})
export class ContactTypesModule {}