/** Spring Page → 테이블 페이지네이션에 쓰기 좋게만 정리 */
import type { SpringPage } from '@/features/salary-service/types';

export type NormalizedPage<T> = {
  content: T[];
  totalElements: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export function normalizeSpringPage<T>(raw: SpringPage<T> | null | undefined): NormalizedPage<T> {
  if (!raw || !Array.isArray(raw.content)) {
    return { content: [], totalElements: 0, page: 0, pageSize: 20, totalPages: 0 };
  }
  return {
    content: raw.content,
    totalElements: raw.totalElements ?? raw.content.length,
    page: raw.number ?? 0,
    pageSize: raw.size ?? 20,
    totalPages: raw.totalPages ?? 0,
  };
}
