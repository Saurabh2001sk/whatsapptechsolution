import { Module } from '@nestjs/common';
import { AuthModule } from './auth.module';
import { ContactTypesController } from '../controller/contact-types.controller';
import { ContactTypesService } from '../services/contact-types.service';

@Module({
  imports: [AuthModule],
  controllers: [ContactTypesController],
  providers: [ContactTypesService],
})
export class ContactTypesModule {}