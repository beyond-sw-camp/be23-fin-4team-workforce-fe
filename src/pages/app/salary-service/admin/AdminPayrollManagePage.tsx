/**
 * /app/payroll/admin/$payrollId
 * DRAFT일 때 항목 CRUD, 확정·지급 완료 버튼.
 */
import { useParams, useSearch, useRouter } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Card, DatePicker, Descriptions, Form, Input, InputNumber, Modal, Popconfirm, Select, Space, Statistic, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { type Dayjs } from 'dayjs';
import { useMemo, useState } from 'react';
import { salaryApi } from '@/features/salary-service/api/salaryApi';
import { AppModal } from '@/shared/ui/AppModal';
import type { RetroactiveMonthlyDiff, RetroactivePayrollResult, PayrollItem, SalaryItemTemplate } from '@/features/salary-service/types';
import { memberApi } from '@/features/member/api/memberApi';

const STATUS_KO: Record<string, string> = {
  DRAFT: '검토 전',
  CONFIRMED: '지급 대기',
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
  // 어느 탭/월/메뉴에서 진입했는지 — 뒤로가기 시 그대로 복귀
  const search = useSearch({ strict: false }) as {
    tab?: 'company' | 'member' | 'retirement' | 'salary';
    ym?: string;
    from?: 'retirement';
  };
  const fromTab = search?.tab ?? 'company';
  const fromYm = search?.ym;
  const fromMenu = search?.from;
  const router = useRouter();
  const { message, modal } = App.useApp();
  const qc = useQueryClient();
  const [addForm] = Form.useForm<{ templateId: string; amount: number }>();
  const [bonusForm] = Form.useForm<{ bonusType: 'BONUS' | 'PERFORMANCE'; amount: number }>();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState<number>(0);
  const [retroOpen, setRetroOpen] = useState(false);
  const [bonusModalOpen, setBonusModalOpen] = useState(false);
  const [itemModalOpen, setItemModalOpen] = useState(false);

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

  // 보너스 정책 한도 검증용 활성 정책 + 직원 기본급 정보 조회
  const bonusPolicyQ = useQuery({
    queryKey: ['salary', 'bonus-policy', 'active'],
    queryFn: () => salaryApi.bonusPolicy.getActive(),
    staleTime: 60_000,
  });

  const memberId = payrollQ.data?.memberId;
  const memberSalariesQ = useQuery({
    queryKey: ['salary', 'salaries', 'member', memberId],
    queryFn: () => salaryApi.salary.getByMemberId(memberId as string),
    enabled: Boolean(memberId),
    staleTime: 60_000,
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['salary', 'payroll', payrollId] });
    void qc.invalidateQueries({ queryKey: ['salary', 'payroll'] });
  };

  const resolveBonusTemplate = async (
    bonusType: 'BONUS' | 'PERFORMANCE',
    templates: SalaryItemTemplate[],
  ) => {
    const targetName = bonusType === 'BONUS' ? '상여금' : '성과급';
    const existing = templates.find((t) => t.itemName === targetName && t.itemType === 'EARNING' && t.delYn !== 'Y');
    if (existing?.salaryItemTemplateId) {
      return existing.salaryItemTemplateId;
    }
    const maxOrder = templates.reduce((acc, t) => Math.max(acc, t.displayOrder ?? 0), 0);
    const created = await salaryApi.salaryItemTemplate.create({
      itemName: targetName,
      itemType: 'EARNING',
      displayOrder: Math.max(70, maxOrder + 1),
      isTaxableYn: 'Y',
    });
    const createdId = created.salaryItemTemplateId;
    if (!createdId) {
      throw new Error(`${targetName} 템플릿 생성에 실패했습니다.`);
    }
    return createdId;
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

  const addBonusM = useMutation({
    mutationFn: async (v: { bonusType: 'BONUS' | 'PERFORMANCE'; amount: number }) => {
      const templates = templatesQ.data ?? [];
      const templateId = await resolveBonusTemplate(v.bonusType, templates);
      await salaryApi.payroll.addItem(payrollId, {
        salaryItemTemplateId: templateId,
        amount: v.amount,
      });
    },
    onSuccess: async () => {
      message.success('상여/성과 항목이 추가되었습니다.');
      bonusForm.resetFields();
      await qc.invalidateQueries({ queryKey: ['salary', 'salary-item-templates'] });
      invalidate();
    },
    onError: (e: Error) => message.error(e.message || '상여/성과 항목 추가에 실패했습니다.'),
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
    // 0원 항목 제외 - 실제 지급/공제된 항목만 노출 (회사 공통 템플릿이지만 직원별 미부여 항목은 amount=0 으로 펼쳐짐)
    return [...list]
      .filter((it) => (it.amount ?? 0) > 0)
      .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
  }, [itemsQ.data]);

  const earningsItems = useMemo(
    () => sortedItems.filter((it) => it.itemType === 'EARNING'),
    [sortedItems],
  );
  const deductionsItems = useMemo(
    () => sortedItems.filter((it) => it.itemType === 'DEDUCTION'),
    [sortedItems],
  );
  const earningsTotal = useMemo(
    () => earningsItems.reduce((s, it) => s + (it.amount ?? 0), 0),
    [earningsItems],
  );
  const deductionsTotal = useMemo(
    () => deductionsItems.reduce((s, it) => s + (it.amount ?? 0), 0),
    [deductionsItems],
  );

  // 보너스 정책 한도 검증
  // 정책 사용 시점 활성 baseSalary 기준 성과급 + 상여금 합계가 한도 초과 시 경고
  const bonusValidation = useMemo(() => {
    const policy = bonusPolicyQ.data;
    const salaries = memberSalariesQ.data ?? [];
    const items = itemsQ.data ?? [];
    const targetDate = payroll?.payrollYearMonthDay ?? null;

    if (!policy || policy.usePerformanceBonusYn !== 'Y') return null;
    if (!policy.performanceBonusMaxRate || policy.performanceBonusMaxRate <= 0) return null;

    // 귀속일 시점 활성 Salary 찾기
    const activeSalary = salaries.find((s) => {
      if (!s.effectiveFrom || !targetDate) return false;
      if (s.effectiveFrom > targetDate) return false;
      return !s.effectiveTo || s.effectiveTo >= targetDate;
    });
    const baseSalary = activeSalary?.baseSalary ?? 0;
    if (baseSalary <= 0) return null;

    // 상여금 / 성과급 항목명 매칭 합계
    const bonusTotal = items
      .filter((i) => i.itemType === 'EARNING')
      .filter((i) => {
        const name = i.itemName ?? '';
        return name.includes('상여') || name.includes('성과') || name.includes('보너스');
      })
      .reduce((sum, i) => sum + (i.amount ?? 0), 0);

    const maxAllowed = Math.floor(baseSalary * (policy.performanceBonusMaxRate / 100));
    const exceeds = bonusTotal > maxAllowed;
    const usagePercent = maxAllowed > 0 ? Math.round((bonusTotal / maxAllowed) * 100) : 0;

    return {
      baseSalary,
      bonusTotal,
      maxRate: policy.performanceBonusMaxRate,
      maxAllowed,
      exceeds,
      usagePercent,
      hasBonus: bonusTotal > 0,
    };
  }, [bonusPolicyQ.data, memberSalariesQ.data, itemsQ.data, payroll]);

  const buildColumns = (sign: '+' | '-'): ColumnsType<PayrollItem> => [
    { title: '항목', dataIndex: 'itemName', key: 'itemName' },
    {
      title: '금액',
      key: 'amount',
      align: 'right',
      render: (_, row) => {
        const id = row.payrollItemId;
        const amountColor = sign === '+' ? 'tw-text-blue-600' : 'tw-text-red-600';
        if (!id) {
          return (
            <span className={`${amountColor} tw-font-medium`}>
              {sign} {formatWon(row.amount)}
            </span>
          );
        }
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
            <span className={`${amountColor} tw-font-medium`}>
              {sign} {formatWon(row.amount)}
            </span>
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
      width: 60,
      render: (_, row) =>
        isDraft && row.payrollItemId ? (
          <Popconfirm title="이 항목을 삭제할까요?" onConfirm={() => deleteItemM.mutate(row.payrollItemId!)}>
            <Button type="link" danger size="small" className="!tw-p-0">
              삭제
            </Button>
          </Popconfirm>
        ) : null,
    },
  ];

  const earningsColumns = useMemo(
    () => buildColumns('+'),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [deleteItemM, editingId, editAmount, isDraft, updateItemM],
  );
  const deductionsColumns = useMemo(
    () => buildColumns('-'),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [deleteItemM, editingId, editAmount, isDraft, updateItemM],
  );

  if (!payrollId) {
    return <Typography.Text type="danger">급여대장 ID가 없습니다.</Typography.Text>;
  }

  return (
    <Space direction="vertical" className="tw-w-full" size={16}>
      <button
        type="button"
        onClick={() => {
          if (fromMenu === 'retirement') {
            // 퇴직 정산 탭으로 복귀 (별도 메뉴 -> 통합 탭으로 흡수됨)
            void router.navigate({ to: '/app/payroll/admin', search: { tab: 'retirement' } });
            return;
          }
          // 진입한 탭/월 그대로 복귀 (월별 정산 결과 탭은 ym 보존)
          // ym 없으면 대장의 정산 대상 월 또는 지급일 기준으로 fallback
          const ym =
            fromYm
            ?? payroll?.targetYearMonth
            ?? (payroll?.payrollYearMonthDay ? payroll.payrollYearMonthDay.slice(0, 7) : undefined);
          void router.navigate({
            to: '/app/payroll/admin',
            search: ym ? { tab: fromTab, ym } : { tab: fromTab },
          });
        }}
        className="tw-text-sm tw-text-[#2563EB] tw-bg-transparent tw-border-0 tw-p-0 tw-cursor-pointer hover:tw-underline"
      >
        ← {fromMenu === 'retirement' ? '퇴직 정산' : '급여 관리'}
      </button>

      <Card className="tw-border-slate-200/80 tw-shadow-sm" title="대장 요약" loading={payrollQ.isLoading}>
        {payroll && (
          <>
            <Descriptions column={{ xs: 1, sm: 2, md: 3 }} size="small" bordered className="tw-mb-4">
              <Descriptions.Item label="정산 대상 월">
                {(() => {
                  const ym = payroll.targetYearMonth;
                  if (ym) {
                    const m = parseInt(ym.split('-')[1] ?? '0', 10);
                    return <Tag color="geekblue">{`${m}월분`}</Tag>;
                  }
                  return payroll.payrollYearMonthDay ?? '—';
                })()}
              </Descriptions.Item>
              <Descriptions.Item label="지급일">
                {(() => {
                  if (payroll.paidAt) return payroll.paidAt;
                  if (!payroll.payrollYearMonthDay) return '—';
                  const d = dayjs(payroll.payrollYearMonthDay);
                  const dow = d.day();
                  const shifted = dow === 0 ? d.subtract(2, 'day') : dow === 6 ? d.subtract(1, 'day') : d;
                  // 지급일 미래면 (예정), 과거인데 paidAt 없으면 (미지급)
                  const today = dayjs().startOf('day');
                  const isFuture = shifted.isAfter(today);
                  return (
                    <span>
                      {shifted.format('YYYY-MM-DD')}{' '}
                      <Typography.Text type={isFuture ? 'secondary' : 'warning'} className="tw-text-xs">
                        ({isFuture ? '예정' : '미지급'})
                      </Typography.Text>
                    </span>
                  );
                })()}
              </Descriptions.Item>
              <Descriptions.Item label="상태">
                <Tag color={payroll.payrollStatus === 'PAID' ? 'green' : payroll.payrollStatus === 'CONFIRMED' ? 'blue' : 'default'}>
                  {STATUS_KO[payroll.payrollStatus ?? ''] ?? payroll.payrollStatus}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="총지급">{formatWon(payroll.totalPayment)}</Descriptions.Item>
              <Descriptions.Item label="총공제">{formatWon(payroll.totalDeduction)}</Descriptions.Item>
              <Descriptions.Item label="실수령">
                <Typography.Text strong className="!tw-text-blue-600">{formatWon(payroll.netPay)}</Typography.Text>
              </Descriptions.Item>
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
              {payroll.memberId && (
                <Button onClick={() => setRetroOpen(true)}>
                  소급분 자동 재계산
                </Button>
              )}
            </Space>
          </>
        )}
      </Card>

      {payroll?.memberId && (
        <RetroactiveModal
          open={retroOpen}
          onClose={() => setRetroOpen(false)}
          memberId={payroll.memberId}
        />
      )}

      <Card className="tw-border-slate-200/80 tw-shadow-sm" title="급여 항목">
        {bonusValidation && bonusValidation.hasBonus && (
          <Alert
            className="tw-mb-3"
            type={bonusValidation.exceeds ? 'error' : bonusValidation.usagePercent >= 80 ? 'warning' : 'info'}
            showIcon
            message={
              <span>
                <b>보너스 정책 한도</b>{' '}
                <Tag color="blue">기본급 {bonusValidation.baseSalary.toLocaleString('ko-KR')}원</Tag>
                <Tag color={bonusValidation.exceeds ? 'red' : 'green'}>
                  최대 {bonusValidation.maxRate}% = {bonusValidation.maxAllowed.toLocaleString('ko-KR')}원
                </Tag>
                <Tag color={bonusValidation.exceeds ? 'red' : 'default'}>
                  현재 합계 {bonusValidation.bonusTotal.toLocaleString('ko-KR')}원 ({bonusValidation.usagePercent}%)
                </Tag>
              </span>
            }
            description={
              bonusValidation.exceeds ? (
                <Typography.Text type="danger">
                  성과급/상여 합계가 보너스 정책 최대 한도를 초과했습니다. 정책 위반 — 등록 전 검토 필요.
                </Typography.Text>
              ) : bonusValidation.usagePercent >= 80 ? (
                <Typography.Text type="warning">
                  한도 사용률 80% 이상입니다. 추가 지급 시 한도 초과에 주의하세요.
                </Typography.Text>
              ) : null
            }
          />
        )}
        {isDraft && (
          <Space className="tw-mb-3" wrap>
            <Button
              type="primary"
              onClick={() => {
                bonusForm.resetFields();
                bonusForm.setFieldsValue({ bonusType: 'BONUS' });
                setBonusModalOpen(true);
              }}
            >
              + 상여/성과 추가
            </Button>
            <Button
              onClick={() => {
                addForm.resetFields();
                setItemModalOpen(true);
              }}
            >
              + 항목 추가
            </Button>
          </Space>
        )}

        <Modal
          open={bonusModalOpen}
          title="상여/성과 추가"
          onCancel={() => setBonusModalOpen(false)}
          onOk={() => bonusForm.submit()}
          confirmLoading={addBonusM.isPending}
          okText="추가"
          cancelText="취소"
          destroyOnHidden
        >
          <Form
            form={bonusForm}
            layout="vertical"
            initialValues={{ bonusType: 'BONUS' }}
            onFinish={(v) =>
              addBonusM.mutateAsync(v).then(() => setBonusModalOpen(false)).catch(() => {})
            }
          >
            <Form.Item name="bonusType" label="구분" rules={[{ required: true }]}>
              <Select
                options={[
                  { value: 'BONUS', label: '상여금' },
                  { value: 'PERFORMANCE', label: '성과급' },
                ]}
              />
            </Form.Item>
            <Form.Item name="amount" label="금액 (원)" rules={[{ required: true }]}>
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
          </Form>
        </Modal>

        <Modal
          open={itemModalOpen}
          title="급여 항목 추가"
          onCancel={() => setItemModalOpen(false)}
          onOk={() => addForm.submit()}
          confirmLoading={addItemM.isPending}
          okText="추가"
          cancelText="취소"
          destroyOnHidden
        >
          <Form
            form={addForm}
            layout="vertical"
            onFinish={(v) =>
              addItemM
                .mutateAsync({ templateId: v.templateId, amount: v.amount })
                .then(() => setItemModalOpen(false))
                .catch(() => {})
            }
          >
            <Form.Item name="templateId" label="템플릿" rules={[{ required: true }]}>
              <Select
                placeholder="항목 선택"
                options={templateOptions}
                loading={templatesQ.isLoading}
                showSearch
                optionFilterProp="label"
              />
            </Form.Item>
            <Form.Item name="amount" label="금액 (원)" rules={[{ required: true }]}>
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
          </Form>
        </Modal>

        {!isDraft && (
          <Typography.Paragraph type="secondary" className="!tw-mt-0 !tw-mb-4 !tw-text-sm">
          </Typography.Paragraph>
        )}
        <div className="tw-grid tw-grid-cols-1 md:tw-grid-cols-2 tw-gap-4">
          <div>
            <div className="tw-flex tw-items-center tw-justify-between tw-mb-2">
              <Typography.Text strong className="!tw-text-blue-600">지급 항목</Typography.Text>
              <Tag color="blue">{earningsItems.length}건</Tag>
            </div>
            <Table<PayrollItem>
              rowKey={(r) => r.payrollItemId ?? `e-${r.itemName}`}
              loading={itemsQ.isLoading}
              columns={earningsColumns}
              dataSource={earningsItems}
              pagination={false}
              size="small"
              locale={{ emptyText: '지급 항목 없음' }}
              summary={() => (
                <Table.Summary.Row className="tw-bg-blue-50">
                  <Table.Summary.Cell index={0}>
                    <Typography.Text strong>지급 합계</Typography.Text>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={1} align="right">
                    <Typography.Text strong className="!tw-text-blue-600">
                      + {formatWon(earningsTotal)}
                    </Typography.Text>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={2} />
                </Table.Summary.Row>
              )}
            />
          </div>
          <div>
            <div className="tw-flex tw-items-center tw-justify-between tw-mb-2">
              <Typography.Text strong className="!tw-text-red-600">공제 항목</Typography.Text>
              <Tag color="red">{deductionsItems.length}건</Tag>
            </div>
            <Table<PayrollItem>
              rowKey={(r) => r.payrollItemId ?? `d-${r.itemName}`}
              loading={itemsQ.isLoading}
              columns={deductionsColumns}
              dataSource={deductionsItems}
              pagination={false}
              size="small"
              locale={{ emptyText: '공제 항목 없음' }}
              summary={() => (
                <Table.Summary.Row className="tw-bg-red-50">
                  <Table.Summary.Cell index={0}>
                    <Typography.Text strong>공제 합계</Typography.Text>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={1} align="right">
                    <Typography.Text strong className="!tw-text-red-600">
                      - {formatWon(deductionsTotal)}
                    </Typography.Text>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={2} />
                </Table.Summary.Row>
              )}
            />
          </div>
        </div>

        <div className="tw-mt-4 tw-pt-3 tw-border-t tw-border-slate-200 tw-flex tw-justify-end">
          <Space size="large" wrap>
            <span>
              <Typography.Text type="secondary">총지급</Typography.Text>{' '}
              <Typography.Text strong className="!tw-text-blue-600">
                {formatWon(earningsTotal)}
              </Typography.Text>
            </span>
            <span>
              <Typography.Text type="secondary">총공제</Typography.Text>{' '}
              <Typography.Text strong className="!tw-text-red-600">
                {formatWon(deductionsTotal)}
              </Typography.Text>
            </span>
            <span>
              <Typography.Text type="secondary">실수령</Typography.Text>{' '}
              <Typography.Text strong className="!tw-text-base !tw-text-emerald-600">
                {formatWon(earningsTotal - deductionsTotal)}
              </Typography.Text>
            </span>
          </Space>
        </div>
      </Card>
    </Space>
  );
}

/* ─────────────────────────────────────────────────────────────────────
 * 소급분 자동 재계산 모달
 *  통상임금 인상 시 과거 월 가산수당 새 통상임금 기준 재계산
 *  preview → 차액 표시 → apply 시 RETROACTIVE Payroll DRAFT 발행
 * ───────────────────────────────────────────────────────────────────── */

type RetroFormValues = {
  range: [Dayjs, Dayjs];
  newOrdinaryWage: number;
  memo?: string;
};

function RetroactiveModal({
  open,
  onClose,
  memberId,
}: {
  open: boolean;
  onClose: () => void;
  memberId: string;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm<RetroFormValues>();
  const [preview, setPreview] = useState<RetroactivePayrollResult | null>(null);

  const memberQ = useQuery({
    queryKey: ['member', 'detail', memberId],
    queryFn: () => memberApi.detailOrNull(memberId),
    enabled: Boolean(memberId) && open,
    staleTime: 60_000,
  });

  const previewM = useMutation({
    mutationFn: (v: RetroFormValues) =>
      salaryApi.payroll.retroactivePreview({
        memberId,
        fromMonth: v.range[0].format('YYYY-MM'),
        toMonth: v.range[1].format('YYYY-MM'),
        newOrdinaryWage: v.newOrdinaryWage,
        memo: v.memo?.trim() || null,
      }),
    onSuccess: (res) => setPreview(res),
    onError: (e: Error) => message.error(e.message || '미리보기 실패'),
  });

  const applyM = useMutation({
    mutationFn: (v: RetroFormValues) =>
      salaryApi.payroll.retroactiveApply({
        memberId,
        fromMonth: v.range[0].format('YYYY-MM'),
        toMonth: v.range[1].format('YYYY-MM'),
        newOrdinaryWage: v.newOrdinaryWage,
        memo: v.memo?.trim() || null,
      }),
    onSuccess: (res) => {
      message.success('소급분 명세서가 발행되었습니다.');
      setPreview(res);
    },
    onError: (e: Error) => message.error(e.message || '발행 실패'),
  });

  const fmt = (n: number | null | undefined) => `${(n ?? 0).toLocaleString('ko-KR')}원`;
  const m = memberQ.data;

  return (
    <AppModal
      open={open}
      title="소급분 자동 재계산"
      width={720}
      onCancel={() => {
        setPreview(null);
        form.resetFields();
        onClose();
      }}
      footer={null}
      destroyOnHidden
    >
      <div className="tw-px-5 tw-py-4">
      {/* 대상 직원 요약 - 이름/사번/조직/직급 */}
      <div className="tw-rounded-md tw-bg-slate-50 tw-border tw-border-slate-200 tw-px-3 tw-py-2 tw-mb-3">
        <Space size={8} wrap>
          <Typography.Text strong>{m?.name ?? '—'}</Typography.Text>
          {m?.sabun && <Tag color="default">사번 {m.sabun}</Tag>}
          {m?.organizationName && <Tag color="blue">{m.organizationName}</Tag>}
          {(m?.jobGradeName || m?.jobTitleName) && (
            <Tag color="geekblue">{[m?.jobGradeName, m?.jobTitleName].filter(Boolean).join(' / ')}</Tag>
          )}
        </Space>
      </div>

      <Typography.Paragraph type="secondary" className="!tw-text-xs !tw-mb-3">
        통상임금 인상 시 과거 월 가산수당(연장/야간/휴일)을 새 통상임금 기준으로 재계산해 차액을
        RETROACTIVE 명세서로 발행합니다. 발행 후 DRAFT 상태로 생성되며 인사팀이 검토 후 확정/지급 처리해야 합니다.
      </Typography.Paragraph>

      <Form<RetroFormValues>
        form={form}
        layout="vertical"
        onFinish={(v) => previewM.mutate(v)}
        initialValues={{
          range: [dayjs().subtract(3, 'month').startOf('month'), dayjs().subtract(1, 'month').endOf('month')],
        }}
      >
        <Form.Item
          label="소급 기간 (월 단위)"
          name="range"
          rules={[{ required: true, message: '소급 기간을 선택하세요.' }]}
        >
          <DatePicker.RangePicker picker="month" format="YYYY-MM" style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item
          label="새 통상임금 (원)"
          name="newOrdinaryWage"
          rules={[
            { required: true, message: '새 통상임금을 입력하세요.' },
            { type: 'number', min: 0, message: '0 이상' },
          ]}
          extra="기본급 + 통상임금 플래그 Y 정기수당 합계 (인상 후)"
        >
          <InputNumber
            min={0}
            step={100000}
            style={{ width: '100%' }}
            formatter={(v) => (v ? `${Number(v).toLocaleString('ko-KR')}원` : '')}
            parser={(v) => Number((v ?? '').replace(/[^0-9]/g, '')) as 0}
          />
        </Form.Item>
        <Form.Item label="메모 (선택)" name="memo">
          <Input.TextArea rows={2} maxLength={300} placeholder="예: 2026 단협 통상임금 인상 6.5%" />
        </Form.Item>
        <Space>
          <Button type="primary" htmlType="submit" loading={previewM.isPending}>
            차액 미리보기
          </Button>
          {preview && preview.totalDiff > 0 && !preview.newPayrollId && (
            <Button
              type="primary"
              danger
              loading={applyM.isPending}
              onClick={() => {
                const v = form.getFieldsValue();
                applyM.mutate(v);
              }}
            >
              차액 합계 발행 ({fmt(preview.totalDiff)})
            </Button>
          )}
        </Space>
      </Form>

      {preview && (
        <div className="tw-mt-4 tw-pt-4 tw-border-t tw-border-slate-200">
          <div className="tw-grid tw-grid-cols-3 tw-gap-3 tw-mb-3">
            <Statistic title="기존 통상임금 (추정)" value={preview.previousOrdinaryWage} suffix="원" formatter={(v) => Number(v).toLocaleString('ko-KR')} />
            <Statistic title="새 통상임금" value={preview.newOrdinaryWage} suffix="원" formatter={(v) => Number(v).toLocaleString('ko-KR')} valueStyle={{ color: '#10b981' }} />
            <Statistic
              title="차액 합계"
              value={preview.totalDiff}
              suffix="원"
              formatter={(v) => Number(v).toLocaleString('ko-KR')}
              valueStyle={{
                color: preview.totalDiff > 0 ? '#1677ff' : preview.totalDiff < 0 ? '#ef4444' : undefined,
                fontWeight: 700,
              }}
            />
          </div>

          <Table<RetroactiveMonthlyDiff>
            rowKey={(r) => r.month}
            dataSource={preview.monthlyDiffs}
            pagination={false}
            size="small"
            columns={[
              { title: '월', dataIndex: 'month', width: 100 },
              {
                title: '기존 가산수당',
                dataIndex: 'oldAllowance',
                align: 'right',
                render: (n: number) => fmt(n),
              },
              {
                title: '새 가산수당',
                dataIndex: 'newAllowance',
                align: 'right',
                render: (n: number) => fmt(n),
              },
              {
                title: '차액',
                dataIndex: 'diff',
                align: 'right',
                render: (n: number) => (
                  <span className={n > 0 ? 'tw-text-blue-600 tw-font-semibold' : n < 0 ? 'tw-text-red-600' : ''}>
                    {fmt(n)}
                  </span>
                ),
              },
            ]}
            locale={{ emptyText: '소급 대상 PAID 정기급여 명세가 없습니다.' }}
          />

          {preview.message && (
            <Alert
              type={preview.newPayrollId ? 'success' : preview.totalDiff > 0 ? 'info' : 'warning'}
              showIcon
              className="!tw-mt-3"
              message={preview.message}
              description={
                preview.newPayrollId && (
                  <Typography.Text type="secondary" className="!tw-text-xs">
                    발행일 {preview.issuedDate} · Payroll ID {preview.newPayrollId}
                  </Typography.Text>
                )
              }
            />
          )}
        </div>
      )}
      </div>
    </AppModal>
  );
}
