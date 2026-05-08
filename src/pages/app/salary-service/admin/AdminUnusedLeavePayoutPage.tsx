import { AppDataTable } from '@/shared/ui/AppDataTable';
/** /app/salary/unused-leave — 미사용 연차수당 미리보기 · 확정 (시스템 관리자)
 *
 *  백엔드 컨트롤러: UnusedLeavePayoutController (`/salary/unused-leave`)
 *    - GET  /preview?baseYear={year}&targetMonth={YYYY-MM}
 *    - POST /apply  { items: [{ payrollId, memberId, amount }] }
 */
import { Link } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  App, Alert, Badge, Button, Card, Form, InputNumber, Space, Tag, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useEffect, useMemo, useState } from 'react';
import { salaryApi } from '@/features/salary-service/api/salaryApi';
import type { UnusedLeavePayoutPreview } from '@/features/salary-service/types';

function formatWon(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return '—';
  return `${n.toLocaleString('ko-KR')}원`;
}

function defaultBaseYear(): number {
  return dayjs().year() - 1;
}

function defaultTargetMonth(): string {
  /** 백엔드 주석: "1월 급여대장에 반영". 기본값을 올해 1월로 세팅 */
  return `${dayjs().year()}-01`;
}

type QueryKey = readonly ['salary', 'unused-leave', 'preview', number, string];

