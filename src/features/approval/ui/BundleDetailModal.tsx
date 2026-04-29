import { useMemo, useState } from 'react';
import { App, Alert, Card, Checkbox, Input, Modal, Space, Tag, Typography } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemberDisplayNames } from '@/features/members/hooks/useMemberDisplayNames';
import { approvalApi } from '../api/approvalApi';
import type { GoalApprovalBundle } from '../model/types';
import { goalApi } from '@/features/goals/api/goalApi';
import { GoalCard } from '@/features/goals/ui/GoalCard';
import { AppButton } from '@/shared/ui/AppButton';

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
  const [mode, setMode] = useState<'view' | 'reject' | 'delegate'>('view');
  const [reason, setReason] = useState('');
  const [delegateId, setDelegateId] = useState('');
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
    return [bundle.requestedBy, bundle.approverId, bundle.delegateApproverId].filter(Boolean) as string[];
  }, [bundle]);
  const { labelFor } = useMemberDisplayNames(memberIds);

  const reset = () => {
    setMode('view');
    setReason('');
    setDelegateId('');
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

  const delegateMut = useMutation({
    mutationFn: () =>
      approvalApi.delegate(bundle!.bundleId, { delegateApproverId: delegateId }),
    onSuccess: () => {
      message.success('위임되었습니다.');
      invalidate();
      close();
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? '위임 실패'),
  });

  if (!bundle) return null;

  const isApprover =
    bundle.approverId === currentUserId || bundle.delegateApproverId === currentUserId;
  const isPending = bundle.status === 'PENDING';

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

  return (
    <Modal
      open={open}
      onCancel={close}
      title={
        <div className="tw-flex tw-items-center tw-gap-2">
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
      }
      width={760}
      destroyOnHidden
      footer={null}
      classNames={{
        content: '!tw-p-0',
        header: 'tw-sticky tw-top-0 tw-z-10 tw-m-0 tw-border-b tw-border-slate-200 tw-bg-white tw-px-5 tw-py-4',
        body: 'wf-scrollbar-modal !tw-px-5 !tw-py-5',
      }}
      styles={{
        content: { padding: 0 },
        header: { marginBottom: 0, padding: '16px 20px' },
        body: { maxHeight: '70vh', overflowY: 'auto' },
      }}
    >
      <div className="tw-space-y-4">
        {/* 메타 정보 카드 */}
        <Card
          className="tw-rounded-2xl tw-border tw-border-slate-200/90 tw-bg-slate-50/50"
          styles={{ body: { padding: 16 } }}
        >
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
                {bundle.delegateApproverId && (
                  <Tag
                    bordered={false}
                    className="!tw-ml-2 !tw-rounded-full !tw-bg-purple-50 !tw-px-2 !tw-text-[10px] !tw-font-medium !tw-text-purple-700"
                  >
                    위임 → {labelFor(bundle.delegateApproverId)}
                  </Tag>
                )}
              </span>
            </Cell>
          </div>
        </Card>

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

        {/* 액션 영역 */}
        {mode === 'view' && isApprover && isPending && (
          <Card
            className="tw-rounded-2xl tw-border tw-border-indigo-200 tw-bg-indigo-50/40"
            styles={{ body: { padding: 16 } }}
          >
            <div className="tw-flex tw-flex-col sm:tw-flex-row sm:tw-items-center sm:tw-justify-between tw-gap-3">
              <div className="tw-text-sm tw-text-slate-700">결정해주세요.</div>
              <Space>
                <AppButton
                  variant="primary"
                  onClick={() =>
                    modal.confirm({
                      title: '일괄 승인',
                      content: `${bundle.goalIds.length}개 목표를 모두 ACTIVE 로 전환합니다.`,
                      onOk: () => approveMut.mutate(),
                    })
                  }
                >
                  승인
                </AppButton>
                <AppButton variant="danger" onClick={() => setMode('reject')}>
                  반려
                </AppButton>
                <AppButton variant="secondary" onClick={() => setMode('delegate')}>
                  위임
                </AppButton>
              </Space>
            </div>
          </Card>
        )}

        {mode === 'reject' && (
          <Card
            className="tw-rounded-2xl tw-border tw-border-rose-200 tw-bg-rose-50/40"
            styles={{ body: { padding: 16 } }}
          >
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
              className="tw-mb-3"
            />
            <Space>
              <AppButton
                variant="danger"
                disabled={!reason.trim()}
                loading={rejectMut.isPending}
                onClick={() => rejectMut.mutate()}
              >
                반려 확정
              </AppButton>
              <AppButton variant="secondary" onClick={() => setMode('view')}>
                취소
              </AppButton>
            </Space>
          </Card>
        )}

        {mode === 'delegate' && (
          <Card
            className="tw-rounded-2xl tw-border tw-border-purple-200 tw-bg-purple-50/40"
            styles={{ body: { padding: 16 } }}
          >
            <div className="tw-text-[12px] tw-font-semibold tw-uppercase tw-tracking-wide tw-text-purple-600 tw-mb-2">
              DELEGATE
            </div>
            <div className="tw-text-xs tw-text-slate-600 tw-mb-2">
              위임 받은 사람의 큐로 이 요청이 이동합니다.
            </div>
            <Input
              placeholder="위임 받을 승인자 UUID"
              value={delegateId}
              onChange={(e) => setDelegateId(e.target.value)}
              className="tw-mb-3"
            />
            <Space>
              <AppButton
                variant="primary"
                disabled={!delegateId.trim()}
                loading={delegateMut.isPending}
                onClick={() => delegateMut.mutate()}
              >
                위임 확정
              </AppButton>
              <AppButton variant="secondary" onClick={() => setMode('view')}>
                취소
              </AppButton>
            </Space>
          </Card>
        )}
      </div>
    </Modal>
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
