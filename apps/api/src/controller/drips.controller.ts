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
import { AuthService } from '../services/auth.service';
import type { CurrentUser } from '../current-user';
import { requireRole } from '../require-role';
import { SecurityRateLimitService } from '../services/security-rate-limit.service';
import { DripsService } from '../services/drips.service';

const dripEditorRoles = ['admin', 'manager', 'platform_admin', 'super_admin'];
const dripEnrollmentRoles = ['admin', 'manager', 'agent', 'platform_admin', 'super_admin'];
const minute = 60 * 1000;

@Controller('drips')
export class DripsController {
  constructor(
    private readonly dripsService: DripsService,
    private readonly authService: AuthService,
    private readonly rateLimiter: SecurityRateLimitService,
  ) {}

  @Get()
  async list(
    @Req() request: Request,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    const user = await this.authService.requireUserFromRequest(request);

    return this.dripsService.listWorkflows(user.tenantId, {
      limit,
      status,
      search,
    });
  }

  @Get(':id')
  async getOne(
    @Req() request: Request,
    @Param('id') workflowId: string,
    @Query('enrollmentLimit') enrollmentLimit?: string,
    @Query('messageLimit') messageLimit?: string,
  ) {
    const user = await this.authService.requireUserFromRequest(request);

    return this.dripsService.getWorkflow(user.tenantId, workflowId, {
      enrollmentLimit,
      messageLimit,
    });
  }

  @Get(':id/summary')
  async getSummary(
    @Req() request: Request,
    @Param('id') workflowId: string,
  ) {
    const user = await this.authService.requireUserFromRequest(request);

    return this.dripsService.getWorkflowSummary(user.tenantId, workflowId);
  }

  @Post()
  async create(
    @Req() request: Request,
    @Body()
    body: {
      name?: string;
      description?: string;
      audienceType?: string;
      targetContactTypeId?: string;
      timezone?: string;
      sendingStartTime?: string;
      sendingEndTime?: string;
      sendingDays?: number[];
      autoEnrollNewContacts?: boolean;
      autoEnrollInbound?: boolean;
      includeExistingContacts?: boolean;
      allowReentry?: boolean;
      reentryCooldownDays?: number;
      steps?: Array<{
        name?: string;
        templateId?: string;
        dayOffset?: number;
        minuteOffset?: number;
        variableValues?: string[];
      }>;
    },
  ) {
    const user = await this.authService.requireUserFromRequest(request);

    requireRole(user, dripEditorRoles);
    this.blockImpersonationWrites(user, 'create drip workflows');
    await this.consumeWriteLimit(request, user, 'create', 20, 10 * minute);

    return this.dripsService.createWorkflow(
      user.tenantId,
      user.userId,
      body,
    );
  }

  @Patch(':id')
  async update(
    @Req() request: Request,
    @Param('id') workflowId: string,
    @Body()
    body: {
      name?: string;
      description?: string;
      audienceType?: string;
      targetContactTypeId?: string | null;
      timezone?: string;
      sendingStartTime?: string;
      sendingEndTime?: string;
      sendingDays?: number[];
      autoEnrollNewContacts?: boolean;
      autoEnrollInbound?: boolean;
      includeExistingContacts?: boolean;
      allowReentry?: boolean;
      reentryCooldownDays?: number | null;
      steps?: Array<{
        name?: string;
        templateId?: string;
        dayOffset?: number;
        minuteOffset?: number;
        variableValues?: string[];
      }>;
    },
  ) {
    const user = await this.authService.requireUserFromRequest(request);

    requireRole(user, dripEditorRoles);
    this.blockImpersonationWrites(user, 'update drip workflows');
    await this.consumeWriteLimit(request, user, 'update', 40, 10 * minute);

    return this.dripsService.updateWorkflow(
      user.tenantId,
      user.userId,
      workflowId,
      body,
    );
  }

