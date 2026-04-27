/** /app/attendance/holidays — 회사 공휴일 CRUD (시스템 관리자), 월 달력 표시 */
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  App,
  Alert,
  Button,
  Calendar,
  Card,
  DatePicker,
  Form,
  InputNumber,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Spin,
  Tag,
  Typography,
} from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import type { CalendarProps } from 'antd';
import clsx from 'clsx';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';
import { attendanceApi } from '@/features/salary-service/api/attendanceApi';
import type { CompanyHoliday } from '@/features/salary-service/types';

type FormValues = {
  holidayDate: dayjs.Dayjs;
  holidayName: string;
  isPaidYn: 'Y' | 'N';
};

const QK = ['salary', 'company-holidays'] as const;

const WEEKDAY_KO = ['일', '월', '화', '수', '목', '금', '토'] as const;

function sortHolidaysByDate(list: CompanyHoliday[]): CompanyHoliday[] {
  return [...list].sort((a, b) => (a.holidayDate ?? '').localeCompare(b.holidayDate ?? ''));
}

function holidayDayKey(h: CompanyHoliday): string {
  const raw = h.holidayDate;
  if (raw == null || raw === '') return '';
  if (typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const d = dayjs(raw as string);
  return d.isValid() ? d.format('YYYY-MM-DD') : '';
}

function holidaysOnDay(list: CompanyHoliday[], day: Dayjs): CompanyHoliday[] {
  const key = day.format('YYYY-MM-DD');
  return list.filter((h) => holidayDayKey(h) === key);
}

function apiErrorMessage(e: unknown): string {
  if (typeof e === 'object' && e !== null && 'message' in e) {
    const m = (e as { message?: unknown }).message;
    if (typeof m === 'string' && m.trim()) return m;
  }
  if (e instanceof Error) return e.message;
  return '요청에 실패했습니다.';
}

export function AdminCompanyHolidaysPage() {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<CompanyHoliday | null>(null);
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm<FormValues>();
  const [refreshYear, setRefreshYear] = useState<number>(dayjs().year());
  const [panelMonth, setPanelMonth] = useState<Dayjs>(() => dayjs().startOf('month'));
  const [selectedDay, setSelectedDay] = useState<Dayjs>(() => dayjs());

  const listQ = useQuery({
    queryKey: QK,
    queryFn: () => attendanceApi.companyHoliday.list(),
  });

  const holidays = listQ.data ?? [];

  const createM = useMutation({
    mutationFn: (v: FormValues) =>
      attendanceApi.companyHoliday.create({
        holidayDate: v.holidayDate.format('YYYY-MM-DD'),
        holidayName: v.holidayName.trim(),
        isPaidYn: v.isPaidYn,
      }),
    onSuccess: (created) => {
      message.success('공휴일이 등록되었습니다.');
      setOpen(false);
      form.resetFields();
      qc.setQueryData<CompanyHoliday[]>(QK, (old) =>
        sortHolidaysByDate([...(old ?? []), created]),
      );
    },
    onError: (e: unknown) => message.error(apiErrorMessage(e) || '등록에 실패했습니다.'),
  });

  const updateM = useMutation({
    mutationFn: (input: { id: string; v: FormValues }) =>
      attendanceApi.companyHoliday.update(input.id, {
        holidayDate: input.v.holidayDate.format('YYYY-MM-DD'),
        holidayName: input.v.holidayName.trim(),
        isPaidYn: input.v.isPaidYn,
      }),
    onSuccess: (updated) => {
      message.success('공휴일이 수정되었습니다.');
      setOpen(false);
      setEditing(null);
      form.resetFields();
      qc.setQueryData<CompanyHoliday[]>(QK, (old) => {
        const prev = old ?? [];
        const id = updated.companyHolidayId;
        const idx = id ? prev.findIndex((h) => h.companyHolidayId === id) : -1;
        if (idx < 0) return sortHolidaysByDate([...prev, updated]);
        const next = [...prev];
        next[idx] = { ...next[idx], ...updated };
        return sortHolidaysByDate(next);
      });
    },
    onError: (e: unknown) => message.error(apiErrorMessage(e) || '수정에 실패했습니다.'),
  });

  const deleteM = useMutation({
    mutationFn: (id: string) => attendanceApi.companyHoliday.delete(id),
    onSuccess: (_void, deletedId) => {
      message.success('삭제되었습니다.');
      qc.setQueryData<CompanyHoliday[]>(QK, (old) =>
        (old ?? []).filter((h) => h.companyHolidayId !== deletedId),
      );
    },
    onError: (e: unknown) => message.error(apiErrorMessage(e) || '삭제에 실패했습니다.'),
  });

  const refreshLegalM = useMutation({
    mutationFn: (year: number) => attendanceApi.companyHoliday.refreshLegal(year),
    onSuccess: (res) => {
      /*
       * 백엔드는 외부 공공 API 응답이 비어있어도 200 + importedCount=0 으로 돌려주므로
       * count 기반으로 success/warning 분기.
       *  - 성공: 가져온 건수 표시
       *  - 0건 + 미래 연도: 아직 공공 API 에 데이터 없음 (통상 익년 11~12월 공개)
       *  - 0건 + 과거/현재 연도: 수집 실패 의심 (XML 파싱 오류, ServiceKey 등) → 백엔드 로그 확인 필요
       */
      if (res.importedCount > 0) {
        message.success(`${res.year}년 법정 공휴일 ${res.importedCount}건 반영되었습니다.`);
      } else {
        const currentYear = dayjs().year();
        if (res.year > currentYear) {
          message.warning(
            `${res.year}년 법정 공휴일 데이터가 공공 API 에 아직 없습니다. 통상 익년 데이터는 그 해 11~12월에 공개됩니다.`,
          );
        } else {
          message.warning({
            content: `${res.year}년 법정 공휴일 수집 결과가 0건입니다. 공공 데이터포털 응답 오류일 수 있어요. 관리자 (member-service) 로그를 확인해 주세요.`,
            duration: 6,
          });
        }
      }
      void qc.invalidateQueries({ queryKey: QK });
    },
    onError: (e: unknown) => message.error(apiErrorMessage(e) || '법정 공휴일 새로고침에 실패했습니다.'),
  });

  const dayHolidays = useMemo(() => holidaysOnDay(holidays, selectedDay), [holidays, selectedDay]);

  const openCreateForDay = (d: Dayjs) => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ holidayDate: d, isPaidYn: 'Y' });
    setOpen(true);
  };

  const openEdit = (record: CompanyHoliday) => {
    setEditing(record);
    setOpen(true);
    form.setFieldsValue({
      holidayDate: record.holidayDate ? dayjs(holidayDayKey(record) || record.holidayDate) : dayjs(),
      holidayName: record.holidayName ?? '',
      isPaidYn: (record.isPaidYn as 'Y' | 'N') ?? 'Y',
    });
  };

  const cellRender: CalendarProps<Dayjs>['cellRender'] = (current, info) => {
    if (!info || info.type !== 'date') return info?.originNode ?? null;
    const list = holidaysOnDay(holidays, current);
    const isSelected = current.isSame(selectedDay, 'day');
    const isCurrentMonth = current.month() === panelMonth.month();
    const isToday = current.isSame(dayjs(), 'day');

    return (
      <div
        className={clsx(
          'tw-flex tw-min-h-[96px] tw-flex-col tw-gap-1 tw-rounded-md tw-border tw-border-transparent tw-p-0.5',
          isSelected && 'tw-border-blue-400 tw-bg-blue-50/50',
          !isCurrentMonth && 'tw-opacity-40',
        )}
      >
        <span
          className={clsx(
            'tw-inline-flex tw-h-6 tw-min-w-6 tw-shrink-0 tw-items-center tw-justify-center tw-rounded-full tw-px-1 tw-text-[13px] tw-font-semibold tw-tabular-nums tw-leading-none',
            isToday ? 'tw-bg-slate-900 tw-text-white' : 'tw-text-slate-800',
          )}
        >
          {current.date()}
        </span>
        {list.length === 0 ? (
          <span className="tw-text-[10px] tw-text-slate-300">—</span>
        ) : (
          <ul className="tw-m-0 tw-min-h-0 tw-list-none tw-space-y-0.5 tw-p-0">
            {list.slice(0, 3).map((h) => (
              <li key={h.companyHolidayId ?? `${h.holidayDate}-${h.holidayName}`}>
                <button
                  type="button"
                  className="tw-block tw-w-full tw-truncate tw-rounded tw-border-0 tw-bg-rose-50 tw-px-1 tw-py-0.5 tw-text-left tw-text-[11px] tw-font-medium tw-text-rose-700 tw-outline-none hover:tw-bg-rose-100"
                  title={h.holidayName ?? ''}
                  onClick={(ev) => {
                    ev.preventDefault();
                    ev.stopPropagation();
                    setSelectedDay(current);
                    openEdit(h);
                  }}
                >
                  {h.holidayName}
                </button>
              </li>
            ))}
          </ul>
        )}
        {list.length > 3 ? (
          <span className="tw-text-[10px] tw-text-slate-400">+{list.length - 3}</span>
        ) : null}
      </div>
    );
  };

  const handleHolidayModalOk = () =>
    form.validateFields().then(
      (v) =>
        new Promise<void>((resolve, reject) => {
          if (editing?.companyHolidayId) {
            updateM.mutate(
              { id: editing.companyHolidayId, v },
              { onSuccess: () => resolve(), onError: (err) => reject(err) },
            );
          } else {
            createM.mutate(v, { onSuccess: () => resolve(), onError: (err) => reject(err) });
          }
        }),
    );

  const calendarLoading = listQ.isLoading || listQ.isFetching;

  return (
    <Space direction="vertical" className="tw-w-full" size={16}>
      <div className="tw-flex tw-flex-wrap tw-items-start tw-justify-between tw-gap-4">
        <div className="tw-min-w-0 tw-flex-1">
          <Typography.Title level={4} className="!tw-m-0 !tw-text-slate-900">
            회사 공휴일 관리
          </Typography.Title>
          <Typography.Text type="secondary" className="tw-text-xs">
            월별 달력에서 공휴일을 확인합니다. 직접 등록한 휴일은 법정 공휴일만 다시 불러와도 유지됩니다.
          </Typography.Text>
        </div>
        <Button type="primary" onClick={() => openCreateForDay(selectedDay)}>
          공휴일 추가
        </Button>
      </div>

      <Card
        size="small"
        className="tw-border-indigo-200/80 tw-bg-indigo-50/40 tw-shadow-sm"
        title={
          <Space size={8}>
            <span className="tw-text-sm tw-font-semibold tw-text-indigo-950">법정 공휴일 불러오기</span>
            <Tag color="blue" className="tw-m-0">
              API 연동
            </Tag>
          </Space>
        }
      >
        <Typography.Paragraph type="secondary" className="!tw-mb-3 !tw-mt-0 !tw-text-xs">
          아래 연도는{' '}
          <Typography.Text strong className="tw-text-slate-700">
            법정 공휴일만
          </Typography.Text>
          {' '}
          다시 수집할 때만 사용됩니다. 달력에서 보는 월과는 별도로, 가져올 연도를 지정한 뒤 새로고침하세요.
        </Typography.Paragraph>
        <Space wrap className="tw-w-full" align="center" size="middle">
          <Space align="center" size={8}>
            <Typography.Text className="tw-text-xs tw-font-medium tw-text-slate-600">법정 공휴일 대상 연도</Typography.Text>
            <InputNumber
              value={refreshYear}
              min={2020}
              max={dayjs().year() + 1}
              onChange={(v) => setRefreshYear(typeof v === 'number' ? v : dayjs().year())}
              style={{ width: 120 }}
              addonAfter="년"
            />
          </Space>
          <Popconfirm
            title={`${refreshYear}년 법정 공휴일을 새로 불러올까요?`}
            description="직접 등록한 회사 휴일은 유지되고, 법정 공휴일만 해당 연도 기준으로 갱신됩니다."
            okText="새로고침"
            cancelText="취소"
            onConfirm={() => refreshLegalM.mutate(refreshYear)}
          >
            <Button icon={<ReloadOutlined />} loading={refreshLegalM.isPending} type="default" className="tw-border-indigo-300 tw-bg-white">
              법정 공휴일 새로고침
            </Button>
          </Popconfirm>
        </Space>
      </Card>

      {listQ.isError ? (
        <Alert
          type="error"
          showIcon
          message="공휴일 목록을 불러오지 못했습니다."
          description={apiErrorMessage(listQ.error)}
        />
      ) : null}

      <div className="tw-grid tw-min-h-0 tw-flex-1 tw-gap-4 lg:tw-grid-cols-[1fr_min(100%,380px)]">
        <Card className="tw-border-slate-200/80 tw-shadow-sm" styles={{ body: { padding: 12 } }}>
          <Spin spinning={calendarLoading}>
            <Calendar
              className="[&_.ant-picker-calendar-date-value]:tw-hidden [&_.ant-picker-content_td]:tw-px-1 [&_.ant-picker-cell-inner]:tw-min-h-[120px] [&_.ant-picker-calendar-date]:tw-w-full [&_.ant-picker-cell-selected::before]:!tw-border-0 [&_.ant-picker-cell-selected_.ant-picker-calendar-date]:!tw-bg-transparent [&_.ant-picker-cell-selected_.ant-picker-calendar-date]:!tw-shadow-none [&_.ant-picker-cell-today_.ant-picker-calendar-date]:!tw-bg-transparent [&_.ant-picker-cell-today_.ant-picker-calendar-date]:!tw-shadow-none"
              fullscreen={false}
              value={panelMonth}
              onChange={(d) => {
                const m = d.startOf('month');
                setPanelMonth(m);
                setSelectedDay(d);
              }}
              onPanelChange={(d) => {
                const m = d.startOf('month');
                setPanelMonth(m);
              }}
              cellRender={cellRender}
              headerRender={({ value, onChange }) => (
                <div className="tw-mb-3 tw-space-y-2">
                  <div className="tw-flex tw-flex-wrap tw-items-center tw-justify-between tw-gap-2">
                    <Typography.Text strong className="tw-text-slate-800">
                      {value.format('YYYY년 M월')}
                    </Typography.Text>
                    <Space wrap size="small">
                      <Button
                        size="small"
                        onClick={() => {
                          const t = dayjs();
                          onChange(t);
                          setSelectedDay(t);
                        }}
                      >
                        오늘
                      </Button>
                      <Button size="small" onClick={() => onChange(value.subtract(1, 'month').startOf('month'))}>
                        이전 달
                      </Button>
                      <Button size="small" onClick={() => onChange(value.add(1, 'month').startOf('month'))}>
                        다음 달
                      </Button>
                    </Space>
                  </div>
                  <div className="tw-grid tw-grid-cols-7 tw-gap-1 tw-text-center tw-text-xs tw-font-medium tw-text-slate-500">
                    {WEEKDAY_KO.map((wd) => (
                      <div key={wd} className="tw-py-1">
                        {wd}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            />
          </Spin>
          {!calendarLoading && holidays.length === 0 ? (
            <Typography.Paragraph type="secondary" className="!tw-mb-0 !tw-mt-3 !tw-text-center !tw-text-xs">
              등록된 공휴일이 없습니다. 상단에서 추가하거나 법정 공휴일을 불러오세요.
            </Typography.Paragraph>
          ) : null}
        </Card>

        <Card className="tw-h-fit tw-border-slate-200/80 tw-shadow-sm" title="선택한 날짜">
          <Space direction="vertical" className="tw-w-full" size={12}>
            <Typography.Text className="tw-text-base tw-font-semibold tw-text-slate-900">
              {selectedDay.format('YYYY년 M월 D일')} ({WEEKDAY_KO[selectedDay.day()]})
            </Typography.Text>
            <Button type="primary" block onClick={() => openCreateForDay(selectedDay)}>
              이 날짜에 공휴일 추가
            </Button>
            {dayHolidays.length === 0 ? (
              <Typography.Text type="secondary" className="tw-text-sm">
                이 날짜에 등록된 공휴일이 없습니다.
              </Typography.Text>
            ) : (
              <ul className="tw-m-0 tw-list-none tw-divide-y tw-divide-slate-100 tw-p-0">
                {dayHolidays.map((h) => (
                  <li key={h.companyHolidayId ?? `${h.holidayDate}-${h.holidayName}`} className="tw-py-3 first:tw-pt-0">
                    <div className="tw-flex tw-items-start tw-justify-between tw-gap-2">
                      <div className="tw-min-w-0 tw-flex-1">
                        <div className="tw-font-medium tw-text-slate-900">{h.holidayName}</div>
                        <Tag color={h.isPaidYn === 'Y' ? 'green' : 'default'} className="tw-mt-1">
                          {h.isPaidYn === 'Y' ? '유급' : '무급'}
                        </Tag>
                      </div>
                      <Space size="small">
                        <Button size="small" onClick={() => openEdit(h)}>
                          수정
                        </Button>
                        <Popconfirm
                          title="삭제하시겠어요?"
                          okText="삭제"
                          cancelText="취소"
                          onConfirm={() => h.companyHolidayId && deleteM.mutate(h.companyHolidayId)}
                        >
                          <Button size="small" danger>
                            삭제
                          </Button>
                        </Popconfirm>
                      </Space>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Space>
        </Card>
      </div>

      <Modal
        open={open}
        onCancel={() => {
          setOpen(false);
          setEditing(null);
          form.resetFields();
        }}
        onOk={handleHolidayModalOk}
        confirmLoading={createM.isPending || updateM.isPending}
        okText={editing ? '수정' : '등록'}
        cancelText="취소"
        title={editing ? '공휴일 수정' : '공휴일 추가'}
        destroyOnClose
      >
        <Form<FormValues>
          form={form}
          layout="vertical"
          initialValues={{ isPaidYn: 'Y', holidayDate: dayjs() }}
        >
          <Form.Item label="날짜" name="holidayDate" rules={[{ required: true, message: '날짜를 선택하세요.' }]}>
            <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
          </Form.Item>
          <Form.Item label="공휴일명" name="holidayName" rules={[{ required: true, message: '공휴일명을 입력하세요.' }]}>
            <Input maxLength={50} placeholder="예: 임시 공휴일" />
          </Form.Item>
          <Form.Item label="유급 여부" name="isPaidYn" rules={[{ required: true }]}>
            <Select
              options={[
                { value: 'Y', label: '유급' },
                { value: 'N', label: '무급' },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
}
