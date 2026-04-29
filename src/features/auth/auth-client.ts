import type { AuthClient, AuthSession, LoginInput, Me } from '@/features/auth/types';
import { memberApi } from '@/features/member/api/memberApi';
import {
  normalizePermissionList,
  normalizePermissionSources,
} from '@/features/permissions/normalize-permission-codes';
import { mergePermissionStrings, rolePermissionItemsToCodes } from '@/features/permissions/role-permission-codes';
import { httpClient } from '@/shared/api/httpClient';
import { unwrapApiResponse } from '@/shared/api/response';
import { decodeJwtPayload, getTenantHeadersFromJwtPayload } from '@/shared/auth/jwtTenantClaims';
import { setAuthRefreshInFlight } from '@/shared/stores/authRefreshInFlightStore';
import { clearRefreshIdentity, setRefreshIdentity } from '@/shared/stores/authRefreshIdentityStore';
import { clearAccessToken, getAccessToken, setAccessToken } from '@/shared/stores/authTokenStore';

type LoginResponse = {
  accessToken?: string;
  access_token?: string;
  memberId?: string;
  id?: string;
  companyId?: string;
  company_id?: string;
  corpId?: string;
  tenantId?: string;
  name?: string;
  email?: string;
  /**
   * `POST /member/login` `data.permissions` — `RESOURCE:ACTION:RANGE` 문자열 배열
   * (예: MEMBER:CREATE:COMPANY). `Me.permissions`에 병합 후 Auth 전역 상태에 저장.
   * 객체 배열이면 문자열로 정규화.
   */
  permissions?: unknown;
  isSystemAdminYn?: 'Y' | 'N' | 'YES' | 'NO';
  isFirstLoginYn?: 'Y' | 'N' | 'YES' | 'NO';
  isOnboardingYn?: 'Y' | 'N' | 'YES' | 'NO';
  isEmailVerifiedYn?: 'Y' | 'N' | 'YES' | 'NO';
  memberPositionId?: string;
  jobTitle?: string;
  positionName?: string;
  rank?: string;
  departmentName?: string;
  deptName?: string;
  organizationName?: string;
  companyName?: string;
  corpName?: string;
  tenantName?: string;
  businessName?: string;
  clientCompanyName?: string;
  companyLogoUrl?: string;
  logoUrl?: string;
  brandLogoUrl?: string;
  companyLogo?: string;
  companyImageUrl?: string;
  profileUrl?: string;
  profileImageUrl?: string;
  avatarUrl?: string;
  photoUrl?: string;
  headImgUrl?: string;
  headImageUrl?: string;
  roleId?: string;
  role_id?: string;
};

let currentSession: AuthSession | null = null;

/** 백엔드 `Y`/`N` 또는 `YES`/`NO` */
function isYnYes(value?: string) {
  if (value == null || value === '') return false;
  const v = String(value).trim().toUpperCase();
  return v === 'Y' || v === 'YES';
}

function toBooleanMaybe(value: unknown): boolean | undefined {
  if (value === 'Y') return true;
  if (value === 'N') return false;
  if (typeof value === 'boolean') return value;
  return undefined;
}

type AuthPayload = Partial<LoginResponse> &
  Omit<Partial<Me>, 'permissions' | 'isSystemAdminYn'> & {
    permissions?: unknown;
    isSystemAdminYn?: 'Y' | 'N' | 'YES' | 'NO';
  };

function pickCompanyId(payload: AuthPayload): string | undefined {
  const extended = payload as Partial<LoginResponse> & { company_id?: string };
  const raw = extended.companyId ?? extended.company_id ?? extended.corpId ?? extended.tenantId;
  if (typeof raw !== 'string' || !raw.trim()) return undefined;
  return raw.trim();
}

function parseIsSystemAdmin(value: unknown): boolean | undefined {
  if (value === true) return true;
  if (value === false) return false;
  if (typeof value === 'string') {
    const v = value.trim().toUpperCase();
    if (v === 'YES' || v === 'Y') return true;
    if (v === 'NO' || v === 'N') return false;
  }
  return undefined;
}

function pickJobTitle(payload: AuthPayload): string | undefined {
  const raw = payload.jobTitle ?? payload.positionName ?? payload.rank;
  return typeof raw === 'string' && raw.trim() ? raw.trim() : undefined;
}

function pickDepartmentName(payload: AuthPayload): string | undefined {
  const raw = payload.departmentName ?? payload.deptName ?? payload.organizationName;
  return typeof raw === 'string' && raw.trim() ? raw.trim() : undefined;
}

