/** /app/leave — 휴가 계획 관리 (직원)
 *
 *  레퍼런스 화면 톤으로 재구성
 *  - 상단 KPI 4장: 발생 / 사용 / 잔여 / 촉진 (그대로 유지)
 *  - 가운데 sub summary: 계획 신청 기한 / 촉진 안내 수신
 *  - 휴가 정책 안내 카드
 *  - 휴가 계획 신청 내용 표 (LeaveRequest 데이터 기반)
 *  - 신청은 전자결재 메뉴 안내 유지
 */
import { Link, useNavigate } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  App,
  Button,
  Card,
  Descriptions,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import {
  DownloadOutlined,
  FileTextOutlined,
  FormOutlined,
  SendOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useMemo } from 'react';
import { useAuth } from '@/features/auth/useAuth';
import { approvalApi } from '@/features/approvals/api/approvalApi';
import { attendanceApi } from '@/features/salary-service/api/attendanceApi';
import type {
  CompanyLeaveType,
  LeaveRequest,
} from '@/features/salary-service/types';

const ACCRUAL_KO: Record<string, string> = {
  FISCAL: '회계연도',
  HIRE_DATE: '입사일',
};

// 결재 상태 한글 + 색상
const APPROVAL_STATUS_KO: Record<string, string> = {
  PENDING: '대기',
  APPROVED: '승인',
  REJECTED: '반려',
  CANCELLED: '취소',
};
const APPROVAL_STATUS_COLOR: Record<string, string> = {
  PENDING: 'gold',
  APPROVED: 'green',
  REJECTED: 'red',
  CANCELLED: 'default',
};

// 잔여 차감 잔액 유형 한글 (참고용)
const BALANCE_TYPE_KO: Record<string, string> = {
  ANNUAL: '당해 연차',
  MONTHLY: '월차',
  CARRYOVER: '이월 연차',
};

// 휴가 계획 신청 내용 표 행 LeaveRequest + 휴가종류명 결합
type LeavePlanRow = LeaveRequest & {
  rowNo: number;
  leaveTypeName: string;
};

function formatDate(iso?: string | null) {
  if (!iso) return '—';
  const d = dayjs(iso);
  return d.isValid() ? d.format('YYYY-MM-DD') : String(iso);
}

