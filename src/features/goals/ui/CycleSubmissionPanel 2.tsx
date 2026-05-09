import { useMemo, useState } from 'react';
import { App, Alert, Button, Card, Input, Popconfirm, Progress, Space, Tag, Tooltip, Typography } from 'antd';
import { EditOutlined } from '@ant-design/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { approvalApi } from '@/features/approval/api/approvalApi';
import type { GoalApprovalBundle } from '@/features/approval/model/types';
import { SingleMemberOrgChartSelectModal } from '@/features/members/ui/SingleMemberOrgChartSelectModal';
import { parseApiError } from '@/shared/api/error-parser';
import { AppButton } from '@/shared/ui/AppButton';
import type { Goal } from '../model/types';

const { Text } = Typography;

type Props = {
  cycleKey: string;
  goals: Goal[];
  pendingBundle?: GoalApprovalBundle;
  approvedBundle?: GoalApprovalBundle;
  lastRejected?: GoalApprovalBundle;
  approverIdHint?: string;
  onEditGoal?: (goal: Goal) => void;
  onDeleteGoal?: (goal: Goal) => void;
  deletingGoalId?: string;
  onBundleSelect?: (bundle: GoalApprovalBundle) => void;
};

export function CycleSubmissionPanel({
  cycleKey,
  goals,
  pendingBundle,
  approvedBundle,
  lastRejected,
  approverIdHint,
  onEditGoal,
  onDeleteGoal,
  deletingGoalId,
  onBundleSelect,
}: Props) {
  const { message, modal } = App.useApp();
  const queryClient = useQueryClient();
  const [approverId, setApproverId] = useState(approverIdHint ?? '');
  const [approverName, setApproverName] = useState('');
  const [approverPickerOpen, setApproverPickerOpen] = useState(false);

  const individualGoals = useMemo(() => goals.filter((goal) => goal.ownerType === 'MEMBER'), [goals]);
  const draftGoals = useMemo(() => individualGoals.filter((goal) => goal.status === 'DRAFT'), [individualGoals]);
  const pendingGoals = useMemo(
    () => individualGoals.filter((goal) => goal.status === 'PENDING' || goal.goalApprovalStatus === 'PENDING'),
    [individualGoals],
  );
  const approvedGoals = useMemo(
    () =>
      individualGoals.filter(
        (goal) =>
          goal.status === 'ACTIVE' ||
          goal.status === 'COMPLETED' ||
          goal.goalApprovalStatus === 'APPROVED',
      ),
    [individualGoals],
  );
  const sumWeight = useMemo(
    () => draftGoals.reduce((total, goal) => total + (goal.weightPct || 0), 0),
    [draftGoals],
  );
  const approvedWeight = useMemo(
    () => approvedGoals.reduce((total, goal) => total + (goal.weightPct || 0), 0),
    [approvedGoals],
  );
  const pendingWeight = useMemo(
    () => pendingGoals.reduce((total, goal) => total + (goal.weightPct || 0), 0),
    [pendingGoals],
  );
  const hasApprovedBundle = !!approvedBundle;
  const submittable = !hasApprovedBundle && sumWeight === 100 && draftGoals.length > 0;
  const isApprovedCycle =
    hasApprovedBundle ||
    (individualGoals.length > 0 &&
      draftGoals.length === 0 &&
      pendingGoals.length === 0 &&
      approvedGoals.length === individualGoals.length);
  const visibleGoals = isApprovedCycle ? approvedGoals : pendingBundle ? pendingGoals : draftGoals;
  const visibleWeight = isApprovedCycle ? approvedWeight : pendingBundle ? pendingWeight : sumWeight;
  const panelTitle = isApprovedCycle ? '승인 완료' : pendingBundle ? '승인 대기' : lastRejected ? '반려 후 재작성' : '승인 요청 준비';
  const statusColor = isApprovedCycle ? 'green' : pendingBundle ? 'gold' : lastRejected ? 'red' : 'default';
  const editableGoals = !isApprovedCycle && !pendingBundle;

  const submitMut = useMutation({
    mutationFn: () =>
      approvalApi.submitCycle(cycleKey, {
        approverId: approverId || null,
        watcherIds: [],
      }),
    onSuccess: () => {
      message.success('승인 요청을 보냈어요.');
      invalidateQueries();
    },
    onError: (error) => message.error(parseApiError(error).message),
  });

  const withdrawMut = useMutation({
    mutationFn: () => approvalApi.withdraw(pendingBundle!.bundleId),
    onSuccess: () => {
      message.success('승인 요청을 철회했어요.');
      invalidateQueries();
    },
    onError: (error) => message.error(parseApiError(error).message),
  });

  return (
    <Card
      className="tw-rounded-2xl tw-border tw-border-slate-200/90"
      styles={{ header: { padding: '14px 18px' }, body: { padding: 18 } }}
      title={
        <div className="tw-flex tw-flex-wrap tw-items-center tw-gap-2">
          <Text strong className="tw-text-[15px] tw-text-slate-900">
            {cycleKey}
          </Text>
          <Tag color={statusColor} className="!tw-m-0">
            {panelTitle}
          </Tag>
          <span className="tw-text-xs tw-text-slate-500">목표 {individualGoals.length}개</span>
        </div>
      }
      extra={
        <Space>
          {approvedBundle || pendingBundle || lastRejected ? (
            <AppButton
              variant="text"
              size="small"
              onClick={() => {
                const bundle = approvedBundle ?? pendingBundle ?? lastRejected;
                if (bundle) onBundleSelect?.(bundle);
              }}
            >
              요청 상세
            </AppButton>
          ) : null}
          {isApprovedCycle ? (
            <AppButton variant="subtle" size="small" disabled>
              승인 완료
            </AppButton>
          ) : pendingBundle ? (
            <AppButton
              variant="danger"
              size="small"
              loading={withdrawMut.isPending}
              onClick={() =>
                modal.confirm({
                  title: '승인 요청 철회',
                  content: '철회하면 현재 목표 기간의 개인 목표가 다시 초안 상태로 돌아갑니다.',
                  onOk: () => withdrawMut.mutate(),
                })
              }
            >
              철회
            </AppButton>
          ) : (
            <AppButton
              variant="primary"
              size="small"
              disabled={!submittable}
              loading={submitMut.isPending}
              onClick={() => submitMut.mutate()}
            >
              승인 요청
            </AppButton>
          )}
        </Space>
      }
    >
      <div className="tw-mb-4 tw-grid tw-grid-cols-1 tw-gap-3 md:tw-grid-cols-3">
        <CycleMetric label="상태" value={panelTitle} tone={statusColor} />
        <CycleMetric label="목표 수" value={`${individualGoals.length}개`} />
        <CycleMetric label="가중치" value={`${visibleWeight}%`} tone={visibleWeight === 100 ? 'green' : 'red'} />
      </div>

      {lastRejected ? (
        <Alert
          type="warning"
          showIcon
          className="tw-mb-4 !tw-rounded-xl"
          message={<span className="tw-font-semibold">이전 승인 요청이 반려됐어요. (revision {lastRejected.revision})</span>}
          description={
            <div>
              <div className="tw-mb-1 tw-text-sm">
                {lastRejected.lastRejectedReason ?? '반려 사유가 아직 등록되지 않았습니다.'}
              </div>
              {lastRejected.affectedGoalIds.length > 0 ? (
                <div className="tw-text-xs tw-text-slate-500">지적된 목표 {lastRejected.affectedGoalIds.length}건</div>
              ) : null}
            </div>
          }
        />
      ) : null}

      <div className="tw-mb-4">
        <Progress
          percent={Math.min(visibleWeight, 100)}
          status={visibleWeight === 100 ? 'success' : visibleWeight > 100 ? 'exception' : 'active'}
          showInfo={false}
          size={['100%', 8]}
        />
      </div>

      {!isApprovedCycle && !pendingBundle && draftGoals.length === 0 ? (
        <Alert
          type="warning"
          showIcon
          className="tw-mb-4 !tw-rounded-xl"
          message="승인 요청할 작성 중 목표가 없습니다."
        />
      ) : null}

      {!isApprovedCycle && !pendingBundle && draftGoals.length > 0 && sumWeight !== 100 ? (
        <Alert
          type="error"
          showIcon
          className="tw-mb-4 !tw-rounded-xl"
          message={`가중치 합이 ${sumWeight}%입니다. 100%가 되어야 승인 요청할 수 있습니다.`}
        />
      ) : null}

      {!isApprovedCycle && !pendingBundle ? (
        <div className="tw-mb-4">
          <label className="tw-mb-1 tw-block tw-text-xs tw-text-slate-500">승인자</label>
          <Space.Compact className="tw-w-full">
            <Input
              readOnly
              placeholder="선택하지 않으면 직속 상사로 자동 지정합니다."
              value={approverId ? `${approverName || '선택한 구성원'} (${approverId})` : ''}
            />
            <Button onClick={() => setApproverPickerOpen(true)}>구성원 선택</Button>
          </Space.Compact>
        </div>
      ) : null}

      <div className="tw-rounded-xl tw-border tw-border-slate-200 tw-bg-white">
        <div className="tw-grid tw-grid-cols-[minmax(0,1fr)_88px_88px_92px] tw-gap-3 tw-border-b tw-border-slate-100 tw-bg-slate-50 tw-px-4 tw-py-2 tw-text-[11px] tw-font-semibold tw-text-slate-500">
          <span>목표</span>
          <span className="tw-text-right">가중치</span>
          <span className="tw-text-center">상태</span>
          <span className="tw-text-right">작업</span>
        </div>
        {visibleGoals.map((goal) => (
          <GoalRow
            key={goal.goalId}
            goal={goal}
            editable={editableGoals && goal.status === 'DRAFT'}
            deleting={deletingGoalId === goal.goalId}
            onEdit={onEditGoal}
            onDelete={onDeleteGoal}
          />
        ))}
        {visibleGoals.length === 0 ? (
          <div className="tw-py-4 tw-text-center tw-text-sm tw-text-slate-400">
            {isApprovedCycle ? '승인 완료 목표가 없습니다.' : '이 목표 기간에 제출 가능한 초안 목표가 없습니다.'}
          </div>
        ) : null}
      </div>

      <SingleMemberOrgChartSelectModal
        open={approverPickerOpen}
        title="승인자 선택"
        selectedMemberId={approverId || undefined}
        onClose={() => setApproverPickerOpen(false)}
        onSelect={(member) => {
          setApproverId(member.memberId);
          setApproverName(`${member.name} · ${member.organizationName} · ${member.jobGradeName}`);
          setApproverPickerOpen(false);
        }}
      />
    </Card>
  );

  function invalidateQueries() {
    queryClient.invalidateQueries({ queryKey: ['goals-mine'] });
    queryClient.invalidateQueries({ queryKey: ['my-bundles'] });
    queryClient.invalidateQueries({ queryKey: ['my-approval-queue'] });
  }
}

