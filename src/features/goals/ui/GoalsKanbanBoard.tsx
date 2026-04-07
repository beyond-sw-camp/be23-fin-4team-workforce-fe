import { CalendarOutlined, EyeInvisibleOutlined, HolderOutlined, UserOutlined } from '@ant-design/icons';
import {
  DndContext,
  type DragEndEvent,
  type DragStartEvent,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button, Progress, Tag, Tooltip, Typography, message } from 'antd';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Goal, Visibility } from '@/features/goals/model/types';
import {
  type KanbanColumnKey,
  loadKanbanOrder,
  mergeColumnIds,
  saveKanbanOrder,
} from '@/features/goals/lib/goalKanbanStorage';
import type { GoalListSortKey } from '@/features/goals/lib/sortGoals';
import { computeGoalProgressPercent } from '@/features/goals/ui/goalProgressDisplay';
import { GoalsEmptyPanel } from '@/features/goals/ui/GoalsEmptyPanel';

const { Text } = Typography;

const COLS: KanbanColumnKey[] = ['DRAFT', 'ACTIVE', 'COMPLETED', 'CANCELLED'];

const COL_META: Record<KanbanColumnKey, { title: string; dotClass: string; headClass: string }> = {
  DRAFT: {
    title: '진행 전',
    dotClass: 'tw-bg-slate-400',
    headClass: 'tw-border-b tw-border-slate-100 tw-bg-white',
  },
  ACTIVE: {
    title: '진행 중',
    dotClass: 'tw-bg-blue-500',
    headClass: 'tw-border-b tw-border-slate-100 tw-bg-white',
  },
  COMPLETED: {
    title: '완료됨',
    dotClass: 'tw-bg-emerald-500',
    headClass: 'tw-border-b tw-border-slate-100 tw-bg-white',
  },
  CANCELLED: {
    title: '취소',
    dotClass: 'tw-bg-slate-300',
    headClass: 'tw-border-b tw-border-slate-100 tw-bg-white',
  },
};

function toColumnKey(status?: string): KanbanColumnKey {
  const s = (status ?? 'DRAFT').toUpperCase();
  if (s === 'DRAFT') return 'DRAFT';
  if (s === 'ACTIVE') return 'ACTIVE';
  if (s === 'COMPLETED') return 'COMPLETED';
  if (s === 'CANCELLED') return 'CANCELLED';
  /** 레거시 `ARCHIVED` 등은 취소 칸에 모아 표시 */
  if (s === 'ARCHIVED') return 'CANCELLED';
  return 'DRAFT';
}

function goalsSignature(goals: Goal[]): string {
  return goals.map((g) => `${g.id}\0${String(g.status ?? '')}`).join('\n');
}

function visibilityTagBoard(v: Visibility) {
  if (v === 'PUBLIC') return <Tag color="blue">전사</Tag>;
  if (v === 'TEAM_ONLY') return <Tag color="geekblue">팀</Tag>;
  return <Tag>비공개</Tag>;
}

export type GoalsKanbanBoardProps = {
  goals: Goal[];
  loading?: boolean;
  companyId?: string;
  memberId: string;
  canActivate: boolean;
  onOpenDetail: (g: Goal) => void;
  onOpenPerf: (g: Goal) => void;
  activateGoal: (goalId: string) => Promise<unknown>;
  activatingGoalId: string | null;
  emptyTitle: string;
  emptyHint: string;
  /** 리스트와 동일한 정렬 키 — 변경 시 컬럼 내 순서를 재적용하고 로컬 순서를 갱신합니다. */
  goalListSort: GoalListSortKey;
};

