import { ArrowLeftOutlined, EditOutlined, ReloadOutlined, ScheduleOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { Alert, App, Button, Form, Input, InputNumber, Modal, Select, Space, Switch, Table, Tabs, Tag, TimePicker, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useState } from 'react';
import { saasApi, type SaasCompany, type SaasSchedule } from '@/features/saas/api/saasApi';

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

/** Quartz cron(6필드) 파싱 -> 폼 값. hourly 면 minute 만 의미 있음 (time 의 분 부분만 사용) */
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
  // 매시간: hour='*' & day=='*'/'?' & dow=='*'/'?'
  if (hour === '*' && (day === '*' || day === '?') && (dow === '*' || dow === '?')) {
    return { frequency: 'hourly', time: dayjs().hour(0).minute(Number(min) || 0), dayOfMonth: 1, dayOfWeek: 2, monthOfYear: 1 };
  }
  // 매년: month 가 숫자 + day 가 숫자
  if (/^\d+$/.test(day) && /^\d+$/.test(month)) {
    return { frequency: 'yearly', time, dayOfMonth: Number(day), dayOfWeek: 2, monthOfYear: Number(month) };
  }
  if (/^\d+$/.test(day)) {
    return { frequency: 'monthly', time, dayOfMonth: Number(day), dayOfWeek: 2, monthOfYear: 1 };
  }
  if (/^\d+$/.test(dow)) {
    return { frequency: 'weekly', time, dayOfMonth: 1, dayOfWeek: Number(dow), monthOfYear: 1 };
  }
  return { ...fallback, time };
}

/** 폼 값 -> Quartz cron(6필드) */
function formToCron(values: { frequency: Frequency; time: dayjs.Dayjs; dayOfMonth?: number; dayOfWeek?: number; monthOfYear?: number }): string {
  const h = values.time.hour();
  const m = values.time.minute();
  if (values.frequency === 'hourly') return `0 ${m} * * * ?`;
  if (values.frequency === 'daily') return `0 ${m} ${h} * * ?`;
  if (values.frequency === 'weekly') return `0 ${m} ${h} ? * ${values.dayOfWeek ?? 2}`;
  if (values.frequency === 'yearly') return `0 ${m} ${h} ${values.dayOfMonth ?? 1} ${values.monthOfYear ?? 1} ?`;
  return `0 ${m} ${h} ${values.dayOfMonth ?? 1} * ?`;
}

const QK_MEMBER = ['saas', 'schedules', 'member'] as const;
const QK_SALARY = ['saas', 'schedules', 'salary'] as const;

/** 잡 식별자 -> 한국어 표시명 매핑 */
const JOB_LABELS: Record<string, { name: string; description: string }> = {
  // member-service
  personnelOrderApplyJob_Detail: {
    name: '인사발령 자동 적용',
    description: '발령일이 도래한 인사발령을 자동으로 직원 정보에 반영',
  },
  // salary-service - 근태
  dailyAttendanceDraftJob_Detail: {
    name: '일일 근태 임시 마감',
    description: '전일 출퇴근 데이터를 임시(DRAFT) 상태로 정리',
  },
  dailyAttendanceFinalJob_Detail: {
    name: '일일 근태 최종 마감',
    description: '임시 마감된 근태 데이터를 최종(FINAL) 확정',
  },
  weeklyLimitCheckJob_Detail: {
    name: '주52시간 위반 감지',
    description: '주간 근로시간 한도 초과 직원 자동 감지/알림',
  },
  monthlyAttendanceCloseJob_Detail: {
    name: '월 근태 마감',
    description: '월간 근태 데이터 확정 및 급여 입력 준비',
  },
  // salary-service - 연장/시차
  overtimeExpirationJob_Detail: {
    name: '연장근로 신청 만료',
    description: '제출 후 72시간 경과한 사후 신청 자동 만료',
  },
  slotDeadlineAutoAssignJob_Detail: {
    name: '시차출퇴근 슬롯 자동 배정',
    description: '마감일 경과한 시차 슬롯 자동 할당',
  },
  // salary-service - 연차
  leaveGrantJob_Detail: {
    name: '연차 자동 부여',
    description: '회계연도/입사일 기준 연차 일괄 부여',
  },
  unusedLeaveAutoPayoutJob_Detail: {
    name: '미사용 연차수당 자동 정산',
    description: '만료 임박 잔여 연차를 다음 달 급여 수당 항목으로 자동 추가',
  },
  leaveExpireJob_Detail: {
    name: '연차 만료 처리',
    description: '만료일 도래 연차 잔액 정리',
  },
  carryoverLeaveJob_Detail: {
    name: '이월 연차 처리',
    description: '매년 1월 1일 미사용 연차 이월 (정책 ON 회사 대상)',
  },
  leavePromotionJob_Detail: {
    name: '연차 사용 촉진 알림',
    description: '연차 미소진 직원에게 사용 촉진 알림 발송',
  },
  // salary-service - 급여
  payrollCalculateJob_Detail: {
    name: '월 급여 계산',
    description: '매월 25일 정기 급여 자동 계산',
  },
  severancePayJob_Detail: {
    name: '퇴직급여 지급',
    description: '퇴직 대상자 퇴직급여 자동 지급 처리',
  },
  payslipSendJob_Detail: {
    name: '급여명세서 발송',
    description: '확정된 급여 명세서 직원에게 자동 발송',
  },
  regularBonusPaymentJob_Detail: {
    name: '정기 상여 지급 알림',
    description: '정기 상여 지급일 알림 (회사별 지급 정책 적용)',
  },
};

