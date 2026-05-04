// /app/salary/retirement-policy 회사별 퇴직급여 제도 정책 관리
// LEGAL DB DC 3가지 모드 effectiveFrom effectiveTo 기간 분할 이력 관리
// 등록 시 이전 활성 정책 백엔드가 자동 마감 처리
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  App,
  Button,
  Card,
  DatePicker,
  Form,
  Input,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { AppDoubleActionModal } from '@/shared/ui/AppDoubleActionModal';
import dayjs from 'dayjs';
import { salaryApi } from '@/features/salary-service/api/salaryApi';
import type {
  RetirementPolicy,
  RetirementTypeCode,
} from '@/features/salary-service/types';

const RETIREMENT_TYPE_KO: Record<string, string> = {
  LEGAL: '법정 퇴직금',
  DB: 'DB형 퇴직연금',
  DC: 'DC형 퇴직연금',
};

const RETIREMENT_TYPE_DESC: Record<string, string> = {
  LEGAL: '회사 사내 적립 — 퇴사 시 일시금 지급',
  DB: '외부 금융기관 운영 — 계산식은 법정 퇴직금과 동일',
  DC: '매월 임금총액의 1/12 외부 금융기관 적립 — 운용수익 별도',
};

type PolicyFormValues = {
  retirementType: RetirementTypeCode;
  effectiveRange: [dayjs.Dayjs, dayjs.Dayjs | null];
  memo?: string;
};

