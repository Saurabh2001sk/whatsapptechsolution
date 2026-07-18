import { Module } from '@nestjs/common';
import { DripsModule } from './drips.module';
import { DripsProcessor } from '../Processor/drips.processor';

@Module({
  imports: [DripsModule],
  providers: [DripsProcessor],
})
export class DripsWorkerModule {}
