import {
  Body,
  Controller,
  Delete,
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
import { TemplatesService } from '../services/templates.service';

@Controller('templates')
export class TemplatesController {
  constructor(
    private readonly templatesService: TemplatesService,
    private readonly authService: AuthService,
  ) {}

  @Get()
  async listTemplates(
    @Req() request: Request,
    @Query('status') status?: string,
    @Query('category') category?: string,
    @Query('search') search?: string,
  ) {
    const user = await this.authService.requireUserFromRequest(request);

    return this.templatesService.listTemplates(user.tenantId, {
      status,
      category,
      search,
    });
  }

  @Post('sync')
  async syncTemplates(@Req() request: Request) {
    const user = await this.authService.requireUserFromRequest(request);

    this.blockImpersonationWrites(user, 'sync templates');

    return this.templatesService.syncTemplatesFromMeta(user.tenantId);
  }

  @Get('flows')
  async listMetaFlows(@Req() request: Request) {
    const user = await this.authService.requireUserFromRequest(request);

    return this.templatesService.listMetaFlows(user.tenantId);
  }

  @Post()
  async createTemplate(
    @Req() request: Request,
    @Body() body: Record<string, unknown>,
  ) {
    const user = await this.authService.requireUserFromRequest(request);

    this.blockImpersonationWrites(user, 'create templates');

    return this.templatesService.createTemplate(user.tenantId, body);
  }

  @Post('media-handle')
  async uploadTemplateMediaHandle(
    @Req() request: Request,
    @Body() body: Record<string, unknown>,
  ) {
    const user = await this.authService.requireUserFromRequest(request);

    this.blockImpersonationWrites(user, 'upload template media');

    return this.templatesService.uploadTemplateMediaToMeta(user.tenantId, body);
  }

  @Post(':id/copy')
  async copyTemplateAsDraft(
    @Req() request: Request,
    @Param('id') templateId: string,
    @Body() body: Record<string, unknown>,
  ) {
    const user = await this.authService.requireUserFromRequest(request);

    this.blockImpersonationWrites(user, 'copy templates');

    return this.templatesService.copyTemplateAsDraft(
      user.tenantId,
      templateId,
      body,
    );
  }

  @Post(':id/refresh')
  async refreshTemplateFromMeta(
    @Req() request: Request,
    @Param('id') templateId: string,
  ) {
    const user = await this.authService.requireUserFromRequest(request);

    this.blockImpersonationWrites(user, 'refresh templates');

    return this.templatesService.refreshTemplateFromMeta(
      user.tenantId,
      templateId,
    );
  }

  @Post(':id/header-media')
  async uploadHeaderMediaSample(
    @Req() request: Request,
    @Param('id') templateId: string,
    @Body() body: Record<string, unknown>,
  ) {
    const user = await this.authService.requireUserFromRequest(request);

    this.blockImpersonationWrites(user, 'upload template header media');

    return this.templatesService.uploadHeaderMediaSampleToMeta(
      user.tenantId,
      templateId,
      body,
    );
  }

  @Post(':id/submit')
  async submitTemplate(
    @Req() request: Request,
    @Param('id') templateId: string,
    @Body() body: Record<string, unknown>,
  ) {
    const user = await this.authService.requireUserFromRequest(request);

    this.blockImpersonationWrites(user, 'submit templates');

    return this.templatesService.submitTemplateToMeta(
      user.tenantId,
      templateId,
      body,
    );
  }

  @Patch(':id')
  async updateTemplate(
    @Req() request: Request,
    @Param('id') templateId: string,
    @Body() body: Record<string, unknown>,
  ) {
    const user = await this.authService.requireUserFromRequest(request);

    this.blockImpersonationWrites(user, 'update templates');

    return this.templatesService.updateTemplate(user.tenantId, templateId, body);
  }

  @Delete(':id/meta')
  async deleteTemplateFromMeta(
    @Req() request: Request,
    @Param('id') templateId: string,
  ) {
    const user = await this.authService.requireUserFromRequest(request);

    this.blockImpersonationWrites(user, 'delete templates from Meta');

    return this.templatesService.deleteTemplateFromMeta(
      user.tenantId,
      templateId,
    );
  }

  @Delete(':id')
  async deleteTemplate(
    @Req() request: Request,
    @Param('id') templateId: string,
  ) {
    const user = await this.authService.requireUserFromRequest(request);

    this.blockImpersonationWrites(user, 'delete templates');

    return this.templatesService.deleteTemplate(user.tenantId, templateId);
  }

  private blockImpersonationWrites(user: CurrentUser, action: string) {
    if (user.impersonating) {
      throw new ForbiddenException(`Impersonation cannot ${action}.`);
    }
  }
}