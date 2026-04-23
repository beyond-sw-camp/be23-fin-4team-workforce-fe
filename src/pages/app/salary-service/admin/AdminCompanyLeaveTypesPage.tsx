/**
 * /app/leave/types — 회사 휴가 종류 관리 (시스템 관리자)
 * 시스템 기본 휴가(연차, 반차, 병가 등)는 이름/순서만 수정 가능, 삭제 불가.
 * 커스텀 휴가는 전 필드 수정/삭제 가능.
 */
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  App,
  Button,
  Card,
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
import { attendanceApi } from '@/features/salary-service/api/attendanceApi';
import type {
  BalanceTypeCode,
  CompanyLeaveType,
} from '@/features/salary-service/types';

type FormValues = {
  code: string;
  name: string;
  balanceType: BalanceTypeCode | 'NONE';
  daysPerUse: number;
  isPaidYn: 'Y' | 'N';
  maxDaysPerYear?: number | null;
  requireEvidenceYn: 'Y' | 'N';
  usageDeadlineDays?: number | null;
  displayOrder: number;
};

const BALANCE_OPTIONS: { value: FormValues['balanceType']; label: string }[] = [
  { value: 'NONE', label: '차감 없음' },
  { value: 'ANNUAL', label: '당해 연차 (ANNUAL)' },
  { value: 'MONTHLY', label: '월차 (MONTHLY)' },
  { value: 'CARRYOVER', label: '이월 연차 (CARRYOVER)' },
];

const BALANCE_KO: Record<string, string> = {
  ANNUAL: '당해 연차',
  MONTHLY: '월차',
  CARRYOVER: '이월 연차',
};

const QK = ['salary', 'company-leave-types'] as const;

