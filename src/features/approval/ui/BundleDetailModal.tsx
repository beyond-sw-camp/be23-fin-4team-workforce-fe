import { useMemo, useState } from 'react';
import { App, Alert, Checkbox, Input, Space, Tag, Typography } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemberDisplayNames } from '@/features/members/hooks/useMemberDisplayNames';
import { approvalApi } from '../api/approvalApi';
import type { GoalApprovalBundle } from '../model/types';
import { goalApi } from '@/features/goals/api/goalApi';
import { GoalCard } from '@/features/goals/ui/GoalCard';
import { AppDoubleActionModal } from '@/shared/ui/AppDoubleActionModal';

const { TextArea } = Input;
const { Text } = Typography;

type Props = {
  open: boolean;
  bundle: GoalApprovalBundle | null;
  onClose: () => void;
  currentUserId: string;
};

export function BundleDetailModal({ open, bundle, onClose, currentUserId }: Props) {
  const { message, modal } = App.useApp();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<'view' | 'reject'>('view');
  const [reason, setReason] = useState('');
  const [affected, setAffected] = useState<string[]>([]);

  const { data: goals = [] } = useQuery({
    queryKey: ['bundle-goals', bundle?.bundleId],
    queryFn: async () => {
      if (!bundle) return [];
      return Promise.all(bundle.goalIds.map((id) => goalApi.getGoal(id)));
    },
    enabled: !!bundle && open,
  });

  const memberIds = useMemo(() => {
    if (!bundle) return [];
    return [bundle.requestedBy, bundle.approverId].filter(Boolean) as string[];
  }, [bundle]);
  const { labelFor } = useMemberDisplayNames(memberIds);

  const reset = () => {
    setMode('view');
    setReason('');
    setAffected([]);
  };

  const close = () => {
    reset();
    onClose();
  };

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['my-approval-queue'] });
    queryClient.invalidateQueries({ queryKey: ['my-bundles'] });
    queryClient.invalidateQueries({ queryKey: ['goals-mine'] });
    queryClient.invalidateQueries({ queryKey: ['goals-org'] });
  };

  const approveMut = useMutation({
    mutationFn: () => approvalApi.approve(bundle!.bundleId, {}),
    onSuccess: () => {
      message.success('승인되었습니다.');
      invalidate();
      close();
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? '승인 실패'),
  });

  const rejectMut = useMutation({
    mutationFn: () =>
      approvalApi.reject(bundle!.bundleId, { reason, affectedGoalIds: affected }),
    onSuccess: () => {
      message.success('반려되었습니다.');
      invalidate();
      close();
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? '반려 실패'),
  });

  if (!bundle) return null;

  const isApprover = bundle.approverId === currentUserId;
  const isPending = bundle.status === 'PENDING';
  const canDecide = mode === 'view' && isApprover && isPending;
  const isRejectMode = mode === 'reject';

  const STATUS_COLOR: Record<string, string> = {
    PENDING: 'gold',
    APPROVED: 'green',
    REJECTED: 'red',
    WITHDRAWN: 'default',
  };
  const STATUS_LABEL: Record<string, string> = {
    PENDING: '대기',
    APPROVED: '승인',
    REJECTED: '반려',
    WITHDRAWN: '회수',
  };

  const modalTitle = (
    <div className="tw-flex tw-min-w-0 tw-flex-wrap tw-items-center tw-gap-2">
      <Tag
        bordered={false}
        className="!tw-m-0 !tw-rounded-full !tw-bg-slate-100 !tw-px-2.5 !tw-text-[11px] !tw-font-medium !tw-text-slate-700"
      >
        {bundle.cycleKey}
      </Tag>
      <Text strong className="!tw-text-[16px] !tw-text-slate-900">
        승인 요청
      </Text>
      <Tag
        color={STATUS_COLOR[bundle.status]}
        className="!tw-m-0 !tw-rounded-full !tw-px-2.5 !tw-text-[11px] !tw-font-semibold"
      >
        {STATUS_LABEL[bundle.status]}
      </Tag>
      {bundle.revision > 1 && (
        <Tag
          bordered={false}
          className="!tw-m-0 !tw-rounded-full !tw-bg-amber-50 !tw-px-2.5 !tw-text-[11px] !tw-font-medium !tw-text-amber-700"
        >
          r{bundle.revision}
        </Tag>
      )}
    </div>
  );

  const confirmApproval = () => {
    modal.confirm({
      title: '일괄 승인',
      content: `${bundle.goalIds.length}개 목표를 모두 ACTIVE 로 전환합니다.`,
      onOk: () => approveMut.mutate(),
    });
  };

  return (
    <AppDoubleActionModal
      open={open}
      onClose={close}
      title={modalTitle}
      width={760}
      destroyOnHidden
      cancelText={isRejectMode ? '취소' : canDecide ? '반려' : '닫기'}
      confirmText={isRejectMode ? '반려 확정' : canDecide ? '승인' : '닫기'}
      hideCancel={!canDecide && !isRejectMode}
      cancelDanger={canDecide}
      confirmDanger={isRejectMode}
      confirmDisabled={isRejectMode && !reason.trim()}
      confirmLoading={isRejectMode ? rejectMut.isPending : approveMut.isPending}
      cancelAction={() => {
        if (isRejectMode) {
          setMode('view');
          return;
        }
        if (canDecide) {
          setMode('reject');
          return;
        }
        close();
      }}
      onConfirm={() => {
        if (isRejectMode) {
          rejectMut.mutate();
          return;
        }
        if (canDecide) {
          confirmApproval();
          return;
        }
        close();
      }}
    >
      <div className="tw-space-y-4 tw-px-5 tw-py-5">
        <div className="tw-rounded-2xl tw-border tw-border-slate-200/90 tw-bg-slate-50/60 tw-p-4">
          <div className="tw-grid tw-grid-cols-2 tw-gap-x-6 tw-gap-y-3">
            <Cell label="가중치 합">
              <span className="tw-text-lg tw-font-bold tw-text-emerald-600">
                {bundle.weightSumSnapshot}%
              </span>
            </Cell>
            <Cell label="요청 시각">
              <span className="tw-text-sm tw-text-slate-700">
                {new Date(bundle.requestedAt).toLocaleString('ko-KR')}
              </span>
            </Cell>
            <Cell label="요청자">
              <span className="tw-text-sm tw-font-semibold tw-text-slate-900">
                {labelFor(bundle.requestedBy)}
              </span>
            </Cell>
            <Cell label="승인자">
              <span className="tw-text-sm tw-text-slate-700">
                {labelFor(bundle.approverId)}
              </span>
            </Cell>
          </div>
        </div>

        {bundle.status === 'REJECTED' && bundle.rejectionReason && (
          <Alert
            type="error"
            showIcon
            message={<span className="tw-font-semibold">반려됨</span>}
            description={bundle.rejectionReason}
            className="!tw-rounded-xl"
          />
        )}

        {/* 포함된 목표 */}
        <div>
          <div className="tw-flex tw-items-center tw-justify-between tw-mb-2">
            <Text strong className="tw-text-[14px] tw-text-slate-900">
              포함된 목표 {goals.length}개
            </Text>
            {mode === 'reject' && (
              <span className="tw-text-xs tw-text-amber-600">
                문제 목표를 체크박스로 선택하면 요청자에게 표시됩니다 (선택)
              </span>
            )}
          </div>
          <Space direction="vertical" size={6} className="tw-w-full">
            {goals.map((g) => (
              <div key={g.goalId} className="tw-flex tw-items-start tw-gap-2">
                {mode === 'reject' && (
                  <Checkbox
                    checked={affected.includes(g.goalId)}
                    onChange={(e) => {
                      setAffected((prev) =>
                        e.target.checked
                          ? [...prev, g.goalId]
                          : prev.filter((id) => id !== g.goalId)
                      );
                    }}
                    className="tw-mt-4"
                  />
                )}
                <div className="tw-flex-1 tw-min-w-0">
                  <GoalCard goal={g} />
                </div>
              </div>
            ))}
          </Space>
        </div>
        {mode === 'reject' && (
          <div className="tw-rounded-2xl tw-border tw-border-rose-200 tw-bg-rose-50/40 tw-p-4">
            <div className="tw-text-[12px] tw-font-semibold tw-uppercase tw-tracking-wide tw-text-rose-600 tw-mb-2">
              REJECT
            </div>
            <Alert
              type="warning"
              message="반려 시 모든 목표가 DRAFT 로 돌아갑니다."
              className="!tw-mb-3 !tw-rounded-xl"
              showIcon
            />
            <TextArea
              rows={3}
              placeholder="반려 사유 (필수)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              autoFocus
            />
          </div>
        )}

      </div>
    </AppDoubleActionModal>
  );
}

function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="tw-text-[10px] tw-font-semibold tw-uppercase tw-tracking-wide tw-text-slate-400 tw-mb-0.5">
        {label}
      </div>
      <div>{children}</div>
    </div>
  );
}
