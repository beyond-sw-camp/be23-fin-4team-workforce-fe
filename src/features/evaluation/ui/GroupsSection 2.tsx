import { useMemo, useState, type ReactNode } from 'react';
import { Button, Empty, Tag, Tooltip, Typography } from 'antd';
import { TeamOutlined, UserAddOutlined } from '@ant-design/icons';
import type { EvaluationGroup } from '@/features/evaluation/model/types';
import { useMemberDisplayNames } from '@/features/members/hooks/useMemberDisplayNames';
import { AppExpandToggleButton } from '@/shared/ui/AppExpandToggleButton';
import {
  EvaluatorAssignDrawer,
  type AssignDrawerState,
} from '@/features/evaluation/ui/EvaluatorAssignDrawer';

const { Text } = Typography;

type Props = {
  groups: EvaluationGroup[];
  selectedSeasonId: string;
  seasonStatus?: string;
  onInvalidate: () => void;
};

export function GroupsSection({ groups, selectedSeasonId, seasonStatus, onInvalidate }: Props) {
  const [expanded, setExpanded] = useState(true);
  const [assignDrawer, setAssignDrawer] = useState<AssignDrawerState>({
    open: false,
    group: null,
    initialTargetMemberId: null,
  });

  const allMemberIds = useMemo(() => {
    const ids = new Set<string>();
    for (const g of groups) {
      for (const id of g.targetMemberIds ?? []) ids.add(id);
      for (const em of g.evaluatorMaps ?? []) {
        if (em.targetMemberId) ids.add(em.targetMemberId);
        if (em.evaluatorId) ids.add(em.evaluatorId);
      }
    }
    return [...ids];
  }, [groups]);

  const { labelFor } = useMemberDisplayNames(allMemberIds);

  const targetRows = useMemo(() => buildTargetRows(groups), [groups]);
  const primaryGroup = groups[0] ?? null;
  const canAssign = seasonStatus === 'SELF_EVAL' || seasonStatus === 'MANAGER_EVAL';
  const assigned = targetRows.filter((row) => row.downwardMaps.length > 0).length;

  return (
    <>
      {groups.length === 0 ? (
        <div className="tw-rounded-2xl tw-border tw-border-slate-200 tw-bg-white tw-py-14">
          <Empty description="아직 자동 로드된 평가 대상자가 없습니다. 평가를 시작하면 해당 목표 기간의 승인 완료 개인목표 보유자가 자동으로 불러와집니다." />
        </div>
      ) : (
        <TargetListCard
          rows={targetRows}
          expanded={expanded}
          labelFor={labelFor}
          assignedLabel={`${assigned}/${targetRows.length}명 지정`}
          canAssign={canAssign}
          onToggle={() => setExpanded((prev) => !prev)}
          onAssign={() => primaryGroup && setAssignDrawer({ open: true, group: primaryGroup, initialTargetMemberId: null })}
          onAssignTarget={(row) => setAssignDrawer({ open: true, group: row.group, initialTargetMemberId: row.targetMemberId })}
        />
      )}
      <EvaluatorAssignDrawer
        state={assignDrawer}
        onClose={() => setAssignDrawer({ open: false, group: null, initialTargetMemberId: null })}
        seasonId={selectedSeasonId}
        labelFor={labelFor}
        evalTypes={assignDrawer.group?.evaluationTypes ?? ['SELF', 'DOWNWARD']}
        onSaved={onInvalidate}
      />
    </>
  );
}

type TargetRow = {
  targetMemberId: string;
  group: EvaluationGroup;
  downwardMaps: NonNullable<EvaluationGroup['evaluatorMaps']>;
};

function buildTargetRows(groups: EvaluationGroup[]): TargetRow[] {
  const rowByTarget = new Map<string, TargetRow>();

  groups.forEach((group) => {
    const maps = group.evaluatorMaps ?? [];
    const targetIds = new Set<string>([
      ...(group.targetMemberIds ?? []),
      ...maps.map((map) => map.targetMemberId).filter(Boolean),
    ]);

    targetIds.forEach((targetMemberId) => {
      const downwardMaps = maps.filter(
        (map) => map.targetMemberId === targetMemberId && map.evaluationType === 'DOWNWARD',
      );
      const current = rowByTarget.get(targetMemberId);
      if (!current || (current.downwardMaps.length === 0 && downwardMaps.length > 0)) {
        rowByTarget.set(targetMemberId, {
          targetMemberId,
          group,
          downwardMaps,
        });
      }
    });
  });

  return Array.from(rowByTarget.values()).sort((a, b) => a.targetMemberId.localeCompare(b.targetMemberId));
}

