import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
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
import { SecurityRateLimitService } from '../services/security-rate-limit.service';

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
    private readonly rateLimiter:
      SecurityRateLimitService,
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

    @Get(':id/reply-policy')
  async getReplyPolicy(
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
      .getReplyPolicy(
        user.tenantId,
        conversationId,
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

    @Post(':id/replies/text')
  async queueTextReply(
    @Req() request: Request,
    @Param('id') conversationId: string,
    @Headers('idempotency-key')
    idempotencyKey: string,
    @Body()
    body: {
      bodyText?: string;
    },
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
      'send conversation replies',
    );

    await this.consumeReplyLimit(
      request,
      user,
      conversationId,
    );

    return this.conversationsService
      .queueTextReply({
        tenantId:
          user.tenantId,
        actorUserId:
          user.userId,
        conversationId,
        idempotencyKey,
        bodyText:
          body.bodyText,
      });
  }

  @Post(':id/replies/template')
  async queueTemplateReply(
    @Req() request: Request,
    @Param('id') conversationId: string,
    @Headers('idempotency-key')
    idempotencyKey: string,
    @Body()
    body: {
      templateId?: string;
      variableValues?: unknown;
    },
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
      'send conversation replies',
    );

    await this.consumeReplyLimit(
      request,
      user,
      conversationId,
    );

    return this.conversationsService
      .queueTemplateReply({
        tenantId:
          user.tenantId,
        actorUserId:
          user.userId,
        conversationId,
        idempotencyKey,
        templateId:
          body.templateId,
        variableValues:
          body.variableValues,
      });
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

    private async consumeReplyLimit(
    request: Request,
    user: CurrentUser,
    conversationId: string,
  ) {
    const ip =
      this.rateLimiter
        .getRequestIp(request);

    await this.rateLimiter.consume(
      'conversation_reply_user',
      `${user.tenantId}:${user.userId}`,
      {
        limit: 60,
        windowMs: 60 * 1000,
        message:
          'Too many replies were submitted. Please wait before trying again.',
      },
    );

    await this.rateLimiter.consume(
      'conversation_reply_conversation',
      `${user.tenantId}:${conversationId}`,
      {
        limit: 30,
        windowMs: 60 * 1000,
        message:
          'Too many replies were submitted to this conversation.',
      },
    );

    await this.rateLimiter.consume(
      'conversation_reply_ip',
      ip,
      {
        limit: 120,
        windowMs: 60 * 1000,
        message:
          'Too many reply requests came from this network.',
      },
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