/** Quartz cron(6필드: 초 분 시 일 월 요일) 을 사람이 읽기 쉬운 한국어로 변환 */
function cronToHuman(expr: string | null): string {
  if (!expr) return '-';
  const parts = expr.trim().split(/\s+/);
  if (parts.length < 6) return expr;
  const [sec = '', min = '', hour = '', day = '', month = '', dow = ''] = parts;
  const allWild = (v: string) => v === '*' || v === '?';
  const isNum = (v: string) => /^\d+$/.test(v);
  const pad = (v: string) => String(v).padStart(2, '0');

  // 매년 N월 N일 HH:MM (예: 0 0 0 1 1 ?)
  if (isNum(sec) && isNum(min) && isNum(hour) && isNum(day) && isNum(month) && allWild(dow)) {
    return `매년 ${month}월 ${day}일 ${pad(hour)}:${pad(min)}`;
  }
  // 매월 N일 HH:MM
  if (isNum(sec) && isNum(min) && isNum(hour) && isNum(day) && month === '*' && allWild(dow)) {
    return `매월 ${day}일 ${pad(hour)}:${pad(min)}`;
  }
  // 매주 요일 HH:MM
  if (isNum(sec) && isNum(min) && isNum(hour) && day === '?' && month === '*' && isNum(dow)) {
    const days = ['', '일', '월', '화', '수', '목', '금', '토'];
    return `매주 ${days[Number(dow)] ?? dow}요일 ${pad(hour)}:${pad(min)}`;
  }
  // 매일 HH:MM
  if (isNum(sec) && isNum(min) && isNum(hour) && day === '*' && month === '*' && allWild(dow)) {
    return `매일 ${pad(hour)}:${pad(min)}`;
  }
  // 매시간 N분
  if (isNum(sec) && isNum(min) && hour === '*' && day === '*' && month === '*' && allWild(dow)) {
    return `매시간 ${min}분`;
  }
  return expr;
}

// jobKey 'payrollCalculateJob__{uuid}_Detail::BATCH_GROUP' 또는 'jobName_Detail::group' 처리
// 회사별 잡: __{uuid}_Detail / 글로벌 잡: jobName_Detail
function extractBaseJobName(jobKey: string): string {
  const detailName = jobKey.split('::')[0] ?? jobKey;
  const idx = detailName.indexOf('__');
  if (idx > 0) return detailName.substring(0, idx);
  return detailName;
}

function extractCompanyId(jobKey: string): string | null {
  const detailName = jobKey.split('::')[0] ?? jobKey;
  const idx = detailName.indexOf('__');
  if (idx <= 0) return null;
  // 'jobName__{uuid}_Detail' -> {uuid}
  const tail = detailName.substring(idx + 2);
  return tail.replace(/_Detail$/, '');
}

function jobName(jobKey: string): { name: string; description: string } {
  const base = extractBaseJobName(jobKey);
  // JOB_LABELS 는 'xxx_Detail' 키이므로 base + '_Detail' 매칭
  return JOB_LABELS[base + '_Detail'] ?? JOB_LABELS[base] ?? { name: base, description: '' };
}

export default function SaasSchedulesPage() {
  return (
    <App>
      <SaasSchedulesPageInner />
    </App>
  );
}

