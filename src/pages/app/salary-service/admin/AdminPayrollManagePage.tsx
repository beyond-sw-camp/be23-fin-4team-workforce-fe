/**
 * /app/payroll/admin/$payrollId
 * DRAFT일 때 항목 CRUD, 확정·지급 완료 버튼.
 */
import { Link, useParams } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Card, Descriptions, Form, InputNumber, Popconfirm, Select, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useMemo, useState } from 'react';
import { salaryApi } from '@/features/salary-service/api/salaryApi';
import type { PayrollItem, SalaryItemTemplate } from '@/features/salary-service/types';

const STATUS_KO: Record<string, string> = {
  DRAFT: '작성 중',
  CONFIRMED: '확정',
  PAID: '지급 완료',
};

const ITEM_TYPE_KO: Record<string, string> = {
  EARNING: '지급',
  DEDUCTION: '공제',
};

function formatWon(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return '—';
  return `${n.toLocaleString('ko-KR')}원`;
}

export function AdminPayrollManagePage() {
  const { payrollId } = useParams({ strict: false }) as { payrollId: string };
  const { message, modal } = App.useApp();
  const qc = useQueryClient();
  const [addForm] = Form.useForm<{ templateId: string; amount: number }>();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState<number>(0);

  const payrollQ = useQuery({
    queryKey: ['salary', 'payroll', payrollId],
    queryFn: () => salaryApi.payroll.getById(payrollId),
    enabled: Boolean(payrollId),
  });

  const itemsQ = useQuery({
    queryKey: ['salary', 'payroll', payrollId, 'items'],
    queryFn: () => salaryApi.payroll.listItems(payrollId),
    enabled: Boolean(payrollId),
  });

  const templatesQ = useQuery({
    queryKey: ['salary', 'salary-item-templates'],
    queryFn: () => salaryApi.salaryItemTemplate.list(),
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['salary', 'payroll', payrollId] });
    void qc.invalidateQueries({ queryKey: ['salary', 'payroll'] });
  };

  const addItemM = useMutation({
    mutationFn: (v: { templateId: string; amount: number }) =>
      salaryApi.payroll.addItem(payrollId, {
        salaryItemTemplateId: v.templateId,
        amount: v.amount,
      }),
    onSuccess: () => {
      message.success('항목이 추가되었습니다.');
      addForm.resetFields();
      invalidate();
    },
    onError: (e: Error) => message.error(e.message || '추가에 실패했습니다.'),
  });

  const updateItemM = useMutation({
    mutationFn: (v: { id: string; amount: number }) =>
      salaryApi.payroll.updateItem(v.id, { amount: v.amount }),
    onSuccess: () => {
      message.success('수정되었습니다.');
      setEditingId(null);
      invalidate();
    },
    onError: (e: Error) => message.error(e.message || '수정에 실패했습니다.'),
  });

  const deleteItemM = useMutation({
    mutationFn: (id: string) => salaryApi.payroll.deleteItem(id),
    onSuccess: () => {
      message.success('삭제되었습니다.');
      invalidate();
    },
    onError: (e: Error) => message.error(e.message || '삭제에 실패했습니다.'),
  });

  const confirmM = useMutation({
    mutationFn: () => salaryApi.payroll.confirm(payrollId),
    onSuccess: () => {
      message.success('급여대장이 확정되었습니다.');
      invalidate();
    },
    onError: (e: Error) => message.error(e.message || '확정에 실패했습니다.'),
  });

  const payM = useMutation({
    mutationFn: () => salaryApi.payroll.markPaid(payrollId),
    onSuccess: () => {
      message.success('지급 완료 처리되었습니다.');
      invalidate();
    },
    onError: (e: Error) => message.error(e.message || '처리에 실패했습니다.'),
  });

  const payroll = payrollQ.data;
  const isDraft = payroll?.payrollStatus === 'DRAFT';
  const isConfirmed = payroll?.payrollStatus === 'CONFIRMED';
  const isPaid = payroll?.payrollStatus === 'PAID';

  const templateOptions = useMemo(() => {
    const list = templatesQ.data ?? [];
    return list
      .filter((t) => t.delYn !== 'Y' && t.salaryItemTemplateId)
      .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0))
      .map((t) => ({
        value: t.salaryItemTemplateId!,
        label: `${t.itemName ?? ''} (${ITEM_TYPE_KO[t.itemType ?? ''] ?? t.itemType})`,
      }));
  }, [templatesQ.data]);

  const sortedItems = useMemo(() => {
    const list = itemsQ.data ?? [];
    return [...list].sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
  }, [itemsQ.data]);

  const columns: ColumnsType<PayrollItem> = useMemo(
    () => [
      { title: '항목', dataIndex: 'itemName', key: 'itemName' },
      {
        title: '유형',
        dataIndex: 'itemType',
        key: 'itemType',
        render: (t: string) => ITEM_TYPE_KO[t] ?? t ?? '—',
      },
      {
        title: '금액',
        key: 'amount',
        align: 'right',
        render: (_, row) => {
          const id = row.payrollItemId;
          if (!id) return formatWon(row.amount);
          if (editingId === id) {
            return (
              <Space size="small">
                <InputNumber min={0} value={editAmount} onChange={(v) => setEditAmount(Number(v) || 0)} />
                <Button size="small" type="primary" onClick={() => updateItemM.mutate({ id, amount: editAmount })}>
                  저장
                </Button>
                <Button size="small" onClick={() => setEditingId(null)}>
                  취소
                </Button>
              </Space>
            );
          }
          return (
            <Space size="small">
              <span>{formatWon(row.amount)}</span>
              {isDraft && (
                <Button
                  type="link"
                  size="small"
                  className="!tw-p-0"
                  onClick={() => {
                    setEditingId(id);
                    setEditAmount(row.amount ?? 0);
                  }}
                >
                  수정
                </Button>
              )}
            </Space>
          );
        },
      },
      {
        title: '',
        key: 'del',
        width: 80,
        render: (_, row) =>
          isDraft && row.payrollItemId ? (
            <Popconfirm title="이 항목을 삭제할까요?" onConfirm={() => deleteItemM.mutate(row.payrollItemId!)}>
              <Button type="link" danger size="small" className="!tw-p-0">
                삭제
              </Button>
            </Popconfirm>
          ) : null,
      },
    ],
    [deleteItemM, editingId, editAmount, isDraft, updateItemM],
  );

  if (!payrollId) {
    return <Typography.Text type="danger">급여대장 ID가 없습니다.</Typography.Text>;
  }

  return (
    <Space direction="vertical" className="tw-w-full" size={16}>
      <Link to="/app/payroll/admin" className="tw-text-sm tw-text-[#2563EB]">
        ← 급여 관리
      </Link>

      <Card className="tw-border-slate-200/80 tw-shadow-sm" title="대장 요약" loading={payrollQ.isLoading}>
        {payroll && (
          <>
            <Descriptions column={{ xs: 1, sm: 2 }} size="small" bordered className="tw-mb-4">
              <Descriptions.Item label="구성원 ID">{payroll.memberId ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="귀속일">{payroll.payrollYearMonthDay ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="상태">
                <Tag>{STATUS_KO[payroll.payrollStatus ?? ''] ?? payroll.payrollStatus}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="실수령">{formatWon(payroll.netPay)}</Descriptions.Item>
            </Descriptions>
            <Space wrap>
              {isDraft && (
                <Button
                  type="primary"
                  loading={confirmM.isPending}
                  onClick={() => {
                    modal.confirm({
                      title: '급여대장을 확정할까요?',
                      content: '확정 후에는 수정이 제한될 수 있습니다.',
                      onOk: () => confirmM.mutateAsync(),
                    });
                  }}
                >
                  확정
                </Button>
              )}
              {isConfirmed && (
                <Button type="primary" loading={payM.isPending} onClick={() => payM.mutate()}>
                  지급 완료
                </Button>
              )}
              {isPaid && <Typography.Text type="success">지급 완료된 대장입니다.</Typography.Text>}
            </Space>
          </>
        )}
      </Card>

      <Card className="tw-border-slate-200/80 tw-shadow-sm" title="급여 항목">
        {isDraft && (
          <Form
            form={addForm}
            layout="inline"
            className="tw-mb-4 tw-flex tw-flex-wrap tw-items-end tw-gap-2"
            onFinish={(v) => addItemM.mutate({ templateId: v.templateId, amount: v.amount })}
          >
            <Form.Item name="templateId" label="템플릿" rules={[{ required: true }]}>
              <Select
                placeholder="항목 선택"
                className="tw-min-w-[240px]"
                options={templateOptions}
                loading={templatesQ.isLoading}
                showSearch
                optionFilterProp="label"
              />
            </Form.Item>
            <Form.Item name="amount" label="금액" rules={[{ required: true }]}>
              <InputNumber min={0} className="tw-min-w-[140px]" />
            </Form.Item>
            <Form.Item>
              <Button type="primary" htmlType="submit" loading={addItemM.isPending}>
                항목 추가
              </Button>
            </Form.Item>
          </Form>
        )}
        {!isDraft && (
          <Typography.Paragraph type="secondary" className="!tw-mt-0 !tw-mb-4 !tw-text-sm">
            확정·지급된 대장은 항목을 바꿀 수 없습니다.
          </Typography.Paragraph>
        )}
        <Table<PayrollItem>
          rowKey={(r) => r.payrollItemId ?? `${r.itemName}`}
          loading={itemsQ.isLoading}
          columns={columns}
          dataSource={sortedItems}
          pagination={false}
          size="small"
        />
      </Card>
    </Space>
  );
}