export function AdminUnusedLeavePayoutPage() {
  const { message, modal } = App.useApp();
  const qc = useQueryClient();

  const [baseYear, setBaseYear] = useState<number>(defaultBaseYear());
  const [targetMonth, setTargetMonth] = useState<string>(defaultTargetMonth());
  const [enabled, setEnabled] = useState(false);

  /** 각 행의 조정 금액. 초기값은 preview의 calculatedAmount. rowKey = memberId */
  const [amountOverrides, setAmountOverrides] = useState<Record<string, number>>({});
  /** 각 행의 체크박스 선택 여부 (이미 반영·Payroll 없음은 자동 제외) */
  const [selectedKeys, setSelectedKeys] = useState<React.Key[]>([]);

  const previewQ = useQuery<
    UnusedLeavePayoutPreview[],
    Error,
    UnusedLeavePayoutPreview[],
    QueryKey
  >({
    queryKey: ['salary', 'unused-leave', 'preview', baseYear, targetMonth] as const,
    queryFn: () => salaryApi.unusedLeavePayout.preview(baseYear, targetMonth),
    enabled,
  });

  /** preview 결과가 바뀌면 조정금액 기본값을 calculatedAmount 로 세팅 */
  useEffect(() => {
    const rows = previewQ.data;
    if (!rows) return;
    const next: Record<string, number> = {};
    const selectable: React.Key[] = [];
    for (const r of rows) {
      const key = r.memberId ?? '';
      if (!key) continue;
      next[key] = Number(r.calculatedAmount ?? 0);
      if (r.targetPayrollId && !r.alreadyApplied && r.hasSalary) {
        selectable.push(key);
      }
    }
    setAmountOverrides(next);
    setSelectedKeys(selectable);
  }, [previewQ.data]);

  const applyM = useMutation({
    mutationFn: (items: { payrollId: string; memberId: string; amount: number }[]) =>
      salaryApi.unusedLeavePayout.apply({ items }),
    onSuccess: () => {
      message.success('미사용 연차수당이 급여대장에 반영되었습니다.');
      void qc.invalidateQueries({ queryKey: ['salary', 'unused-leave'] });
      void qc.invalidateQueries({ queryKey: ['salary', 'payroll'] });
      /** 반영 직후 최신 상태로 다시 preview */
      void previewQ.refetch();
    },
    onError: (e: Error) => message.error(e.message || '반영에 실패했습니다.'),
  });

  const rows = useMemo(() => previewQ.data ?? [], [previewQ.data]);

  const columns: ColumnsType<UnusedLeavePayoutPreview> = useMemo(
    () => [
      {
        title: '구성원',
        dataIndex: 'memberId',
        key: 'memberId',
        render: (v?: string) => (
          <Typography.Text className="tw-font-mono tw-text-xs">{v ?? '—'}</Typography.Text>
        ),
      },
      {
        title: '전년 12월 기본급',
        dataIndex: 'baseSalary',
        key: 'baseSalary',
        align: 'right',
        render: (v: number | null | undefined) => formatWon(v),
      },
      {
        title: '1일 통상임금',
        dataIndex: 'dailyWage',
        key: 'dailyWage',
        align: 'right',
        render: (v: number | null | undefined) => formatWon(v),
      },
      {
        title: '미이월 잔여일',
        dataIndex: 'unusedDays',
        key: 'unusedDays',
        align: 'right',
        render: (v: number | null | undefined) =>
          v == null ? '—' : `${Number(v).toLocaleString('ko-KR')}일`,
      },
      {
        title: '자동 계산',
        dataIndex: 'calculatedAmount',
        key: 'calculatedAmount',
        align: 'right',
        render: (v: number | null | undefined) => formatWon(v),
      },
      {
        title: '반영 금액 (조정)',
        key: 'amount',
        align: 'right',
        render: (_, row) => {
          const key = row.memberId ?? '';
          const disabled = !row.targetPayrollId || row.alreadyApplied || !row.hasSalary;
          return (
            <InputNumber
              className="tw-w-36"
              min={0}
              step={1000}
              value={amountOverrides[key] ?? 0}
              disabled={disabled}
              formatter={(n) => (n == null ? '' : Number(n).toLocaleString('ko-KR'))}
              parser={(s) => Number((s ?? '').replace(/[^\d.-]/g, ''))}
              onChange={(n) =>
                setAmountOverrides((prev) => ({ ...prev, [key]: Number(n ?? 0) }))
              }
            />
          );
        },
      },
      {
        title: '상태',
        key: 'status',
        render: (_, row) => {
          if (row.alreadyApplied) return <Tag color="green">이미 반영</Tag>;
          if (!row.hasSalary) return <Tag color="red">전년 12월 급여 없음</Tag>;
          if (!row.targetPayrollId) return <Tag color="orange">대상 Payroll 없음</Tag>;
          return <Tag color="blue">반영 가능</Tag>;
        },
      },
      {
        title: '경고',
        dataIndex: 'warning',
        key: 'warning',
        render: (w?: string | null) =>
          w ? (
            <Tooltip title={w}>
              <Badge status="warning" text={<span className="tw-text-xs">{w}</span>} />
            </Tooltip>
          ) : null,
      },
    ],
    [amountOverrides],
  );

  const selectableRowKeys = useMemo(
    () =>
      rows
        .filter((r) => r.targetPayrollId && !r.alreadyApplied && r.hasSalary)
        .map((r) => r.memberId ?? ''),
    [rows],
  );

  const onApplyClick = () => {
    const targets: { payrollId: string; memberId: string; amount: number }[] = [];
    for (const r of rows) {
      const key = r.memberId ?? '';
      if (!selectedKeys.includes(key)) continue;
      if (!r.targetPayrollId || !r.memberId) continue;
      targets.push({
        payrollId: r.targetPayrollId,
        memberId: r.memberId,
        amount: Number(amountOverrides[key] ?? 0),
      });
    }
    if (targets.length === 0) {
      message.warning('반영 가능한 대상이 없습니다.');
      return;
    }
    modal.confirm({
      title: `${targets.length}건을 ${targetMonth} 급여대장에 반영할까요?`,
      content: '이미 반영된 항목은 제외되고, 선택한 금액으로 덮어씁니다.',
      okText: '반영',
      okButtonProps: { type: 'primary' },
      onOk: () => applyM.mutateAsync(targets),
    });
  };

  return (
    <Space direction="vertical" className="tw-w-full" size={16}>
      <div className="tw-flex tw-flex-wrap tw-items-start tw-justify-between tw-gap-3">
        <div>
          <Typography.Title level={4} className="!tw-m-0 !tw-text-slate-900">
            미사용 연차수당
          </Typography.Title>
          <Typography.Paragraph type="secondary" className="!tw-mb-0 !tw-mt-1 !tw-text-sm">
            전년도 미이월 잔여 연차를 1월 급여대장에 수동 반영합니다.
          </Typography.Paragraph>
        </div>
        <Space wrap size="middle">
          <Link to="/app/payroll/admin" className="tw-text-sm tw-text-[#2563EB]">
            ← 급여 관리
          </Link>
        </Space>
      </div>

      <Card className="tw-border-slate-200/80 tw-shadow-sm" title="미리보기 조건">
        <Form
          layout="inline"
          onFinish={() => setEnabled(true)}
          initialValues={{ baseYear, targetMonth }}
        >
          <Form.Item label="기준 연도" required>
            <InputNumber
              min={2000}
              max={2100}
              value={baseYear}
              onChange={(n) => setBaseYear(Number(n ?? defaultBaseYear()))}
            />
          </Form.Item>
          <Form.Item
            label="대상 월"
            required
            tooltip="YYYY-MM 형식 (반영될 급여대장 귀속 월)"
          >
            <InputNumber
              min={2000_01}
              style={{ width: 140 }}
              value={Number(targetMonth.replace('-', '')) || Number(defaultTargetMonth().replace('-', ''))}
              onChange={(n) => {
                const raw = String(n ?? '').padStart(6, '0');
                if (raw.length >= 6) {
                  setTargetMonth(`${raw.slice(0, 4)}-${raw.slice(4, 6)}`);
                }
              }}
              formatter={(n) => {
                const s = String(n ?? '').padStart(6, '0');
                return s.length >= 6 ? `${s.slice(0, 4)}-${s.slice(4, 6)}` : s;
              }}
              parser={(s) => Number((s ?? '').replace(/[^\d]/g, ''))}
            />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={previewQ.isFetching}>
              불러오기
            </Button>
          </Form.Item>
        </Form>
      </Card>

      {previewQ.isError ? (
        <Alert
          type="error"
          showIcon
          message="미리보기 조회 실패"
          description={(previewQ.error as Error | undefined)?.message ?? '서버 오류'}
        />
      ) : null}

      <Card
        className="tw-border-slate-200/80 tw-shadow-sm"
        title={`대상 목록 (${rows.length})`}
        extra={
          <Space>
            <Typography.Text type="secondary" className="!tw-text-xs">
              선택: {selectedKeys.length} / 반영 가능: {selectableRowKeys.length}
            </Typography.Text>
            <Button
              type="primary"
              disabled={selectedKeys.length === 0}
              loading={applyM.isPending}
              onClick={onApplyClick}
            >
              선택 건 급여대장 반영
            </Button>
          </Space>
        }
      >
        <AppDataTable<UnusedLeavePayoutPreview>
          rowKey={(r) => r.memberId ?? ''}
          loading={previewQ.isLoading || previewQ.isFetching}
          columns={columns}
          dataSource={rows}
          pagination={{ pageSize: 20 }}
          size="small"
          rowSelection={{
            selectedRowKeys: selectedKeys,
            onChange: (keys) => setSelectedKeys(keys),
            getCheckboxProps: (r) => ({
              disabled: !r.targetPayrollId || r.alreadyApplied || !r.hasSalary,
            }),
          }}
          locale={{
            emptyText: enabled
              ? '대상이 없습니다.'
              : '기준 연도·대상 월 입력 후 "불러오기"를 누르세요.',
          }}
        />
      </Card>
    </Space>
  );
}
