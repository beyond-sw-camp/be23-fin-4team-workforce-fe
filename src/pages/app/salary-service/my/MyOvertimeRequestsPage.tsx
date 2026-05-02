/** /app/attendance/overtime — 초과근무 관리 (사원)
 *
 *  기간/상태 필터 + 신청 이력 테이블 + 신청 모달 + 상세 모달
 *  신청은 전자결재 시스템과 연동 (모달 안에서 결재 자동 발의)
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  App,
  Button,
  Card,
  DatePicker,
  Descriptions,
  Divider,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Statistic,
  Space,
  Steps,
  Table,
  Tag,
  TimePicker,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { type Dayjs } from 'dayjs';
import { attendanceApi } from '@/features/salary-service/api/attendanceApi';
import type { OvertimeRequest, OvertimeRequestCreatePayload } from '@/features/salary-service/types';
import { approvalRequestApi } from '@/features/approvals/api/approvalRequestApi';

type FormValues = {
  targetDate: dayjs.Dayjs;
  startTime?: dayjs.Dayjs;
  endTime?: dayjs.Dayjs;
  reason?: string;
};

const STATUS_KO: Record<string, string> = {
  PENDING: '대기',
  APPROVED: '승인',
  REJECTED: '반려',
  CANCELLED: '취소',
  EXPIRED: '만료',
};

const STATUS_COLOR: Record<string, string> = {
  PENDING: 'default',
  APPROVED: 'green',
  REJECTED: 'red',
  CANCELLED: 'default',
  EXPIRED: 'default',
};

const TYPE_KO: Record<string, string> = {
  PRE: '사전',
  POST: '사후',
};

// 평일 / 주말 자동 판정 공휴일 정보 없으므로 요일 기준
function isWeekend(dateStr: string | undefined): boolean {
  if (!dateStr) return false;
  const d = dayjs(dateStr);
  const dow = d.day();
  return dow === 0 || dow === 6;
}

// 시작 시간이 22 이후 또는 종료가 06 이전이면 야간 OT 로 간주
function isNightShift(start: string | undefined | null, end: string | undefined | null): boolean {
  if (!start || !end) return false;
  const sh = parseInt(start.split(':')[0] ?? '0', 10);
  const eh = parseInt(end.split(':')[0] ?? '0', 10);
  return sh >= 22 || eh <= 6 || (sh < eh && eh >= 22);
}

function formatHours(minutes: number | null | undefined): string {
  if (minutes == null || minutes === 0) return '0';
  return (minutes / 60).toFixed(2).replace(/\.?0+$/, '');
}

function calcMinutes(start?: dayjs.Dayjs | null, end?: dayjs.Dayjs | null): number | null {
  if (!start || !end) return null;
  const s = start.hour() * 60 + start.minute();
  const e = end.hour() * 60 + end.minute();
  if (e === s) return null;
  // 자정을 넘기는 경우(예: 18:00 ~ 00:00)는 다음날 종료로 간주
  const adjustedEnd = e < s ? e + 24 * 60 : e;
  return adjustedEnd - s;
}

export function MyOvertimeRequestsPage() {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [form] = Form.useForm<FormValues>();

  // 필터 상태
  const [period, setPeriod] = useState<[Dayjs, Dayjs]>(() => [
    dayjs().startOf('month'),
    dayjs().endOf('month'),
  ]);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // 모달 상태
  const [createOpen, setCreateOpen] = useState(false);
  const [detailRow, setDetailRow] = useState<OvertimeRequest | null>(null);

  // 내 근태 행별 [초과근무 신청] 버튼 진입 시 자동 모달 오픈 + 날짜 prefill (1회만)
  const search = useSearch({ strict: false }) as { openCreate?: string; date?: string };
  const autoOpenAppliedRef = useRef(false);
  useEffect(() => {
    if (autoOpenAppliedRef.current) return;
    if (search.openCreate !== '1') return;
    form.resetFields();
    form.setFieldsValue({ targetDate: search.date ? dayjs(search.date) : dayjs() });
    setCreateOpen(true);
    autoOpenAppliedRef.current = true;
  }, [search.openCreate, search.date, form]);

  const listQ = useQuery({
    queryKey: ['salary', 'attendance', 'overtime', 'my'],
    queryFn: () => attendanceApi.overtimeRequest.listMy({ page: 0, size: 100 }),
  });

  // 주간 근무시간 요약은 [내 근태 → 주간/월간] 탭으로 이동됨

  const createM = useMutation({
    mutationFn: (payload: OvertimeRequestCreatePayload) => attendanceApi.overtimeRequest.createMy(payload),
    onSuccess: () => {
      message.success('초과근무 신청이 등록되었습니다. (전자결재 자동 발의)');
      form.resetFields();
      form.setFieldsValue({ targetDate: dayjs() });
      setCreateOpen(false);
      void qc.invalidateQueries({ queryKey: ['salary', 'attendance', 'overtime', 'my'] });
    },
    onError: (e: Error) => message.error(e.message || '신청 실패'),
  });

  const cancelM = useMutation({
    mutationFn: (id: string) => attendanceApi.overtimeRequest.cancelMy(id),
    onSuccess: () => {
      message.success('신청이 취소되었습니다.');
      void qc.invalidateQueries({ queryKey: ['salary', 'attendance', 'overtime', 'my'] });
    },
    onError: (e: Error) => message.error(e.message || '취소 실패'),
  });

  // 상세 모달 - 결재 문서 상세 fetch (A 결재 흐름 정보)
  const detailApprovalQ = useQuery({
    queryKey: ['approval', 'request', detailRow?.approvalRequestId],
    queryFn: () => approvalRequestApi.getRequest(detailRow!.approvalRequestId!),
    enabled: Boolean(detailRow?.approvalRequestId),
  });

  // 필터 적용
  const rows = listQ.data?.content ?? [];
  const filteredRows = useMemo(() => {
    return [...rows]
      .filter((r) => {
        if (!r.targetDate) return false;
        const d = dayjs(r.targetDate);
        if (d.isBefore(period[0], 'day') || d.isAfter(period[1], 'day')) return false;
        if (statusFilter !== 'ALL' && r.approvalStatus !== statusFilter) return false;
        return true;
      })
      .sort((a, b) => (b.targetDate ?? '').localeCompare(a.targetDate ?? ''));
  }, [rows, period, statusFilter]);

  const stats = useMemo(() => {
    const total = filteredRows.length;
    const pending = filteredRows.filter((r) => r.approvalStatus === 'PENDING').length;
    const approved = filteredRows.filter((r) => r.approvalStatus === 'APPROVED').length;
    const rejected = filteredRows.filter((r) => r.approvalStatus === 'REJECTED').length;
    return { total, pending, approved, rejected };
  }, [filteredRows]);

  // 컬럼 구조 사용자 지정
  const columns = useMemo<ColumnsType<OvertimeRequest>>(
    () => [
      {
        title: '근무일',
        dataIndex: 'targetDate',
        key: 'targetDate',
        width: 110,
        align: 'center',
      },
      {
        title: '근무시간타입',
        key: 'timeType',
        width: 100,
        align: 'center',
        render: (_, r) => (isWeekend(r.targetDate) ? '주말' : '평일'),
      },
      {
        title: '근무시간',
        key: 'time',
        width: 140,
        align: 'center',
        render: (_, r) => {
          const isPost = r.requestType === 'POST';
          const start = isPost ? r.actualStartTime : r.plannedStartTime;
          const end = isPost ? r.actualEndTime : r.plannedEndTime;
          if (!start || !end) return '-';
          return `${start} ~ ${end}`;
        },
      },
      {
        title: '연장',
        key: 'extOver',
        width: 70,
        align: 'right',
        render: (_, r) => {
          const minutes = (r.requestType === 'POST' ? r.actualMinutes : r.requestedMinutes) ?? 0;
          if (isWeekend(r.targetDate)) return '0';
          return formatHours(minutes);
        },
      },
      {
        title: '휴일',
        key: 'extHoliday',
        width: 70,
        align: 'right',
        render: (_, r) => {
          const minutes = (r.requestType === 'POST' ? r.actualMinutes : r.requestedMinutes) ?? 0;
          if (!isWeekend(r.targetDate)) return '0';
          return formatHours(minutes);
        },
      },
      {
        title: '야간',
        key: 'extNight',
        width: 70,
        align: 'right',
        render: (_, r) => {
          const isPost = r.requestType === 'POST';
          const start = isPost ? r.actualStartTime : r.plannedStartTime;
          const end = isPost ? r.actualEndTime : r.plannedEndTime;
          const minutes = (isPost ? r.actualMinutes : r.requestedMinutes) ?? 0;
          if (isNightShift(start, end)) return formatHours(minutes);
          return '0';
        },
      },
      {
        title: '상태',
        dataIndex: 'approvalStatus',
        key: 'approvalStatus',
        width: 90,
        align: 'center',
        render: (v) => (
          <Tag color={STATUS_COLOR[v ?? ''] ?? 'default'}>
            {STATUS_KO[v ?? ''] ?? (v ?? '-')}
          </Tag>
        ),
      },
      {
        title: '취소여부',
        key: 'cancelled',
        width: 80,
        align: 'center',
        render: (_, r) =>
          r.approvalStatus === 'CANCELLED' ? (
            <Tag>취소</Tag>
          ) : r.approvalStatus === 'PENDING' ? (
            <Popconfirm
              title="신청을 철회할까요?"
              onConfirm={() => r.overtimeRequestId && cancelM.mutate(r.overtimeRequestId)}
            >
              <Button type="link" size="small" danger className="!tw-p-0">
                철회
              </Button>
            </Popconfirm>
          ) : (
            <Typography.Text type="secondary">-</Typography.Text>
          ),
      },
      {
        title: '상세내역',
        key: 'detail',
        width: 90,
        align: 'center',
        render: (_, r) => (
          <Button type="link" size="small" className="!tw-p-0" onClick={() => setDetailRow(r)}>
            상세 ›
          </Button>
        ),
      },
    ],
    [cancelM],
  );

  return (
    <Space direction="vertical" className="tw-w-full" size={16}>
      {/* 헤더 - 신청 버튼은 내 근태 행별 [초과근무 신청] 결재 진입으로 통합 (자동 모달 useEffect 가 결재 진입 시 본 페이지에서도 모달 오픈) */}
      <div className="tw-flex tw-flex-wrap tw-justify-between tw-items-center tw-gap-2">
        <Typography.Title level={2} className="!tw-m-0 !tw-text-slate-900">
          초과 근무 관리
        </Typography.Title>
      </div>

      <Card title="초과 근무 관리 내역" className="tw-border-slate-200/80 tw-shadow-sm">

        <div className="tw-grid tw-grid-cols-2 md:tw-grid-cols-4 tw-gap-3 tw-mb-4">
          <Card size="small"><Statistic title="전체" value={stats.total} suffix="건" /></Card>
          <Card size="small"><Statistic title="대기" value={stats.pending} suffix="건" /></Card>
          <Card size="small"><Statistic title="승인" value={stats.approved} suffix="건" /></Card>
          <Card size="small"><Statistic title="반려" value={stats.rejected} suffix="건" /></Card>
        </div>

        {/* 필터 */}
        <Space wrap className="tw-mb-4">
          <span className="tw-text-sm tw-text-slate-600">기간</span>
          <DatePicker.RangePicker
            value={period}
            onChange={(v) => v && v[0] && v[1] && setPeriod([v[0], v[1]])}
            format="YYYY.MM.DD"
            allowClear={false}
          />
          <Space size={6}>
            <Button size="small" onClick={() => setPeriod([dayjs().startOf('week'), dayjs().endOf('week')])}>
              이번 주
            </Button>
            <Button
              size="small"
              onClick={() =>
                setPeriod([
                  dayjs().subtract(1, 'week').startOf('week'),
                  dayjs().subtract(1, 'week').endOf('week'),
                ])
              }
            >
              지난 주
            </Button>
            <Button size="small" onClick={() => setPeriod([dayjs().startOf('month'), dayjs().endOf('month')])}>
              이번 달
            </Button>
          </Space>
          <span className="tw-text-sm tw-text-slate-600 tw-ml-2">상태</span>
          <Select
            value={statusFilter}
            onChange={setStatusFilter}
            style={{ width: 130 }}
            options={[
              { value: 'ALL', label: '전체' },
              { value: 'PENDING', label: '대기' },
              { value: 'APPROVED', label: '승인' },
              { value: 'REJECTED', label: '반려' },
              { value: 'CANCELLED', label: '취소' },
            ]}
          />
          <Space size={6}>
            <Button size="small" type={statusFilter === 'PENDING' ? 'primary' : 'default'} onClick={() => setStatusFilter('PENDING')}>
              대기만
            </Button>
            <Button size="small" type={statusFilter === 'APPROVED' ? 'primary' : 'default'} onClick={() => setStatusFilter('APPROVED')}>
              승인만
            </Button>
            <Button size="small" onClick={() => setStatusFilter('ALL')}>
              초기화
            </Button>
          </Space>
          <Button type="primary" onClick={() => listQ.refetch()}>
            조회
          </Button>
        </Space>

        <Table<OvertimeRequest>
          rowKey={(r) => r.overtimeRequestId ?? `${r.targetDate}-${r.createdAt}`}
          dataSource={filteredRows}
          columns={columns}
          pagination={{ pageSize: 10 }}
          loading={listQ.isLoading}
          locale={{ emptyText: '신청 내역이 없습니다.' }}
          size="middle"
        />
      </Card>

      {/* 신청 모달 (전자결재 자동 발의) */}
      <Modal
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={createM.isPending}
        okText="신청 (결재 발의)"
        cancelText="취소"
        title="초과근무 신청"
        destroyOnClose
        width={620}
      >
        <Typography.Paragraph type="secondary" className="!tw-text-xs">
          신청 시 전자결재 시스템으로 이동됩니다.
        </Typography.Paragraph>
        <Alert
          type="warning"
          showIcon
          className="tw-mb-3"
          message="현재 시각 기준으로 종료 00:00은 다음날 00:00으로 처리됩니다."
        />
        <Form<FormValues>
          form={form}
          layout="vertical"
          initialValues={{ targetDate: dayjs() }}
          onFinish={(v) =>
            (() => {
              const now = dayjs();
              const cutoff = now.startOf('day').hour(18);
              const requestType: 'PRE' | 'POST' = now.isAfter(cutoff) ? 'POST' : 'PRE';
              const minutes = calcMinutes(v.startTime, v.endTime);
              createM.mutate({
                targetDate: v.targetDate.format('YYYY-MM-DD'),
                requestType,
                plannedStartTime: requestType === 'PRE' ? v.startTime?.format('HH:mm') ?? null : null,
                plannedEndTime: requestType === 'PRE' ? v.endTime?.format('HH:mm') ?? null : null,
                requestedMinutes: requestType === 'PRE' ? minutes : null,
                actualStartTime: requestType === 'POST' ? v.startTime?.format('HH:mm') ?? null : null,
                actualEndTime: requestType === 'POST' ? v.endTime?.format('HH:mm') ?? null : null,
                actualMinutes: requestType === 'POST' ? minutes : null,
                reason: v.reason?.trim() || null,
              });
            })()
          }
        >
          <Space wrap align="start" size={20} className="tw-w-full">
            <Form.Item name="targetDate" label="대상일" rules={[{ required: true }]} style={{ minWidth: 160 }}>
              <DatePicker format="YYYY-MM-DD" style={{ width: 160 }} />
            </Form.Item>
            <Form.Item name="startTime" label="시작" rules={[{ required: true }]} style={{ minWidth: 150 }}>
              <TimePicker format="HH:mm" minuteStep={5} style={{ width: 140 }} />
            </Form.Item>
            <Form.Item
              name="endTime"
              label="종료"
              style={{ minWidth: 150 }}
              rules={[
                { required: true },
                ({ getFieldValue }) => ({
                  validator(_, value) {
                    const start = getFieldValue('startTime') as dayjs.Dayjs | undefined;
                    const mins = calcMinutes(start, value as dayjs.Dayjs | undefined);
                    if (mins && mins > 0) return Promise.resolve();
                    return Promise.reject(new Error('시작/종료 시간이 동일하면 안 됩니다.'));
                  },
                }),
              ]}
            >
              <TimePicker format="HH:mm" minuteStep={5} style={{ width: 140 }} />
            </Form.Item>
          </Space>
          <Form.Item name="reason" label="사유" rules={[{ required: true, message: '사유를 입력하세요.' }]}>
            <Input.TextArea rows={3} maxLength={300} showCount />
          </Form.Item>
        </Form>
      </Modal>

      {/* 상세 모달 - A 결재 흐름 정보 */}
      <Modal
        open={Boolean(detailRow)}
        onCancel={() => setDetailRow(null)}
        footer={[
          detailRow?.approvalRequestId ? (
            <Button
              key="view"
              type="primary"
              onClick={() => {
                const rid = detailRow.approvalRequestId!;
                setDetailRow(null);
                void navigate({
                  to: '/app/approvals',
                  search: {
                    approvalRequestId: rid,
                    approvalOpenAt: String(Date.now()),
                  },
                });
              }}
            >
              결재 문서 보기
            </Button>
          ) : null,
          detailRow?.approvalStatus === 'PENDING' ? (
            <Popconfirm
              key="cancel"
              title="신청을 철회할까요?"
              onConfirm={() => {
                if (detailRow.overtimeRequestId) {
                  cancelM.mutate(detailRow.overtimeRequestId);
                  setDetailRow(null);
                }
              }}
            >
              <Button danger>신청 취소</Button>
            </Popconfirm>
          ) : null,
          <Button key="close" onClick={() => setDetailRow(null)}>
            닫기
          </Button>,
        ]}
        title="초과근무 결재 흐름"
        width={560}
      >
        {detailRow && (() => {
          const approval = detailApprovalQ.data;
          const lines = approval?.approvalLines ?? [];
          const sortedLines = [...lines].sort((a, b) => (a.stepOrder ?? 0) - (b.stepOrder ?? 0));
          const currentStep = sortedLines.findIndex(
            (ln) => (ln.approvalStatus ?? '') === 'PENDING' || (ln.approvalStatus ?? '') === 'WAITING',
          );
          const lastActed = [...sortedLines]
            .reverse()
            .find((ln) => Boolean(ln.comment) || ['APPROVED', 'REJECTED'].includes(String(ln.approvalStatus)));

          return (
            <>
              <Descriptions column={1} bordered size="small">
                <Descriptions.Item label="구분">
                  <Tag color={detailRow.requestType === 'POST' ? 'orange' : 'blue'}>
                    {TYPE_KO[detailRow.requestType ?? ''] ?? detailRow.requestType}
                  </Tag>
                  <Typography.Text type="secondary" className="!tw-text-xs">
                    {detailRow.requestType === 'POST' ? '근무 후 사후 신청' : '근무 전 사전 신청'}
                  </Typography.Text>
                </Descriptions.Item>
                <Descriptions.Item label="결재 상태">
                  <Tag color={STATUS_COLOR[detailRow.approvalStatus ?? ''] ?? 'default'}>
                    {STATUS_KO[detailRow.approvalStatus ?? ''] ?? detailRow.approvalStatus}
                  </Tag>
                </Descriptions.Item>
                <Descriptions.Item label="신청 사유">{detailRow.reason ?? '-'}</Descriptions.Item>
              </Descriptions>

              <Divider orientation="left" plain className="!tw-my-3 !tw-text-xs">
                결재 진행
              </Divider>

              {detailApprovalQ.isLoading ? (
                <Typography.Text type="secondary">결재선 정보를 불러오는 중...</Typography.Text>
              ) : !detailRow.approvalRequestId ? (
                <Alert type="info" showIcon message="연결된 결재 문서가 없습니다." />
              ) : sortedLines.length === 0 ? (
                <Alert type="warning" showIcon message="결재선이 등록되지 않았습니다." />
              ) : (
                <Steps
                  size="small"
                  direction="vertical"
                  current={currentStep === -1 ? sortedLines.length : currentStep}
                  items={sortedLines.map((ln) => {
                    const status = String(ln.approvalStatus ?? '');
                    const isCancelled = detailRow.approvalStatus === 'CANCELLED';
                    let stepStatus: 'wait' | 'process' | 'finish' | 'error' = 'wait';
                    let stepLabel = '';
                    if (isCancelled && !['APPROVED', 'REJECTED'].includes(status)) {
                      // 신청자가 결재 진행 중 취소한 경우 - 미처리 라인은 모두 '취소'로 표시
                      stepStatus = 'wait';
                      stepLabel = '취소';
                    } else if (status === 'APPROVED') {
                      stepStatus = 'finish';
                      stepLabel = '승인';
                    } else if (status === 'REJECTED') {
                      stepStatus = 'error';
                      stepLabel = '반려';
                    } else if (status === 'PENDING') {
                      stepStatus = 'process';
                      stepLabel = '결재 중';
                    } else if (status === 'WAITING') {
                      stepStatus = 'wait';
                      stepLabel = '대기';
                    } else if (status === 'CANCELED' || status === 'CANCELLED') {
                      stepStatus = 'wait';
                      stepLabel = '취소';
                    }
                    const name = ln.approverName ?? '-';
                    const role = [ln.approverOrganizationName, ln.approverJobTitleName].filter(Boolean).join(' / ');
                    return {
                      title: (
                        <Space size={6}>
                          <span>{ln.stepOrder}단계</span>
                          <Typography.Text strong>{name}</Typography.Text>
                          {ln.isProxy ? <Tag color="purple">대결</Tag> : null}
                        </Space>
                      ),
                      status: stepStatus,
                      description: (
                        <div className="tw-text-xs tw-text-slate-500">
                          {role && <div>{role}</div>}
                          <div>
                            {stepLabel}
                            {ln.actedAt && ` · ${dayjs(ln.actedAt).format('YYYY-MM-DD HH:mm')}`}
                          </div>
                          {ln.comment && (
                            <div className="tw-mt-1 tw-text-slate-700">코멘트: {ln.comment}</div>
                          )}
                        </div>
                      ),
                    };
                  })}
                />
              )}

              {lastActed?.comment && detailRow.approvalStatus === 'REJECTED' && (
                <Alert
                  className="tw-mt-3"
                  type="error"
                  showIcon
                  message="반려 사유"
                  description={lastActed.comment}
                />
              )}
            </>
          );
        })()}
      </Modal>
    </Space>
  );
}
