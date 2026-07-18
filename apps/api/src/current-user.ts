export type CurrentUser = {
  userId: string;
  tenantId: string;
  role: string;
  sessionVersion?: number;
  emailVerifiedAt?: Date | null;
  twoFactorEnabled?: boolean;
  twoFactorConfirmedAt?: Date | null;
  impersonating?: boolean;
  impersonatorUserId?: string;
  impersonatorTenantId?: string;
  impersonatorRole?: string;
  impersonationExpiresAt?: string;
};

/**
 * Do not parse JWT directly inside controllers.
 *
 * Always use:
 * authService.requireUserFromRequest(request)
 *
 * Reason:
 * AuthService validates the token AND checks the database user,
 * tenant status, sessionVersion, impersonation expiry, and 2FA rules.
 */