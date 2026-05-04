/**
 * 급여 등록 탭
 *
 * 활성 급여(Salary) 가 아직 없는 재직자만 보여주는 화면.
 * - 신규 입사자 / 누락된 직원을 한 곳에서 빠르게 등록한다.
 * - [급여 등록] 클릭 시 같은 탭에서 SalaryTab 의 등록 모달을 인라인으로 띄움
 *   (tableHidden 모드로 SalaryTab 을 임베드 -> 모달만 노출).
 *
 * 데이터 소스: salaryApi.salary.precheck() 의 missingSalary 배열.
 */
import { useEffect, useRef, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Card, Empty, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { salaryApi } from '@/features/salary-service/api/salaryApi';
import { SalaryTab } from '@/pages/app/salary-service/admin/AdminSalarySettingsPage';
import type { PayrollPrecheckMemberRef } from '@/features/salary-service/types';

type SalaryRegisterTabProps = {
  /** deep-link 진입 시 (직원 생성 직후 / 직원 상세 [급여 등록] 빠른 액션 등) 해당 직원으로 모달 자동 오픈 */
  createForMemberId?: string;
};

export function SalaryRegisterTab({ createForMemberId }: SalaryRegisterTabProps = {}) {
  const precheckQ = useQuery({
    queryKey: ['salary', 'salaries', 'precheck'],
    queryFn: () => salaryApi.salary.precheck(),
    staleTime: 60_000,
  });

  /** 클릭한 직원 정보 - 모달 자동 오픈 + 이름·부서 라벨 prefill 용.
   *  닫히면 null 로 reset 해서 다음 등록 클릭에 다시 열 수 있게 한다. */
  const [registerMember, setRegisterMember] = useState<PayrollPrecheckMemberRef | null>(null);

  /** deep-link createForMemberId 1회성 트리거. 같은 값으로 재렌더돼도 한 번만 열도록 ref 추적. */
  const handledCreateMemberIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!createForMemberId) return;
    if (handledCreateMemberIdRef.current === createForMemberId) return;
    handledCreateMemberIdRef.current = createForMemberId;
    setRegisterMember({ memberId: createForMemberId } as PayrollPrecheckMemberRef);
  }, [createForMemberId]);

  const rows = precheckQ.data?.missingSalary ?? [];
  const totalActive = precheckQ.data?.totalActiveMembers ?? 0;
  const missingBank = precheckQ.data?.missingBankAccount ?? [];

  const cols: ColumnsType<PayrollPrecheckMemberRef> = [
    {
      title: '사번',
      dataIndex: 'sabun',
      key: 'sabun',
      width: 120,
      render: (v) => v ?? '-',
    },
    {
      title: '이름',
      dataIndex: 'name',
      key: 'name',
      width: 140,
      render: (v) => <Typography.Text strong>{v ?? '-'}</Typography.Text>,
    },
    {
      title: '부서',
      dataIndex: 'organizationName',
      key: 'organizationName',
      render: (v) => v ?? '-',
    },
    {
      title: '계좌',
      key: 'bank',
      width: 110,
      render: (_, r) => {
        const noBank = r.memberId && missingBank.some((m) => m.memberId === r.memberId);
        return noBank ? <Tag color="orange">미등록</Tag> : <Tag color="green">등록</Tag>;
      },
    },
    {
      title: '액션',
      key: 'action',
      width: 110,
      render: (_, r) => (
        <Button
          type="primary"
          size="small"
          onClick={() => r.memberId && setRegisterMember(r)}
        >
          급여 등록
        </Button>
      ),
    },
  ];

  return (
    <Space direction="vertical" className="tw-w-full" size={16}>
      <Alert
        showIcon
        type="info"
        message="신규 입사자의 급여는 [급여 등록] 으로 직접 등록해야 정산에 포함됩니다."
        description="신규 입사자뿐만 아니라 기존 재직자 중 급여가 누락된 경우에도 이곳에서 한 번에 등록할 수 있습니다."
      />

      <Space wrap>
        <Tag color="default">전체 재직자 {totalActive}명</Tag>
        <Tag color={rows.length > 0 ? 'orange' : 'green'}>
          급여 미등록 {rows.length}명
        </Tag>
      </Space>

      {rows.length === 0 ? (
        <Card>
          <Empty
            description={
              <Space direction="vertical" size={4}>
                <span>모든 재직자가 활성 급여를 보유하고 있습니다.</span>
                <Link to="/app/payroll/admin" search={{ tab: 'salary' }}>
                  [급여 변동 이력] 으로 이동 -&gt;
                </Link>
              </Space>
            }
          />
        </Card>
      ) : (
        <Table<PayrollPrecheckMemberRef>
          rowKey={(r) => r.memberId ?? Math.random().toString()}
          loading={precheckQ.isLoading}
          dataSource={rows}
          columns={cols}
          pagination={{ pageSize: 20 }}
          size="middle"
        />
      )}

      {/* 모달 인라인 오픈용 - SalaryTab 의 등록 폼과 동일한 흐름.
          registerMemberId 가 set 되면 SalaryTab 안의 createForMemberId useEffect 가 모달을 자동으로 연다.
          닫히면 onModalClose 로 부모 state 리셋 -> 같은 직원 다시 클릭해도 재오픈 가능. */}
      <SalaryTab
        tableHidden
        createForMemberId={registerMember?.memberId ?? undefined}
        prefilledMember={
          registerMember?.memberId
            ? {
                memberId: registerMember.memberId,
                name: registerMember.name ?? undefined,
                organizationName: registerMember.organizationName ?? undefined,
              }
            : undefined
        }
        onModalClose={() => setRegisterMember(null)}
      />
    </Space>
  );
}

export default SalaryRegisterTab;
