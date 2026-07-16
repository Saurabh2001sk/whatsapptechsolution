import {
  Controller,
  Get,
  Headers,
  UnauthorizedException,
} from '@nestjs/common';
import { env } from './config/env';
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
  async getDatabaseHealth(
    @Headers('x-health-check-secret') providedSecret?: string,
  ) {
    if (!env.healthDbSecret) {
      throw new UnauthorizedException(
        'Database health endpoint is not configured',
      );
    }

    if (providedSecret !== env.healthDbSecret) {
      throw new UnauthorizedException(
        'Invalid health check secret',
      );
    }

    await this.prisma.$queryRaw`SELECT 1`;

    return {
      ok: true,
      database: 'connected',
    };
  }
}