function KanbanColumnShell({
  col,
  count,
  children,
}: {
  col: KanbanColumnKey;
  count: number;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `col-${col}` });
  const meta = COL_META[col];
  return (
    <div
      ref={setNodeRef}
      className={`tw-flex tw-min-h-[min(440px,74vh)] tw-w-[min(100%,288px)] tw-snap-start tw-flex-col tw-rounded-xl tw-border tw-border-slate-200/85 tw-bg-[#f1f5f9]/75 tw-shadow-[0_1px_2px_rgba(15,23,42,0.05)] sm:tw-w-80 ${
        isOver ? 'tw-ring-2 tw-ring-blue-400/30' : ''
      }`}
    >
      <div className={`tw-flex tw-shrink-0 tw-items-center tw-justify-between tw-gap-2 tw-px-3 tw-py-3 ${meta.headClass}`}>
        <div className="tw-flex tw-min-w-0 tw-flex-1 tw-items-center tw-gap-2">
          <span className={`tw-h-2 tw-w-2 tw-shrink-0 tw-rounded-full ${meta.dotClass}`} aria-hidden />
          <span className="tw-text-sm tw-font-semibold tw-text-slate-800">{meta.title}</span>
          <Tag className="!tw-m-0 tw-h-5 tw-border-slate-200 tw-bg-slate-50 tw-px-2 tw-text-xs tw-leading-5 tw-text-slate-600">
            {count}
          </Tag>
        </div>
      </div>
      <div className="wf-scrollbar tw-flex tw-min-h-0 tw-flex-1 tw-flex-col tw-gap-3 tw-overflow-y-auto tw-overflow-x-hidden tw-px-3 tw-py-3 sm:tw-px-3.5">
        {children}
      </div>
    </div>
  );
}

function GoalKanbanCard({
  goal,
  column,
  memberId,
  canActivate,
  canSubmitPerf,
  activating,
  onOpenDetail,
  onOpenPerf,
  onActivate,
}: {
  goal: Goal;
  column: KanbanColumnKey;
  memberId: string;
  canActivate: boolean;
  canSubmitPerf: boolean;
  activating: boolean;
  onOpenDetail: () => void;
  onOpenPerf: () => void;
  onActivate: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: goal.id });
  const style = { transform: CSS.Transform.toString(transform), transition };

  const st = (goal.status ?? 'DRAFT').toUpperCase();
  const pctComputed = computeGoalProgressPercent(goal);
  const rawPct = pctComputed != null ? Math.round(pctComputed) : null;
  const barPct = rawPct != null ? Math.min(100, rawPct) : 0;
  const barColor =
    rawPct != null && rawPct > 100 ? '#22c55e' : rawPct != null && rawPct > 0 ? '#3b82f6' : '#e2e8f0';
  const ownerShort = goal.ownerId === memberId ? '나' : `${goal.ownerId.slice(0, 2)}**`;
  const actual = goal.actualValue ?? 0;
  const target = goal.targetValue ?? 0;
  const tagRowClass = '[&_.ant-tag]:!tw-m-0 [&_.ant-tag]:!tw-text-[11px] [&_.ant-tag]:!tw-leading-5';

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`tw-rounded-xl tw-border tw-border-slate-200/90 tw-bg-white tw-px-4 tw-py-4 tw-shadow-[0_1px_2px_rgba(15,23,42,0.04)] ${
        isDragging ? 'tw-opacity-95 tw-shadow-md tw-ring-2 tw-ring-blue-300/25' : ''
      }`}
    >
      <div className="tw-min-w-0">
        <div className="tw-flex tw-items-start tw-justify-between tw-gap-2">
          <div className={`tw-flex tw-min-w-0 tw-flex-1 tw-flex-wrap tw-items-center tw-gap-1.5 ${tagRowClass}`}>
            {visibilityTagBoard(goal.visibility)}
            {goal.visibility === 'PRIVATE' ? (
              <Tooltip title="비공개 목표">
                <EyeInvisibleOutlined className="tw-text-slate-400" />
              </Tooltip>
            ) : null}
          </div>
          <button
            type="button"
            aria-label="드래그하여 이동"
            className="tw--mr-0.5 tw-flex tw-shrink-0 tw-cursor-grab tw-touch-none tw-items-center tw-rounded-md tw-border-0 tw-bg-slate-100 tw-p-1.5 tw-text-slate-400 active:tw-cursor-grabbing hover:tw-bg-slate-200"
            {...listeners}
            {...attributes}
          >
            <HolderOutlined className="tw-text-sm" />
          </button>
        </div>

          <div className="tw-mt-2 tw-text-[15px] tw-font-bold tw-leading-snug tw-text-[#1e3a5f]">{goal.title}</div>

          {goal.description ? (
            <Text type="secondary" className="!tw-mt-1.5 tw-line-clamp-2 tw-block tw-text-sm !tw-leading-relaxed">
              {goal.description}
            </Text>
          ) : null}

          <div className="tw-mt-3 tw-flex tw-flex-wrap tw-items-center tw-gap-x-4 tw-gap-y-1 tw-text-xs tw-text-slate-500">
            <span className="tw-inline-flex tw-items-center tw-gap-1.5">
              <CalendarOutlined />
              {goal.startDate} ~ {goal.endDate}
            </span>
            <span className="tw-inline-flex tw-items-center tw-gap-1.5">
              <UserOutlined />
              {ownerShort}
            </span>
          </div>

          <div className="tw-mt-4 tw-border-t tw-border-slate-200/80 tw-pt-3">
            <div className="tw-text-2xl tw-font-bold tw-tabular-nums tw-leading-none tw-text-[#1e3a5f]">
              {rawPct != null ? `${rawPct}%` : '—'}
            </div>
            <Progress
              percent={barPct}
              size="small"
              showInfo={false}
              strokeColor={barColor}
              trailColor="rgba(15,23,42,0.06)"
              className="!tw-mt-2.5 !tw-mb-0"
            />
            <Text type="secondary" className="!tw-mt-2 tw-block tw-text-xs tw-leading-normal tw-text-slate-500">
              실적 {actual} / 목표 {target}
              {goal.unitType ? ` · ${goal.unitType}` : ''}
            </Text>
          </div>

          <div className="tw-mt-3 tw-flex tw-flex-wrap tw-items-center tw-gap-2">
            <Button type="text" size="small" className="!tw-h-8 !tw-text-slate-600" onClick={onOpenDetail}>
              상세
            </Button>
            {column === 'DRAFT' && st === 'DRAFT' && canActivate ? (
              <Button
                type="primary"
                size="small"
                loading={activating}
                onClick={onActivate}
                className="!tw-h-8 !tw-rounded-lg !tw-bg-[#1e3a5f] hover:!tw-bg-[#152a45]"
              >
                진행 시작
              </Button>
            ) : null}
            {column === 'ACTIVE' && canSubmitPerf ? (
              <Button size="small" onClick={onOpenPerf} className="!tw-h-8 !tw-rounded-lg">
                실적 입력
              </Button>
            ) : null}
          </div>
      </div>
    </div>
  );
}

