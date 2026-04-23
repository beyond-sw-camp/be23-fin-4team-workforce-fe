import {
  CaretDownOutlined,
  CaretRightOutlined,
  EyeInvisibleOutlined,
  InfoCircleOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { Button, Progress, Spin, Tag, Tooltip, Typography } from 'antd';
import dayjs from 'dayjs';
import { useEffect, useMemo, useState } from 'react';
import type { Goal, GoalApprovalPolicy, KpiTemplate, Visibility } from '@/features/goals/model/types';
import { GoalWorkflowSteps } from '@/features/goals/ui/GoalWorkflowSteps';
import {
  filterRowsByCollapsedParents,
  goalTreeOrderedWithDepth,
  parentIdsWithChildrenInList,
} from '@/features/goals/lib/goalHierarchy';
import { goalValueUnitSuffix } from '@/features/goals/lib/goalUnitDisplay';
import { buildGoalDisplayProgressMap } from '@/features/goals/ui/goalProgressRollup';
import { GoalsEmptyPanel } from '@/features/goals/ui/GoalsEmptyPanel';
import { PERFORMANCE_PAGE_KO } from '@/app/locale/app-ko';
import { AppPagination, appPaginationShowTotalLabel } from '@/shared/ui/AppPagination';

const { Text } = Typography;

/** 시작·종료일로부터 사이클 뱃지 텍스트와 색상을 결정 */
function goalCycleBadge(startDate: string, endDate: string): { label: string; color: string } {
  const s = dayjs(startDate);
  const e = dayjs(endDate);
  if (!s.isValid() || !e.isValid()) return { label: '기간형', color: 'default' };
  const sameYear = s.year() === e.year();
  const year = s.year();
  const diffDays = e.diff(s, 'day');

  if (sameYear && s.month() === 0 && s.date() === 1 && e.month() === 11 && e.date() === 31) {
    return { label: `${year} 연간`, color: 'purple' };
  }
  if (diffDays >= 170 && diffDays <= 190) {
    const half = s.month() < 6 ? '상반기' : '하반기';
    return { label: `${year} ${half}`, color: 'cyan' };
  }
  if (diffDays >= 80 && diffDays <= 100) {
    const q = Math.floor(s.month() / 3) + 1;
    return { label: `${year} ${q}분기`, color: 'blue' };
  }
  if (diffDays >= 25 && diffDays <= 35) {
    return { label: `${year}.${String(s.month() + 1).padStart(2, '0')} 월간`, color: 'geekblue' };
  }
  return { label: sameYear ? `${year} 기간형` : '기간형', color: 'default' };
}

/** 상태 태그 — PerformancePage 기준 색상 통일 */
function statusTagUi(status: string | undefined, approvalStatus?: string) {
  const s = (status ?? 'DRAFT').toUpperCase();
  const a = String(approvalStatus ?? '').toUpperCase();
  if (s === 'ACTIVE' && a === 'PENDING') {
    return <Tag color="processing" className="!tw-m-0 !tw-text-[11px]">완료 제출</Tag>;
  }
  if (s === 'ACTIVE' && a === 'REJECTED') {
    return <Tag color="warning" className="!tw-m-0 !tw-text-[11px]">보완 필요</Tag>;
  }
  const map: Record<string, { text: string; color: string }> = {
    DRAFT: { text: '초안', color: 'gold' },
    ACTIVE: { text: '진행 중', color: 'green' },
    COMPLETED: { text: '완료', color: 'blue' },
    CANCELLED: { text: '취소됨', color: 'default' },
  };
  const v = map[s] ?? { text: s, color: 'default' };
  return <Tag color={v.color} className="!tw-m-0 !tw-text-[11px]">{v.text}</Tag>;
}

function progressVisual(displayRaw: number | null): {
  displayPct: number | null;
  barPct: number;
  stroke: string;
  success: boolean;
} {
  if (displayRaw == null) {
    return { displayPct: null, barPct: 0, stroke: '#e2e8f0', success: false };
  }
  const rounded = Math.round(displayRaw);
  const over = rounded > 100;
  const stroke = over ? '#22c55e' : rounded >= 70 ? '#22c55e' : rounded >= 40 ? '#f59e0b' : rounded > 0 ? '#ef4444' : '#e2e8f0';
  return {
    displayPct: rounded,
    barPct: Math.min(100, rounded),
    stroke,
    success: over,
  };
}

/** 목표→KpiTemplate에서 승인 정책 조회 */
function resolvePolicy(goal: Goal, templates: KpiTemplate[]): GoalApprovalPolicy {
  if (!goal.kpiTemplateId) return 'NONE';
  const tpl = templates.find((t) => t.id === goal.kpiTemplateId);
  if (!tpl) return 'NONE';
  if (tpl.goalApprovalPolicy) return tpl.goalApprovalPolicy;
  return tpl.requireApproval ? 'BOTH' : 'NONE';
}

function policyRequiresActivation(p: GoalApprovalPolicy): boolean {
  return p === 'ACTIVATION_ONLY' || p === 'BOTH';
}

export type GoalsListCardsProps = {
  goals: Goal[];
  loading?: boolean;
  memberId: string;
  /** 담당 주체 표시 — 조직명·사원명. 미전달 시 레거시 마스킹 */
  formatOwnerLabel?: (goal: Goal) => string;
  canCreate: boolean;
  emptyTitle: string;
  emptyHint: string;
  onOpenDetail: (g: Goal) => void;
  onActivate: (goalId: string) => void;
  activatingGoalId: string | null;
  pageSize?: number;
  pageSizeOptions?: number[];
  /** KPI 템플릿 목록 — 카드에 승인 정책 스텝 표시 */
  templates?: KpiTemplate[];
};

export function GoalsListCards({
  goals,
  loading,
  memberId,
  formatOwnerLabel,
  canCreate,
  emptyTitle,
  emptyHint,
  onOpenDetail,
  onActivate,
  activatingGoalId,
  pageSize: defaultPageSize = 12,
  pageSizeOptions = [12, 24, 48],
  templates = [],
}: GoalsListCardsProps) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);
  const [collapsedParentIds, setCollapsedParentIds] = useState(() => new Set<string>());

  const parentsWithChildren = useMemo(() => parentIdsWithChildrenInList(goals), [goals]);
  const progressMap = useMemo(() => buildGoalDisplayProgressMap(goals), [goals]);
  const orderedRows = useMemo(() => goalTreeOrderedWithDepth(goals), [goals]);
  const visibleRows = useMemo(
    () => filterRowsByCollapsedParents(orderedRows, collapsedParentIds),
    [orderedRows, collapsedParentIds],
  );

  const totalPages = Math.max(1, Math.ceil(visibleRows.length / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);

  useEffect(() => {
    setPage((p) => Math.min(Math.max(1, p), totalPages));
  }, [totalPages]);

  const slice = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return visibleRows.slice(start, start + pageSize);
  }, [visibleRows, safePage, pageSize]);

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
      <div className="tw-grid tw-grid-cols-[minmax(0,1.4fr)_minmax(0,0.7fr)_minmax(0,0.7fr)_minmax(0,0.7fr)_minmax(0,0.8fr)] tw-gap-3 tw-rounded-lg tw-bg-slate-50 tw-px-6 tw-py-2.5 tw-text-[11px] tw-font-semibold tw-uppercase tw-tracking-wide tw-text-slate-500">
        <div>제목</div>
        <div>담당 주체</div>
        <div>사이클</div>
        <div>종료일</div>
        <div className="tw-text-right">진행 상태</div>
      </div>
      <div className="tw-flex tw-flex-col tw-divide-y tw-divide-slate-200">
        {slice.map(({ goal, depth }) => {
          const hasChildren = parentsWithChildren.has(goal.id);
          const isCollapsed = collapsedParentIds.has(goal.id);
          const st = (goal.status ?? 'DRAFT').toUpperCase();
          const canActivate = canCreate && st === 'DRAFT';
          const activating = activatingGoalId === goal.id;
          const progressInfo = progressMap.get(goal.id);
          const { displayPct, barPct, stroke } = progressVisual(progressInfo?.pct ?? null);
          const actual = goal.actualValue ?? 0;
          const target = goal.targetValue ?? 0;
          const ownerLabel = formatOwnerLabel
            ? formatOwnerLabel(goal)
            : (() => {
                const oid = goal.ownerId?.trim() ?? '';
                return !oid ? '—' : oid === memberId ? '나' : `${oid.slice(0, 2)}**`;
              })();
          const cycleBadge = goalCycleBadge(goal.startDate, goal.endDate);
          const indentPx = depth > 0 ? Math.min(depth - 1, 5) * 18 : 0;

          return (
            <div
              key={goal.id}
              className="tw-grid tw-grid-cols-[minmax(0,1.4fr)_minmax(0,0.7fr)_minmax(0,0.7fr)_minmax(0,0.7fr)_minmax(0,0.8fr)] tw-gap-3 tw-items-center tw-px-6 tw-py-3.5 hover:tw-bg-slate-50/60 tw-transition-colors"
            >
              {/* 제목 */}
              <div className="tw-min-w-0" style={indentPx > 0 ? { paddingLeft: indentPx } : undefined}>
                <div className="tw-flex tw-items-center tw-gap-1.5">
                  {hasChildren ? (
                    <button
                      type="button"
                      className="tw-m-0 tw-flex tw-h-5 tw-w-5 tw-shrink-0 tw-items-center tw-justify-center tw-rounded tw-border-0 tw-bg-transparent tw-text-slate-500 tw-outline-none hover:tw-bg-slate-100 hover:tw-text-slate-800 focus-visible:tw-ring-2 focus-visible:tw-ring-[#3b82f6]/40"
                      aria-expanded={!isCollapsed}
                      aria-label={isCollapsed ? '하위 목표 펼치기' : '하위 목표 접기'}
                      onClick={() => {
                        setCollapsedParentIds((prev) => {
                          const next = new Set(prev);
                          if (next.has(goal.id)) next.delete(goal.id);
                          else next.add(goal.id);
                          return next;
                        });
                      }}
                    >
                      {isCollapsed ? <CaretRightOutlined className="tw-text-[10px]" /> : <CaretDownOutlined className="tw-text-[10px]" />}
                    </button>
                  ) : (
                    <span className="tw-inline-block tw-w-5 tw-shrink-0" />
                  )}
                  {depth > 0 ? (
                    <Tooltip title={`상위 목표의 ${depth}단계 하위`}>
                      <span className="tw-mr-0.5 tw-inline-flex tw-h-5 tw-min-w-[1.1rem] tw-items-center tw-justify-center tw-rounded tw-bg-slate-200/90 tw-px-1 tw-text-[10px] tw-font-bold tw-tabular-nums tw-text-slate-600">
                        {depth}
                      </span>
                    </Tooltip>
                  ) : null}
                  {templates.length > 0 ? (
                    <GoalWorkflowSteps
                      goalStatus={(goal.status ?? 'DRAFT').toUpperCase()}
                      approvalFlowStatus={(goal.approvalStatus ?? 'NOT_REQUESTED').toUpperCase()}
                      approvalPolicy={resolvePolicy(goal, templates)}
                      compact
                    />
                  ) : (
                    statusTagUi(goal.status, goal.approvalStatus)
                  )}
                  {goal.visibility === 'PRIVATE' ? (
                    <Tooltip title="비공개 목표">
                      <EyeInvisibleOutlined className="tw-text-slate-400 tw-text-xs" />
                    </Tooltip>
                  ) : null}
                  <button
                    type="button"
                    className="tw-m-0 tw-truncate tw-border-0 tw-bg-transparent tw-p-0 tw-text-left tw-text-sm tw-font-semibold tw-text-[#1e3a5f] tw-outline-none hover:tw-underline tw-cursor-pointer"
                    onClick={() => onOpenDetail(goal)}
                    title={goal.title}
                  >
                    {goal.title}
                  </button>
                </div>
                {/* 액션 버튼 — 필요한 경우에만 표시 */}
                {canActivate ? (
                  <div className="tw-mt-1.5 tw-flex tw-gap-1.5" style={indentPx > 0 ? { paddingLeft: indentPx + 20 + 6 } : { paddingLeft: 26 }}>
                    {(() => {
                      const policy = resolvePolicy(goal, templates);
                      const needsApproval = policyRequiresActivation(policy);
                      return (
                        <Button type="primary" size="small" loading={activating} onClick={() => onActivate(goal.id)} className="!tw-rounded !tw-text-[11px] !tw-h-6 !tw-px-2 !tw-bg-[#1e3a5f] hover:!tw-bg-[#152a45]">
                          {needsApproval ? '승인 요청' : '진행 시작'}
                        </Button>
                      );
                    })()}
                  </div>
                ) : null}
              </div>

              {/* 담당 주체 */}
              <div className="tw-text-sm tw-text-slate-600 tw-truncate" title={ownerLabel}>
                {ownerLabel}
              </div>

              {/* 사이클 */}
              <div>
                <Tag color={cycleBadge.color} className="!tw-m-0 !tw-text-[11px]">
                  {cycleBadge.label}
                </Tag>
              </div>

              {/* 종료일 */}
              <div className="tw-text-sm tw-text-slate-500 tw-tabular-nums">
                {goal.endDate}
              </div>

              {/* 진행 상태 */}
              <div className="tw-flex tw-flex-col tw-items-end tw-gap-1">
                <div className="tw-flex tw-items-center tw-gap-1.5">
                  <span className="tw-text-base tw-font-bold tw-tabular-nums tw-text-[#1e3a5f]">
                    {displayPct != null ? `${displayPct}%` : '—'}
                  </span>
                  {goal.autoUpdate !== false && st === 'ACTIVE' ? (
                    <Tooltip title={PERFORMANCE_PAGE_KO.autoUpdateTooltip}>
                      <ThunderboltOutlined className="tw-text-xs tw-text-amber-500" />
                    </Tooltip>
                  ) : null}
                  {progressInfo?.rolledFromChildren ? (
                    <Tooltip title="하위 목표 평균 달성률로 자동 집계됩니다.">
                      <InfoCircleOutlined className="tw-text-xs tw-text-slate-400" />
                    </Tooltip>
                  ) : null}
                </div>
                <Progress
                  percent={barPct}
                  showInfo={false}
                  strokeColor={stroke}
                  trailColor="rgba(15,23,42,0.06)"
                  size="small"
                  className="!tw-m-0 tw-w-full tw-max-w-[120px]"
                />
                <Text type="secondary" className="tw-text-[10px]">
                  {actual} / {target}{goalValueUnitSuffix(goal)}
                </Text>
              </div>
            </div>
          );
        })}
      </div>

      <AppPagination
        wrapClassName="tw-mt-1"
        current={safePage}
        pageSize={pageSize}
        total={visibleRows.length}
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
