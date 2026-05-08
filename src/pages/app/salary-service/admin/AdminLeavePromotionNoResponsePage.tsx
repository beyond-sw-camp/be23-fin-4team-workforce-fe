// /app/leave/promotion-no-response 관리자 미응답자 강제 지정 페이지
// 2차 통보 후 10일 경과 + 미회신 직원만 노출 강제 지정 시 LeaveRequest 자동 생성 잔여 차감
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert, App, Button, Card, DatePicker, Empty, Input, Modal, Select, Space, Tabs, Tag, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { membersApi } from '@/features/members/api/membersApi';
import type { Member } from '@/features/members/model/types';
import { attendanceApi } from '@/features/salary-service/api/attendanceApi';
import { AppWorkspacePageTitle } from '@/shared/ui/AppWorkspacePageTitle';
import { AppSearchBar } from '@/shared/ui';
import { AppDataTable } from '@/shared/ui/AppDataTable';
import { AppTabLabel } from '@/shared/ui/AppTabLabel';

import type {
  LeavePromotionHistory,
  LeavePromotionNoResponse,
} from '@/features/salary-service/types';

const QK = ['salary', 'leave-promotion', 'no-response'] as const;
const PROMOTION_CONTENT_CARD_CLASS =
  'tw-overflow-hidden tw-rounded-2xl tw-border-slate-200/80 tw-bg-white tw-shadow-[0_1px_3px_rgba(15,23,42,0.06)] [&_.ant-card-body]:tw-px-5 [&_.ant-card-body]:tw-pb-8 [&_.ant-card-body]:tw-pt-6 sm:[&_.ant-card-body]:tw-px-7';
