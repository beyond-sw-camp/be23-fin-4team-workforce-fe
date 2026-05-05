import { EditOutlined, ReloadOutlined, ScheduleOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Form, Input, InputNumber, Modal, Select, Space, Switch, Table, Tag, TimePicker, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useState } from 'react';
import { companyBatchScheduleApi, type CompanyBatchSchedule } from '@/features/salary-service/api/companyBatchScheduleApi';

type Frequency = 'hourly' | 'daily' | 'weekly' | 'monthly';
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
  const [sec, min, hour, day, month, dow] = parts;
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
} {
  const fallback = { frequency: 'daily' as Frequency, time: dayjs().hour(0).minute(0), dayOfMonth: 1, dayOfWeek: 2 };
  if (!expr) return fallback;
  const parts = expr.trim().split(/\s+/);
  if (parts.length < 6) return fallback;
  const [, min, hour, day, , dow] = parts;
  const time = dayjs().hour(Number(hour) || 0).minute(Number(min) || 0);
  if (hour === '*' && (day === '*' || day === '?') && (dow === '*' || dow === '?')) {
    return { frequency: 'hourly', time: dayjs().hour(0).minute(Number(min) || 0), dayOfMonth: 1, dayOfWeek: 2 };
  }
  if (/^\d+$/.test(day)) return { frequency: 'monthly', time, dayOfMonth: Number(day), dayOfWeek: 2 };
  if (/^\d+$/.test(dow)) return { frequency: 'weekly', time, dayOfMonth: 1, dayOfWeek: Number(dow) };
  return { ...fallback, time };
}

function formToCron(values: { frequency: Frequency; time: dayjs.Dayjs; dayOfMonth?: number; dayOfWeek?: number }): string {
  const h = values.time.hour();
  const m = values.time.minute();
  if (values.frequency === 'hourly') return `0 ${m} * * * ?`;
  if (values.frequency === 'daily') return `0 ${m} ${h} * * ?`;
  if (values.frequency === 'weekly') return `0 ${m} ${h} ? * ${values.dayOfWeek ?? 2}`;
  return `0 ${m} ${h} ${values.dayOfMonth ?? 1} * ?`;
}

const QK = ['salary', 'company-batch-schedule'] as const;

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
  const [form] = Form.useForm<{ frequency: Frequency; time: dayjs.Dayjs; dayOfMonth?: number; dayOfWeek?: number }>();
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
      title: '활성',
      key: 'active',
      width: 80,
      render: (_, row) => (
        <Switch
          checked={!row.paused}
          loading={toggleM.isPending && toggleM.variables?.jobKey === row.jobKey}
          onChange={(checked) => toggleM.mutate({ jobKey: row.jobKey, active: checked })}
        />
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
            <Typography.Text strong>{meta.name}</Typography.Text>
            {meta.description ? (
              <Typography.Text type="secondary" className="tw-text-xs">{meta.description}</Typography.Text>
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
        <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(row)}>시간 변경</Button>
      ),
    },
  ];

  return (
    <div className="tw-min-h-screen tw-bg-slate-50 tw-p-8">
      <div className="tw-mx-auto tw-max-w-6xl tw-space-y-6">
        <div className="tw-flex tw-items-center tw-justify-between">
          <Space align="center" size={12}>
            <ScheduleOutlined className="tw-text-2xl tw-text-blue-500" />
            <Typography.Title level={2} className="!tw-m-0">자동 작업 관리</Typography.Title>
          </Space>
          <Button icon={<ReloadOutlined />} onClick={() => void listQ.refetch()} loading={listQ.isFetching}>
            새로고침
          </Button>
        </div>

        <Alert
          type="info"
          showIcon
          message="우리 회사의 자동 작업 시각을 직접 조정할 수 있어요. 활성 토글로 끄거나 켜고, 시간 변경으로 실행 주기를 바꿀 수 있어요."
        />

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
          <Typography.Text type="secondary" className="tw-text-xs">총 {filtered.length}건</Typography.Text>
        </Space>

        <Table<CompanyBatchSchedule>
          rowKey={(r) => r.jobKey}
          loading={listQ.isLoading}
          dataSource={filtered}
          columns={cols}
          pagination={false}
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
            <Form.Item label="실행 주기" name="frequency" rules={[{ required: true }]} initialValue="daily">
              <Select
                onChange={(v) => {
                  if (v === 'weekly' && !form.getFieldValue('dayOfWeek')) form.setFieldValue('dayOfWeek', 2);
                  if (v === 'monthly' && !form.getFieldValue('dayOfMonth')) form.setFieldValue('dayOfMonth', 1);
                }}
                options={[
                  { value: 'hourly', label: '매시간' },
                  { value: 'daily', label: '매일' },
                  { value: 'weekly', label: '매주' },
                  { value: 'monthly', label: '매월' },
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
                <InputNumber min={1} max={31} addonAfter="일" style={{ width: '100%' }} />
              </Form.Item>
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
