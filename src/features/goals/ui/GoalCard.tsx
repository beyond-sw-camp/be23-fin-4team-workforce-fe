import { Card, Tag } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useMemberDisplayNames } from '@/features/members/hooks/useMemberDisplayNames';
import { goalApi } from '../api/goalApi';
import type { Goal, GoalStatus } from '../model/types';

const STATUS_COLOR: Record<GoalStatus, string> = {
  DRAFT: 'default',
  PENDING: 'gold',
  ACTIVE: 'green',
  COMPLETED: 'blue',
  CANCELLED: 'red',
  SKIPPED: 'orange',
};

const STATUS_LABEL: Record<GoalStatus, string> = {
  DRAFT: '작성 중',
  PENDING: '승인 대기',
  ACTIVE: '진행 중',
  COMPLETED: '평가 대상',
  CANCELLED: '취소',
  SKIPPED: '제외',
};

const VISIBILITY_LABEL = {
  COMPANY: '전사',
  TEAM: '팀',
  PRIVATE: '비공개',
} as const;

type Props = {
  goal: Goal;
  onClick?: (goal: Goal) => void;
  showOwnerName?: boolean;
  compact?: boolean;
};

export function GoalCard({ goal, onClick, showOwnerName = false, compact = false }: Props) {
  const isObjective = goal.ownerType === 'ORGANIZATION';
  const memberIds = showOwnerName && goal.ownerType === 'MEMBER' ? [goal.ownerId] : [];
  const { labelFor } = useMemberDisplayNames(memberIds);

  const { data: aggregate } = useQuery({
    queryKey: ['goal-aggregate', goal.goalId],
    queryFn: () => goalApi.getAggregate(goal.goalId),
    enabled: isObjective,
  });

  const { data: availableObjectives = [] } = useQuery({
    queryKey: ['goal-available-objectives', goal.cycle],
    queryFn: () => goalApi.listAvailableObjectives({ cycle: goal.cycle }),
    enabled: !isObjective && !!goal.alignedOrgGoalId,
    staleTime: 60_000,
  });

  const alignedObjective = useMemo(() => {
    if (!goal.alignedOrgGoalId || isObjective) return null;
    return (
      availableObjectives.find((item) => item.goalId === goal.alignedOrgGoalId) ?? {
        goalId: goal.alignedOrgGoalId,
        title: goal.objectiveTitle ?? '연결된 Objective',
        gradeS: goal.objectiveGradeS,
        gradeA: goal.objectiveGradeA,
        gradeB: goal.objectiveGradeB,
        gradeC: goal.objectiveGradeC,
      }
    );
  }, [availableObjectives, goal.alignedOrgGoalId, goal.objectiveGradeA, goal.objectiveGradeB, goal.objectiveGradeC, goal.objectiveGradeS, goal.objectiveTitle, isObjective]);

  return (
    <Card
      hoverable={!!onClick}
      onClick={() => onClick?.(goal)}
      className={
        'tw-rounded-2xl tw-border tw-border-slate-200/90 tw-shadow-sm tw-shadow-slate-900/5 tw-transition-shadow ' +
        (onClick ? 'hover:tw-shadow-md hover:tw-shadow-slate-900/10' : '')
      }
      styles={{ body: { padding: 16 } }}
    >
      <div className="tw-flex tw-items-start tw-justify-between tw-gap-4">
        <div className="tw-min-w-0 tw-flex-1">
          <div className="tw-mb-2 tw-flex tw-flex-wrap tw-items-center tw-gap-1.5">
            <Tag
              bordered={false}
              className={
                '!tw-m-0 !tw-rounded-full !tw-px-2.5 !tw-py-0.5 !tw-text-[11px] !tw-font-bold ' +
                (isObjective ? '!tw-bg-[#1e3a5f] !tw-text-white' : '!tw-bg-emerald-50 !tw-text-emerald-700')
              }
            >
              {isObjective ? 'OBJECTIVE' : 'KR'}
            </Tag>
            <Tag
              color={STATUS_COLOR[goal.status] as any}
              className="!tw-m-0 !tw-rounded-full !tw-px-2.5 !tw-py-0.5 !tw-text-[11px] !tw-font-semibold"
            >
              {STATUS_LABEL[goal.status]}
            </Tag>
            <Tag
              bordered={false}
              className="!tw-m-0 !tw-rounded-full !tw-bg-slate-100 !tw-px-2.5 !tw-py-0.5 !tw-text-[11px] !tw-font-medium !tw-text-slate-700"
            >
              {goal.cycleKey}
            </Tag>
            <Tag
              bordered={false}
              className="!tw-m-0 !tw-rounded-full !tw-bg-cyan-50 !tw-px-2.5 !tw-py-0.5 !tw-text-[11px] !tw-font-medium !tw-text-cyan-700"
            >
              {VISIBILITY_LABEL[goal.visibility]}
            </Tag>
            {showOwnerName && goal.ownerType === 'MEMBER' && (
              <Tag
                bordered={false}
                className="!tw-m-0 !tw-rounded-full !tw-bg-purple-50 !tw-px-2.5 !tw-py-0.5 !tw-text-[11px] !tw-font-medium !tw-text-purple-700"
              >
                {labelFor(goal.ownerId)}
              </Tag>
            )}
          </div>

          <div className="tw-mb-1 tw-truncate tw-text-[15px] tw-font-semibold tw-text-slate-900">{goal.title}</div>
          <div className={compact ? 'tw-line-clamp-1 tw-text-sm tw-text-slate-500' : 'tw-line-clamp-2 tw-text-sm tw-text-slate-500'}>
            {goal.description}
          </div>

          {!compact && isObjective ? (
            <div className="tw-mt-3 tw-grid tw-grid-cols-4 tw-gap-2">
              {(['S', 'A', 'B', 'C'] as const).map((grade) => {
                const text = grade === 'S' ? goal.gradeS : grade === 'A' ? goal.gradeA : grade === 'B' ? goal.gradeB : goal.gradeC;
                return (
                  <div key={grade} className="tw-rounded-xl tw-border tw-border-slate-200 tw-bg-slate-50 tw-p-2">
                    <div className="tw-text-[10px] tw-font-bold tw-text-slate-500">{grade}</div>
                    <div className="tw-mt-1 tw-line-clamp-2 tw-text-[11px] tw-text-slate-600">{text || '-'}</div>
                  </div>
                );
              })}
            </div>
          ) : !compact ? (
            <div className="tw-mt-3 tw-space-y-2">
              <div className="tw-flex tw-items-center tw-gap-1.5 tw-text-[11px] tw-text-slate-500">
                <span className="tw-font-semibold tw-text-slate-400">상위 Objective</span>
                <span className="tw-truncate tw-text-slate-700">{alignedObjective?.title ?? goal.objectiveTitle ?? '연결 필요'}</span>
              </div>
              <div className="tw-rounded-lg tw-border tw-border-blue-100 tw-bg-blue-50/60 tw-px-3 tw-py-2 tw-text-[11px] tw-text-slate-600">
                이 KR은 상위 Objective의 S/A/B/C 기준을 상속합니다.
              </div>
            </div>
          ) : null}
        </div>

        <div className="tw-shrink-0 tw-pl-2 tw-text-right">
          {isObjective ? (
            <>
              <div className={compact ? 'tw-text-[16px] tw-font-bold tw-leading-none tw-text-[#1e3a5f]' : 'tw-text-[20px] tw-font-bold tw-leading-none tw-text-[#1e3a5f]'}>
                {aggregate?.weightedAvgScore != null ? aggregate.weightedAvgScore.toFixed(1) : '-'}
                <span className="tw-text-xs tw-font-semibold tw-text-slate-400"> 점</span>
              </div>
              <div className="tw-mt-1 tw-text-[10px] tw-text-slate-400">
                {aggregate?.weightedAvgScore != null ? '확정 평가 가중평균' : '평가 확정 전'}
              </div>
              {!compact && aggregate?.simpleAvgScore != null && (
                <div className="tw-text-[10px] tw-text-slate-400">단순평균 {aggregate.simpleAvgScore.toFixed(1)}점</div>
              )}
              {!compact && aggregate && (
                <div className="tw-mt-0.5 tw-text-[10px] tw-text-slate-400">
                  확정 KR {aggregate.confirmedCount} / 전체 {aggregate.childCount}
                </div>
              )}
            </>
          ) : (
            <>
              <div className={compact ? 'tw-text-[22px] tw-font-bold tw-leading-none tw-text-[#1e3a5f]' : 'tw-text-[28px] tw-font-bold tw-leading-none tw-text-[#1e3a5f]'}>
                {goal.weightPct}
                <span className="tw-text-base tw-font-semibold tw-text-slate-400">%</span>
              </div>
              {!compact && <div className="tw-mt-1 tw-text-[11px] tw-text-slate-400">Objective 기준 상속</div>}
              {!compact && goal.status === 'ACTIVE' && (
                <div className="tw-mt-1 tw-text-[11px] tw-text-amber-600">승인 후 수정 대신 취소 후 재작성</div>
              )}
            </>
          )}
        </div>
      </div>
    </Card>
  );
}
