/** /app/attendance/holidays — 회사 공휴일 CRUD (시스템 관리자) */
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  App,
  Button,
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
import { attendanceApi } from '@/features/salary-service/api/attendanceApi';
import type { CompanyHoliday } from '@/features/salary-service/types';

type FormValues = {
  holidayDate: dayjs.Dayjs;
  holidayName: string;
  isPaidYn: 'Y' | 'N';
};

const QK = ['salary', 'company-holidays'] as const;

export function AdminCompanyHolidaysPage() {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<CompanyHoliday | null>(null);
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm<FormValues>();

  const listQ = useQuery({
    queryKey: QK,
    queryFn: () => attendanceApi.companyHoliday.list(),
  });

  const createM = useMutation({
    mutationFn: (v: FormValues) =>
      attendanceApi.companyHoliday.create({
        holidayDate: v.holidayDate.format('YYYY-MM-DD'),
        holidayName: v.holidayName.trim(),
        isPaidYn: v.isPaidYn,
      }),
    onSuccess: () => {
      message.success('공휴일이 등록되었습니다.');
      setOpen(false);
      form.resetFields();
      void qc.invalidateQueries({ queryKey: QK });
    },
    onError: (e: Error) => message.error(e.message || '등록에 실패했습니다.'),
  });

  const updateM = useMutation({
    mutationFn: (input: { id: string; v: FormValues }) =>
      attendanceApi.companyHoliday.update(input.id, {
        holidayDate: input.v.holidayDate.format('YYYY-MM-DD'),
        holidayName: input.v.holidayName.trim(),
        isPaidYn: input.v.isPaidYn,
      }),
    onSuccess: () => {
      message.success('공휴일이 수정되었습니다.');
      setOpen(false);
      setEditing(null);
      form.resetFields();
      void qc.invalidateQueries({ queryKey: QK });
    },
    onError: (e: Error) => message.error(e.message || '수정에 실패했습니다.'),
  });

  const deleteM = useMutation({
    mutationFn: (id: string) => attendanceApi.companyHoliday.delete(id),
    onSuccess: () => {
      message.success('삭제되었습니다.');
      void qc.invalidateQueries({ queryKey: QK });
    },
    onError: (e: Error) => message.error(e.message || '삭제에 실패했습니다.'),
  });

  const columns = useMemo<ColumnsType<CompanyHoliday>>(
    () => [
      {
        title: '날짜',
        dataIndex: 'holidayDate',
        key: 'holidayDate',
        sorter: (a, b) => (a.holidayDate ?? '').localeCompare(b.holidayDate ?? ''),
        defaultSortOrder: 'ascend',
        width: 140,
      },
      {
        title: '공휴일명',
        dataIndex: 'holidayName',
        key: 'holidayName',
      },
      {
        title: '유급 여부',
        dataIndex: 'isPaidYn',
        key: 'isPaidYn',
        width: 120,
        render: (v) => <Tag color={v === 'Y' ? 'green' : 'default'}>{v === 'Y' ? '유급' : '무급'}</Tag>,
      },
      {
        title: '액션',
        key: 'actions',
        width: 160,
        render: (_, record) => (
          <Space>
            <Button
              size="small"
              onClick={() => {
                setEditing(record);
                setOpen(true);
                form.setFieldsValue({
                  holidayDate: record.holidayDate ? dayjs(record.holidayDate) : dayjs(),
                  holidayName: record.holidayName ?? '',
                  isPaidYn: (record.isPaidYn as 'Y' | 'N') ?? 'Y',
                });
              }}
            >
              수정
            </Button>
            <Popconfirm
              title="삭제하시겠어요?"
              okText="삭제"
              cancelText="취소"
              onConfirm={() => record.companyHolidayId && deleteM.mutate(record.companyHolidayId)}
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

  const onSubmit = (v: FormValues) => {
    if (editing?.companyHolidayId) {
      updateM.mutate({ id: editing.companyHolidayId, v });
    } else {
      createM.mutate(v);
    }
  };

  return (
    <Space direction="vertical" className="tw-w-full" size={16}>
      <div className="tw-flex tw-items-end tw-justify-between">
        <div>
          <Typography.Title level={4} className="!tw-m-0 !tw-text-slate-900">
            회사 공휴일 관리
          </Typography.Title>
          <Typography.Paragraph type="secondary" className="!tw-mb-0 !tw-mt-1 !tw-text-sm">
            <Typography.Text code>/company-holidays</Typography.Text> — 회사별 공휴일/임시 휴무일을 관리합니다.
          </Typography.Paragraph>
        </div>
        <Button
          type="primary"
          onClick={() => {
            setEditing(null);
            form.resetFields();
            form.setFieldsValue({ holidayDate: dayjs(), isPaidYn: 'Y' });
            setOpen(true);
          }}
        >
          공휴일 추가
        </Button>
      </div>

      <Card>
        {/* TODO: 서버 페이지네이션 전환 필요 */}
        <Table<CompanyHoliday>
          rowKey={(r) => r.companyHolidayId ?? `${r.holidayDate}-${r.holidayName}`}
          loading={listQ.isLoading}
          dataSource={listQ.data ?? []}
          columns={columns}
          pagination={{ pageSize: 20 }}
          locale={{ emptyText: '등록된 공휴일이 없습니다.' }}
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
        title={editing ? '공휴일 수정' : '공휴일 추가'}
        destroyOnClose
      >
        <Form<FormValues>
          form={form}
          layout="vertical"
          onFinish={onSubmit}
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
