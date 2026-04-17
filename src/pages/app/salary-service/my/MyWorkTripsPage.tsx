/** /app/work-trips — 내 출장·외근 work-trip API */
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  App,
  Button,
  Card,
  DatePicker,
  Form,
  Input,
  InputNumber,
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
import { attendanceApi } from '@/features/salary-service/api/attendanceApi';
import type { WorkTrip, WorkTripTypeCode, ExpenseTypeCode } from '@/features/salary-service/types';

type FormValues = {
  date: dayjs.Dayjs;
  workTripType: WorkTripTypeCode;
  destination?: string;
  purpose?: string;
  expenseAmount?: number;
  expenseType?: ExpenseTypeCode;
};

const QK = ['salary', 'work-trips'] as const;

const TRIP_TYPE_OPTIONS = [
  { value: 'BUSINESS_TRIP', label: '출장' },
  { value: 'OUTSIDE_WORK', label: '외근' },
];

const EXPENSE_TYPE_OPTIONS = [
  { value: 'TRANSPORT', label: '교통비' },
  { value: 'ACCOMMODATION', label: '숙박비' },
  { value: 'MEAL', label: '식대' },
  { value: 'ETC', label: '기타' },
];

const TRIP_TYPE_KO: Record<string, string> = {
  BUSINESS_TRIP: '출장',
  OUTSIDE_WORK: '외근',
};

const EXPENSE_TYPE_KO: Record<string, string> = {
  TRANSPORT: '교통비',
  ACCOMMODATION: '숙박비',
  MEAL: '식대',
  ETC: '기타',
};

const EXPENSE_STATUS_KO: Record<string, { text: string; color: string }> = {
  PENDING: { text: '대기', color: 'orange' },
  APPROVED: { text: '승인', color: 'green' },
  REJECTED: { text: '반려', color: 'red' },
};

