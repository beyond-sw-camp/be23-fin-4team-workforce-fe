import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { App, Card, DatePicker, Input, Space, Table, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import {
  memberChatAdminApi,
  type MemberChatAdminSearchParams,
} from '@/features/member-chat/api/memberChatAdminApi';
import { AppButton } from '@/shared/ui/AppButton';

const { RangePicker } = DatePicker;

export function MemberChatAdminPage() {
  const { message } = App.useApp();
  const [params, setParams] = useState<MemberChatAdminSearchParams>({ size: 100 });
  const [range, setRange] = useState<[string | undefined, string | undefined]>([undefined, undefined]);

  const searchQuery = useQuery({
    queryKey: ['member-chat', 'admin', 'search', params],
    queryFn: () => memberChatAdminApi.search(params),
  });

  const exportMutation = useMutation({
    mutationFn: async () => {
      const blob = await memberChatAdminApi.exportCsv({
        from: params.from,
        to: params.to,
        roomId: params.roomId,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `mc-export-${dayjs().format('YYYYMMDD-HHmmss')}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    },
    onSuccess: () => {
      void message.success('CSV 내보내기가 완료되었습니다.');
    },
    onError: (e) => {
      void message.error((e as Error).message || 'CSV 내보내기에 실패했습니다.');
    },
  });

  const applyHoldMutation = useMutation({
    mutationFn: (body: { roomId?: number; memberId?: string; reason: string; caseId?: string }) =>
      memberChatAdminApi.applyLegalHold(body),
    onSuccess: (res) => {
      void message.success(`Legal Hold 적용 완료${res.holdId ? ` (ID: ${res.holdId})` : ''}`);
    },
    onError: (e) => {
      void message.error((e as Error).message || 'Legal Hold 적용에 실패했습니다.');
    },
  });

  const releaseHoldMutation = useMutation({
    mutationFn: (holdId: number) => memberChatAdminApi.releaseLegalHold(holdId),
    onSuccess: () => {
      void message.success('Legal Hold 해제 완료');
    },
    onError: (e) => {
      void message.error((e as Error).message || 'Legal Hold 해제에 실패했습니다.');
    },
  });

  const [holdRoomId, setHoldRoomId] = useState('');
  const [holdMemberId, setHoldMemberId] = useState('');
  const [holdReason, setHoldReason] = useState('');
  const [holdCaseId, setHoldCaseId] = useState('');
  const [releaseHoldId, setReleaseHoldId] = useState('');

  const columns = useMemo(
    () => [
      {
        title: '메시지ID',
        dataIndex: 'id',
        key: 'id',
        width: 90,
      },
      {
        title: '방ID',
        dataIndex: 'roomId',
        key: 'roomId',
        width: 90,
      },
      {
        title: '발신자',
        dataIndex: 'senderId',
        key: 'senderId',
        width: 230,
      },
      {
        title: '타입',
        dataIndex: 'type',
        key: 'type',
        width: 110,
        render: (v: string) => <Tag>{v}</Tag>,
      },
      {
        title: '내용',
        dataIndex: 'content',
        key: 'content',
        render: (v: string) => <span className="tw-whitespace-pre-wrap">{v}</span>,
      },
      {
        title: '상태',
        key: 'state',
        width: 130,
        render: (_: unknown, row: { deleted: boolean; edited: boolean }) => (
          <Space size={4}>
            {row.deleted ? <Tag color="red">삭제</Tag> : null}
            {row.edited ? <Tag color="blue">수정</Tag> : null}
          </Space>
        ),
      },
      {
        title: '생성시각',
        dataIndex: 'createdAt',
        key: 'createdAt',
        width: 180,
        render: (v: string) => {
          const d = dayjs(v);
          return d.isValid() ? d.format('YYYY-MM-DD HH:mm:ss') : v;
        },
      },
    ],
    [],
  );

  return (
    <Space direction="vertical" className="tw-w-full" size={16}>
      <div>
        <Typography.Title level={4} className="!tw-m-0 !tw-text-slate-900">
          보안·컴플라이언스 조회
        </Typography.Title>
        <Typography.Paragraph type="secondary" className="!tw-mb-0 !tw-mt-1 !tw-text-sm">
          분쟁 대응, 법적 보존, 보안 이슈 대응을 위한 제한적 조회 및 기록 보존 기능입니다.
        </Typography.Paragraph>
      </div>

      <Card className="tw-border-slate-200/80 tw-shadow-sm" title="검색 / 내보내기">
        <Space direction="vertical" className="tw-w-full">
          <Space wrap>
            <RangePicker
              showTime
              onChange={(vals) => {
                const from = vals?.[0]?.toISOString();
                const to = vals?.[1]?.toISOString();
                setRange([from, to]);
              }}
            />
            <Input
              placeholder="Room ID"
              value={params.roomId ?? ''}
              onChange={(e) =>
                setParams((prev) => ({
                  ...prev,
                  roomId: e.target.value.trim() ? Number(e.target.value) : undefined,
                }))
              }
              className="tw-w-[140px]"
            />
            <Input
              placeholder="Sender UUID"
              value={params.senderId ?? ''}
              onChange={(e) =>
                setParams((prev) => ({
                  ...prev,
                  senderId: e.target.value.trim() || undefined,
                }))
              }
              className="tw-w-[240px]"
            />
            <Input
              placeholder="키워드"
              value={params.q ?? ''}
              onChange={(e) =>
                setParams((prev) => ({
                  ...prev,
                  q: e.target.value.trim() || undefined,
                }))
              }
              className="tw-w-[220px]"
            />
            <Input
              placeholder="Size"
              value={params.size ?? 100}
              onChange={(e) =>
                setParams((prev) => ({
                  ...prev,
                  size: e.target.value.trim() ? Number(e.target.value) : 100,
                }))
              }
              className="tw-w-[90px]"
            />
            <AppButton
              onClick={() =>
                setParams((prev) => ({
                  ...prev,
                  from: range[0],
                  to: range[1],
                }))
              }
            >
              검색
            </AppButton>
            <AppButton
              variant="secondary"
              loading={exportMutation.isPending}
              onClick={() => {
                void exportMutation.mutateAsync();
              }}
            >
              CSV 내보내기
            </AppButton>
          </Space>
          <Table
            rowKey="id"
            size="small"
            loading={searchQuery.isLoading}
            dataSource={searchQuery.data ?? []}
            columns={columns}
            pagination={{ pageSize: 20 }}
            scroll={{ x: 1200 }}
          />
        </Space>
      </Card>

      <Card className="tw-border-slate-200/80 tw-shadow-sm" title="Legal Hold 관리">
        <Space direction="vertical" className="tw-w-full">
          <Typography.Text strong>적용</Typography.Text>
          <Space wrap>
            <Input
              placeholder="Room ID (선택)"
              value={holdRoomId}
              onChange={(e) => setHoldRoomId(e.target.value)}
              className="tw-w-[160px]"
            />
            <Input
              placeholder="Member UUID (선택)"
              value={holdMemberId}
              onChange={(e) => setHoldMemberId(e.target.value)}
              className="tw-w-[260px]"
            />
            <Input
              placeholder="Case ID (선택)"
              value={holdCaseId}
              onChange={(e) => setHoldCaseId(e.target.value)}
              className="tw-w-[180px]"
            />
            <Input
              placeholder="Reason (필수)"
              value={holdReason}
              onChange={(e) => setHoldReason(e.target.value)}
              className="tw-w-[280px]"
            />
            <AppButton
              loading={applyHoldMutation.isPending}
              disabled={!holdReason.trim()}
              onClick={() => {
                void applyHoldMutation.mutateAsync({
                  roomId: holdRoomId.trim() ? Number(holdRoomId) : undefined,
                  memberId: holdMemberId.trim() || undefined,
                  caseId: holdCaseId.trim() || undefined,
                  reason: holdReason.trim(),
                });
              }}
            >
              Hold 적용
            </AppButton>
          </Space>

          <Typography.Text strong className="tw-mt-2">
            해제
          </Typography.Text>
          <Space wrap>
            <Input
              placeholder="Hold ID"
              value={releaseHoldId}
              onChange={(e) => setReleaseHoldId(e.target.value)}
              className="tw-w-[160px]"
            />
            <AppButton
              variant="secondary"
              loading={releaseHoldMutation.isPending}
              disabled={!releaseHoldId.trim()}
              onClick={() => {
                void releaseHoldMutation.mutateAsync(Number(releaseHoldId));
              }}
            >
              Hold 해제
            </AppButton>
          </Space>
        </Space>
      </Card>
    </Space>
  );
}
