import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from '../services/auth.service';
import { requireRole } from '../require-role';
import { env } from '../env';
import { TenantsService } from '../services/tenants.service';

@Controller('tenants')
export class TenantsController {
  constructor(
    private readonly tenantsService: TenantsService,
    private readonly authService: AuthService,
  ) {}

  @Get()
  async listTenants(@Req() request: Request) {
    const user = await this.authService.requireUserFromRequest(request);

    requireRole(user, ['platform_admin', 'super_admin']);

    return this.tenantsService.listTenants();
  }

  @Post()
  async createTenant(
    @Req() request: Request,
    @Body() body: { name?: string; slug?: string },
  ) {
    const user = await this.authService.requireUserFromRequest(request);

    requireRole(user, ['platform_admin', 'super_admin']);

    if (env.isProduction) {
      throw new ForbiddenException(
        'Tenant creation route is disabled in production',
      );
    }

    return this.tenantsService.createTenant(body, user.userId);
  }
}