function pickCompanyName(payload: AuthPayload): string | undefined {
  const raw =
    payload.companyName ??
    payload.corpName ??
    payload.tenantName ??
    payload.businessName ??
    payload.clientCompanyName;
  return typeof raw === 'string' && raw.trim() ? raw.trim() : undefined;
}

function pickCompanyLogoUrl(payload: AuthPayload): string | undefined {
  const raw =
    payload.companyLogoUrl ??
    payload.logoUrl ??
    payload.brandLogoUrl ??
    payload.companyLogo ??
    payload.companyImageUrl;
  if (typeof raw !== 'string' || !raw.trim()) return undefined;
  const u = raw.trim();
  if (u.startsWith('http') || u.startsWith('/') || u.startsWith('data:')) return u;
  return u;
}

function pickProfileImageUrl(payload: AuthPayload): string | undefined {
  const raw =
    payload.profileImageUrl ??
    payload.profileUrl ??
    payload.avatarUrl ??
    payload.photoUrl ??
    payload.headImgUrl ??
    payload.headImageUrl;
  if (typeof raw !== 'string' || !raw.trim()) return undefined;
  const u = raw.trim();
  if (u.startsWith('http') || u.startsWith('/') || u.startsWith('data:')) return u;
  return u;
}

function pickRoleIdFromPayload(payload: AuthPayload): string | undefined {
  const raw = payload.roleId ?? payload.role_id;
  if (typeof raw !== 'string' || !raw.trim()) return undefined;
  return raw.trim();
}

function pickIsSystemAdminYn(payload: AuthPayload): 'YES' | 'NO' | undefined {
  if (payload.isSystemAdminYn === undefined) return undefined;
  const b = parseIsSystemAdmin(payload.isSystemAdminYn);
  if (b === undefined) return undefined;
  return b ? 'YES' : 'NO';
}

function mapMe(payload: AuthPayload): Me {
  const emailVerificationRequired =
    payload.isEmailVerifiedYn === undefined ? undefined : !isYnYes(payload.isEmailVerifiedYn);

  const fromPayload =
    payload.isSystemAdmin ??
    (payload.isSystemAdminYn !== undefined ? parseIsSystemAdmin(payload.isSystemAdminYn) : undefined);

  return {
    id: payload.id ?? payload.memberId ?? '',
    companyId: pickCompanyId(payload),
    name: payload.name ?? '',
    email: payload.email ?? '',
    permissions: normalizePermissionList(payload.permissions),
    roleId: pickRoleIdFromPayload(payload),
    memberPositionId:
      typeof payload.memberPositionId === 'string' && payload.memberPositionId.trim()
        ? payload.memberPositionId.trim()
        : undefined,
    isSystemAdmin: fromPayload,
    isSystemAdminYn: pickIsSystemAdminYn(payload),
    jobTitle: pickJobTitle(payload),
    departmentName: pickDepartmentName(payload),
    companyName: pickCompanyName(payload),
    companyLogoUrl: pickCompanyLogoUrl(payload),
    profileImageUrl: pickProfileImageUrl(payload),
    flags: {
      mustChangePassword:
        payload.isFirstLoginYn === undefined ? payload.flags?.mustChangePassword : isYnYes(payload.isFirstLoginYn),
      onboardingRequired:
        payload.isOnboardingYn === undefined ? payload.flags?.onboardingRequired : isYnYes(payload.isOnboardingYn),
      emailVerificationRequired: payload.flags?.emailVerificationRequired ?? emailVerificationRequired,
      accountStatus: payload.flags?.accountStatus ?? 'ACTIVE',
    },
  };
}

function hasFallbackUserPayload(payload: AuthPayload) {
  return Boolean(payload.id ?? payload.memberId);
}

/** 로그인 응답이 `data.permissions` 뿐 아니라 `data.member.permissions` 등에 권한을 둘 때 수집 */
function extractLoginPermissions(payload: unknown): string[] {
  if (!payload || typeof payload !== 'object') return [];
  const p = payload as Record<string, unknown>;
  const memberPerms =
    p.member && typeof p.member === 'object'
      ? (p.member as Record<string, unknown>).permissions
      : undefined;
  const rolePerms =
    p.role && typeof p.role === 'object' && !Array.isArray(p.role)
      ? (p.role as Record<string, unknown>).permissions
      : undefined;
  return normalizePermissionSources(p.permissions, memberPerms, rolePerms);
}

