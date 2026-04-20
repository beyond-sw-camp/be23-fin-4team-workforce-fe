import { redirect } from '@tanstack/react-router';
import type { AppRouterContext } from '@/app/router/types';
import type { PermissionSpec } from '@/features/permissions/model';
import {
  canAccessMemberDirectory,
  canAccessMemberDirectoryFromPermissionStrings,
} from '@/features/permissions/member-directory-access';

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

/** 구성원 목록·상세 — 시스템 관리자 또는 MEMBER:CREATE / MEMBER:UPDATE (범위 접미사 포함). 일반 직원은 403. */
export function requireMemberDirectoryAccess(context: AppRouterContext) {
  if (context.auth.user?.isSystemAdmin === true) {
    return;
  }
  if (canAccessMemberDirectory(context.permissions.hasPermission)) {
    return;
  }
  if (canAccessMemberDirectoryFromPermissionStrings(context.auth.user?.permissions)) {
    return;
  }
  throw redirect({ to: '/403' });
}
