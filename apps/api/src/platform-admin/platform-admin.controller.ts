import {
  Body,
  Controller,
  HttpCode,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { CookieOptions, Request, Response } from 'express';
import { AuthService } from '../auth/auth.service';
import { requireRole } from '../auth/require-role';
import { env } from '../config/env';
import { PlatformAdminService } from './platform-admin.service';

const accessTokenCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: env.isProduction,
  sameSite: env.isProduction ? 'none' : 'lax',
  maxAge: 12 * 60 * 60 * 1000,
  path: '/',
};

@Controller('platform-admin')
export class PlatformAdminController {
  constructor(
    private readonly authService: AuthService,
    private readonly platformAdminService: PlatformAdminService,
  ) {}

  @Post('impersonation/start')
  @HttpCode(200)
  async startImpersonation(
    @Req() request: Request,
    @Body() body: { tenantId?: string },
    @Res({ passthrough: true }) response: Response,
  ) {
    const user = await this.authService.requireUserFromRequest(request);

    requireRole(user, ['platform_admin', 'super_admin']);

    const result = await this.platformAdminService.startImpersonation(
      user,
      body.tenantId,
    );

    response.cookie('access_token', result.token, accessTokenCookieOptions);

    return {
      tenant: result.tenant,
      user: result.user,
      impersonation: result.impersonation,
    };
  }

  @Post('impersonation/stop')
  @HttpCode(200)
  async stopImpersonation(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const user = await this.authService.requireUserFromRequest(request);
    const result = await this.platformAdminService.stopImpersonation(user);

    response.cookie('access_token', result.token, accessTokenCookieOptions);

    return {
      tenant: result.tenant,
      user: result.user,
      impersonation: result.impersonation,
    };
  }
}