async function mergeRolePermissionsIntoMe(me: Me): Promise<Me> {
  const rid = me.roleId?.trim();
  if (!rid) {
    return me;
  }
  try {
    const role = await memberApi.getRole(rid);
    const codes = rolePermissionItemsToCodes(role.permissions);
    return {
      ...me,
      permissions: mergePermissionStrings(me.permissions, codes),
    };
  } catch {
    return me;
  }
}

/**
 * 본인 권한 보강.
 * - `GET /member/me/permissions` 는 권한 검사 없이 자기 포지션의 권한을 그대로 내려준다.
 * - 비-관리자(예: 팀장)는 ROLE:READ 가 없어 `GET /member/role/{roleId}` 가 403 이므로
 *   `mergeRolePermissionsIntoMe` 만으로는 새로고침 후 권한이 복원되지 않는다.
 *   특히 Objective 작성 버튼처럼 GOAL:CREATE:TEAM/COMPANY 가 필요한 UI가 사라지는 문제의 핵심.
 * - 따라서 `getSession` / `refreshSession` 등 JWT 만으로 시작하는 모든 경로에서 이 함수를 사용한다.
 */
async function mergeMyPermissionsIntoMe(me: Me): Promise<Me> {
  try {
    const codes = await memberApi.getMyPermissions();
    if (!codes || codes.length === 0) {
      return me;
    }
    return {
      ...me,
      permissions: mergePermissionStrings(me.permissions, codes),
    };
  } catch {
    return me;
  }
}

/**
 * JWT만으로 `Me` 구성(네트워크 없음). `mergeRolePermissionsIntoMe`는 호출하지 않음 — 로그인 오버레이 후 한 번만 호출하기 위함.
 */
