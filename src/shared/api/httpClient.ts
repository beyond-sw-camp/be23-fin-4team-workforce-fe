import axios from 'axios';
import type { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { env } from '@/app/config/env';
import { parseApiError } from '@/shared/api/error-parser';
import { unwrapApiResponse } from '@/shared/api/response';
import { getTenantHeadersFromToken } from '@/shared/auth/jwtTenantClaims';
import { clearRefreshIdentity, getRefreshIdentityHeaders, setRefreshIdentity } from '@/shared/stores/authRefreshIdentityStore';
import { getAccessToken, setAccessToken } from '@/shared/stores/authTokenStore';

export const httpClient = axios.create({
  baseURL: env.VITE_API_BASE_URL,
  timeout: env.apiRequestTimeoutMs,
  withCredentials: true,
});

httpClient.interceptors.request.use((config) => {
  const token = getAccessToken();
  config.headers = config.headers ?? {};
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  const tenant = getTenantHeadersFromToken(token);
  if (tenant['X-Member-Id']) {
    config.headers['X-Member-Id'] = tenant['X-Member-Id'];
    /** company-service 등 `@RequestHeader("X-User-Id")` 와 동일 멤버 UUID */
    config.headers['X-User-Id'] = tenant['X-Member-Id'];
  }
  if (tenant['X-Company-Id']) {
    const cid = tenant['X-Company-Id'];
    config.headers['X-Company-Id'] = cid;
    /** goal-service 등에서 `@RequestHeader("X-User-CompanyId")` 사용 */
    config.headers['X-User-CompanyId'] = cid;
  }
  const refreshIdentity = getRefreshIdentityHeaders();
  if (refreshIdentity['X-User-UUID']) {
    config.headers['X-User-UUID'] = refreshIdentity['X-User-UUID'];
  }
  if (refreshIdentity['X-User-MemberPositionId']) {
    config.headers['X-User-MemberPositionId'] = refreshIdentity['X-User-MemberPositionId'];
  }
  return config;
});

let refreshPromise: Promise<string | null> | null = null;

type RefreshResponse = {
  accessToken?: string;
  access_token?: string;
  memberId?: string;
  memberPositionId?: string;
};

async function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    try {
      const token = getAccessToken();
      const identityHeaders = getRefreshIdentityHeaders();
      const response = await axios.post(`${env.VITE_API_BASE_URL}/member/generate-at`, {}, {
        timeout: env.apiRequestTimeoutMs,
        withCredentials: true,
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...identityHeaders,
        },
      });
      const data = unwrapApiResponse<RefreshResponse>(response.data);
      const nextToken = data?.accessToken ?? data?.access_token ?? null;
      setAccessToken(nextToken);
      const mid = typeof data?.memberId === 'string' ? data.memberId.trim() : '';
      const pid = typeof data?.memberPositionId === 'string' ? data.memberPositionId.trim() : '';
      if (mid) {
        setRefreshIdentity(mid, pid || null);
      }
      return nextToken;
    } catch {
      setAccessToken(null);
      clearRefreshIdentity();
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

type RetriableRequestConfig = InternalAxiosRequestConfig & { _retry?: boolean };

function isPublicAuthRoute(url: string) {
  return ['/member/login', '/member/email/', '/member/reset-password/'].some((path) => url.includes(path));
}

httpClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const config = error.config as RetriableRequestConfig | undefined;
    const status = error?.response?.status;
    const requestUrl: string = config?.url ?? '';
    const isRefreshCall = requestUrl.includes('/member/generate-at');
    const isPublicAuthCall = isPublicAuthRoute(requestUrl);
    const alreadyRetried = Boolean(config?._retry);

    if (status === 401 && !alreadyRetried && !isRefreshCall && !isPublicAuthCall && config) {
      config._retry = true;
      const refreshed = await refreshAccessToken();
      if (refreshed) {
        config.headers = config.headers ?? {};
        config.headers.Authorization = `Bearer ${refreshed}`;
        return httpClient.request(config);
      }
    }

    return Promise.reject(parseApiError(error));
  },
);
