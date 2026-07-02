import {
Body,
Controller,
ForbiddenException,
Get,
Param,
Post,
Query,
Req,
Res,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthService } from '../auth/auth.service';
import type { CurrentUser } from '../auth/current-user';
import { MetaAccountsService } from './meta-accounts.service';
import { requireRole } from '../auth/require-role';

type RawBodyRequest = Request & {
  rawBody?: Buffer;
};

const webhookViewerRoles = ['admin', 'platform_admin', 'super_admin'];

@Controller('meta-accounts')
export class MetaAccountsController {
  constructor(
    private readonly metaAccountsService: MetaAccountsService,
    private readonly authService: AuthService,
  ) {}

  @Get('embedded-signup/config')
  getEmbeddedSignupConfig() {
    return this.metaAccountsService.getEmbeddedSignupConfig();
  }

  @Get('embedded-signup/start')
  async startEmbeddedSignup(@Req() request: Request) {
    const user = await this.authService.requireUserFromRequest(request);

    this.blockImpersonationWrites(user, 'connect WhatsApp account');

    return this.metaAccountsService.getEmbeddedSignupStartUrl(user);
  }

  @Get('embedded-signup/callback')
  async handleEmbeddedSignupCallback(
    @Req() request: Request,
    @Res() response: Response,
    @Query('code') code?: string,
    @Query('state') state?: string,
    @Query('error') error?: string,
    @Query('error_description') errorDescription?: string,
  ) {
    const frontendUrl = String(
      process.env.WEB_APP_URL || 'http://localhost:5173',
    ).trim();

    if (error) {
      return response.redirect(
        `${frontendUrl}?whatsappConnected=0&reason=${encodeURIComponent(
          errorDescription || error,
        )}`,
      );
    }

    const user = await this.authService.requireUserFromRequest(request);

    this.blockImpersonationWrites(user, 'connect WhatsApp account');

    this.metaAccountsService.verifyEmbeddedSignupState(
      String(state || '').trim(),
      user,
    );

    await this.metaAccountsService.connectFromEmbeddedSignup(
      user.tenantId,
      String(code || '').trim(),
    );

    return response.redirect(`${frontendUrl}?whatsappConnected=1`);
  }

  @Get('active')
  async getActive(@Req() request: Request) {
    const user = await this.authService.requireUserFromRequest(request);

    return this.metaAccountsService.getActiveMetaAccount(user.tenantId);
  }

  @Post('test')
  async test(@Req() request: Request) {
    const user = await this.authService.requireUserFromRequest(request);

    this.blockImpersonationWrites(user, 'test WhatsApp connection');

    return this.metaAccountsService.testActiveConnection(user.tenantId);
  }

  @Post('sync-phone-quality')
  async syncPhoneQuality(@Req() request: Request) {
    const user = await this.authService.requireUserFromRequest(request);

    this.blockImpersonationWrites(user, 'sync phone quality');

    return this.metaAccountsService.syncActivePhoneQuality(user.tenantId);
  }

  @Get('webhook-events')
async listWebhookEvents(
@Req() request: Request,
@Query() query: Record<string, string>,
) {
const user = await this.authService.requireUserFromRequest(request);

requireRole(user, webhookViewerRoles);

return this.metaAccountsService.listWebhookEvents(user.tenantId, query);
}

@Post('webhook-events/:id/replay')
async replayWebhookEvent(@Req() request: Request, @Param('id') id: string) {
const user = await this.authService.requireUserFromRequest(request);

requireRole(user, webhookViewerRoles);
this.blockImpersonationWrites(user, 'replay webhook events');

return this.metaAccountsService.replayWebhookEvent(user.tenantId, id);
}

@Post('webhook-events/:id/retry')
async retryWebhookEvent(@Req() request: Request, @Param('id') id: string) {
const user = await this.authService.requireUserFromRequest(request);

requireRole(user, webhookViewerRoles);
this.blockImpersonationWrites(user, 'retry webhook events');

return this.metaAccountsService.replayWebhookEvent(user.tenantId, id);
}

  @Get('webhook')
  verifyWebhook(@Query() query: Record<string, string>) {
    return this.metaAccountsService.verifyWebhookChallenge(query);
  }

  @Post('webhook')
  receiveWebhook(
    @Req() request: RawBodyRequest,
    @Body() body: Record<string, unknown>,
  ) {
    return this.metaAccountsService.handleWebhookEvent({
      signature: String(request.headers['x-hub-signature-256'] || ''),
      rawBody: request.rawBody,
      body,
    });
  }

  private blockImpersonationWrites(user: CurrentUser, action: string) {
    if (user.impersonating) {
      throw new ForbiddenException(`Impersonation cannot ${action}.`);
    }
  }
}