type TargetListCardProps = {
  rows: TargetRow[];
  expanded: boolean;
  labelFor: (id: string) => string;
  onToggle: () => void;
  canAssign: boolean;
  onAssign: () => void;
  onAssignTarget: (row: TargetRow) => void;
  assignedLabel: string;
};

function TargetListCard({
  rows,
  expanded,
  labelFor,
  onToggle,
  canAssign,
  onAssign,
  onAssignTarget,
  assignedLabel,
}: TargetListCardProps) {
  return (
    <div className="tw-overflow-hidden tw-rounded-2xl tw-border tw-border-slate-200/70 tw-bg-white tw-shadow-sm tw-shadow-slate-900/5">
      <div className="tw-flex tw-flex-wrap tw-items-center tw-gap-4 tw-px-5 tw-py-4">
        <AppExpandToggleButton expanded={expanded} onToggle={onToggle} />
        <div className="tw-min-w-0 tw-flex-1">
          <div className="tw-truncate tw-text-[17px] tw-font-bold tw-text-slate-900">평가 대상자</div>
          <div className="tw-truncate tw-text-xs tw-text-slate-500">
            목표 기간에 승인 완료된 개인 목표 보유자가 자동으로 포함됩니다.
          </div>
        </div>
        <HeaderStat label="대상자" icon={<TeamOutlined />} value={`${rows.length}명`} />
        <HeaderStat label="상사평가자" icon={<UserAddOutlined />} value={assignedLabel} />
        <Tooltip title={canAssign ? undefined : '자기평가/상사평가 진행 중에만 평가자 지정을 수정할 수 있습니다.'}>
          <Button
            icon={<UserAddOutlined />}
            disabled={!canAssign}
            onClick={onAssign}
            className="!tw-h-9 !tw-rounded-full !tw-border-slate-200 !tw-px-4 !tw-text-sm !tw-font-semibold"
          >
            상사평가자 확인/수정
          </Button>
        </Tooltip>
      </div>

      {expanded ? (
        <div className="tw-border-t tw-border-slate-100 tw-bg-slate-50/70 tw-px-5 tw-py-4">
          {rows.length === 0 ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="대상자가 없습니다." />
          ) : (
            <div className="tw-grid tw-gap-2 md:tw-grid-cols-2 xl:tw-grid-cols-3">
              {rows.map((row) => {
                return (
                  <button
                    key={row.targetMemberId}
                    type="button"
                    onClick={() => canAssign && onAssignTarget(row)}
                    disabled={!canAssign}
                    className="tw-rounded-xl tw-border tw-border-slate-200 tw-bg-white tw-p-3 tw-text-left tw-shadow-sm"
                  >
                    <div className="tw-font-semibold tw-text-slate-900">{labelFor(row.targetMemberId)}</div>
                    <div className="tw-mt-2 tw-flex tw-flex-wrap tw-gap-1.5">
                      {row.downwardMaps.length === 0 ? (
                        <Tag>상사평가자 미지정</Tag>
                      ) : (
                        row.downwardMaps.map((map) => (
                          <Tag key={`${map.evaluatorId}-${map.evaluationType}`} color="blue">
                            상사평가 · {labelFor(map.evaluatorId)}
                          </Tag>
                        ))
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function HeaderStat({ label, value, icon }: { label: string; value: string; icon: ReactNode }) {
  return (
    <div className="tw-hidden tw-min-w-[112px] tw-flex-col tw-gap-1 lg:tw-flex">
      <Text type="secondary" className="tw-text-xs">
        <span className="tw-mr-1">{icon}</span>
        {label}
      </Text>
      <span className="tw-text-sm tw-font-semibold tw-text-slate-900">{value}</span>
    </div>
  );
}
