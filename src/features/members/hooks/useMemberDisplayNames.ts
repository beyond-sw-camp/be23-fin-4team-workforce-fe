import { useQuery } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { membersApi } from '@/features/members/api/membersApi';
import type { Member } from '@/features/members/model/types';

/** 목록·상세 조회 모두에 없을 때 `labelFor` 폴백 — 화면에서는 i18n으로 치환해도 됨 */
export const MEMBER_DISPLAY_LABEL_UNKNOWN = '이름 미확인';

function labelFromMember(m: Member): string {
  const d = m.department?.trim();
  if (d) return `${m.name} · ${d}`;
  return m.name?.trim() || m.email?.trim() || '—';
}

function normalizeMemberId(id: string | null | undefined): string {
  return String(id ?? '').trim().toLowerCase();
}

/**
 * 목표/승인/활동 등에 노출되는 member UUID → 사원 표시명 매핑.
 * 목록 기반으로 먼저 매핑하고, 목록에서 빠진 UUID만 상세 API로 보강합니다.
 */
export function useMemberDisplayNames(memberIds: readonly string[]) {
  const sortedUnique = useMemo(
    () => [...new Set(memberIds.map(normalizeMemberId).filter(Boolean))].sort(),
    [memberIds],
  );

  const query = useQuery({
    queryKey: ['members', 'display-labels', sortedUnique],
    enabled: sortedUnique.length > 0,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Map<string, string>> => {
      const map = new Map<string, string>();
      const listRes = await membersApi.list({ page: 1, pageSize: 2000 });
      for (const m of listRes.items) {
        map.set(normalizeMemberId(m.id), labelFromMember(m));
      }
      const missingIds = sortedUnique.filter((id) => !map.has(id));
      const details = await Promise.all(
        missingIds.map(async (id) => {
          try {
            return await membersApi.detail(id);
          } catch {
            return null;
          }
        }),
      );
      for (const m of details) {
        if (m?.id) map.set(normalizeMemberId(m.id), labelFromMember(m));
      }
      return map;
    },
  });

  const labelFor = useCallback(
    (id: string | null | undefined) => {
      const t = normalizeMemberId(id);
      if (!t) return '—';
      const hit = query.data?.get(t);
      if (hit) return hit;
      if (query.isFetching) return '…';
      return MEMBER_DISPLAY_LABEL_UNKNOWN;
    },
    [query.data, query.isFetching],
  );

  return { labelFor, map: query.data, isFetching: query.isFetching };
}
