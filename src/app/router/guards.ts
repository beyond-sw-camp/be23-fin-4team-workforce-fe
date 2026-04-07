import { redirect } from '@tanstack/react-router';
import type { PermissionSpec } from '@/features/permissions/model';
import type { AppRouterContext } from '@/app/router/types';

export function requireAuth(context: AppRouterContext) {
  if (!context.auth.isAuthenticated) {
    throw redirect({ to: '/login' });
  }

  const flags = context.auth.user?.flags;
  if (flags?.accountStatus === 'BLOCKED') {
    throw redirect({ to: '/403' });
  }
  if (flags?.mustChangePassword) {
    throw redirect({ to: '/change-password', search: { forced: true } });
  }
  if (flags?.emailVerificationRequired) {
    throw redirect({ to: '/verify-email' });
  }
}

export function requirePermissions(context: AppRouterContext, required?: PermissionSpec[]) {
  if (!required || required.length === 0) {
    return;
  }

  const isAllowed = required.every((spec) => context.permissions.hasPermission(spec));
  if (!isAllowed) {
    throw redirect({ to: '/403' });
  }
}
