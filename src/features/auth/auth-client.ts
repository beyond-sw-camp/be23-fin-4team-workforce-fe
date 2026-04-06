import type { AuthClient, AuthSession, LoginInput, Me } from '@/features/auth/types';
import { httpClient } from '@/shared/api/httpClient';
import { unwrapApiResponse } from '@/shared/api/response';
import { clearAccessToken, getAccessToken, setAccessToken } from '@/shared/stores/authTokenStore';

type LoginResponse = {
  accessToken?: string;
  access_token?: string;
  memberId?: string;
  id?: string;
  name?: string;
  email?: string;
  permissions?: string[];
  isSystemAdminYn?: 'Y' | 'N';
  isFirstLoginYn?: 'Y' | 'N';
  isEmailVerifiedYn?: 'Y' | 'N';
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

function toBooleanFlag(value?: 'Y' | 'N') {
  return value === 'Y';
}

function toBooleanMaybe(value: unknown): boolean | undefined {
  if (value === 'Y') return true;
  if (value === 'N') return false;
  if (typeof value === 'boolean') return value;
  return undefined;
}

/** Base64url → UTF-8 문자열 (JWT JSON 본문에 한글 등이 있을 때 `atob`만 쓰면 깨짐) */
function decodeBase64UrlPayloadToUtf8(payloadPart: string): string {
  const normalized = payloadPart.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder('utf-8').decode(bytes);
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split('.');
  if (parts.length < 2) return null;
  const payloadPart = parts[1];
  if (typeof payloadPart !== 'string') return null;
  try {
    const jsonText = decodeBase64UrlPayloadToUtf8(payloadPart);
    return JSON.parse(jsonText) as Record<string, unknown>;
  } catch {
    return null;
  }
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
    payload.isEmailVerifiedYn === undefined ? undefined : !toBooleanFlag(payload.isEmailVerifiedYn);

  const fromPayload =
    payload.isSystemAdmin ??
    (payload.isSystemAdminYn !== undefined ? parseIsSystemAdmin(payload.isSystemAdminYn) : undefined);

  return {
    id: payload.id ?? payload.memberId ?? '',
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
        payload.isFirstLoginYn === undefined ? payload.flags?.mustChangePassword : toBooleanFlag(payload.isFirstLoginYn),
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

  const isSystemAdminFromJwt = parseIsSystemAdmin(jwtPayload.isSystemAdmin);

  const flagsFromToken = (jwtPayload.flags && typeof jwtPayload.flags === 'object' ? jwtPayload.flags : {}) as
    | Record<string, unknown>
    | undefined;

  const mustChangePassword = toBooleanMaybe(flagsFromToken?.mustChangePassword ?? jwtPayload.mustChangePassword);
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
    const payload = unwrapApiResponse<LoginResponse>(response.data);
    const token = payload?.accessToken ?? payload?.access_token ?? null;
    setAccessToken(token);

    let me: Me;
    try {
      me = await getMeOrThrow();
    } catch (error) {
      if (!hasFallbackUserPayload(payload)) {
        throw error;
      }
      me = mapMe(payload);
    }

    currentSession = { user: me };
    return currentSession;
  },
  async logout() {
    try {
      await httpClient.post('/member/logout');
    } finally {
      clearAccessToken();
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
  async refreshSession() {
    try {
      const response = await httpClient.post('/member/generate-at');
      const payload = unwrapApiResponse<LoginResponse>(response.data);
      const token = payload?.accessToken ?? payload?.access_token ?? null;
      setAccessToken(token);

      const me = await getMeOrThrow();
      currentSession = { user: me };
      return currentSession;
    } catch {
      clearAccessToken();
      currentSession = null;
      return null;
    }
  },
};
