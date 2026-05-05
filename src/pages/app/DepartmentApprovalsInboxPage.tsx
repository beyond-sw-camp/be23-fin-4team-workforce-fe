import { ArrowLeftOutlined, SearchOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Alert, App, Button, Card, Table, Tag, Typography } from 'antd';
import clsx from 'clsx';
import dayjs from 'dayjs';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useRouterState } from '@tanstack/react-router';
import {
  approvalRequestApi,
  isDepartmentInboxMaskedPrivateRow,
} from '@/features/approvals/api/approvalRequestApi';
import { getApprovalRequestSubjectLine } from '@/features/approvals/lib/approvalFormSchema';
import { ApprovalRequestReadOnlyModal } from '@/features/approvals/ui/ApprovalRequestReadOnlyModal';
import { useAuth } from '@/features/auth/useAuth';
import { memberApi } from '@/features/member/api/memberApi';
import { organizationApi } from '@/features/organization/api/organizationApi';
import { findMemberOrganizationId } from '@/features/organization/lib/findMemberOrganizationInOrgChart';

function formatDateTime(value?: string | null) {
  if (!value) return '—';
  const d = dayjs(value);
  return d.isValid() ? d.format('YYYY-MM-DD HH:mm') : value;
}

function formatOfficialRecipientsLine(r: {
  recipients?: { recipientOrganizationName?: string; recipientOrganizationId?: string }[] | null;
}): string {
  const list = r.recipients ?? [];
  if (!list.length) return '—';
  return list
    .map((x) => x.recipientOrganizationName?.trim() || x.recipientOrganizationId || '')
    .filter(Boolean)
    .join(', ');
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

type DeptView = 'draft' | 'sent' | 'received';

function parseDeptView(v: unknown): DeptView {
  if (v === 'received') return 'received';
  if (v === 'sent') return 'sent';
  return 'draft';
}

export function DepartmentApprovalsInboxPage() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const routeLocation = useRouterState({
    select: (s) => ({
      pathname: s.location.pathname,
      search: s.location.search as { organizationId?: string; deptView?: string; embed?: string },
    }),
  });
  const routeSearch = routeLocation.search;
  /** 모달 iframe(`embed=compose-modal`)에서 부서 이동 시에도 앱 셸 없음 유지 */
  const preserveEmbedSearch = useMemo(
    () => (routeSearch.embed ? { embed: routeSearch.embed } : {}),
    [routeSearch.embed],
  );
  const onDepartmentRoute = routeLocation.pathname === '/app/approvals/department';
  const routerDeptView = parseDeptView(routeSearch.deptView);
  /** 모달 iframe에서는 탭 전환 시 URL을 바꾸지 않고 로컬 상태만 사용 */
  const [embedDeptView, setEmbedDeptView] = useState<DeptView | null>(null);
  const isEmbedModal = routeSearch.embed === 'compose-modal';
  const deptView = isEmbedModal ? (embedDeptView ?? routerDeptView) : routerDeptView;
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

  useEffect(() => {
    if (!onDepartmentRoute || isEmbedModal) return;
    if (!myOrgId || urlOrgId) return;
    navigate({
      to: '/app/approvals/department',
      search: { organizationId: myOrgId, deptView: routerDeptView, ...preserveEmbedSearch },
      replace: true,
    });
  }, [isEmbedModal, myOrgId, navigate, onDepartmentRoute, preserveEmbedSearch, routerDeptView, urlOrgId]);

  const [detailRequestId, setDetailRequestId] = useState<string | null>(null);

  const deptListEnabled = Boolean(myOrgId) && (deptView === 'draft' || deptView === 'sent');

  const {
    data: rows = [],
    isFetching,
    error,
    refetch,
  } = useQuery({
    queryKey: ['approval-user', 'department-requests', myOrgId],
    queryFn: () => approvalRequestApi.listDepartmentRequests(myOrgId!),
    enabled: deptListEnabled,
    retry: (_, err) => !isHttpStatus(err, 403),
  });
  const {
    data: officialReceivedRows = [],
    isFetching: officialReceivedLoading,
    error: officialReceivedError,
    refetch: refetchOfficialReceived,
  } = useQuery({
    queryKey: ['approval-user', 'official-received'],
    queryFn: () => approvalRequestApi.listOfficialReceivedRequests(),
    enabled: deptView === 'received',
  });

  const officialSentRows = useMemo(() => {
    return rows.filter((r) => {
      const hasRecipients = Array.isArray(r.recipients) && r.recipients.length > 0;
      return hasRecipients || Boolean(r.documentNumber?.trim());
    });
  }, [rows]);

  const displayRows = useMemo(() => {
    if (deptView === 'received') return officialReceivedRows;
    if (deptView === 'sent') return officialSentRows;
    return rows;
  }, [deptView, officialReceivedRows, officialSentRows, rows]);
  const pageError = deptView === 'received' ? officialReceivedError : error;
  const pageLoading = deptView === 'received' ? officialReceivedLoading : deptListEnabled ? isFetching : false;

  const navigateDeptView = useCallback(
    (next: DeptView) => {
      if (isEmbedModal) {
        setEmbedDeptView(next);
        return;
      }
      navigate({
        to: '/app/approvals/department',
        search: {
          organizationId: myOrgId ?? undefined,
          deptView: next,
          ...preserveEmbedSearch,
        },
        replace: true,
      });
    },
    [isEmbedModal, navigate, preserveEmbedSearch, myOrgId],
  );

  return (
    <div
      className={clsx(
        isEmbedModal
          ? 'tw-flex tw-h-full tw-min-h-0 tw-w-full tw-flex-col tw-gap-4 tw-overflow-hidden'
          : 'tw-mx-auto tw-max-w-6xl tw-space-y-4',
      )}
    >
      {isEmbedModal ? null : (
        <div className="tw-flex tw-flex-shrink-0 tw-flex-wrap tw-items-start tw-gap-3">
          <div>
            <div className="tw-flex tw-flex-nowrap tw-items-center tw-gap-2">
              <Button
                type="text"
                icon={<ArrowLeftOutlined />}
                aria-label="전자결재로 돌아가기"
                className="!tw-shrink-0 !tw-text-slate-600 hover:!tw-text-slate-900"
                onClick={() =>
                  navigate({
                    to: '/app/approvals',
                    search: {},
                    replace: true,
                  })
                }
              />
              <Typography.Title level={4} className="!tw-m-0 tw-whitespace-nowrap tw-leading-none">
                부서 문서함
              </Typography.Title>
              <Button
                type="default"
                size="small"
                icon={<SearchOutlined />}
                className="tw-shrink-0"
                onClick={() =>
                  navigate({
                    to: '/app/approvals/department-search',
                    search: myOrgId ? { organizationId: myOrgId } : {},
                  })
                }
              >
                부서 문서 검색
              </Button>
            </div>
            <Typography.Paragraph type="secondary" className="!tw-mb-0 tw-text-sm">
              {deptView === 'received'
                ? '내 조직이 수신부서로 지정된 최종 승인 공문을 조회합니다.'
                : deptView === 'sent'
                  ? '내 조직에서 발송한 공문 문서를 조회합니다.'
                  : '본인 소속 부서에서 열람 가능한 결재 문서를 조회합니다. 비공개로 상신한 문서는 부서원에게 제목·내용이 가려질 수 있습니다.'}
            </Typography.Paragraph>
          </div>
        </div>
      )}

      <Card
        size="small"
        className={clsx(
          'tw-overflow-hidden tw-rounded-lg tw-border-slate-200/80 tw-shadow-sm',
          isEmbedModal && 'tw-flex tw-min-h-0 tw-flex-1 tw-flex-col',
        )}
        styles={
          isEmbedModal
            ? { body: { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', padding: 16 } }
            : undefined
        }
      >
        <div
          className={clsx(
            'tw-flex tw-w-full tw-flex-col tw-gap-4',
            isEmbedModal && 'tw-min-h-0 tw-flex-1',
          )}
        >
          <div
            role="tablist"
            aria-label="부서 문서함 구분"
            className="tw-flex tw-gap-8"
          >
            {(
              [
                { key: 'draft' as const, label: '기안 완료함' },
                { key: 'sent' as const, label: '공문 발송함' },
                { key: 'received' as const, label: '공문 수신함' },
              ] as const
            ).map(({ key, label }) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={deptView === key}
                className={clsx(
                  '-tw-mb-px tw-border-0 tw-bg-transparent tw-px-0 tw-pb-2 tw-text-sm tw-font-medium tw-outline-none tw-transition-colors',
                  'focus-visible:tw-ring-2 focus-visible:tw-ring-blue-500 focus-visible:tw-ring-offset-2',
                  deptView === key
                    ? 'tw-border-b-2 tw-border-solid tw-border-blue-600 tw-text-blue-600'
                    : 'tw-border-b-2 tw-border-transparent tw-text-slate-600 hover:tw-text-slate-900',
                )}
                onClick={() => navigateDeptView(key)}
              >
                {label}
              </button>
            ))}
          </div>

          {deptView === 'received' ? (
            <Alert
              type="info"
              showIcon
              className="tw-text-sm"
              message="최종 승인된 공문만 표시됩니다."
            />
          ) : null}

          {pageError ? (
            <Alert
              type={isHttpStatus(pageError, 403) ? 'error' : 'warning'}
              showIcon
              message={
                isHttpStatus(pageError, 403)
                  ? '선택한 조직에 대한 조회 권한이 없습니다. URL의 organizationId가 본인 소속 부서와 일치하는지 확인하세요.'
                  : (pageError as Error)?.message || '목록을 불러오지 못했습니다.'
              }
              action={
                <Typography.Link
                  onClick={() => void (deptView === 'received' ? refetchOfficialReceived() : refetch())}
                  className="tw-text-sm"
                >
                  다시 시도
                </Typography.Link>
              }
            />
          ) : null}

          <div className={clsx(isEmbedModal && 'tw-min-h-0 tw-flex-1 tw-overflow-auto')}>
          <Table
            size="small"
            rowKey="requestId"
            loading={pageLoading}
            dataSource={displayRows}
            pagination={{ pageSize: 15, showSizeChanger: true }}
            locale={{
              emptyText: myOrgId
                ? '표시할 문서가 없습니다.'
                : '소속 부서 정보를 불러오는 중이거나, 부서를 확인할 수 없습니다.',
            }}
            rowClassName={(record) =>
              deptView !== 'received' && isDepartmentInboxMaskedPrivateRow(record)
                ? 'tw-bg-slate-100/80 tw-text-slate-500'
                : ''
            }
            onRow={(record) => {
              const masked = deptView !== 'received' && isDepartmentInboxMaskedPrivateRow(record);
              return {
                onClick: () => {
                  if (masked) {
                    message.warning('비공개로 설정된 문서는 내용을 열람할 수 없습니다.');
                    return;
                  }
                  setDetailRequestId(record.requestId);
                },
                className: masked ? 'tw-cursor-not-allowed' : 'tw-cursor-pointer',
              };
            }}
            columns={
              deptView === 'received'
                ? [
                    {
                      title: '제목',
                      key: 'subject',
                      ellipsis: true,
                      render: (_: unknown, r: (typeof displayRows)[number]) =>
                        getApprovalRequestSubjectLine(r) || '—',
                    },
                    {
                      title: '양식',
                      dataIndex: 'documentName',
                      key: 'documentName',
                      ellipsis: true,
                    },
                    {
                      title: '기안자',
                      key: 'requester',
                      width: 180,
                      render: (_: unknown, r: (typeof displayRows)[number]) =>
                        `${r.requesterName?.trim() || r.memberId || '—'} (${r.requesterOrganizationName?.trim() || '—'})`,
                    },
                    {
                      title: '상태',
                      dataIndex: 'requestStatus',
                      key: 'requestStatus',
                      width: 100,
                      render: (v: string) => requestStatusTag(v),
                    },
                    {
                      title: '작성일',
                      dataIndex: 'createdAt',
                      key: 'createdAt',
                      width: 160,
                      render: (v: string) => formatDateTime(v),
                    },
                  ]
                : deptView === 'sent'
                  ? [
                      {
                        title: '제목',
                        key: 'subject',
                        ellipsis: true,
                        render: (_: unknown, r: (typeof displayRows)[number]) =>
                          getApprovalRequestSubjectLine(r) || '—',
                      },
                      {
                        title: '양식',
                        dataIndex: 'documentName',
                        key: 'documentName',
                        ellipsis: true,
                      },
                      {
                        title: '기안자',
                        key: 'requester',
                        width: 180,
                        render: (_: unknown, r: (typeof displayRows)[number]) =>
                          `${r.requesterName?.trim() || r.memberId || '—'} (${r.requesterOrganizationName?.trim() || '—'})`,
                      },
                      {
                        title: '상태',
                        dataIndex: 'requestStatus',
                        key: 'requestStatus',
                        width: 100,
                        render: (v: string) => requestStatusTag(v),
                      },
                      {
                        title: '작성일',
                        dataIndex: 'createdAt',
                        key: 'createdAt',
                        width: 160,
                        render: (v: string) => formatDateTime(v),
                      },
                    ]
                : [
                    {
                      title: '제목',
                      key: 'subject',
                      ellipsis: true,
                      render: (_: unknown, r: (typeof displayRows)[number]) =>
                        getApprovalRequestSubjectLine(r) || '—',
                    },
                    {
                      title: '양식',
                      dataIndex: 'documentName',
                      key: 'documentName',
                      ellipsis: true,
                    },
                    {
                      title: '기안자',
                      key: 'requester',
                      width: 180,
                      render: (_: unknown, r: (typeof displayRows)[number]) =>
                        `${r.requesterName?.trim() || r.memberId || '—'} (${r.requesterOrganizationName?.trim() || '—'})`,
                    },
                    {
                      title: '상태',
                      dataIndex: 'requestStatus',
                      key: 'requestStatus',
                      width: 100,
                      render: (v: string) => requestStatusTag(v),
                    },
                    {
                      title: '작성일',
                      dataIndex: 'createdAt',
                      key: 'createdAt',
                      width: 160,
                      render: (v: string) => formatDateTime(v),
                    },
                  ]
            }
          />
          </div>
        </div>
      </Card>

      <ApprovalRequestReadOnlyModal
        requestId={detailRequestId}
        onClose={() => setDetailRequestId(null)}
        title="부서 문서함 — 결재 상세"
      />
    </div>
  );
}
