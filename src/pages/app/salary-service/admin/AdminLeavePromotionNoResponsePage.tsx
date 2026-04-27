// /app/leave/promotion-no-response 관리자 미응답자 강제 지정 페이지
// 2차 통보 후 10일 경과 + 미회신 직원만 노출 강제 지정 시 LeaveRequest 자동 생성 잔여 차감
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  App,
  Button,
  Card,
  Empty,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { membersApi } from '@/features/members/api/membersApi';
import type { Member } from '@/features/members/model/types';
import { attendanceApi } from '@/features/salary-service/api/attendanceApi';
import type { LeavePromotionNoResponse } from '@/features/salary-service/types';
import { LeaveDesignateModal } from './components/LeaveDesignateModal';

const QK = ['salary', 'leave-promotion', 'no-response'] as const;

function formatDate(iso?: string | null) {
  if (!iso) return '—';
  const d = dayjs(iso);
  return d.isValid() ? d.format('YYYY-MM-DD') : iso;
}

export function AdminLeavePromotionNoResponsePage() {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [target, setTarget] = useState<LeavePromotionNoResponse | null>(null);

  const listQ = useQuery({
    queryKey: QK,
    queryFn: () => attendanceApi.leavePromotion.listNoResponse(),
  });

  // 직원 이름 매핑용 회사 멤버 목록 5분 캐시
  const membersQ = useQuery({
    queryKey: ['members', 'list', 'leave-promotion-name-map'],
    queryFn: () => membersApi.list({ page: 1, pageSize: 1000 }),
    staleTime: 5 * 60 * 1000,
  });

  const memberMap = useMemo(() => {
    const map = new Map<string, Member>();
    membersQ.data?.items.forEach((m) => map.set(m.id, m));
    return map;
  }, [membersQ.data]);

  const designateM = useMutation({
    mutationFn: ({
      id,
      dates,
      reason,
    }: {
      id: string;
      dates: string[];
      reason: string;
    }) =>
      attendanceApi.leavePromotion.designate(id, { dates, reason }),
    onSuccess: () => {
      message.success('강제 지정이 완료되었습니다');
      setTarget(null);
      void qc.invalidateQueries({ queryKey: QK });
    },
    onError: (e: Error) =>
      message.error(e.message || '강제 지정에 실패했습니다'),
  });

  const columns = useMemo<ColumnsType<LeavePromotionNoResponse>>(
    () => [
      {
        title: '직원',
        dataIndex: 'memberId',
        key: 'memberId',
        width: 220,
        render: (id: string) => {
          const m = memberMap.get(id);
          if (!m) {
            return (
              <Typography.Text type="secondary" className="!tw-text-xs">
                {id.slice(0, 8)}…
              </Typography.Text>
            );
          }
          return (
            <div className="tw-leading-tight">
              <div className="tw-font-medium tw-text-slate-900">{m.name}</div>
              {m.department ? (
                <div className="tw-text-xs tw-text-slate-500">
                  {m.department}
                </div>
              ) : null}
            </div>
          );
        },
      },
      {
        title: '단계',
        dataIndex: 'stage',
        key: 'stage',
        width: 80,
        render: () => <Tag color="volcano">2차</Tag>,
      },
      {
        title: '잔여 연차',
        dataIndex: 'remainingDays',
        key: 'remainingDays',
        width: 110,
        render: (n: number | null) =>
          typeof n === 'number' ? `${n}일` : '—',
      },
      {
        title: '만료일',
        dataIndex: 'balanceExpirationDate',
        key: 'balanceExpirationDate',
        width: 130,
        render: (d: string | null) => formatDate(d),
      },
      {
        title: '2차 통보 발송일',
        dataIndex: 'sentOn',
        key: 'sentOn',
        width: 140,
        render: (d: string) => formatDate(d),
      },
      {
        title: '경과일',
        dataIndex: 'daysSinceSent',
        key: 'daysSinceSent',
        width: 100,
        render: (n: number) => (
          <Tag color={n >= 30 ? 'red' : 'orange'}>{n}일 경과</Tag>
        ),
      },
      {
        title: '액션',
        key: 'actions',
        width: 130,
        render: (_, r) => (
          <Button danger size="small" onClick={() => setTarget(r)}>
            강제 지정
          </Button>
        ),
      },
    ],
    [memberMap],
  );

  return (
    <Space direction="vertical" className="tw-w-full" size={16}>
      <div>
        <Typography.Title level={4} className="!tw-m-0 !tw-text-slate-900">
          연차 통보 미응답자 관리
        </Typography.Title>
        <Typography.Paragraph
          type="secondary"
          className="!tw-mb-0 !tw-mt-1 !tw-text-sm"
        >
          1차 2차 통보 후에도 회신하지 않은 직원 목록입니다 회사가 직접 연차일을 지정하여 노무수령 거부 절차를 진행할 수 있습니다
        </Typography.Paragraph>
      </div>

      <Alert
        type="info"
        showIcon
        message="강제 지정 가능 시점"
        description="2차 통보 후 10일 경과한 미응답자만 노출됩니다. 강제 지정 시 연차가 차감됩니다. 직원 알림도 함께 발송됩니다."
      />

      <Card className="tw-border-slate-200/80 tw-shadow-sm">
        <Table<LeavePromotionNoResponse>
          rowKey={(r) => r.promotionLogId}
          loading={listQ.isLoading || membersQ.isLoading}
          columns={columns}
          dataSource={listQ.data ?? []}
          pagination={{ pageSize: 20 }}
          locale={{
            emptyText: <Empty description="강제 지정 가능한 미응답자가 없습니다" />,
          }}
        />
      </Card>

      <LeaveDesignateModal
        target={target}
        memberName={target ? memberMap.get(target.memberId)?.name : undefined}
        confirmLoading={designateM.isPending}
        onCancel={() => setTarget(null)}
        onSubmit={(dates, reason) =>
          designateM.mutate({
            id: target!.promotionLogId,
            dates,
            reason,
          })
        }
      />
    </Space>
  );
}
