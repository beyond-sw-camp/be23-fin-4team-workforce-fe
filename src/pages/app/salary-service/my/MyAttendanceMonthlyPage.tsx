/** /app/attendance/monthly — 내 월별 일자별 근태 + 출퇴근 정정 신청 */
import { Link } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  App,
  Button,
  Card,
  DatePicker,
  Form,
  Input,
  Table,
  Tag,
  TimePicker,
  Tooltip,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { type Dayjs } from 'dayjs';
import { useCallback, useMemo, useState } from 'react';
import { attendanceApi } from '@/features/salary-service/api/attendanceApi';
import { normalizeSpringPage } from '@/features/salary-service/lib/normalizePage';
import type {
  CorrectionStateCode,
  DailyAttendance,
  MissingAttendanceSuspect,
} from '@/features/salary-service/types';
import { AttendanceStatusTag } from '@/features/salary-service/ui/AttendanceStatusTag';
import { AppDoubleActionModal } from '@/shared/ui/AppDoubleActionModal';

type CorrectionFormValues = {
  attendanceDate: Dayjs;
  clockIn?: Dayjs | null;
  clockOut?: Dayjs | null;
  reason: string;
};

export function MyAttendanceMonthlyPage() {
  const [month, setMonth] = useState<Dayjs>(() => dayjs().startOf('month'));
  const [page, setPage] = useState(0);
  const pageSize = 31;
  const from = month.startOf('month').format('YYYY-MM-DD');
  const to = month.endOf('month').format('YYYY-MM-DD');

  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [correctionOpen, setCorrectionOpen] = useState(false);
  /** null 이면 최근 7일 내 임의 일자 선택(표에서 정정 요청 등). 비어 있지 않으면 해당 일자만 선택 가능. */
  const [correctionAllowedDates, setCorrectionAllowedDates] = useState<Set<string> | null>(null);
  const [form] = Form.useForm<CorrectionFormValues>();

  const listQ = useQuery({
    queryKey: ['salary', 'attendance', 'my', 'monthly', from, to, page, pageSize],
    queryFn: () =>
      attendanceApi.attendance.getMyMonthly({
        from,
        to,
        page,
        size: pageSize,
      }),
  });

  // 정정 가능 윈도우 안의 누락 후보 (휴가·휴직 복귀 안전망)
  const missingQ = useQuery({
    queryKey: ['salary', 'attendance', 'correction', 'my', 'missing'],
    queryFn: () => attendanceApi.attendance.correction.listMyMissing(),
    staleTime: 30_000,
  });

  const REASON_LABEL: Record<MissingAttendanceSuspect['reasonCode'], string> = {
    NO_RECORD: '출·퇴근 둘 다 미체크',
    CLOCK_IN_MISSING: '출근 미체크',
    CLOCK_OUT_MISSING: '퇴근 미체크',
  };

  const normalized = useMemo(() => normalizeSpringPage(listQ.data), [listQ.data]);

  const correctionMut = useMutation({
    mutationFn: (vals: CorrectionFormValues) => {
      const dateStr = vals.attendanceDate.format('YYYY-MM-DD');
      const composeIso = (t: Dayjs | null | undefined) =>
        t ? `${dateStr}T${t.format('HH:mm:00')}` : null;
      return attendanceApi.attendance.correction.request({
        attendanceDate: dateStr,
        requestedClockIn: composeIso(vals.clockIn),
        requestedClockOut: composeIso(vals.clockOut),
        reason: vals.reason,
      });
    },
    onSuccess: () => {
      void message.success('정정 신청이 접수되었습니다. 관리자 검토 후 반영됩니다.');
      setCorrectionOpen(false);
      setCorrectionAllowedDates(null);
      form.resetFields();
      void queryClient.invalidateQueries({ queryKey: ['salary', 'attendance', 'my', 'monthly'] });
      void queryClient.invalidateQueries({
        queryKey: ['salary', 'attendance', 'correction', 'my', 'missing'],
      });
    },
    onError: (err: unknown) => {
      const e = err as { response?: { data?: { message?: string } } };
      void message.error(e?.response?.data?.message ?? '정정 신청에 실패했습니다.');
    },
  });

  const missingDateSet = useMemo(
    () => new Set((missingQ.data ?? []).map((m) => m.date)),
    [missingQ.data],
  );

  const closeCorrectionModal = useCallback(() => {
    setCorrectionOpen(false);
    setCorrectionAllowedDates(null);
    form.resetFields();
  }, [form]);

  const columns: ColumnsType<DailyAttendance> = useMemo(
    () => [
      { title: '일자', dataIndex: 'attendanceDate', key: 'attendanceDate' },
      {
        title: '상태',
        dataIndex: 'status',
        key: 'status',
        render: (s: string) => <AttendanceStatusTag status={s} />,
      },
      {
        title: '출근',
        dataIndex: 'firstClockIn',
        key: 'firstClockIn',
        render: (v?: string | null) => (v ? dayjs(v).format('HH:mm') : '—'),
      },
      {
        title: '퇴근',
        dataIndex: 'lastClockOut',
        key: 'lastClockOut',
        render: (v?: string | null) => (v ? dayjs(v).format('HH:mm') : '—'),
      },
      { title: '근무(분)', dataIndex: 'workedMinutes', key: 'workedMinutes' },
      { title: '연장(분)', dataIndex: 'overtimeMinutes', key: 'overtimeMinutes' },
      {
        title: '정정',
        key: 'correction',
        width: 120,
        align: 'center',
        render: (_, row) => {
          const state: CorrectionStateCode = row.correctionState ?? 'NORMAL';

          // 검토중 — 라벨만
          if (state === 'PENDING') {
            return <Tag color="gold">요청중</Tag>;
          }
          // 정정 완료 — 라벨만
          if (state === 'COMPLETED') {
            return <Tag color="green">정정 완료</Tag>;
          }
          // 이상 — 정정 요청 버튼 활성
          if (state === 'ABNORMAL' && row.closureStatus !== 'LOCKED') {
            return (
              <Button
                size="small"
                type="link"
                onClick={() => {
                  const allow = new Set(missingDateSet);
                  if (row.attendanceDate) allow.add(row.attendanceDate);
                  setCorrectionAllowedDates(allow.size > 0 ? allow : null);
                  form.setFieldsValue({
                    attendanceDate: row.attendanceDate ? dayjs(row.attendanceDate) : dayjs(),
                    clockIn: row.firstClockIn ? dayjs(row.firstClockIn) : null,
                    clockOut: row.lastClockOut ? dayjs(row.lastClockOut) : null,
                    reason: '',
                  });
                  setCorrectionOpen(true);
                }}
              >
                정정 요청
              </Button>
            );
          }
          // 정상 또는 잠금 — 액션 없음
          return <Typography.Text type="secondary">—</Typography.Text>;
        },
      },
    ],
    [form, missingDateSet],
  );

  return (
    <div className="tw-space-y-4">
      <div className="tw-flex tw-flex-wrap tw-items-start tw-justify-between tw-gap-3">
        <div>
          <Typography.Title level={4} className="!tw-m-0 !tw-text-slate-900">
            내 근태(월별)
          </Typography.Title>
          <Typography.Paragraph type="secondary" className="!tw-mb-0 !tw-mt-1 !tw-text-sm">
            해당 월의 일자별 근태·근무 현황입니다. 출퇴근을 잘못 찍었거나 미체크한 날은 7일 이내 정정 요청이 가능합니다.
          </Typography.Paragraph>
        </div>
        <div className="tw-flex tw-gap-2">
          <Tooltip
            title={
              (missingQ.data?.length ?? 0) === 0
                ? '근태 이상이 감지된 날짜가 없습니다. 정정이 모두 완료되었거나 신청할 항목이 없습니다.'
                : `정정이 필요한 일자가 ${missingQ.data!.length}건 있습니다.`
            }
          >
            <Button
              type="primary"
              disabled={(missingQ.data?.length ?? 0) === 0}
              onClick={() => {
                form.resetFields();
                setCorrectionAllowedDates(new Set(missingDateSet));
                // 첫 번째 누락 후보 일자를 자동으로 채워줌 — UX 친화
                const first = missingQ.data?.[0];
                form.setFieldValue(
                  'attendanceDate',
                  first ? dayjs(first.date) : dayjs().subtract(1, 'day'),
                );
                setCorrectionOpen(true);
              }}
            >
              정정 신청하기
            </Button>
          </Tooltip>
          <Link to="/app/attendance">
            <Button type="default">일별·출퇴근</Button>
          </Link>
        </div>
      </div>

      {/* ─── 누락 후보 배너 (휴가/휴직 복귀 안전망) ─── */}
      {(missingQ.data?.length ?? 0) > 0 && (
        <Alert
          type="warning"
          showIcon
          message={`정정이 필요할 수 있는 일자가 ${missingQ.data!.length}일 있어요`}
          description={
            <div className="tw-space-y-1">
              {missingQ.data!.slice(0, 5).map((m) => (
                <div key={m.date} className="tw-flex tw-items-center tw-gap-2 tw-text-sm">
                  <Tag color="orange">{m.date}</Tag>
                  <span className="tw-text-slate-600">{REASON_LABEL[m.reasonCode]}</span>
                  <Button
                    size="small"
                    type="link"
                    onClick={() => {
                      form.resetFields();
                      setCorrectionAllowedDates(new Set(missingDateSet));
                      form.setFieldsValue({
                        attendanceDate: dayjs(m.date),
                        clockIn: null,
                        clockOut: null,
                        reason: '',
                      });
                      setCorrectionOpen(true);
                    }}
                  >
                    정정 신청 →
                  </Button>
                </div>
              ))}
              {missingQ.data!.length > 5 && (
                <Typography.Text type="secondary" className="!tw-text-xs">
                  외 {missingQ.data!.length - 5}일 — 표에서 직접 확인 후 정정 신청 가능합니다.
                </Typography.Text>
              )}
            </div>
          }
        />
      )}

      <Card className="tw-border-slate-200/80 tw-shadow-sm" title="조회 월">
        <DatePicker
          picker="month"
          value={month}
          onChange={(d) => {
            if (d) {
              setMonth(d.startOf('month'));
              setPage(0);
            }
          }}
          allowClear={false}
        />
      </Card>

      <Card className="tw-border-slate-200/80 tw-shadow-sm" title="일자별">
        {listQ.isError && (
          <Alert
            type="error"
            showIcon
            className="tw-mb-3"
            message="근태 월별 조회에 실패했습니다."
            description="잠시 후 다시 시도해 주세요."
          />
        )}
        <Table<DailyAttendance>
          rowKey={(r) => r.dailyAttendanceId ?? `${r.attendanceDate}-${r.status}`}
          loading={listQ.isLoading}
          columns={columns}
          dataSource={normalized.content}
          size="small"
          pagination={{
            current: normalized.page + 1,
            pageSize: normalized.pageSize,
            total: normalized.totalElements,
            showSizeChanger: false,
            onChange: (p) => setPage(p - 1),
          }}
        />
      </Card>

      {/* ─── 정정 신청 모달 ─── */}
      <AppDoubleActionModal
        open={correctionOpen}
        title="출퇴근 정정 신청"
        onClose={closeCorrectionModal}
        onConfirm={() => form.submit()}
        confirmText="신청"
        cancelText="취소"
        confirmLoading={correctionMut.isPending}
        destroyOnHidden
      >
        <div className="tw-px-5 tw-py-4">
        <Alert
          type="info"
          showIcon
          className="tw-mb-3"
          message={
            correctionAllowedDates && correctionAllowedDates.size > 0
              ? '출근·퇴근 시각 중 한 가지 이상과 사유는 필수입니다. 정정 일자는 위에 안내된 정정 후보 일자만 선택할 수 있으며, 최근 7일 이내여야 합니다.'
              : '출근·퇴근 시각 중 한 가지 이상 + 사유는 필수예요. 최근 7일 이내만 신청 가능합니다.'
          }
        />
        <Form
          form={form}
          layout="vertical"
          onFinish={(vals) => correctionMut.mutate(vals)}
        >
          <Form.Item
            name="attendanceDate"
            label="정정 일자"
            rules={[
              { required: true, message: '일자는 필수입니다.' },
              {
                validator: (_, value: Dayjs | undefined) => {
                  if (!value) return Promise.resolve();
                  const ds = value.format('YYYY-MM-DD');
                  const outOfWeek =
                    value.isAfter(dayjs(), 'day') ||
                    value.isBefore(dayjs().subtract(7, 'day'), 'day');
                  if (outOfWeek) {
                    return Promise.reject(new Error('최근 7일 이내 일자만 신청할 수 있습니다.'));
                  }
                  if (correctionAllowedDates && correctionAllowedDates.size > 0 && !correctionAllowedDates.has(ds)) {
                    return Promise.reject(new Error('정정이 필요한 일자만 선택할 수 있습니다.'));
                  }
                  return Promise.resolve();
                },
              },
            ]}
          >
            <DatePicker
              style={{ width: '100%' }}
              disabledDate={(d) => {
                const ds = d.format('YYYY-MM-DD');
                const outOfWeek =
                  d.isAfter(dayjs(), 'day') || d.isBefore(dayjs().subtract(7, 'day'), 'day');
                if (outOfWeek) return true;
                if (correctionAllowedDates && correctionAllowedDates.size > 0) {
                  return !correctionAllowedDates.has(ds);
                }
                return false;
              }}
              format="YYYY-MM-DD"
            />
          </Form.Item>

          <div className="tw-grid tw-grid-cols-2 tw-gap-3">
            <Form.Item name="clockIn" label="출근 시각 (선택)">
              <TimePicker
                format="HH:mm"
                style={{ width: '100%' }}
                minuteStep={5}
              />
            </Form.Item>
            <Form.Item name="clockOut" label="퇴근 시각 (선택)">
              <TimePicker
                format="HH:mm"
                style={{ width: '100%' }}
                minuteStep={5}
              />
            </Form.Item>
          </div>

          <Form.Item
            name="reason"
            label="사유"
            rules={[{ required: true, message: '사유는 필수입니다.' }]}
          >
            <Input.TextArea
              rows={3}
              placeholder="예: 회의 후 외근으로 퇴근 미체크"
              maxLength={100}
              showCount
            />
          </Form.Item>
        </Form>
        </div>
      </AppDoubleActionModal>
    </div>
  );
}
