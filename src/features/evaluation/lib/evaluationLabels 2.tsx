import { Tag } from 'antd';
import { LockOutlined, UnlockOutlined } from '@ant-design/icons';
import type { ReactElement } from 'react';
import type { EvalType, EvaluationStatus, SeasonStatus, SeasonType } from '@/features/evaluation/model/types';

export function seasonTypeLabel(t: SeasonType): string {
  return (
    {
      ANNUAL: '연간',
      HALF_YEAR: '반기',
      QUARTER: '분기',
    } as Record<SeasonType, string>
  )[t] ?? t;
}

export function seasonTypeBadge(t: SeasonType): ReactElement {
  return (
    <span className="tw-inline-flex tw-items-center tw-rounded-full tw-bg-slate-100 tw-px-2.5 tw-py-0.5 tw-text-xs tw-font-medium tw-text-slate-700">
      {seasonTypeLabel(t)}
    </span>
  );
}

export function seasonStatusLabel(s: SeasonStatus): string {
  return (
    {
      DRAFT: '준비 중',
      SELF_EVAL: '자기평가',
      MANAGER_EVAL: '상사평가',
      GRADE_CONFIRM: '등급 확정',
      RESULT_PUBLISHED: '결과 공개',
      INTERVIEW: '면담',
      CLOSED: '종료',
    } as Record<SeasonStatus, string>
  )[s] ?? s;
}

export function seasonStatusTag(s: SeasonStatus): ReactElement {
  const meta: Record<SeasonStatus, { dot: string; text: string }> = {
    DRAFT: { dot: 'tw-bg-slate-400', text: 'tw-text-slate-600' },
    SELF_EVAL: { dot: 'tw-bg-sky-500', text: 'tw-text-slate-800' },
    MANAGER_EVAL: { dot: 'tw-bg-amber-500', text: 'tw-text-slate-800' },
    GRADE_CONFIRM: { dot: 'tw-bg-fuchsia-500', text: 'tw-text-slate-800' },
    RESULT_PUBLISHED: { dot: 'tw-bg-emerald-500', text: 'tw-text-slate-800' },
    INTERVIEW: { dot: 'tw-bg-indigo-500', text: 'tw-text-slate-800' },
    CLOSED: { dot: 'tw-bg-slate-400', text: 'tw-text-slate-500' },
  };
  const m = meta[s] ?? meta.DRAFT;
  return (
    <span className={`tw-inline-flex tw-items-center tw-gap-1.5 tw-text-sm ${m.text}`}>
      <span className={`tw-size-2 tw-rounded-full ${m.dot}`} aria-hidden />
      {seasonStatusLabel(s)}
    </span>
  );
}

export function evalTypeLabel(t: EvalType): string {
  return (
    {
      SELF: '자기평가',
      DOWNWARD: '상사평가',
      UPWARD: '상사평가',
      PEER: '상사평가',
    } as Record<EvalType, string>
  )[t] ?? t;
}

export function responseStatusTag(s: EvaluationStatus): ReactElement {
  if (s === 'NOT_STARTED') return <Tag color="default">미작성</Tag>;
  if (s === 'IN_PROGRESS') return <Tag color="gold">작성 중</Tag>;
  return <Tag color="green">제출 완료</Tag>;
}

export function resultsPublishedTag(publishedAt?: string): ReactElement {
  if (publishedAt) {
    return (
      <span className="tw-inline-flex tw-items-center tw-gap-1 tw-rounded-full tw-bg-emerald-50 tw-px-2.5 tw-py-0.5 tw-text-xs tw-font-medium tw-text-emerald-700">
        <UnlockOutlined />
        결과 공개
      </span>
    );
  }
  return (
    <span className="tw-inline-flex tw-items-center tw-gap-1 tw-rounded-full tw-bg-rose-50 tw-px-2.5 tw-py-0.5 tw-text-xs tw-font-medium tw-text-rose-600">
      <LockOutlined />
      결과 비공개
    </span>
  );
}
