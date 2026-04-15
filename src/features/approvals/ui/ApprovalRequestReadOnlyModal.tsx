import { useQueries, useQuery } from '@tanstack/react-query';
import {
  Alert,
  Card,
  Descriptions,
  Modal,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import dayjs from 'dayjs';
import { useMemo } from 'react';
import {
  APPROVAL_REQUEST_TYPES,
  approvalApi,
  type ApprovalRequestType,
} from '@/features/approvals/api/approvalApi';
import {
  approvalLineIsProxy,
  approvalRequestApi,
  type ApprovalLine,
  type ApprovalRequestStatus,
  type ApprovalViewer,
} from '@/features/approvals/api/approvalRequestApi';
import {
  formatStoredContentValue,
  parseDetailContentJson,
  parseFormSchema,
} from '@/features/approvals/lib/approvalFormSchema';
import {
  ApprovalFormPaperFieldRow,
  ApprovalFormPaperLayout,
  ApprovalFormStampColumn,
} from '@/features/approvals/ui/ApprovalFormPaperLayout';
import { memberApi } from '@/features/member/api/memberApi';

const REQUEST_TYPE_LABEL: Record<ApprovalRequestType, string> = {
  VACATION: '휴가',
  ATTENDANCE: '근태',
  HR_MOVEMENT: '부서이동',
  SALARY: '급여',
  GENERAL: '일반기안',
  CONTRACT: '전자계약',
  CERTIFICATE: '문서발급',
};

const REQUEST_STATUS_LABEL: Record<ApprovalRequestStatus, string> = {
  DRAFT: '임시저장',
  WAIT: '제출됨',
  PENDING: '결재 진행 중',
  APPROVED: '승인',
  REJECTED: '반려',
  CANCELED: '취소',
};

function normalizeApprovalRequestType(raw: string | undefined): ApprovalRequestType {
  const u = String(raw ?? '')
    .trim()
    .toUpperCase();
  if ((APPROVAL_REQUEST_TYPES as readonly string[]).includes(u)) return u as ApprovalRequestType;
  return 'GENERAL';
}

function formatDateTime(value?: string | null) {
  if (!value) return '—';
  const d = dayjs(value);
  return d.isValid() ? d.format('YYYY-MM-DD HH:mm') : value;
}

function statusTag(status: string) {
  const u = status.toUpperCase();
  if (u === 'APPROVED') return <Tag color="success">승인</Tag>;
  if (u === 'REJECTED') return <Tag color="error">반려</Tag>;
  if (u === 'CANCELED') return <Tag color="default">취소</Tag>;
  if (u === 'PENDING') return <Tag color="processing">결재중</Tag>;
  if (u === 'WAIT') return <Tag color="processing">제출됨</Tag>;
  return <Tag>{REQUEST_STATUS_LABEL[u as ApprovalRequestStatus] ?? status}</Tag>;
}

type DetailMemberLookupRow = {
  name: string;
  organizationName: string;
  jobTitleName: string;
  pending: boolean;
};

type PositionLookupRow = {
  memberName: string;
  organizationName: string;
  jobTitleName: string;
  pending: boolean;
};

/** UUID 맵 키가 하이픈·대소문자만 다를 때 매칭 */
function normalizeUuidMapKey(s: string): string {
  return s.replace(/-/g, '').trim().toLowerCase();
}

function lookupMemberInApprovalDetailMap(
  map: Map<string, DetailMemberLookupRow>,
  memberId?: string | null,
): DetailMemberLookupRow | undefined {
  const raw = memberId?.trim();
  if (!raw) return undefined;
  const direct = map.get(raw);
  if (direct) return direct;
  const target = normalizeUuidMapKey(raw);
  for (const [k, v] of map.entries()) {
    if (normalizeUuidMapKey(k) === target) return v;
  }
  return undefined;
}

function lookupPositionInMap(
  map: Map<string, PositionLookupRow>,
  memberPositionId?: string | null,
): PositionLookupRow | undefined {
  const raw = memberPositionId?.trim();
  if (!raw) return undefined;
  const direct = map.get(raw);
  if (direct) return direct;
  const target = normalizeUuidMapKey(raw);
  for (const [k, v] of map.entries()) {
    if (normalizeUuidMapKey(k) === target) return v;
  }
  return undefined;
}

/** 직위 API 우선, 없으면 member 상세·라인 스냅샷 (가이드 4-2) */
function resolveApproverLineDisplay(
  line: ApprovalLine,
  positionLookup: Map<string, PositionLookupRow>,
  memberLookup: Map<string, DetailMemberLookupRow>,
): { primary: string; title: string; org: string; pending: boolean } {
  const pos = lookupPositionInMap(positionLookup, line.approverMemberPositionId);
  const mem = lookupMemberInApprovalDetailMap(memberLookup, line.approverMemberId);
  const primary =
    (pos?.memberName || mem?.name || line.approverName || '').trim() || '';
  const title =
    (pos?.jobTitleName || mem?.jobTitleName || line.approverJobTitleName || '').trim() || '';
  const org =
    (pos?.organizationName || mem?.organizationName || line.approverOrganizationName || '').trim() ||
    '';
  const pending = Boolean(
    (pos?.pending && !primary) ||
      (mem?.pending && !primary && !(line.approverName || '').trim()),
  );
  return { primary, title, org, pending };
}

/** 대결 표시용 실제 처리자 이름 — `line.isProxy`(isProxyYn·actual* 불일치 등 정규화 결과)일 때만 조회 */
function resolveActualApproverDisplayName(
  line: ApprovalLine,
  positionLookup: Map<string, PositionLookupRow>,
  memberLookup: Map<string, DetailMemberLookupRow>,
): { name: string; pending: boolean } {
  if (!approvalLineIsProxy(line)) return { name: '', pending: false };
  const pos = lookupPositionInMap(positionLookup, line.actualApproverMemberPositionId);
  const mem = lookupMemberInApprovalDetailMap(memberLookup, line.actualApproverMemberId);
  const name =
    (pos?.memberName || mem?.name || line.actualApproverName || '').trim() || '';
  const pending = Boolean(
    (line.actualApproverMemberPositionId?.trim() && pos?.pending && !name) ||
      (line.actualApproverMemberId?.trim() && mem?.pending && !name && !(line.actualApproverName || '').trim()),
  );
  return { name, pending };
}

function DetailPersonCell({
  apiName,
  apiOrganizationName,
  apiJobTitleName,
  lookup,
}: {
  apiName?: string;
  apiOrganizationName?: string;
  apiJobTitleName?: string;
  lookup?: DetailMemberLookupRow;
}) {
  const name = (apiName?.trim() || lookup?.name || '').trim();
  const title = (apiJobTitleName?.trim() || lookup?.jobTitleName || '').trim();
  const org = (apiOrganizationName?.trim() || lookup?.organizationName || '').trim();
  if (lookup?.pending && !name) {
    return <Typography.Text type="secondary">이름 조회 중…</Typography.Text>;
  }
  const primary = name || '—';
  return (
    <div className="tw-min-w-0">
      <div className="tw-break-words">
        <span>{primary}</span>
        {title ? <span className="tw-text-slate-600"> ({title})</span> : null}
      </div>
      {org ? <div className="tw-text-xs tw-text-slate-500">{org}</div> : null}
    </div>
  );
}

export type ApprovalRequestReadOnlyModalProps = {
  requestId: string | null;
  onClose: () => void;
  title?: string;
};

export function ApprovalRequestReadOnlyModal({
  requestId,
  onClose,
  title = '결재 상세',
}: ApprovalRequestReadOnlyModalProps) {
  const open = requestId != null;

  const { data: selectedRequestDetail, isFetching: detailLoading } = useQuery({
    queryKey: ['approval-user', 'request-detail', requestId],
    queryFn: () => approvalRequestApi.getRequest(requestId!),
    enabled: open,
  });

  const { data: activeDocuments = [] } = useQuery({
    queryKey: ['approval', 'documents', 'active'],
    queryFn: () => approvalApi.listActiveDocuments(),
    enabled: open,
    staleTime: 60_000,
  });

  const detailMemberIds = useMemo(() => {
    if (!open || !selectedRequestDetail) return [] as string[];
    const ids = new Set<string>();
    for (const l of selectedRequestDetail.approvalLines) {
      const id = l.approverMemberId?.trim();
      if (id) ids.add(id);
      const aid = l.actualApproverMemberId?.trim();
      if (aid) ids.add(aid);
    }
    for (const v of selectedRequestDetail.viewers ?? []) {
      const id = v.viewerMemberId?.trim();
      if (id) ids.add(id);
    }
    return [...ids];
  }, [open, selectedRequestDetail]);

  const approvalDetailMemberQueries = useQueries({
    queries: detailMemberIds.map((memberId) => ({
      queryKey: ['member', 'detail', memberId],
      queryFn: () => memberApi.detail(memberId),
      enabled: open && Boolean(memberId),
      staleTime: 5 * 60_000,
    })),
  });

  const approvalDetailMemberLookup = useMemo(() => {
    const map = new Map<string, DetailMemberLookupRow>();
    detailMemberIds.forEach((id, i) => {
      const q = approvalDetailMemberQueries[i];
      map.set(id, {
        name: q?.data?.name?.trim() ?? '',
        organizationName: q?.data?.organizationName?.trim() ?? '',
        jobTitleName: q?.data?.jobTitleName?.trim() ?? '',
        pending: Boolean(q && (q.isPending || q.isFetching) && !q.data),
      });
    });
    return map;
  }, [detailMemberIds, approvalDetailMemberQueries]);

  const detailPositionIds = useMemo(() => {
    if (!open || !selectedRequestDetail) return [] as string[];
    const set = new Set<string>();
    for (const l of selectedRequestDetail.approvalLines) {
      const p = l.approverMemberPositionId?.trim();
      if (p) set.add(p);
      const ap = l.actualApproverMemberPositionId?.trim();
      if (ap) set.add(ap);
    }
    return [...set];
  }, [open, selectedRequestDetail]);

  const approvalPositionInternalQueries = useQueries({
    queries: detailPositionIds.map((memberPositionId) => ({
      queryKey: ['member', 'position-internal', memberPositionId],
      queryFn: () => memberApi.positionInternalOrNull(memberPositionId),
      enabled: open && Boolean(memberPositionId),
      staleTime: 5 * 60_000,
    })),
  });

  const approvalPositionLookup = useMemo(() => {
    const map = new Map<string, PositionLookupRow>();
    detailPositionIds.forEach((pid, i) => {
      const q = approvalPositionInternalQueries[i];
      const d = q?.data;
      map.set(pid, {
        memberName: d?.memberName?.trim() ?? '',
        organizationName: d?.organizationName?.trim() ?? '',
        jobTitleName: d?.jobTitleName?.trim() ?? '',
        pending: Boolean(
          q && (q.isPending || q.isFetching) && d == null && !q.isError,
        ),
      });
    });
    return map;
  }, [detailPositionIds, approvalPositionInternalQueries]);

  const { data: requestDetailDrafter } = useQuery({
    queryKey: ['member', 'detail', 'approval-detail-drafter', selectedRequestDetail?.memberId],
    queryFn: () => memberApi.detail(selectedRequestDetail!.memberId),
    enabled: open && Boolean(selectedRequestDetail?.memberId?.trim()),
    staleTime: 60_000,
  });

  const requestDetailDocument = useMemo(
    () =>
      selectedRequestDetail
        ? activeDocuments.find((d) => d.documentId === selectedRequestDetail.documentId) ?? null
        : null,
    [activeDocuments, selectedRequestDetail],
  );

  const requestDetailSchema = useMemo(
    () => (requestDetailDocument ? parseFormSchema(requestDetailDocument.formSchema) : { fields: [] }),
    [requestDetailDocument],
  );

  return (
    <Modal
      title={title}
      open={open}
      onCancel={onClose}
      footer={null}
      width={920}
      styles={{ body: { maxHeight: 'min(85vh, 900px)', overflowY: 'auto' } }}
      destroyOnHidden
    >
      {detailLoading || !selectedRequestDetail ? (
        <Typography.Text type="secondary">불러오는 중...</Typography.Text>
      ) : (
        <Space direction="vertical" size={12} className="tw-w-full">
          <Descriptions size="small" bordered column={2}>
            <Descriptions.Item label="양식">{selectedRequestDetail.documentName}</Descriptions.Item>
            <Descriptions.Item label="상태">{statusTag(selectedRequestDetail.requestStatus)}</Descriptions.Item>
            <Descriptions.Item label="요청일">{formatDateTime(selectedRequestDetail.createdAt)}</Descriptions.Item>
            <Descriptions.Item label="수정일">{formatDateTime(selectedRequestDetail.updatedAt)}</Descriptions.Item>
          </Descriptions>
          <Card size="small" title="내용">
            {requestDetailDocument && requestDetailSchema.fields.length > 0 ? (
              <div className="tw-max-h-[min(70vh,720px)] tw-overflow-auto">
                {(() => {
                  const detail = selectedRequestDetail;
                  const doc = requestDetailDocument;
                  const content = parseDetailContentJson(detail);
                  const dName = requestDetailDrafter?.name?.trim() || '—';
                  const dOrg = requestDetailDrafter?.organizationName?.trim() || '—';
                  const dTitle = requestDetailDrafter?.jobTitleName?.trim();
                  const lines = [...detail.approvalLines].sort((a, b) => a.stepOrder - b.stepOrder);
                  const approvers = lines.map((l) => {
                    const disp = resolveApproverLineDisplay(l, approvalPositionLookup, approvalDetailMemberLookup);
                    const actual = resolveActualApproverDisplayName(l, approvalPositionLookup, approvalDetailMemberLookup);
                    const proxyUi = approvalLineIsProxy(l);
                    const proxyActorName = proxyUi ? actual.name.trim() || undefined : undefined;
                    return {
                      id: l.approvalId,
                      memberName: disp.primary.trim() || '—',
                      jobTitleName: disp.title,
                      isProxy: proxyUi,
                      proxyActorName,
                      actedAt: l.actedAt,
                      approvalStatus: l.approvalStatus,
                    };
                  });
                  return (
                    <ApprovalFormPaperLayout
                      documentName={doc.documentName}
                      categoryLabel={
                        REQUEST_TYPE_LABEL[normalizeApprovalRequestType(doc.requestType)] ?? String(doc.requestType)
                      }
                      requestTypeCode={normalizeApprovalRequestType(doc.requestType)}
                      autoApproveYn={doc.autoApproveYn === 'Y' ? 'Y' : 'N'}
                      drafterName={dName}
                      drafterOrg={dOrg}
                      drafterJobTitle={dTitle}
                      writtenDate={dayjs(detail.createdAt).format('YYYY-MM-DD')}
                      stampColumn={
                        doc.autoApproveYn !== 'Y' ? (
                          <ApprovalFormStampColumn
                            drafterName={dName}
                            drafterJobTitle={dTitle}
                            approvers={approvers}
                            applicationWrittenDateIso={dayjs(detail.createdAt).format('YYYY-MM-DD')}
                          />
                        ) : undefined
                      }
                    >
                      {requestDetailSchema.fields.map((field) => {
                        const text = formatStoredContentValue(content[field.name]);
                        return (
                          <ApprovalFormPaperFieldRow key={field.name} label={field.label} required>
                            <Typography.Text
                              className={
                                field.type === 'textarea' ? 'tw-whitespace-pre-wrap tw-break-words' : undefined
                              }
                            >
                              {text}
                            </Typography.Text>
                          </ApprovalFormPaperFieldRow>
                        );
                      })}
                    </ApprovalFormPaperLayout>
                  );
                })()}
              </div>
            ) : (
              <>
                <Alert
                  type="warning"
                  showIcon
                  className="tw-mb-2"
                  message="활성 양식 목록에서 해당 양식을 찾지 못했거나 필드 정의가 없어, 저장된 JSON으로 표시합니다."
                />
                <pre className="tw-m-0 tw-whitespace-pre-wrap tw-break-words">
                  {selectedRequestDetail.contentJson || '{}'}
                </pre>
              </>
            )}
          </Card>
          <Card size="small" title="결재라인">
            <Table
              size="small"
              rowKey="approvalId"
              pagination={false}
              dataSource={[...selectedRequestDetail.approvalLines].sort((a, b) => a.stepOrder - b.stepOrder)}
              columns={[
                { title: '순서', dataIndex: 'stepOrder', key: 'stepOrder', width: 56 },
                {
                  title: '결재자',
                  key: 'approver',
                  width: 280,
                  render: (_: unknown, line: ApprovalLine) => {
                    const disp = resolveApproverLineDisplay(line, approvalPositionLookup, approvalDetailMemberLookup);
                    const actual = resolveActualApproverDisplayName(line, approvalPositionLookup, approvalDetailMemberLookup);
                    const lineSt = String(line.approvalStatus).toUpperCase();
                    const hasProcessDate =
                      Boolean(line.actedAt?.trim()) &&
                      (lineSt === 'APPROVED' || lineSt === 'REJECTED');
                    const showProxyWithDate = approvalLineIsProxy(line) && hasProcessDate;
                    if (disp.pending && !disp.primary) {
                      return <Typography.Text type="secondary">이름 조회 중…</Typography.Text>;
                    }
                    return (
                      <div className="tw-min-w-0">
                        <div className="tw-break-words">
                          <span className="tw-font-medium tw-text-black">{disp.primary || '—'}</span>
                          {disp.title ? (
                            <span className="tw-text-slate-600">{' (' + disp.title + ')'}</span>
                          ) : null}
                          {showProxyWithDate ? (
                            <span className="tw-text-black">
                              {actual.name.trim()
                                ? ' (대결: ' + actual.name.trim() + ')'
                                : actual.pending
                                  ? ' (대결: …)'
                                  : ' (대결)'}
                            </span>
                          ) : null}
                        </div>
                        {disp.org ? <div className="tw-text-xs tw-text-slate-500">{disp.org}</div> : null}
                      </div>
                    );
                  },
                },
                {
                  title: '상태',
                  dataIndex: 'approvalStatus',
                  key: 'approvalStatus',
                  width: 160,
                  render: (v: string, line: ApprovalLine) => {
                    const lineSt = String(line.approvalStatus).toUpperCase();
                    const hasProcessDate =
                      Boolean(line.actedAt?.trim()) &&
                      (lineSt === 'APPROVED' || lineSt === 'REJECTED');
                    const statusColor =
                      lineSt === 'APPROVED' ? 'success' : lineSt === 'REJECTED' ? 'error' : 'default';
                    return (
                      <Space size={4} wrap>
                        <Tag color={statusColor}>{v}</Tag>
                      </Space>
                    );
                  },
                },
                {
                  title: '의견',
                  dataIndex: 'comment',
                  key: 'comment',
                  render: (v: string | null) => v || '—',
                },
                {
                  title: '처리일',
                  dataIndex: 'actedAt',
                  key: 'actedAt',
                  width: 180,
                  render: (v: string | null) => formatDateTime(v),
                },
              ]}
            />
          </Card>
          <Card size="small" title="참조·공람">
            <Table
              size="small"
              rowKey="viewerId"
              pagination={false}
              dataSource={selectedRequestDetail.viewers ?? []}
              locale={{ emptyText: '지정된 참조·공람자가 없습니다.' }}
              columns={[
                {
                  title: '구분',
                  dataIndex: 'viewerType',
                  key: 'viewerType',
                  width: 100,
                  render: (t: string) =>
                    String(t).toUpperCase() === 'CC' ? <Tag>참조</Tag> : <Tag color="blue">공람</Tag>,
                },
                {
                  title: '이름',
                  key: 'viewerDisplay',
                  width: 260,
                  render: (_: unknown, row: ApprovalViewer) => (
                    <DetailPersonCell
                      apiName={row.viewerName}
                      apiOrganizationName={row.viewerOrganizationName}
                      apiJobTitleName={row.viewerJobTitleName}
                      lookup={lookupMemberInApprovalDetailMap(approvalDetailMemberLookup, row.viewerMemberId)}
                    />
                  ),
                },
                {
                  title: '열람 상태',
                  dataIndex: 'viewerReadStatus',
                  key: 'viewerReadStatus',
                  width: 100,
                  render: (v: string) => <Tag>{String(v).toUpperCase() === 'READ' ? '확인' : '미확인'}</Tag>,
                },
                {
                  title: '열람일',
                  dataIndex: 'viewedAt',
                  key: 'viewedAt',
                  width: 180,
                  render: (v: string | null) => formatDateTime(v),
                },
              ]}
            />
          </Card>
        </Space>
      )}
    </Modal>
  );
}
