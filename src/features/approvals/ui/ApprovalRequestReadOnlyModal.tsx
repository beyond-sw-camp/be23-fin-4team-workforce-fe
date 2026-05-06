import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { DownloadOutlined, SendOutlined } from '@ant-design/icons';
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Input,
  message,
  Modal,
  Popconfirm,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useEffect, useMemo, useState } from 'react';
import { approvalApi, normalizeApprovalRequestType } from '@/features/approvals/api/approvalApi';
import { approvalRequestTypeLabelKo } from '@/features/approvals/lib/approvalRequestTypeKo';
import {
  approvalLineIsProxy,
  approvalRequestApi,
  canSendOfficialDocument,
  findMyInboxApprovalLine,
  isInlineSyntheticApprovalId,
  requestIncludesMyProxyAct,
  type ApprovalLine,
  type ApprovalRequestStatus,
  type ApprovalViewer,
} from '@/features/approvals/api/approvalRequestApi';
import {
  approvalAttachmentsApi,
  formatApprovalAttachmentBytes,
  type ApprovalAttachment,
} from '@/features/approvals/api/approvalAttachmentsApi';
import { syncApprovalQueryCachesAfterAct } from '@/features/approvals/lib/syncApprovalQueryCaches';
import { AppDoubleActionModal } from '@/shared/ui/AppDoubleActionModal';
import { AppSingleActionModal } from '@/shared/ui/AppSingleActionModal';
import { useAuth } from '@/features/auth/useAuth';
import { getRefreshIdentityHeaders } from '@/shared/stores/authRefreshIdentityStore';
import {
  formatStoredContentValue,
  parseDetailContentJson,
  parseFormSchema,
  shouldHideApprovalFormFieldInSelectModalPreview,
} from '@/features/approvals/lib/approvalFormSchema';

import {
  ApprovalFormPaperFieldRow,
  ApprovalFormPaperLayout,
  ApprovalFormPaperStaticNoteRow,
  ApprovalFormStampColumn,
} from '@/features/approvals/ui/ApprovalFormPaperLayout';
import { memberApi } from '@/features/member/api/memberApi';
import { attendanceApi } from '@/features/salary-service/api/attendanceApi';
import { salaryApi } from '@/features/salary-service/api/salaryApi';

const REQUEST_STATUS_LABEL: Record<ApprovalRequestStatus, string> = {
  DRAFT: '임시저장',
  WAIT: '제출됨',
  PENDING: '결재 진행 중',
  APPROVED: '승인',
  REJECTED: '반려',
  CANCELED: '취소',
};

function formatDateTime(value?: string | null) {
  if (!value) return '—';
  const d = dayjs(value);
  return d.isValid() ? d.format('YYYY-MM-DD HH:mm') : value;
}