function SaasSchedulesPageInner() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { message } = App.useApp();
  const [editing, setEditing] = useState<SaasSchedule | null>(null);
  const [form] = Form.useForm<{ frequency: Frequency; time: dayjs.Dayjs; dayOfMonth?: number; dayOfWeek?: number; monthOfYear?: number }>();
  const frequency = Form.useWatch('frequency', form);

  const [filter, setFilter] = useState<'all' | 'active' | 'paused'>('all');
  const [keyword, setKeyword] = useState('');

  const memberQ = useQuery({
    queryKey: QK_MEMBER,
    queryFn: () => saasApi.schedule.listMember(),
  });
  const salaryQ = useQuery({
    queryKey: QK_SALARY,
    queryFn: () => saasApi.schedule.listSalary(),
  });
  const companyQ = useQuery({
    queryKey: ['saas', 'companies'] as const,
    queryFn: () => saasApi.company.list(),
  });
  const allData = [...(memberQ.data ?? []), ...(salaryQ.data ?? [])];
  const isLoading = memberQ.isLoading || salaryQ.isLoading;
  const isFetching = memberQ.isFetching || salaryQ.isFetching;

  const companyMap: Record<string, SaasCompany> = (companyQ.data ?? []).reduce(
    (acc, c) => ({ ...acc, [c.companyId]: c }),
    {} as Record<string, SaasCompany>,
  );

  // 글로벌 잡 (jobKey 에 __ 없음) vs 회사별 잡 (__{uuid} 포함) 분리
  const globalRows = allData.filter((it) => extractCompanyId(it.jobKey) == null);
  const perCompanyRows = allData.filter((it) => extractCompanyId(it.jobKey) != null);

  // 회사별 탭에서 선택한 회사 (default 첫 회사)
  const [selectedCompany, setSelectedCompany] = useState<string | undefined>(undefined);
  const companyOptions = (companyQ.data ?? []).map((c) => ({ value: c.companyId, label: c.companyName || c.companyId.slice(0, 8) }));

  /** 실행주기 짧은 순 + 같은 주기면 시각 빠른 순 */
  function frequencyRank(expr: string | null): number {
    if (!expr) return 99;
    const parts = expr.trim().split(/\s+/);
    if (parts.length < 6) return 99;
    const [, , hour = '', day = '', month = '', dow = ''] = parts;
    const allWild = (v: string) => v === '*' || v === '?';
    const isNum = (v: string) => /^\d+$/.test(v);
    if (isNum(month) && isNum(day) && allWild(dow)) return 4; // 매년
    if (isNum(day) && month === '*' && allWild(dow)) return 3; // 매월
    if (day === '?' && month === '*' && isNum(dow)) return 2;  // 매주
    if (allWild(day) && allWild(month) && allWild(dow) && isNum(hour)) return 1; // 매일
    if (hour === '*') return 0; // 매시간
    return 5;
  }

  function timeOfDay(expr: string | null): number {
    if (!expr) return 24 * 60;
    const parts = expr.trim().split(/\s+/);
    if (parts.length < 6) return 24 * 60;
    const [, min = '0', hour = '0'] = parts;
    const h = Number(hour) || 0;
    const m = Number(min) || 0;
    return h * 60 + m;
  }

  function applyFilter(rows: SaasSchedule[], f: 'all' | 'active' | 'paused', kw: string): SaasSchedule[] {
    return rows
      .filter((it) => {
        if (f === 'active' && it.paused) return false;
        if (f === 'paused' && !it.paused) return false;
        if (kw.trim()) {
          const meta = jobName(it.jobKey);
          const haystack = `${meta.name} ${meta.description}`.toLowerCase();
          if (!haystack.includes(kw.trim().toLowerCase())) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const r = frequencyRank(a.cronExpression) - frequencyRank(b.cronExpression);
        if (r !== 0) return r;
        return timeOfDay(a.cronExpression) - timeOfDay(b.cronExpression);
      });
  }

  const filteredSorted = allData
    .filter((it) => {
      if (filter === 'active' && it.paused) return false;
      if (filter === 'paused' && !it.paused) return false;
      if (keyword.trim()) {
        const meta = jobName(it.jobKey);
        const haystack = `${meta.name} ${meta.description}`.toLowerCase();
        if (!haystack.includes(keyword.trim().toLowerCase())) return false;
      }
      return true;
    })
    .sort((a, b) => {
      const r = frequencyRank(a.cronExpression) - frequencyRank(b.cronExpression);
      if (r !== 0) return r;
      return timeOfDay(a.cronExpression) - timeOfDay(b.cronExpression);
    });

  const updateM = useMutation({
    mutationFn: (vars: { source: SaasSchedule['source']; jobKey: string; cron: string }) =>
      saasApi.schedule.updateCron(vars.source, vars.jobKey, vars.cron),
    onSuccess: () => {
      message.success('실행 시간이 변경되었습니다.');
      setEditing(null);
      void qc.invalidateQueries({ queryKey: QK_MEMBER });
      void qc.invalidateQueries({ queryKey: QK_SALARY });
    },
    onError: (e: unknown) => {
      message.error((e as { message?: string })?.message ?? '변경에 실패했습니다.');
    },
  });

  const toggleM = useMutation({
    mutationFn: (vars: { source: SaasSchedule['source']; jobKey: string; active: boolean }) =>
      saasApi.schedule.setActive(vars.source, vars.jobKey, vars.active),
    onSuccess: (_, vars) => {
      message.success(vars.active ? '다시 활성화되었습니다.' : '일시 중지되었습니다.');
      void qc.invalidateQueries({ queryKey: QK_MEMBER });
      void qc.invalidateQueries({ queryKey: QK_SALARY });
    },
    onError: (e: unknown) => {
      message.error((e as { message?: string })?.message ?? '상태 변경에 실패했습니다.');
    },
  });

  const openEdit = (row: SaasSchedule) => {
    setEditing(row);
    const parsed = parseCronToForm(row.cronExpression);
    form.setFieldsValue(parsed);
  };

  const onSubmit = async () => {
    if (!editing) return;
    const values = await form.validateFields();
    const cron = formToCron(values);
    updateM.mutate({ source: editing.source, jobKey: editing.jobKey, cron });
  };

  const cols: ColumnsType<SaasSchedule> = [
    {
      title: '활성',
      key: 'active',
      width: 80,
      render: (_, row) => (
        <Switch
          checked={!row.paused}
          loading={toggleM.isPending && toggleM.variables?.jobKey === row.jobKey}
          onChange={(checked) => toggleM.mutate({ source: row.source, jobKey: row.jobKey, active: checked })}
        />
      ),
    },
    {
      title: '작업',
      dataIndex: 'jobKey',
      key: 'jobKey',
      render: (v: string) => {
        const meta = jobName(v);
        return (
          <Space direction="vertical" size={2}>
            <Typography.Text strong>{meta.name}</Typography.Text>
            {meta.description ? (
              <Typography.Text type="secondary" className="tw-text-xs">
                {meta.description}
              </Typography.Text>
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
        v ? <Tag color="blue">{cronToHuman(v)}</Tag> : <Typography.Text type="secondary">-</Typography.Text>,
    },
    {
      title: '다음 실행 예정',
      dataIndex: 'nextFireTime',
      key: 'nextFireTime',
      width: 180,
      render: (v: string | null, row) =>
        row.paused ? (
          <Typography.Text type="secondary">중지됨</Typography.Text>
        ) : v ? (
          dayjs(v).format('YYYY-MM-DD HH:mm')
        ) : (
          '-'
        ),
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
        <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(row)}>
          시간 변경
        </Button>
      ),
    },
  ];

  return (
    <div className="tw-min-h-screen tw-bg-slate-50 tw-p-8">
      <div className="tw-mx-auto tw-max-w-6xl tw-space-y-6">
        <div className="tw-flex tw-items-center tw-justify-between">
          <Space align="center" size={12}>
            <Button
              type="text"
              icon={<ArrowLeftOutlined />}
              onClick={() => navigate({ to: '/saas/dashboard' })}
            />
            <ScheduleOutlined className="tw-text-2xl tw-text-blue-500" />
            <Typography.Title level={2} className="!tw-m-0">
              자동 작업 관리
            </Typography.Title>
          </Space>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => {
              void memberQ.refetch();
              void salaryQ.refetch();
            }}
            loading={isFetching}
          >
            새로고침
          </Button>
        </div>

        <Alert
          type="info"
          showIcon
          message="활성 토글로 끄거나 켜고, 시간 변경으로 실행 주기를 바꿀 수 있어요."
        />

        {memberQ.isError ? (
          <Alert type="error" showIcon message="member 작업 목록을 불러오지 못했습니다." />
        ) : null}
        {salaryQ.isError ? (
          <Alert type="error" showIcon message="salary 작업 목록을 불러오지 못했습니다." />
        ) : null}

        <Space wrap size={12}>
          <Select
            value={filter}
            onChange={setFilter}
            style={{ width: 140 }}
            options={[
              { value: 'all', label: '전체' },
              { value: 'active', label: '활성만' },
              { value: 'paused', label: '중지만' },
            ]}
          />
          <Input.Search
            allowClear
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="작업명/설명 검색"
            style={{ width: 240 }}
          />
        </Space>

        <Tabs
          defaultActiveKey="system"
          items={[
            {
              key: 'system',
              label: `공통 자동 작업 (${globalRows.length})`,
              children: (
                <Table<SaasSchedule>
                  rowKey={(r) => r.jobKey}
                  loading={isLoading}
                  dataSource={applyFilter(globalRows, filter, keyword)}
                  columns={cols}
                  pagination={false}
                />
              ),
            },
            {
              key: 'per-company',
              label: `회사별 자동 작업`,
              children: (
                <PerCompanyView
                  companies={companyQ.data ?? []}
                  rows={perCompanyRows}
                  selectedCompany={selectedCompany}
                  onSelectCompany={setSelectedCompany}
                  cols={cols}
                  filter={filter}
                  keyword={keyword}
                  applyFilter={applyFilter}
                  isLoading={isLoading}
                  extractCompanyId={extractCompanyId}
                />
              ),
            },
          ]}
        />

        <Modal
          title="실행 시간 변경"
          open={!!editing}
          onCancel={() => setEditing(null)}
          onOk={onSubmit}
          confirmLoading={updateM.isPending}
          okText="변경"
          cancelText="취소"
        >
          <Form form={form} layout="vertical">
            <Form.Item
              label="실행 주기"
              name="frequency"
              rules={[{ required: true }]}
              initialValue="daily"
            >
              <Select
                onChange={(v) => {
                  // 주기 변경 시 보조 필드 default 강제 셋업 (이전 값 잔존 방지)
                  if (v === 'weekly') {
                    if (!form.getFieldValue('dayOfWeek')) form.setFieldValue('dayOfWeek', 2);
                  }
                  if (v === 'monthly') {
                    if (!form.getFieldValue('dayOfMonth')) form.setFieldValue('dayOfMonth', 1);
                  }
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
              <Form.Item
                label="요일"
                name="dayOfWeek"
                rules={[{ required: true, message: '요일을 선택해주세요.' }]}
              >
                <Select options={WEEKDAYS} />
              </Form.Item>
            ) : null}

            {frequency === 'monthly' ? (
              <Form.Item
                label="매월 며칠"
                name="dayOfMonth"
                rules={[{ required: true, message: '날짜를 입력해주세요.' }]}
              >
                <InputNumber min={1} max={31} addonAfter="일" style={{ width: '100%' }} />
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
                  <InputNumber min={1} max={12} addonAfter="월" style={{ width: '100%' }} />
                </Form.Item>
                <Form.Item
                  label="며칠"
                  name="dayOfMonth"
                  rules={[{ required: true, message: '날짜를 입력해주세요.' }]}
                  style={{ flex: 1 }}
                >
                  <InputNumber min={1} max={31} addonAfter="일" style={{ width: '100%' }} />
                </Form.Item>
              </Space.Compact>
            ) : null}

            {/* 매시간일 땐 시각이 의미없음. 분(0~59)만 입력 - 내부적으로 time 의 minute 만 사용됨 */}
            {frequency === 'hourly' ? (
              <Form.Item
                label="매시간 몇 분에"
                name="time"
                rules={[{ required: true, message: '분을 선택해주세요.' }]}
                initialValue={dayjs().hour(0).minute(0)}
                getValueFromEvent={(v: number | null) =>
                  dayjs().hour(0).minute(v ?? 0)
                }
                getValueProps={(v) => ({ value: v ? (v as dayjs.Dayjs).minute() : 0 })}
              >
                <InputNumber min={0} max={59} addonAfter="분" style={{ width: '100%' }} />
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
        </Modal>
      </div>
    </div>
  );
}

// 회사별 자동 작업 - 좌측 사이드 패널 (검색 + 가상 스크롤 가능한 회사 리스트) + 우측 잡 테이블
function PerCompanyView(props: {
  companies: SaasCompany[];
  rows: SaasSchedule[];
  selectedCompany: string | undefined;
  onSelectCompany: (id: string | undefined) => void;
  cols: ColumnsType<SaasSchedule>;
  filter: 'all' | 'active' | 'paused';
  keyword: string;
  applyFilter: (rows: SaasSchedule[], f: 'all' | 'active' | 'paused', kw: string) => SaasSchedule[];
  isLoading: boolean;
  extractCompanyId: (jobKey: string) => string | null;
}) {
  const { companies, rows, selectedCompany, onSelectCompany, cols, filter, keyword, applyFilter, isLoading, extractCompanyId } = props;
  const [search, setSearch] = useState('');

  // 회사별 잡 통계 미리 계산, 사이드 패널의 회사명 옆에 N개/N중지 표시
  const statsByCompany = rows.reduce<Record<string, { total: number; paused: number }>>((acc, r) => {
    const cid = extractCompanyId(r.jobKey);
    if (!cid) return acc;
    if (!acc[cid]) acc[cid] = { total: 0, paused: 0 };
    acc[cid].total += 1;
    if (r.paused) acc[cid].paused += 1;
    return acc;
  }, {});

  const filteredCompanies = companies.filter((c) => {
    if (!search.trim()) return true;
    const kw = search.trim().toLowerCase();
    return (
      (c.companyName?.toLowerCase().includes(kw) ?? false) ||
      (c.businessNumber?.toLowerCase().includes(kw) ?? false)
    );
  });

  const selectedRows = selectedCompany
    ? applyFilter(rows.filter((r) => extractCompanyId(r.jobKey) === selectedCompany), filter, keyword)
    : [];

  return (
    <div className="tw-flex tw-gap-4">
      {/* 좌측 사이드 패널 */}
      <div
        className="tw-w-72 tw-flex-shrink-0 tw-rounded-lg tw-border tw-border-slate-200 tw-bg-white"
        style={{ maxHeight: 'calc(100vh - 320px)', display: 'flex', flexDirection: 'column' }}
      >
        <div className="tw-p-3 tw-border-b tw-border-slate-200">
          <Input.Search
            placeholder="회사명/사업자번호 검색"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            allowClear
          />
          <Typography.Text type="secondary" className="tw-text-xs tw-mt-2 tw-block">
            총 {filteredCompanies.length}개
          </Typography.Text>
        </div>
        <div className="tw-overflow-y-auto tw-flex-1">
          {filteredCompanies.length === 0 ? (
            <div className="tw-p-4 tw-text-xs tw-text-slate-400 tw-text-center">검색 결과 없음</div>
          ) : (
            filteredCompanies.map((c) => {
              const stats = statsByCompany[c.companyId];
              const isSelected = selectedCompany === c.companyId;
              return (
                <button
                  key={c.companyId}
                  type="button"
                  onClick={() => onSelectCompany(c.companyId)}
                  className={
                    'tw-w-full tw-text-left tw-px-3 tw-py-2.5 tw-border-b tw-border-slate-100 ' +
                    'hover:tw-bg-slate-50 tw-transition ' +
                    (isSelected ? 'tw-bg-blue-50' : '')
                  }
                >
                  <div className="tw-flex tw-items-center tw-justify-between tw-gap-2">
                    <Typography.Text
                      strong={isSelected}
                      className="tw-text-sm tw-truncate"
                      style={{ color: isSelected ? '#1677ff' : undefined }}
                    >
                      {c.companyName || c.companyId.slice(0, 8)}
                    </Typography.Text>
                    {stats ? (
                      <Space size={4}>
                        <Tag color="blue" className="!tw-text-xs !tw-mr-0">{stats.total}</Tag>
                        {stats.paused > 0 ? (
                          <Tag color="default" className="!tw-text-xs !tw-mr-0">중지 {stats.paused}</Tag>
                        ) : null}
                      </Space>
                    ) : null}
                  </div>
                  {c.businessNumber ? (
                    <Typography.Text type="secondary" className="tw-text-xs tw-block tw-mt-0.5">
                      {c.businessNumber}
                    </Typography.Text>
                  ) : null}
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* 우측 잡 테이블 */}
      <div className="tw-flex-1 tw-min-w-0">
        {selectedCompany ? (
          <>
            <Typography.Text strong className="tw-block tw-mb-2">
              {companies.find((c) => c.companyId === selectedCompany)?.companyName ?? selectedCompany}
              <Typography.Text type="secondary" className="tw-text-xs tw-ml-2">
                {selectedRows.length}건
              </Typography.Text>
            </Typography.Text>
            <Table<SaasSchedule>
              rowKey={(r) => r.jobKey}
              loading={isLoading}
              dataSource={selectedRows}
              columns={cols}
              pagination={false}
              size="small"
            />
          </>
        ) : (
          <Alert type="info" showIcon message="좌측에서 회사를 선택하면 그 회사의 자동 작업 목록이 표시됩니다." />
        )}
      </div>
    </div>
  );
}
