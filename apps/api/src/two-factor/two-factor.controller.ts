import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from '../auth/auth.service';
import { TwoFactorService } from './two-factor.service';

@Controller('two-factor')
export class TwoFactorController {
  constructor(
    private readonly twoFactorService: TwoFactorService,
    private readonly authService: AuthService,
  ) {}

  @Get('status')
  async status(@Req() request: Request) {
    const user = await this.authService.requireUserFromRequest(request);

    return this.twoFactorService.getStatus(
      user.userId,
      user.tenantId,
      user.role,
    );
  }

@Post('setup/start')
async startSetup(
  @Req() request: Request,
  @Body() body: { password?: string },
) {
  const user = await this.authService.requireUserFromRequest(request);

  return this.twoFactorService.startSetup(
    user.userId,
    user.tenantId,
    body.password,
  );
}

  @Post('setup/confirm')
  async confirmSetup(@Req() request: Request, @Body() body: { code?: string }) {
    const user = await this.authService.requireUserFromRequest(request);

    return this.twoFactorService.confirmSetup(
      user.userId,
      user.tenantId,
      body.code,
    );
  }

  @Post('backup-codes/regenerate')
  async regenerateBackupCodes(
    @Req() request: Request,
    @Body() body: { password?: string; code?: string },
  ) {
    const user = await this.authService.requireUserFromRequest(request);

    return this.twoFactorService.regenerateBackupCodes(
      user.userId,
      user.tenantId,
      body.password,
      body.code,
    );
  }

  @Post('disable')
  async disable(
    @Req() request: Request,
    @Body() body: { password?: string; code?: string },
  ) {
    const user = await this.authService.requireUserFromRequest(request);

    return this.twoFactorService.disable(
      user.userId,
      user.tenantId,
      body.password,
      body.code,
    );
  }
}