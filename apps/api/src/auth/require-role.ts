import { ForbiddenException } from '@nestjs/common';
import type { CurrentUser } from './current-user';

const twoFactorRequiredRoles = ['platform_admin', 'super_admin'];

export function requireRole(user: CurrentUser, allowedRoles: string[]) {
  if (!allowedRoles.includes(user.role)) {
    throw new ForbiddenException('You do not have permission to access this resource');
  }

  if (
    twoFactorRequiredRoles.includes(user.role) &&
    (!user.twoFactorEnabled || !user.twoFactorConfirmedAt)
  ) {
    throw new ForbiddenException('Two-factor authentication is required for this action');
  }
}