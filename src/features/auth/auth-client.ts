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
  const response = await httpClient.get('/member/me');
  const payload = unwrapApiResponse<Partial<Me> & Partial<LoginResponse>>(response.data);
  return mapMe(payload);
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
