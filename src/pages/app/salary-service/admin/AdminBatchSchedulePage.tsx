import { EditOutlined, ReloadOutlined, ScheduleOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Card, Form, Input, Segmented, Select, Space, Switch, Table, Tag, TimePicker, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useState } from 'react';
import { companyBatchScheduleApi, type CompanyBatchSchedule } from '@/features/salary-service/api/companyBatchScheduleApi';
import { AppDoubleActionModal } from '@/shared/ui/AppDoubleActionModal';
import { AppButton } from '@/shared/ui/AppButton';
import { AppUnitInputNumber } from '@/shared/ui/AppUnitInputNumber';
import { AppWorkspacePageTitle } from '@/shared/ui/AppWorkspacePageTitle';

type Frequency = 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly';
const WEEKDAYS = [
  { value: 1, label: '일요일' },
  { value: 2, label: '월요일' },
  { value: 3, label: '화요일' },
  { value: 4, label: '수요일' },
  { value: 5, label: '목요일' },
  { value: 6, label: '금요일' },
  { value: 7, label: '토요일' },
];

// 회사 관리자에게 노출할 잡 한국어 매핑
const JOB_LABELS: Record<string, { name: string; description: string }> = {
  payrollCalculateJob: { name: '월 급여 계산', description: '매월 정기 급여 자동 계산' },
  severancePayJob: { name: '퇴직급여 지급', description: '퇴직 대상자 퇴직급여 자동 지급' },
  payslipSendJob: { name: '급여명세서 발송', description: '확정된 명세서 자동 발송' },
  regularBonusPaymentJob: { name: '정기 상여 지급 알림', description: '정기 상여 지급일 알림' },
  monthlyAttendanceCloseJob: { name: '월 근태 마감', description: '월간 근태 확정 및 급여 입력 준비' },
  leaveGrantJob: { name: '연차 자동 부여', description: '회계연도/입사일 기준 연차 부여' },
  carryoverLeaveJob: { name: '이월 연차 처리', description: '미사용 연차 이월 (정책 ON 회사)' },
};

// jobKey 'payrollCalculateJob__{uuid}_Detail::BATCH_GROUP' 에서 base jobName 추출
function extractBaseJobName(jobKey: string): string {
  const detailName = jobKey.split('::')[0] ?? jobKey;
  const idx = detailName.indexOf('__');
  return idx > 0 ? detailName.substring(0, idx) : detailName.replace(/_Detail$/, '');
}

function jobLabel(jobKey: string): { name: string; description: string } {
  const base = extractBaseJobName(jobKey);
  return JOB_LABELS[base] ?? { name: base, description: '' };
}

function cronToHuman(expr: string | null): string {
  if (!expr) return '-';
  const parts = expr.trim().split(/\s+/);
  if (parts.length < 6) return expr;
  const [sec = '', min = '', hour = '', day = '', month = '', dow = ''] = parts;
  const allWild = (v: string) => v === '*' || v === '?';
  const isNum = (v: string) => /^\d+$/.test(v);
  const pad = (v: string) => String(v).padStart(2, '0');
  if (isNum(sec) && isNum(min) && isNum(hour) && isNum(day) && isNum(month) && allWild(dow)) {
    return `매년 ${month}월 ${day}일 ${pad(hour)}:${pad(min)}`;
  }
  if (isNum(sec) && isNum(min) && isNum(hour) && isNum(day) && month === '*' && allWild(dow)) {
    return `매월 ${day}일 ${pad(hour)}:${pad(min)}`;
  }
  if (isNum(sec) && isNum(min) && isNum(hour) && day === '?' && month === '*' && isNum(dow)) {
    const days = ['', '일', '월', '화', '수', '목', '금', '토'];
    return `매주 ${days[Number(dow)] ?? dow}요일 ${pad(hour)}:${pad(min)}`;
  }
  if (isNum(sec) && isNum(min) && isNum(hour) && day === '*' && month === '*' && allWild(dow)) {
    return `매일 ${pad(hour)}:${pad(min)}`;
  }
  if (isNum(sec) && isNum(min) && hour === '*' && day === '*' && month === '*' && allWild(dow)) {
    return `매시간 ${min}분`;
  }
  return expr;
}