export function MyWorkTripsPage() {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<WorkTrip | null>(null);
  const [form] = Form.useForm<FormValues>();

  const listQ = useQuery({
    queryKey: QK,
    queryFn: () => attendanceApi.workTrip.listMine(),
  });
  // TODO: expenseStatus는 승인 연동 붙으면 자동 갱신됨

  const createM = useMutation({
    mutationFn: (v: FormValues) =>
      attendanceApi.workTrip.create({
        date: v.date.format('YYYY-MM-DD'),
        workTripType: v.workTripType,
        destination: v.destination?.trim() || null,
        purpose: v.purpose?.trim() || null,
        expenseAmount: v.expenseAmount ?? null,
        expenseType: v.expenseType ?? null,
      }),
    onSuccess: () => {
      message.success('등록되었습니다.');
      setOpen(false);
      form.resetFields();
      void qc.invalidateQueries({ queryKey: QK });
    },
    onError: (e: Error) => message.error(e.message || '등록에 실패했습니다.'),
  });

  const updateM = useMutation({
    mutationFn: (input: { id: string; v: FormValues }) =>
      attendanceApi.workTrip.update(input.id, {
        workTripType: input.v.workTripType,
        destination: input.v.destination?.trim() || null,
        purpose: input.v.purpose?.trim() || null,
        expenseAmount: input.v.expenseAmount ?? null,
        expenseType: input.v.expenseType ?? null,
      }),
    onSuccess: () => {
      message.success('수정되었습니다.');
      setOpen(false);
      setEditing(null);
      form.resetFields();
      void qc.invalidateQueries({ queryKey: QK });
    },
    onError: (e: Error) => message.error(e.message || '수정에 실패했습니다.'),
  });

  const deleteM = useMutation({
    mutationFn: (id: string) => attendanceApi.workTrip.delete(id),
    onSuccess: () => {
      message.success('삭제되었습니다.');
      void qc.invalidateQueries({ queryKey: QK });
    },
    onError: (e: Error) => message.error(e.message || '삭제에 실패했습니다.'),
  });

  const columns = useMemo<ColumnsType<WorkTrip>>(
    () => [
      {
        title: '날짜',
        dataIndex: 'attendanceDate',
        key: 'attendanceDate',
        sorter: (a, b) => (a.attendanceDate ?? '').localeCompare(b.attendanceDate ?? ''),
        defaultSortOrder: 'descend',
        width: 120,
      },
      {
        title: '유형',
        dataIndex: 'workTripType',
        key: 'workTripType',
        width: 100,
        render: (v) => <Tag color={v === 'BUSINESS_TRIP' ? 'blue' : 'cyan'}>{TRIP_TYPE_KO[v] ?? v}</Tag>,
      },
      {
        title: '목적지',
        dataIndex: 'destination',
        key: 'destination',
        ellipsis: true,
      },
      {
        title: '목적',
        dataIndex: 'purpose',
        key: 'purpose',
        ellipsis: true,
      },
      {
        title: '경비',
        key: 'expense',
        width: 180,
        render: (_, r) =>
          r.expenseAmount != null ? (
            <span>
              {(r.expenseAmount ?? 0).toLocaleString()}원{' '}
              <Tag>{EXPENSE_TYPE_KO[r.expenseType ?? ''] ?? r.expenseType}</Tag>
            </span>
          ) : (
            '-'
          ),
      },
      {
        title: '경비 상태',
        dataIndex: 'expenseStatus',
        key: 'expenseStatus',
        width: 100,
        render: (v) => {
          const s = EXPENSE_STATUS_KO[v];
          return s ? <Tag color={s.color}>{s.text}</Tag> : (v ?? '-');
        },
      },
      {
        title: '액션',
        key: 'actions',
        width: 160,
        render: (_, r) => (
          <Space>
            <Button
              size="small"
              onClick={() => {
                setEditing(r);
                setOpen(true);
                form.setFieldsValue({
                  date: r.attendanceDate ? dayjs(r.attendanceDate) : dayjs(),
                  workTripType: (r.workTripType as WorkTripTypeCode) ?? 'BUSINESS_TRIP',
                  destination: r.destination ?? '',
                  purpose: r.purpose ?? '',
                  expenseAmount: r.expenseAmount ?? undefined,
                  expenseType: (r.expenseType as ExpenseTypeCode) ?? undefined,
                });
              }}
            >
              수정
            </Button>
            <Popconfirm
              title="삭제하시겠어요?"
              okText="삭제"
              cancelText="취소"
              onConfirm={() => r.workTripDetailId && deleteM.mutate(r.workTripDetailId)}
            >
              <Button size="small" danger>
                삭제
              </Button>
            </Popconfirm>
          </Space>
        ),
      },
    ],
    [deleteM, form],
  );

  return (
    <Space direction="vertical" className="tw-w-full" size={16}>
      <div className="tw-flex tw-items-end tw-justify-between">
        <div>
          <Typography.Title level={4} className="!tw-m-0 !tw-text-slate-900">
            출장 · 외근
          </Typography.Title>
          <Typography.Paragraph type="secondary" className="!tw-mb-0 !tw-mt-1 !tw-text-sm">
            <Typography.Text code>/work-trip</Typography.Text> — 출장/외근 등록 및 이력을 관리합니다.
          </Typography.Paragraph>
        </div>
        <Button
          type="primary"
          onClick={() => {
            setEditing(null);
            form.resetFields();
            form.setFieldsValue({ date: dayjs(), workTripType: 'BUSINESS_TRIP' });
            setOpen(true);
          }}
        >
          출장 / 외근 등록
        </Button>
      </div>

      <Card>
        <Table<WorkTrip>
          rowKey={(r) => r.workTripDetailId ?? `${r.attendanceDate}-${r.destination}`}
          loading={listQ.isLoading}
          dataSource={listQ.data ?? []}
          columns={columns}
          pagination={{ pageSize: 20 }}
          locale={{ emptyText: '출장/외근 이력이 없습니다.' }}
        />
      </Card>

      <Modal
        open={open}
        onCancel={() => {
          setOpen(false);
          setEditing(null);
          form.resetFields();
        }}
        onOk={() => form.submit()}
        confirmLoading={createM.isPending || updateM.isPending}
        okText={editing ? '수정' : '등록'}
        cancelText="취소"
        title={editing ? '출장/외근 수정' : '출장/외근 등록'}
        destroyOnClose
        width={520}
      >
        <Form<FormValues>
          form={form}
          layout="vertical"
          onFinish={(v) => {
            if (editing?.workTripDetailId) updateM.mutate({ id: editing.workTripDetailId, v });
            else createM.mutate(v);
          }}
        >
          <Form.Item label="날짜" name="date" rules={[{ required: true }]}>
            <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" disabled={!!editing} />
          </Form.Item>
          <Form.Item label="유형" name="workTripType" rules={[{ required: true }]}>
            <Select options={TRIP_TYPE_OPTIONS} />
          </Form.Item>
          <Form.Item label="목적지" name="destination">
            <Input placeholder="예: 부산 해운대 오피스" maxLength={100} />
          </Form.Item>
          <Form.Item label="목적" name="purpose">
            <Input.TextArea rows={2} maxLength={300} placeholder="출장/외근 목적" />
          </Form.Item>
          <Form.Item label="경비 금액 (원)" name="expenseAmount">
            <InputNumber min={0} step={1000} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="경비 유형" name="expenseType">
            <Select options={EXPENSE_TYPE_OPTIONS} allowClear placeholder="경비 없으면 비워두세요" />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
}
