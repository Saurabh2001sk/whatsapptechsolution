import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { CookieOptions, Request, Response } from 'express';
import { env } from '../config/env';
import { SecurityRateLimitService } from '../security/security-rate-limit.service';
import { AuthService } from './auth.service';

type RenderCookieOptions = CookieOptions & {
  partitioned?: boolean;
  priority?: 'low' | 'medium' | 'high';
};

function createCookieOptions(maxAge?: number): RenderCookieOptions {
  return {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: env.isProduction ? 'none' : 'lax',
    ...(maxAge ? { maxAge } : {}),
    path: '/',
    ...(env.isProduction
      ? {
          partitioned: true,
          priority: 'high',
        }
      : {}),
  };
}

const accessTokenCookieOptions = createCookieOptions(12 * 60 * 60 * 1000);

const clearAccessTokenCookieOptions = createCookieOptions();

const trustedDeviceCookieName = 'trusted_device';

const trustedDeviceCookieOptions = createCookieOptions(
  30 * 24 * 60 * 60 * 1000,
);

const clearTrustedDeviceCookieOptions = createCookieOptions();

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly rateLimiter: SecurityRateLimitService,
  ) {}

  @Post('register')
  async register(
    @Req() request: Request,
    @Body()
    body: {
      businessName?: string;
      slug?: string;
      name?: string;
      email?: string;
      password?: string;
    },
  ) {
    const ip = this.rateLimiter.getRequestIp(request);
    const email = String(body.email || '').trim().toLowerCase();

    await this.rateLimiter.consume('auth_register_ip', ip, {
      limit: 8,
      windowMs: 60 * 60 * 1000,
      message: 'Too many registration attempts. Please try again later.',
    });

    if (email) {
      await this.rateLimiter.consume('auth_register_email', email, {
        limit: 3,
        windowMs: 60 * 60 * 1000,
        message: 'Too many registration attempts for this email.',
      });
    }

    return this.authService.register(body);
  }

  @Post('login')
  @HttpCode(200)
  async login(
    @Req() request: Request,
    @Body() body: { email?: string; password?: string },
    @Res({ passthrough: true }) response: Response,
  ) {
    const ip = this.rateLimiter.getRequestIp(request);
    const email = String(body.email || '').trim().toLowerCase();

    await this.rateLimiter.consume('auth_login_ip', ip, {
      limit: 30,
      windowMs: 15 * 60 * 1000,
      message: 'Too many login attempts. Please try again later.',
    });

    if (email) {
      await this.rateLimiter.consume('auth_login_email', email, {
        limit: 10,
        windowMs: 15 * 60 * 1000,
        message: 'Too many login attempts for this account.',
      });
    }

const result = await this.authService.login({
...body,
trustedDeviceToken: request.cookies?.[trustedDeviceCookieName],
userAgent: String(request.headers['user-agent'] || ''),
});

    if ('requiresTwoFactor' in result && result.requiresTwoFactor) {
      return result;
    }

    response.cookie('access_token', result.token, accessTokenCookieOptions);

    return {
      tenant: result.tenant,
      user: result.user,
    };
  }

  @Post('login/2fa')
  @HttpCode(200)
  async completeTwoFactorLogin(
    @Req() request: Request,
    @Body()
body: {
  twoFactorToken?: string;
  code?: string;
  trustDevice?: boolean;
},
    @Res({ passthrough: true }) response: Response,
  ) {
    const ip = this.rateLimiter.getRequestIp(request);
    const token = String(body.twoFactorToken || '').trim();

    await this.rateLimiter.consume('auth_2fa_login_ip', ip, {
      limit: 30,
      windowMs: 15 * 60 * 1000,
      message: 'Too many 2FA attempts. Please try again later.',
    });

    if (token) {
      await this.rateLimiter.consume('auth_2fa_login_token', token, {
        limit: 8,
        windowMs: 15 * 60 * 1000,
        message: 'Too many 2FA attempts for this login.',
      });
    }

const result = await this.authService.completeTwoFactorLogin({
  ...body,
  userAgent: String(request.headers['user-agent'] || ''),
  ipAddress: ip,
});

    response.cookie('access_token', result.token, accessTokenCookieOptions);

if (result.trustedDeviceToken) {
response.cookie(
 trustedDeviceCookieName,
 result.trustedDeviceToken,
 trustedDeviceCookieOptions,
);
}

    return {
      tenant: result.tenant,
      user: result.user,
    };
  }

  @Post('request-email-verification')
  @HttpCode(200)
  async requestEmailVerification(
    @Req() request: Request,
    @Body() body: { email?: string },
  ) {
    const ip = this.rateLimiter.getRequestIp(request);
    const email = String(body.email || '').trim().toLowerCase();

    await this.rateLimiter.consume('auth_email_verify_request_ip', ip, {
      limit: 10,
      windowMs: 60 * 60 * 1000,
      message: 'Too many verification requests. Please try again later.',
    });

    if (email) {
      await this.rateLimiter.consume('auth_email_verify_request_email', email, {
        limit: 3,
        windowMs: 60 * 60 * 1000,
        message: 'Too many verification requests for this email.',
      });
    }

    await this.authService.requestEmailVerification(body);

    return {
      ok: true,
      message:
        'If this email needs verification, a verification link has been sent.',
    };
  }

  @Post('verify-email')
  @HttpCode(200)
  async verifyEmail(@Req() request: Request, @Body() body: { token?: string }) {
    const ip = this.rateLimiter.getRequestIp(request);
    const token = String(body.token || '').trim();

    await this.rateLimiter.consume('auth_email_verify_ip', ip, {
      limit: 30,
      windowMs: 15 * 60 * 1000,
      message: 'Too many verification attempts. Please try again later.',
    });

    if (token) {
      await this.rateLimiter.consume('auth_email_verify_token', token, {
        limit: 5,
        windowMs: 15 * 60 * 1000,
        message: 'Too many verification attempts for this link.',
      });
    }

    await this.authService.verifyEmail(body);

    return {
      ok: true,
      message: 'Email verified successfully.',
    };
  }

  @Post('request-password-reset')
  @HttpCode(200)
  async requestPasswordReset(
    @Req() request: Request,
    @Body() body: { email?: string },
  ) {
    const ip = this.rateLimiter.getRequestIp(request);
    const email = String(body.email || '').trim().toLowerCase();

    await this.rateLimiter.consume('auth_password_reset_request_ip', ip, {
      limit: 10,
      windowMs: 60 * 60 * 1000,
      message: 'Too many password reset requests. Please try again later.',
    });

    if (email) {
      await this.rateLimiter.consume('auth_password_reset_request_email', email, {
        limit: 3,
        windowMs: 60 * 60 * 1000,
        message: 'Too many password reset requests for this email.',
      });
    }

    await this.authService.requestPasswordReset(body);

    return {
      ok: true,
      message: 'If this email exists, a password reset link has been sent.',
    };
  }

  @Post('reset-password')
  @HttpCode(200)
  async resetPassword(
    @Req() request: Request,
    @Body() body: { token?: string; password?: string },
  ) {
    const ip = this.rateLimiter.getRequestIp(request);
    const token = String(body.token || '').trim();

    await this.rateLimiter.consume('auth_password_reset_ip', ip, {
      limit: 20,
      windowMs: 15 * 60 * 1000,
      message: 'Too many password reset attempts. Please try again later.',
    });

    if (token) {
      await this.rateLimiter.consume('auth_password_reset_token', token, {
        limit: 5,
        windowMs: 15 * 60 * 1000,
        message: 'Too many password reset attempts for this link.',
      });
    }

    await this.authService.resetPassword(body);

    return {
      ok: true,
      message: 'Password reset successfully.',
    };
  }

  @Post('logout')
  @HttpCode(200)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const trustedDeviceToken =
      request.cookies?.[trustedDeviceCookieName];

    await this.authService.revokeTrustedDevice(trustedDeviceToken);

    response.clearCookie(
      'access_token',
      clearAccessTokenCookieOptions,
    );

    response.clearCookie(
      trustedDeviceCookieName,
      clearTrustedDeviceCookieOptions,
    );

    return {
      ok: true,
    };
  }

  @Get('me')
  me(@Req() request: Request) {
    return this.authService.getMe(request.cookies?.access_token);
  }
}