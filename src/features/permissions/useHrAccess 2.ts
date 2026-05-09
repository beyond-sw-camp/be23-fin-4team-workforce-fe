import { useMemo } from 'react';
import { useAuth } from '@/features/auth/useAuth';
import { usePermissions } from '@/features/permissions/usePermissionsHook';
import {
  canAccessMemberDirectory,
  canAccessMemberDirectoryFromPermissionStrings,
  isHrTeamMember,
} from '@/features/permissions/member-directory-access';

/**
 * 시스템 관리자 vs 인사팀 분기 — 로그인 `data.permissions` (`RESOURCE:ACTION:RANGE`):
 * - 인사 관리 탭: MEMBER:CREATE 또는 MEMBER:UPDATE (또는 시스템 관리자)
 */
export function useHrAccess() {
  const { user } = useAuth();
  const { hasPermission } = usePermissions();

  return useMemo(
    () => ({
      isSystemAdmin: user?.isSystemAdmin === true,
      /** JWT·로그인 응답 YES/NO (없으면 isSystemAdmin으로 유추) */
      isSystemAdminYn: user?.isSystemAdminYn ?? (user?.isSystemAdmin === true ? 'YES' : user?.isSystemAdmin === false ? 'NO' : undefined),
      isHrTeam: isHrTeamMember(hasPermission),
      canAccessMemberDirectory:
        user?.isSystemAdmin === true ||
        canAccessMemberDirectory(hasPermission) ||
        canAccessMemberDirectoryFromPermissionStrings(user?.permissions),
    }),
    [user?.isSystemAdmin, user?.isSystemAdminYn, user?.permissions, hasPermission],
  );
}
