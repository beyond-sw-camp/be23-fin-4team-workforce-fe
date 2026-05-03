// /app/leave/my-promotion 직원 본인이 받은 연차 사용 촉진 통보 목록
// 회신은 사용계획 날짜 입력 회사 면책 기록만 잔여 차감 없음
import { useMemo, useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
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
import { ArrowLeftOutlined, SendOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { approvalApi } from '@/features/approvals/api/approvalApi';
import { attendanceApi } from '@/features/salary-service/api/attendanceApi';
import type {
  LeavePromotionMy,
  PromotionLogStatusCode,
  PromotionStageCode,
} from '@/features/salary-service/types';
import { PromotionResponseModal } from './components/PromotionResponseModal';

const QK = ['salary', 'leave-promotion', 'my'] as const;

const STAGE_KO: Record<string, string> = { FIRST: '1차', SECOND: '2차' };

function formatDate(iso?: string | null) {
  if (!iso) return '—';
  const d = dayjs(iso);
  return d.isValid() ? d.format('YYYY-MM-DD') : iso;
}

function formatDateTime(iso?: string | null) {
  if (!iso) return '—';
  const d = dayjs(iso);
  return d.isValid() ? d.format('YYYY-MM-DD HH:mm') : iso;
}

function statusTag(status: PromotionLogStatusCode, stage?: PromotionStageCode) {
  if (status === 'ACKNOWLEDGED') return <Tag color="green">회신 완료</Tag>;
  if (status === 'DESIGNATED') return <Tag color="red">회사 자동 지정</Tag>;
  // 2차 + SENT 는 자동 지정 처리 직전/실패 케이스. 1차는 회신 필요.
  if (stage === 'SECOND') return <Tag color="volcano">자동 지정 대기</Tag>;
  return <Tag color="orange">회신 필요</Tag>;
}

// 회신 내역 표 행 한 통보 안의 plannedDates 또는 designatedDates 를 한 행으로 풀어 보여줌
type HistoryRow = {
  rowKey: string;
  rowNo: number;
  promotionLogId: string;
  stage: PromotionStageCode;
  status: PromotionLogStatusCode;
  acknowledgedAt?: string | null;
  plannedDates: string[];
  designationReason?: string | null;
};

export function MyLeavePromotionPage() {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [target, setTarget] = useState<LeavePromotionMy | null>(null);

  const listQ = useQuery({
    queryKey: QK,
    queryFn: () => attendanceApi.leavePromotion.listMy(),
  });

  // 전자결재 휴가신청서 양식 deep link
  const approvalDocsQ = useQuery({
    queryKey: ['approval', 'documents', 'active'],
    queryFn: () => approvalApi.listActiveDocuments(),
  });
  const leaveRequestDocId = useMemo(() => {
    const docs = approvalDocsQ.data ?? [];
    const exact = docs.find((d) => d.documentName.trim() === '휴가 신청서');
    if (exact) return exact.documentId;
    const fuzzy = docs.find(
      (d) => d.documentName.includes('휴가') && d.documentName.includes('신청'),
    );
    return fuzzy?.documentId;
  }, [approvalDocsQ.data]);
  const handleNewLeaveRequest = () => {
    if (leaveRequestDocId) {
      void navigate({
        to: '/app/approvals',
        search: { tab: 'compose', docId: leaveRequestDocId },
      });
      return;
    }
    if (approvalDocsQ.isLoading) {
      message.info('결재 양식을 불러오는 중입니다 잠시 후 다시 시도해 주세요');
      return;
    }
    message.warning('휴가 신청서 양식이 등록되지 않았습니다 전자결재에서 직접 선택해 주세요');
    void navigate({ to: '/app/approvals', search: {} });
  };

  // 같은 만료일에 2차 통보가 이미 있는지 체크 (1차 회신 버튼 비활성화 조건)
  const expirationsWithSecond = useMemo(() => {
    const set = new Set<string>();
    (listQ.data ?? []).forEach((r) => {
      if (r.stage === 'SECOND' && r.balanceExpirationDate) {
        set.add(r.balanceExpirationDate);
      }
    });
    return set;
  }, [listQ.data]);

  const respondM = useMutation({
    mutationFn: ({ id, dates }: { id: string; dates: string[] }) =>
      attendanceApi.leavePromotion.respond(id, { plannedDates: dates }),
    onSuccess: () => {
      message.success('회신이 완료되었습니다');
      setTarget(null);
      void qc.invalidateQueries({ queryKey: QK });
    },
    onError: (e: Error) =>
      message.error(e.message || '회신 처리에 실패했습니다'),
  });

  // 회신 내역 행 ACKNOWLEDGED 는 plannedDates DESIGNATED 는 designatedDates 로 채움
  const historyRows = useMemo<HistoryRow[]>(() => {
    const list = listQ.data ?? [];
    const filtered = list.filter(
      (p) => p.status === 'ACKNOWLEDGED' || p.status === 'DESIGNATED',
    );
    // 통보 단위 1행 dates 는 합쳐서 한 행에 표시
    const sorted = [...filtered].sort((a, b) => {
      const da = a.acknowledgedAt ?? a.sentOn ?? '';
      const db = b.acknowledgedAt ?? b.sentOn ?? '';
      return db.localeCompare(da);
    });
    return sorted.map((p, idx) => {
      const dates =
        p.status === 'DESIGNATED'
          ? p.designatedDates ?? []
          : p.plannedDates ?? [];
      return {
        rowKey: p.promotionLogId,
        rowNo: idx + 1,
        promotionLogId: p.promotionLogId,
        stage: p.stage,
        status: p.status,
        acknowledgedAt: p.acknowledgedAt,
        plannedDates: dates,
        designationReason: p.designationReason ?? null,
      };
    });
  }, [listQ.data]);

  const historyColumns = useMemo<ColumnsType<HistoryRow>>(
    () => [
      {
        title: 'No',
        dataIndex: 'rowNo',
        key: 'rowNo',
        width: 60,
        align: 'center',
      },
      {
        title: '단계',
        dataIndex: 'stage',
        key: 'stage',
        width: 70,
        align: 'center',
        render: (s: PromotionStageCode) => (
          <Tag color={s === 'FIRST' ? 'blue' : 'volcano'}>
            {STAGE_KO[s] ?? s}
          </Tag>
        ),
      },
      {
        title: '상태',
        dataIndex: 'status',
        key: 'status',
        width: 110,
        align: 'center',
        render: (_: PromotionLogStatusCode, r) => statusTag(r.status, r.stage),
      },
      {
        title: '회신 시각',
        dataIndex: 'acknowledgedAt',
        key: 'acknowledgedAt',
        width: 160,
        render: (d?: string | null) => formatDateTime(d),
      },
      {
        title: '계획 일자 (또는 지정 일자)',
        dataIndex: 'plannedDates',
        key: 'plannedDates',
        render: (dates: string[]) =>
          dates.length === 0 ? (
            <Typography.Text type="secondary">—</Typography.Text>
          ) : (
            <Space size={4} wrap>
              {dates.map((d) => (
                <Tag key={d}>{formatDate(d)}</Tag>
              ))}
            </Space>
          ),
      },
      {
        title: '일수',
        key: 'count',
        width: 70,
        align: 'right',
        render: (_, r) =>
          r.plannedDates.length > 0 ? `${r.plannedDates.length}일` : '—',
      },
      {
        title: '사유',
        dataIndex: 'designationReason',
        key: 'designationReason',
        ellipsis: true,
        render: (v?: string | null) =>
          v && v.length > 0 ? (
            v
          ) : (
            <Typography.Text type="secondary">—</Typography.Text>
          ),
      },
    ],
    [],
  );

  const columns = useMemo<ColumnsType<LeavePromotionMy>>(
    () => [
      {
        title: '단계',
        dataIndex: 'stage',
        key: 'stage',
        width: 80,
        render: (s: PromotionStageCode) => (
          <Tag color={s === 'FIRST' ? 'blue' : 'volcano'}>
            {STAGE_KO[s] ?? s}
          </Tag>
        ),
      },
      {
        title: '상태',
        dataIndex: 'status',
        key: 'status',
        width: 120,
        render: (_: PromotionLogStatusCode, r) => statusTag(r.status, r.stage),
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
        title: '발송일',
        dataIndex: 'sentOn',
        key: 'sentOn',
        width: 120,
        render: (d: string) => formatDate(d),
      },
      {
        title: '회신 시각',
        dataIndex: 'acknowledgedAt',
        key: 'acknowledgedAt',
        width: 160,
        render: (d: string | null) => formatDateTime(d),
      },
      {
        title: '진행',
        key: 'actions',
        width: 160,
        render: (_, r) => {
          // 1차 + SENT 만 회신 가능. 단, 같은 만료일에 2차가 이미 발송되었다면 회신 기간 종료
          if (r.status === 'SENT' && r.stage === 'FIRST') {
            const supersededBySecond = r.balanceExpirationDate
              ? expirationsWithSecond.has(r.balanceExpirationDate)
              : false;
            if (supersededBySecond) {
              return (
                <Typography.Text type="secondary" className="!tw-text-xs">
                  회신 기간 종료 (2차 발송)
                </Typography.Text>
              );
            }
            return (
              <Button type="primary" size="small" onClick={() => setTarget(r)}>
                회신하기
              </Button>
            );
          }
          if (r.status === 'ACKNOWLEDGED') {
            return <Typography.Text type="secondary" className="!tw-text-xs">회신 완료</Typography.Text>;
          }
          if (r.status === 'DESIGNATED') {
            return <Typography.Text type="secondary" className="!tw-text-xs">회사 자동 지정 완료</Typography.Text>;
          }
          // 2차 + SENT (자동 지정 진행 중/실패)
          return <Typography.Text type="secondary" className="!tw-text-xs">자동 지정 처리중</Typography.Text>;
        },
      },
    ],
    [expirationsWithSecond],
  );

  return (
    <Space direction="vertical" className="tw-w-full" size={16}>
      <div className="tw-flex tw-flex-wrap tw-items-start tw-justify-between tw-gap-3">
        <div>
          <Typography.Title level={4} className="!tw-m-0 !tw-text-slate-900">
            휴가 계획 회신
          </Typography.Title>
          <Typography.Paragraph
            type="secondary"
            className="!tw-mb-0 !tw-mt-1 !tw-text-sm"
          >
            회사가 보낸 연차 사용 촉진 통보 목록입니다 회신은 사용 계획 확인용이며 실제 휴가 사용일과 무관합니다
          </Typography.Paragraph>
        </div>
        <Space size="small" wrap>
          <Link to="/app/leave">
            <Button icon={<ArrowLeftOutlined />}>휴가 계획 관리</Button>
          </Link>
          <Button
            type="primary"
            icon={<SendOutlined />}
            onClick={handleNewLeaveRequest}
            loading={approvalDocsQ.isLoading}
          >
            휴가 신청
          </Button>
        </Space>
      </div>

      <Alert
        type="info"
        showIcon
        message="안내"
        description={
          <span style={{ whiteSpace: 'pre-line' }}>
            {[
              '1차 통보에 사용 계획을 회신하면 회사 촉진 의무가 완료됩니다.',
              '회신 후 그 날짜에 실제로 안 써도 무방하며, 실제 휴가는 별도 신청해주세요.',
              '1차 회신 없이 2차 시점이 되면 근로기준법 61조에 따라 회사가 만료일 직전 평일을 자동으로 지정합니다 (노무수령 거부).',
            ].join('\n')}
          </span>
        }
      />

      <Card className="tw-border-slate-200/80 tw-shadow-sm" title="받은 통보">
        <Table<LeavePromotionMy>
          rowKey={(r) => r.promotionLogId}
          loading={listQ.isLoading}
          columns={columns}
          dataSource={listQ.data ?? []}
          pagination={{ pageSize: 10 }}
          locale={{
            emptyText: <Empty description="받은 통보가 없습니다" />,
          }}
        />
      </Card>

      <Card
        className="tw-border-slate-200/80 tw-shadow-sm"
        title={
          <Space>
            <span>회신 내역</span>
            <Typography.Text type="secondary" className="tw-text-xs">
              회신 완료 또는 강제 지정된 통보의 사용 계획 일자 목록
            </Typography.Text>
          </Space>
        }
      >
        <Table<HistoryRow>
          rowKey={(r) => r.rowKey}
          loading={listQ.isLoading}
          columns={historyColumns}
          dataSource={historyRows}
          pagination={{ pageSize: 10 }}
          size="small"
          locale={{
            emptyText: <Empty description="회신 또는 강제 지정 이력이 없습니다" />,
          }}
        />
      </Card>

      <PromotionResponseModal
        target={target}
        confirmLoading={respondM.isPending}
        onCancel={() => setTarget(null)}
        onSubmit={(dates) =>
          respondM.mutate({ id: target!.promotionLogId, dates })
        }
      />
    </Space>
  );
}
