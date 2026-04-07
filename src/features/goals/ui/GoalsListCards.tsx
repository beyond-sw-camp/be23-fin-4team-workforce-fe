import { CalendarOutlined, EyeInvisibleOutlined, UserOutlined } from '@ant-design/icons';
import { Button, Progress, Spin, Tag, Tooltip, Typography } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import type { Goal, Visibility } from '@/features/goals/model/types';
import { computeGoalProgressPercent } from '@/features/goals/ui/goalProgressDisplay';
import { GoalsEmptyPanel } from '@/features/goals/ui/GoalsEmptyPanel';
import { AppPagination, appPaginationShowTotalLabel } from '@/shared/ui/AppPagination';

const { Text } = Typography;

function visibilityTag(v: Visibility) {
  if (v === 'PUBLIC') return <Tag color="blue">전사</Tag>;
  if (v === 'TEAM_ONLY') return <Tag color="geekblue">팀</Tag>;
  return <Tag>비공개</Tag>;
}

function statusTagUi(status?: string) {
  const s = (status ?? 'DRAFT').toUpperCase();
  if (s === 'DRAFT') return <Tag color="default">진행 전</Tag>;
  if (s === 'ACTIVE') return <Tag color="blue">진행 중</Tag>;
  if (s === 'COMPLETED') return <Tag color="success">완료</Tag>;
  if (s === 'CANCELLED') return <Tag>취소</Tag>;
  return <Tag>{status ?? '—'}</Tag>;
}

function progressVisual(goal: Goal): {
  displayPct: number | null;
  barPct: number;
  stroke: string;
  success: boolean;
} {
  const raw = computeGoalProgressPercent(goal);
  if (raw == null) {
    return { displayPct: null, barPct: 0, stroke: '#e2e8f0', success: false };
  }
  const rounded = Math.round(raw);
  const over = rounded > 100;
  const stroke = over ? '#22c55e' : rounded > 0 ? '#3b82f6' : '#e2e8f0';
  return {
    displayPct: rounded,
    barPct: Math.min(100, rounded),
    stroke,
    success: over,
  };
}

export type GoalsListCardsProps = {
  goals: Goal[];
  loading?: boolean;
  memberId: string;
  canCreate: boolean;
  emptyTitle: string;
  emptyHint: string;
  onOpenDetail: (g: Goal) => void;
  onOpenPerf: (g: Goal) => void;
  onActivate: (goalId: string) => void;
  activatingGoalId: string | null;
  pageSize?: number;
  pageSizeOptions?: number[];
};