function CycleMetric({ label, value, tone = 'default' }: { label: string; value: string; tone?: string }) {
  const valueClass =
    tone === 'green'
      ? 'tw-text-emerald-700'
      : tone === 'gold'
        ? 'tw-text-amber-700'
        : tone === 'red'
          ? 'tw-text-rose-700'
          : 'tw-text-slate-900';
  return (
    <div className="tw-rounded-xl tw-border tw-border-slate-200 tw-bg-slate-50 tw-p-3">
      <div className="tw-text-[11px] tw-font-semibold tw-text-slate-500">{label}</div>
      <div className={`tw-mt-1 tw-text-[16px] tw-font-bold ${valueClass}`}>{value}</div>
    </div>
  );
}

function GoalRow({
  goal,
  editable,
  deleting,
  onEdit,
  onDelete,
}: {
  goal: Goal;
  editable: boolean;
  deleting: boolean;
  onEdit?: (goal: Goal) => void;
  onDelete?: (goal: Goal) => void;
}) {
  return (
    <div className="tw-grid tw-grid-cols-[minmax(0,1fr)_88px_88px_92px] tw-gap-3 tw-border-b tw-border-slate-100 tw-px-4 tw-py-3 last:tw-border-b-0">
      <div className="tw-min-w-0">
        <div className="tw-truncate tw-text-sm tw-font-semibold tw-text-slate-900">{goal.title}</div>
        <div className="tw-mt-1 tw-line-clamp-1 tw-text-xs tw-text-slate-500">
          {goal.objectiveTitle ? `연결 목표: ${goal.objectiveTitle}` : goal.description || '연결된 조직 목표 없음'}
        </div>
      </div>
      <div className="tw-self-center tw-text-right tw-text-sm tw-font-bold tw-text-[#1e3a5f]">{goal.weightPct}%</div>
      <div className="tw-self-center tw-text-center">
        <StatusTag status={goal.status} />
      </div>
      <div className="tw-flex tw-items-center tw-justify-end tw-gap-1">
        {editable ? (
          <Tooltip title="수정">
            <AppButton
              variant="text"
              size="small"
              icon={<EditOutlined />}
              aria-label={`${goal.title} 목표 수정`}
              onClick={() => onEdit?.(goal)}
            />
          </Tooltip>
        ) : null}
        {editable && onDelete ? (
          <Popconfirm
            title="작성 중인 목표 삭제"
            description="삭제한 목표는 되돌릴 수 없습니다."
            okText="삭제"
            cancelText="취소"
            okButtonProps={{ danger: true, loading: deleting }}
            onConfirm={() => onDelete(goal)}
          >
            <AppButton variant="text" danger size="small" loading={deleting}>
              삭제
            </AppButton>
          </Popconfirm>
        ) : (
          <span className="tw-text-xs tw-text-slate-300">-</span>
        )}
      </div>
    </div>
  );
}

function StatusTag({ status }: { status: string }) {
  const color =
    status === 'ACTIVE' || status === 'APPROVED'
      ? 'green'
      : status === 'PENDING'
        ? 'gold'
        : status === 'REJECTED'
          ? 'red'
          : 'default';
  const label: Record<string, string> = {
    DRAFT: '작성 중',
    PENDING: '승인 대기',
    ACTIVE: '평가 대상',
    COMPLETED: '완료',
    CANCELLED: '취소',
    SKIPPED: '제외',
    APPROVED: '승인',
    REJECTED: '반려',
    WITHDRAWN: '철회',
  };
  return <Tag color={color} className="!tw-m-0">{label[status] ?? status}</Tag>;
}
