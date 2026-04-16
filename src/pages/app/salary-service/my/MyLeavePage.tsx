/** /app/leave — 내 휴가 잔여 + 회사 연차 정책 테이블 */
import { Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { Card, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useMemo } from 'react';
import { useAuth } from '@/features/auth/useAuth';
import { attendanceApi } from '@/features/salary-service/api/attendanceApi';
import type { LeavePolicy, MemberBalance } from '@/features/salary-service/types';

const BALANCE_TYPE_KO: Record<string, string> = {
  ANNUAL: '당해 연차',
  MONTHLY: '월차',
  CARRYOVER: '이월 연차',
};

const ACCRUAL_KO: Record<string, string> = {
  FISCAL: '회계연도',
  HIRE_DATE: '입사일',
};

export function MyLeavePage() {
  const { user } = useAuth();

  const balanceQ = useQuery({
    queryKey: ['salary', 'member-balance', 'mine'],
    queryFn: () => attendanceApi.memberBalance.listMine(),
  });

  const policyQ = useQuery({
    queryKey: ['salary', 'leave-policies'],
    queryFn: () => attendanceApi.leavePolicy.list(),
  });

  const balanceColumns: ColumnsType<MemberBalance> = useMemo(
    () => [
      {
        title: '유형',
        dataIndex: 'balanceType',
        key: 'balanceType',
        render: (t: string) => BALANCE_TYPE_KO[t] ?? t ?? '—',
      },
      { title: '부여', dataIndex: 'totalGranted', key: 'totalGranted' },
      { title: '사용', dataIndex: 'totalUsed', key: 'totalUsed' },
      { title: '잔여', dataIndex: 'remaining', key: 'remaining', render: (v: number) => <strong>{v ?? '—'}</strong> },
      { title: '만료일', dataIndex: 'expirationDate', key: 'expirationDate' },
      {
        title: '사용 가능',
        dataIndex: 'isUsableYn',
        key: 'isUsableYn',
        render: (yn: string) => (yn === 'Y' ? <Tag color="green">예</Tag> : <Tag>아니오</Tag>),
      },
    ],
    [],
  );

  const policyColumns: ColumnsType<LeavePolicy> = useMemo(
    () => [
      {
        title: '발생 기준',
        dataIndex: 'accrualBase',
        key: 'accrualBase',
        render: (v: string) => ACCRUAL_KO[v] ?? v ?? '—',
      },
      { title: '기본 연차(일)', dataIndex: 'defaultAnnualDays', key: 'defaultAnnualDays' },
      {
        title: '이월',
        key: 'carry',
        render: (_, row) => (
          <span>
            {row.isCarryoverYn === 'Y' ? `가능 (${row.carryoverDays ?? '—'}일)` : '불가'}
          </span>
        ),
      },
      {
        title: '정산 지급',
        dataIndex: 'isPayoutYn',
        key: 'isPayoutYn',
        render: (yn: string) => (yn === 'Y' ? '예' : '아니오'),
      },
    ],
    [],
  );

  return (
    <Space direction="vertical" className="tw-w-full" size={16}>
      <div className="tw-flex tw-flex-wrap tw-items-start tw-justify-between tw-gap-3">
        <div>
          <Typography.Title level={4} className="!tw-m-0 !tw-text-slate-900">
            휴가
          </Typography.Title>
          <Typography.Paragraph type="secondary" className="!tw-mb-0 !tw-mt-1 !tw-text-sm">
            잔여 일수는 salary-service <Typography.Text code>GET /member-balance</Typography.Text> 기준입니다. 신청·승인은
            결재 연동 후 반영됩니다.
          </Typography.Paragraph>
        </div>
        {user?.isSystemAdmin && (
          <Space size="middle" wrap className="tw-text-sm">
            <Link to="/app/leave/grant" className="tw-font-medium tw-text-[#2563EB]">
              휴가 부여
            </Link>
            <Link to="/app/leave/policies" className="tw-font-medium tw-text-[#2563EB]">
              연차 정책
            </Link>
          </Space>
        )}
      </div>

      <Card className="tw-border-slate-200/80 tw-shadow-sm" title="내 휴가 잔여">
        <Table<MemberBalance>
          rowKey={(r) => r.memberBalanceId ?? `${r.balanceType}-${r.expirationDate}`}
          loading={balanceQ.isLoading}
          columns={balanceColumns}
          dataSource={balanceQ.data ?? []}
          pagination={false}
          size="small"
          locale={{ emptyText: '부여된 휴가 잔여가 없습니다.' }}
        />
      </Card>

      <Card className="tw-border-slate-200/80 tw-shadow-sm" title="회사 연차 정책 요약">
        <Table<LeavePolicy>
          rowKey={(r) => r.policyId ?? 'policy'}
          loading={policyQ.isLoading}
          columns={policyColumns}
          dataSource={policyQ.data ?? []}
          pagination={false}
          size="small"
          locale={{ emptyText: '등록된 연차 정책이 없습니다.' }}
        />
      </Card>
    </Space>
  );
}