function decodeMeFromAccessToken(): Me {
  const token = getAccessToken();
  if (!token) {
    throw new Error('Missing access token');
  }

  const jwtPayload = decodeJwtPayload(token);
  if (!jwtPayload) {
    throw new Error('Access token is not a JWT or cannot be decoded');
  }

  const permissionsRaw =
    jwtPayload.permissions ??
    jwtPayload.perms ??
    jwtPayload.permissionCodes ??
    jwtPayload.grantedPermissions ??
    jwtPayload.authorities ??
    jwtPayload.roles;

  const memberNested =
    jwtPayload.member && typeof jwtPayload.member === 'object'
      ? (jwtPayload.member as Record<string, unknown>).permissions
      : undefined;

  const permissions = normalizePermissionSources(
    permissionsRaw,
    jwtPayload.permissionList,
    jwtPayload.memberPermissions,
    jwtPayload.rolePermissions,
    memberNested,
  );

  const isSystemAdminFromJwt = (() => {
    const a = parseIsSystemAdmin(jwtPayload.isSystemAdmin);
    if (a !== undefined) return a;
    if (jwtPayload.isSystemAdminYn !== undefined) {
      return parseIsSystemAdmin(jwtPayload.isSystemAdminYn);
    }
    return undefined;
  })();

  const flagsFromToken = (jwtPayload.flags && typeof jwtPayload.flags === 'object' ? jwtPayload.flags : {}) as
    | Record<string, unknown>
    | undefined;

  const mustChangePassword = (() => {
    const fromFlags = toBooleanMaybe(flagsFromToken?.mustChangePassword ?? jwtPayload.mustChangePassword);
    if (fromFlags !== undefined) return fromFlags;
    const raw = jwtPayload.isFirstLoginYn;
    if (raw === undefined || raw === null) return undefined;
    return isYnYes(String(raw));
  })();
  const emailVerificationRequired = toBooleanMaybe(
    flagsFromToken?.emailVerificationRequired ?? jwtPayload.emailVerificationRequired,
  );
  const onboardingRequired = (() => {
    const fromFlags = toBooleanMaybe(flagsFromToken?.onboardingRequired ?? jwtPayload.onboardingRequired);
    if (fromFlags !== undefined) return fromFlags;
    const raw = jwtPayload.isOnboardingYn;
    if (raw === undefined || raw === null) return undefined;
    return isYnYes(String(raw));
  })();

  const id =
    (typeof jwtPayload.id === 'string' && jwtPayload.id) ||
    (typeof jwtPayload.memberId === 'string' && jwtPayload.memberId) ||
    (typeof jwtPayload.sub === 'string' && jwtPayload.sub);

  const name = (typeof jwtPayload.name === 'string' && jwtPayload.name) || undefined;
  const email = (typeof jwtPayload.email === 'string' && jwtPayload.email) || undefined;

  const jobTitleRaw =
    jwtPayload.jobTitle ?? jwtPayload.positionName ?? jwtPayload.rank ?? jwtPayload.jobGrade ?? jwtPayload.job_grade;
  const departmentRaw =
    jwtPayload.departmentName ??
    jwtPayload.deptName ??
    jwtPayload.organizationName ??
    jwtPayload.orgName ??
    jwtPayload.department;

  const companyNameRaw =
    jwtPayload.companyName ??
    jwtPayload.corpName ??
    jwtPayload.tenantName ??
    jwtPayload.businessName ??
    jwtPayload.clientCompanyName;

  const tenantIds = getTenantHeadersFromJwtPayload(jwtPayload);
  const companyId = tenantIds['X-Company-Id'];

  const companyLogoRaw =
    jwtPayload.companyLogoUrl ??
    jwtPayload.logoUrl ??
    jwtPayload.brandLogoUrl ??
    jwtPayload.companyLogo ??
    jwtPayload.companyImageUrl;

  const profileImageRaw =
    jwtPayload.profileUrl ??
    jwtPayload.profileImageUrl ??
    jwtPayload.avatarUrl ??
    jwtPayload.photoUrl ??
    jwtPayload.headImgUrl ??
    jwtPayload.headImageUrl;

  if (!id) {
    throw new Error('JWT payload missing identity');
  }

  let roleIdJwt =
    (typeof jwtPayload.roleId === 'string' && jwtPayload.roleId.trim()) ||
    (typeof jwtPayload.role_id === 'string' && jwtPayload.role_id.trim()) ||
    undefined;
  if (!roleIdJwt && jwtPayload.role && typeof jwtPayload.role === 'object' && !Array.isArray(jwtPayload.role)) {
    const r = jwtPayload.role as Record<string, unknown>;
    const nested = r.roleId ?? r.id ?? r.role_id;
    if (typeof nested === 'string' && nested.trim()) {
      roleIdJwt = nested.trim();
    }
  }
  const memberPositionIdJwt =
    (typeof jwtPayload.memberPositionId === 'string' && jwtPayload.memberPositionId.trim()) ||
    (typeof jwtPayload.member_position_id === 'string' && jwtPayload.member_position_id.trim()) ||
    undefined;

  return mapMe({
    id,
    companyId,
    name,
    email,
    permissions,
    roleId: roleIdJwt,
    memberPositionId: memberPositionIdJwt,
    isSystemAdmin: isSystemAdminFromJwt,
    isSystemAdminYn: pickIsSystemAdminYn({
      isSystemAdminYn: jwtPayload.isSystemAdminYn ?? jwtPayload.is_system_admin_yn,
    } as LoginResponse),
    jobTitle: typeof jobTitleRaw === 'string' ? jobTitleRaw : undefined,
    departmentName: typeof departmentRaw === 'string' ? departmentRaw : undefined,
    companyName: typeof companyNameRaw === 'string' ? companyNameRaw.trim() || undefined : undefined,
    companyLogoUrl: pickCompanyLogoUrl({
      companyLogoUrl: typeof companyLogoRaw === 'string' ? companyLogoRaw : undefined,
    }),
    profileImageUrl: pickProfileImageUrl({
      profileImageUrl: typeof profileImageRaw === 'string' ? profileImageRaw : undefined,
    }),
    flags: {
      mustChangePassword,
      onboardingRequired,
      emailVerificationRequired,
      accountStatus: (() => {
        const raw = flagsFromToken?.accountStatus;
        if (typeof raw !== 'string') return undefined;
        if (raw === 'ACTIVE' || raw === 'BLOCKED' || raw === 'DELETED') return raw;
        return undefined;
      })(),
    },
  });
}

async function getMeOrThrow(): Promise<Me> {
  const me = decodeMeFromAccessToken();
  // 1) 비-관리자도 사용 가능한 본인 전용 엔드포인트로 권한 재수화 (새로고침/AT 연장 후 핵심)
  let withMyPerms = await mergeMyPermissionsIntoMe(me);
  // 2) ROLE:READ 권한이 있는 사용자는 역할 상세에서 권한을 보강해 누락이 없도록 함 (실패 시 무시)
  withMyPerms = await mergeRolePermissionsIntoMe(withMyPerms);
  return withMyPerms;
}