export function AdminRetirementPolicyPage() {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<RetirementPolicy | null>(null);
  const [form] = Form.useForm<PolicyFormValues>();

  const listQ = useQuery({
    queryKey: ['salary', 'retirement-policy', 'list'],
    queryFn: () => salaryApi.retirementPolicy.list(),
  });

  const activeQ = useQuery({
    queryKey: ['salary', 'retirement-policy', 'active'],
    queryFn: () => salaryApi.retirementPolicy.getActive(),
  });

  const createM = useMutation({
    mutationFn: (v: PolicyFormValues) =>
      salaryApi.retirementPolicy.create({
        retirementType: v.retirementType,
        effectiveFrom: v.effectiveRange[0].format('YYYY-MM-DD'),
        effectiveTo: v.effectiveRange[1]?.format('YYYY-MM-DD') ?? null,
        memo: v.memo?.trim() || null,
      }),
    onSuccess: () => {
      message.success('등록 완료 — 이전 활성 정책은 자동으로 마감되었습니다.');
      setOpen(false);
      form.resetFields();
      void qc.invalidateQueries({ queryKey: ['salary', 'retirement-policy'] });
    },
    onError: (e: Error) => message.error(e.message || '등록 실패'),
  });

  const updateM = useMutation({
    mutationFn: ({ id, v }: { id: string; v: PolicyFormValues }) =>
      salaryApi.retirementPolicy.update(id, {
        retirementType: v.retirementType,
        effectiveTo: v.effectiveRange[1]?.format('YYYY-MM-DD') ?? null,
        memo: v.memo?.trim() || null,
      }),
    onSuccess: () => {
      message.success('수정 완료');
      setOpen(false);
      setEditing(null);
      form.resetFields();
      void qc.invalidateQueries({ queryKey: ['salary', 'retirement-policy'] });
    },
    onError: (e: Error) => message.error(e.message || '수정 실패'),
  });

  const deleteM = useMutation({
    mutationFn: (id: string) => salaryApi.retirementPolicy.delete(id),
    onSuccess: () => {
      message.success('삭제 완료');
      void qc.invalidateQueries({ queryKey: ['salary', 'retirement-policy'] });
    },
    onError: (e: Error) => message.error(e.message || '삭제 실패'),
  });

  const cols = useMemo<ColumnsType<RetirementPolicy>>(
    () => [
      {
        title: '퇴직급여 제도',
        dataIndex: 'retirementType',
        key: 'retirementType',
        width: 160,
        render: (v: string) => (
          <Tag color={v === 'DC' ? 'green' : v === 'DB' ? 'blue' : 'default'}>
            {RETIREMENT_TYPE_KO[v] ?? v}
          </Tag>
        ),
      },
      {
        title: '적용 기간',
        key: 'eff',
        width: 240,
        render: (_, r) =>
          `${r.effectiveFrom ?? ''} ~ ${r.effectiveTo ?? '진행중'}`,
      },
      {
        title: '활성',
        dataIndex: 'active',
        key: 'active',
        width: 80,
        render: (v: boolean) =>
          v ? <Tag color="success">활성</Tag> : <Tag>마감</Tag>,
      },
      {
        title: '비고',
        dataIndex: 'memo',
        key: 'memo',
        ellipsis: true,
        render: (v) => v || <Typography.Text type="secondary">—</Typography.Text>,
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
                form.setFieldsValue({
                  retirementType: (r.retirementType as RetirementTypeCode) ?? 'LEGAL',
                  effectiveRange: [
                    r.effectiveFrom ? dayjs(r.effectiveFrom) : dayjs(),
                    r.effectiveTo ? dayjs(r.effectiveTo) : null,
                  ],
                  memo: r.memo ?? undefined,
                });
                setOpen(true);
              }}
            >
              수정
            </Button>
            <Popconfirm
              title="정책을 삭제할까요?"
              description="삭제는 소프트 처리되며, 활성 정책 삭제 후엔 화면 진입 시 기본 LEGAL 정책이 자동 생성됩니다."
              okText="삭제"
              cancelText="취소"
              onConfirm={() =>
                r.retirementPolicyId && deleteM.mutate(r.retirementPolicyId)
              }
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

  const activeType = activeQ.data?.retirementType;
  const activeDescription = activeType ? RETIREMENT_TYPE_DESC[activeType] : null;

  return (
    <Space direction="vertical" className="tw-w-full" size={16}>
      <div>
        <Typography.Title level={1} className="!tw-m-0 !tw-text-slate-900">
          퇴직급여 정책
        </Typography.Title>
        <Typography.Paragraph
          type="secondary"
          className="!tw-mb-0 !tw-mt-1 !tw-text-sm"
        >
          회사가 운영하는 퇴직급여 제도 (법정 / DB형 / DC형) 를 관리합니다.
          정책 변경 시 이전 활성 정책은 자동으로 마감됩니다.
        </Typography.Paragraph>
      </div>

      {activeQ.data && (
        <Alert
          type="info"
          showIcon
          message={
            <span>
              <b>현재 활성 정책: </b>
              <Tag
                color={
                  activeType === 'DC'
                    ? 'green'
                    : activeType === 'DB'
                      ? 'blue'
                      : 'default'
                }
              >
                {activeType ? RETIREMENT_TYPE_KO[activeType] : '—'}
              </Tag>
              <span className="tw-ml-2">{activeDescription}</span>
            </span>
          }
          description={
            <span className="tw-text-xs tw-text-slate-500">
              적용 기간: {activeQ.data.effectiveFrom} ~{' '}
              {activeQ.data.effectiveTo ?? '진행중'}
            </span>
          }
        />
      )}

      <Card>
        <div className="tw-flex tw-justify-end tw-mb-3">
          <Button
            type="primary"
            onClick={() => {
              setEditing(null);
              form.resetFields();
              form.setFieldsValue({
                retirementType: 'LEGAL',
                effectiveRange: [dayjs(), null],
              });
              setOpen(true);
            }}
          >
            정책 등록
          </Button>
        </div>

        <Table<RetirementPolicy>
          rowKey={(r) => r.retirementPolicyId ?? Math.random().toString()}
          loading={listQ.isLoading}
          dataSource={listQ.data ?? []}
          columns={cols}
          pagination={{ pageSize: 10 }}
          locale={{ emptyText: '등록된 정책이 없습니다.' }}
        />
      </Card>

      <AppDoubleActionModal
        open={open}
        onClose={() => {
          setOpen(false);
          setEditing(null);
          form.resetFields();
        }}
        onConfirm={() => form.submit()}
        confirmLoading={createM.isPending || updateM.isPending}
        confirmText={editing ? '수정' : '등록'}
        cancelText="취소"
        title={editing ? '퇴직급여 정책 수정' : '퇴직급여 정책 등록'}
        destroyOnHidden
        width={560}
      >
        <div className="tw-px-5 tw-py-4">
        <Form<PolicyFormValues>
          form={form}
          layout="vertical"
          onFinish={(v) =>
            editing?.retirementPolicyId
              ? updateM.mutate({ id: editing.retirementPolicyId, v })
              : createM.mutate(v)
          }
        >
          <Form.Item
            label="퇴직급여 제도"
            name="retirementType"
            rules={[{ required: true, message: '제도를 선택하세요.' }]}
          >
            <Select
              options={[
                { value: 'LEGAL', label: '법정 퇴직금 (회사 사내 적립)' },
                { value: 'DB', label: 'DB형 퇴직연금 (외부 적립, 계산 동일)' },
                { value: 'DC', label: 'DC형 퇴직연금 (매월 1/12 적립)' },
              ]}
            />
          </Form.Item>

          <Form.Item
            label="적용 기간"
            name="effectiveRange"
            rules={[{ required: true, message: '적용 시작일은 필수입니다.' }]}
            extra={
              editing
                ? '시작일은 변경 불가합니다. 종료일만 수정됩니다.'
                : '새 정책 등록 시 이전 활성 정책은 자동으로 시작일 직전으로 마감됩니다.'
            }
          >
            <DatePicker.RangePicker
              allowEmpty={[false, true]}
              format="YYYY-MM-DD"
              style={{ width: '100%' }}
              disabled={editing ? [true, false] : false}
            />
          </Form.Item>

          <Form.Item label="비고 (선택)" name="memo">
            <Input.TextArea
              maxLength={500}
              rows={3}
              placeholder="정책 변경 사유 등"
              showCount
            />
          </Form.Item>

          <Alert
            type="warning"
            showIcon
            message="제도 변경 시 시뮬레이션·정산 결과가 달라지므로 신중히 등록하세요."
          />
        </Form>
        </div>
      </AppDoubleActionModal>
    </Space>
  );
}