  @Post(':id/activate')
  async activate(
    @Req() request: Request,
    @Param('id') workflowId: string,
  ) {
    const user = await this.authService.requireUserFromRequest(request);

    requireRole(user, dripEditorRoles);
    this.blockImpersonationWrites(user, 'activate drip workflows');
    await this.consumeWriteLimit(request, user, 'activate', 30, 10 * minute);

    return this.dripsService.activateWorkflow(
      user.tenantId,
      user.userId,
      workflowId,
    );
  }

  @Post(':id/pause')
  async pause(
    @Req() request: Request,
    @Param('id') workflowId: string,
  ) {
    const user = await this.authService.requireUserFromRequest(request);

    requireRole(user, dripEditorRoles);
    this.blockImpersonationWrites(user, 'pause drip workflows');
    await this.consumeWriteLimit(request, user, 'pause', 30, 10 * minute);

    return this.dripsService.pauseWorkflow(
      user.tenantId,
      user.userId,
      workflowId,
    );
  }

    @Post(':id/archive')
  async archive(
    @Req() request: Request,
    @Param('id') workflowId: string,
  ) {
    const user =
      await this.authService.requireUserFromRequest(request);

    requireRole(user, dripEditorRoles);
    this.blockImpersonationWrites(
      user,
      'archive drip workflows',
    );
    await this.consumeWriteLimit(request, user, 'archive', 20, 10 * minute);

    return this.dripsService.archiveWorkflow(
      user.tenantId,
      user.userId,
      workflowId,
    );
  }

  @Post(':id/messages/:messageId/retry')
  async retryFailedMessage(
    @Req() request: Request,
    @Param('id') workflowId: string,
    @Param('messageId') messageId: string,
  ) {
    const user =
      await this.authService.requireUserFromRequest(request);

    requireRole(user, dripEditorRoles);
    this.blockImpersonationWrites(
      user,
      'retry failed drip messages',
    );
    await this.consumeWriteLimit(request, user, 'retry', 30, 10 * minute);

    return this.dripsService.retryFailedDripMessage({
      tenantId: user.tenantId,
      actorUserId: user.userId,
      workflowId,
      dripMessageId: messageId,
    });
  }

  @Post(':id/enroll')
  async enrollContacts(
    @Req() request: Request,
    @Param('id') workflowId: string,
    @Body() body: { contactIds?: string[] },
  ) {
    const user = await this.authService.requireUserFromRequest(request);

    requireRole(user, dripEnrollmentRoles);
    this.blockImpersonationWrites(user, 'enroll drip contacts');
    await this.consumeWriteLimit(request, user, 'enroll', 15, 10 * minute);

    return this.dripsService.enrollContacts(
      user.tenantId,
      user.userId,
      workflowId,
      body.contactIds,
      'MANUAL',
    );
  }

  @Post(':id/enrollments/:enrollmentId/stop')
  async stopEnrollment(
    @Req() request: Request,
    @Param('id') workflowId: string,
    @Param('enrollmentId') enrollmentId: string,
  ) {
    const user = await this.authService.requireUserFromRequest(request);

    requireRole(user, dripEnrollmentRoles);
    this.blockImpersonationWrites(user, 'stop drip enrollments');
    await this.consumeWriteLimit(request, user, 'stop', 40, 10 * minute);

    return this.dripsService.stopEnrollment(
      user.tenantId,
      user.userId,
      workflowId,
      enrollmentId,
    );
  }

  private blockImpersonationWrites(user: CurrentUser, action: string) {
    if (user.impersonating) {
      throw new ForbiddenException(`Impersonation cannot ${action}.`);
    }
  }

  private async consumeWriteLimit(
    request: Request,
    user: CurrentUser,
    action: string,
    limit: number,
    windowMs: number,
  ) {
    const ip = this.rateLimiter.getRequestIp(request);
    const userKey = `${user.tenantId}:${user.userId}`;

    await this.rateLimiter.consume(`drips_${action}_ip`, ip, {
      limit: Math.max(limit * 3, limit),
      windowMs,
      message: 'Too many drip automation changes from this network. Please try again later.',
    });

    await this.rateLimiter.consume(`drips_${action}_user`, userKey, {
      limit,
      windowMs,
      message: 'Too many drip automation changes. Please wait before trying again.',
    });
  }
}
