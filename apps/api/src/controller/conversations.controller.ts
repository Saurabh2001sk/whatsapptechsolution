import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import type { CurrentUser } from '../current-user';
import { requireRole } from '../require-role';
import { AuthService } from '../services/auth.service';
import { ConversationsService } from '../services/conversations.service';

const conversationUserRoles = [
  'admin',
  'manager',
  'agent',
  'platform_admin',
  'super_admin',
];

const conversationManagerRoles = [
  'admin',
  'manager',
  'platform_admin',
  'super_admin',
];

@Controller('conversations')
export class ConversationsController {
  constructor(
    private readonly conversationsService:
      ConversationsService,
    private readonly authService: AuthService,
  ) {}

  @Get()
  async list(
    @Req() request: Request,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('assigned') assigned?: string,
  ) {
    const user =
      await this.authService
        .requireUserFromRequest(request);

    requireRole(
      user,
      conversationUserRoles,
    );

    return this.conversationsService
      .listConversations(
        user.tenantId,
        user.userId,
        {
          limit,
          cursor,
          status,
          search,
          assigned,
        },
      );
  }

  @Get(':id')
  async getOne(
    @Req() request: Request,
    @Param('id') conversationId: string,
  ) {
    const user =
      await this.authService
        .requireUserFromRequest(request);

    requireRole(
      user,
      conversationUserRoles,
    );

    return this.conversationsService
      .getConversation(
        user.tenantId,
        conversationId,
      );
  }

  @Get(':id/messages')
  async listMessages(
    @Req() request: Request,
    @Param('id') conversationId: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    const user =
      await this.authService
        .requireUserFromRequest(request);

    requireRole(
      user,
      conversationUserRoles,
    );

    return this.conversationsService
      .listMessages(
        user.tenantId,
        conversationId,
        {
          limit,
          cursor,
        },
      );
  }

  @Patch(':id/status')
  async updateStatus(
    @Req() request: Request,
    @Param('id') conversationId: string,
    @Body() body: { status?: string },
  ) {
    const user =
      await this.authService
        .requireUserFromRequest(request);

    requireRole(
      user,
      conversationUserRoles,
    );

    this.blockImpersonationWrites(
      user,
      'change conversation status',
    );

    return this.conversationsService
      .updateStatus(
        user.tenantId,
        user.userId,
        conversationId,
        body.status,
      );
  }

  @Patch(':id/assignment')
  async assignConversation(
    @Req() request: Request,
    @Param('id') conversationId: string,
    @Body()
    body: {
      assignedUserId?: string | null;
    },
  ) {
    const user =
      await this.authService
        .requireUserFromRequest(request);

    requireRole(
      user,
      conversationManagerRoles,
    );

    this.blockImpersonationWrites(
      user,
      'assign conversations',
    );

    return this.conversationsService
      .assignConversation(
        user.tenantId,
        user.userId,
        conversationId,
        body.assignedUserId,
      );
  }

  @Post(':id/read')
  async markRead(
    @Req() request: Request,
    @Param('id') conversationId: string,
  ) {
    const user =
      await this.authService
        .requireUserFromRequest(request);

    requireRole(
      user,
      conversationUserRoles,
    );

    this.blockImpersonationWrites(
      user,
      'mark conversations as read',
    );

    return this.conversationsService
      .markConversationRead(
        user.tenantId,
        user.userId,
        conversationId,
      );
  }

  private blockImpersonationWrites(
    user: CurrentUser,
    action: string,
  ) {
    if (user.impersonating) {
      throw new ForbiddenException(
        `Impersonation cannot ${action}.`,
      );
    }
  }
}