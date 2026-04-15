import { redirect } from '@tanstack/react-router';
import type { PermissionSpec } from '@/features/permissions/model';
import type { AppRouterContext } from '@/app/router/types';

export function requireAuth(context: AppRouterContext) {
  // 초기 새로고침 시 인증 복원(getSession) 완료 전에는 리다이렉트를 보류한다.
  if (context.auth.status === 'loading') {
    return;
  }

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
