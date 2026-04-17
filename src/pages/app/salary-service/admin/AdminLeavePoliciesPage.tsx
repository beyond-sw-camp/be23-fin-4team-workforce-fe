/** /app/leave/policies — 연차 정책 CRUD (시스템 관리자) */
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  App,
  Button,
  Card,
  Form,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { attendanceApi } from '@/features/salary-service/api/attendanceApi';
import type { AccrualBaseCode, LeavePolicy } from '@/features/salary-service/types';

type FormValues = {
  accrualBase: AccrualBaseCode;
  defaultAnnualDays: number;
  isPromotionYn: boolean;
  promotion1stBeforeDays?: number | null;
  promotion2ndBeforeDays?: number | null;
  isCarryoverYn: boolean;
  carryoverDays?: number | null;
  isCarryoverConsentYn: boolean;
  isPayoutYn: boolean;
};

const QK = ['salary', 'leave-policies'] as const;

const ACCRUAL_KO: Record<string, string> = {
  FISCAL: '회계연도',
  HIRE_DATE: '입사일',
};

function yn(v: string | null | undefined): boolean {
  return v === 'Y' || v === 'YES';
}

function toYn(v: boolean): 'Y' | 'N' {
  return v ? 'Y' : 'N';
}

export function AdminLeavePoliciesPage() {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<LeavePolicy | null>(null);
  const [form] = Form.useForm<FormValues>();

  const listQ = useQuery({
    queryKey: QK,
    queryFn: () => attendanceApi.leavePolicy.list(),
  });

  const buildPayload = (v: FormValues) => ({
    accrualBase: v.accrualBase,
    defaultAnnualDays: v.defaultAnnualDays,
    isPromotionYn: toYn(v.isPromotionYn),
    promotion1stBeforeDays: v.isPromotionYn ? (v.promotion1stBeforeDays ?? null) : null,
    promotion2ndBeforeDays: v.isPromotionYn ? (v.promotion2ndBeforeDays ?? null) : null,
    isCarryoverYn: toYn(v.isCarryoverYn),
    carryoverDays: v.isCarryoverYn ? (v.carryoverDays ?? null) : null,
    isCarryoverConsentYn: toYn(v.isCarryoverConsentYn),
    isPayoutYn: toYn(v.isPayoutYn),
  });

  const createM = useMutation({
    mutationFn: (v: FormValues) => attendanceApi.leavePolicy.create(buildPayload(v)),
    onSuccess: () => {
      message.success('정책이 등록되었습니다.');
      setOpen(false);
      form.resetFields();
      void qc.invalidateQueries({ queryKey: QK });
    },
    onError: (e: Error) => message.error(e.message || '등록에 실패했습니다.'),
  });

  const updateM = useMutation({
    mutationFn: (input: { id: string; v: FormValues }) =>
      attendanceApi.leavePolicy.update(input.id, buildPayload(input.v)),
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
    mutationFn: (id: string) => attendanceApi.leavePolicy.delete(id),
    onSuccess: () => {
      message.success('삭제되었습니다.');
      void qc.invalidateQueries({ queryKey: QK });
    },
    onError: (e: Error) => message.error(e.message || '삭제에 실패했습니다.'),
  });

  const columns = useMemo<ColumnsType<LeavePolicy>>(
    () => [
      {
        title: '발생기준',
        dataIndex: 'accrualBase',
        key: 'accrualBase',
        width: 120,
        render: (v) => <Tag color="blue">{ACCRUAL_KO[v as string] ?? v}</Tag>,
      },
      {
        title: '기본 부여(일)',
        dataIndex: 'defaultAnnualDays',
        key: 'defaultAnnualDays',
        width: 120,
      },
      {
        title: '촉진제도',
        key: 'promotion',
        width: 200,
        render: (_, r) =>
          yn(r.isPromotionYn) ? (
            <span>
              <Tag color="green">사용</Tag>
              <span className="tw-text-xs tw-text-slate-500">
                1차 {r.promotion1stBeforeDays ?? '-'}일 / 2차 {r.promotion2ndBeforeDays ?? '-'}일
              </span>
            </span>
          ) : (
            <Tag>미사용</Tag>
          ),
      },
      {
        title: '이월',
        key: 'carryover',
        width: 200,
        render: (_, r) =>
          yn(r.isCarryoverYn) ? (
            <span>
              <Tag color="green">허용 ({r.carryoverDays ?? 0}일)</Tag>
              {yn(r.isCarryoverConsentYn) && <Tag>동의 필요</Tag>}
            </span>
          ) : (
            <Tag>금지</Tag>
          ),
      },
      {
        title: '미사용 수당',
        dataIndex: 'isPayoutYn',
        key: 'isPayoutYn',
        width: 120,
        render: (v) => (yn(v) ? <Tag color="green">지급</Tag> : <Tag>미지급</Tag>),
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
                  accrualBase: (r.accrualBase as AccrualBaseCode) ?? 'FISCAL',
                  defaultAnnualDays: r.defaultAnnualDays ?? 15,
                  isPromotionYn: yn(r.isPromotionYn),
                  promotion1stBeforeDays: r.promotion1stBeforeDays ?? undefined,
                  promotion2ndBeforeDays: r.promotion2ndBeforeDays ?? undefined,
                  isCarryoverYn: yn(r.isCarryoverYn),
                  carryoverDays: r.carryoverDays ?? undefined,
                  isCarryoverConsentYn: yn(r.isCarryoverConsentYn),
                  isPayoutYn: yn(r.isPayoutYn),
                });
              }}
            >
              수정
            </Button>
            <Popconfirm
              title="삭제하시겠어요?"
              okText="삭제"
              cancelText="취소"
              onConfirm={() => r.policyId && deleteM.mutate(r.policyId)}
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
            연차 정책 관리
          </Typography.Title>
          <Typography.Paragraph type="secondary" className="!tw-mb-0 !tw-mt-1 !tw-text-sm">
            <Typography.Text code>/leave-policies</Typography.Text> — 발생 기준·촉진제도·이월·수당 정책을 관리합니다.
          </Typography.Paragraph>
        </div>
        <Button
          type="primary"
          onClick={() => {
            setEditing(null);
            form.resetFields();
            form.setFieldsValue({
              accrualBase: 'FISCAL',
              defaultAnnualDays: 15,
              isPromotionYn: false,
              isCarryoverYn: false,
              isCarryoverConsentYn: false,
              isPayoutYn: false,
            });
            setOpen(true);
          }}
        >
          정책 추가
        </Button>
      </div>

      <Card>
        {/* TODO: 서버 페이지네이션 전환 필요 */}
        <Table<LeavePolicy>
          rowKey={(r) => r.policyId ?? Math.random().toString()}
          loading={listQ.isLoading}
          dataSource={listQ.data ?? []}
          columns={columns}
          pagination={{ pageSize: 10 }}
          locale={{ emptyText: '등록된 정책이 없습니다.' }}
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
        title={editing ? '정책 수정' : '정책 추가'}
        destroyOnClose
        width={560}
      >
        <Form<FormValues>
          form={form}
          layout="vertical"
          onFinish={(v) => {
            if (editing?.policyId) updateM.mutate({ id: editing.policyId, v });
            else createM.mutate(v);
          }}
        >
          <Form.Item label="발생 기준" name="accrualBase" rules={[{ required: true }]}>
            <Select
              options={[
                { value: 'FISCAL', label: '회계연도 (FISCAL)' },
                { value: 'HIRE_DATE', label: '입사일 (HIRE_DATE)' },
              ]}
            />
          </Form.Item>
          <Form.Item label="기본 부여 일수" name="defaultAnnualDays" rules={[{ required: true }]}>
            <InputNumber min={0} step={0.5} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item label="촉진제도 사용" name="isPromotionYn" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(p, c) => p.isPromotionYn !== c.isPromotionYn}>
            {({ getFieldValue }) =>
              getFieldValue('isPromotionYn') ? (
                <Space className="tw-w-full" direction="horizontal" size={16}>
                  <Form.Item label="1차 통보(일 전)" name="promotion1stBeforeDays">
                    <InputNumber min={0} style={{ width: 160 }} />
                  </Form.Item>
                  <Form.Item label="2차 통보(일 전)" name="promotion2ndBeforeDays">
                    <InputNumber min={0} style={{ width: 160 }} />
                  </Form.Item>
                </Space>
              ) : null
            }
          </Form.Item>

          <Form.Item label="이월 허용" name="isCarryoverYn" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(p, c) => p.isCarryoverYn !== c.isCarryoverYn}>
            {({ getFieldValue }) =>
              getFieldValue('isCarryoverYn') ? (
                <Space className="tw-w-full" direction="horizontal" size={16}>
                  <Form.Item label="이월 가능 일수" name="carryoverDays">
                    <InputNumber min={0} style={{ width: 160 }} />
                  </Form.Item>
                  <Form.Item label="동의 필요" name="isCarryoverConsentYn" valuePropName="checked">
                    <Switch />
                  </Form.Item>
                </Space>
              ) : null
            }
          </Form.Item>

          <Form.Item label="미사용 연차 수당 지급" name="isPayoutYn" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
}
