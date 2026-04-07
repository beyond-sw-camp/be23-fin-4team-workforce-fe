/** JWT에서 멀티테넌시 헤더 값만 추출합니다. httpClient와 auth 모두에서 사용하며 httpClient ↔ auth-client 순환 참조를 피합니다. */

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

export function decodeJwtPayload(token: string): Record<string, unknown> | null {
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

export type TenantHeaderValues = {
  'X-Member-Id'?: string;
  'X-Company-Id'?: string;
};

export function getTenantHeadersFromJwtPayload(payload: Record<string, unknown> | null): TenantHeaderValues {
  if (!payload) return {};

  const memberId =
    (typeof payload.memberId === 'string' && payload.memberId) ||
    (typeof payload.id === 'string' && payload.id) ||
    (typeof payload.sub === 'string' && payload.sub) ||
    undefined;

  const companyId =
    (typeof payload.companyId === 'string' && payload.companyId) ||
    (typeof payload.company_id === 'string' && payload.company_id) ||
    (typeof payload.corpId === 'string' && payload.corpId) ||
    (typeof payload.tenantId === 'string' && payload.tenantId) ||
    undefined;

  const out: TenantHeaderValues = {};
  if (memberId) out['X-Member-Id'] = memberId;
  if (companyId) out['X-Company-Id'] = companyId;
  return out;
}

export function getTenantHeadersFromToken(token: string | null | undefined): TenantHeaderValues {
  if (!token) return {};
  return getTenantHeadersFromJwtPayload(decodeJwtPayload(token));
}
