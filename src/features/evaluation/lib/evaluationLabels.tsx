import {Tag} from 'antd';
import {LockOutlined, UnlockOutlined} from '@ant-design/icons';
import type {ReactElement} from 'react';
import {EVALUATION_PAGE_KO as L} from '@/app/locale/app-ko';
import type {
    SeasonType,
    SeasonStatus,
    EvalType,
    EvaluationStatus,
} from '@/features/evaluation/model/types';

export function seasonTypeLabel(t: SeasonType): string {
    return (
        {
            ANNUAL: L.seasonTypeAnnual,
            HALF_YEAR: L.seasonTypeHalfYear,
            QUARTER: L.seasonTypeQuarter,
        } as Record<SeasonType, string>
    )[t] ?? t;
}

/** 시즌 유형 배지 — 중립 톤 pill */
export function seasonTypeBadge(t: SeasonType): ReactElement {
    return (
        <span className="tw-inline-flex tw-items-center tw-rounded-full tw-bg-slate-100 tw-px-2.5 tw-py-0.5 tw-text-xs tw-font-medium tw-text-slate-700">
            {seasonTypeLabel(t)}
        </span>
    );
}

/** 시즌 진행 상태 — 좌측 컬러 닷 + 레이블 */
export function seasonStatusTag(s: SeasonStatus): ReactElement {
    if (s === 'DRAFT') {
        return (
            <span className="tw-inline-flex tw-items-center tw-gap-1.5 tw-text-sm tw-text-slate-600">
                <span className="tw-size-2 tw-rounded-full tw-bg-amber-500" aria-hidden />
                초안
            </span>
        );
    }
    if (s === 'ACTIVE') {
        return (
            <span className="tw-inline-flex tw-items-center tw-gap-1.5 tw-text-sm tw-text-slate-800">
                <span className="tw-size-2 tw-rounded-full tw-bg-[#6366F1]" aria-hidden />
                운영 중
            </span>
        );
    }
    return (
        <span className="tw-inline-flex tw-items-center tw-gap-1.5 tw-text-sm tw-text-slate-500">
            <span className="tw-size-2 tw-rounded-full tw-bg-slate-400" aria-hidden />
            종료됨
        </span>
    );
}

export function evalTypeLabel(t: EvalType): string {
    return (
        {
            SELF: L.evalTypeSelf,
            DOWNWARD: L.evalTypeDownward,
            UPWARD: L.evalTypeUpward,
            PEER: L.evalTypePeer,
        } as Record<EvalType, string>
    )[t] ?? t;
}

export function responseStatusTag(s: EvaluationStatus): ReactElement {
    if (s === 'NOT_STARTED') return <Tag color="default">{L.statusNotStarted}</Tag>;
    if (s === 'IN_PROGRESS') return <Tag color="gold">{L.statusInProgress}</Tag>;
    return <Tag color="green">{L.statusSubmitted}</Tag>;
}

/** 결과 공개 여부 태그. 잠금 아이콘 + 라벨. */
export function resultsPublishedTag(publishedAt?: string): ReactElement {
    if (publishedAt) {
        return (
            <span className="tw-inline-flex tw-items-center tw-gap-1 tw-rounded-full tw-bg-emerald-50 tw-px-2.5 tw-py-0.5 tw-text-xs tw-font-medium tw-text-emerald-700">
                <UnlockOutlined/>
                전체 공개
            </span>
        );
    }
    return (
        <span className="tw-inline-flex tw-items-center tw-gap-1 tw-rounded-full tw-bg-rose-50 tw-px-2.5 tw-py-0.5 tw-text-xs tw-font-medium tw-text-rose-600">
            <LockOutlined/>
            비공개
        </span>
    );
}
