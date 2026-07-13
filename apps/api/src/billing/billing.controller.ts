import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from '../auth/auth.service';
import type { CurrentUser } from '../auth/current-user';
import { requireRole } from '../auth/require-role';
import { BillingService } from './billing.service';

const platformAdminRoles = ['super_admin', 'platform_admin'];

@Controller('billing')
export class BillingController {
  constructor(
    private readonly billingService: BillingService,
    private readonly authService: AuthService,
  ) {}

  @Get('plans')
  async listPlans() {
    return this.billingService.listActivePlans();
  }

  @Get('subscription')
  async getCurrentSubscription(@Req() request: Request) {
    const user = await this.authService.requireUserFromRequest(request);

    return this.billingService.getCurrentSubscription(user.tenantId);
  }

  @Get('pending-subscriptions')
  async listMyPendingSubscriptions(@Req() request: Request) {
    const user = await this.authService.requireUserFromRequest(request);

    return this.billingService.listTenantPendingSubscriptions(user.tenantId);
  }

  @Get('usage')
  async getUsageSummary(@Req() request: Request) {
    const user = await this.authService.requireUserFromRequest(request);

    return this.billingService.getUsageSummary(user.tenantId);
  }

  @Get('enforcement')
  async getBillingEnforcement(@Req() request: Request) {
    const user = await this.authService.requireUserFromRequest(request);

    return this.billingService.getEnforcementSummary(user.tenantId);
  }

  @Post('request-plan')
  async requestPlanChange(
    @Req() request: Request,
    @Body()
    body: {
      planId?: string;
    },
  ) {
    const user = await this.authService.requireUserFromRequest(request);

    this.blockImpersonationWrites(user, 'request billing plan changes');

    return this.billingService.requestPlanChange(
      user.tenantId,
      String(body.planId || '').trim(),
      user.userId,
    );
  }

  @Post('subscriptions/:id/payment-proof')
  async submitPaymentProof(
    @Req() request: Request,
    @Param('id') subscriptionId: string,
    @Body()
    body: {
      paymentReference?: string;
      paymentPayerName?: string;
      paymentAmountPaise?: number;
      paymentProofNote?: string;
    },
  ) {
    const user = await this.authService.requireUserFromRequest(request);

    this.blockImpersonationWrites(user, 'submit payment proof');

    return this.billingService.submitPaymentProof(
      user.tenantId,
      subscriptionId,
      user.userId,
      body,
    );
  }

  @Get('admin/pending-subscriptions')
  async listPendingSubscriptions(@Req() request: Request) {
    const user = await this.authService.requireUserFromRequest(request);

    requireRole(user, platformAdminRoles);

    return this.billingService.listPendingSubscriptions();
  }

  @Get('admin/audit-logs')
  async listBillingAuditLogs(@Req() request: Request) {
    const user = await this.authService.requireUserFromRequest(request);

    requireRole(user, platformAdminRoles);

    return this.billingService.listBillingAuditLogs(user.tenantId);
  }

  @Get('admin/notification-logs')
  async listNotificationLogs(@Req() request: Request) {
    const user = await this.authService.requireUserFromRequest(request);

    requireRole(user, platformAdminRoles);

    return this.billingService.listNotificationLogs(user.tenantId);
  }

  @Post('admin/subscriptions/:id/approve')
  async approveSubscription(
    @Req() request: Request,
    @Param('id') subscriptionId: string,
    @Body()
    body: {
      adminNote?: string;
    },
  ) {
    const user = await this.authService.requireUserFromRequest(request);

 requireRole(user, platformAdminRoles);
 this.blockImpersonationWrites(user, 'approve billing subscriptions');

 return this.billingService.approveSubscription(
   subscriptionId,
   user.userId,
   body?.adminNote,
 );
  }

@Post('admin/subscriptions/:id/cancel')
async cancelSubscription(
 @Req() request: Request,
 @Param('id') subscriptionId: string,
 @Body()
 body: {
   adminNote?: string;
 },
) {
 const user = await this.authService.requireUserFromRequest(request);

 requireRole(user, platformAdminRoles);
 this.blockImpersonationWrites(user, 'cancel billing subscriptions');

 return this.billingService.cancelSubscription(
   subscriptionId,
   user.userId,
   body?.adminNote,
 );
}

  private blockImpersonationWrites(user: CurrentUser, action: string) {
    if (user.impersonating) {
      throw new ForbiddenException(`Impersonation cannot ${action}.`);
    }
  }
}