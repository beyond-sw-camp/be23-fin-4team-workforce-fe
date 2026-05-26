import type { Me } from '@/features/auth/types';

/** `auth-client` 세션과 동기화 — httpClient 인터셉터에서 병합된 `permissions` 반영용 */
let mirroredUser: Me | null = null;

export function setAuthSessionMirrorUser(user: Me | null) {
  mirroredUser = user;
}

export function getAuthSessionMirrorUser(): Me | null {
  return mirroredUser;
}
