import dayjs from 'dayjs';

import type { EsgActivity } from '@/features/esg/api/esgApi';

/** API status → 한글 (백엔드 enum 대소문자 혼용 대비) */
export const ACTIVITY_STATUS_KO: Record<string, string> = {
  PENDING: '심사 대기',
  APPROVED: '승인',
  REJECTED: '반려',
  DRAFT: '임시저장',
  CANCELLED: '취소',
};

const ESG_CATEGORY_KO: Record<string, string> = {
  E: '환경(E)',
  S: '사회(S)',
  G: '지배구조(G)',
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `{ activity: { id } }` 등 백엔드 응답 변형 병합 */
function flattenActivityRow(row: EsgActivity): Record<string, unknown> {
  const r = row as Record<string, unknown>;
  const inner =
    r.activity ?? r.activityDto ?? r.esgActivity ?? r.esgActivityDto ?? r.activityInfo;
  if (inner && typeof inner === 'object' && !Array.isArray(inner)) {
    return { ...(inner as Record<string, unknown>), ...r };
  }
  return r;
}

export function pickActivityId(row: EsgActivity): string {
  const r = flattenActivityRow(row);
  const keys = [
    'esgActivityId',
    'esg_activity_id',
    'activityId',
    'id',
    'activity_id',
    'activityUuid',
    'activity_uuid',
  ];
  for (const k of keys) {
    const v = r[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  }
  /** 필드명이 다를 때 행 안의 UUID 형태 문자열 (단일 후보일 때) */
  const uuids: string[] = [];
  for (const v of Object.values(r)) {
    if (typeof v === 'string') {
      const t = v.trim();
      if (UUID_RE.test(t)) uuids.push(t);
    }
  }
  if (uuids.length === 1) return uuids[0]!;
  return '';
}

export function pickSubjectIdFromActivity(row: EsgActivity): string {
  const r = row as Record<string, unknown>;
  const raw = r.subjectId ?? r.subject_id;
  if (typeof raw === 'string' && raw.trim()) return raw.trim();
  if (typeof raw === 'number' && Number.isFinite(raw)) return String(raw);
  const sub = r.subject;
  if (sub && typeof sub === 'object' && !Array.isArray(sub)) {
    const o = sub as Record<string, unknown>;
    const id = o.id ?? o.subjectId ?? o.subject_id;
    if (typeof id === 'string' && id.trim()) return id.trim();
    if (typeof id === 'number' && Number.isFinite(id)) return String(id);
  }
  return '';
}

/** 백엔드 memberName 또는 중첩 member.name */
export function resolveMemberName(row: EsgActivity): string {
  const r = row as Record<string, unknown>;
  const direct = r.memberName ?? r.member_name;
  if (typeof direct === 'string' && direct.trim()) return direct.trim();
  const m = r.member;
  if (m && typeof m === 'object' && !Array.isArray(m)) {
    const n = (m as Record<string, unknown>).name;
    if (typeof n === 'string' && n.trim()) return n.trim();
  }
  return '—';
}

function pickCategoryCode(raw: unknown): string {
  if (raw == null || raw === '') return '';
  const s = String(raw).trim().toUpperCase();
  if (s === 'E' || s === 'S' || s === 'G') return s;
  if (s.includes('ENV') || s === 'ENVIRONMENT') return 'E';
  if (s.includes('SOC') || s === 'SOCIAL') return 'S';
  if (s.includes('GOV') || s.includes('거버') || s === 'GOVERNANCE') return 'G';
  return s.length === 1 && 'ESG'.includes(s) ? s : '';
}

/** EsgCategory + categoryDescription (활동·캠페인 공통) */
export function resolveEsgCategoryDisplay(row: Record<string, unknown>): string {
  const raw = row.category ?? row.esgCategory;
  const desc = row.categoryDescription ?? row.category_description;
  const code = pickCategoryCode(raw);
  const label = code ? (ESG_CATEGORY_KO[code] ?? code) : '';
  const d = typeof desc === 'string' && desc.trim() ? desc.trim() : '';
  if (!label && !d) return '—';
  if (!label) return d;
  if (!d) return label;
  return `${label} · ${d}`;
}

/** category + categoryDescription (백엔드 EsgActivityResDto) */
export function resolveActivityCategoryDisplay(row: EsgActivity): string {
  return resolveEsgCategoryDisplay(row as Record<string, unknown>);
}

export function formatActivityDateTime(value: unknown): string {
  if (value == null || value === '') return '—';
  const s = typeof value === 'string' ? value : String(value);
  const d = dayjs(s);
  if (!d.isValid()) return s;
  return d.format('YYYY-MM-DD HH:mm');
}

/** 제출 시각 — BaseTimeEntity `createdAt` (또는 API 스네이크 케이스 `created_at`) */
export function resolveActivityCreatedAt(row: EsgActivity): unknown {
  const r = flattenActivityRow(row);
  return r.createdAt ?? r.created_at;
}

/** 승인 시각 — `approve()` 반영 `approvedAt` (또는 `approved_at`). 제출 시각과 필드 분리 */
export function resolveActivityApprovedAt(row: EsgActivity): unknown {
  const r = flattenActivityRow(row);
  return r.approvedAt ?? r.approved_at;
}

export function resolveVerificationContent(row: EsgActivity): string {
  const r = row as Record<string, unknown>;
  const v = r.verificationContent ?? r.verification_content;
  if (typeof v === 'string' && v.trim()) return v.trim();
  return '—';
}

/** 첨부 URL (없으면 null) */
export function resolveActivityFileUrl(row: EsgActivity): string | null {
  const r = row as Record<string, unknown>;
  const v = r.fileUrl ?? r.file_url;
  if (typeof v === 'string' && v.trim()) return v.trim();
  return null;
}

export function resolveEarnedPointsDisplay(row: EsgActivity): string {
  const r = row as Record<string, unknown>;
  const v = r.earnedPoints ?? r.earned_points;
  if (v == null || v === '') return '—';
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  return `${n}P`;
}

export function resolveRejectReasonDisplay(row: EsgActivity): string {
  const r = row as Record<string, unknown>;
  const v = r.rejectReason ?? r.reject_reason;
  if (typeof v === 'string' && v.trim()) return v.trim();
  return '—';
}

export function formatActivityStatusKo(status: unknown): string {
  if (status == null || status === '') return '—';
  const key = String(status).trim().toUpperCase();
  return ACTIVITY_STATUS_KO[key] ?? String(status);
}

export function resolveActivitySubjectTitle(row: EsgActivity, subjectTitleById: Map<string, string>): string {
  const r = row as Record<string, unknown>;
  const direct =
    r.title ??
    r.subjectTitle ??
    r.subject_title ??
    r.subjectName ??
    r.subject_name ??
    r.activityTitle;
  if (typeof direct === 'string' && direct.trim()) return direct.trim();

  const nested = r.subject;
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    const t = (nested as Record<string, unknown>).title ?? (nested as Record<string, unknown>).name;
    if (typeof t === 'string' && t.trim()) return t.trim();
  }

  const sid = pickSubjectIdFromActivity(row);
  if (sid && subjectTitleById.has(sid)) {
    return subjectTitleById.get(sid)!;
  }

  return '—';
}
