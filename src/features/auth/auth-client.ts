import type { AuthClient, AuthSession, LoginInput, Me } from '@/features/auth/types';
import { httpClient } from '@/shared/api/httpClient';
import { unwrapApiResponse } from '@/shared/api/response';
import { decodeJwtPayload, getTenantHeadersFromJwtPayload } from '@/shared/auth/jwtTenantClaims';
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
  permissions?: string[];
  isSystemAdminYn?: 'Y' | 'N';
  isFirstLoginYn?: 'Y' | 'N' | 'YES' | 'NO';
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

function pickCompanyId(payload: Partial<LoginResponse> & Partial<Me>): string | undefined {
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

function pickJobTitle(payload: Partial<LoginResponse> & Partial<Me>): string | undefined {
  const raw = payload.jobTitle ?? payload.positionName ?? payload.rank;
  return typeof raw === 'string' && raw.trim() ? raw.trim() : undefined;
}

function pickDepartmentName(payload: Partial<LoginResponse> & Partial<Me>): string | undefined {
  const raw = payload.departmentName ?? payload.deptName ?? payload.organizationName;
  return typeof raw === 'string' && raw.trim() ? raw.trim() : undefined;
}

function pickCompanyName(payload: Partial<LoginResponse> & Partial<Me>): string | undefined {
  const raw =
    payload.companyName ??
    payload.corpName ??
    payload.tenantName ??
    payload.businessName ??
    payload.clientCompanyName;
  return typeof raw === 'string' && raw.trim() ? raw.trim() : undefined;
}

function pickCompanyLogoUrl(payload: Partial<LoginResponse> & Partial<Me>): string | undefined {
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

function pickProfileImageUrl(payload: Partial<LoginResponse> & Partial<Me>): string | undefined {
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

function mapMe(payload: Partial<LoginResponse> & Partial<Me>): Me {
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
    permissions: payload.permissions ?? [],
    isSystemAdmin: fromPayload,
    jobTitle: pickJobTitle(payload),
    departmentName: pickDepartmentName(payload),
    companyName: pickCompanyName(payload),
    companyLogoUrl: pickCompanyLogoUrl(payload),
    profileImageUrl: pickProfileImageUrl(payload),
    flags: {
      mustChangePassword:
        payload.isFirstLoginYn === undefined ? payload.flags?.mustChangePassword : isYnYes(payload.isFirstLoginYn),
      emailVerificationRequired: payload.flags?.emailVerificationRequired ?? emailVerificationRequired,
      accountStatus: payload.flags?.accountStatus ?? 'ACTIVE',
    },
  };
}

function hasFallbackUserPayload(payload: Partial<LoginResponse> & Partial<Me>) {
  return Boolean(payload.id ?? payload.memberId);
}

async function getMeOrThrow() {
  // Backend doesn't currently expose a "current user" GET endpoint like `/member/me`.
  // Reconstruct `Me` from the access token claims so auth/permission routing can work.
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

  let permissions: string[] = [];
  if (typeof permissionsRaw === 'string' && permissionsRaw.trim()) {
    permissions = permissionsRaw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  } else if (Array.isArray(permissionsRaw)) {
    permissions = permissionsRaw
      .map((x) => {
        if (typeof x === 'string') return x;
        if (x && typeof x === 'object') {
          const obj = x as Record<string, unknown>;
          const code = obj.code ?? obj.permission ?? obj.name ?? obj.value;
          return typeof code === 'string' ? code : undefined;
        }
        return undefined;
      })
      .filter((x): x is string => typeof x === 'string');
  }

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

  return mapMe({
    id,
    companyId,
    name,
    email,
    permissions,
    isSystemAdmin: isSystemAdminFromJwt,
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
      me = await getMeOrThrow();
    } catch (error) {
      if (!hasFallbackUserPayload(payload)) {
        throw error;
      }
      me = mapMe({ ...payload, email: typeof payload.email === 'string' ? payload.email : input.email });
    }
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

    currentSession = { user: me };
    return currentSession;
  },
  async logout() {
    try {
      await httpClient.post('/member/logout');
    } finally {
      clearAccessToken();
      clearRefreshIdentity();
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

      const me = await getMeOrThrow();
      currentSession = { user: me };
      return currentSession;
    } catch {
      currentSession = null;
      return null;
    }
  },
};
