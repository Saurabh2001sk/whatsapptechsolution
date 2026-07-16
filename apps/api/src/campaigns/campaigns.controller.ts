import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthService } from '../auth/auth.service';
import type { CurrentUser } from '../auth/current-user';
import { CampaignsService } from './campaigns.service';
import { timingSafeEqual } from 'crypto';
import { env } from '../config/env';
@Controller('campaigns')
export class CampaignsController {
  constructor(
    private readonly campaignsService: CampaignsService,
    private readonly authService: AuthService,
  ) {}

  @Get()
  async listCampaigns(@Req() request: Request) {
    const user = await this.authService.requireUserFromRequest(request);

    return this.campaignsService.listCampaigns(user.tenantId);
  }

  @Post('preview')
  async previewCampaignAudience(
    @Req() request: Request,
    @Body()
    body: {
      audienceType?: string;
      contactTypeId?: string;
    },
  ) {
    const user = await this.authService.requireUserFromRequest(request);

    return this.campaignsService.previewCampaignAudience(user.tenantId, body);
  }

  @Post()
  async createCampaign(
    @Req() request: Request,
    @Body()
    body: {
      name?: string;
      templateId?: string;
      audienceType?: string;
      contactTypeId?: string;
      variableValues?: string[];
      scheduledAt?: string;
    },
  ) {
    const user = await this.authService.requireUserFromRequest(request);

    this.blockImpersonationWrites(user, 'create campaigns');

    return this.campaignsService.createCampaign(
      user.tenantId,
      user.userId,
      body,
    );
  }

  @Get(':id')
  async getCampaign(@Req() request: Request, @Param('id') campaignId: string) {
    const user = await this.authService.requireUserFromRequest(request);

    return this.campaignsService.getCampaign(user.tenantId, campaignId);
  }

    @Get(':id/failures')
  async getCampaignFailureSummary(
    @Req() request: Request,
    @Param('id') campaignId: string,
  ) {
    const user = await this.authService.requireUserFromRequest(request);

    return this.campaignsService.getCampaignFailureSummary(
      user.tenantId,
      campaignId,
    );
  }

    @Get(':id/failures/export.csv')
  async exportCampaignFailuresCsv(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Param('id') campaignId: string,
  ) {
    const user = await this.authService.requireUserFromRequest(request);

    const csv = await this.campaignsService.exportCampaignFailuresCsv(
      user.tenantId,
      campaignId,
    );

    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="campaign-failures-${campaignId}.csv"`,
    );
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Pragma', 'no-cache');

    return csv;
  }

  @Post(':id/send')
  async sendCampaign(@Req() request: Request, @Param('id') campaignId: string) {
    const user = await this.authService.requireUserFromRequest(request);

    this.blockImpersonationWrites(user, 'send campaigns');

    return this.campaignsService.sendCampaign(
      user.tenantId,
      user.userId,
      campaignId,
    );
  }

  @Post(':id/retry-failed')
  async retryFailedCampaignRecipients(
    @Req() request: Request,
    @Param('id') campaignId: string,
  ) {
    const user = await this.authService.requireUserFromRequest(request);

    this.blockImpersonationWrites(user, 'retry campaigns');

    return this.campaignsService.retryFailedCampaignRecipients(
      user.tenantId,
      user.userId,
      campaignId,
    );
  }

  @Post(':id/cancel')
  async cancelScheduledCampaign(
    @Req() request: Request,
    @Param('id') campaignId: string,
  ) {
    const user = await this.authService.requireUserFromRequest(request);

    this.blockImpersonationWrites(user, 'cancel campaigns');

    return this.campaignsService.cancelScheduledCampaign(
      user.tenantId,
      user.userId,
      campaignId,
    );
  }

  @Post('delivery-status')
  syncDeliveryStatus(
    @Req() request: Request,
    @Body()
    body: {
      messageId?: string;
      phoneNumberId?: string;
      status?: string;
      timestamp?: string | number;
      errorMessage?: string;
    },
  ) {
    const requiredSecret = env.campaignWebhookSyncSecret;
    const providedSecret = String(
      request.headers['x-campaign-webhook-sync-secret'] || '',
    );

    if (!requiredSecret) {
      throw new BadRequestException('CAMPAIGN_WEBHOOK_SYNC_SECRET is required');
    }

    const requiredSecretBuffer = Buffer.from(requiredSecret);
    const providedSecretBuffer = Buffer.from(providedSecret);

    if (
      requiredSecretBuffer.length !== providedSecretBuffer.length ||
      !timingSafeEqual(requiredSecretBuffer, providedSecretBuffer)
    ) {
      throw new UnauthorizedException('Invalid webhook sync secret');
    }

    return this.campaignsService.syncMessageDeliveryStatusFromWebhook(body);
  }

  @Delete(':id')
  async deleteCampaign(
    @Req() request: Request,
    @Param('id') campaignId: string,
  ) {
    const user = await this.authService.requireUserFromRequest(request);

    this.blockImpersonationWrites(user, 'delete campaigns');

    return this.campaignsService.deleteCampaign(
      user.tenantId,
      user.userId,
      campaignId,
    );
  }

  private blockImpersonationWrites(user: CurrentUser, action: string) {
    if (user.impersonating) {
      throw new ForbiddenException(`Impersonation cannot ${action}.`);
    }
  }
}