export function GoalsKanbanBoard({
  goals,
  loading,
  companyId,
  memberId,
  canActivate,
  onOpenDetail,
  onOpenPerf,
  activateGoal,
  activatingGoalId,
  emptyTitle,
  emptyHint,
  goalListSort,
}: GoalsKanbanBoardProps) {
  const sortKeyRef = useRef(goalListSort);
  const [itemsByCol, setItemsByCol] = useState<Record<KanbanColumnKey, string[]>>(() => ({
    DRAFT: [],
    ACTIVE: [],
    COMPLETED: [],
    CANCELLED: [],
  }));
  const [activeDragId, setActiveDragId] = useState<string | null>(null);

  const goalsById = useMemo(() => new Map(goals.map((g) => [g.id, g])), [goals]);
  const sig = useMemo(() => goalsSignature(goals), [goals]);

  useLayoutEffect(() => {
    const sortChanged = sortKeyRef.current !== goalListSort;
    sortKeyRef.current = goalListSort;
    const saved = loadKanbanOrder(companyId);
    const next: Record<KanbanColumnKey, string[]> = {
      DRAFT: [],
      ACTIVE: [],
      COMPLETED: [],
      CANCELLED: [],
    };
    for (const col of COLS) {
      const ids = goals.filter((g) => toColumnKey(g.status) === col).map((g) => g.id);
      next[col] = sortChanged ? ids : mergeColumnIds(saved[col], ids);
    }
    setItemsByCol(next);
    if (sortChanged && companyId) {
      saveKanbanOrder(companyId, next);
    }
  }, [sig, companyId, goalListSort]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const findColumnOfCard = (cardId: string): KanbanColumnKey | null => {
    for (const col of COLS) {
      if (itemsByCol[col].includes(cardId)) return col;
    }
    return null;
  };

  const columnFromDropTarget = (overId: string): KanbanColumnKey | null => {
    if (overId.startsWith('col-')) return overId.slice(4) as KanbanColumnKey;
    return findColumnOfCard(overId);
  };

  const handleDragStart = (e: DragStartEvent) => {
    setActiveDragId(String(e.active.id));
  };

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    setActiveDragId(null);
    if (!over) return;

    const activeId = String(active.id);
    const overId = String(over.id);

    const activeCol = findColumnOfCard(activeId);
    const overCol = columnFromDropTarget(overId);

    if (!activeCol || !overCol) return;

    if (activeCol === overCol) {
      const list = [...itemsByCol[activeCol]];
      const oldIndex = list.indexOf(activeId);
      if (oldIndex < 0) return;
      const newIndex = overId.startsWith('col-') ? list.length - 1 : list.indexOf(overId);
      if (newIndex < 0 || oldIndex === newIndex) return;
      const newList = arrayMove(list, oldIndex, newIndex);
      const next = { ...itemsByCol, [activeCol]: newList };
      setItemsByCol(next);
      saveKanbanOrder(companyId, next);
      return;
    }

    if (activeCol === 'DRAFT' && overCol === 'ACTIVE' && canActivate) {
      void activateGoal(activeId).catch(() => {});
      return;
    }

    message.warning('칸반에서 서버에 반영되는 이동은 진행 전 → 진행 중(진행 시작)만 가능해요.');
  };

  const activeGoal = activeDragId ? goalsById.get(activeDragId) : undefined;

  if (loading) {
    return (
      <div className="tw-flex tw-h-48 tw-items-center tw-justify-center tw-rounded-lg tw-border tw-border-dashed tw-border-slate-200/80 tw-bg-white tw-text-slate-400">
        불러오는 중…
      </div>
    );
  }

  if (!goals.length) {
    return (
      <GoalsEmptyPanel title={emptyTitle} hint={emptyHint} />
    );
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="-tw-mx-0.5">
        <div className="wf-scrollbar tw-flex tw-snap-x tw-snap-mandatory tw-gap-4 tw-overflow-x-auto tw-overflow-y-visible tw-scroll-smooth tw-pb-2 tw-pl-0.5 tw-pr-2 tw-pt-0.5">
        {COLS.map((col) => {
          const ids = itemsByCol[col];
          const goalsInCol = ids.map((id) => goalsById.get(id)).filter((g): g is Goal => Boolean(g));
          return (
            <KanbanColumnShell key={col} col={col} count={goalsInCol.length}>
              <SortableContext items={ids} strategy={verticalListSortingStrategy}>
                {goalsInCol.length === 0 ? (
                  <div className="tw-flex tw-min-h-[140px] tw-flex-col tw-items-center tw-justify-center tw-rounded-lg tw-border tw-border-dashed tw-border-slate-200 tw-bg-white/70 tw-text-center tw-text-xs tw-text-slate-400">
                    항목 없음
                  </div>
                ) : (
                  goalsInCol.map((g) => {
                    const isOwner = g.ownerId === memberId;
                    const st = (g.status ?? 'DRAFT').toUpperCase();
                    return (
                      <GoalKanbanCard
                        key={g.id}
                        goal={g}
                        column={col}
                        memberId={memberId}
                        canActivate={canActivate}
                        canSubmitPerf={st === 'ACTIVE' && isOwner && canActivate}
                        activating={activatingGoalId === g.id}
                        onOpenDetail={() => onOpenDetail(g)}
                        onOpenPerf={() => onOpenPerf(g)}
                        onActivate={() => void activateGoal(g.id)}
                      />
                    );
                  })
                )}
              </SortableContext>
            </KanbanColumnShell>
          );
        })}
        </div>
      </div>
      <DragOverlay dropAnimation={null}>
        {activeGoal ? (
          <div className="tw-max-w-[260px] tw-rounded-xl tw-border tw-border-[#3182F6]/35 tw-bg-white tw-p-2.5 tw-shadow-lg">
            <Text strong className="tw-line-clamp-3 tw-text-sm">
              {activeGoal.title}
            </Text>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
