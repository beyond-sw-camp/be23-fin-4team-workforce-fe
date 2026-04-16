import { useQuery } from '@tanstack/react-query';
import { Alert, Card, Select, Space, Table, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useRouterState } from '@tanstack/react-router';
import { approvalRequestApi, isOfficialApprovalRequestType } from '@/features/approvals/api/approvalRequestApi';
import { ApprovalRequestReadOnlyModal } from '@/features/approvals/ui/ApprovalRequestReadOnlyModal';
import { useAuth } from '@/features/auth/useAuth';
import { memberApi } from '@/features/member/api/memberApi';
import type { OrgChartOrgNode } from '@/features/organization/api/organizationApi';
import { organizationApi } from '@/features/organization/api/organizationApi';

function findMemberOrganizationId(roots: OrgChartOrgNode[], memberId: string): string | null {
  const id = memberId.trim();
  if (!id) return null;
  for (const node of roots) {
    for (const g of node.jobGrades) {
      for (const m of g.members) {
        if (m.memberId === id) return node.organizationId;
      }
    }
    const sub = findMemberOrganizationId(node.children, memberId);
    if (sub) return sub;
  }
  return null;
}

function formatDateTime(value?: string | null) {
  if (!value) return '—';
  const d = dayjs(value);
  return d.isValid() ? d.format('YYYY-MM-DD HH:mm') : value;
}

function requestStatusTag(status: string) {
  const u = status.toUpperCase();
  if (u === 'APPROVED') return <Tag color="success">승인</Tag>;
  if (u === 'REJECTED') return <Tag color="error">반려</Tag>;
  if (u === 'CANCELED') return <Tag color="default">취소</Tag>;
  if (u === 'PENDING') return <Tag color="processing">결재중</Tag>;
  if (u === 'WAIT') return <Tag color="processing">제출됨</Tag>;
  return <Tag>{status}</Tag>;
}

function isHttpStatus(e: unknown, status: number): boolean {
  if (!e || typeof e !== 'object') return false;
  const r = (e as { response?: { status?: number } }).response;
  return r?.status === status;
}

type DeptView = 'draft' | 'ref' | 'official';

function parseDeptView(v: unknown): DeptView {
  return v === 'ref' || v === 'official' ? v : 'draft';
}

