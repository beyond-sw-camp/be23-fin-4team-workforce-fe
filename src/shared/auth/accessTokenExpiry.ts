import { decodeJwtPayload } from '@/shared/auth/jwtTenantClaims';

/** 백엔드 AT 만료(기본 30분) — JWT에 `exp`가 없을 때만 사용 */
export const ACCESS_TOKEN_TTL_MS = 30 * 60 * 1000;

export function getJwtExpiryMsFromToken(token: string): number | null {
  const payload = decodeJwtPayload(token);
  if (!payload) return null;
  const exp = payload.exp;
  if (typeof exp === 'number' && Number.isFinite(exp)) {
    return exp * 1000;
  }
  return null;
}

/**
 * 세션 만료 시각(ms).
 * 백엔드가 JWT `exp`를 24시간 등으로 길게 두는 경우에도, AT 정책(30분)에 맞춰
 * **지금부터 최대 30분**까지만 카운트합니다. 그보다 짧게 만료되면 실제 `exp`를 따릅니다.
 */
export function computeAccessExpiryMs(token: string | null): number | null {
  if (!token) return null;
  const now = Date.now();
  const fromJwt = getJwtExpiryMsFromToken(token);
  if (fromJwt != null) {
    const msLeft = fromJwt - now;
    if (msLeft > ACCESS_TOKEN_TTL_MS) {
      return now + ACCESS_TOKEN_TTL_MS;
    }
    return fromJwt;
  }
  return now + ACCESS_TOKEN_TTL_MS;
}
