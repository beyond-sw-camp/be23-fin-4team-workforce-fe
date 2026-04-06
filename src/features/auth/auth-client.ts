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
  isFirstLoginYn?: 'Y' | 'N';
  isEmailVerifiedYn?: 'Y' | 'N';
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

function decodeBase64Url(value: string): string {
  // JWT payload is base64url encoded; normalize to standard base64.
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
  return atob(padded);
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split('.');
  if (parts.length < 2) return null;
  const payloadPart = parts[1];
  if (typeof payloadPart !== 'string') return null;
  try {
    const decoded = decodeBase64Url(payloadPart);
    return JSON.parse(decoded) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function mapMe(payload: Partial<LoginResponse> & Partial<Me>): Me {
  const emailVerificationRequired =
    payload.isEmailVerifiedYn === undefined ? undefined : !toBooleanFlag(payload.isEmailVerifiedYn);

  return {
    id: payload.id ?? payload.memberId ?? '',
    name: payload.name ?? '',
    email: payload.email ?? '',
    permissions: payload.permissions ?? [],
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

  const permissions = Array.isArray(permissionsRaw)
    ? permissionsRaw
        .map((x) => {
          if (typeof x === 'string') return x;
          if (x && typeof x === 'object') {
            const obj = x as Record<string, unknown>;
            const code = obj.code ?? obj.permission ?? obj.name ?? obj.value;
            return typeof code === 'string' ? code : undefined;
          }
          return undefined;
        })
        .filter((x): x is string => typeof x === 'string')
    : [];

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

  if (!id) {
    throw new Error('JWT payload missing identity');
  }

  return mapMe({
    id,
    name,
    email,
    permissions,
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
