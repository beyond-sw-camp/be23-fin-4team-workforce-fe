// /app/leave/promotion-no-response 관리자 미응답자 강제 지정 페이지
// 2차 통보 후 10일 경과 + 미회신 직원만 노출 강제 지정 시 LeaveRequest 자동 생성 잔여 차감
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  App,
  Button,
  Card,
  DatePicker,
  Empty,
  Space,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { membersApi } from '@/features/members/api/membersApi';
import type { Member } from '@/features/members/model/types';
import { attendanceApi } from '@/features/salary-service/api/attendanceApi';
import type {
  LeavePromotionHistory,
  LeavePromotionNoResponse,
} from '@/features/salary-service/types';

const QK = ['salary', 'leave-promotion', 'no-response'] as const;

function formatDate(iso?: string | null) {
  if (!iso) return '—';
  const d = dayjs(iso);
  return d.isValid() ? d.format('YYYY-MM-DD') : iso;
}

export function AdminLeavePromotionNoResponsePage() {
  const { message } = App.useApp();
  const qc = useQueryClient();

  const listQ = useQuery({
    queryKey: QK,
    queryFn: () => attendanceApi.leavePromotion.listNoResponse(),
  });

  // 회신 완료 + 강제 지정 이력
  const historyQ = useQuery({
    queryKey: ['salary', 'leave-promotion', 'history'] as const,
    queryFn: () => attendanceApi.leavePromotion.listHistory(),
  });

  // 시연용 — 촉진 배치 즉시 실행
  const [triggerDate, setTriggerDate] = useState<dayjs.Dayjs>(() => dayjs());
  const triggerM = useMutation({
    mutationFn: (d: string) => attendanceApi.leavePromotion.runBatch(d),
    onSuccess: (res) => {
      void message.success(
        `배치 실행 완료 — 1차 ${res.firstSent}건, 2차 ${res.secondSent}건, skip ${res.skipped}`,
      );
      void qc.invalidateQueries({ queryKey: QK });
      void qc.invalidateQueries({ queryKey: ['salary', 'leave-promotion', 'history'] });
    },
    onError: (e: Error) => message.error(e.message || '배치 실행 실패'),
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
        title: '알림 단계',
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
    ],
    [memberMap],
  );

  const firstNoticeRows = useMemo(
    () => (historyQ.data ?? []).filter((r) => r.stage === 'FIRST'),
    [historyQ.data],
  );
  const secondNoticeRows = useMemo(
    () => (historyQ.data ?? []).filter((r) => r.stage === 'SECOND'),
    [historyQ.data],
  );

  const renderEmployeeCell = (id: string) => {
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
          <div className="tw-text-xs tw-text-slate-500">{m.department}</div>
        ) : null}
      </div>
    );
  };

  // 1차/2차 알림 현황 컬럼
  const noticeColumns = useMemo<ColumnsType<LeavePromotionHistory>>(
    () => [
      { title: '직원', dataIndex: 'memberId', key: 'memberId', width: 200, render: renderEmployeeCell },
      { title: '단계', dataIndex: 'stage', key: 'stage', width: 70,
        render: (s: string) => <Tag color="geekblue">{s === 'FIRST' ? '1차' : '2차'}</Tag> },
      {
        title: '상태',
        dataIndex: 'status',
        key: 'status',
        width: 120,
        render: (s: string) =>
          s === 'ACKNOWLEDGED' ? <Tag color="green">회신 완료</Tag> : <Tag>{s}</Tag>,
      },
      { title: '잔여 / 만료', key: 'balance', width: 160,
        render: (_, r) => (
          <div className="tw-text-xs">
            <div>{r.remainingDays != null ? `${r.remainingDays}일 남음` : '—'}</div>
            <div className="tw-text-slate-500">{formatDate(r.balanceExpirationDate)} 만료</div>
          </div>
        ) },
      { title: '회신 시점', dataIndex: 'acknowledgedAt', key: 'acknowledgedAt', width: 150,
        render: (v?: string | null) => v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '—' },
      { title: '직원이 신청한 사용 예정일', key: 'plannedDates',
        render: (_, r) => (
          <Space size={4} wrap>
            {(r.plannedDates ?? []).map((d) => (
              <Tag key={d} color="green">{d}</Tag>
            ))}
            {(!r.plannedDates || r.plannedDates.length === 0) && (
              <Typography.Text type="secondary" className="!tw-text-xs">계획 미입력</Typography.Text>
            )}
          </Space>
        ) },
    ],
    // renderEmployeeCell 은 stable 가정 — memberMap 만 의존
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [memberMap],
  );

  const expiryRows = useMemo(
    () =>
      [...(historyQ.data ?? []), ...(listQ.data ?? []).map((r) => ({
        ...r,
        status: 'SENT',
      }))].sort((a, b) => {
        const aDate = dayjs(a.balanceExpirationDate);
        const bDate = dayjs(b.balanceExpirationDate);
        if (!aDate.isValid() && !bDate.isValid()) return 0;
        if (!aDate.isValid()) return 1;
        if (!bDate.isValid()) return -1;
        return aDate.valueOf() - bDate.valueOf();
      }),
    [historyQ.data, listQ.data],
  );

  const expiryColumns = useMemo<ColumnsType<LeavePromotionHistory & { status?: string }>>(
    () => [
      { title: '직원', dataIndex: 'memberId', key: 'memberId', width: 200, render: renderEmployeeCell },
      { title: '단계', dataIndex: 'stage', key: 'stage', width: 70,
        render: (s: string) => <Tag color={s === 'FIRST' ? 'geekblue' : 'volcano'}>{s === 'FIRST' ? '1차' : '2차'}</Tag> },
      {
        title: '알림 상태',
        dataIndex: 'status',
        key: 'status',
        width: 110,
        render: (s?: string) => {
          if (s === 'ACKNOWLEDGED') return <Tag color="green">회신 완료</Tag>;
          if (s === 'SENT') return <Tag color="orange">미회신</Tag>;
          return <Tag>{s ?? '—'}</Tag>;
        },
      },
      { title: '잔여 연차', key: 'remainingDays', dataIndex: 'remainingDays', width: 100,
        render: (n?: number | null) => (typeof n === 'number' ? `${n}일` : '—'),
      },
      {
        title: '사용기한(만료일)',
        dataIndex: 'balanceExpirationDate',
        key: 'balanceExpirationDate',
        width: 180,
        render: (v?: string | null) => {
          if (!v) return '—';
          const d = dayjs(v);
          if (!d.isValid()) return v;
          const diff = d.startOf('day').diff(dayjs().startOf('day'), 'day');
          const tone = diff < 0 ? 'red' : diff <= 30 ? 'orange' : 'blue';
          const suffix = diff < 0 ? `${Math.abs(diff)}일 지남` : diff === 0 ? 'D-day' : `D-${diff}`;
          return <Tag color={tone}>{`${d.format('YYYY-MM-DD')} (${suffix})`}</Tag>;
        },
      },
      {
        title: '알림 발송일',
        dataIndex: 'sentOn',
        key: 'sentOn',
        width: 130,
        render: (v?: string) => formatDate(v),
      },
      { title: '회신 시점', dataIndex: 'acknowledgedAt', key: 'acknowledgedAt', width: 150,
        render: (v?: string | null) => (v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '—') },
      { title: '사용 계획일', key: 'plannedDates',
        render: (_, r) => (
          <Space size={4} wrap>
            {(r.plannedDates ?? []).map((d) => (
              <Tag key={d} color="green">{d}</Tag>
            ))}
            {(!r.plannedDates || r.plannedDates.length === 0) && (
              <Typography.Text type="secondary" className="!tw-text-xs">—</Typography.Text>
            )}
          </Space>
        ) },
    ],
    [memberMap],
  );

  return (
    <Space direction="vertical" className="tw-w-full" size={16}>
      <div className="tw-flex tw-flex-wrap tw-items-start tw-justify-between tw-gap-3">
        <div>
          <Typography.Title level={4} className="!tw-m-0 !tw-text-slate-900">
            연차 촉진 제도 알림 현황
          </Typography.Title>
          <Typography.Paragraph
            type="secondary"
            className="!tw-mb-0 !tw-mt-1 !tw-text-sm"
          >
            연차 사용 촉진 제도의 1차/2차 알림 현황과 직원별 연차 사용기한(만료일) 현황을 조회합니다.
            매일 06:30 자동 배치가 만료 임박 잔고에 통보를 발송합니다.
          </Typography.Paragraph>
        </div>
        <Space>
          <DatePicker
            value={triggerDate}
            allowClear={false}
            format="YYYY-MM-DD"
            onChange={(d) => d && setTriggerDate(d)}
          />
          <Tooltip title="시연·점검용 — 선택한 일자 기준으로 만료 임박 잔고를 찾아 통보 발송">
            <Button
              type="primary"
              loading={triggerM.isPending}
              onClick={() => triggerM.mutate(triggerDate.format('YYYY-MM-DD'))}
            >
              촉진 배치 실행
            </Button>
          </Tooltip>
        </Space>
      </div>

      <Tabs
        defaultActiveKey="no-response"
        items={[
          {
            key: 'no-response',
            label: `2차 미회신 (${listQ.data?.length ?? 0})`,
            children: (
              <>
                <Alert
                  type="info"
                  showIcon
                  className="tw-mb-3"
                  message="2차 통보 후 미회신 대상"
                  description="2차 통보 후 10일 이상 경과한 미응답자 목록입니다. 강제지정 기능은 제외되었습니다."
                />
                <Card className="tw-border-slate-200/80 tw-shadow-sm">
                  <Table<LeavePromotionNoResponse>
                    rowKey={(r) => r.promotionLogId}
                    loading={listQ.isLoading || membersQ.isLoading}
                    columns={columns}
                    dataSource={listQ.data ?? []}
                    pagination={{ pageSize: 20 }}
                    locale={{
                      emptyText: <Empty description="2차 미회신 대상이 없습니다" />,
                    }}
                  />
                </Card>
              </>
            ),
          },
          {
            key: 'first-notice',
            label: `1차 알림 현황 (${firstNoticeRows.length})`,
            children: (
              <Card className="tw-border-slate-200/80 tw-shadow-sm">
                <Table<LeavePromotionHistory>
                  rowKey={(r) => r.promotionLogId}
                  loading={historyQ.isLoading || membersQ.isLoading}
                  columns={noticeColumns}
                  dataSource={firstNoticeRows}
                  pagination={{ pageSize: 20 }}
                  locale={{
                    emptyText: <Empty description="1차 알림 이력이 없습니다" />,
                  }}
                />
              </Card>
            ),
          },
          {
            key: 'second-notice',
            label: `2차 알림 현황 (${secondNoticeRows.length})`,
            children: (
              <Card className="tw-border-slate-200/80 tw-shadow-sm">
                <Table<LeavePromotionHistory>
                  rowKey={(r) => r.promotionLogId}
                  loading={historyQ.isLoading || membersQ.isLoading}
                  columns={noticeColumns}
                  dataSource={secondNoticeRows}
                  pagination={{ pageSize: 20 }}
                  locale={{
                    emptyText: <Empty description="2차 알림 이력이 없습니다" />,
                  }}
                />
              </Card>
            ),
          },
          {
            key: 'expiry-status',
            label: `연차 사용기한 현황 (${expiryRows.length})`,
            children: (
              <Card className="tw-border-slate-200/80 tw-shadow-sm">
                <Table<LeavePromotionHistory & { status?: string }>
                  rowKey={(r) => r.promotionLogId}
                  loading={historyQ.isLoading || listQ.isLoading || membersQ.isLoading}
                  columns={expiryColumns}
                  dataSource={expiryRows}
                  pagination={{ pageSize: 20 }}
                  locale={{
                    emptyText: <Empty description="연차 사용기한 현황이 없습니다" />,
                  }}
                />
              </Card>
            ),
          },
        ]}
      />
    </Space>
  );
}