export function GoalsListCards({
  goals,
  loading,
  memberId,
  canCreate,
  emptyTitle,
  emptyHint,
  onOpenDetail,
  onOpenPerf,
  onActivate,
  activatingGoalId,
  pageSize: defaultPageSize = 12,
  pageSizeOptions = [12, 24, 48],
}: GoalsListCardsProps) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);
  const totalPages = Math.max(1, Math.ceil(goals.length / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);

  useEffect(() => {
    setPage((p) => Math.min(Math.max(1, p), totalPages));
  }, [totalPages]);

  const slice = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return goals.slice(start, start + pageSize);
  }, [goals, safePage, pageSize]);

  if (loading) {
    return (
      <div className="tw-flex tw-min-h-[240px] tw-items-center tw-justify-center tw-rounded-xl tw-border tw-border-dashed tw-border-slate-200/90 tw-bg-[#fafbfc]">
        <Spin />
      </div>
    );
  }

  if (!goals.length) {
    return (
      <GoalsEmptyPanel title={emptyTitle} hint={emptyHint} />
    );
  }

  return (
    <div className="tw-flex tw-flex-col">
      <div className="tw-flex tw-flex-col">
        {slice.map((goal) => {
          const isOwner = goal.ownerId === memberId;
          const st = (goal.status ?? 'DRAFT').toUpperCase();
          const canActivate = canCreate && st === 'DRAFT';
          const canSubmitPerf = st === 'ACTIVE' && isOwner && canCreate;
          const activating = activatingGoalId === goal.id;
          const { displayPct, barPct, stroke } = progressVisual(goal);
          const actual = goal.actualValue ?? 0;
          const target = goal.targetValue ?? 0;
          const ownerLabel =
            goal.ownerId === memberId ? '나' : `${goal.ownerId.slice(0, 2)}**`;

          return (
            <div
              key={goal.id}
              className="tw-border-0 tw-border-b tw-border-solid tw-border-slate-200 tw-py-5 last:tw-border-b-0"
            >
              <div className="tw-flex tw-flex-col tw-gap-5 lg:tw-flex-row lg:tw-items-stretch lg:tw-justify-between lg:tw-gap-8">
              <div className="tw-min-w-0 tw-flex-1">
                <div className="tw-flex tw-flex-wrap tw-items-center tw-gap-1.5">
                  {statusTagUi(goal.status)}
                  {visibilityTag(goal.visibility)}
                  {goal.visibility === 'PRIVATE' ? (
                    <Tooltip title="비공개 목표">
                      <EyeInvisibleOutlined className="tw-text-slate-400" />
                    </Tooltip>
                  ) : null}
                </div>
                <div className="tw-mt-2.5 tw-text-lg tw-font-bold tw-leading-snug tw-text-[#1e3a5f]">{goal.title}</div>
                {goal.description ? (
                  <Text type="secondary" className="tw-mt-1.5 tw-block tw-text-sm tw-leading-relaxed">
                    {goal.description}
                  </Text>
                ) : null}
                <div className="tw-mt-4 tw-flex tw-flex-wrap tw-items-center tw-gap-x-5 tw-gap-y-2 tw-text-xs tw-text-slate-500">
                  <span className="tw-inline-flex tw-items-center tw-gap-1.5">
                    <CalendarOutlined />
                    {goal.startDate} ~ {goal.endDate}
                  </span>
                  <span className="tw-inline-flex tw-items-center tw-gap-1.5">
                    <UserOutlined />
                    {ownerLabel}
                  </span>
                </div>
              </div>

              <div className="tw-flex tw-w-full tw-shrink-0 tw-flex-col tw-justify-center lg:tw-w-[220px]">
                <div className="tw-text-right tw-text-3xl tw-font-bold tw-tabular-nums tw-leading-none tw-text-[#1e3a5f]">
                  {displayPct != null ? `${displayPct}%` : '—'}
                </div>
                <div className="tw-mt-3">
                  <Progress
                    percent={barPct}
                    showInfo={false}
                    strokeColor={stroke}
                    trailColor="rgba(15,23,42,0.06)"
                    className="!tw-m-0"
                  />
                </div>
                <Text type="secondary" className="tw-mt-2 tw-block tw-text-center tw-text-xs lg:tw-text-right">
                  실적 {actual} / 목표 {target}
                  {goal.unitType ? ` · ${goal.unitType}` : ''}
                </Text>
                <div className="tw-mt-4 tw-flex tw-flex-wrap tw-justify-end tw-gap-2">
                  <Button type="text" size="small" onClick={() => onOpenDetail(goal)} className="!tw-text-slate-600">
                    상세
                  </Button>
                  {canActivate ? (
                    <Button
                      type="primary"
                      size="small"
                      loading={activating}
                      onClick={() => onActivate(goal.id)}
                      className="!tw-rounded-lg !tw-bg-[#1e3a5f] hover:!tw-bg-[#152a45]"
                    >
                      진행 시작
                    </Button>
                  ) : null}
                  {canSubmitPerf ? (
                    <Button size="small" onClick={() => onOpenPerf(goal)} className="!tw-rounded-lg">
                      실적 입력
                    </Button>
                  ) : null}
                </div>
              </div>
              </div>
            </div>
          );
        })}
      </div>

      <AppPagination
        wrapClassName="tw-mt-1"
        current={safePage}
        pageSize={pageSize}
        total={goals.length}
        showSizeChanger
        pageSizeOptions={pageSizeOptions.map(String)}
        onChange={(p, ps) => {
          setPage(p);
          setPageSize(ps);
        }}
        showTotal={appPaginationShowTotalLabel}
      />
    </div>
  );
}
