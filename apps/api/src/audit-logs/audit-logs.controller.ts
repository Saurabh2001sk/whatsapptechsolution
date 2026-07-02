import { Controller, Get, Query, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthService } from '../auth/auth.service';
import { requireRole } from '../auth/require-role';
import { AuditLogFilters, AuditLogsService } from './audit-logs.service';

const auditViewerRoles = ['admin', 'platform_admin', 'super_admin'];

@Controller('audit-logs')
export class AuditLogsController {
  constructor(
    private readonly auditLogsService: AuditLogsService,
    private readonly authService: AuthService,
  ) {}

  @Get('production-readiness')
async productionReadiness(@Req() request: Request) {
const user = await this.authService.requireUserFromRequest(request);

requireRole(user, auditViewerRoles);

return this.auditLogsService.getProductionReadiness(user.tenantId);
}

  @Get()
  async list(@Req() request: Request, @Query() query: AuditLogFilters) {
    const user = await this.authService.requireUserFromRequest(request);

    requireRole(user, auditViewerRoles);

    return this.auditLogsService.listTenantAuditLogs(user.tenantId, query);
  }

  @Get('export')
  async exportSecurity(
    @Req() request: Request,
    @Query() query: AuditLogFilters,
    @Res() response: Response,
  ) {
    const user = await this.authService.requireUserFromRequest(request);

    requireRole(user, auditViewerRoles);

    const csv = await this.auditLogsService.exportTenantAuditLogsCsv(
      user.tenantId,
      'security',
      query,
    );

    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Pragma', 'no-cache');
    response.setHeader(
      'Content-Disposition',
      'attachment; filename="security-audit-logs.csv"',
    );

    return response.send(csv);
  }

  @Get('billing')
  async listBilling(
    @Req() request: Request,
    @Query() query: AuditLogFilters,
  ) {
    const user = await this.authService.requireUserFromRequest(request);

    requireRole(user, auditViewerRoles);

    return this.auditLogsService.listTenantBillingAuditLogs(
      user.tenantId,
      query,
    );
  }

  @Get('billing/export')
  async exportBilling(
    @Req() request: Request,
    @Query() query: AuditLogFilters,
    @Res() response: Response,
  ) {
    const user = await this.authService.requireUserFromRequest(request);

    requireRole(user, auditViewerRoles);

    const csv = await this.auditLogsService.exportTenantAuditLogsCsv(
      user.tenantId,
      'billing',
      query,
    );

    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Pragma', 'no-cache');
    response.setHeader(
      'Content-Disposition',
      'attachment; filename="billing-audit-logs.csv"',
    );

    return response.send(csv);
  }

  @Get('campaigns')
  async listCampaigns(
    @Req() request: Request,
    @Query() query: AuditLogFilters,
  ) {
    const user = await this.authService.requireUserFromRequest(request);

    requireRole(user, auditViewerRoles);

    return this.auditLogsService.listTenantCampaignAuditLogs(
      user.tenantId,
      query,
    );
  }

  @Get('campaigns/export')
  async exportCampaigns(
    @Req() request: Request,
    @Query() query: AuditLogFilters,
    @Res() response: Response,
  ) {
    const user = await this.authService.requireUserFromRequest(request);

    requireRole(user, auditViewerRoles);

    const csv = await this.auditLogsService.exportTenantAuditLogsCsv(
      user.tenantId,
      'campaigns',
      query,
    );

    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Pragma', 'no-cache');
    response.setHeader(
      'Content-Disposition',
      'attachment; filename="campaign-audit-logs.csv"',
    );

    return response.send(csv);
  }

  @Get('notifications')
  async listNotifications(
    @Req() request: Request,
    @Query() query: AuditLogFilters,
  ) {
    const user = await this.authService.requireUserFromRequest(request);

    requireRole(user, auditViewerRoles);

    return this.auditLogsService.listTenantNotificationLogs(
      user.tenantId,
      query,
    );
  }

  @Get('notifications/export')
  async exportNotifications(
    @Req() request: Request,
    @Query() query: AuditLogFilters,
    @Res() response: Response,
  ) {
    const user = await this.authService.requireUserFromRequest(request);

    requireRole(user, auditViewerRoles);

    const csv = await this.auditLogsService.exportTenantAuditLogsCsv(
      user.tenantId,
      'notifications',
      query,
    );

    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Pragma', 'no-cache');
    response.setHeader(
      'Content-Disposition',
      'attachment; filename="notification-audit-logs.csv"',
    );

    return response.send(csv);
  }
}