function displayStoredFieldValue(
  field: { source?: string; type?: string; options?: string[] },
  raw: unknown,
  lookup: {
    companyLeaveTypeNameById: Map<string, string>;
    salaryItemTemplateNameById: Map<string, string>;
    flexibleSlotNameById: Map<string, string>;
  },
): string {
  if (raw == null) return formatStoredContentValue(raw);
  const rawText = typeof raw === 'string' ? raw.trim() : '';
  if (!rawText) return formatStoredContentValue(raw);
  if (field.source === 'companyLeaveType') {
    return lookup.companyLeaveTypeNameById.get(rawText) ?? rawText;
  }
  if (field.source === 'salaryItemTemplate') {
    return lookup.salaryItemTemplateNameById.get(rawText) ?? rawText;
  }
  if (field.source === 'flexibleTimeSlot') {
    return lookup.flexibleSlotNameById.get(rawText) ?? rawText;
  }
  if (field.type === 'select' && Array.isArray(field.options) && field.options.length > 0) {
    return field.options.includes(rawText) ? rawText : rawText;
  }
  return formatStoredContentValue(raw);
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

function detailMemberLookupFromStrings(
  name?: string,
  organizationName?: string,
  jobTitleName?: string,
): DetailMemberLookupRow {
  return {
    name: (name ?? '').trim(),
    organizationName: (organizationName ?? '').trim(),
    jobTitleName: (jobTitleName ?? '').trim(),
    pending: false,
  };
}

function mergeDetailMemberRows(a: DetailMemberLookupRow, b: DetailMemberLookupRow): DetailMemberLookupRow {
  return {
    name: a.name || b.name,
    organizationName: a.organizationName || b.organizationName,
    jobTitleName: a.jobTitleName || b.jobTitleName,
    pending: false,
  };
}

function snapshotHasMemberLabel(row: DetailMemberLookupRow | undefined): boolean {
  return Boolean(row?.name || row?.organizationName || row?.jobTitleName);
}

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
  const qc = useQueryClient();
  const { user } = useAuth();
  const authMemberId =
    user?.id?.trim() || getRefreshIdentityHeaders()['X-User-UUID']?.trim() || '';

  const { data: selectedRequestDetail, isFetching: detailLoading } = useQuery({
    queryKey: ['approval-user', 'request-detail', requestId],
    queryFn: () => approvalRequestApi.getRequest(requestId!),
    enabled: open,
  });

  const { data: attachments = [], isFetching: attachmentsLoading } = useQuery({
    queryKey: ['approval', 'attachments', requestId],
    queryFn: () => approvalAttachmentsApi.listAttachments(requestId!),
    enabled: open && Boolean(requestId),
    staleTime: 30_000,
  });

  const deleteAttachmentM = useMutation({
    mutationFn: (attachmentId: string) => approvalAttachmentsApi.deleteAttachment(attachmentId),
    onSuccess: async () => {
      message.success('첨부를 삭제했습니다.');
      await qc.invalidateQueries({ queryKey: ['approval', 'attachments', requestId] });
    },
    onError: (e: Error) => message.error(e.message || '첨부 삭제에 실패했습니다.'),
  });

  const sendOfficialM = useMutation({
    mutationFn: () => approvalRequestApi.sendOfficial(requestId!),
    onSuccess: async (detail) => {
      message.success('공문이 발송되었습니다.');
      qc.setQueryData(['approval-user', 'request-detail', requestId], detail);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['approval-user', 'my-requests'] }),
        qc.invalidateQueries({ queryKey: ['approval-user', 'official-received'] }),
      ]);
    },
    onError: (e: unknown) => {
      const msg =
        e && typeof e === 'object' && 'message' in e && typeof (e as { message: unknown }).message === 'string'
          ? (e as { message: string }).message
          : '공문 발송에 실패했습니다.';
      message.error(msg);
    },
  });

  const [officialCancelOpen, setOfficialCancelOpen] = useState(false);
  const [officialCancelReason, setOfficialCancelReason] = useState('');

  const cancelOfficialBeforeSendM = useMutation({
    mutationFn: (reason: string) => approvalRequestApi.cancelRequest(requestId!, reason),
    onSuccess: async (detail) => {
      message.success('공문 발송이 취소되었습니다.');
      qc.setQueryData(['approval-user', 'request-detail', requestId], detail);
      setOfficialCancelOpen(false);
      setOfficialCancelReason('');
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['approval-user', 'my-requests'] }),
        qc.invalidateQueries({ queryKey: ['approval-user', 'official-received'] }),
      ]);
    },
    onError: (e: unknown) => {
      const msg =
        e && typeof e === 'object' && 'message' in e && typeof (e as { message: unknown }).message === 'string'
          ? (e as { message: string }).message
          : '취소 처리에 실패했습니다.';
      message.error(msg);
    },
  });

  // 일반 결재 취소 (DRAFT/WAIT/PENDING 상태에서 기안자가 직접 취소)
  // 공문 발송 취소는 별도 흐름이라 분리. 두 mutation 다 같은 API 호출하지만 UX 메시지/대상 상태 다름
  const [requestCancelOpen, setRequestCancelOpen] = useState(false);
  const [requestCancelReason, setRequestCancelReason] = useState('');
  const [approvalAction, setApprovalAction] = useState<{ approvalId: string; mode: 'approve' | 'reject' } | null>(null);
  const [approvalComment, setApprovalComment] = useState('');

  const approvalPdfDownloadM = useMutation({
    mutationFn: () => approvalRequestApi.downloadRequestPdf(requestId!),
    onSuccess: ({ blob, filename }) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      message.success('PDF를 저장했습니다.');
    },
    onError: async (err: unknown) => {
      let detail = '';
      const e = err as { response?: { data?: unknown } };
      const data = e?.response?.data;
      if (data instanceof Blob) {
        try {
          const text = await data.text();
          try {
            const json = JSON.parse(text) as { message?: string; error?: string };
            detail = json?.message || json?.error || text;
          } catch {
            detail = text;
          }
        } catch {
          /* noop */
        }
      } else if (typeof data === 'object' && data !== null) {
        detail = (data as { message?: string }).message || '';
      }
      message.error(detail ? `결재 PDF 다운로드 실패: ${detail}` : '결재 PDF 다운로드에 실패했습니다.');
    },
  });

  const cancelRequestM = useMutation({
    mutationFn: (reason: string) => approvalRequestApi.cancelRequest(requestId!, reason),
    onSuccess: async (detail) => {
      message.success('결재 요청을 취소했습니다.');
      qc.setQueryData(['approval-user', 'request-detail', requestId], detail);
      setRequestCancelOpen(false);
      setRequestCancelReason('');
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['approval-user', 'my-requests'] }),
        qc.invalidateQueries({ queryKey: ['approval-user', 'received-requests'] }),
        qc.invalidateQueries({ queryKey: ['approval-search'] }),
      ]);
      onClose();
    },
    onError: (e: unknown) => {
      const msg =
        e && typeof e === 'object' && 'message' in e && typeof (e as { message: unknown }).message === 'string'
          ? (e as { message: string }).message
          : '취소 처리에 실패했습니다.';
      message.error(msg);
    },
  });

  const myMemberPositionId = getRefreshIdentityHeaders()['X-User-MemberPositionId']?.trim();

  const myActionableApprovalLine = useMemo(() => {
    if (!selectedRequestDetail) return undefined;
    const rs = String(selectedRequestDetail.requestStatus).toUpperCase();
    /** 서버가 제출 직후·첫 결재 대기를 WAIT로 두는 경우가 있어 PENDING과 동일하게 처리 */
    if (rs !== 'PENDING' && rs !== 'WAIT') return undefined;
    const line = findMyInboxApprovalLine(selectedRequestDetail, {
      myMemberId: authMemberId,
      myMemberPositionId,
    });
    if (!line || String(line.approvalStatus).toUpperCase() !== 'PENDING') return undefined;
    if (isInlineSyntheticApprovalId(line.approvalId)) return undefined;
    return line;
  }, [selectedRequestDetail, authMemberId, myMemberPositionId]);

  const canActApproveReject = Boolean(myActionableApprovalLine);

  const approveM = useMutation({
    mutationFn: ({ approvalId, comment }: { approvalId: string; comment?: string }) =>
      approvalRequestApi.approve(approvalId, comment),
    onSuccess: async (detail) => {
      const pid = getRefreshIdentityHeaders()['X-User-MemberPositionId']?.trim();
      syncApprovalQueryCachesAfterAct(qc, detail, {
        myMemberId: authMemberId,
        myMemberPositionId: pid,
      });
      const proxy = requestIncludesMyProxyAct(detail, {
        myMemberId: authMemberId,
        myMemberPositionId: pid,
      });
      message.success(proxy ? '대결로 승인 처리했습니다.' : '승인 처리했습니다.');
      setApprovalAction(null);
      setApprovalComment('');
      await qc.invalidateQueries({ queryKey: ['approval', 'documents', 'active'] });
    },
    onError: (e: Error) => message.error(e.message || '승인 처리에 실패했습니다.'),
  });

  const rejectM = useMutation({
    mutationFn: ({ approvalId, comment }: { approvalId: string; comment: string }) =>
      approvalRequestApi.reject(approvalId, comment),
    onSuccess: async (detail) => {
      const pid = getRefreshIdentityHeaders()['X-User-MemberPositionId']?.trim();
      syncApprovalQueryCachesAfterAct(qc, detail, {
        myMemberId: authMemberId,
        myMemberPositionId: pid,
      });
      const proxy = requestIncludesMyProxyAct(detail, {
        myMemberId: authMemberId,
        myMemberPositionId: pid,
      });
      message.success(proxy ? '대결로 반려 처리했습니다.' : '반려 처리했습니다.');
      setApprovalAction(null);
      setApprovalComment('');
      await qc.invalidateQueries({ queryKey: ['approval', 'documents', 'active'] });
    },
    onError: (e: Error) => message.error(e.message || '반려 처리에 실패했습니다.'),
  });

  useEffect(() => {
    if (!open) {
      setOfficialCancelOpen(false);
      setOfficialCancelReason('');
      setApprovalAction(null);
      setApprovalComment('');
    }
  }, [open]);

  useEffect(() => {
    setOfficialCancelOpen(false);
    setOfficialCancelReason('');
    setApprovalAction(null);
    setApprovalComment('');
  }, [requestId]);

  const markViewerReadM = useMutation({
    mutationFn: (viewerId: string) => approvalRequestApi.markViewerRead(viewerId),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['approval-user', 'request-detail', requestId] }),
        qc.invalidateQueries({ queryKey: ['approval-user', 'my-requests'] }),
        qc.invalidateQueries({ queryKey: ['approval-user', 'viewer-cc'] }),
        qc.invalidateQueries({ queryKey: ['approval-user', 'viewer-circulation'] }),
      ]);
    },
    onError: () => {
      /* 403/404/400 등은 열람 맥락에 따라 무시 — 서버·데이터 정합성 문제만 조용히 무시 */
    },
  });

  const { data: activeDocuments = [] } = useQuery({
    queryKey: ['approval', 'documents', 'active'],
    queryFn: () => approvalApi.listActiveDocuments(),
    enabled: open,
    staleTime: 60_000,
  });
  const { data: companyLeaveTypes = [] } = useQuery({
    queryKey: ['salary', 'company-leave-types'],
    queryFn: () => attendanceApi.companyLeaveType.list(),
    enabled: open,
    staleTime: 60_000,
  });
  const { data: salaryItemTemplates = [] } = useQuery({
    queryKey: ['salary', 'salary-item-templates'],
    queryFn: () => salaryApi.salaryItemTemplate.list(),
    enabled: open,
    staleTime: 60_000,
  });
  const { data: workSchedules = [] } = useQuery({
    queryKey: ['salary', 'work-schedules'],
    queryFn: () => attendanceApi.workSchedule.list(),
    enabled: open,
    staleTime: 60_000,
  });
  const flexibleWorkScheduleIds = useMemo(
    () =>
      workSchedules
        .filter((s) => s.workType === 'FLEXIBLE' && s.workScheduleId)
        .map((s) => s.workScheduleId!),
    [workSchedules],
  );
  const flexibleSlotQueries = useQueries({
    queries: flexibleWorkScheduleIds.map((wsId) => ({
      queryKey: ['salary', 'flexible-slots', wsId] as const,
      queryFn: () => attendanceApi.flexibleSlot.listByWorkSchedule(wsId),
      enabled: open,
      staleTime: 60_000,
    })),
  });

  /** 참조/공람자로 지정된 경우 상세 열람 시 읽음 PATCH — UNREAD일 때만 호출 */
  useEffect(() => {
    if (!open || !selectedRequestDetail || !requestId || !authMemberId) return;
    const mid = authMemberId.trim();
    if (!mid) return;
    const mine = selectedRequestDetail.viewers?.find((v) => v.viewerMemberId?.trim() === mid);
    if (!mine?.viewerId?.trim()) return;
    const unread =
      !mine.viewedAt?.trim() || String(mine.viewerReadStatus ?? '').toUpperCase() === 'UNREAD';
    if (!unread) return;
    markViewerReadM.mutate(mine.viewerId.trim());
  // eslint-disable-next-line react-hooks/exhaustive-deps -- markViewerReadM.mutate 안정
  }, [open, selectedRequestDetail, requestId, authMemberId]);

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

  /** 결재 응답 스냅샷만으로 표시 가능하면 GET /member/detail 호출을 생략(일반 직원 403 방지) */
  const approvalDetailMemberSnapshotLookup = useMemo(() => {
    const map = new Map<string, DetailMemberLookupRow>();
    if (!selectedRequestDetail) return map;
    const mergeInto = (memberId: string | null | undefined, row: DetailMemberLookupRow) => {
      const id = memberId?.trim();
      if (!id) return;
      const prev = map.get(id);
      map.set(id, prev ? mergeDetailMemberRows(row, prev) : row);
    };
    for (const l of selectedRequestDetail.approvalLines) {
      mergeInto(
        l.approverMemberId,
        detailMemberLookupFromStrings(l.approverName, l.approverOrganizationName, l.approverJobTitleName),
      );
      mergeInto(
        l.actualApproverMemberId,
        detailMemberLookupFromStrings(
          l.actualApproverName,
          l.actualApproverOrganizationName,
          l.actualApproverJobTitleName,
        ),
      );
    }
    for (const v of selectedRequestDetail.viewers ?? []) {
      mergeInto(
        v.viewerMemberId,
        detailMemberLookupFromStrings(v.viewerName, v.viewerOrganizationName, v.viewerJobTitleName),
      );
    }
    return map;
  }, [selectedRequestDetail]);

  const approvalDetailMemberQueries = useQueries({
    queries: detailMemberIds.map((memberId) => ({
      queryKey: ['member', 'detail', memberId],
      queryFn: () => memberApi.detailOrNull(memberId),
      enabled:
        open &&
        Boolean(memberId) &&
        !snapshotHasMemberLabel(approvalDetailMemberSnapshotLookup.get(memberId)),
      staleTime: 5 * 60_000,
    })),
  });

  const approvalDetailMemberLookup = useMemo(() => {
    const map = new Map<string, DetailMemberLookupRow>();
    detailMemberIds.forEach((id, i) => {
      const snap = approvalDetailMemberSnapshotLookup.get(id);
      const q = approvalDetailMemberQueries[i];
      const apiRow: DetailMemberLookupRow | null = q?.data
        ? {
            name: q.data.name?.trim() ?? '',
            organizationName: q.data.organizationName?.trim() ?? '',
            jobTitleName: q.data.jobTitleName?.trim() ?? '',
            pending: false,
          }
        : null;
      const merged = mergeDetailMemberRows(
        snap ?? { name: '', organizationName: '', jobTitleName: '', pending: false },
        apiRow ?? { name: '', organizationName: '', jobTitleName: '', pending: false },
      );
      const pending = Boolean(
        q &&
          (q.isPending || q.isFetching) &&
          !snapshotHasMemberLabel(snap) &&
          !apiRow,
      );
      map.set(id, { ...merged, pending });
    });
    return map;
  }, [detailMemberIds, approvalDetailMemberSnapshotLookup, approvalDetailMemberQueries]);

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

  const drafterSnapshotRow = useMemo(
    () =>
      selectedRequestDetail
        ? detailMemberLookupFromStrings(
            selectedRequestDetail.requesterName,
            selectedRequestDetail.requesterOrganizationName,
            undefined,
          )
        : undefined,
    [selectedRequestDetail],
  );

  const { data: requestDetailDrafter } = useQuery({
    queryKey: ['member', 'detail', 'approval-detail-drafter', selectedRequestDetail?.memberId],
    queryFn: () => memberApi.detailOrNull(selectedRequestDetail!.memberId),
    enabled:
      open &&
      Boolean(selectedRequestDetail?.memberId?.trim()) &&
      !snapshotHasMemberLabel(drafterSnapshotRow),
    staleTime: 60_000,
  });

  const requestDetailDocument = useMemo(
    () =>
      selectedRequestDetail
        ? activeDocuments.find((d) => d.documentId === selectedRequestDetail.documentId) ?? null
        : null,
    [activeDocuments, selectedRequestDetail],
  );

  // 양식 스키마 우선순위:
  // 1. 활성 양식 list 매칭 (관리자 / 양식 활성 상태)
  // 2. 결재 요청 자체에 들어있는 formSchemaSnapshot (상신 시점 스냅샷)
  //    - 권한 필터로 list 에서 빠지거나 양식이 비활성화된 경우 (예: 인사발령품의서, 일반 사용자 결재자)
  const requestDetailSchema = useMemo(() => {
    if (requestDetailDocument) {
      const fromActive = parseFormSchema(requestDetailDocument.formSchema);
      if (fromActive.fields.length > 0) return fromActive;
    }
    const snapshot = selectedRequestDetail?.formSchemaSnapshot;
    if (snapshot && snapshot.trim()) {
      return parseFormSchema(snapshot);
    }
    return { fields: [] };
  }, [requestDetailDocument, selectedRequestDetail]);
  const companyLeaveTypeNameById = useMemo(
    () => new Map(companyLeaveTypes.map((row) => [row.companyLeaveTypeId ?? '', row.name ?? ''])),
    [companyLeaveTypes],
  );
  const salaryItemTemplateNameById = useMemo(
    () => new Map(salaryItemTemplates.map((row) => [row.salaryItemTemplateId ?? '', row.itemName ?? ''])),
    [salaryItemTemplates],
  );
  const flexibleSlotNameById = useMemo(() => {
    const out = new Map<string, string>();
    for (const q of flexibleSlotQueries) {
      for (const slot of q.data ?? []) {
        const id = slot.slotId ?? '';
        if (!id) continue;
        const label = `${slot.slotLabel ?? slot.slotCode ?? '—'} (${(slot.startTime ?? '').slice(0, 5)}~${(slot.endTime ?? '').slice(0, 5)})`;
        out.set(id, label);
      }
    }
    return out;
  }, [flexibleSlotQueries]);

  const canDeleteAttachments = useMemo(() => {
    if (!selectedRequestDetail || !authMemberId.trim()) return false;
    const st = String(selectedRequestDetail.requestStatus).toUpperCase();
    if (st !== 'DRAFT' && st !== 'WAIT') return false;
    const drafter = selectedRequestDetail.memberId?.trim() ?? '';
    return Boolean(drafter) && drafter === authMemberId.trim();
  }, [selectedRequestDetail, authMemberId]);

  const canSendOfficial = useMemo(
    () =>
      selectedRequestDetail ? canSendOfficialDocument(selectedRequestDetail, authMemberId) : false,
    [selectedRequestDetail, authMemberId],
  );

  // 결재 취소 가능 여부 - 본인 기안 + 상태 DRAFT/WAIT/PENDING
  const canCancelRequest = useMemo(() => {
    if (!selectedRequestDetail || !authMemberId.trim()) return false;
    const drafter = selectedRequestDetail.memberId?.trim() ?? '';
    if (!drafter || drafter !== authMemberId.trim()) return false;
    const st = String(selectedRequestDetail.requestStatus).toUpperCase();
    return st === 'DRAFT' || st === 'WAIT' || st === 'PENDING';
  }, [selectedRequestDetail, authMemberId]);

  const attachmentColumns: ColumnsType<ApprovalAttachment> = useMemo(
    () => [
      {
        title: '파일명',
        dataIndex: 'fileName',
        key: 'fileName',
        ellipsis: true,
      },
      {
        title: '크기',
        key: 'fileSize',
        width: 100,
        render: (_: unknown, row: ApprovalAttachment) => formatApprovalAttachmentBytes(row.fileSize),
      },
      {
        title: '다운로드',
        key: 'dl',
        width: 88,
        render: (_: unknown, row: ApprovalAttachment) => (
          <Button
            type="link"
            size="small"
            className="!tw-p-0"
            onClick={() => window.open(row.approvalUrl, '_blank', 'noopener,noreferrer')}
          >
            열기
          </Button>
        ),
      },
      ...(canDeleteAttachments
        ? [
            {
              title: '삭제',
              key: 'del',
              width: 72,
              render: (_: unknown, row: ApprovalAttachment) => (
                <Button
                  type="link"
                  size="small"
                  danger
                  className="!tw-p-0"
                  loading={deleteAttachmentM.isPending}
                  disabled={deleteAttachmentM.isPending}
                  onClick={() => void deleteAttachmentM.mutateAsync(row.attachmentId)}
                >
                  삭제
                </Button>
              ),
            },
          ]
        : []),
    ],
    [canDeleteAttachments, deleteAttachmentM.isPending],
  );

  const detailModalFooter = (
    <div className="tw-flex tw-w-full tw-flex-wrap tw-items-center tw-justify-end tw-gap-2">
      {!detailLoading && selectedRequestDetail && requestId ? (
        <Button
          icon={<DownloadOutlined />}
          loading={approvalPdfDownloadM.isPending}
          onClick={() => void approvalPdfDownloadM.mutateAsync()}
        >
          PDF 다운로드
        </Button>
      ) : null}
      {canActApproveReject ? (
        <>
          <Button
            type="primary"
            loading={approveM.isPending || rejectM.isPending}
            disabled={!myActionableApprovalLine}
            onClick={() =>
              myActionableApprovalLine &&
              setApprovalAction({ approvalId: myActionableApprovalLine.approvalId, mode: 'approve' })
            }
          >
            승인
          </Button>
          <Button
            danger
            loading={approveM.isPending || rejectM.isPending}
            disabled={!myActionableApprovalLine}
            onClick={() =>
              myActionableApprovalLine &&
              setApprovalAction({ approvalId: myActionableApprovalLine.approvalId, mode: 'reject' })
            }
          >
            반려
          </Button>
        </>
      ) : null}
      {canCancelRequest ? (
        <Button danger loading={cancelRequestM.isPending} onClick={() => setRequestCancelOpen(true)}>
          결재 취소
        </Button>
      ) : null}
      <Button type="primary" className="!tw-min-w-[6rem] !tw-rounded-xl !tw-bg-[#1e3a5f]" onClick={onClose}>
        닫기
      </Button>
    </div>
  );

  return (
    <>
    <AppSingleActionModal
      title={title}
      open={open}
      onClose={onClose}
      onSubmit={onClose}
      submitText="닫기"
      customFooter={detailModalFooter}
      width={920}
      destroyOnHidden
    >
      <div className="tw-px-5 tw-py-4">
      {detailLoading || !selectedRequestDetail ? (
        <Typography.Text type="secondary">불러오는 중...</Typography.Text>
      ) : (
        <Space direction="vertical" size={12} className="tw-w-full">
          <Descriptions size="small" bordered column={2}>
            <Descriptions.Item label="양식">{selectedRequestDetail.documentName}</Descriptions.Item>
            <Descriptions.Item label="상태">{statusTag(selectedRequestDetail.requestStatus)}</Descriptions.Item>
            <Descriptions.Item label="요청일">{formatDateTime(selectedRequestDetail.createdAt)}</Descriptions.Item>
            <Descriptions.Item label="수정일">{formatDateTime(selectedRequestDetail.updatedAt)}</Descriptions.Item>
            {normalizeApprovalRequestType(selectedRequestDetail.requestType) === 'OFFICIAL' ? (
              <>
                <Descriptions.Item label="공문 번호" span={2}>
                  {selectedRequestDetail.documentNumber?.trim() ? (
                    <Typography.Text strong>{selectedRequestDetail.documentNumber.trim()}</Typography.Text>
                  ) : (
                    <Typography.Text type="secondary">발번 전 (최종 승인 후 부여)</Typography.Text>
                  )}
                </Descriptions.Item>
                {String(selectedRequestDetail.requestStatus).toUpperCase() === 'APPROVED' ? (
                  <Descriptions.Item label="공문 발송" span={2}>
                    {String(selectedRequestDetail.sendYn ?? '').toUpperCase() === 'Y' ? (
                      <Tag color="success">발송 완료</Tag>
                    ) : canSendOfficial ? (
                      <Space wrap className="tw-w-full">
                        <Popconfirm
                          title="수신 부서로 공문을 발송할까요?"
                          description="발송 후에는 문서를 취소할 수 없습니다."
                          okText="발송"
                          cancelText="닫기"
                          onConfirm={() => {
                            if (requestId) void sendOfficialM.mutateAsync();
                          }}
                        >
                          <Button
                            type="primary"
                            icon={<SendOutlined />}
                            loading={sendOfficialM.isPending}
                            disabled={sendOfficialM.isPending || cancelOfficialBeforeSendM.isPending}
                          >
                            발송
                          </Button>
                        </Popconfirm>
                        <Button
                          danger
                          loading={cancelOfficialBeforeSendM.isPending}
                          disabled={sendOfficialM.isPending || cancelOfficialBeforeSendM.isPending}
                          onClick={() => setOfficialCancelOpen(true)}
                        >
                          발송 취소
                        </Button>
                      </Space>
                    ) : (
                      <Typography.Text type="secondary">기안자 발송 대기 (미발송)</Typography.Text>
                    )}
                  </Descriptions.Item>
                ) : null}
              </>
            ) : null}
          </Descriptions>
          {normalizeApprovalRequestType(selectedRequestDetail.requestType) === 'OFFICIAL' &&
          (selectedRequestDetail.recipients?.length ?? 0) > 0 ? (
            <Card size="small" title="수신 부서">
              <Table
                size="small"
                pagination={false}
                rowKey={(r) => r.recipientId ?? `${r.recipientOrganizationId}-${r.recipientOrganizationName}`}
                dataSource={selectedRequestDetail.recipients ?? []}
                columns={[
                  { title: '수신 부서명', dataIndex: 'recipientOrganizationName', key: 'name' },
                ]}
              />
            </Card>
          ) : null}
          <Card size="small" title="내용">
            {requestDetailSchema.fields.length > 0 ? (
              <div className="tw-max-h-[min(70vh,720px)] tw-overflow-auto">
                {(() => {
                  const detail = selectedRequestDetail;
                  const docName = requestDetailDocument?.documentName ?? detail.documentName ?? '';
                  const docRequestType = requestDetailDocument?.requestType ?? detail.requestType ?? '';
                  const content = parseDetailContentJson(detail);
                  const dName =
                    requestDetailDrafter?.name?.trim() || detail.requesterName?.trim() || '—';
                  const dOrg =
                    requestDetailDrafter?.organizationName?.trim() ||
                    detail.requesterOrganizationName?.trim() ||
                    '—';
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
                      signatureImageUrl: l.signatureImageUrl,
                      isProxy: proxyUi,
                      proxyActorName,
                      actedAt: l.actedAt,
                      approvalStatus: l.approvalStatus,
                    };
                  });
                  return (
                    <ApprovalFormPaperLayout
                      documentName={docName}
                      categoryLabel={approvalRequestTypeLabelKo(docRequestType)}
                      requestTypeCode={normalizeApprovalRequestType(docRequestType)}
                      drafterName={dName}
                      drafterOrg={dOrg}
                      drafterJobTitle={dTitle}
                      writtenDate={dayjs(detail.createdAt).format('YYYY-MM-DD')}
                      documentNumber={detail.documentNumber ?? undefined}
                      stampColumn={
                        <ApprovalFormStampColumn
                          drafterName={dName}
                          drafterJobTitle={dTitle}
                          approvers={approvers}
                          applicationWrittenDateIso={dayjs(detail.createdAt).format('YYYY-MM-DD')}
                        />
                      }
                    >
                      {requestDetailSchema.fields.map((field) => {
                        if (field.type === 'ai_transcribe') return null;
                        if (field.type === 'static_note') {
                          return (
                            <ApprovalFormPaperStaticNoteRow
                              key={field.name}
                              title={field.label?.trim() || undefined}
                              body={field.staticText?.trim() ?? ''}
                            />
                          );
                        }
                        if (shouldHideApprovalFormFieldInSelectModalPreview(field)) return null;
                        const text = displayStoredFieldValue(field, content[field.name], {
                          companyLeaveTypeNameById,
                          salaryItemTemplateNameById,
                          flexibleSlotNameById,
                        });
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
          <Card size="small" title="첨부파일">
            {attachmentsLoading ? (
              <Typography.Text type="secondary">불러오는 중...</Typography.Text>
            ) : attachments.length === 0 ? (
              <Typography.Text type="secondary">첨부파일이 없습니다.</Typography.Text>
            ) : (
              <Table
                size="small"
                pagination={false}
                rowKey="attachmentId"
                dataSource={attachments}
                columns={attachmentColumns}
              />
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
      </div>
    </AppSingleActionModal>

    <AppDoubleActionModal
      title="공문 발송 취소"
      open={officialCancelOpen}
      onClose={() => {
        setOfficialCancelOpen(false);
        setOfficialCancelReason('');
      }}
      confirmText="취소 확정"
      cancelText="닫기"
      confirmDanger
      confirmLoading={cancelOfficialBeforeSendM.isPending}
      destroyOnHidden
      onConfirm={async () => {
        if (!officialCancelReason.trim()) {
          message.warning('취소 사유를 입력해 주세요.');
          return;
        }
        await cancelOfficialBeforeSendM.mutateAsync(officialCancelReason.trim());
      }}
    >
      <div className="tw-px-5 tw-py-4">
      <Typography.Paragraph type="secondary" className="!tw-mb-2 !tw-text-sm">
        승인된 공문이 수신 부서로 나가기 전에만 취소할 수 있습니다. 취소 사유는 결재·참조자에게 안내됩니다.
      </Typography.Paragraph>
      <Input.TextArea
        rows={4}
        value={officialCancelReason}
        onChange={(e) => setOfficialCancelReason(e.target.value)}
        placeholder="취소 사유를 입력하세요."
        maxLength={2000}
        showCount
      />
      </div>
    </AppDoubleActionModal>

    {/* 일반 결재 취소 모달 - DRAFT/WAIT/PENDING 상태에서 기안자가 직접 취소 */}
    <Modal
      title="결재 요청 취소"
      open={requestCancelOpen}
      onCancel={() => {
        setRequestCancelOpen(false);
        setRequestCancelReason('');
      }}
      okText="취소 확정"
      cancelText="닫기"
      okButtonProps={{ danger: true }}
      confirmLoading={cancelRequestM.isPending}
      destroyOnHidden
      onOk={async () => {
        if (!requestCancelReason.trim()) {
          message.warning('취소 사유를 입력해 주세요.');
          throw new Error('validation');
        }
        await cancelRequestM.mutateAsync(requestCancelReason.trim());
      }}
    >
      <Typography.Paragraph type="secondary" className="!tw-mb-2 !tw-text-sm">
        진행 중인 결재 요청을 취소합니다. 결재선과 참조자에게 취소 사유가 함께 안내됩니다.
      </Typography.Paragraph>
      <Input.TextArea
        rows={4}
        value={requestCancelReason}
        onChange={(e) => setRequestCancelReason(e.target.value)}
        placeholder="취소 사유를 입력하세요."
        maxLength={2000}
        showCount
      />
    </Modal>

    <AppDoubleActionModal
      title={approvalAction?.mode === 'approve' ? '승인 처리' : '반려 처리'}
      open={approvalAction != null}
      onClose={() => {
        setApprovalAction(null);
        setApprovalComment('');
      }}
      onConfirm={() => {
        if (!approvalAction) return;
        if (approvalAction.mode === 'approve') {
          void approveM.mutateAsync({
            approvalId: approvalAction.approvalId,
            comment: approvalComment.trim() || undefined,
          });
          return;
        }
        if (!approvalComment.trim()) {
          message.warning('반려 사유를 입력해 주세요.');
          return;
        }
        void rejectM.mutateAsync({ approvalId: approvalAction.approvalId, comment: approvalComment.trim() });
      }}
      confirmText={approvalAction?.mode === 'approve' ? '승인' : '반려'}
      cancelText="닫기"
      confirmLoading={approveM.isPending || rejectM.isPending}
      confirmDanger={approvalAction?.mode === 'reject'}
      destroyOnHidden
    >
      <div className="tw-px-5 tw-py-4">
        <Input.TextArea
          rows={4}
          value={approvalComment}
          onChange={(e) => setApprovalComment(e.target.value)}
          placeholder={approvalAction?.mode === 'approve' ? '승인 의견(선택)' : '반려 사유(필수)'}
        />
      </div>
    </AppDoubleActionModal>
    </>
  );
}
