import { Controller, Get } from '@nestjs/common';
import { PrismaService } from './database/prisma.service';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  getHealth() {
    return {
      ok: true,
      service: 'api',
    };
  }

  @Get('db')
  async getDatabaseHealth() {
    await this.prisma.$queryRaw`SELECT 1`;

    return {
      ok: true,
      database: 'connected',
    };
  }
}