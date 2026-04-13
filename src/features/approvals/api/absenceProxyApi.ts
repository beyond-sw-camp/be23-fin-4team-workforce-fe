import { httpClient } from '@/shared/api/httpClient';
import { unwrapApiResponse } from '@/shared/api/response';

export type AbsenceProxyRecord = {
  proxyId: string;
  companyId: string;
  memberId: string;
  substituteId: string;
  startDate: string;
  endDate: string;
  isActiveYn: 'Y' | 'N';
  createdAt: string;
  updatedAt: string;
};

function asText(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return String(value);
  return '';
}

function asYn(value: unknown): 'Y' | 'N' {
  return String(value).toUpperCase() === 'Y' ? 'Y' : 'N';
}

function pickArray(raw: unknown, depth = 0): unknown[] {
  if (depth > 6) return [];
  if (Array.isArray(raw)) return raw;
  if (!raw || typeof raw !== 'object') return [];
  const o = raw as Record<string, unknown>;
  for (const k of [
    'data',
    'items',
    'list',
    'content',
    'result',
    'rows',
    'payload',
    'body',
    'records',
    'proxies',
    'values',
    'elements',
  ]) {
    const v = o[k];
    if (Array.isArray(v)) return v;
    if (v && typeof v === 'object') {
      const nested = pickArray(v, depth + 1);
      if (nested.length) return nested;
    }
  }
  return [];
}

/** DTO가 한 번 더 감싸진 경우 */
function unwrapAbsenceProxyPayload(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const nested =
    o.absenceProxy ??
    o.absence_proxy ??
    o.proxy ??
    o.dto ??
    o.item ??
    o.entity ??
    o.absenceProxyResDto ??
    o.absence_proxy_res_dto;
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    return nested as Record<string, unknown>;
  }
  return o;
}

function normalizeAbsenceProxy(raw: unknown): AbsenceProxyRecord | null {
  const o = unwrapAbsenceProxyPayload(raw);
  if (!o) return null;
  const proxyId = asText(
    o.proxyId ?? o.proxy_id ?? o.id ?? o.absenceProxyId ?? o.absence_proxy_id,
  );
  if (!proxyId) return null;
  return {
    proxyId,
    companyId: asText(o.companyId ?? o.company_id),
    memberId: asText(
      o.memberId ?? o.member_id ?? o.delegatorMemberId ?? o.delegator_member_id ?? o.ownerMemberId ?? o.owner_member_id,
    ),
    substituteId: asText(
      o.substituteId ??
        o.substitute_id ??
        o.substituteMemberId ??
        o.substitute_member_id ??
        o.delegateMemberId ??
        o.delegate_member_id,
    ),
    startDate: asText(o.startDate ?? o.start_date ?? o.startAt ?? o.start_at),
    endDate: asText(o.endDate ?? o.end_date ?? o.endAt ?? o.end_at),
    isActiveYn: asYn(o.isActiveYn ?? o.is_active_yn),
    createdAt: asText(o.createdAt ?? o.created_at),
    updatedAt: asText(o.updatedAt ?? o.updated_at),
  };
}

function unwrapOne(raw: unknown): AbsenceProxyRecord {
  const v = normalizeAbsenceProxy(raw);
  if (!v) throw new Error('부재 위임 응답을 해석할 수 없습니다.');
  return v;
}

/** `{ status: "FAIL", message }` 형태로 HTTP 200만 오는 경우 */
function assertApiSuccessEnvelope(rawPayload: unknown): void {
  if (!rawPayload || typeof rawPayload !== 'object') return;
  const o = rawPayload as Record<string, unknown>;
  const st = o.status;
  if (typeof st !== 'string') return;
  const u = st.trim().toUpperCase();
  if (['FAIL', 'ERROR', 'FAILED', 'FALSE', 'NOK'].includes(u)) {
    const msg = typeof o.message === 'string' && o.message.trim() ? o.message.trim() : '목록 조회에 실패했습니다.';
    throw new Error(msg);
  }
}

/** JSON 안의 어느 깊이든, 첫 원소가 위임 DTO로 해석되는 배열을 찾음 */
function deepFindProxyRowArray(root: unknown): unknown[] {
  let best: unknown[] = [];
  const visit = (x: unknown): void => {
    if (x == null) return;
    if (Array.isArray(x)) {
      if (x.length > 0 && normalizeAbsenceProxy(x[0]) != null && x.length > best.length) {
        best = x;
      }
      for (const el of x) visit(el);
      return;
    }
    if (typeof x === 'object') {
      for (const v of Object.values(x as Record<string, unknown>)) {
        visit(v);
      }
    }
  };
  visit(root);
  return best;
}

function mapToRecords(rows: unknown[]): AbsenceProxyRecord[] {
  return rows.map((row) => normalizeAbsenceProxy(row)).filter((v): v is AbsenceProxyRecord => v != null);
}

/** 목록 API: `data` 언랩 후 배열 탐색, 비어 있으면 원본·깊은 탐색·단건 객체 */
function extractAbsenceProxyList(rawPayload: unknown): AbsenceProxyRecord[] {
  const unwrapped = unwrapApiResponse<unknown>(rawPayload);
  let rows = pickArray(unwrapped);
  if (rows.length === 0) {
    rows = pickArray(rawPayload);
  }
  if (rows.length === 0) {
    rows = deepFindProxyRowArray(unwrapped);
  }
  if (rows.length === 0) {
    rows = deepFindProxyRowArray(rawPayload);
  }
  if (rows.length > 0) {
    return mapToRecords(rows);
  }
  const single = normalizeAbsenceProxy(unwrapped) ?? normalizeAbsenceProxy(rawPayload);
  return single ? [single] : [];
}

export type CreateAbsenceProxyPayload = {
  substituteId: string;
  startDate: string;
  endDate: string;
};

export const absenceProxyApi = {
  async create(payload: CreateAbsenceProxyPayload): Promise<AbsenceProxyRecord> {
    const response = await httpClient.post('/approval/absence-proxy', payload);
    return unwrapOne(unwrapApiResponse<unknown>(response.data));
  },

  async listMine(): Promise<AbsenceProxyRecord[]> {
    const response = await httpClient.get('/approval/absence-proxy/my');
    assertApiSuccessEnvelope(response.data);
    return extractAbsenceProxyList(response.data);
  },

  async listDelegatedToMe(): Promise<AbsenceProxyRecord[]> {
    const response = await httpClient.get('/approval/absence-proxy/delegated');
    assertApiSuccessEnvelope(response.data);
    return extractAbsenceProxyList(response.data);
  },

  async deactivate(proxyId: string): Promise<AbsenceProxyRecord> {
    const response = await httpClient.patch(
      `/approval/absence-proxy/${encodeURIComponent(proxyId)}/deactivate`,
    );
    return unwrapOne(unwrapApiResponse<unknown>(response.data));
  },
};