function parseCronToForm(expr: string | null): {
  frequency: Frequency;
  time: dayjs.Dayjs;
  dayOfMonth: number;
  dayOfWeek: number;
  monthOfYear: number;
} {
  const fallback = { frequency: 'daily' as Frequency, time: dayjs().hour(0).minute(0), dayOfMonth: 1, dayOfWeek: 2, monthOfYear: 1 };
  if (!expr) return fallback;
  const parts = expr.trim().split(/\s+/);
  if (parts.length < 6) return fallback;
  const [, min = '0', hour = '0', day = '', month = '', dow = ''] = parts;
  const time = dayjs().hour(Number(hour) || 0).minute(Number(min) || 0);
  if (hour === '*' && (day === '*' || day === '?') && (dow === '*' || dow === '?')) {
    return { frequency: 'hourly', time: dayjs().hour(0).minute(Number(min) || 0), dayOfMonth: 1, dayOfWeek: 2, monthOfYear: 1 };
  }
  if (/^\d+$/.test(day) && /^\d+$/.test(month)) {
    return { frequency: 'yearly', time, dayOfMonth: Number(day), dayOfWeek: 2, monthOfYear: Number(month) };
  }
  if (/^\d+$/.test(day)) return { frequency: 'monthly', time, dayOfMonth: Number(day), dayOfWeek: 2, monthOfYear: 1 };
  if (/^\d+$/.test(dow)) return { frequency: 'weekly', time, dayOfMonth: 1, dayOfWeek: Number(dow), monthOfYear: 1 };
  return { ...fallback, time };
}

function formToCron(values: { frequency: Frequency; time: dayjs.Dayjs; dayOfMonth?: number; dayOfWeek?: number; monthOfYear?: number }): string {
  const h = values.time.hour();
  const m = values.time.minute();
  if (values.frequency === 'hourly') return `0 ${m} * * * ?`;
  if (values.frequency === 'daily') return `0 ${m} ${h} * * ?`;
  if (values.frequency === 'weekly') return `0 ${m} ${h} ? * ${values.dayOfWeek ?? 2}`;
  if (values.frequency === 'yearly') return `0 ${m} ${h} ${values.dayOfMonth ?? 1} ${values.monthOfYear ?? 1} ?`;
  return `0 ${m} ${h} ${values.dayOfMonth ?? 1} * ?`;
}

const QK = ['salary', 'company-batch-schedule'] as const;
const PAGE_CARD_CLASS =
  'tw-rounded-2xl tw-border tw-border-slate-200/80 tw-bg-white tw-shadow-[0_1px_3px_rgba(15,23,42,0.06)]';

export default function AdminBatchSchedulePage() {
  return (
    <App>
      <Inner />
    </App>
  );
}

