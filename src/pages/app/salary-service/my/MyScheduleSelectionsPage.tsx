/** /app/attendance/schedules/my - 개인 근무 스케줄 (사원) */
import { useMemo, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  App,
  Button,
  Calendar,
  Card,
  DatePicker,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { approvalApi } from '@/features/approvals/api/approvalApi';
import { attendanceApi } from '@/features/salary-service/api/attendanceApi';
import type { DailyAttendance, FlexibleTimeSlot, MemberScheduleSelection, WorkSchedule } from '@/features/salary-service/types';

type FormValues = {
  targetYearMonth: dayjs.Dayjs;
  workScheduleId: string;
  slotId: string;
  requestReason?: string;
};

const STATUS_KO: Record<string, string> = {
  PENDING: '대기',
  APPROVED: '승인',
  REJECTED: '반려',
  CANCELLED: '취소',
  AUTO: '자동',
};

const SCHEDULE_SELECTION_PREFILL_STORAGE_KEY = 'wf-approval-prefill-schedule-selection';

function toHours(minutes?: number | null) {
  if (minutes == null) return '-';
  return `${(minutes / 60).toFixed(1)}h`;
}

export function MyScheduleSelectionsPage() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [form] = Form.useForm<FormValues>();
  const [openApplyModal, setOpenApplyModal] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => dayjs().startOf('month'));
  const yearMonth = calendarMonth.format('YYYY-MM');
  const monthFrom = calendarMonth.startOf('month').format('YYYY-MM-DD');
  const monthTo = calendarMonth.endOf('month').format('YYYY-MM-DD');
  const selectedScheduleId = Form.useWatch('workScheduleId', form);

  const schedulesQ = useQuery({
    queryKey: ['salary', 'work-schedules'],
    queryFn: () => attendanceApi.workSchedule.list(),
  });
  const docsQ = useQuery({
    queryKey: ['approval', 'documents', 'active'],
    queryFn: () => approvalApi.listActiveDocuments(),
  });
  const monthlyQ = useQuery({
    queryKey: ['salary', 'attendance', 'my', 'monthly-calendar', monthFrom, monthTo],
    queryFn: () => attendanceApi.attendance.getMyMonthly({ from: monthFrom, to: monthTo, page: 0, size: 31 }),
  });
  const slotsQ = useQuery({
    queryKey: ['salary', 'flexible-slots', selectedScheduleId],
    queryFn: () => attendanceApi.flexibleSlot.listByWorkSchedule(selectedScheduleId),
    enabled: Boolean(selectedScheduleId),
  });
  const currentQ = useQuery({
    queryKey: ['salary', 'schedule-selection', 'my', 'current', yearMonth],
    queryFn: () => attendanceApi.scheduleSelection.getMyCurrent(yearMonth),
  });
  const historyQ = useQuery({
    queryKey: ['salary', 'schedule-selection', 'my', 'history', yearMonth],
    queryFn: () => attendanceApi.scheduleSelection.getMyHistory(yearMonth),
  });

  const scheduleOptions = useMemo(
    () =>
      (schedulesQ.data ?? [])
        .filter((s: WorkSchedule) => s.workType === 'FLEXIBLE')
        .map((s) => ({ value: s.workScheduleId!, label: s.scheduleName ?? s.workScheduleId! })),
    [schedulesQ.data],
  );
  const slotOptions = useMemo(
    () =>
      (slotsQ.data ?? [])
        .filter((s: FlexibleTimeSlot) => s.delYn !== 'Y')
        .map((s) => ({
          value: s.slotId!,
          label: `${s.slotLabel ?? s.slotCode ?? s.slotId} ${s.isDefault ? '(기본)' : ''}`,
        })),
    [slotsQ.data],
  );
  const slotMap = useMemo(
    () => new Map((slotsQ.data ?? []).map((s) => [s.slotId ?? '', s.slotLabel ?? s.slotCode ?? s.slotId ?? '-'])),
    [slotsQ.data],
  );

  const createM = useMutation({
    mutationFn: (v: FormValues) =>
      attendanceApi.scheduleSelection.createMy({
        targetYearMonth: v.targetYearMonth.format('YYYY-MM'),
        slotId: v.slotId,
        requestReason: v.requestReason?.trim() || null,
      }),
    onSuccess: () => {
      message.success('스케줄 변경 신청이 등록되었습니다.');
      void qc.invalidateQueries({ queryKey: ['salary', 'schedule-selection', 'my'] });
    },
    onError: (e: Error) => message.error(e.message || '신청에 실패했습니다.'),
  });

  const cancelM = useMutation({
    mutationFn: (id: string) => attendanceApi.scheduleSelection.cancelMy(id),
    onSuccess: () => {
      message.success('신청이 철회되었습니다.');
      void qc.invalidateQueries({ queryKey: ['salary', 'schedule-selection', 'my'] });
    },
    onError: (e: Error) => message.error(e.message || '철회에 실패했습니다.'),
  });

  const approvedOrAuto = useMemo(
    () =>
      (historyQ.data ?? [])
        .filter((r) => r.approvalStatus === 'APPROVED' || r.approvalStatus === 'AUTO')
        .sort((a, b) => (b.targetYearMonth ?? '').localeCompare(a.targetYearMonth ?? '')),
    [historyQ.data],
  );
  const latestAppliedSelection = approvedOrAuto[0] ?? currentQ.data ?? null;
  const latestSlotLabel = latestAppliedSelection?.slotLabel
    ?? slotMap.get(latestAppliedSelection?.slotId ?? '')
    ?? latestAppliedSelection?.slotId
    ?? '-';

  const scheduleMap = useMemo(
    () =>
      new Map((schedulesQ.data ?? []).map((s) => [s.workScheduleId ?? '', s])),
    [schedulesQ.data],
  );
  const dailyMap = useMemo(() => {
    const map = new Map<string, DailyAttendance>();
    for (const row of monthlyQ.data?.content ?? []) {
      if (row.attendanceDate) map.set(row.attendanceDate, row);
    }
    return map;
  }, [monthlyQ.data]);

  const scheduleChangeDocId = useMemo(() => {
    const docs = docsQ.data ?? [];
    const exact = docs.find((d) => d.documentName.trim() === '출퇴근시간 변경 신청서');
    if (exact) return exact.documentId;
    const fuzzy = docs.find((d) => d.documentName.includes('출퇴근시간 변경'));
    return fuzzy?.documentId;
  }, [docsQ.data]);

  const openApply = () => {
    form.resetFields();
    form.setFieldsValue({ targetYearMonth: calendarMonth, workScheduleId: selectedScheduleId, slotId: undefined, requestReason: '' });
    setOpenApplyModal(true);
  };

  const submitToApprovals = (v: FormValues) => {
    if (!scheduleChangeDocId) {
      message.error('출퇴근시간 변경 신청서 양식을 찾을 수 없습니다. 전자결재 양식 설정을 확인해 주세요.');
      return;
    }
    sessionStorage.setItem(
      SCHEDULE_SELECTION_PREFILL_STORAGE_KEY,
      JSON.stringify({
        targetYearMonth: v.targetYearMonth.format('YYYY-MM'),
        slotId: v.slotId,
        requestReason: v.requestReason?.trim() || null,
      }),
    );
    setOpenApplyModal(false);
    void navigate({
      to: '/app/approvals',
      search: { tab: 'compose', docId: scheduleChangeDocId },
    });
  };

  const columns = useMemo<ColumnsType<MemberScheduleSelection>>(
    () => [
      { title: '대상월', dataIndex: 'targetYearMonth', key: 'targetYearMonth', width: 110 },
      { title: '신청 스케줄', key: 'slot', render: (_, r) => slotMap.get(r.slotId ?? '') ?? r.slotId ?? '-' },
      { title: '사유', dataIndex: 'requestReason', key: 'requestReason', ellipsis: true },
      { title: '상태', dataIndex: 'approvalStatus', key: 'approvalStatus', width: 100, render: (v) => <Tag>{STATUS_KO[v ?? ''] ?? (v ?? '-')}</Tag> },
      {
        title: '액션',
        key: 'action',
        width: 90,
        render: (_, r) =>
          r.selectionId && r.approvalStatus === 'PENDING' ? (
            <Popconfirm title="신청을 철회할까요?" onConfirm={() => cancelM.mutate(r.selectionId!)}>
              <Button danger size="small">철회</Button>
            </Popconfirm>
          ) : '-',
      },
    ],
    [cancelM, slotMap],
  );

  return (
    <Space direction="vertical" className="tw-w-full" size={16}>
      <div className="tw-flex tw-flex-wrap tw-items-start tw-justify-between tw-gap-3">
        <div>
          <Typography.Title level={4} className="!tw-m-0">개인 근무 스케줄(기본근로시간제)</Typography.Title>
          <Typography.Paragraph type="secondary" className="!tw-mt-1 !tw-mb-0">
            월별 달력으로 스케줄과 근무 현황을 확인하고, 스케줄 변경 신청을 전자결재로 바로 연동합니다.
          </Typography.Paragraph>
        </div>
        <Space>
          <DatePicker
            picker="month"
            value={calendarMonth}
            format="YYYY-MM"
            allowClear={false}
            onChange={(v) => v && setCalendarMonth(v.startOf('month'))}
          />
          <Button type="primary" onClick={openApply}>
            스케줄 변경 신청
          </Button>
        </Space>
      </div>

      <Card title="개인 근무 스케줄" className="tw-border-slate-200/80 tw-shadow-sm" loading={monthlyQ.isLoading}>
        <Calendar
          value={calendarMonth}
          mode="month"
          fullscreen={false}
          headerRender={({ value, onChange }) => (
            <div className="tw-mb-3 tw-flex tw-items-center tw-justify-center tw-gap-3">
              <Button
                size="small"
                onClick={() => onChange(value.clone().subtract(1, 'month').startOf('month'))}
              >
                이전
              </Button>
              <Typography.Text className="tw-text-lg tw-font-semibold tw-text-slate-800">
                {value.format('YYYY년 M월')}
              </Typography.Text>
              <Button
                size="small"
                onClick={() => onChange(value.clone().add(1, 'month').startOf('month'))}
              >
                다음
              </Button>
            </div>
          )}
          onPanelChange={(d, m) => {
            if (m === 'month') setCalendarMonth(d.startOf('month'));
          }}
          dateFullCellRender={(date) => {
            const iso = date.format('YYYY-MM-DD');
            const inMonth = date.month() === calendarMonth.month();
            const daily = dailyMap.get(iso);
            const schedule = daily?.workScheduleId ? scheduleMap.get(daily.workScheduleId) : null;
            const scheduleText = schedule
              ? `${schedule.scheduleName ?? '근무'} (${schedule.startTime ?? '-'} ~ ${schedule.endTime ?? '-'})`
              : latestSlotLabel !== '-'
                ? latestSlotLabel
                : '스케줄 정보 없음';
            return (
              <div
                className={`tw-h-full tw-min-h-[102px] tw-rounded tw-border tw-p-2 ${
                  inMonth ? 'tw-border-slate-200 tw-bg-white' : 'tw-border-slate-100 tw-bg-slate-50'
                }`}
              >
                <div className={`tw-mb-1 tw-text-xs tw-font-semibold ${inMonth ? 'tw-text-slate-700' : 'tw-text-slate-400'}`}>
                  {date.date()}
                </div>
                <div className="tw-line-clamp-2 tw-text-[11px] tw-text-emerald-700">{scheduleText}</div>
                <div className="tw-mt-1 tw-text-[11px] tw-text-slate-600">
                  상태: {STATUS_KO[daily?.status ?? ''] ?? daily?.status ?? '-'}
                </div>
                <div className="tw-text-[11px] tw-text-slate-500">
                  근무: {toHours(daily?.workedMinutes)}
                </div>
                <div className="tw-text-[11px] tw-text-slate-500">
                  연장: {toHours(daily?.overtimeMinutes)}
                </div>
              </div>
            );
          }}
        />
      </Card>

      <Card title="현재 적용 슬롯" className="tw-border-slate-200/80 tw-shadow-sm" loading={currentQ.isLoading}>
        {latestAppliedSelection ? (
          <Space size={24}>
            <Typography.Text>대상월: {latestAppliedSelection.targetYearMonth ?? '-'}</Typography.Text>
            <Typography.Text>스케줄: {latestSlotLabel}</Typography.Text>
            <Typography.Text>상태: <Tag>{STATUS_KO[latestAppliedSelection.approvalStatus ?? ''] ?? (latestAppliedSelection.approvalStatus ?? '-')}</Tag></Typography.Text>
          </Space>
        ) : (
          <Typography.Text type="secondary">현재 적용 스케줄이 없습니다.</Typography.Text>
        )}
      </Card>

      <Card title="변경 신청 이력" className="tw-border-slate-200/80 tw-shadow-sm" loading={historyQ.isLoading}>
        <Table<MemberScheduleSelection>
          rowKey={(r) => r.selectionId ?? `${r.targetYearMonth}-${r.createdAt}`}
          dataSource={historyQ.data ?? []}
          columns={columns}
          pagination={{ pageSize: 10 }}
          scroll={{ x: 860 }}
          locale={{ emptyText: '신청/이력 데이터가 없습니다.' }}
        />
      </Card>

      <Modal
        open={openApplyModal}
        onCancel={() => setOpenApplyModal(false)}
        onOk={() => form.submit()}
        okText="전자결재로 이동"
        cancelText="취소"
        title="스케줄 변경 신청"
        destroyOnClose
        confirmLoading={createM.isPending}
      >
        <Form<FormValues>
          form={form}
          layout="vertical"
          initialValues={{ targetYearMonth: calendarMonth }}
          onFinish={submitToApprovals}
        >
          <Form.Item name="targetYearMonth" label="대상월" rules={[{ required: true }]}>
            <DatePicker picker="month" format="YYYY-MM" className="tw-w-full" />
          </Form.Item>
          <Form.Item name="workScheduleId" label="기준 스케줄" rules={[{ required: true }]}>
            <Select options={scheduleOptions} loading={schedulesQ.isLoading} />
          </Form.Item>
          <Form.Item name="slotId" label="신청 슬롯" rules={[{ required: true }]}>
            <Select options={slotOptions} loading={slotsQ.isLoading} />
          </Form.Item>
          <Form.Item name="requestReason" label="신청 사유" rules={[{ required: true, message: '사유를 입력하세요.' }]}>
            <Input.TextArea rows={3} maxLength={300} showCount />
          </Form.Item>
          <Typography.Paragraph type="secondary" className="!tw-mb-0 !tw-text-xs">
            확인을 누르면 전자결재 작성 화면으로 이동하고, 입력한 값이 출퇴근시간 변경 신청서에 자동 입력됩니다.
          </Typography.Paragraph>
        </Form>
      </Modal>
    </Space>
  );
}