export function AdminCompanyLeaveTypesPage() {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<CompanyLeaveType | null>(null);
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm<FormValues>();

  const listQ = useQuery({
    queryKey: QK,
    queryFn: () => attendanceApi.companyLeaveType.list(),
  });

  const createM = useMutation({
    mutationFn: (v: FormValues) =>
      attendanceApi.companyLeaveType.create({
        code: v.code.trim(),
        name: v.name.trim(),
        balanceType: v.balanceType === 'NONE' ? null : v.balanceType,
        daysPerUse: v.daysPerUse,
        isPaidYn: v.isPaidYn,
        maxDaysPerYear: v.maxDaysPerYear ?? null,
        requireEvidenceYn: v.requireEvidenceYn,
        usageDeadlineDays: v.usageDeadlineDays ?? null,
        displayOrder: v.displayOrder,
      }),
    onSuccess: () => {
      message.success('휴가 종류가 생성되었습니다.');
      setOpen(false);
      form.resetFields();
      void qc.invalidateQueries({ queryKey: QK });
    },
    onError: (e: Error) => message.error(e.message || '생성에 실패했습니다.'),
  });

  const updateM = useMutation({
    mutationFn: (input: { id: string; v: FormValues; isSystemDefault: boolean }) =>
      attendanceApi.companyLeaveType.update(input.id, {
        name: input.v.name.trim(),
        balanceType:
          input.isSystemDefault || input.v.balanceType === 'NONE' ? null : input.v.balanceType,
        daysPerUse: input.isSystemDefault ? null : input.v.daysPerUse,
        isPaidYn: input.isSystemDefault ? null : input.v.isPaidYn,
        maxDaysPerYear: input.isSystemDefault ? null : input.v.maxDaysPerYear ?? null,
        requireEvidenceYn: input.isSystemDefault ? null : input.v.requireEvidenceYn,
        usageDeadlineDays: input.isSystemDefault ? null : input.v.usageDeadlineDays ?? null,
        displayOrder: input.v.displayOrder,
      }),
    onSuccess: () => {
      message.success('휴가 종류가 수정되었습니다.');
      setOpen(false);
      setEditing(null);
      form.resetFields();
      void qc.invalidateQueries({ queryKey: QK });
    },
    onError: (e: Error) => message.error(e.message || '수정에 실패했습니다.'),
  });

  const deleteM = useMutation({
    mutationFn: (id: string) => attendanceApi.companyLeaveType.delete(id),
    onSuccess: () => {
      message.success('삭제되었습니다.');
      void qc.invalidateQueries({ queryKey: QK });
    },
    onError: (e: Error) => message.error(e.message || '삭제에 실패했습니다.'),
  });

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({
      balanceType: 'NONE',
      daysPerUse: 1,
      isPaidYn: 'Y',
      requireEvidenceYn: 'N',
      displayOrder: (listQ.data ?? []).length + 1,
    });
    setOpen(true);
  };

  const openEdit = (record: CompanyLeaveType) => {
    setEditing(record);
    form.setFieldsValue({
      code: record.code ?? '',
      name: record.name ?? '',
      balanceType: (record.balanceType ?? 'NONE') as FormValues['balanceType'],
      daysPerUse: record.daysPerUse ?? 1,
      isPaidYn: (record.isPaidYn as 'Y' | 'N') ?? 'Y',
      maxDaysPerYear: record.maxDaysPerYear ?? undefined,
      requireEvidenceYn: (record.requireEvidenceYn as 'Y' | 'N') ?? 'N',
      usageDeadlineDays: record.usageDeadlineDays ?? undefined,
      displayOrder: record.displayOrder ?? 0,
    });
    setOpen(true);
  };

  const onSubmit = (v: FormValues) => {
    if (editing?.companyLeaveTypeId) {
      updateM.mutate({
        id: editing.companyLeaveTypeId,
        v,
        isSystemDefault: Boolean(editing.isSystemDefault),
      });
    } else {
      createM.mutate(v);
    }
  };

  const columns = useMemo<ColumnsType<CompanyLeaveType>>(
    () => [
      {
        title: '코드',
        dataIndex: 'code',
        key: 'code',
        width: 160,
        render: (v: string, r) => (
          <Space size={4}>
            <Typography.Text className="tw-font-mono tw-text-xs">{v ?? '—'}</Typography.Text>
            {r.isSystemDefault ? <Tag color="blue">기본</Tag> : null}
          </Space>
        ),
      },
      {
        title: '이름',
        dataIndex: 'name',
        key: 'name',
        width: 160,
      },
      {
        title: '잔고 유형',
        dataIndex: 'balanceType',
        key: 'balanceType',
        width: 120,
        render: (v: string | null) => (v ? BALANCE_KO[v] ?? v : <Typography.Text type="secondary">차감 없음</Typography.Text>),
      },
      {
        title: '1회당 차감',
        dataIndex: 'daysPerUse',
        key: 'daysPerUse',
        width: 100,
        align: 'right',
        render: (v: number) => (v === 0.5 ? '0.5일 (반차)' : `${v ?? 0}일`),
      },
      {
        title: '유급',
        dataIndex: 'isPaidYn',
        key: 'isPaidYn',
        width: 80,
        render: (v: string) => (v === 'Y' ? <Tag color="green">유급</Tag> : <Tag>무급</Tag>),
      },
      {
        title: '증빙',
        dataIndex: 'requireEvidenceYn',
        key: 'requireEvidenceYn',
        width: 80,
        render: (v: string) => (v === 'Y' ? <Tag color="orange">필수</Tag> : <Tag>선택</Tag>),
      },
      {
        title: '연 한도',
        dataIndex: 'maxDaysPerYear',
        key: 'maxDaysPerYear',
        width: 100,
        align: 'right',
        render: (v: number | null) => (v == null ? '—' : `${v}일`),
      },
      {
        title: '사용 기한',
        dataIndex: 'usageDeadlineDays',
        key: 'usageDeadlineDays',
        width: 130,
        align: 'right',
        render: (v: number | null) =>
          v == null ? (
            <Typography.Text type="secondary">—</Typography.Text>
          ) : (
            <Tag color="purple">발생일 +{v}일</Tag>
          ),
      },
      {
        title: '순서',
        dataIndex: 'displayOrder',
        key: 'displayOrder',
        width: 70,
        align: 'right',
        sorter: (a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0),
        defaultSortOrder: 'ascend',
      },
      {
        title: '작업',
        key: 'actions',
        width: 160,
        render: (_, record) => (
          <Space>
            <Button size="small" onClick={() => openEdit(record)}>
              수정
            </Button>
            {record.isSystemDefault ? (
              <Typography.Text type="secondary" className="tw-text-xs">
                삭제 불가
              </Typography.Text>
            ) : (
              <Popconfirm
                title="정말 삭제하시겠어요?"
                description="이 휴가 종류를 선택해 사용 중인 기존 신청은 유지됩니다."
                okText="삭제"
                cancelText="취소"
                onConfirm={() => record.companyLeaveTypeId && deleteM.mutate(record.companyLeaveTypeId)}
              >
                <Button size="small" danger>
                  삭제
                </Button>
              </Popconfirm>
            )}
          </Space>
        ),
      },
    ],
    [deleteM],
  );

  const isSystemDefault = Boolean(editing?.isSystemDefault);

  return (
    <Space direction="vertical" className="tw-w-full" size={16}>
      <div className="tw-flex tw-flex-wrap tw-items-end tw-justify-between tw-gap-3">
        <div>
          <Typography.Title level={4} className="!tw-m-0 !tw-text-slate-900">
            회사 휴가 종류 관리
          </Typography.Title>
          <Typography.Text type="secondary" className="tw-text-xs">
            직원이 휴가 신청 시 선택하는 휴가 종류를 관리합니다. 시스템 기본은 이름과 순서만 수정
            가능합니다.
          </Typography.Text>
        </div>
        <Button type="primary" onClick={openCreate}>
          휴가 종류 추가
        </Button>
      </div>

      <Card className="tw-border-slate-200/80 tw-shadow-sm">
        <Table<CompanyLeaveType>
          rowKey={(r) => r.companyLeaveTypeId ?? `${r.code}-${r.displayOrder}`}
          loading={listQ.isLoading}
          dataSource={listQ.data ?? []}
          columns={columns}
          pagination={false}
          size="small"
          locale={{ emptyText: '등록된 휴가 종류가 없습니다.' }}
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
        title={editing ? (isSystemDefault ? '시스템 기본 휴가 수정' : '휴가 종류 수정') : '휴가 종류 추가'}
        destroyOnClose
        width={560}
      >
        <Form<FormValues> form={form} layout="vertical" onFinish={onSubmit}>
          <Form.Item
            label="코드"
            name="code"
            rules={[
              { required: true, message: '코드를 입력하세요.' },
              { pattern: /^[A-Z_]+$/, message: '대문자와 언더스코어(_)만 허용됩니다.' },
              { max: 50 },
            ]}
            extra="예: REFRESH, BIRTHDAY. 생성 후 변경 불가."
          >
            <Input disabled={Boolean(editing)} placeholder="CUSTOM_LEAVE" />
          </Form.Item>

          <Form.Item
            label="이름"
            name="name"
            rules={[{ required: true, message: '이름을 입력하세요.' }, { max: 100 }]}
          >
            <Input placeholder="리프레시 휴가" />
          </Form.Item>

          <Form.Item
            label="잔고 유형"
            name="balanceType"
            extra="잔고에서 차감할 풀. '차감 없음' 선택 시 잔고와 무관하게 부여됩니다(경조·예비군 등)."
          >
            <Select disabled={isSystemDefault} options={BALANCE_OPTIONS} />
          </Form.Item>

          <Form.Item
            label="1회당 차감 일수"
            name="daysPerUse"
            rules={[{ required: true, message: '차감 일수를 입력하세요.' }]}
            extra="반차는 0.5, 전일은 1.0."
          >
            <InputNumber
              disabled={isSystemDefault}
              className="tw-w-full"
              min={0.1}
              step={0.5}
            />
          </Form.Item>

          <Form.Item label="연간 한도 (선택)" name="maxDaysPerYear" extra="비워두면 연간 한도 없음.">
            <InputNumber disabled={isSystemDefault} className="tw-w-full" min={0.5} step={0.5} />
          </Form.Item>

          <Form.Item
            label="사용 기한 (사유 발생일 + N일)"
            name="usageDeadlineDays"
            extra="설정하면 신청 시 사유 발생일(eventDate) 필수 + N일 이내만 사용 가능. 경조사/출산 등에 사용. 비워두면 기한 없음."
          >
            <InputNumber
              disabled={isSystemDefault}
              className="tw-w-full"
              min={1}
              step={1}
              placeholder="예: DEATH_PARENT = 30"
            />
          </Form.Item>

          <div className="tw-grid tw-grid-cols-1 tw-gap-3 md:tw-grid-cols-3">
            <Form.Item label="유급 여부" name="isPaidYn" rules={[{ required: true }]}>
              <Select
                disabled={isSystemDefault}
                options={[
                  { value: 'Y', label: '유급' },
                  { value: 'N', label: '무급' },
                ]}
              />
            </Form.Item>

            <Form.Item
              label="증빙 필수"
              name="requireEvidenceYn"
              rules={[{ required: true }]}
            >
              <Select
                disabled={isSystemDefault}
                options={[
                  { value: 'Y', label: '필수' },
                  { value: 'N', label: '선택' },
                ]}
              />
            </Form.Item>

            <Form.Item
              label="정렬 순서"
              name="displayOrder"
              rules={[{ required: true, message: '순서를 입력하세요.' }]}
            >
              <InputNumber className="tw-w-full" min={0} step={1} />
            </Form.Item>
          </div>

          {isSystemDefault && (
            <Typography.Paragraph type="secondary" className="!tw-mb-0 tw-text-xs">
              시스템 기본 휴가는 이름과 정렬 순서만 수정됩니다. 차감 규칙 등은 변경되지 않습니다.
            </Typography.Paragraph>
          )}
        </Form>
      </Modal>
    </Space>
  );
}