const PROMOTION_PRIMARY_BUTTON_CLASS =
  '!tw-h-11 !tw-rounded-xl !tw-border-0 !tw-bg-[#1e3a5f] !tw-px-5 !tw-font-semibold !tw-shadow-none hover:!tw-bg-[#152a45] hover:!tw-text-white disabled:!tw-opacity-60';

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

  // 검색 필터 - 직원명(부분 일치) + 부서(정확 일치)
  const [filterName, setFilterName] = useState('');
  const [filterDept, setFilterDept] = useState<string | undefined>(undefined);

  // 수동 강제 지정 모달 상태
  const [designateTarget, setDesignateTarget] = useState<LeavePromotionNoResponse | null>(null);
  const [designateDates, setDesignateDates] = useState<dayjs.Dayjs[]>([]);
  const [designateReason, setDesignateReason] = useState('');

  const designateM = useMutation({
    mutationFn: (params: { promotionLogId: string; dates: string[]; reason: string }) =>
      attendanceApi.leavePromotion.designate(params.promotionLogId, {
        dates: params.dates,
        reason: params.reason,
      }),
    onSuccess: () => {
      message.success('강제 지정이 완료되었습니다');
      setDesignateTarget(null);
      setDesignateDates([]);
      setDesignateReason('');
      void qc.invalidateQueries({ queryKey: QK });
      void qc.invalidateQueries({ queryKey: ['salary', 'leave-promotion', 'history'] });
    },
    onError: (e: Error) => message.error(e.message || '강제 지정에 실패했습니다'),
  });

  const openDesignate = (row: LeavePromotionNoResponse) => {
    setDesignateTarget(row);
    setDesignateDates([]);
    setDesignateReason(
      `근로기준법 61조에 따른 회사 자동 지정 (수동 처리 - ${dayjs().format('YYYY-MM-DD')})`,
    );
  };

  // 시연용 - 촉진 배치 즉시 실행
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

  // 부서 옵션 (멤버 마스터에서 추출)
  const departmentOptions = useMemo(() => {
    const set = new Set<string>();
    (membersQ.data?.items ?? []).forEach((m) => {
      if (m.department) set.add(m.department);
    });
    return Array.from(set)
      .sort()
      .map((d) => ({ value: d, label: d }));
  }, [membersQ.data]);

  // 필터 적용 - memberId 로 멤버 조회 후 이름/부서 매칭
  const applyFilter = <T extends { memberId: string }>(rows: T[]): T[] => {
    const nameKw = filterName.trim().toLowerCase();
    if (!nameKw && !filterDept) return rows;
    return rows.filter((r) => {
      const m = memberMap.get(r.memberId);
      if (!m) return false;
      if (nameKw && !(m.name ?? '').toLowerCase().includes(nameKw)) return false;
      if (filterDept && m.department !== filterDept) return false;
      return true;
    });
  };

  // 탭 상단 공통 필터 바
  const FilterBar = (
    <Space className="tw-w-full" wrap size="middle">
      <AppSearchBar
        placeholder="이름 검색"
        value={filterName}
        onValueChange={setFilterName}
        onSearch={setFilterName}
        ariaLabel="촉진 알림 직원 검색"
        className="tw-w-full tw-flex-none sm:tw-w-[300px]"
      />
      <Select
        allowClear
        placeholder="부서 선택"
        value={filterDept}
        onChange={setFilterDept}
        options={departmentOptions}
        style={{ width: 200 }}
      />
      {(filterName || filterDept) && (
        <Button
          size="small"
          onClick={() => {
            setFilterName('');
            setFilterDept(undefined);
          }}
        >
          초기화
        </Button>
      )}
    </Space>
  );

  const renderDateTagSummary = (dates: string[] | null | undefined, color: string) => {
    const values = dates ?? [];
    if (values.length === 0) {
      return (
        <Typography.Text type="secondary" className="!tw-text-xs">
          —
        </Typography.Text>
      );
    }
    const visible = values.slice(0, 2);
    return (
      <Tooltip title={values.join(', ')}>
        <span className="wf-table-tag-list">
          {visible.map((d) => (
            <Tag key={d} color={color}>
              {d}
            </Tag>
          ))}
          {values.length > visible.length ? <Tag>+{values.length - visible.length}</Tag> : null}
        </span>
      </Tooltip>
    );
  };

  const renderTooltipText = (value?: string | null) =>
    value ? (
      <Tooltip title={value}>
        <span className="wf-table-ellipsis">{value}</span>
      </Tooltip>
    ) : (
      <Typography.Text type="secondary" className="!tw-text-xs">
        —
      </Typography.Text>
    );

  const columns = useMemo<ColumnsType<LeavePromotionNoResponse>>(
    () => [
      {
        title: '직원',
        dataIndex: 'memberId',
        key: 'memberId',
        width: 180,
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
              <div className="wf-table-ellipsis tw-font-medium tw-text-slate-900">{m.name}</div>
              {m.department ? (
                <Tooltip title={m.department}>
                  <div className="wf-table-muted-line">{m.department}</div>
                </Tooltip>
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
        width: 90,
        render: (n: number | null) => (typeof n === 'number' ? `${n}일` : '—'),
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
        width: 120,
        render: (d: string) => formatDate(d),
      },
      {
        title: '경과일',
        dataIndex: 'daysSinceSent',
        key: 'daysSinceSent',
        width: 100,
        render: (n: number) => <Tag color={n >= 30 ? 'red' : 'orange'}>{n}일 경과</Tag>,
      },
      {
        title: '처리',
        key: 'actions',
        width: 120,
        align: 'center',
        render: (_, row) => (
          <Button type="primary" size="small" danger onClick={() => openDesignate(row)}>
            수동 강제 지정
          </Button>
        ),
      },
    ],
    // openDesignate 는 stable 가정
     
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
        <div className="wf-table-ellipsis tw-font-medium tw-text-slate-900">{m.name}</div>
        {m.department ? (
          <Tooltip title={m.department}>
            <div className="wf-table-muted-line">{m.department}</div>
          </Tooltip>
        ) : null}
      </div>
    );
  };

  // 1차/2차 알림 현황 컬럼 - 옵션 2 자동 강제 지정 결과(DESIGNATED) 명확히 표시
  const noticeColumns = useMemo<ColumnsType<LeavePromotionHistory>>(
    () => [
      {
        title: '직원',
        dataIndex: 'memberId',
        key: 'memberId',
        width: 170,
        render: renderEmployeeCell,
      },
      {
        title: '단계',
        dataIndex: 'stage',
        key: 'stage',
        width: 70,
        render: (s: string) => <Tag color="geekblue">{s === 'FIRST' ? '1차' : '2차'}</Tag>,
      },
      {
        title: '상태',
        dataIndex: 'status',
        key: 'status',
        width: 130,
        render: (s: string) => {
          if (s === 'ACKNOWLEDGED') return <Tag color="green">회신 완료</Tag>;
          if (s === 'DESIGNATED') return <Tag color="red">회사 자동 지정</Tag>;
          if (s === 'SENT') return <Tag color="orange">미회신</Tag>;
          return <Tag>{s}</Tag>;
        },
      },
      {
        title: '잔여 / 만료',
        key: 'balance',
        width: 130,
        render: (_, r) => (
          <div className="tw-text-xs">
            <div>{r.remainingDays != null ? `${r.remainingDays}일 남음` : '—'}</div>
            <div className="tw-text-slate-500">{formatDate(r.balanceExpirationDate)} 만료</div>
          </div>
        ),
      },
      {
        title: '회신 시점',
        dataIndex: 'acknowledgedAt',
        key: 'acknowledgedAt',
        width: 130,
        render: (v?: string | null) => (v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '—'),
      },
      {
        title: '계획 / 지정일',
        key: 'dates',
        width: 170,
        render: (_, r) => {
          const isDesignated = r.status === 'DESIGNATED';
          const dates = isDesignated ? (r.designatedDates ?? []) : (r.plannedDates ?? []);
          return renderDateTagSummary(dates, isDesignated ? 'red' : 'green');
        },
      },
      {
        title: '자동 지정 사유',
        dataIndex: 'designationReason',
        key: 'designationReason',
        width: 150,
        render: renderTooltipText,
      },
    ],
    // renderEmployeeCell 은 stable 가정 - memberMap 만 의존
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [memberMap],
  );

  const expiryRows = useMemo(
    () =>
      [
        ...(historyQ.data ?? []),
        ...(listQ.data ?? []).map((r) => ({
          ...r,
          status: 'SENT',
        })),
      ].sort((a, b) => {
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
      {
        title: '직원',
        dataIndex: 'memberId',
        key: 'memberId',
        width: 170,
        render: renderEmployeeCell,
      },
      {
        title: '단계',
        dataIndex: 'stage',
        key: 'stage',
        width: 70,
        render: (s: string) => (
          <Tag color={s === 'FIRST' ? 'geekblue' : 'volcano'}>{s === 'FIRST' ? '1차' : '2차'}</Tag>
        ),
      },
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
      {
        title: '잔여 연차',
        key: 'remainingDays',
        dataIndex: 'remainingDays',
        width: 100,
        render: (n?: number | null) => (typeof n === 'number' ? `${n}일` : '—'),
      },
      {
        title: '사용기한',
        dataIndex: 'balanceExpirationDate',
        key: 'balanceExpirationDate',
        width: 160,
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
        width: 120,
        render: (v?: string) => formatDate(v),
      },
      {
        title: '회신 시점',
        dataIndex: 'acknowledgedAt',
        key: 'acknowledgedAt',
        width: 130,
        render: (v?: string | null) => (v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '—'),
      },
      {
        title: '사용 계획일',
        key: 'plannedDates',
        width: 170,
        render: (_, r) => renderDateTagSummary(r.plannedDates, 'green'),
      },
    ],
    [memberMap],
  );

  return (
    <Space direction="vertical" className="tw-w-full" size={16}>
      <AppWorkspacePageTitle
        eyebrow="Leave"
        title="촉진 알림 현황"
        subtitle="근로기준법 61조 연차 사용 촉진 알림 현황 (매일 06:30 자동 배치)"
        extra={
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
                className={PROMOTION_PRIMARY_BUTTON_CLASS}
                loading={triggerM.isPending}
                onClick={() => triggerM.mutate(triggerDate.format('YYYY-MM-DD'))}
              >
                촉진 배치 실행
              </Button>
            </Tooltip>
          </Space>
        }
      />

      <Card variant="borderless" className={PROMOTION_CONTENT_CARD_CLASS}>
        <Tabs
          defaultActiveKey="no-response"
          items={[
            {
              key: 'no-response',
              label: <AppTabLabel count={listQ.data?.length ?? 0}>자동 지정 예외</AppTabLabel>,
              children: (
                <div className="tw-space-y-3">
                  <Alert
                    type="warning"
                    showIcon
                    className="tw-mb-0"
                    message="자동 지정이 실패해 수동 처리가 필요한 2차 통보입니다."
                  />
                  {FilterBar}
                  <AppDataTable<LeavePromotionNoResponse>
                      rowKey={(r) => r.promotionLogId}
                      loading={listQ.isLoading || membersQ.isLoading}
                      columns={columns}
                      dataSource={applyFilter(listQ.data ?? [])}
                      tableLayout="auto"
                      pagination={{ pageSize: 20, showSizeChanger: true }}
                      locale={{
                        emptyText: <Empty description="자동 지정 예외 대상이 없습니다 (정상)" />,
                      }}
                    />
                </div>
              ),
            },
            {
              key: 'first-notice',
              label: <AppTabLabel count={firstNoticeRows.length}>1차 알림 현황</AppTabLabel>,
              children: (
                <div className="tw-space-y-3">
                  {FilterBar}
                  <AppDataTable<LeavePromotionHistory>
                      rowKey={(r) => r.promotionLogId}
                      loading={historyQ.isLoading || membersQ.isLoading}
                      columns={noticeColumns}
                      dataSource={applyFilter(firstNoticeRows)}
                      tableLayout="auto"
                      pagination={{ pageSize: 20, showSizeChanger: true }}
                      locale={{
                        emptyText: <Empty description="1차 알림 이력이 없습니다" />,
                      }}
                    />
                </div>
              ),
            },
            {
              key: 'second-notice',
              label: <AppTabLabel count={secondNoticeRows.length}>2차 알림 현황</AppTabLabel>,
              children: (
                <div className="tw-space-y-3">
                  {FilterBar}
                  <AppDataTable<LeavePromotionHistory>
                      rowKey={(r) => r.promotionLogId}
                      loading={historyQ.isLoading || membersQ.isLoading}
                      columns={noticeColumns}
                      dataSource={applyFilter(secondNoticeRows)}
                      tableLayout="auto"
                      pagination={{ pageSize: 20, showSizeChanger: true }}
                      locale={{
                        emptyText: <Empty description="2차 알림 이력이 없습니다" />,
                      }}
                    />
                </div>
              ),
            },
            {
              key: 'expiry-status',
              label: <AppTabLabel count={expiryRows.length}>연차 사용기한 현황</AppTabLabel>,
              children: (
                <div className="tw-space-y-3">
                  {FilterBar}
                  <AppDataTable<LeavePromotionHistory & { status?: string }>
                      rowKey={(r) => r.promotionLogId}
                      loading={historyQ.isLoading || listQ.isLoading || membersQ.isLoading}
                      columns={expiryColumns}
                      dataSource={applyFilter(expiryRows)}
                      tableLayout="auto"
                      pagination={{ pageSize: 20, showSizeChanger: true }}
                      locale={{
                        emptyText: <Empty description="연차 사용기한 현황이 없습니다" />,
                      }}
                    />
                </div>
              ),
            },
          ]}
        />
      </Card>

      {/* 수동 강제 지정 모달 - 자동 지정 실패 예외 건 처리 */}
      <Modal
        open={!!designateTarget}
        title={
          designateTarget
            ? `수동 강제 지정 - 잔여 ${designateTarget.remainingDays ?? 0}일 / 만료 ${formatDate(designateTarget.balanceExpirationDate)}`
            : '수동 강제 지정'
        }
        onCancel={() => setDesignateTarget(null)}
        onOk={() => {
          if (!designateTarget) return;
          if (designateDates.length === 0) {
            message.warning('지정 날짜를 1개 이상 선택해주세요');
            return;
          }
          designateM.mutate({
            promotionLogId: designateTarget.promotionLogId,
            dates: designateDates.map((d) => d.format('YYYY-MM-DD')),
            reason: designateReason.trim() || '근로기준법 61조에 따른 회사 자동 지정 (수동 처리)',
          });
        }}
        confirmLoading={designateM.isPending}
        okText={`${designateDates.length}일 강제 지정`}
        cancelText="취소"
        okButtonProps={{ danger: true, disabled: designateDates.length === 0 }}
        destroyOnHidden
        width={560}
      >
        <Space direction="vertical" className="tw-w-full" size={12}>
          <Alert
            type="info"
            showIcon
            message="선택한 일자가 LeaveRequest로 자동 생성되며, 잔여 연차에서 차감됩니다. 직원에게 알림이 발송됩니다."
          />
          <div>
            <Typography.Text className="!tw-text-sm !tw-font-medium">
              지정할 연차 일자
            </Typography.Text>
            <DatePicker
              multiple
              value={designateDates}
              onChange={(v) => setDesignateDates((v as dayjs.Dayjs[]) ?? [])}
              format="YYYY-MM-DD"
              style={{ width: '100%', marginTop: 4 }}
              maxTagCount="responsive"
              disabledDate={(d) => {
                if (!d) return false;
                if (d.isBefore(dayjs(), 'day')) return true;
                const exp = designateTarget?.balanceExpirationDate;
                if (exp && d.isAfter(dayjs(exp), 'day')) return true;
                const dow = d.day();
                return dow === 0 || dow === 6;
              }}
            />
            <Typography.Text type="secondary" className="!tw-text-xs">
              주말 및 만료일 이후는 선택 불가. 잔여 {designateTarget?.remainingDays ?? 0}일까지 지정
              가능합니다.
            </Typography.Text>
          </div>
          <div>
            <Typography.Text className="!tw-text-sm !tw-font-medium">사유</Typography.Text>
            <Input.TextArea
              value={designateReason}
              onChange={(e) => setDesignateReason(e.target.value)}
              rows={2}
              maxLength={200}
              showCount
              placeholder="근로기준법 61조에 따른 회사 자동 지정 (수동 처리)"
              style={{ marginTop: 4 }}
            />
          </div>
        </Space>
      </Modal>
    </Space>
  );
}
