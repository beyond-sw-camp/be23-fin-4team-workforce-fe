/** /app/payroll/admin — 구성원별 대장 조회·생성·삭제 (시스템 관리자) */
import { Link } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Card, DatePicker, Form, Input, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useMemo, useState } from 'react';
import { salaryApi } from '@/features/salary-service/api/salaryApi';
import type { Payroll } from '@/features/salary-service/types';

const STATUS_KO: Record<string, string> = {
  DRAFT: '작성 중',
  CONFIRMED: '확정',
  PAID: '지급 완료',
};

const STATUS_COLOR: Record<string, string> = {
  DRAFT: 'default',
  CONFIRMED: 'blue',
  PAID: 'green',
};

function formatWon(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return '—';
  return `${n.toLocaleString('ko-KR')}원`;
}

type CreateForm = {
  memberId: string;
  payrollYearMonthDay: dayjs.Dayjs;
};

export function AdminPayrollPage() {
  const { message, modal } = App.useApp();
  const qc = useQueryClient();
  const [targetMemberId, setTargetMemberId] = useState('');
  const [searchId, setSearchId] = useState('');

  const listQ = useQuery({
    queryKey: ['salary', 'payroll', 'member', searchId],
    queryFn: () => salaryApi.payroll.listByMember(searchId.trim()),
    enabled: Boolean(searchId.trim()),
  });

  const createM = useMutation({
    mutationFn: (v: CreateForm) =>
      salaryApi.payroll.create({
        memberId: v.memberId.trim(),
        payrollYearMonthDay: v.payrollYearMonthDay.format('YYYY-MM-DD'),
      }),
    onSuccess: () => {
      message.success('급여대장이 생성되었습니다.');
      void qc.invalidateQueries({ queryKey: ['salary', 'payroll'] });
    },
    onError: (e: Error) => message.error(e.message || '생성에 실패했습니다.'),
  });

  const deleteM = useMutation({
    mutationFn: (id: string) => salaryApi.payroll.delete(id),
    onSuccess: () => {
      message.success('삭제되었습니다.');
      void qc.invalidateQueries({ queryKey: ['salary', 'payroll'] });
    },
    onError: (e: Error) => message.error(e.message || '삭제에 실패했습니다.'),
  });

  /** 회사 단위 급여대장 재계산. settlementDate 미지정 시 정책 기준 자동 산정 */
  const recalculateM = useMutation({
    mutationFn: (settlementDate?: string) =>
      salaryApi.payroll.recalculate({ settlementDate: settlementDate ?? null }),
    onSuccess: (r) => {
      message.success(
        `재계산 완료 — 생성 ${r.created}, 중복스킵 ${r.duplicateSkip}, 기본급없음 ${r.noSalary}, 예외 ${r.badRequest + r.fail}`,
      );
      void qc.invalidateQueries({ queryKey: ['salary', 'payroll'] });
    },
    onError: (e: Error) => message.error(e.message || '재계산에 실패했습니다.'),
  });

  const onRecalculateClick = () => {
    let chosen: dayjs.Dayjs | null = null;
    modal.confirm({
      title: '회사 급여대장을 재계산할까요?',
      content: (
        <Space direction="vertical" size="small" className="tw-w-full">
          <Typography.Text type="secondary" className="!tw-text-xs">
            정산 연월일을 지정하거나 비워두면 정책 기준으로 자동 산정됩니다.
          </Typography.Text>
          <DatePicker
            className="tw-w-full"
            placeholder="정산일 (선택)"
            onChange={(d) => {
              chosen = d;
            }}
          />
        </Space>
      ),
      okText: '재계산',
      okButtonProps: { type: 'primary' },
      onOk: () =>
        recalculateM.mutateAsync(chosen ? chosen.format('YYYY-MM-DD') : undefined),
    });
  };

  const sorted = useMemo(() => {
    const rows = listQ.data ?? [];
    return [...rows].sort((a, b) => (b.payrollYearMonthDay ?? '').localeCompare(a.payrollYearMonthDay ?? ''));
  }, [listQ.data]);

  const columns: ColumnsType<Payroll> = useMemo(
    () => [
      { title: '귀속일', dataIndex: 'payrollYearMonthDay', key: 'payrollYearMonthDay' },
      {
        title: '상태',
        dataIndex: 'payrollStatus',
        key: 'payrollStatus',
        render: (s: string) => (
          <Tag color={STATUS_COLOR[s] ?? 'default'}>{STATUS_KO[s] ?? s ?? '—'}</Tag>
        ),
      },
      { title: '실수령', dataIndex: 'netPay', key: 'netPay', align: 'right', render: (v: number) => formatWon(v) },
      {
        title: '',
        key: 'act',
        width: 200,
        render: (_, row) =>
          row.payrollId ? (
            <Space size="small" wrap>
              <Link
                to="/app/payroll/admin/$payrollId"
                params={{ payrollId: row.payrollId }}
                className="tw-text-[#2563EB]"
              >
                항목·확정
              </Link>
              <Button
                type="link"
                danger
                size="small"
                className="!tw-p-0"
                disabled={row.payrollStatus === 'PAID'}
                onClick={() => {
                  modal.confirm({
                    title: '급여대장을 삭제할까요?',
                    content: '작성 중·확정 상태만 삭제 가능할 수 있습니다. 백엔드 정책을 따릅니다.',
                    okText: '삭제',
                    okButtonProps: { danger: true },
                    onOk: () => deleteM.mutateAsync(row.payrollId!),
                  });
                }}
              >
                삭제
              </Button>
            </Space>
          ) : null,
      },
    ],
    [deleteM, modal],
  );

  return (
    <Space direction="vertical" className="tw-w-full" size={16}>
      <div className="tw-flex tw-flex-wrap tw-items-start tw-justify-between tw-gap-3">
        <div>
          <Typography.Title level={4} className="!tw-m-0 !tw-text-slate-900">
            급여 관리
          </Typography.Title>
          <Typography.Paragraph type="secondary" className="!tw-mb-0 !tw-mt-1 !tw-text-sm">
            구성원 UUID로 목록을 불러온 뒤 대장을 만들거나, 항목·확정·지급을 처리합니다.
          </Typography.Paragraph>
        </div>
        <Space wrap size="middle">
          <Button onClick={onRecalculateClick} loading={recalculateM.isPending}>
            급여대장 재계산
          </Button>
          <Link to="/app/salary/unused-leave" className="tw-text-sm tw-text-[#2563EB]">
            미사용 연차수당
          </Link>
          <Link to="/app/salary/settings" className="tw-text-sm tw-text-[#2563EB]">
            급여 설정
          </Link>
          <Link to="/app/payroll" className="tw-text-sm tw-text-[#2563EB]">
            ← 내 급여
          </Link>
        </Space>
      </div>

      <Card className="tw-border-slate-200/80 tw-shadow-sm" title="구성원별 조회">
        <Space wrap className="tw-mb-4">
          <Input
            placeholder="구성원 UUID"
            value={targetMemberId}
            onChange={(e) => setTargetMemberId(e.target.value)}
            className="tw-min-w-[280px]"
          />
          <Button type="primary" onClick={() => setSearchId(targetMemberId)}>
            불러오기
          </Button>
        </Space>
        <Table<Payroll>
          rowKey={(r) => r.payrollId ?? `${r.payrollYearMonthDay}`}
          loading={listQ.isLoading}
          columns={columns}
          dataSource={sorted}
          pagination={{ pageSize: 10 }}
          size="small"
          locale={{ emptyText: searchId.trim() ? '급여대장이 없습니다.' : 'UUID 입력 후 불러오기를 누르세요.' }}
        />
      </Card>

      <Card className="tw-max-w-xl tw-border-slate-200/80 tw-shadow-sm" title="급여대장 생성">
        <Form<CreateForm>
          layout="vertical"
          initialValues={{ payrollYearMonthDay: dayjs() }}
          onFinish={(v) => createM.mutate(v)}
        >
          <Form.Item name="memberId" label="구성원 UUID" rules={[{ required: true }]}>
            <Input placeholder="대상 직원 ID" />
          </Form.Item>
          <Form.Item name="payrollYearMonthDay" label="정산 연월일" rules={[{ required: true }]}>
            <DatePicker className="tw-w-full" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={createM.isPending}>
              생성
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </Space>
  );
}
