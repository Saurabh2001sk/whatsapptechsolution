import {
Body,
Controller,
ForbiddenException,
Get,
HttpCode,
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
import { env } from '../config/env';

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

  @Post('embedded-signup/complete')
  @HttpCode(200)
  async completeEmbeddedSignup(
    @Req() request: Request,
    @Body()
    body: {
      code?: string;
      wabaId?: string;
      phoneNumberId?: string;
      businessName?: string;
      qualityRating?: string;
      messagingLimitTier?: string;
    },
  ) {
    const user = await this.authService.requireUserFromRequest(request);

    this.blockImpersonationWrites(user, 'connect WhatsApp account');

    try {
      return await this.metaAccountsService.connectFromEmbeddedSignupSelection(
        user.tenantId,
        body,
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Failed to complete Embedded Signup';

      console.error('[meta-accounts] Embedded Signup complete failed:', message);

      throw error;
    }
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
    const frontendUrl = env.webAppUrl;

    if (error) {
      return response.redirect(
        `${frontendUrl}?whatsappConnected=0&reason=${encodeURIComponent(
          errorDescription || error,
        )}`,
      );
    }

 const user = await this.metaAccountsService.verifyEmbeddedSignupState(
   String(state || '').trim(),
 );

 try {
   await this.metaAccountsService.connectFromEmbeddedSignup(
     user.tenantId,
     String(code || '').trim(),
   );

   return response.redirect(`${frontendUrl}?whatsappConnected=1`);
 } catch (connectError) {
   const reason =
     connectError instanceof Error
       ? connectError.message
       : 'Failed to connect WhatsApp account';

   return response.redirect(
     `${frontendUrl}?whatsappConnected=0&reason=${encodeURIComponent(
       reason,
     )}`,
   );
 }  }

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

    @Post('sync-webhook-subscription')
  async syncWebhookSubscription(
    @Req() request: Request,
  ) {
    const user =
      await this.authService.requireUserFromRequest(request);

    this.blockImpersonationWrites(
      user,
      'configure WhatsApp webhooks',
    );

    return this.metaAccountsService.syncActiveWebhookSubscription(
      user.tenantId,
    );
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