function Inner() {
  const qc = useQueryClient();
  const { message } = App.useApp();
  const [editing, setEditing] = useState<CompanyBatchSchedule | null>(null);
  const [form] = Form.useForm<{ frequency: Frequency; time: dayjs.Dayjs; dayOfMonth?: number; dayOfWeek?: number; monthOfYear?: number }>();
  const frequency = Form.useWatch('frequency', form);
  const [filter, setFilter] = useState<'all' | 'active' | 'paused'>('all');
  const [keyword, setKeyword] = useState('');

  const listQ = useQuery({
    queryKey: QK,
    queryFn: () => companyBatchScheduleApi.list(),
  });

  const updateM = useMutation({
    mutationFn: (vars: { jobKey: string; cron: string }) =>
      companyBatchScheduleApi.updateCron(vars.jobKey, vars.cron),
    onSuccess: () => {
      message.success('실행 시간이 변경되었습니다.');
      setEditing(null);
      void qc.invalidateQueries({ queryKey: QK });
    },
    onError: (e: unknown) => message.error((e as { message?: string })?.message ?? '변경 실패'),
  });

  const toggleM = useMutation({
    mutationFn: (vars: { jobKey: string; active: boolean }) =>
      companyBatchScheduleApi.setActive(vars.jobKey, vars.active),
    onSuccess: (_, vars) => {
      message.success(vars.active ? '다시 활성화되었습니다.' : '일시 중지되었습니다.');
      void qc.invalidateQueries({ queryKey: QK });
    },
    onError: (e: unknown) => message.error((e as { message?: string })?.message ?? '상태 변경 실패'),
  });

  const filtered = (listQ.data ?? [])
    .filter((it) => {
      if (filter === 'active' && it.paused) return false;
      if (filter === 'paused' && !it.paused) return false;
      if (keyword.trim()) {
        const meta = jobLabel(it.jobKey);
        const haystack = `${meta.name} ${meta.description}`.toLowerCase();
        if (!haystack.includes(keyword.trim().toLowerCase())) return false;
      }
      return true;
    });
  const schedules = listQ.data ?? [];
  const activeCount = schedules.filter((item) => !item.paused).length;
  const pausedCount = schedules.length - activeCount;

  const openEdit = (row: CompanyBatchSchedule) => {
    setEditing(row);
    form.setFieldsValue(parseCronToForm(row.cronExpression));
  };

  const onSubmit = async () => {
    if (!editing) return;
    const values = await form.validateFields();
    updateM.mutate({ jobKey: editing.jobKey, cron: formToCron(values) });
  };

  const cols: ColumnsType<CompanyBatchSchedule> = [
    {
      title: '상태',
      key: 'active',
      width: 116,
      render: (_, row) => (
        <Space size={8}>
          <Switch
            size="small"
            checked={!row.paused}
            loading={toggleM.isPending && toggleM.variables?.jobKey === row.jobKey}
            onChange={(checked) => toggleM.mutate({ jobKey: row.jobKey, active: checked })}
          />
          <Tag
            className={`!tw-m-0 !tw-rounded-full !tw-px-2.5 !tw-text-[11px] !tw-font-semibold ${
              row.paused
                ? '!tw-border-slate-200 !tw-bg-slate-50 !tw-text-slate-500'
                : '!tw-border-emerald-100 !tw-bg-emerald-50 !tw-text-emerald-700'
            }`}
          >
            {row.paused ? '중지' : '활성'}
          </Tag>
        </Space>
      ),
    },
    {
      title: '작업',
      dataIndex: 'jobKey',
      key: 'jobKey',
      render: (v: string) => {
        const meta = jobLabel(v);
        return (
          <Space direction="vertical" size={2}>
            <Typography.Text strong className="!tw-text-[14px] !tw-text-slate-900">{meta.name}</Typography.Text>
            {meta.description ? (
              <Typography.Text type="secondary" className="tw-text-xs tw-leading-relaxed">{meta.description}</Typography.Text>
            ) : null}
          </Space>
        );
      },
    },
    {
      title: '실행 주기',
      dataIndex: 'cronExpression',
      key: 'cronExpression',
      width: 180,
      render: (v: string | null) =>
        v ? (
          <Tag className="!tw-m-0 !tw-rounded-full !tw-border-[#d7e2ef] !tw-bg-[#f6f9fd] !tw-px-3 !tw-py-0.5 !tw-font-semibold !tw-text-[#1e3a5f]">
            {cronToHuman(v)}
          </Tag>
        ) : (
          <Typography.Text type="secondary">-</Typography.Text>
        ),
    },
    {
      title: '다음 실행 예정',
      dataIndex: 'nextFireTime',
      key: 'nextFireTime',
      width: 180,
      render: (v: string | null, row) =>
        row.paused ? <Typography.Text type="secondary">중지됨</Typography.Text>
        : v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '-',
    },
    {
      title: '마지막 실행',
      dataIndex: 'previousFireTime',
      key: 'previousFireTime',
      width: 180,
      render: (v: string | null) => (v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '없음'),
    },
    {
      title: '',
      key: 'action',
      width: 100,
      render: (_, row) => (
        <AppButton size="small" variant="secondary" icon={<EditOutlined />} onClick={() => openEdit(row)}>
          시간 변경
        </AppButton>
      ),
    },
  ];

  return (
    <div className="tw-mx-auto tw-w-full tw-space-y-5">
        <AppWorkspacePageTitle
          eyebrow="PAYROLL AUTOMATION"
          title="자동 작업 관리"
          subtitle="급여, 근태, 휴가와 연결된 회사 자동 작업의 실행 주기와 활성 상태를 관리합니다."
          extra={
            <AppButton
              variant="secondary"
              icon={<ReloadOutlined />}
              onClick={() => void listQ.refetch()}
              loading={listQ.isFetching}
            >
              새로고침
            </AppButton>
          }
        />

        <div className="tw-grid tw-grid-cols-1 tw-gap-3 md:tw-grid-cols-3">
          {[
            { label: '전체 작업', value: schedules.length, tone: 'tw-text-[#1e3a5f]' },
            { label: '활성 작업', value: activeCount, tone: 'tw-text-emerald-700' },
            { label: '중지 작업', value: pausedCount, tone: 'tw-text-slate-500' },
          ].map((item) => (
            <div key={item.label} className={`${PAGE_CARD_CLASS} tw-px-5 tw-py-4`}>
              <div className="tw-text-xs tw-font-semibold tw-text-slate-500">{item.label}</div>
              <div className={`tw-mt-1 tw-text-2xl tw-font-bold tw-tabular-nums ${item.tone}`}>
                {listQ.isLoading ? '-' : item.value}
              </div>
            </div>
          ))}
        </div>

        <Card className={PAGE_CARD_CLASS} styles={{ body: { padding: 20 } }}>
          <div className="tw-flex tw-flex-col tw-gap-3 lg:tw-flex-row lg:tw-items-center lg:tw-justify-between">
            <div className="tw-flex tw-min-w-0 tw-items-start tw-gap-3">
              <span className="tw-flex tw-size-10 tw-shrink-0 tw-items-center tw-justify-center tw-rounded-xl tw-bg-[#f1f5f9] tw-text-[#1e3a5f]">
                <ScheduleOutlined />
              </span>
              <div className="tw-min-w-0">
                <div className="tw-text-sm tw-font-semibold tw-text-slate-900">작업 실행 설정</div>
                <div className="tw-mt-1 tw-text-xs tw-leading-relaxed tw-text-slate-500">
                  활성 토글은 즉시 반영되며, 실행 시간은 작업별로 변경할 수 있습니다.
                </div>
              </div>
            </div>
            <div className="tw-flex tw-flex-col tw-gap-2 sm:tw-flex-row sm:tw-items-center">
              <Segmented
                size="middle"
                value={filter}
                onChange={(value) => setFilter(value as typeof filter)}
                options={[
                  { value: 'all', label: '전체' },
                  { value: 'active', label: '활성' },
                  { value: 'paused', label: '중지' },
                ]}
                className="tw-shrink-0"
              />
              <Input.Search
                allowClear
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="작업명 또는 설명 검색"
                className="tw-w-full sm:tw-w-[260px]"
              />
            </div>
          </div>

          <Table<CompanyBatchSchedule>
            rowKey={(r) => r.jobKey}
            loading={listQ.isLoading}
            dataSource={filtered}
            columns={cols}
            pagination={false}
            scroll={{ x: 920 }}
            locale={{ emptyText: '조건에 맞는 자동 작업이 없습니다.' }}
            className="tw-mt-4 [&_.ant-table-thead>tr>th]:!tw-bg-slate-50 [&_.ant-table-thead>tr>th]:!tw-text-xs [&_.ant-table-thead>tr>th]:!tw-font-semibold [&_.ant-table-thead>tr>th]:!tw-text-slate-500 [&_.ant-table-tbody>tr>td]:!tw-py-4"
          />
          <div className="tw-mt-3 tw-text-xs tw-text-slate-500">
            현재 조건 기준 {filtered.length}건이 표시됩니다.
          </div>
        </Card>

        <AppDoubleActionModal
          title="실행 시간 변경"
          open={!!editing}
          onClose={() => setEditing(null)}
          onConfirm={onSubmit}
          confirmLoading={updateM.isPending}
          confirmText="변경"
          cancelText="취소"
        >
          <Form form={form} layout="vertical" className="tw-px-5 tw-py-4">
            <Form.Item label="실행 주기" name="frequency" rules={[{ required: true }]} initialValue="daily">
              <Select
                onChange={(v) => {
                  if (v === 'weekly' && !form.getFieldValue('dayOfWeek')) form.setFieldValue('dayOfWeek', 2);
                  if (v === 'monthly' && !form.getFieldValue('dayOfMonth')) form.setFieldValue('dayOfMonth', 1);
                  if (v === 'yearly') {
                    if (!form.getFieldValue('dayOfMonth')) form.setFieldValue('dayOfMonth', 1);
                    if (!form.getFieldValue('monthOfYear')) form.setFieldValue('monthOfYear', 1);
                  }
                }}
                options={[
                  { value: 'hourly', label: '매시간' },
                  { value: 'daily', label: '매일' },
                  { value: 'weekly', label: '매주' },
                  { value: 'monthly', label: '매월' },
                  { value: 'yearly', label: '매년' },
                ]}
              />
            </Form.Item>

            {frequency === 'weekly' ? (
              <Form.Item label="요일" name="dayOfWeek" rules={[{ required: true, message: '요일을 선택해주세요.' }]}>
                <Select options={WEEKDAYS} />
              </Form.Item>
            ) : null}

            {frequency === 'monthly' ? (
              <Form.Item label="매월 며칠" name="dayOfMonth" rules={[{ required: true, message: '날짜를 입력해주세요.' }]}>
                <AppUnitInputNumber min={1} max={31} unit="일" />
              </Form.Item>
            ) : null}

            {frequency === 'yearly' ? (
              <Space.Compact block>
                <Form.Item
                  label="매년 몇 월"
                  name="monthOfYear"
                  rules={[{ required: true, message: '월을 선택해주세요.' }]}
                  style={{ flex: 1, marginRight: 8 }}
                >
                  <AppUnitInputNumber min={1} max={12} unit="월" />
                </Form.Item>
                <Form.Item
                  label="며칠"
                  name="dayOfMonth"
                  rules={[{ required: true, message: '날짜를 입력해주세요.' }]}
                  style={{ flex: 1 }}
                >
                  <AppUnitInputNumber min={1} max={31} unit="일" />
                </Form.Item>
              </Space.Compact>
            ) : null}

            {frequency === 'hourly' ? (
              <Form.Item
                label="매시간 몇 분에"
                name="time"
                rules={[{ required: true, message: '분을 선택해주세요.' }]}
                initialValue={dayjs().hour(0).minute(0)}
                getValueFromEvent={(v: number | null) => dayjs().hour(0).minute(v ?? 0)}
                getValueProps={(v) => ({ value: v ? (v as dayjs.Dayjs).minute() : 0 })}
              >
                <AppUnitInputNumber min={0} max={59} unit="분" />
              </Form.Item>
            ) : (
              <Form.Item
                label="실행 시각"
                name="time"
                rules={[{ required: true, message: '시간을 선택해주세요.' }]}
                initialValue={dayjs().hour(0).minute(0)}
              >
                <TimePicker format="HH:mm" minuteStep={5} style={{ width: '100%' }} />
              </Form.Item>
            )}
          </Form>
        </AppDoubleActionModal>
    </div>
  );
}
