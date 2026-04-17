import { CheckOutlined, CloseOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { App, Button, Card, Descriptions, Input, List, Modal, Space, Spin, Table, Tag, Typography } from 'antd';
import { goalApi } from '@/features/goals/api/goalApi';
import type { Goal } from '@/features/goals/model/types';
import {
  MEMBER_DISPLAY_LABEL_UNKNOWN,
  useMemberDisplayNames,
} from '@/features/members/hooks/useMemberDisplayNames';

const { Title, Text } = Typography;

function parseEvidenceNames(raw: string | null | undefined): string[] {
  if (!raw || raw.trim() === '') return [];
  try {
    const parsed = JSON.parse(raw) as Array<{ name?: string }>;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((x) => String(x?.name ?? '').trim()).filter((x) => x.length > 0);
  } catch {
    return raw.split(',').map((x) => x.trim()).filter((x) => x.length > 0);
  }
}

function goalColumns(memberLabel: (id: string) => string) {
  return [
    { title: '제목', dataIndex: 'title', key: 'title', ellipsis: true },
    {
      title: '담당',
      key: 'owner',
      width: 160,
      render: (_: unknown, g: Goal) => memberLabel(g.ownerId ?? ''),
    },
    {
      title: '목표값',
      key: 'target',
      width: 120,
      render: (_: unknown, g: Goal) =>
        g.targetValue != null ? `${g.targetValue}${g.unitLabel ? ` ${g.unitLabel}` : ''}` : '—',
    },
    {
      title: '기간',
      key: 'period',
      width: 220,
      render: (_: unknown, g: Goal) =>
        g.startDate && g.endDate ? `${g.startDate} ~ ${g.endDate}` : '—',
    },
  ];
}

function approvalStatusUi(status?: string) {
  const s = String(status ?? 'pending').toLowerCase();
  if (s === 'approved') return { text: '승인 완료', color: 'success' as const, chip: 'tw-bg-emerald-50 tw-text-emerald-700' };
  if (s === 'rejected') return { text: '반려', color: 'error' as const, chip: 'tw-bg-rose-50 tw-text-rose-700' };
  return { text: '승인 대기', color: 'processing' as const, chip: 'tw-bg-amber-50 tw-text-amber-700' };
}

export type GoalApprovalDetailViewProps = {
  requestId: string;
  /** 승인/반려 후 목록 갱신·부모 모달 닫기 등 */
  onClose?: () => void;
  /** true일 때만 승인/반려 액션 표시 */
  showDecisionActions?: boolean;
};

export function GoalApprovalDetailView({
  requestId,
  onClose,
  showDecisionActions = true,
}: GoalApprovalDetailViewProps) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const detailQuery = useQuery({
    queryKey: ['goal-approval', requestId],
    queryFn: () => goalApi.getApprovalRequest(requestId),
    enabled: Boolean(requestId),
  });

  const approverIds = detailQuery.data?.approverId ? [detailQuery.data.approverId] : [];
  const ownerIds = detailQuery.data?.goals?.map((g) => g.ownerId) ?? [];
  const { labelFor } = useMemberDisplayNames([...approverIds, ...ownerIds]);

  const invalidateApprovalLists = () => {
    void queryClient.invalidateQueries({ queryKey: ['goal-approvals'] });
  };

  const approveMut = useMutation({
    mutationFn: () => goalApi.approveApprovalRequest(requestId, {}),
    onSuccess: () => {
      message.success('승인되었습니다.');
      void queryClient.invalidateQueries({ queryKey: ['goal-approval', requestId] });
      void queryClient.invalidateQueries({ queryKey: ['goals'] });
      invalidateApprovalLists();
      onClose?.();
    },
    onError: () => message.error('승인 처리에 실패했습니다.'),
  });

  const rejectMut = useMutation({
    mutationFn: (reason: string) => goalApi.rejectApprovalRequest(requestId, { reason }),
    onSuccess: () => {
      message.success('반려되었습니다.');
      void queryClient.invalidateQueries({ queryKey: ['goal-approval', requestId] });
      void queryClient.invalidateQueries({ queryKey: ['goals'] });
      invalidateApprovalLists();
      onClose?.();
    },
    onError: () => message.error('반려 처리에 실패했습니다.'),
  });

  if (!requestId) {
    return <Text type="danger">요청 ID가 없습니다.</Text>;
  }

  const d = detailQuery.data;

  if (detailQuery.isLoading) {
    return <Spin className="tw-w-full tw-py-16 tw-flex tw-justify-center" />;
  }
  if (detailQuery.isError || !d) {
    return <Card>완료 제출 승인 요청을 불러올 수 없습니다.</Card>;
  }

  return (
    <>
      <div className="tw-space-y-4">
        <Card size="small">
          <Space direction="vertical" size="small" className="tw-w-full">
            <Title level={5} className="!tw-mb-0">
              요약
            </Title>
            <Space wrap>
              {(() => {
                const u = approvalStatusUi(d.status);
                return <Tag color={u.color}>{u.text}</Tag>;
              })()}
              {d.approvalKind && (
                <Tag color={d.approvalKind === 'ACTIVATION' ? 'blue' : 'green'}>
                  {d.approvalKind === 'ACTIVATION' ? '활성화 승인' : '종료 승인'}
                </Tag>
              )}
              <Text type="secondary">포함 목표 {d.goals.length}건</Text>
            </Space>
            {d.rejectionReason ? <Text type="danger">사유: {d.rejectionReason}</Text> : null}
          </Space>
        </Card>

        <div className="tw-grid tw-grid-cols-1 lg:tw-grid-cols-2 tw-gap-4">
          <Card title="요청에 포함된 목표" size="small">
            <Table<Goal>
              size="small"
              pagination={false}
              scroll={{ x: 'max-content' }}
              rowKey="id"
              dataSource={d.goals}
              columns={goalColumns((id) => labelFor(id) ?? MEMBER_DISPLAY_LABEL_UNKNOWN)}
            />
          </Card>
          <Card title={d.approvalKind === 'ACTIVATION' ? '활성화 승인자' : '승인자'} size="small">
            <List
              size="small"
              dataSource={d.approverId ? [d.approverId] : []}
              renderItem={(approverId) => {
                const dec = d.decision ?? 'PENDING';
                const u = approvalStatusUi(dec);
                return (
                  <List.Item className="!tw-px-0">
                    <div className="tw-w-full tw-rounded-xl tw-border tw-border-slate-200 tw-bg-white tw-px-3 tw-py-2.5">
                      <div className="tw-flex tw-items-center tw-justify-between tw-gap-2">
                        <Text strong>{labelFor(approverId) ?? approverId.slice(0, 8)}</Text>
                        <span
                          className={`tw-inline-flex tw-items-center tw-rounded-full tw-px-2 tw-py-0.5 tw-text-xs tw-font-semibold ${u.chip}`}
                        >
                          {u.text}
                        </span>
                      </div>
                      {d.decidedAt ? (
                        <div className="tw-mt-1 tw-text-[11px] tw-text-slate-500">{d.decidedAt}</div>
                      ) : null}
                      {d.comment ? <div className="tw-mt-1.5 tw-text-xs tw-text-slate-600">{d.comment}</div> : null}
                    </div>
                  </List.Item>
                );
              }}
            />
            {d.watchers && d.watchers.length > 0 ? (
              <Descriptions size="small" column={1} title="참조 멤버" className="tw-mt-4">
                {d.watchers.map((w) => (
                  <Descriptions.Item key={w.memberId} label="멤버">
                    {labelFor(w.memberId) ?? w.memberId}
                  </Descriptions.Item>
                ))}
              </Descriptions>
            ) : null}
          </Card>
        </div>

        {d.completionSummary || d.completionEvidenceFiles ? (
          <Card title="완료 제출 내용" size="small">
            {d.completionSummary ? (
              <div className="tw-mb-3">
                <Text strong>완료 보고 요약</Text>
                <div className="tw-mt-1 tw-whitespace-pre-wrap tw-text-sm tw-text-slate-700">{d.completionSummary}</div>
              </div>
            ) : null}
            {d.completionEvidenceFiles ? (
              <div>
                <Text strong>첨부 파일</Text>
                <div className="tw-mt-1 tw-space-y-1">
                  {parseEvidenceNames(d.completionEvidenceFiles).map((name) => (
                    <div key={name} className="tw-text-sm tw-text-slate-700">
                      - {name}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </Card>
        ) : null}

        {showDecisionActions && (d.status ?? '').toUpperCase() === 'PENDING' ? (
          <Card size="small">
            <Space wrap>
              <Button
                type="primary"
                icon={<CheckOutlined />}
                loading={approveMut.isPending}
                onClick={() => approveMut.mutate()}
              >
                승인
              </Button>
              <Button danger icon={<CloseOutlined />} onClick={() => setRejectOpen(true)}>
                반려
              </Button>
            </Space>
          </Card>
        ) : null}
      </div>

      <Modal
        title="반려 사유"
        open={rejectOpen}
        onCancel={() => setRejectOpen(false)}
        confirmLoading={rejectMut.isPending}
        onOk={() => {
          rejectMut.mutate(rejectReason.trim() || '반려', {
            onSettled: () => {
              setRejectOpen(false);
              setRejectReason('');
            },
          });
        }}
      >
        <Input.TextArea
          rows={4}
          value={rejectReason}
          onChange={(e) => setRejectReason(e.target.value)}
          placeholder="요청자에게 전달할 사유를 입력하세요."
        />
      </Modal>
    </>
  );
}
