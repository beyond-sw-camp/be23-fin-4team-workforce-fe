import { useMemo, useState } from 'react';
import { App, Alert, Card, Input, Progress, Space, Typography } from 'antd';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { SingleMemberOrgChartSelectModal } from '@/features/members/ui/SingleMemberOrgChartSelectModal';
import { AppButton } from '@/shared/ui/AppButton';
import { approvalApi } from '@/features/approval/api/approvalApi';
import type { GoalApprovalBundle } from '@/features/approval/model/types';
import type { Goal } from '../model/types';
import { GoalCard } from './GoalCard';

const { Text } = Typography;

type Props = {
  cycleKey: string;
  goals: Goal[];
  pendingBundle?: GoalApprovalBundle;
  lastRejected?: GoalApprovalBundle;
  approverIdHint?: string;
  onEditGoal?: (goal: Goal) => void;
};

export function CycleSubmissionPanel({
  cycleKey,
  goals,
  pendingBundle,
  lastRejected,
  approverIdHint,
  onEditGoal,
}: Props) {
  const { message, modal } = App.useApp();
  const queryClient = useQueryClient();
  const [approverId, setApproverId] = useState(approverIdHint ?? '');
  const [approverName, setApproverName] = useState('');
  const [approverPickerOpen, setApproverPickerOpen] = useState(false);

  const individualGoals = useMemo(() => goals.filter((goal) => goal.ownerType === 'MEMBER'), [goals]);
  const sumWeight = useMemo(
    () => individualGoals.reduce((total, goal) => total + (goal.weightPct || 0), 0),
    [individualGoals],
  );
  const submittable = sumWeight === 100 && individualGoals.length > 0;

  const submitMut = useMutation({
    mutationFn: () =>
      approvalApi.submitCycle(cycleKey, {
        approverId: approverId || null,
        watcherIds: [],
      }),
    onSuccess: () => {
      message.success('승인 요청을 등록했습니다.');
      invalidateQueries();
    },
    onError: (error: any) => message.error(error?.message ?? '승인 요청 등록에 실패했습니다.'),
  });

  const withdrawMut = useMutation({
    mutationFn: () => approvalApi.withdraw(pendingBundle!.bundleId),
    onSuccess: () => {
      message.success('승인 요청을 회수했습니다.');
      invalidateQueries();
    },
    onError: (error: any) => message.error(error?.message ?? '요청 회수에 실패했습니다.'),
  });

  return (
    <Card
      className="tw-rounded-2xl tw-border tw-border-slate-200/90 tw-shadow-sm tw-shadow-slate-900/5"
      styles={{ body: { padding: 20 } }}
      title={
        <div className="tw-flex tw-items-center tw-gap-2">
          <Text strong className="tw-text-[15px] tw-text-slate-900">
            {cycleKey}
          </Text>
          <span className="tw-text-xs tw-text-slate-500">개인 목표 {individualGoals.length}개</span>
        </div>
      }
      extra={
        pendingBundle ? (
          <AppButton
            variant="danger"
            loading={withdrawMut.isPending}
            onClick={() =>
              modal.confirm({
                title: '승인 요청 회수',
                content: '회수하면 현재 사이클의 개인 목표가 다시 DRAFT 상태로 돌아갑니다.',
                onOk: () => withdrawMut.mutate(),
              })
            }
          >
            요청 회수
          </AppButton>
        ) : (
          <AppButton
            variant="primary"
            disabled={!submittable}
            loading={submitMut.isPending}
            onClick={() => submitMut.mutate()}
          >
            일괄 승인 요청
          </AppButton>
        )
      }
    >
      {lastRejected && (
        <Alert
          type="warning"
          showIcon
          className="tw-mb-4 !tw-rounded-xl"
          message={<span className="tw-font-semibold">이전 승인 요청이 반려되었습니다. (revision {lastRejected.revision})</span>}
          description={
            <div>
              <div className="tw-mb-1 tw-text-sm">{lastRejected.lastRejectedReason ?? '반려 사유가 아직 등록되지 않았습니다.'}</div>
              {lastRejected.affectedGoalIds.length > 0 && (
                <div className="tw-text-xs tw-text-slate-500">지적된 목표 {lastRejected.affectedGoalIds.length}건</div>
              )}
            </div>
          }
        />
      )}

      {pendingBundle && (
        <Alert
          type="info"
          showIcon
          className="tw-mb-4 !tw-rounded-xl"
          message={<span className="tw-font-semibold">승인 대기 중이에요. (revision {pendingBundle.revision})</span>}
          description={pendingBundle.delegateApproverId ? '위임 승인자가 검토 중입니다.' : '기본 승인자가 검토 중입니다.'}
        />
      )}

      <div className="tw-mb-4 tw-rounded-xl tw-bg-slate-50 tw-p-4">
        <div className="tw-mb-2 tw-flex tw-justify-between">
          <span className="tw-text-sm tw-font-medium tw-text-slate-700">개인 목표 가중치 합</span>
          <span className={sumWeight === 100 ? 'tw-text-sm tw-font-bold tw-text-emerald-600' : 'tw-text-sm tw-font-bold tw-text-rose-600'}>
            {sumWeight} / 100
          </span>
        </div>
        <Progress
          percent={Math.min(sumWeight, 100)}
          status={sumWeight === 100 ? 'success' : sumWeight > 100 ? 'exception' : 'active'}
          showInfo={false}
          strokeWidth={8}
        />
      </div>

      {!pendingBundle && individualGoals.length === 0 && (
        <Alert
          type="error"
          showIcon
          className="tw-mb-4 !tw-rounded-xl"
          message="개인 목표가 없습니다."
          description="조직 목표만으로는 승인 요청을 보낼 수 없어요. 먼저 개인 목표를 작성해 주세요."
        />
      )}

      {!pendingBundle && individualGoals.length > 0 && sumWeight !== 100 && (
        <Alert
          type="error"
          showIcon
          className="tw-mb-4 !tw-rounded-xl"
          message={`현재 개인 목표 가중치 합이 ${sumWeight}%입니다.`}
          description="승인 요청은 개인 목표 가중치 합이 100%일 때만 가능합니다."
        />
      )}

      {!pendingBundle && (
        <div className="tw-mb-4">
          <label className="tw-mb-1 tw-block tw-text-xs tw-text-slate-500">승인자 ID (비워두면 직속 조직장으로 자동 매핑)</label>
          <Input
            readOnly
            placeholder="선택하지 않으면 자동으로 매핑됩니다."
            value={approverId ? `${approverName || '선택된 구성원'} (${approverId})` : ''}
            addonAfter={
              <a
                onClick={(event) => {
                  event.preventDefault();
                  setApproverPickerOpen(true);
                }}
              >
                구성원 선택
              </a>
            }
          />
        </div>
      )}

      <div className="tw-mb-1 tw-flex tw-items-center tw-gap-2">
        <Text className="!tw-text-[12px] !tw-font-semibold !tw-uppercase !tw-tracking-wide !tw-text-slate-400">
          개인 목표 목록
        </Text>
        <span className="tw-text-[11px] tw-text-slate-400">모든 개인 목표는 상위 조직 목표의 평가 기준을 참조합니다.</span>
      </div>
      <Space direction="vertical" size={8} className="tw-w-full">
        {individualGoals.map((goal) => (
          <GoalCard
            key={goal.goalId}
            goal={goal}
            onClick={!pendingBundle && goal.status === 'DRAFT' ? onEditGoal : undefined}
          />
        ))}
        {individualGoals.length === 0 && (
          <div className="tw-py-4 tw-text-center tw-text-sm tw-text-slate-400">이 사이클에 작성된 개인 목표가 아직 없습니다.</div>
        )}
      </Space>

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
  }
}
