import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from '../auth/auth.service';
import { requireRole } from '../auth/require-role';
import { TeamUsersService } from './team-users.service';

@Controller('team-users')
export class TeamUsersController {
  constructor(
    private readonly authService: AuthService,
    private readonly teamUsersService: TeamUsersService,
  ) {}

  @Get()
  async listTeamUsers(@Req() request: Request) {
    const user = await this.authService.requireUserFromRequest(request);

    requireRole(user, ['admin']);

    return this.teamUsersService.listTeamUsers(user.tenantId);
  }

  @Post()
  async createTeamUser(
    @Req() request: Request,
    @Body()
    body: {
      name?: string;
      email?: string;
      role?: string;
      password?: string;
    },
  ) {
    const user = await this.authService.requireUserFromRequest(request);

    requireRole(user, ['admin']);

    if (user.impersonating) {
      throw new ForbiddenException(
        'Impersonation cannot create tenant users.',
      );
    }

    return this.teamUsersService.createTeamUser(
      user.tenantId,
      user.userId,
      body,
    );
  }

  @Post(':id/deactivate')
  @HttpCode(200)
  async deactivateTeamUser(
    @Req() request: Request,
    @Param('id') userId: string,
  ) {
    const user = await this.authService.requireUserFromRequest(request);

    requireRole(user, ['admin']);

    if (user.impersonating) {
      throw new ForbiddenException(
        'Impersonation cannot deactivate tenant users.',
      );
    }

    return this.teamUsersService.deactivateTeamUser(
      user.tenantId,
      user.userId,
      userId,
    );
  }
}