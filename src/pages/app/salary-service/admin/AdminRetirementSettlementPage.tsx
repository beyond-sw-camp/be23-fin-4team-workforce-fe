/**
 * /app/salary/retirement-settlement — 관리자 퇴직 정산 (시스템 관리자)
 *
 * - 사직 결재 cascade 가 자동 생성한 RETIREMENT_SETTLEMENT Payroll 목록
 * - DRAFT 상태 일괄 확인 후 [확정] 처리
 * - 행 클릭 시 시뮬 상세 모달 (평균임금 / 근속 / 일액 / 적용근거)
 */
import { useMemo, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  App,
  Button,
  Card,
  Descriptions,
  Empty,
  Modal,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { salaryApi } from '@/features/salary-service/api/salaryApi';
import type {
  PayrollAdminListItem,
  RetirementSimRes,
} from '@/features/salary-service/types';

const QK_LIST = ['salary', 'payroll', 'admin-list', 'retirement-settlement'] as const;

const STATUS_LABEL: Record<string, string> = {
  DRAFT: '대기',
  CONFIRMED: '확정',
  PAID: '지급 완료',
};
const STATUS_COLOR: Record<string, string> = {
  DRAFT: 'gold',
  CONFIRMED: 'blue',
  PAID: 'green',
};

const TYPE_LABEL: Record<string, string> = {
  LEGAL: '법정 퇴직금',
  DB: 'DB형 퇴직연금',
  DC: 'DC형 퇴직연금',
};

function formatWon(v: number | null | undefined): string {
  if (typeof v !== 'number') return '—';
  return v.toLocaleString('ko-KR') + '원';
}

function formatDate(iso?: string | null): string {
  if (!iso) return '—';
  const d = dayjs(iso);
  return d.isValid() ? d.format('YYYY-MM-DD') : iso;
}

/**
 * 퇴직 정산 화면 - 급여 정산 관리 탭 내부에서 임베드 가능
 *  embedded=true 면 페이지 헤더(타이틀/설명) 숨김
 */
export function AdminRetirementSettlementPage({ embedded = false }: { embedded?: boolean } = {}) {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([]);
  const [simTarget, setSimTarget] = useState<PayrollAdminListItem | null>(null);

  // 회사 전체 Payroll 조회 후 RETIREMENT_SETTLEMENT 만 필터
  // 별도 전용 API 없이 listByCompanyMonth() 의 month 필터 생략 + payrollType 필터로 처리
  const listQ = useQuery({
    queryKey: QK_LIST,
    queryFn: () => salaryApi.payroll.listByCompanyMonth(),
  });

  const rows = useMemo<PayrollAdminListItem[]>(() => {
    return (listQ.data ?? []).filter((p) => p.payrollType === 'RETIREMENT_SETTLEMENT');
  }, [listQ.data]);

  // 행 단위 시뮬 상세 (모달 열릴 때만 호출)
  const simQ = useQuery<RetirementSimRes>({
    queryKey: ['salary', 'retirement', 'sim', simTarget?.memberId, simTarget?.payrollYearMonthDay],
    queryFn: () =>
      salaryApi.retirement.simulateForMember(simTarget!.memberId, {
        resignDate: simTarget!.payrollYearMonthDay,
      }),
    enabled: !!simTarget,
  });

  // 일괄 확정 (DRAFT → CONFIRMED)
  const bulkConfirmM = useMutation({
    mutationFn: (ids: string[]) => salaryApi.payroll.bulkConfirm(ids),
    onSuccess: (res) => {
      message.success(`${res.success}건 확정 완료`);
      setSelectedRowKeys([]);
      void qc.invalidateQueries({ queryKey: QK_LIST });
    },
    onError: (e: Error) => message.error(e.message || '확정 처리에 실패했습니다.'),
  });

  // 일괄 지급 (CONFIRMED → PAID)
  const bulkPayM = useMutation({
    mutationFn: (ids: string[]) => salaryApi.payroll.bulkPay(ids),
    onSuccess: (res) => {
      message.success(`${res.success}건 지급 처리`);
      setSelectedRowKeys([]);
      void qc.invalidateQueries({ queryKey: QK_LIST });
    },
    onError: (e: Error) => message.error(e.message || '지급 처리에 실패했습니다.'),
  });

  const draftCount = rows.filter((r) => r.payrollStatus === 'DRAFT').length;
  const confirmedCount = rows.filter((r) => r.payrollStatus === 'CONFIRMED').length;
  const paidCount = rows.filter((r) => r.payrollStatus === 'PAID').length;
  const totalAmount = rows.reduce((sum, r) => sum + (r.netPay ?? 0), 0);

  const columns: ColumnsType<PayrollAdminListItem> = [
    {
      title: '직원',
      key: 'member',
      width: 200,
      render: (_, r) => (
        <div className="tw-leading-tight">
          <div className="tw-font-medium tw-text-slate-900">{r.name ?? '—'}</div>
          <div className="tw-text-xs tw-text-slate-500">
            {[r.organizationName, r.sabun].filter(Boolean).join(' · ') || '—'}
          </div>
        </div>
      ),
    },
    {
      title: '퇴직일',
      dataIndex: 'payrollYearMonthDay',
      key: 'payrollYearMonthDay',
      width: 130,
      render: (v: string) => formatDate(v),
    },
    {
      // 정산 합계 (퇴직금 + 미사용 연차 수당 + 일할 급여 - 세금 등 공제) = netPay
      // 순수 퇴직금만 분리 표시는 [시뮬 상세] 모달에서 확인
      title: '실수령액',
      dataIndex: 'netPay',
      key: 'netPay',
      width: 160,
      align: 'right',
      render: (v: number) => (
        <Typography.Text strong>{formatWon(v)}</Typography.Text>
      ),
    },
    {
      title: '총지급',
      dataIndex: 'totalPayment',
      key: 'totalPayment',
      width: 140,
      align: 'right',
      render: (v: number) => formatWon(v),
    },
    {
      title: '상태',
      dataIndex: 'payrollStatus',
      key: 'payrollStatus',
      width: 110,
      align: 'center',
      render: (s: string) => (
        <Tag color={STATUS_COLOR[s] ?? 'default'}>{STATUS_LABEL[s] ?? s}</Tag>
      ),
    },
    {
      title: '지급일',
      dataIndex: 'paidAt',
      key: 'paidAt',
      width: 120,
      render: (v?: string | null) => formatDate(v),
    },
    {
      title: '생성일',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 130,
      render: (v?: string | null) => formatDate(v),
    },
    {
      title: '상세',
      key: 'detail',
      width: 180,
      align: 'center',
      render: (_, r) => (
        <Space size={4} wrap>
          <Button type="link" size="small" className="!tw-px-1" onClick={() => setSimTarget(r)}>
            시뮬 상세
          </Button>
          <Link
            to="/app/payroll/admin/$payrollId"
            params={{ payrollId: r.payrollId }}
            search={{ tab: 'company', from: 'retirement' }}
            className="tw-text-[#2563EB] tw-text-sm"
          >
            명세서 상세
          </Link>
        </Space>
      ),
    },
  ];

  return (
    <Space direction="vertical" className="tw-w-full" size={16}>
      {!embedded && (
        <div>
          <Typography.Title level={4} className="!tw-m-0 !tw-text-slate-900">
            퇴직 정산
          </Typography.Title>
          <Typography.Paragraph type="secondary" className="!tw-mb-0 !tw-mt-1 !tw-text-sm">
            사직 결재 승인 시 자동 생성된 퇴직정산 내역. 검토 후 [확정] → [지급] 순으로 처리합니다.
          </Typography.Paragraph>
        </div>
      )}

      <div className="tw-grid tw-grid-cols-2 md:tw-grid-cols-4 tw-gap-3">
        <SummaryCard label="대기 (DRAFT)" value={`${draftCount}건`} tone="gold" />
        <SummaryCard label="확정" value={`${confirmedCount}건`} tone="blue" />
        <SummaryCard label="지급 완료" value={`${paidCount}건`} tone="green" />
        <SummaryCard label="누적 지급액" value={formatWon(totalAmount)} tone="slate" />
      </div>

      <Alert
        type="info"
        showIcon
        message="퇴직 정산 항목 안내"
        description="사직서 결재 승인 직후 회사 RetirementPolicy(LEGAL/DB/DC)에 따라 자동 계산됩니다. 1년 미만 근속은 퇴직금 0원으로 생성됩니다. 명세서 총액은 [퇴직금 + 미사용 연차 수당 + 퇴직월 일할 급여 - 세금 등 공제] 입니다. 순수 퇴직금만 따로 보려면 [시뮬 상세] 버튼을 클릭하세요."
      />

      <Card className="tw-border-slate-200/80 tw-shadow-sm">
        <div className="tw-mb-3 tw-flex tw-flex-wrap tw-items-center tw-justify-between tw-gap-2">
          <Typography.Text type="secondary" className="tw-text-xs">
            선택 {selectedRowKeys.length}건
          </Typography.Text>
          <Space size="small" wrap>
            <Button
              type="primary"
              disabled={selectedRowKeys.length === 0 || bulkConfirmM.isPending}
              loading={bulkConfirmM.isPending}
              onClick={() => bulkConfirmM.mutate(selectedRowKeys)}
            >
              일괄 확정
            </Button>
            <Button
              danger
              disabled={selectedRowKeys.length === 0 || bulkPayM.isPending}
              loading={bulkPayM.isPending}
              onClick={() => bulkPayM.mutate(selectedRowKeys)}
            >
              일괄 지급
            </Button>
          </Space>
        </div>
        <Table<PayrollAdminListItem>
          rowKey="payrollId"
          loading={listQ.isLoading}
          columns={columns}
          dataSource={rows}
          pagination={{ pageSize: 20, showSizeChanger: true }}
          rowSelection={{
            selectedRowKeys,
            onChange: (keys) => setSelectedRowKeys(keys as string[]),
            getCheckboxProps: (r) => ({ disabled: r.payrollStatus === 'PAID' }),
          }}
          locale={{ emptyText: <Empty description="퇴직 정산 대상이 없습니다" /> }}
        />
      </Card>

      {/* 시뮬 상세 모달 */}
      <Modal
        open={!!simTarget}
        title={simTarget ? `${simTarget.name ?? '직원'} 퇴직금 시뮬 상세` : '시뮬 상세'}
        onCancel={() => setSimTarget(null)}
        footer={[
          <Button key="close" onClick={() => setSimTarget(null)}>
            닫기
          </Button>,
        ]}
        width={680}
        destroyOnHidden
      >
        {simQ.isLoading || !simQ.data ? (
          <Typography.Text type="secondary">불러오는 중...</Typography.Text>
        ) : (
          <Space direction="vertical" className="tw-w-full" size={12}>
            <Descriptions size="small" bordered column={2}>
              <Descriptions.Item label="제도" span={2}>
                <Tag color="blue">{TYPE_LABEL[simQ.data.retirementType] ?? simQ.data.retirementType}</Tag>
                <Typography.Text className="!tw-ml-2 !tw-text-xs" type="secondary">
                  {simQ.data.modeDescription}
                </Typography.Text>
              </Descriptions.Item>
              <Descriptions.Item label="입사일">{formatDate(simQ.data.joinDate)}</Descriptions.Item>
              <Descriptions.Item label="퇴직일">{formatDate(simQ.data.resignDate)}</Descriptions.Item>
              <Descriptions.Item label="재직일수">
                {simQ.data.serviceDays.toLocaleString('ko-KR')}일
              </Descriptions.Item>
              <Descriptions.Item label="자격">
                {simQ.data.eligible ? <Tag color="green">충족 (1년 이상)</Tag> : <Tag>미충족</Tag>}
              </Descriptions.Item>
              <Descriptions.Item label="평균 월급">{formatWon(simQ.data.avgMonthlyWage)}</Descriptions.Item>
              <Descriptions.Item label="3개월 임금총액">
                {formatWon(simQ.data.basePeriodPayment)}
              </Descriptions.Item>
              <Descriptions.Item label="단순 일평균">
                {formatWon(simQ.data.simpleDailyAverage)}
              </Descriptions.Item>
              <Descriptions.Item label="평균임금 일액 (가산 후)">
                {formatWon(simQ.data.averageDailyWage)}
              </Descriptions.Item>
              <Descriptions.Item label="통상시급 일액">
                {formatWon(simQ.data.ordinaryDailyWage)}
              </Descriptions.Item>
              <Descriptions.Item label="적용 일평균 (max)">
                {formatWon(simQ.data.appliedDailyWage)}
                <Typography.Text type="secondary" className="!tw-ml-2 !tw-text-xs">
                  ({simQ.data.appliedBasis === 'ORDINARY' ? '통상시급' : '평균임금'} 적용)
                </Typography.Text>
              </Descriptions.Item>
              <Descriptions.Item label="예상 퇴직금" span={2}>
                <Typography.Title level={4} className="!tw-m-0 !tw-text-[#dc2626]">
                  {formatWon(simQ.data.estimatedAmount)}
                </Typography.Title>
              </Descriptions.Item>
            </Descriptions>
            <Alert type="warning" showIcon message={simQ.data.disclaimer} />
          </Space>
        )}
      </Modal>
    </Space>
  );
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'gold' | 'blue' | 'green' | 'slate';
}) {
  const colorClass = {
    gold: 'tw-text-amber-600',
    blue: 'tw-text-blue-600',
    green: 'tw-text-emerald-600',
    slate: 'tw-text-slate-800',
  }[tone];
  return (
    <div className="tw-rounded-lg tw-border tw-border-slate-200 tw-bg-white tw-px-4 tw-py-3">
      <div className="tw-text-[12px] tw-text-slate-500">{label}</div>
      <div className={`tw-mt-1 tw-text-lg tw-font-bold ${colorClass}`}>{value}</div>
    </div>
  );
}