export function DepartmentApprovalsInboxPage() {
  const navigate = useNavigate();
  const routeLocation = useRouterState({
    select: (s) => ({
      pathname: s.location.pathname,
      search: s.location.search as { organizationId?: string; deptView?: string },
    }),
  });
  const routeSearch = routeLocation.search;
  const onDepartmentRoute = routeLocation.pathname === '/app/approvals/department';
  const deptView = parseDeptView(routeSearch.deptView);
  const urlOrgId = routeSearch.organizationId?.trim() ?? '';

  const { user } = useAuth();
  const authMemberId = user?.id?.trim();

  const { data: me } = useQuery({
    queryKey: ['member', 'detail', authMemberId],
    queryFn: () => memberApi.detail(authMemberId!),
    enabled: Boolean(authMemberId),
    staleTime: 60_000,
  });

  const { data: orgChart } = useQuery({
    queryKey: ['organization', 'org-chart'],
    queryFn: () => organizationApi.getOrgChart(),
    staleTime: 60_000,
  });

  const myOrgId = useMemo(() => {
    const fromDetail = me?.organizationId?.trim();
    if (fromDetail) return fromDetail;
    if (authMemberId && orgChart?.organizations?.length) {
      return findMemberOrganizationId(orgChart.organizations, authMemberId);
    }
    return null;
  }, [me?.organizationId, authMemberId, orgChart?.organizations]);

  const orgSelectOptions = useMemo(() => {
    if (!myOrgId) return [];
    return [{ value: myOrgId, label: me?.organizationName?.trim() || '내 부서' }];
  }, [myOrgId, me?.organizationName]);

  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);

  const orgIdInOptions = useMemo(() => {
    if (!urlOrgId || !myOrgId) return false;
    return urlOrgId === myOrgId;
  }, [urlOrgId, myOrgId]);

  useEffect(() => {
    if (!onDepartmentRoute) return;
    if (urlOrgId && orgIdInOptions) {
      setSelectedOrgId(urlOrgId);
      return;
    }
    if (myOrgId) {
      setSelectedOrgId((prev) => prev ?? myOrgId);
    }
  }, [myOrgId, onDepartmentRoute, orgIdInOptions, urlOrgId]);

  useEffect(() => {
    if (!onDepartmentRoute) return;
    if (!myOrgId || urlOrgId) return;
    if (orgSelectOptions.length === 0) return;
    navigate({
      to: '/app/approvals/department',
      search: { organizationId: myOrgId, deptView },
      replace: true,
    });
  }, [deptView, myOrgId, navigate, onDepartmentRoute, orgSelectOptions.length, urlOrgId]);

  const [detailRequestId, setDetailRequestId] = useState<string | null>(null);

  const deptListEnabled = Boolean(selectedOrgId) && deptView !== 'ref';

  const {
    data: rows = [],
    isFetching,
    error,
    refetch,
  } = useQuery({
    queryKey: ['approval-user', 'department-requests', selectedOrgId],
    queryFn: () => approvalRequestApi.listDepartmentRequests(selectedOrgId!),
    enabled: deptListEnabled,
    retry: (_, err) => !isHttpStatus(err, 403),
  });

  const displayRows = useMemo(() => {
    if (deptView === 'ref') return [];
    if (deptView === 'official') {
      return rows.filter((r) => isOfficialApprovalRequestType(r.requestType));
    }
    return rows;
  }, [deptView, rows]);


  return (
    <div className="tw-mx-auto tw-max-w-6xl tw-space-y-4">
      <div className="tw-flex tw-flex-wrap tw-items-start tw-justify-between tw-gap-3">
        <div>
          <Typography.Title level={4} className="!tw-mb-1">
            부서 문서함
            {deptView === 'draft' ? '' : deptView === 'ref' ? ' — 부서 참조함' : ' — 공문 발송함'}
          </Typography.Title>
          <Typography.Paragraph type="secondary" className="!tw-mb-0 tw-text-sm">
            {deptView === 'official'
              ? '부서 기안 완료 목록 중 requestType이 OFFICIAL인 문서만 표시합니다.'
              : deptView === 'ref'
                ? '부서 단위 참조·공람 전용 API가 없어 목록을 비워 둡니다.'
                : '본인 소속 부서에서 최종 처리된(승인·반려) 결재 문서를 조회합니다. 민감 양식은 서버에서 제외됩니다.'}
          </Typography.Paragraph>
        </div>
        <Link to="/app/approvals" className="tw-text-sm tw-text-blue-600 hover:tw-underline">
          전자결재(작성·결재함)로 이동
        </Link>
      </div>

      <Card size="small">
        <Space direction="vertical" size="middle" className="tw-w-full">
          <div className="tw-flex tw-flex-wrap tw-items-center tw-gap-3">
            <Typography.Text strong>조회 기준 부서</Typography.Text>
            <Select
              className="tw-min-w-[240px]"
              placeholder="부서를 선택하세요"
              loading={!myOrgId && Boolean(authMemberId)}
              value={selectedOrgId ?? undefined}
              options={orgSelectOptions.map((o) => ({ value: o.value, label: o.label }))}
              onChange={(v) => {
                setSelectedOrgId(v);
                navigate({
                  to: '/app/approvals/department',
                  search: { organizationId: v, deptView },
                });
              }}
              disabled={orgSelectOptions.length === 0}
            />
          </div>

          {deptView === 'ref' ? (
            <Alert
              type="info"
              showIcon
              className="tw-text-sm"
              message="부서 참조함은 전용 API가 없어 비 있는 목록입니다. 서버에 부서 단위 viewers 조회가 생기면 연결할 수 있습니다."
            />
          ) : null}

          {deptView === 'official' ? (
            <Alert
              type="info"
              showIcon
              className="tw-text-sm"
              message="부서 완료 목록을 불러와 requestType OFFICIAL만 필터링합니다. 서버에서 requestType 쿼리가 지원되면 그에 맞게 바꿀 수 있습니다."
            />
          ) : null}

          {error ? (
            <Alert
              type={isHttpStatus(error, 403) ? 'error' : 'warning'}
              showIcon
              message={
                isHttpStatus(error, 403)
                  ? '선택한 조직에 대한 조회 권한이 없습니다. URL의 organizationId가 본인 소속 부서와 일치하는지 확인하세요.'
                  : (error as Error)?.message || '목록을 불러오지 못했습니다.'
              }
              action={
                <Typography.Link onClick={() => void refetch()} className="tw-text-sm">
                  다시 시도
                </Typography.Link>
              }
            />
          ) : null}

          <Table
            size="small"
            rowKey="requestId"
            loading={deptListEnabled ? isFetching : false}
            dataSource={displayRows}
            pagination={{ pageSize: 15, showSizeChanger: true }}
            locale={{
              emptyText: selectedOrgId
                ? '표시할 문서가 없습니다.'
                : '소속 부서 정보를 불러오는 중이거나, 부서를 선택할 수 없습니다.',
            }}
            onRow={(record) => ({
              onClick: () => setDetailRequestId(record.requestId),
              className: 'tw-cursor-pointer',
            })}
            columns={[
              {
                title: '작성일',
                dataIndex: 'createdAt',
                key: 'createdAt',
                width: 160,
                render: (v: string) => formatDateTime(v),
              },
              {
                title: '작성자',
                key: 'requester',
                width: 120,
                render: (_: unknown, r: (typeof displayRows)[number]) =>
                  r.requesterName?.trim() || r.memberId || '—',
              },
              {
                title: '작성자 소속',
                key: 'requesterOrg',
                ellipsis: true,
                render: (_: unknown, r: (typeof displayRows)[number]) =>
                  r.requesterOrganizationName?.trim() || '—',
              },
              {
                title: '양식명',
                dataIndex: 'documentName',
                key: 'documentName',
                ellipsis: true,
              },
              {
                title: '상태',
                dataIndex: 'requestStatus',
                key: 'requestStatus',
                width: 100,
                render: (v: string) => requestStatusTag(v),
              },
            ]}
          />
        </Space>
      </Card>

      <ApprovalRequestReadOnlyModal
        requestId={detailRequestId}
        onClose={() => setDetailRequestId(null)}
        title="부서 문서함 — 결재 상세"
      />
    </div>
  );
}
