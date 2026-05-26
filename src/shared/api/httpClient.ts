import axios from 'axios';
import type { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { env } from '@/app/config/env';
import { parseApiError } from '@/shared/api/error-parser';
import { hasHrPermissionFromAuth } from '@/shared/auth/hrAdminFromToken';
import { decodeJwtPayload, getTenantHeadersFromToken, isSystemAdminFromJwtPayload } from '@/shared/auth/jwtTenantClaims';
import { isAuthRefreshInFlight } from '@/shared/stores/authRefreshInFlightStore';
import { clearRefreshIdentity, getRefreshIdentityHeaders } from '@/shared/stores/authRefreshIdentityStore';
import { setAuthSessionMirrorUser } from '@/shared/stores/authSessionMirrorStore';
import { clearAccessToken, getAccessToken } from '@/shared/stores/authTokenStore';

export const httpClient = axios.create({
  baseURL: env.VITE_API_BASE_URL,
  timeout: env.apiRequestTimeoutMs,
  /** RT(HttpOnly) 쿠키 포함 — POST /member/generate-at 등 */
  withCredentials: true,
});

function isRefreshEndpoint(url?: string) {
  if (!url) return false;
  return url.includes('/member/generate-at');
}

httpClient.interceptors.request.use((config) => {
  const token = getAccessToken();
  const requestUrl = config.url ?? '';
  const isRefreshCall = isRefreshEndpoint(requestUrl);
  config.headers = config.headers ?? {};
  const trimmedToken = token?.trim() || null;
  /**
   * 세션 연장 API(`/member/generate-at`)는 RT(HttpOnly 쿠키) 기반으로 동작합니다.
   * 여기에 만료된 AT를 Authorization으로 같이 보내면 게이트웨이에서 401을 먼저 반환할 수 있어
   * "연장 버튼 클릭 -> 즉시 로그아웃" 현상이 발생합니다.
   */
  if (trimmedToken && !isRefreshCall) {
    /** `Bearer` + 공백 1개 + 토큰 (RFC 관례). 토큰 앞뒤 공백은 제거 */
    config.headers.Authorization = `Bearer ${trimmedToken}`;
  }
  const tenant = getTenantHeadersFromToken(trimmedToken);
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
  const userUuid = refreshIdentity['X-User-UUID']?.trim() || tenant['X-Member-Id']?.trim();
  if (userUuid) {
    config.headers['X-User-UUID'] = userUuid;
  }
  if (refreshIdentity['X-User-MemberPositionId']) {
    config.headers['X-User-MemberPositionId'] = refreshIdentity['X-User-MemberPositionId'];
  }
  if (trimmedToken && !isRefreshCall) {
    const payload = decodeJwtPayload(trimmedToken);
    /** member-service `PermissionAspect`: YES면 Redis 권한 없이 통과, NO면 Redis ESG:READ 등 필요 */
    config.headers['X-User-IsSystemAdmin'] =
      payload && isSystemAdminFromJwtPayload(payload) ? 'YES' : 'NO';
    config.headers['X-User-IsHrAdmin'] = hasHrPermissionFromAuth(trimmedToken) ? 'YES' : 'NO';
  }
  return config;
});

function isPublicAuthRoute(url: string) {
  return (
    ['/member/login', '/member/email/'].some((path) => url.includes(path)) ||
    url.includes('/member/reset-password')
  );
}

/**
 * AT 만료 등으로 401이면 자동 재발급하지 않음(연장 버튼으로만 POST /member/generate-at).
 * 앱 영역 요청이 401이면 로컬 인증 정보 제거 후 로그인으로 이동(RT 만료 등).
 */
httpClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    const parsed = parseApiError(error);
    const config = error.config as InternalAxiosRequestConfig | undefined;
    const requestUrl = config?.url ?? '';
    const isPublicAuthCall = isPublicAuthRoute(requestUrl);

    if (
      parsed.status === 401 &&
      !isPublicAuthCall &&
      !isAuthRefreshInFlight() &&
      typeof window !== 'undefined' &&
      !window.location.pathname.startsWith('/login')
    ) {
      clearAccessToken();
      clearRefreshIdentity();
      setAuthSessionMirrorUser(null);
      try {
        window.localStorage.clear();
      } catch {
        /* ignore */
      }
      window.location.assign('/login');
    }

    return Promise.reject(parsed);
  },
);