export function MyLeavePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { message } = App.useApp();

  // 전자결재 휴가신청서 문서 양식 조회 deep link 용
  const approvalDocsQ = useQuery({
    queryKey: ['approval', 'documents', 'active'],
    queryFn: () => approvalApi.listActiveDocuments(),
  });

  // 휴가신청서 양식 docId 조회 이름이 휴가 + 신청 포함된 양식
  const leaveRequestDocId = useMemo(() => {
    const docs = approvalDocsQ.data ?? [];
    const exact = docs.find((d) => d.documentName.trim() === '휴가 신청서');
    if (exact) return exact.documentId;
    const fuzzy = docs.find(
      (d) => d.documentName.includes('휴가') && d.documentName.includes('신청'),
    );
    return fuzzy?.documentId;
  }, [approvalDocsQ.data]);

  // 휴가신청 버튼 핸들러 전자결재 휴가신청서 양식으로 이동
  const handleNewLeaveRequest = () => {
    if (leaveRequestDocId) {
      void navigate({
        to: '/app/approvals',
        search: {
          tab: 'compose',
          sideNav: 'request-compose',
          docId: leaveRequestDocId,
        },
      });
      return;
    }
    if (approvalDocsQ.isLoading) {
      message.info('결재 양식을 불러오는 중입니다 잠시 후 다시 시도해 주세요');
      return;
    }
    // 양식이 등록되지 않은 경우 결재 작성 화면으로만 이동 사용자가 양식 직접 선택
    message.warning('휴가 신청서 양식이 등록되지 않았습니다 전자결재에서 직접 선택해 주세요');
    void navigate({
      to: '/app/approvals',
      search: { tab: 'compose', sideNav: 'request-compose' },
    });
  };

  const balanceQ = useQuery({
    queryKey: ['salary', 'member-balance', 'mine'],
    queryFn: () => attendanceApi.memberBalance.listMine(),
  });

  const policyQ = useQuery({
    queryKey: ['salary', 'leave-policies'],
    queryFn: () => attendanceApi.leavePolicy.list(),
  });

  // 휴가 계획 회신 응답 받지 못한 또는 진행 중인 촉진 건수
  const promotionQ = useQuery({
    queryKey: ['salary', 'leave-promotion', 'mine'],
    queryFn: () => attendanceApi.leavePromotion.listMy(),
  });

  // 휴가 종류 마스터 휴가 신청 행에 휴가종류명 매핑
  const leaveTypesQ = useQuery({
    queryKey: ['attendance', 'company-leave-types'],
    queryFn: () => attendanceApi.companyLeaveType.list(),
  });

  // 휴가 계획 신청 내용 (내 LeaveRequest 이력)
  const requestsQ = useQuery({
    queryKey: ['salary', 'leave-requests', 'my'],
    queryFn: () => attendanceApi.leaveRequest.listMyHistory({ page: 0, size: 100 }),
  });

  const balances = balanceQ.data ?? [];
  const totalGranted = balances.reduce((sum, row) => sum + (row.totalGranted ?? 0), 0);
  const totalUsed = balances.reduce((sum, row) => sum + (row.totalUsed ?? 0), 0);
  const totalRemaining = balances.reduce((sum, row) => sum + (row.remaining ?? 0), 0);
  // 촉진 대상 휴가 일수 합 응답 안 한 항목 우선
  const totalPromoted = (promotionQ.data ?? []).reduce(
    (sum, row) => sum + (row.remaining ?? 0),
    0,
  );

  const activePolicy = useMemo(
    () => (policyQ.data ?? []).find((p) => p.policyId),
    [policyQ.data],
  );

  const leaveTypeMap = useMemo(() => {
    const map = new Map<string, string>();
    (leaveTypesQ.data ?? []).forEach((t: CompanyLeaveType) => {
      if (t.companyLeaveTypeId) map.set(t.companyLeaveTypeId, t.name ?? '—');
    });
    return map;
  }, [leaveTypesQ.data]);

  // 휴가 계획 신청 내용 행 내 신청 이력 전체(최근 신청 순)
  const planRows: LeavePlanRow[] = useMemo(() => {
    const items = requestsQ.data?.content ?? [];
    // 최근 신청 위로
    const sorted = [...items].sort((a, b) => {
      const da = a.requestedAt ?? a.startDate ?? '';
      const db = b.requestedAt ?? b.startDate ?? '';
      return db.localeCompare(da);
    });
    return sorted.map((r, idx) => ({
      ...r,
      rowNo: idx + 1,
      leaveTypeName: r.companyLeaveTypeId
        ? leaveTypeMap.get(r.companyLeaveTypeId) ?? '—'
        : '—',
    }));
  }, [requestsQ.data, leaveTypeMap]);

  // CSV 다운로드 간단 신청 내용 표 그대로
  const handleDownload = () => {
    const headers = [
      'No',
      '상태',
      '휴가 종류',
      '시작일',
      '종료일',
      '일수',
      '차감 잔액',
      '비고',
      '결재 상태',
    ];
    const rows = planRows.map((r) => [
      r.rowNo,
      APPROVAL_STATUS_KO[r.approvalStatus ?? ''] ?? r.approvalStatus ?? '',
      r.leaveTypeName,
      formatDate(r.startDate),
      formatDate(r.endDate),
      r.usageDays ?? '',
      r.deductedBalanceType ? BALANCE_TYPE_KO[r.deductedBalanceType] ?? r.deductedBalanceType : '',
      (r.reason ?? '').replace(/\n/g, ' '),
      APPROVAL_STATUS_KO[r.approvalStatus ?? ''] ?? r.approvalStatus ?? '',
    ]);
    const csv = [headers, ...rows]
      .map((line) =>
        line
          .map((cell) => {
            const s = String(cell ?? '');
            return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
          })
          .join(','),
      )
      .join('\n');
    const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `leave-plan-history.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const planColumns: ColumnsType<LeavePlanRow> = [
    {
      title: 'No',
      dataIndex: 'rowNo',
      key: 'rowNo',
      width: 60,
      align: 'center',
    },
    {
      title: '상태',
      dataIndex: 'approvalStatus',
      key: 'approvalStatus',
      width: 90,
      align: 'center',
      render: (s?: string) => {
        const code = s ?? 'PENDING';
        return (
          <Tag color={APPROVAL_STATUS_COLOR[code] ?? 'default'}>
            {APPROVAL_STATUS_KO[code] ?? code}
          </Tag>
        );
      },
    },
    {
      title: '휴가 종류',
      dataIndex: 'leaveTypeName',
      key: 'leaveTypeName',
      width: 140,
      render: (v: string) => <strong>{v}</strong>,
    },
    {
      title: '시작일',
      dataIndex: 'startDate',
      key: 'startDate',
      width: 120,
      align: 'center',
      render: (v?: string | null) => formatDate(v),
    },
    {
      title: '종료일',
      dataIndex: 'endDate',
      key: 'endDate',
      width: 120,
      align: 'center',
      render: (v?: string | null) => formatDate(v),
    },
    {
      title: '일수',
      dataIndex: 'usageDays',
      key: 'usageDays',
      width: 80,
      align: 'right',
      render: (v?: number | null) =>
        typeof v === 'number' ? `${v}일` : <Typography.Text type="secondary">—</Typography.Text>,
    },
    {
      title: '차감 잔액',
      dataIndex: 'deductedBalanceType',
      key: 'deductedBalanceType',
      width: 110,
      render: (v?: string | null) =>
        v ? BALANCE_TYPE_KO[v] ?? v : <Typography.Text type="secondary">—</Typography.Text>,
    },
    {
      title: '비고',
      dataIndex: 'reason',
      key: 'reason',
      ellipsis: true,
      render: (v?: string | null) =>
        v && v.length > 0 ? (
          v
        ) : (
          <Typography.Text type="secondary">—</Typography.Text>
        ),
    },
    {
      title: '결재 상태',
      key: 'approvalState',
      width: 100,
      align: 'center',
      render: (_, row) => {
        const s = row.approvalStatus ?? 'PENDING';
        return (
          <Tag color={APPROVAL_STATUS_COLOR[s] ?? 'default'}>
            {APPROVAL_STATUS_KO[s] ?? s}
          </Tag>
        );
      },
    },
  ];

  return (
    <Space direction="vertical" className="tw-w-full" size={16}>
      <div className="tw-flex tw-flex-wrap tw-items-start tw-justify-between tw-gap-3">
        <div>
          <Typography.Title level={2} className="!tw-m-0 !tw-text-slate-900">
            휴가 계획 관리
          </Typography.Title>
          <Typography.Paragraph type="secondary" className="!tw-mb-0 !tw-mt-1 !tw-text-sm">
            내 휴가 현황(발생·사용·잔여·촉진) 과 신청 이력을 한 곳에서 확인합니다. 휴가 신청은 전자결재로 진행되며, 연차 사용 촉진 1차·2차 알림이 오면 휴가 계획 회신 메뉴에서 응답하세요.
          </Typography.Paragraph>
        </div>
        <Space size="small" wrap>
          <Link to="/app/leave/my-promotion">
            <Button icon={<FormOutlined />}>휴가 계획 회신</Button>
          </Link>
          <Button
            type="primary"
            icon={<SendOutlined />}
            onClick={handleNewLeaveRequest}
            loading={approvalDocsQ.isLoading}
          >
            휴가 신청
          </Button>
          {user?.isSystemAdmin && (
            <Link to="/app/leave/policies" className="tw-font-medium tw-text-[#2563EB]">
              연차 정책
            </Link>
          )}
        </Space>
      </div>

      <div className="tw-grid tw-grid-cols-2 tw-gap-3 lg:tw-grid-cols-4">
        <Card className="tw-border-slate-200/80 tw-shadow-sm" title="발생 휴가" size="small">
          <Typography.Title level={3} className="!tw-m-0">
            {totalGranted.toLocaleString('ko-KR')}일
          </Typography.Title>
        </Card>
        <Card className="tw-border-slate-200/80 tw-shadow-sm" title="사용한 휴가" size="small">
          <Typography.Title level={3} className="!tw-m-0">
            {totalUsed.toLocaleString('ko-KR')}일
          </Typography.Title>
        </Card>
        <Card className="tw-border-slate-200/80 tw-shadow-sm" title="잔여 휴가" size="small">
          <Typography.Title level={3} className="!tw-m-0 !tw-text-[#2563EB]">
            {totalRemaining.toLocaleString('ko-KR')}일
          </Typography.Title>
        </Card>
        <Card className="tw-border-slate-200/80 tw-shadow-sm" title="촉진 대상" size="small">
          <Typography.Title level={3} className="!tw-m-0 !tw-text-[#dc2626]">
            {totalPromoted.toLocaleString('ko-KR')}일
          </Typography.Title>
        </Card>
      </div>

      {/* sub summary 라인 계획 신청 기한 / 촉진 안내 수신 */}
      <Card className="tw-border-slate-200/80 tw-shadow-sm" size="small">
        <Descriptions
          size="small"
          column={{ xs: 1, sm: 2 }}
          items={[
            {
              key: 'planDeadline',
              label: '계획 신청 기한',
              children: <Typography.Text type="secondary">정책 미설정</Typography.Text>,
            },
            {
              key: 'promotionNotice',
              label: '촉진 안내 수신',
              children:
                (promotionQ.data ?? []).length > 0 ? (
                  <Tag color="orange">{(promotionQ.data ?? []).length}건</Tag>
                ) : (
                  <Typography.Text type="secondary">수신 없음</Typography.Text>
                ),
            },
          ]}
        />
      </Card>

      <Alert
        type="info"
        showIcon
        message={
          <span>
            휴가 신청은 <Link to="/app/approvals" className="tw-text-[#2563EB] tw-font-medium">전자결재</Link>
            {' '}메뉴에서 진행하며, 결재 이력은 결재함에서 확인할 수 있습니다.
          </span>
        }
      />

      <Card className="tw-border-slate-200/80 tw-shadow-sm" title="휴가 정책 안내" size="small">
        {activePolicy ? (
          <Space direction="vertical" size={4}>
            <Typography.Text>
              발생 기준: {ACCRUAL_KO[activePolicy.accrualBase ?? ''] ?? activePolicy.accrualBase ?? '—'}
            </Typography.Text>
            <Typography.Text>기본 연차: {activePolicy.defaultAnnualDays ?? 0}일</Typography.Text>
            <Typography.Text>
              이월: {activePolicy.isCarryoverYn === 'Y' ? `가능 (${activePolicy.carryoverDays ?? 0}일)` : '불가'}
            </Typography.Text>
            <Typography.Text>
              정산 지급: {activePolicy.isPayoutYn === 'Y' ? '가능' : '불가'}
            </Typography.Text>
          </Space>
        ) : (
          <Typography.Text type="secondary">등록된 연차 정책이 없습니다.</Typography.Text>
        )}
      </Card>

      <Card
        className="tw-border-slate-200/80 tw-shadow-sm"
        title={
          <Space>
            <span>휴가 신청 내역</span>
            <Typography.Text type="secondary" className="tw-text-xs">
              목록 {planRows.length} 건
            </Typography.Text>
          </Space>
        }
        extra={
          <Button
            icon={<DownloadOutlined />}
            size="small"
            onClick={handleDownload}
            disabled={planRows.length === 0}
          >
            다운로드
          </Button>
        }
      >
        <Table<LeavePlanRow>
          rowKey={(r) => r.leaveRequestId ?? `${r.rowNo}`}
          loading={requestsQ.isLoading || leaveTypesQ.isLoading}
          columns={planColumns}
          dataSource={planRows}
          pagination={{ pageSize: 10, showSizeChanger: true }}
          size="small"
          locale={{ emptyText: '조회 결과가 없습니다.' }}
        />
      </Card>
    </Space>
  );
}