export const authClient: AuthClient = {
  async login(input: LoginInput) {
    const response = await httpClient.post('/member/login', input);
    const root = response.data;
    if (root && typeof root === 'object' && 'success' in root && (root as { success?: boolean }).success === false) {
      const msg = (root as { message?: string }).message;
      throw new Error(typeof msg === 'string' && msg.trim() ? msg : '로그인에 실패했습니다.');
    }
    const payload = unwrapApiResponse<LoginResponse>(response.data);
    const token = payload?.accessToken ?? payload?.access_token ?? null;
    setAccessToken(token);

    const memberId = typeof payload.memberId === 'string' ? payload.memberId : typeof payload.id === 'string' ? payload.id : null;
    const positionId = typeof payload.memberPositionId === 'string' ? payload.memberPositionId : null;
    if (memberId) {
      setRefreshIdentity(memberId, positionId);
    }

    let me: Me;
    try {
      me = decodeMeFromAccessToken();
    } catch (error) {
      if (!hasFallbackUserPayload(payload)) {
        throw error;
      }
      me = mapMe({ ...payload, email: typeof payload.email === 'string' ? payload.email : input.email });
    }

    const loginOverlay = mapMe(payload);
    me = {
      ...me,
      permissions: mergePermissionStrings(me.permissions, loginOverlay.permissions, extractLoginPermissions(payload)),
      roleId: me.roleId ?? loginOverlay.roleId,
      memberPositionId: me.memberPositionId ?? loginOverlay.memberPositionId,
      isSystemAdmin:
        loginOverlay.isSystemAdmin !== undefined ? loginOverlay.isSystemAdmin : me.isSystemAdmin,
      isSystemAdminYn: loginOverlay.isSystemAdminYn ?? me.isSystemAdminYn,
    };
    if (!me.name?.trim() && loginOverlay.name) {
      me = { ...me, name: loginOverlay.name };
    }
    if (!me.email?.trim() && loginOverlay.email) {
      me = { ...me, email: loginOverlay.email };
    }
    if (!me.companyId && loginOverlay.companyId) {
      me = { ...me, companyId: loginOverlay.companyId };
    }

    me = await mergeRolePermissionsIntoMe(me);
    /**
     * 로그인 응답의 `permissions` 가 누락/부분 응답인 경우를 대비해 본인 권한 엔드포인트로 한 번 더 보강.
     * 새로고침 시 호출되는 `getMeOrThrow` 와 동일한 경로를 사용해 결과가 일치하도록 보장한다.
     */
    me = await mergeMyPermissionsIntoMe(me);

    /** 로그인 응답의 isFirstLoginYn 은 JWT에 없을 수 있어, 최초 로그인 시 비밀번호 변경 플래그를 여기서 확정 */
    if (payload.isFirstLoginYn !== undefined) {
      me = {
        ...me,
        flags: {
          ...me.flags,
          mustChangePassword: isYnYes(payload.isFirstLoginYn),
        },
      };
    }
    if (payload.isOnboardingYn !== undefined) {
      me = {
        ...me,
        flags: {
          ...me.flags,
          onboardingRequired: isYnYes(payload.isOnboardingYn),
        },
      };
    }

    currentSession = { user: me };
    return currentSession;
  },
  async logout() {
    try {
      await httpClient.post('/member/logout');
    } finally {
      clearAccessToken();
      clearRefreshIdentity();
      /** 세션의 user·permissions 제거 — UI는 AuthProvider `logout()`에서 `user` null 로 초기화 */
      currentSession = null;
    }
  },
  async getSession() {
    if (currentSession) {
      return currentSession;
    }

    if (!getAccessToken()) {
      return null;
    }

    try {
      const me = await getMeOrThrow();
      currentSession = { user: me };
      return currentSession;
    } catch {
      clearAccessToken();
      return null;
    }
  },
  async getMe() {
    return getMeOrThrow();
  },
  /** POST /member/generate-at — 연장 버튼 전용. 401 시 httpClient 인터셉터가 스토어 정리 후 /login 이동. */
  async refreshSession() {
    setAuthRefreshInFlight(true);
    try {
      const response = await httpClient.post('/member/generate-at');
      const payload = unwrapApiResponse<LoginResponse>(response.data);
      const token = payload?.accessToken ?? payload?.access_token ?? null;
      setAccessToken(token);

      const mid = typeof payload.memberId === 'string' ? payload.memberId.trim() : '';
      const pid = typeof payload.memberPositionId === 'string' ? payload.memberPositionId.trim() : '';
      if (mid) {
        setRefreshIdentity(mid, pid || null);
      }

      let me = await getMeOrThrow();
      const fromRefresh = extractLoginPermissions(payload);
      if (fromRefresh.length > 0) {
        me = {
          ...me,
          permissions: mergePermissionStrings(me.permissions, fromRefresh),
        };
      }
      currentSession = { user: me };
      return currentSession;
    } catch {
      currentSession = null;
      return null;
    } finally {
      setAuthRefreshInFlight(false);
    }
  },
};
