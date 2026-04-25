import {
  ApartmentOutlined,
  ArrowLeftOutlined,
  CalendarOutlined,
  CheckCircleFilled,
  ClockCircleOutlined,
  CloseCircleOutlined,
  DeleteOutlined,
  DollarOutlined,
  EyeOutlined,
  FileProtectOutlined,
  FileTextOutlined,
  FolderOpenOutlined,
  FormOutlined,
  InboxOutlined,
  MinusOutlined,
  MoreOutlined,
  PaperClipOutlined,
  SafetyCertificateOutlined,
  SaveOutlined,
  SearchOutlined,
  SendOutlined,
} from '@ant-design/icons';
import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  App,
  Avatar,
  Button,
  Card,
  Descriptions,
  Divider,
  Empty,
  Form,
  Input,
  Modal,
  Popconfirm,
  Progress,
  Select,
  Space,
  Spin,
  Switch,
  Steps,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Tree,
  Typography,
  Upload,
} from 'antd';
import type { UploadProps } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { DataNode } from 'antd/es/tree';
import dayjs from 'dayjs';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  Fragment,
  useRef,
  useState,
  type ComponentType,
  type CSSProperties,
  type HTMLAttributes,
  type Key,
  type ReactNode,
} from 'react';
import { Navigate, useNavigate, useRouterState } from '@tanstack/react-router';
import {
  APPROVAL_REQUEST_TYPES,
  approvalApi,
  type ApprovalDocument,
  type ApprovalPolicyLineCandidateMember,
  type ApprovalRequestType,
} from '@/features/approvals/api/approvalApi';
import { absenceProxyApi, type AbsenceProxyRecord } from '@/features/approvals/api/absenceProxyApi';
import {
  ApprovalFormPaperFieldRow,
  ApprovalFormPaperLayout,
  ApprovalFormStampColumn,
} from '@/features/approvals/ui/ApprovalFormPaperLayout';
import { useAuth } from '@/features/auth/useAuth';
import clsx from 'clsx';
import {
  approvalAttachmentsApi,
  APPROVAL_ATTACHMENT_ALLOWED_EXT,
  APPROVAL_ATTACHMENT_MAX_COUNT,
  formatApprovalAttachmentBytes,
  validateApprovalAttachmentCandidate,
} from '@/features/approvals/api/approvalAttachmentsApi';
import {
  APPROVAL_REQUEST_STATUS,
  type ApprovalRequestStatus,
  approvalRequestApi,
  canSendOfficialDocument,
  isPendingApprovalLineForProxyActor,
  requestIncludesMyProxyAct,
  type ApprovalLine,
  type ApprovalRequestDetail,
  type ApprovalViewer,
  type CreateApprovalRequestPayload,
  type ViewerType,
} from '@/features/approvals/api/approvalRequestApi';
import { memberApi } from '@/features/member/api/memberApi';
import {
  buildOrgTreeWithMemberLeaves,
  flattenDirectMembersDeduped,
  type OrgPickerMemberRow,
} from '@/features/approvals/lib/approvalOrgTree';
import { APPROVAL_ORG_DRAG_MIME, ApprovalOrgDropZone } from '@/features/approvals/ui/ApprovalOrgDropZone';
import { organizationApi, type OrgChartOrgNode } from '@/features/organization/api/organizationApi';
import { findMemberOrganizationId } from '@/features/organization/lib/findMemberOrganizationInOrgChart';
import { PERM } from '@/features/permissions/backend-permissions';
import {
  canAccessMemberDirectoryFromPermissionStrings,
  isHrTeamMember,
} from '@/features/permissions/member-directory-access';
import { usePermissions } from '@/features/permissions/usePermissionsHook';
import { ApprovalsAdminPage } from '@/pages/app/ApprovalsAdminPage';
import {
  APPROVAL_FAMILY_EVENT_LEAVE_KIND_OPTION,
  APPROVAL_FAMILY_EVENT_SUBTYPE_FIELD_LABEL,
  APPROVAL_VACATION_LEAVE_KIND_FIELD_LABEL,
  findApprovalFormFieldByLabel,
  getApprovalRequestSubjectLine,
  parseDetailContentJson,
  parseFormSchema,
} from '@/features/approvals/lib/approvalFormSchema';
import { syncApprovalQueryCachesAfterAct } from '@/features/approvals/lib/syncApprovalQueryCaches';
import {
  APPROVAL_GUIDE_BOX_LABEL,
  mergeRequestsByRequestId,
  resolveGuideBox,
  type ApprovalGuideBox,
} from '@/features/approvals/lib/approvalGuideNav';
import { ApprovalFormSelectModal } from '@/features/approvals/ui/ApprovalFormSelectModal';
import { ApprovalRequestReadOnlyModal } from '@/features/approvals/ui/ApprovalRequestReadOnlyModal';
import { PendingApprovalInboxModalContent } from '@/features/approvals/ui/PendingApprovalInboxModal';
import { getRefreshIdentityHeaders } from '@/shared/stores/authRefreshIdentityStore';

async function maybeUploadApprovalAttachments(
  requestId: string,
  requestStatus: string,
  files?: File[],
): Promise<void> {
  const list = files?.filter((f) => f != null) ?? [];
  if (!list.length) return;
  const st = String(requestStatus).toUpperCase();
  if (st !== 'DRAFT' && st !== 'WAIT') return;
  await approvalAttachmentsApi.uploadAttachments(requestId, list);
}

async function createApprovalRequestWithAttachments(
  payload: CreateApprovalRequestPayload,
  attachmentFiles?: File[],
): Promise<ApprovalRequestDetail> {
  const res = await approvalRequestApi.createRequest(payload);
  await maybeUploadApprovalAttachments(res.requestId, String(res.requestStatus), attachmentFiles);
  return res;
}

async function updateApprovalRequestWithAttachments(
  requestId: string,
  payload: CreateApprovalRequestPayload,
  attachmentFiles?: File[],
): Promise<ApprovalRequestDetail> {
  const res = await approvalRequestApi.updateDraft(requestId, payload);
  await maybeUploadApprovalAttachments(res.requestId, String(res.requestStatus), attachmentFiles);
  return res;
}

/** 결재 작성 보조 영역: 카드 테두리·회색 헤더 최소화 */
const APPROVAL_COMPOSE_CARD_CLASS = 'tw-shadow-none tw-bg-transparent';
const APPROVAL_COMPOSE_TABLE_CLASS =
  '[&_.ant-table-thead_.ant-table-cell]:!tw-bg-white [&_.ant-table-thead_.ant-table-cell]:!tw-text-slate-600 [&_.ant-table-thead_.ant-table-cell]:!tw-font-semibold';

/** 작성 허브 카드 본문 목록 — 고정 높이 내 스크롤(부재 위임 등) */
const APPROVAL_HOME_CARD_SCROLL =
  'tw-max-h-[min(280px,45vh)] tw-min-h-0 tw-overflow-y-auto wf-scrollbar tw-pr-1';

/** 작성 허브 결재 대기 목록 — 약 2행만 보이고 나머지는 스크롤(결재선 카드 높이 반영) */
const APPROVAL_HOME_PENDING_LIST_SCROLL =
  'tw-max-h-[min(11rem,44vh)] tw-min-h-0 tw-overflow-y-auto wf-scrollbar tw-pr-1';

/** 작성 허브 상단(결재 대기 ↔ 결재 양식) — 스크롤 박스 높이 동일, 본문은 약 2행(2건) 분량 */
const APPROVAL_HOME_TOP_ROW_MATCH_SCROLL =
  'tw-h-[min(8.5rem,32vh)] tw-min-h-0 tw-shrink-0 tw-overflow-y-auto wf-scrollbar tw-pr-1 [scrollbar-gutter:stable]';

/** 작성 허브 문서함 카드(내 기안·참조·부서·공문·임시저장) — 약 3행만 보이고 나머지는 스크롤 */
const APPROVAL_HOME_DOC_LIST_SCROLL =
  'tw-max-h-[min(11.25rem,36vh)] tw-min-h-0 tw-overflow-y-auto wf-scrollbar tw-pr-1';

/** 작성 허브 하단 그리드 카드(문서함·부재 위임) — 빈 상태여도 부서 문서함과 동일 최소 높이 */
const APPROVAL_HOME_GRID_DOC_CARD_CLASS =
  'tw-rounded-2xl tw-border tw-border-slate-200/90 tw-shadow-sm tw-shadow-slate-900/5 md:tw-min-h-[230px]';

/** 작성 허브 상단 오른쪽 결재 양식 카드 — 하단 문서함과 달리 min-height 없음 */
const APPROVAL_HOME_COMPOSE_FORMS_CARD_CLASS =
  'tw-rounded-2xl tw-border tw-border-slate-200/90 tw-shadow-sm tw-shadow-slate-900/5';

const APPROVAL_EMBED_QUERY = 'compose-modal';

/** 공문 문서함 — 상태 필터 탭(URL `myStatus`와 동기화) */
const OFFICIAL_INBOX_FILTER_TABS: { key: 'ALL' | ApprovalRequestStatus; label: string }[] = [
  { key: 'ALL', label: '전체' },
  { key: 'DRAFT', label: '임시저장' },
  { key: 'WAIT', label: '제출 대기' },
  { key: 'PENDING', label: '진행 중' },
  { key: 'APPROVED', label: '완료(발송)' },
  { key: 'REJECTED', label: '반려' },
  { key: 'CANCELED', label: '취소' },
];

/** 작성 허브「전체」모달 iframe용 — `embed=compose-modal`이면 AppShell이 본문만 표시 */
function buildApprovalEmbedUrl(pathname: string, search: Record<string, string | undefined>): string {
  const u = new URL(pathname, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
  u.searchParams.set('embed', APPROVAL_EMBED_QUERY);
  for (const [k, v] of Object.entries(search)) {
    if (v !== undefined && v !== '') u.searchParams.set(k, v);
  }
  return u.toString();
}

/** 작성 허브「전체」모달 iframe — 카드별로 열리는 문서함 구역 */
type ComposeHomeEmbedPanel = 'my-all' | 'viewers' | 'department' | 'official' | 'draft' | 'absence';
type ApprovalNotificationModal = 'pending' | 'my-all' | 'viewers' | 'official' | 'draft';

function composeHomeEmbedPanelUrl(panel: ComposeHomeEmbedPanel): string {
  switch (panel) {
    case 'my-all':
      return buildApprovalEmbedUrl('/app/approvals/my-requests', {});
    case 'viewers':
      return buildApprovalEmbedUrl('/app/approvals', { tab: 'my', box: 'per-viewers' });
    case 'department':
      return buildApprovalEmbedUrl('/app/approvals/department', {});
    case 'official':
      return buildApprovalEmbedUrl('/app/approvals', { tab: 'my', box: 'per-official' });
    case 'draft':
      return buildApprovalEmbedUrl('/app/approvals', { tab: 'my', box: 'per-draft' });
    case 'absence':
      return buildApprovalEmbedUrl('/app/approvals/absence-proxy', {});
    default:
      return buildApprovalEmbedUrl('/app/approvals', { tab: 'my', box: 'per-all' });
  }
}

function pendingHomeLineStatusLabel(status: string): string {
  const s = String(status).toUpperCase();
  if (s === 'APPROVED') return '승인';
  if (s === 'REJECTED') return '반려';
  if (s === 'PENDING') return '검토 중';
  if (s === 'CANCELED') return '취소';
  return '대기';
}

function pendingHomeLineCardShellClass(status: string): string {
  const s = String(status).toUpperCase();
  if (s === 'APPROVED') return 'tw-border-blue-200 tw-bg-blue-50/95';
  if (s === 'REJECTED') return 'tw-border-rose-200 tw-bg-rose-50/95';
  if (s === 'PENDING') return 'tw-border-amber-200 tw-bg-amber-50/95';
  if (s === 'CANCELED') return 'tw-border-slate-200 tw-bg-slate-100/90';
  return 'tw-border-slate-200 tw-bg-slate-50/95';
}

function pendingHomeLineTextClass(status: string): string {
  const s = String(status).toUpperCase();
  if (s === 'APPROVED') return 'tw-text-blue-700';
  if (s === 'REJECTED') return 'tw-text-rose-700';
  if (s === 'PENDING') return 'tw-text-amber-900';
  if (s === 'CANCELED') return 'tw-text-slate-600';
  return 'tw-text-slate-500';
}

function PendingHomeApprovalLineStepIcon({ status }: { status: string }) {
  const s = String(status).toUpperCase();
  if (s === 'APPROVED') return <CheckCircleFilled className="!tw-text-lg tw-text-blue-500" />;
  if (s === 'REJECTED') return <CloseCircleOutlined className="!tw-text-lg tw-text-rose-500" />;
  if (s === 'PENDING') return <ClockCircleOutlined className="!tw-text-lg tw-text-amber-500" />;
  if (s === 'CANCELED') return <MinusOutlined className="!tw-text-lg tw-text-slate-400" />;
  return <MinusOutlined className="!tw-text-lg tw-text-slate-400" />;
}

function PendingHomeApprovalLineStrip({
  lines,
  visibleSlots = 0,
}: {
  lines: ApprovalLine[];
  /** 0보다 크면 결재선 가로 영역에 고정 폭 클래스를 붙입니다(카드·테이블 셀 레이아웃용). */

  visibleSlots?: number;
}) {
  const sorted = [...lines].sort((a, b) => a.stepOrder - b.stepOrder);
  if (sorted.length === 0) {
    return (
      <Typography.Text type="secondary" className="!tw-text-xs">
        —
      </Typography.Text>
    );
  }
  const viewportWidthClass = visibleSlots > 0 ? 'tw-w-[21rem]' : '';
  return (
    <div className={clsx('tw-min-w-0 tw-overflow-x-auto wf-scrollbar tw-pr-0.5', viewportWidthClass)} aria-label="결재선">
      <div className="tw-inline-flex tw-min-w-max tw-items-stretch tw-gap-1">
        {sorted.map((line, i) => {
          const name =
            line.approverName?.trim() ||
            line.approverJobTitleName?.trim() ||
            `결재 ${line.stepOrder}차`;
          const st = String(line.approvalStatus);
          const title = `${name} (${st})`;
          return (
            <Fragment key={line.approvalId}>
              {i > 0 ? (
                <span
                  className="tw-flex tw-shrink-0 tw-items-center tw-px-0.5 tw-text-sm tw-font-light tw-text-slate-300"
                  aria-hidden
                >
                  -
                </span>
              ) : null}
              <div
                title={title}
                className={clsx(
                  'tw-flex tw-h-full tw-min-w-[5.25rem] tw-max-w-[6.5rem] tw-shrink-0 tw-items-center tw-gap-1.5 tw-rounded-lg tw-border tw-px-2 tw-py-1',
                  pendingHomeLineCardShellClass(st),
                )}
              >
                <span className="tw-flex tw-flex-shrink-0 tw-items-center tw-leading-none">
                  <PendingHomeApprovalLineStepIcon status={st} />
                </span>
                <div className="tw-min-w-0 tw-flex-1">
                  <div
                    className={clsx(
                      'tw-truncate tw-text-[11px] tw-font-semibold tw-leading-tight',
                      pendingHomeLineTextClass(st),
                    )}
                  >
                    {name}
                  </div>
                  <div
                    className={clsx(
                      'tw-truncate tw-text-[10px] tw-font-medium tw-leading-tight tw-opacity-95',
                      pendingHomeLineTextClass(st),
                    )}
                  >
                    {pendingHomeLineStatusLabel(st)}
                  </div>
                </div>
              </div>
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}

type ApprovalLineMemberDraft = {
  kind: 'member';
  id: string;
  stepOrder: number;
  approverMemberId: string;
  approverMemberPositionId: string;
  memberName: string;
  jobTitleName: string;
  organizationName: string;
  source: 'policy' | 'manual';
  /** 정책 라인 기본 로드 시 — 삭제 불가 */
  policyLineId?: string;
  /** 정책 후보가 2명 이상일 때 선택 UI */
  policyCandidates?: ApprovalPolicyLineCandidateMember[];
};

type ApprovalLineOrgMember = {
  approverMemberId: string;
  approverMemberPositionId: string;
  memberName: string;
  jobTitleName: string;
  organizationName: string;
};

/** 조직 선택으로 추가한 결재는 UI에 조직 한 줄로 표시하고, 제출 시 members를 순서대로 전송합니다. */
type ApprovalLineOrgDraft = {
  kind: 'org';
  id: string;
  stepOrder: number;
  organizationId: string;
  organizationName: string;
  members: ApprovalLineOrgMember[];
  source: 'manual';
};

type ApprovalLineDraft = ApprovalLineMemberDraft | ApprovalLineOrgDraft;

type ViewerMemberDraft = {
  kind: 'member';
  viewerMemberId: string;
  viewerMemberPositionId: string;
  name: string;
  organizationName: string;
  jobTitleName: string;
};

type ViewerOrgDraft = {
  kind: 'org';
  id: string;
  organizationId: string;
  organizationName: string;
  members: Omit<ViewerMemberDraft, 'kind'>[];
};

type ViewerDraft = ViewerMemberDraft | ViewerOrgDraft;

function collectApproverMemberIds(rows: ApprovalLineDraft[]): Set<string> {
  const s = new Set<string>();
  for (const r of rows) {
    if (r.kind === 'member') s.add(r.approverMemberId);
    else r.members.forEach((m) => s.add(m.approverMemberId));
  }
  return s;
}

function collectViewerMemberIds(rows: ViewerDraft[]): Set<string> {
  const s = new Set<string>();
  for (const r of rows) {
    if (r.kind === 'member') s.add(r.viewerMemberId);
    else r.members.forEach((m) => s.add(m.viewerMemberId));
  }
  return s;
}

function flattenApprovalLinesForSubmit(rows: ApprovalLineDraft[]): Array<{
  approverMemberId: string;
  approverMemberPositionId: string;
}> {
  const ordered = [...rows].sort((a, b) => a.stepOrder - b.stepOrder);
  const out: Array<{ approverMemberId: string; approverMemberPositionId: string }> = [];
  for (const r of ordered) {
    if (r.kind === 'org') {
      for (const m of r.members) {
        out.push({
          approverMemberId: m.approverMemberId,
          approverMemberPositionId: m.approverMemberPositionId,
        });
      }
    } else {
      out.push({
        approverMemberId: r.approverMemberId,
        approverMemberPositionId: r.approverMemberPositionId,
      });
    }
  }
  return out;
}

function countViewerDraftMembers(rows: ViewerDraft[]): number {
  return rows.reduce((n, r) => n + (r.kind === 'org' ? r.members.length : 1), 0);
}

function flattenCcViewersForPayload(rows: ViewerDraft[]) {
  const out: Array<{ viewerMemberId: string; viewerMemberPositionId: string; viewerType: 'CC' }> = [];
  for (const r of rows) {
    if (r.kind === 'member') {
      out.push({
        viewerMemberId: r.viewerMemberId,
        viewerMemberPositionId: r.viewerMemberPositionId,
        viewerType: 'CC',
      });
    } else {
      for (const m of r.members) {
        out.push({
          viewerMemberId: m.viewerMemberId,
          viewerMemberPositionId: m.viewerMemberPositionId,
          viewerType: 'CC',
        });
      }
    }
  }
  return out;
}

function flattenCirculationViewersForPayload(rows: ViewerDraft[]) {
  const out: Array<{ viewerMemberId: string; viewerMemberPositionId: string; viewerType: 'CIRCULATION' }> = [];
  for (const r of rows) {
    if (r.kind === 'member') {
      out.push({
        viewerMemberId: r.viewerMemberId,
        viewerMemberPositionId: r.viewerMemberPositionId,
        viewerType: 'CIRCULATION',
      });
    } else {
      for (const m of r.members) {
        out.push({
          viewerMemberId: m.viewerMemberId,
          viewerMemberPositionId: m.viewerMemberPositionId,
          viewerType: 'CIRCULATION',
        });
      }
    }
  }
  return out;
}

function approvalLinesToMemberDrafts(lines: ApprovalLine[]): ApprovalLineDraft[] {
  return [...lines]
    .filter((l) => l.approverMemberId?.trim() && l.approverMemberPositionId?.trim())
    .sort((a, b) => a.stepOrder - b.stepOrder)
    .map((l) => ({
      kind: 'member' as const,
      id: `loaded-${l.approvalId}`,
      stepOrder: l.stepOrder,
      approverMemberId: l.approverMemberId.trim(),
      approverMemberPositionId: l.approverMemberPositionId.trim(),
      memberName: l.approverName?.trim() || '—',
      jobTitleName: l.approverJobTitleName?.trim() || '',
      organizationName: l.approverOrganizationName?.trim() || '',
      source: 'manual' as const,
    }));
}

function viewersToDraftRows(viewers: ApprovalViewer[]): { cc: ViewerDraft[]; circulation: ViewerDraft[] } {
  const cc: ViewerDraft[] = [];
  const circulation: ViewerDraft[] = [];
  for (const v of viewers) {
    const t = String(v.viewerType).toUpperCase();
    if (!v.viewerMemberId?.trim() || !v.viewerMemberPositionId?.trim()) continue;
    const row: ViewerMemberDraft = {
      kind: 'member',
      viewerMemberId: v.viewerMemberId.trim(),
      viewerMemberPositionId: v.viewerMemberPositionId.trim(),
      name: v.viewerName?.trim() || '—',
      organizationName: v.viewerOrganizationName?.trim() || '',
      jobTitleName: v.viewerJobTitleName?.trim() || '',
    };
    if (t === 'CC') cc.push(row);
    else if (t === 'CIRCULATION') circulation.push(row);
  }
  return { cc, circulation };
}

const REQUEST_TYPE_LABEL: Record<ApprovalRequestType, string> = {
  VACATION: '휴가',
  ATTENDANCE: '근태',
  HR_MOVEMENT: '부서이동',
  SALARY: '급여',
  GENERAL: '일반기안',
  CONTRACT: '전자계약',
  CERTIFICATE: '문서발급',
  OFFICIAL: '공문',
};

/** RequestType enum 주석과 맞춘 카테고리 설명 */
const REQUEST_TYPE_DESC: Record<ApprovalRequestType, string> = {
  VACATION: '휴가 신청 등',
  ATTENDANCE: '출퇴근·시간 관리',
  HR_MOVEMENT: '부서 이동',
  SALARY: '급여 관련',
  GENERAL: '일반 기안',
  CONTRACT: '전자계약',
  CERTIFICATE: '문서 발급',
  OFFICIAL: '대외 공문',
};

const REQUEST_TYPE_ICON: Record<ApprovalRequestType, ComponentType<{ className?: string }>> = {
  VACATION: CalendarOutlined,
  ATTENDANCE: ClockCircleOutlined,
  HR_MOVEMENT: ApartmentOutlined,
  SALARY: DollarOutlined,
  GENERAL: FileTextOutlined,
  CONTRACT: FileProtectOutlined,
  CERTIFICATE: SafetyCertificateOutlined,
  OFFICIAL: SendOutlined,
};

const APPROVAL_RECENT_FORMS_KEY = 'workforce.approval.recentForms';
const APPROVAL_HOME_BOOKMARKS_KEY = 'workforce.approval.homeBookmarks';

type RecentFormEntry = { documentId: string; documentName: string; requestType: string };

function loadRecentForms(): RecentFormEntry[] {
  try {
    const raw = localStorage.getItem(APPROVAL_RECENT_FORMS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (x): x is RecentFormEntry =>
          Boolean(x) && typeof x === 'object' && typeof (x as RecentFormEntry).documentId === 'string',
      )
      .slice(0, 5);
  } catch {
    return [];
  }
}

function saveRecentForms(entries: RecentFormEntry[]) {
  try {
    localStorage.setItem(APPROVAL_RECENT_FORMS_KEY, JSON.stringify(entries.slice(0, 5)));
  } catch {
    /* ignore */
  }
}

function normalizeApprovalRequestType(raw: string | undefined): ApprovalRequestType {
  const u = String(raw ?? '')
    .trim()
    .toUpperCase();
  if ((APPROVAL_REQUEST_TYPES as readonly string[]).includes(u)) return u as ApprovalRequestType;
  return 'GENERAL';
}

function pushRecentApprovalForm(doc: ApprovalDocument) {
  const t = normalizeApprovalRequestType(doc.requestType);
  const next = [
    { documentId: doc.documentId, documentName: doc.documentName, requestType: t },
    ...loadRecentForms().filter((x) => x.documentId !== doc.documentId),
  ].slice(0, 5);
  saveRecentForms(next);
}

/** 카테고리별 카드에서 처음에 보여 줄 양식 갯수(나머지는 펼치기) */
const FORM_PICKER_CATEGORY_INITIAL = 3;

type DocumentFormPickerProps = {
  value?: string;
  onChange?: (documentId: string) => void;
  /** 양식 카드/최근 목록에서 선택 직후 (같은 양식 재선택 포함) */
  onAfterPick?: (documentId: string, doc?: ApprovalDocument) => void;
  documents: ApprovalDocument[];
  loading?: boolean;
};

function DocumentFormPicker({
  value,
  onChange,
  onAfterPick,
  documents,
  loading,
}: DocumentFormPickerProps) {
  const byType = useMemo(() => {
    const map = Object.fromEntries(APPROVAL_REQUEST_TYPES.map((t) => [t, [] as ApprovalDocument[]])) as Record<
      ApprovalRequestType,
      ApprovalDocument[]
    >;
    for (const doc of documents) {
      map[normalizeApprovalRequestType(doc.requestType)].push(doc);
    }
    return map;
  }, [documents]);

  const docById = useMemo(() => new Map(documents.map((d) => [d.documentId, d])), [documents]);

  const [recentForms, setRecentForms] = useState<RecentFormEntry[]>(() => loadRecentForms());

  const filteredRecent = useMemo(
    () => recentForms.filter((r) => docById.has(r.documentId)).slice(0, 5),
    [recentForms, docById],
  );

  const [categoryExpanded, setCategoryExpanded] = useState<Partial<Record<ApprovalRequestType, boolean>>>({});

  const handleSelect = useCallback((documentId: string) => {
    const doc = docById.get(documentId);
    if (doc) {
      const t = normalizeApprovalRequestType(doc.requestType);
      const next = [
        { documentId: doc.documentId, documentName: doc.documentName, requestType: t },
        ...recentForms.filter((x) => x.documentId !== documentId),
      ].slice(0, 5);
      setRecentForms(next);
      saveRecentForms(next);
    }
    onChange?.(documentId);
    onAfterPick?.(documentId, doc);
  }, [docById, onAfterPick, onChange, recentForms]);

  if (loading) {
    return (
      <div className="tw-flex tw-min-h-[160px] tw-flex-col tw-items-center tw-justify-center tw-gap-3 tw-rounded-xl tw-border tw-border-dashed tw-border-slate-200 tw-bg-slate-50/60 tw-py-8">
        <Spin size="large" />
        <Typography.Text type="secondary" className="tw-text-sm">
          양식 목록 불러오는 중...
        </Typography.Text>
      </div>
    );
  }

  if (!documents.length) {
    return <Empty description="사용 가능한 활성 양식이 없습니다." />;
  }

  return (
    <div className="tw-flex tw-flex-col tw-gap-5 lg:tw-flex-row lg:tw-items-start">
      <aside className="tw-w-full tw-shrink-0 lg:tw-w-56 xl:tw-w-60">
        <Card
          size="small"
          title={<span className="tw-text-sm tw-font-semibold tw-text-slate-800">최근 사용한 양식</span>}
          className="tw-mb-3 tw-border-slate-200/90 tw-shadow-sm"
          styles={{ body: { padding: 12 } }}
        >
          {filteredRecent.length === 0 ? (
            <Typography.Text type="secondary" className="tw-text-xs">
              선택한 양식이 여기에 쌓입니다.
            </Typography.Text>
          ) : (
            <ul className="tw-m-0 tw-list-none tw-space-y-2 tw-p-0">
              {filteredRecent.map((r) => {
                const active = value === r.documentId;
                const cat = normalizeApprovalRequestType(r.requestType);
                return (
                  <li key={r.documentId}>
                    <button
                      type="button"
                      onClick={() => handleSelect(r.documentId)}
                      className={clsx(
                        'tw-w-full tw-appearance-none tw-rounded-lg tw-border-0 tw-bg-transparent tw-px-2.5 tw-py-2 tw-text-left tw-shadow-none tw-transition-colors',
                        'tw-outline-none hover:tw-bg-slate-50 focus-visible:tw-ring-2 focus-visible:tw-ring-blue-400 focus-visible:tw-ring-offset-1',
                        active && 'tw-bg-blue-50/70 tw-text-blue-900',
                      )}
                    >
                      <Typography.Text className="!tw-block tw-truncate tw-text-sm">{r.documentName}</Typography.Text>
                      <Typography.Text type="secondary" className="!tw-block tw-truncate tw-text-xs">
                        {REQUEST_TYPE_LABEL[cat]} · {cat}
                      </Typography.Text>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </aside>

      <div className="tw-min-w-0 tw-flex-1">
        <Typography.Title level={5} className="!tw-mb-4 !tw-mt-0 !tw-text-slate-900">
          결재 양식 선택
        </Typography.Title>
        <div className="tw-grid tw-grid-cols-1 tw-gap-4 md:tw-grid-cols-2 xl:tw-grid-cols-3">
          {APPROVAL_REQUEST_TYPES.map((t) => {
            const list = byType[t];
            const Icon = REQUEST_TYPE_ICON[t];
            const expanded = categoryExpanded[t] ?? false;
            const hasOverflow = list.length > FORM_PICKER_CATEGORY_INITIAL;
            const visibleList = hasOverflow && !expanded ? list.slice(0, FORM_PICKER_CATEGORY_INITIAL) : list;
            return (
              <Card
                key={t}
                size="small"
                variant="borderless"
                className="tw-h-full tw-bg-transparent tw-shadow-none"
                styles={{ body: { padding: 16, background: 'transparent' } }}
              >
                <div className="tw-mb-3 tw-flex tw-items-start tw-gap-3">
                  <span className="tw-flex tw-h-11 tw-w-11 tw-shrink-0 tw-items-center tw-justify-center tw-rounded-xl tw-bg-blue-50 tw-text-xl tw-text-blue-600">
                    <Icon />
                  </span>
                  <div className="tw-min-w-0 tw-flex-1">
                    <Typography.Text strong className="!tw-block tw-font-mono tw-text-sm tw-tracking-tight tw-text-slate-900">
                      {t}
                    </Typography.Text>
                    <Typography.Text type="secondary" className="!tw-mt-0.5 !tw-block tw-text-xs tw-leading-snug">
                      {REQUEST_TYPE_DESC[t]}
                    </Typography.Text>
                  </div>
                </div>
                {list.length === 0 ? (
                  <Typography.Text type="secondary" className="tw-text-xs">
                    등록된 양식이 없습니다.
                  </Typography.Text>
                ) : (
                  <>
                    <ul className="tw-m-0 tw-list-none tw-space-y-1 tw-border-t tw-border-slate-100 tw-pt-3 tw-pl-0">
                      {visibleList.map((doc) => {
                        const selected = value === doc.documentId;
                        return (
                          <li key={doc.documentId}>
                            <button
                              type="button"
                              onClick={() => handleSelect(doc.documentId)}
                              className={clsx(
                                'tw-flex tw-w-full tw-appearance-none tw-items-start tw-gap-2 tw-rounded-md tw-border-0 tw-bg-transparent tw-py-1.5 tw-pl-2 tw-pr-1 tw-text-left tw-text-sm tw-shadow-none',
                                'tw-outline-none tw-transition-colors hover:tw-bg-slate-50 focus-visible:tw-ring-2 focus-visible:tw-ring-blue-400 focus-visible:tw-ring-offset-1',
                                selected && 'tw-bg-blue-50/80 tw-text-blue-900',
                              )}
                            >
                              <span
                                className={clsx(
                                  'tw-mt-1.5 tw-h-1 tw-w-1 tw-shrink-0 tw-rounded-full',
                                  selected ? 'tw-bg-blue-500' : 'tw-bg-slate-300',
                                )}
                              />
                              <span className="tw-min-w-0 tw-flex-1">
                                <span className="tw-block tw-font-medium tw-text-slate-800">
                                  {formatApprovalDocumentName(doc.documentName)}
                                </span>
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                    {hasOverflow ? (
                      <div className="tw-mt-2 tw-border-t tw-border-slate-100 tw-pt-2">
                        <Button
                          type="link"
                          size="small"
                          className="!tw-h-auto !tw-p-0 !tw-text-xs"
                          aria-expanded={expanded}
                          onClick={() => setCategoryExpanded((prev) => ({ ...prev, [t]: !expanded }))}
                        >
                          {expanded
                            ? '접기'
                            : `펼치기 (${list.length - FORM_PICKER_CATEGORY_INITIAL}개 더 보기)`}
                        </Button>
                      </div>
                    ) : null}
                  </>
                )}
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const REQUEST_STATUS_LABEL: Record<ApprovalRequestStatus, string> = {
  DRAFT: '임시저장',
  WAIT: '제출됨',
  PENDING: '결재 진행 중',
  APPROVED: '승인',
  REJECTED: '반려',
  CANCELED: '취소',
};

/** 내 기안 문서함 — 상태 필터 탭(URL `myStatus`와 동기화) */
const MY_INBOX_FILTER_TABS: { key: 'ALL' | ApprovalRequestStatus; label: string }[] = [
  { key: 'ALL', label: '전체 상태' },
  ...APPROVAL_REQUEST_STATUS.map((v) => ({ key: v, label: REQUEST_STATUS_LABEL[v] })),
];

function formatDateTime(value?: string | null) {
  if (!value) return '—';
  const d = dayjs(value);
  return d.isValid() ? d.format('YYYY-MM-DD HH:mm') : value;
}

function formatApprovalDocumentName(name?: string | null): string {
  const raw = String(name ?? '').trim();
  const compact = raw.replace(/\s+/g, '');
  if (compact === '휴가신청') return '연차신청서';
  return raw || '—';
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

function formatAbsenceProxyRange(start: string, end: string) {
  const a = dayjs(start);
  const b = dayjs(end);
  if (!a.isValid() || !b.isValid()) return `${start} ~ ${end}`;
  return `${a.format('YYYY-MM-DD HH:mm')} ~ ${b.format('YYYY-MM-DD HH:mm')}`;
}

function absenceProxyDashboardTag(row: AbsenceProxyRecord) {
  if (row.isActiveYn !== 'Y') {
    return <Tag>취소됨</Tag>;
  }
  const now = dayjs();
  const start = dayjs(row.startDate);
  const end = dayjs(row.endDate);
  if (!start.isValid() || !end.isValid()) {
    return <Tag color="processing">활성</Tag>;
  }
  if (now.isBefore(start)) {
    return <Tag color="blue">예약</Tag>;
  }
  if (now.isAfter(end)) {
    return <Tag color="default">기간 종료</Tag>;
  }
  return <Tag color="success">진행 중</Tag>;
}

function memberKeyEq(a: string | undefined, b: string | undefined): boolean {
  const norm = (x: string) => x.replace(/-/g, '').trim().toLowerCase();
  const u = norm(typeof a === 'string' ? a : '');
  const v = norm(typeof b === 'string' ? b : '');
  return Boolean(u && v && u === v);
}

function unreadViewerForMember(row: ApprovalRequestDetail, myMemberId?: string): boolean {
  const mid = myMemberId?.trim();
  if (!mid) return false;
  const mine = row.viewers?.filter((x) => memberKeyEq(x.viewerMemberId, mid));
  if (!mine?.length) return false;
  return mine.some(
    (x) => !x.viewedAt?.trim() || String(x.viewerReadStatus).toUpperCase() === 'UNREAD',
  );
}

/** 결재 예정함: 아직 내가 결재할 차례가 아닌 요청 (PENDING 단계 결재자가 본인이 아님). */
function rowIsUpcomingForApprover(row: ApprovalRequestDetail, myMemberId?: string): boolean {
  const mid = myMemberId?.trim();
  if (!mid) return false;
  const pendingLine = row.approvalLines.find((l) => String(l.approvalStatus).toUpperCase() === 'PENDING');
  if (!pendingLine) return false;
  return !memberKeyEq(pendingLine.approverMemberId, mid);
}

type SortableApprovalLineRowContextValue = {
  setActivatorNodeRef: (element: HTMLElement | null) => void;
  listeners: ReturnType<typeof useSortable>['listeners'];
  attributes: ReturnType<typeof useSortable>['attributes'];
};

const SortableApprovalLineRowContext = createContext<SortableApprovalLineRowContextValue | null>(null);

/** 2×3 점 그리드 — 드래그로 결재 순서 변경 */
function ApprovalLineDragHandle() {
  const ctx = useContext(SortableApprovalLineRowContext);
  if (!ctx) return null;
  return (
    <span
      ref={ctx.setActivatorNodeRef}
      className="tw-inline-flex tw-cursor-grab tw-items-center tw-justify-center tw-rounded tw-p-1.5 tw-text-slate-500 hover:tw-bg-slate-100 hover:tw-text-slate-700 active:tw-cursor-grabbing"
      title="드래그하여 순서 변경"
      {...ctx.listeners}
      {...ctx.attributes}
    >
      <span className="tw-inline-grid tw-grid-cols-2 tw-gap-[3px] tw-leading-none" aria-hidden>
        {Array.from({ length: 6 }).map((_, i) => (
          <span key={i} className="tw-block tw-h-[3px] tw-w-[3px] tw-rounded-full tw-bg-current" />
        ))}
      </span>
    </span>
  );
}

type SortableApprovalTableRowProps = HTMLAttributes<HTMLTableRowElement> & {
  'data-row-key'?: Key;
};

function SortableApprovalTableRow({ children, style, className, ...rest }: SortableApprovalTableRowProps) {
  const id = String(rest['data-row-key'] ?? '');
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });

  const mergedStyle: CSSProperties = {
    ...(style as CSSProperties),
    transform: CSS.Transform.toString(transform),
    transition,
    ...(isDragging
      ? {
          position: 'relative',
          zIndex: 1,
          boxShadow: '0 2px 10px rgba(0,0,0,0.12)',
          background: 'var(--ant-color-bg-container, #fff)',
        }
      : {}),
  };

  const ctxValue = useMemo(
    () => ({ setActivatorNodeRef, listeners, attributes }),
    [setActivatorNodeRef, listeners, attributes],
  );

  return (
    <SortableApprovalLineRowContext.Provider value={ctxValue}>
      <tr ref={setNodeRef} style={mergedStyle} className={className} {...rest}>
        {children}
      </tr>
    </SortableApprovalLineRowContext.Provider>
  );
}

function findOrgChartNode(roots: OrgChartOrgNode[], organizationId: string): OrgChartOrgNode | null {
  for (const n of roots) {
    if (n.organizationId === organizationId) return n;
    const found = findOrgChartNode(n.children, organizationId);
    if (found) return found;
  }
  return null;
}

function flattenOrgChartOrganizations(roots: OrgChartOrgNode[]): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = [];
  const walk = (n: OrgChartOrgNode) => {
    out.push({ value: n.organizationId, label: n.name?.trim() || n.organizationId });
    for (const c of n.children ?? []) walk(c);
  };
  for (const r of roots) walk(r);
  return out;
}

function formatOfficialRecipientsSummary(row: ApprovalRequestDetail): string {
  const list = row.recipients ?? [];
  if (!list.length) return '—';
  return list.map((r) => r.recipientOrganizationName?.trim() || r.recipientOrganizationId).join(', ');
}

/** 선택 노드 및 모든 하위 조직 소속 멤버(중복 제거) */
function collectOrgMemberRowsUnderNode(node: OrgChartOrgNode): OrgPickerMemberRow[] {
  const rows: OrgPickerMemberRow[] = [];
  const seen = new Set<string>();
  const walk = (n: OrgChartOrgNode) => {
    for (const m of n.members) {
      if (seen.has(m.memberId)) continue;
      seen.add(m.memberId);
      rows.push({
        memberId: m.memberId,
        name: m.name,
        jobTitleName: m.jobGradeName,
        organizationName: n.name,
      });
    }
    n.children.forEach(walk);
  };
  walk(node);
  return rows;
}

export function ApprovalsPage() {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const routeSearch = useRouterState({
    select: (s) =>
      s.location.search as {
        tab?: string;
        myStatus?: string;
        compose?: string;
        sideNav?: string;
        box?: string;
        viewerSub?: string;
        embed?: string;
        docId?: string;
        approvalModal?: string;
        approvalOpenAt?: string;
        approvalRequestId?: string;
      },
  });
  const isEmbedComposeModal = routeSearch.embed === APPROVAL_EMBED_QUERY;
  const embedSearchSuffix = useMemo(
    () => (isEmbedComposeModal ? ({ embed: APPROVAL_EMBED_QUERY } as const) : {}),
    [isEmbedComposeModal],
  );
  const { hasPermission } = usePermissions();
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<ApprovalRequestDetail | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [approvalAction, setApprovalAction] = useState<{ approvalId: string; mode: 'approve' | 'reject' } | null>(null);
  const [approvalComment, setApprovalComment] = useState('');
  const [orgTreeSelectedKey, setOrgTreeSelectedKey] = useState<string>();
  const [approvalLineDrafts, setApprovalLineDrafts] = useState<ApprovalLineDraft[]>([]);
  const [lineInfoTab, setLineInfoTab] = useState<'approval' | 'cc' | 'circulation'>('approval');
  const [composeApprovalInfoModalOpen, setComposeApprovalInfoModalOpen] = useState(false);
  const [composePreviewOpen, setComposePreviewOpen] = useState(false);
  const [composeHomeMoreModal, setComposeHomeMoreModal] = useState<
    | { kind: 'iframe'; panel: ComposeHomeEmbedPanel }
    | { kind: 'pending-inbox'; title: string }
    | null
  >(null);
  const [composeFormSelectModalOpen, setComposeFormSelectModalOpen] = useState(false);
  const [composeFormSelectInitialId, setComposeFormSelectInitialId] = useState<string | undefined>(undefined);
  /** 저장 시 업로드할 로컬 파일 — 임시저장/제출 직후 POST /approval/attachments */
  const [composeAttachmentFiles, setComposeAttachmentFiles] = useState<File[]>([]);
  const [composeSidebarTab, setComposeSidebarTab] = useState<'line' | 'doc'>('line');
  const [composeAutosaveMode, setComposeAutosaveMode] = useState<'off' | '1m'>('off');
  const [memberKeyword, setMemberKeyword] = useState('');
  const [ccViewers, setCcViewers] = useState<ViewerDraft[]>([]);
  const [circulationViewers, setCirculationViewers] = useState<ViewerDraft[]>([]);
  /** 공문 수신 부서 — POST/PATCH 시 recipients 로 전송 */
  const [officialRecipients, setOfficialRecipients] = useState<
    { recipientOrganizationId: string; recipientOrganizationName: string }[]
  >([]);
  const [orgTreeExpandedKeys, setOrgTreeExpandedKeys] = useState<Key[]>([]);
  const [bookmarkedRequestIds, setBookmarkedRequestIds] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(APPROVAL_HOME_BOOKMARKS_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
    } catch {
      return [];
    }
  });
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | undefined>(undefined);
  /** 결재 작성: 1) 양식 선택 → 2) 공문 입력·결재선·참조 */
  const [composePhase, setComposePhase] = useState<'select' | 'fill'>('select');
  /** 임시저장(DRAFT) 수정 중이면 PATCH, 없으면 POST */
  const [composeEditingRequestId, setComposeEditingRequestId] = useState<string | null>(null);
  /** 부서 문서함 목록 공개 여부 — POST/PATCH `isDeptVisibleYn`, 공문은 Y 고정 */
  const [composeDeptVisibleYn, setComposeDeptVisibleYn] = useState<'Y' | 'N'>('Y');
  const composeDraftHydratingRef = useRef(false);
  const [form] = Form.useForm();

  const { user } = useAuth();
  /** 결재 양식 설정 탭: 시스템 관리자 + 인사팀(MEMBER 생성/수정) + 기존 승인관리 권한 */
  const canAdmin =
    user?.isSystemAdmin === true ||
    hasPermission(PERM.APPROVAL_AD_READ) ||
    hasPermission(PERM.MEMBER_CREATE) ||
    hasPermission(PERM.MEMBER_UPDATE);
  /** 결재 API·라인의 memberId와 동일해야 함 — JWT/로컬 저장 `X-User-UUID`로 보강 */
  const authMemberId =
    user?.id?.trim() || getRefreshIdentityHeaders()['X-User-UUID']?.trim() || undefined;

  const allowedTabs = useMemo(() => ['compose', 'my', 'pending', 'acted', ...(canAdmin ? ['admin'] : [])], [canAdmin]);

  const tab = useMemo(() => {
    const rawTab = routeSearch.tab;
    return typeof rawTab === 'string' && allowedTabs.includes(rawTab) ? rawTab : 'compose';
  }, [routeSearch.tab, allowedTabs]);
  const onComposeHub = tab === 'compose' && routeSearch.sideNav === 'request-compose';
  const approvalNotificationModal = useMemo<ApprovalNotificationModal | null>(() => {
    const raw = String(routeSearch.approvalModal ?? '')
      .trim()
      .toLowerCase();
    if (raw === 'pending' || raw === 'my-all' || raw === 'viewers' || raw === 'official' || raw === 'draft') {
      return raw;
    }
    return null;
  }, [routeSearch.approvalModal]);

  useEffect(() => {
    if (!onComposeHub || !approvalNotificationModal) return;
    if (String(routeSearch.approvalRequestId ?? '').trim()) return;
    if (approvalNotificationModal === 'pending') {
      setComposeHomeMoreModal({ kind: 'pending-inbox', title: '결재 대기 문서 전체' });
      return;
    }
    setComposeHomeMoreModal({ kind: 'iframe', panel: approvalNotificationModal });
  }, [onComposeHub, approvalNotificationModal, routeSearch.approvalOpenAt, routeSearch.approvalRequestId]);

  useEffect(() => {
    const rid = String(routeSearch.approvalRequestId ?? '').trim();
    if (!rid) return;
    setSelectedRequestId(rid);
  }, [routeSearch.approvalRequestId, routeSearch.approvalOpenAt]);

  const requestStatusFilter = useMemo<ApprovalRequestStatus | 'ALL'>(() => {
    if (tab !== 'my') return 'ALL';
    const box = typeof routeSearch.box === 'string' ? routeSearch.box : undefined;
    if (box === 'per-draft' || String(routeSearch.myStatus).toUpperCase() === 'DRAFT') return 'DRAFT';
    if (box === 'per-viewers') return 'ALL';
    const ms = routeSearch.myStatus;
    if (ms === 'ALL' || ms === undefined || ms === '') return 'ALL';
    if (typeof ms === 'string' && (APPROVAL_REQUEST_STATUS as readonly string[]).includes(ms)) {
      return ms as ApprovalRequestStatus;
    }
    return 'ALL';
  }, [tab, routeSearch.box, routeSearch.myStatus]);

  const activeGuideBox: ApprovalGuideBox | undefined = useMemo(
    () => resolveGuideBox(tab, typeof routeSearch.box === 'string' ? routeSearch.box : undefined),
    [tab, routeSearch.box],
  );

  const { data: drafterProfile } = useQuery({
    queryKey: ['member', 'detail', authMemberId],
    queryFn: () => memberApi.detail(authMemberId!),
    enabled: Boolean(authMemberId),
    staleTime: 60_000,
  });

  const { data: activeDocuments = [], isFetching: docsLoading } = useQuery({
    queryKey: ['approval', 'documents', 'active'],
    queryFn: () => approvalApi.listActiveDocuments(),
  });

  const composeHubVisibleDocuments = activeDocuments;

  const selectedDocument = useMemo(
    () => activeDocuments.find((d) => d.documentId === selectedDocumentId) ?? null,
    [activeDocuments, selectedDocumentId],
  );
  const selectedSchema = useMemo(
    () => (selectedDocument ? parseFormSchema(selectedDocument.formSchema) : { fields: [] }),
    [selectedDocument],
  );
  const vacationLeaveKindField = useMemo(
    () => findApprovalFormFieldByLabel(selectedSchema.fields, APPROVAL_VACATION_LEAVE_KIND_FIELD_LABEL),
    [selectedSchema.fields],
  );
  const familyEventSubtypeField = useMemo(
    () => findApprovalFormFieldByLabel(selectedSchema.fields, APPROVAL_FAMILY_EVENT_SUBTYPE_FIELD_LABEL),
    [selectedSchema.fields],
  );
  const vacationLeaveKindWatchPath = vacationLeaveKindField
    ? (['content', vacationLeaveKindField.name] as const)
    : undefined;
  const watchedVacationLeaveKind = Form.useWatch(vacationLeaveKindWatchPath, form);
  const showFamilyEventSubtypeInCompose =
    familyEventSubtypeField != null &&
    (vacationLeaveKindField == null || watchedVacationLeaveKind === APPROVAL_FAMILY_EVENT_LEAVE_KIND_OPTION);
  const composeSelectedOfficial = useMemo(
    () =>
      selectedDocument != null &&
      normalizeApprovalRequestType(selectedDocument.requestType) === 'OFFICIAL',
    [selectedDocument],
  );

  const { data: orgChart } = useQuery({
    queryKey: ['organization', 'org-chart'],
    queryFn: () => organizationApi.getOrgChart(),
    staleTime: 60_000,
  });

  const officialOrgSelectOptions = useMemo(
    () => flattenOrgChartOrganizations(orgChart?.organizations ?? []),
    [orgChart?.organizations],
  );

  const guideBox = activeGuideBox;
  const onPendingTab = tab === 'pending';
  const onMyTab = tab === 'my';
  const onActedTab = tab === 'acted';

  const pendingQueryEnabled = onPendingTab || onComposeHub;
  const actedQueryEnabled = onActedTab;
  const viewerCcEnabled = (onMyTab && guideBox === 'per-viewers') || onComposeHub;
  const needsMyRequestList = (onMyTab && guideBox !== 'per-viewers') || onComposeHub;

  const { data: myRequests = [], isFetching: myLoading } = useQuery({
    queryKey: ['approval-user', 'my-requests', requestStatusFilter, guideBox],
    queryFn: () => {
      if (guideBox === 'per-official') {
        const st = requestStatusFilter === 'ALL' ? undefined : requestStatusFilter;
        return approvalRequestApi.listMyRequests(st, 'OFFICIAL');
      }
      return requestStatusFilter === 'ALL'
        ? approvalRequestApi.listMyRequests()
        : approvalRequestApi.listMyRequests(requestStatusFilter);
    },
    enabled: needsMyRequestList,
  });

  const { data: pendingRequests = [], isFetching: pendingLoading } = useQuery({
    queryKey: ['approval-user', 'pending-approvals'],
    queryFn: () => approvalRequestApi.listPendingApprovals(),
    enabled: pendingQueryEnabled,
  });

  const { data: viewerCcRequests = [], isFetching: viewerCcLoading } = useQuery({
    queryKey: ['approval-user', 'viewer-cc'],
    queryFn: () => approvalRequestApi.listViewerCcRequests(),
    enabled: viewerCcEnabled,
  });

  const { data: viewerCirculationRequests = [], isFetching: viewerCirculationLoading } = useQuery({
    queryKey: ['approval-user', 'viewer-circulation'],
    queryFn: () => approvalRequestApi.listViewerCirculationRequests(),
    enabled: viewerCcEnabled,
  });

  /** 양식 선택 화면 요약·탭 이동용 — 필터와 무관하게 전체 내 결재 건수 */
  const { data: myRequestsAllForSummary = [] } = useQuery({
    queryKey: ['approval-user', 'my-requests', 'ALL'],
    queryFn: () => approvalRequestApi.listMyRequests(),
    staleTime: 60_000,
  });

  const { data: myDraftRequests = [], isFetching: myDraftsLoading } = useQuery({
    queryKey: ['approval-user', 'my-requests', 'DRAFT'],
    queryFn: () => approvalRequestApi.listMyRequests('DRAFT'),
    staleTime: 30_000,
  });

  const composeAttachmentsListEnabled =
    Boolean(composeEditingRequestId) &&
    tab === 'compose' &&
    composePhase === 'fill' &&
    routeSearch.sideNav !== 'request-compose';

  const { data: composeRemoteAttachments = [], isFetching: composeRemoteAttachmentsLoading } = useQuery({
    queryKey: ['approval', 'attachments', composeEditingRequestId],
    queryFn: () => approvalAttachmentsApi.listAttachments(composeEditingRequestId!),
    enabled: composeAttachmentsListEnabled,
    staleTime: 30_000,
  });

  const mySubmittedInProgressCount = useMemo(
    () =>
      myRequestsAllForSummary.filter((r) => {
        const s = String(r.requestStatus).toUpperCase();
        return s === 'WAIT' || s === 'PENDING';
      }).length,
    [myRequestsAllForSummary],
  );
  const myRejectedCount = useMemo(
    () => myRequestsAllForSummary.filter((r) => String(r.requestStatus).toUpperCase() === 'REJECTED').length,
    [myRequestsAllForSummary],
  );
  const unreadViewerCount = useMemo(
    () =>
      [...viewerCcRequests, ...viewerCirculationRequests].filter((row) => {
        const mine = row.viewers?.filter((v) => memberKeyEq(v.viewerMemberId, authMemberId));
        if (!mine?.length) return false;
        return mine.some((v) => String(v.viewerReadStatus).toUpperCase() !== 'READ' || !v.viewedAt?.trim());
      }).length,
    [authMemberId, viewerCcRequests, viewerCirculationRequests],
  );
  const recentSubmittedRows = useMemo(
    () => myRequestsAllForSummary.slice(0, 6),
    [myRequestsAllForSummary],
  );
  const importantRows = useMemo(() => {
    const idSet = new Set(bookmarkedRequestIds);
    return myRequestsAllForSummary.filter((r) => idSet.has(r.requestId)).slice(0, 10);
  }, [bookmarkedRequestIds, myRequestsAllForSummary]);

  const { data: actedRequests = [], isFetching: actedLoading } = useQuery({
    queryKey: ['approval-user', 'acted-approvals'],
    queryFn: () => approvalRequestApi.listActedApprovals(),
    enabled: actedQueryEnabled,
  });
  const { data: myAbsenceProxies = [] } = useQuery({
    queryKey: ['approval', 'absence-proxy', 'my'],
    queryFn: () => absenceProxyApi.listMine(),
    enabled: onComposeHub,
    staleTime: 60_000,
  });
  const { data: absenceProxiesDelegatedToMe = [] } = useQuery({
    queryKey: ['approval', 'absence-proxy', 'delegated'],
    queryFn: () => absenceProxyApi.listDelegatedToMe(),
    enabled: onComposeHub,
    staleTime: 60_000,
  });
  const homeAbsenceMinePreview = useMemo(() => myAbsenceProxies.slice(0, 10), [myAbsenceProxies]);
  const homeAbsenceDelegatedPreview = useMemo(
    () => absenceProxiesDelegatedToMe.slice(0, 10),
    [absenceProxiesDelegatedToMe],
  );
  const absenceHubMemberIds = useMemo(() => {
    const ids = new Set<string>();
    for (const r of homeAbsenceMinePreview) {
      const s = r.substituteId?.trim();
      if (s) ids.add(s);
    }
    for (const r of homeAbsenceDelegatedPreview) {
      const m = r.memberId?.trim();
      if (m) ids.add(m);
    }
    return [...ids];
  }, [homeAbsenceMinePreview, homeAbsenceDelegatedPreview]);
  const homeAbsenceMemberDetailQueries = useQueries({
    queries: absenceHubMemberIds.map((id) => ({
      queryKey: ['member', 'detail', 'compose-home-absence-proxy', id],
      queryFn: () => memberApi.detail(id),
      enabled: onComposeHub && Boolean(id),
      staleTime: 60_000,
    })),
  });
  const absenceHubMemberNameById = useMemo(() => {
    const map = new Map<string, string>();
    absenceHubMemberIds.forEach((id, i) => {
      const name = homeAbsenceMemberDetailQueries[i]?.data?.name?.trim();
      if (name) map.set(id, name);
    });
    return map;
  }, [absenceHubMemberIds, homeAbsenceMemberDetailQueries]);
  const { data: officialReceivedRequests = [] } = useQuery({
    queryKey: ['approval-user', 'official-received'],
    queryFn: () => approvalRequestApi.listOfficialReceivedRequests(),
    enabled: onComposeHub,
    staleTime: 60_000,
  });
  const { data: homeOfficialSentRequests = [] } = useQuery({
    queryKey: ['approval-user', 'my-requests', 'OFFICIAL'],
    queryFn: () => approvalRequestApi.listMyRequests(undefined, 'OFFICIAL'),
    enabled: onComposeHub,
    staleTime: 60_000,
  });
  const myOrganizationIdForDept = useMemo(() => {
    const fromDetail = (drafterProfile as { organizationId?: string } | undefined)?.organizationId?.trim();
    if (fromDetail) return fromDetail;
    if (authMemberId && orgChart?.organizations?.length) {
      return findMemberOrganizationId(orgChart.organizations, authMemberId) ?? '';
    }
    return '';
  }, [drafterProfile?.organizationId, authMemberId, orgChart?.organizations]);

  const { data: homeDepartmentRequests = [] } = useQuery({
    queryKey: ['approval-user', 'department-requests', 'home', myOrganizationIdForDept],
    queryFn: () => approvalRequestApi.listDepartmentRequests(myOrganizationIdForDept),
    enabled: onComposeHub && myOrganizationIdForDept.length > 0,
    staleTime: 60_000,
  });

  const pendingInboxRows = useMemo(() => {
    if (!onPendingTab || !guideBox) return pendingRequests;
    switch (guideBox) {
      case 'do-pending':
        return pendingRequests;
      case 'do-upcoming':
        return pendingRequests.filter((row) => rowIsUpcomingForApprover(row, authMemberId));
      default:
        return pendingRequests;
    }
  }, [
    onPendingTab,
    guideBox,
    pendingRequests,
    actedRequests,
    viewerCcRequests,
    viewerCirculationRequests,
    authMemberId,
  ]);

  const myInboxRows = useMemo(() => {
    if (!onMyTab || !guideBox) return myRequests;
    switch (guideBox) {
      case 'per-all':
      case 'per-draft':
        return myRequests;
      case 'per-viewers':
        return mergeRequestsByRequestId([viewerCcRequests, viewerCirculationRequests]);
      case 'per-official':
        return myRequests;
      default:
        return myRequests;
    }
  }, [
    onMyTab,
    guideBox,
    myRequests,
    viewerCcRequests,
    viewerCirculationRequests,
  ]);

  const pendingTableLoading =
    !onPendingTab || !guideBox
      ? false
      : guideBox === 'do-pending' || guideBox === 'do-upcoming'
        ? pendingLoading
        : pendingLoading;

  const myTableLoading =
    !onMyTab || !guideBox
      ? false
      : guideBox === 'per-viewers'
        ? viewerCcLoading || viewerCirculationLoading
        : myLoading;

  const refreshUserQueries = async () => {
    await qc.invalidateQueries({ queryKey: ['approval-user'] });
    await qc.invalidateQueries({ queryKey: ['approval', 'documents', 'active'] });
  };

  const createRequestM = useMutation({
    mutationFn: (vars: { payload: CreateApprovalRequestPayload; attachmentFiles?: File[] }) =>
      createApprovalRequestWithAttachments(vars.payload, vars.attachmentFiles),
    onSuccess: async (res) => {
      setComposeAttachmentFiles([]);
      await qc.invalidateQueries({ queryKey: ['approval', 'attachments'] });
      if (res.requestStatus === 'DRAFT') {
        message.success('임시저장되었습니다.');
        setComposeEditingRequestId(res.requestId);
        await refreshUserQueries();
        return;
      }
      message.success('결재 요청이 제출되었습니다.');
      composeDraftHydratingRef.current = true;
      setComposeEditingRequestId(null);
      form.resetFields();
      form.setFieldsValue({ content: {} });
      setSelectedDocumentId(undefined);
      setApprovalLineDrafts([]);
      setCcViewers([]);
      setCirculationViewers([]);
      setOfficialRecipients([]);
      setComposeDeptVisibleYn('Y');
      setComposePhase('select');
      setLineInfoTab('approval');
      queueMicrotask(() => {
        composeDraftHydratingRef.current = false;
      });
      await refreshUserQueries();
      navigate({ to: '/app/approvals', search: { tab: 'my', box: 'per-all', ...embedSearchSuffix }, replace: true });
    },
    onError: (e: Error) => message.error(e.message || '결재 요청 처리에 실패했습니다.'),
  });

  const updateRequestM = useMutation({
    mutationFn: (vars: {
      requestId: string;
      payload: CreateApprovalRequestPayload;
      attachmentFiles?: File[];
    }) => updateApprovalRequestWithAttachments(vars.requestId, vars.payload, vars.attachmentFiles),
    onSuccess: async (res, vars) => {
      setComposeAttachmentFiles([]);
      await qc.invalidateQueries({ queryKey: ['approval', 'attachments'] });
      if (vars.payload.requestStatus === 'DRAFT') {
        message.success('임시저장했습니다.');
        await refreshUserQueries();
        return;
      }
      message.success('결재 요청이 제출되었습니다.');
      composeDraftHydratingRef.current = true;
      setComposeEditingRequestId(null);
      form.resetFields();
      form.setFieldsValue({ content: {} });
      setSelectedDocumentId(undefined);
      setApprovalLineDrafts([]);
      setCcViewers([]);
      setCirculationViewers([]);
      setOfficialRecipients([]);
      setComposeDeptVisibleYn('Y');
      setComposePhase('select');
      setLineInfoTab('approval');
      queueMicrotask(() => {
        composeDraftHydratingRef.current = false;
      });
      await refreshUserQueries();
      navigate({ to: '/app/approvals', search: { tab: 'my', box: 'per-all', ...embedSearchSuffix }, replace: true });
    },
    onError: (e: Error) => message.error(e.message || '결재 요청 처리에 실패했습니다.'),
  });

  const deleteComposeRemoteAttachmentM = useMutation({
    mutationFn: (attachmentId: string) => approvalAttachmentsApi.deleteAttachment(attachmentId),
    onSuccess: async () => {
      message.success('첨부를 삭제했습니다.');
      await qc.invalidateQueries({ queryKey: ['approval', 'attachments'] });
    },
    onError: (e: Error) => message.error(e.message || '첨부 삭제에 실패했습니다.'),
  });

  const resetComposeToNew = useCallback(() => {
    composeDraftHydratingRef.current = true;
    setComposeEditingRequestId(null);
    setComposeAttachmentFiles([]);
    form.resetFields();
    form.setFieldsValue({ content: {} });
    setSelectedDocumentId(undefined);
    setApprovalLineDrafts([]);
    setCcViewers([]);
    setCirculationViewers([]);
    setOfficialRecipients([]);
    setComposeDeptVisibleYn('Y');
    setOrgTreeSelectedKey(undefined);
    setComposePhase('select');
    setLineInfoTab('approval');
    queueMicrotask(() => {
      composeDraftHydratingRef.current = false;
    });
  }, [form]);

  const openDraftForCompose = useCallback(
    async (requestId: string) => {
      try {
        const detail = await approvalRequestApi.getRequest(requestId);
        if (String(detail.requestStatus).toUpperCase() !== 'DRAFT') {
          message.warning('임시저장 상태의 문서만 불러올 수 있습니다.');
          return;
        }
        const doc = activeDocuments.find((d) => d.documentId === detail.documentId);
        if (!doc) {
          message.warning('해당 양식이 비활성화되었거나 목록에 없습니다.');
          return;
        }
        composeDraftHydratingRef.current = true;
        setComposeAttachmentFiles([]);
        setComposeEditingRequestId(detail.requestId);
        setComposeDeptVisibleYn(detail.isDeptVisibleYn === 'N' ? 'N' : 'Y');
        const content = parseDetailContentJson(detail);
        const draftFields = parseFormSchema(doc.formSchema).fields;
        const draftLeaveKind = findApprovalFormFieldByLabel(draftFields, APPROVAL_VACATION_LEAVE_KIND_FIELD_LABEL);
        const draftFamilySubtype = findApprovalFormFieldByLabel(draftFields, APPROVAL_FAMILY_EVENT_SUBTYPE_FIELD_LABEL);
        if (draftLeaveKind && draftFamilySubtype) {
          const k = content[draftLeaveKind.name];
          if (k !== APPROVAL_FAMILY_EVENT_LEAVE_KIND_OPTION) {
            delete content[draftFamilySubtype.name];
          }
        }
        form.setFieldsValue({
          documentId: detail.documentId,
          content,
        });
        setSelectedDocumentId(detail.documentId);
        setApprovalLineDrafts(approvalLinesToMemberDrafts(detail.approvalLines));
        const { cc, circulation } = viewersToDraftRows(detail.viewers ?? []);
        setCcViewers(cc);
        setCirculationViewers(circulation);
        const recRows = (detail.recipients ?? [])
          .filter((x) => x.recipientOrganizationId?.trim())
          .map((x) => ({
            recipientOrganizationId: x.recipientOrganizationId.trim(),
            recipientOrganizationName:
              x.recipientOrganizationName?.trim() || x.recipientOrganizationId.trim(),
          }));
        setOfficialRecipients(recRows);
        setOrgTreeSelectedKey(undefined);
        setComposePhase('fill');
        setLineInfoTab('approval');
        navigate({ to: '/app/approvals', search: { tab: 'compose', ...embedSearchSuffix }, replace: true });
        message.success('임시저장 문서를 불러왔습니다.');
        void qc.invalidateQueries({ queryKey: ['approval-user', 'my-requests'] });
        void qc.invalidateQueries({ queryKey: ['approval', 'attachments', requestId] });
        queueMicrotask(() => {
          composeDraftHydratingRef.current = false;
        });
        queueMicrotask(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
      } catch (e) {
        composeDraftHydratingRef.current = false;
        message.error(e instanceof Error ? e.message : '문서를 불러오지 못했습니다.');
      }
    },
    [activeDocuments, embedSearchSuffix, form, message, navigate, qc],
  );

  const cancelRequestM = useMutation({
    mutationFn: ({ requestId, reason }: { requestId: string; reason: string }) =>
      approvalRequestApi.cancelRequest(requestId, reason),
    onSuccess: async () => {
      message.success('결재 요청을 취소했습니다.');
      setCancelTarget(null);
      setCancelReason('');
      await refreshUserQueries();
    },
    onError: (e: Error) => message.error(e.message || '취소에 실패했습니다.'),
  });

  const sendOfficialM = useMutation({
    mutationFn: (requestId: string) => approvalRequestApi.sendOfficial(requestId),
    onSuccess: async () => {
      message.success('공문이 발송되었습니다.');
      await Promise.all([
        refreshUserQueries(),
        qc.invalidateQueries({ queryKey: ['approval-user', 'official-received'] }),
      ]);
    },
    onError: (e: Error) => message.error(e.message || '공문 발송에 실패했습니다.'),
  });

  const approveM = useMutation({
    mutationFn: ({ approvalId, comment }: { approvalId: string; comment?: string }) =>
      approvalRequestApi.approve(approvalId, comment),
    onSuccess: async (detail) => {
      const pid =
        getRefreshIdentityHeaders()['X-User-MemberPositionId']?.trim() ||
        drafterProfile?.memberPositionId?.trim();
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
      const pid =
        getRefreshIdentityHeaders()['X-User-MemberPositionId']?.trim() ||
        drafterProfile?.memberPositionId?.trim();
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

  const orgTreeDataWithMembers = useMemo<DataNode[]>(
    () => buildOrgTreeWithMemberLeaves(orgChart?.organizations ?? []),
    [orgChart],
  );
  useEffect(() => {
    const collectOrgKeys = (nodes: DataNode[]): Key[] => {
      const out: Key[] = [];
      const walk = (items: DataNode[]) => {
        for (const n of items) {
          const k = String(n.key);
          if (!k.startsWith('member:')) out.push(n.key);
          if (Array.isArray(n.children) && n.children.length) walk(n.children);
        }
      };
      walk(nodes);
      return out;
    };
    setOrgTreeExpandedKeys(collectOrgKeys(orgTreeDataWithMembers));
  }, [orgTreeDataWithMembers]);

  const orgPickerSearchMembers = useMemo(
    () => flattenDirectMembersDeduped(orgChart?.organizations ?? []),
    [orgChart],
  );

  const orgPickerSearchMatches = useMemo(() => {
    const q = memberKeyword.trim().toLowerCase();
    if (!q) return [];
    return orgPickerSearchMembers.filter((m) =>
      `${m.name} ${m.jobTitleName} ${m.organizationName}`.toLowerCase().includes(q),
    );
  }, [memberKeyword, orgPickerSearchMembers]);

  const applyPolicyLineDrafts = useCallback(
    async (doc?: ApprovalDocument | null) => {
      if (composeEditingRequestId) return;
      if (!doc) {
        setApprovalLineDrafts([]);
        return;
      }
      try {
        const candidateLines = await qc.fetchQuery({
          queryKey: ['approval', 'policy-lines', 'candidates', doc.documentId],
          queryFn: () => approvalApi.getPolicyLineCandidates(doc.documentId),
          staleTime: 60_000,
        });
        const nextDrafts = [...candidateLines]
          .sort((a, b) => a.stepOrder - b.stepOrder)
          .map((line): ApprovalLineDraft | null => {
            const first = line.candidates[0];
            if (!first) return null;
            const multi = line.candidates.length > 1;
            return {
              kind: 'member',
              id: `policy-${line.policyLineId}`,
              stepOrder: line.stepOrder,
              approverMemberId: first.memberId,
              approverMemberPositionId: first.memberPositionId,
              memberName: first.memberName,
              jobTitleName: first.jobTitleName,
              organizationName: first.organizationName,
              source: 'policy',
              policyLineId: line.policyLineId,
              ...(multi ? { policyCandidates: line.candidates } : {}),
            };
          });
        setApprovalLineDrafts(nextDrafts.filter((v) => v != null) as ApprovalLineDraft[]);
      } catch {
        setApprovalLineDrafts([]);
      }
    },
    [composeEditingRequestId, qc],
  );

  const initializeComposeForDocument = useCallback(
    (
      documentId: string,
      doc: ApprovalDocument,
      opts?: { closeFormSelectModal?: boolean; navigateCompose?: boolean },
    ) => {
      if (opts?.closeFormSelectModal ?? true) {
        setComposeFormSelectModalOpen(false);
        setComposeFormSelectInitialId(undefined);
      }
      pushRecentApprovalForm(doc);
      if (opts?.navigateCompose ?? true) {
        navigate({ to: '/app/approvals', search: { tab: 'compose', ...embedSearchSuffix }, replace: true });
      }
      setComposeEditingRequestId(null);
      setApprovalLineDrafts([]);
      setOrgTreeSelectedKey(undefined);
      setCcViewers([]);
      setCirculationViewers([]);
      setOfficialRecipients([]);
      setComposeDeptVisibleYn('Y');
      form.setFieldsValue({ documentId, content: {} });
      setSelectedDocumentId(documentId);
      setComposeSidebarTab('line');
      setLineInfoTab('approval');
      void applyPolicyLineDrafts(doc);
      setComposePhase('fill');
      queueMicrotask(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
    },
    [applyPolicyLineDrafts, embedSearchSuffix, form, navigate],
  );

  const handleApprovalFormSelectConfirm = useCallback(
    (documentId: string, doc: ApprovalDocument) => {
      initializeComposeForDocument(documentId, doc, {
        closeFormSelectModal: true,
        navigateCompose: true,
      });
    },
    [initializeComposeForDocument],
  );

  const embedDocId = typeof routeSearch.docId === 'string' ? routeSearch.docId.trim() : '';
  useEffect(() => {
    if (!isEmbedComposeModal || tab !== 'compose') return;
    if (!embedDocId) return;
    if (!activeDocuments.length) return;
    if (selectedDocumentId === embedDocId && composePhase === 'fill') return;
    const doc = activeDocuments.find((d) => d.documentId === embedDocId);
    if (!doc) return;
    initializeComposeForDocument(embedDocId, doc, {
      closeFormSelectModal: false,
      navigateCompose: false,
    });
  }, [
    isEmbedComposeModal,
    tab,
    embedDocId,
    activeDocuments,
    selectedDocumentId,
    composePhase,
    initializeComposeForDocument,
  ]);

  const toggleBookmark = useCallback((requestId: string) => {
    setBookmarkedRequestIds((prev) => {
      const exists = prev.includes(requestId);
      const next = exists ? prev.filter((id) => id !== requestId) : [requestId, ...prev].slice(0, 20);
      try {
        localStorage.setItem(APPROVAL_HOME_BOOKMARKS_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const syncStepOrder = (rows: ApprovalLineDraft[]) => rows.map((r, idx) => ({ ...r, stepOrder: idx + 1 }));

  const orderedApprovalLineDrafts = useMemo(() => syncStepOrder([...approvalLineDrafts]), [approvalLineDrafts]);
  const approvalLineSortableIds = useMemo(() => orderedApprovalLineDrafts.map((r) => r.id), [orderedApprovalLineDrafts]);

  const approvalLineSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onApprovalLineDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setApprovalLineDrafts((prev) => {
      const oldIndex = prev.findIndex((r) => r.id === active.id);
      const newIndex = prev.findIndex((r) => r.id === over.id);
      if (oldIndex < 0 || newIndex < 0) return prev;
      const next = arrayMove([...prev], oldIndex, newIndex);
      return next.map((r, idx) => ({ ...r, stepOrder: idx + 1 }));
    });
  }, []);

  const applyPolicyCandidateChoice = useCallback((rowId: string, memberPositionId: string) => {
    setApprovalLineDrafts((prev) =>
      prev.map((r) => {
        if (r.id !== rowId || r.kind !== 'member' || r.source !== 'policy') return r;
        const pool = r.policyCandidates;
        if (!pool?.length) return r;
        const c = pool.find((x) => x.memberPositionId === memberPositionId);
        if (!c) return r;
        return {
          ...r,
          approverMemberId: c.memberId,
          approverMemberPositionId: c.memberPositionId,
          memberName: c.memberName,
          jobTitleName: c.jobTitleName,
          organizationName: c.organizationName,
        };
      }),
    );
  }, []);

  const addApproverFromOrg = async (memberId: string) => {
    if (!selectedDocument) return;
    try {
      const detail = await memberApi.detail(memberId);
      const positionId = detail.memberPositionId?.trim();
      if (!positionId) {
        message.warning('선택 멤버의 직위 정보를 찾을 수 없습니다.');
        return;
      }
      setApprovalLineDrafts((prev) => {
        if (collectApproverMemberIds(prev).has(memberId)) {
          message.info('이미 결재선에 추가된 멤버입니다.');
          return prev;
        }
        return syncStepOrder([
          ...prev,
          {
            kind: 'member',
            id: `manual-${memberId}-${Date.now()}`,
            stepOrder: prev.length + 1,
            approverMemberId: memberId,
            approverMemberPositionId: positionId,
            memberName: detail.name || memberId,
            jobTitleName: detail.jobTitleName || '',
            organizationName: detail.organizationName || '',
            source: 'manual',
          },
        ]);
      });
    } catch (e) {
      message.error(e instanceof Error ? e.message : '멤버 정보를 불러오지 못했습니다.');
    }
  };

  const addViewerFromOrg = async (memberId: string, viewerType: ViewerType) => {
    if (!selectedDocument) {
      message.warning('양식을 선택해 주세요.');
      return;
    }
    const list = viewerType === 'CC' ? ccViewers : circulationViewers;
    if (collectViewerMemberIds(list).has(memberId)) {
      message.info(viewerType === 'CC' ? '이미 참조자로 추가된 멤버입니다.' : '이미 공람자로 추가된 멤버입니다.');
      return;
    }
    try {
      const detail = await memberApi.detail(memberId);
      const positionId = detail.memberPositionId?.trim();
      if (!positionId) {
        message.warning('선택 멤버의 직위 정보를 찾을 수 없습니다.');
        return;
      }
      const draft: ViewerDraft = {
        kind: 'member',
        viewerMemberId: memberId,
        viewerMemberPositionId: positionId,
        name: detail.name || memberId,
        jobTitleName: detail.jobTitleName || '',
        organizationName: detail.organizationName || '',
      };
      if (viewerType === 'CC') setCcViewers((p) => [...p, draft]);
      else setCirculationViewers((p) => [...p, draft]);
    } catch (e) {
      message.error(e instanceof Error ? e.message : '멤버 정보를 불러오지 못했습니다.');
    }
  };


  const bulkAddApproversFromOrg = useCallback(
    async (organizationId: string) => {
      if (!selectedDocument) return;
      const node = findOrgChartNode(orgChart?.organizations ?? [], organizationId);
      if (!node) return;
      const memberIds = collectOrgMemberRowsUnderNode(node).map((r) => r.memberId);
      if (!memberIds.length) {
        message.info('선택한 조직에 추가할 멤버가 없습니다.');
        return;
      }
      const newMembers: ApprovalLineOrgMember[] = [];
      for (const memberId of memberIds) {
        try {
          const detail = await memberApi.detail(memberId);
          const positionId = detail.memberPositionId?.trim();
          if (!positionId) continue;
          newMembers.push({
            approverMemberId: memberId,
            approverMemberPositionId: positionId,
            memberName: detail.name || memberId,
            jobTitleName: detail.jobTitleName || '',
            organizationName: detail.organizationName || '',
          });
        } catch {
          /* skip */
        }
      }
      if (!newMembers.length) {
        message.warning('조직 멤버 정보를 불러오지 못했습니다.');
        return;
      }
      let addedCount = 0;
      setApprovalLineDrafts((prev) => {
        const existing = collectApproverMemberIds(prev);
        const toAdd = newMembers.filter((m) => !existing.has(m.approverMemberId));
        if (!toAdd.length) return prev;
        const orgIdx = prev.findIndex((r) => r.kind === 'org' && r.organizationId === organizationId);
        if (orgIdx >= 0) {
          const orgRow = prev[orgIdx] as ApprovalLineOrgDraft;
          const merged = [...orgRow.members];
          for (const m of toAdd) {
            if (!merged.some((x) => x.approverMemberId === m.approverMemberId)) merged.push(m);
          }
          addedCount = merged.length - orgRow.members.length;
          if (addedCount === 0) return prev;
          const next = [...prev];
          next[orgIdx] = { ...orgRow, members: merged };
          return syncStepOrder(next);
        }
        addedCount = toAdd.length;
        const orgRow: ApprovalLineOrgDraft = {
          kind: 'org',
          id: `org-approval-${organizationId}-${Date.now()}`,
          stepOrder: 0,
          organizationId,
          organizationName: node.name,
          members: toAdd,
          source: 'manual',
        };
        return syncStepOrder([...prev, orgRow]);
      });
      if (addedCount === 0) message.info('모든 멤버가 이미 결재선에 있습니다.');
      else message.success(`결재선에 조직 ${node.name} 소속 ${addedCount}명을 반영했습니다.`);
    },
    [selectedDocument, orgChart, message],
  );

  const bulkAddViewersFromOrg = useCallback(
    async (organizationId: string, viewerType: ViewerType) => {
      if (!selectedDocument) {
        message.warning('양식을 선택해 주세요.');
        return;
      }
      const node = findOrgChartNode(orgChart?.organizations ?? [], organizationId);
      if (!node) return;
      const memberIds = collectOrgMemberRowsUnderNode(node).map((r) => r.memberId);
      if (!memberIds.length) {
        message.info('선택한 조직에 추가할 멤버가 없습니다.');
        return;
      }
      type Vm = Omit<ViewerMemberDraft, 'kind'>;
      const newMembers: Vm[] = [];
      for (const memberId of memberIds) {
        try {
          const detail = await memberApi.detail(memberId);
          const positionId = detail.memberPositionId?.trim();
          if (!positionId) continue;
          newMembers.push({
            viewerMemberId: memberId,
            viewerMemberPositionId: positionId,
            name: detail.name || memberId,
            jobTitleName: detail.jobTitleName || '',
            organizationName: detail.organizationName || '',
          });
        } catch {
          /* skip */
        }
      }
      if (!newMembers.length) {
        message.warning('조직 멤버 정보를 불러오지 못했습니다.');
        return;
      }
      let addedCount = 0;
      const setList = viewerType === 'CC' ? setCcViewers : setCirculationViewers;
      setList((prev) => {
        const existing = collectViewerMemberIds(prev);
        const toAdd = newMembers.filter((m) => !existing.has(m.viewerMemberId));
        if (!toAdd.length) return prev;
        const orgIdx = prev.findIndex((r) => r.kind === 'org' && r.organizationId === organizationId);
        if (orgIdx >= 0) {
          const orgRow = prev[orgIdx] as ViewerOrgDraft;
          const merged = [...orgRow.members];
          for (const m of toAdd) {
            if (!merged.some((x) => x.viewerMemberId === m.viewerMemberId)) merged.push(m);
          }
          addedCount = merged.length - orgRow.members.length;
          if (addedCount === 0) return prev;
          const next = [...prev];
          next[orgIdx] = { ...orgRow, members: merged };
          return next;
        }
        addedCount = toAdd.length;
        const orgRow: ViewerOrgDraft = {
          kind: 'org',
          id: `org-viewer-${viewerType}-${organizationId}-${Date.now()}`,
          organizationId,
          organizationName: node.name,
          members: toAdd,
        };
        return [...prev, orgRow];
      });
      if (addedCount === 0) {
        message.info(viewerType === 'CC' ? '모든 멤버가 이미 참조자입니다.' : '모든 멤버가 이미 공람자입니다.');
      } else {
        message.success(
          viewerType === 'CC'
            ? `참조자에 조직 ${node.name} 소속 ${addedCount}명을 반영했습니다.`
            : `공람자에 조직 ${node.name} 소속 ${addedCount}명을 반영했습니다.`,
        );
      }
    },
    [selectedDocument, orgChart, message],
  );

  const addFromOrgPickerByCurrentTab = useCallback(
    async (payload: { kind: 'member'; memberId: string } | { kind: 'org'; organizationId: string }) => {
      if (lineInfoTab === 'approval') {
        if (payload.kind === 'member') await addApproverFromOrg(payload.memberId);
        else await bulkAddApproversFromOrg(payload.organizationId);
        return;
      }
      const viewerType: ViewerType = lineInfoTab === 'cc' ? 'CC' : 'CIRCULATION';
      if (payload.kind === 'member') await addViewerFromOrg(payload.memberId, viewerType);
      else await bulkAddViewersFromOrg(payload.organizationId, viewerType);
    },
    [addApproverFromOrg, addViewerFromOrg, bulkAddApproversFromOrg, bulkAddViewersFromOrg, lineInfoTab],
  );

  const composeAttachmentAcceptAttr = useMemo(
    () => Array.from(APPROVAL_ATTACHMENT_ALLOWED_EXT).map((ext) => `.${ext}`).join(','),
    [],
  );
  const composeAttachmentSlotsLeft = Math.max(
    0,
    APPROVAL_ATTACHMENT_MAX_COUNT - composeRemoteAttachments.length - composeAttachmentFiles.length,
  );

  const addComposeAttachmentFiles = useCallback(
    (incoming: File[]) => {
      if (!incoming.length) return;
      const existingRemoteCount = composeRemoteAttachments.length;
      const existingRemoteBytes = composeRemoteAttachments.reduce(
        (acc, a) => acc + (Number.isFinite(a.fileSize) ? a.fileSize : 0),
        0,
      );
      setComposeAttachmentFiles((prev) => {
        const next = [...prev];
        for (const file of incoming) {
          const pendingLocalBytes = next.reduce((s, f) => s + f.size, 0);
          const err = validateApprovalAttachmentCandidate(file, {
            existingRemoteCount,
            pendingLocalCount: next.length,
            pendingLocalBytes,
            existingRemoteBytes,
          });
          if (err) {
            void message.error(err);
            break;
          }
          next.push(file);
        }
        return next;
      });
    },
    [composeRemoteAttachments, message],
  );

  const composeAttachmentDraggerProps = useMemo<UploadProps>(
    () => ({
      multiple: true,
      showUploadList: false,
      disabled: composeAttachmentSlotsLeft <= 0,
      accept: composeAttachmentAcceptAttr,
      beforeUpload: (file) => {
        addComposeAttachmentFiles([file as File]);
        return false;
      },
    }),
    [addComposeAttachmentFiles, composeAttachmentAcceptAttr, composeAttachmentSlotsLeft],
  );

  const submitCompose = async (status: 'DRAFT' | 'WAIT') => {
    try {
      if (status === 'WAIT') {
        await form.validateFields();
      } else {
        await form.validateFields(['documentId']);
      }
      const values = form.getFieldsValue(true) as { documentId?: string; content?: Record<string, unknown> };
      if (!selectedDocument) {
        message.warning('양식을 선택해 주세요.');
        return;
      }

      const contentForSubmit = { ...(values.content ?? {}) };
      if (vacationLeaveKindField && familyEventSubtypeField) {
        const kind = contentForSubmit[vacationLeaveKindField.name];
        if (kind !== APPROVAL_FAMILY_EVENT_LEAVE_KIND_OPTION) {
          delete contentForSubmit[familyEventSubtypeField.name];
        }
      }

      const flatApprovers = flattenApprovalLinesForSubmit(approvalLineDrafts);
      const approvalLines = flatApprovers.map((line, idx) => ({
        stepOrder: idx + 1,
        approverMemberId: line.approverMemberId,
        approverMemberPositionId: line.approverMemberPositionId,
      }));

      if (status === 'WAIT') {
        if (!approvalLines.length) {
          message.warning('결재선을 1명 이상 지정해 주세요.');
          return;
        }
        const duplicate = new Set<string>();
        for (const line of approvalLines) {
          if (duplicate.has(line.approverMemberId)) {
            message.warning('결재자 중복은 허용되지 않습니다.');
            return;
          }
          duplicate.add(line.approverMemberId);
        }
      }

      const viewersPayload = [
        ...flattenCcViewersForPayload(ccViewers),
        ...flattenCirculationViewersForPayload(circulationViewers),
      ];

      const isOfficial = normalizeApprovalRequestType(selectedDocument.requestType) === 'OFFICIAL';

      if (isOfficial && status === 'WAIT') {
        if (!officialRecipients.length) {
          message.warning('공문은 수신 부서를 최소 1곳 지정해 주세요.');
          return;
        }
        const seen = new Set<string>();
        for (const r of officialRecipients) {
          const id = r.recipientOrganizationId.trim();
          if (seen.has(id)) {
            message.warning('동일한 수신 부서를 중복 지정할 수 없습니다.');
            return;
          }
          seen.add(id);
          if (!r.recipientOrganizationName.trim()) {
            message.warning('수신 부서명을 확인해 주세요.');
            return;
          }
        }
      }

      const recipientsPayload =
        isOfficial && officialRecipients.length > 0
          ? officialRecipients.map((r) => ({
              recipientOrganizationId: r.recipientOrganizationId.trim(),
              recipientOrganizationName: r.recipientOrganizationName.trim(),
            }))
          : undefined;

      const payload: CreateApprovalRequestPayload = {
        documentId: values.documentId ?? selectedDocument.documentId,
        contentJson: JSON.stringify(contentForSubmit),
        requestStatus: status,
        isDeptVisibleYn: isOfficial ? 'Y' : composeDeptVisibleYn,
        ...(approvalLines.length ? { approvalLines } : {}),
        ...(viewersPayload.length ? { viewers: viewersPayload } : {}),
        ...(recipientsPayload ? { recipients: recipientsPayload } : {}),
      };

      const attach = composeAttachmentFiles;
      if (composeEditingRequestId) {
        await updateRequestM.mutateAsync({
          requestId: composeEditingRequestId,
          payload,
          attachmentFiles: attach.length ? attach : undefined,
        });
      } else {
        await createRequestM.mutateAsync({
          payload,
          attachmentFiles: attach.length ? attach : undefined,
        });
      }
    } catch {
      // form validation
    }
  };

  const composeSaving = createRequestM.isPending || updateRequestM.isPending;

  const renderMyInboxActions = (_: unknown, row: ApprovalRequestDetail) => {
    const st = String(row.requestStatus).toUpperCase();
    const showResume = st === 'DRAFT';
    const showCancel = st === 'DRAFT' || st === 'WAIT' || st === 'PENDING';
    const showOfficialPreSendCancel = canSendOfficialDocument(row, authMemberId);
    if (!showResume && !showCancel && !showOfficialPreSendCancel) return null;
    return (
      <Space size="small" wrap onClick={(e) => e.stopPropagation()}>
        {showResume ? (
          <Button
            type="link"
            size="small"
            icon={<FolderOpenOutlined />}
            onClick={() => void openDraftForCompose(row.requestId)}
          >
            이어쓰기
          </Button>
        ) : null}
        {showCancel ? (
          <Button type="link" size="small" danger onClick={() => setCancelTarget(row)}>
            취소
          </Button>
        ) : null}
        {showOfficialPreSendCancel ? (
          <Button type="link" size="small" danger onClick={() => setCancelTarget(row)}>
            발송 취소
          </Button>
        ) : null}
      </Space>
    );
  };

  /** 공문 문서함(per-official) — 승인·미발송 시 관리 열을 `발송` / `취소` 버튼으로 표시 */
  const renderOfficialInboxActions = (_: unknown, row: ApprovalRequestDetail) => {
    if (canSendOfficialDocument(row, authMemberId)) {
      const rid = row.requestId;
      return (
        <Space size="small" wrap onClick={(e) => e.stopPropagation()}>
          <Popconfirm
            title="수신 부서로 공문을 발송할까요?"
            description="발송 후에는 문서를 취소할 수 없습니다."
            okText="발송"
            cancelText="닫기"
            onConfirm={() => void sendOfficialM.mutateAsync(rid)}
          >
            <Button
              type="primary"
              size="small"
              loading={sendOfficialM.isPending && sendOfficialM.variables === rid}
              disabled={cancelRequestM.isPending}
            >
              발송
            </Button>
          </Popconfirm>
          <Button
            danger
            size="small"
            loading={cancelRequestM.isPending && cancelTarget?.requestId === rid}
            disabled={sendOfficialM.isPending}
            onClick={() => setCancelTarget(row)}
          >
            취소
          </Button>
        </Space>
      );
    }
    return renderMyInboxActions(_, row);
  };

  const renderDraftInboxActions = (_: unknown, row: ApprovalRequestDetail) => {
    const st = String(row.requestStatus).toUpperCase();
    if (st !== 'DRAFT') return null;
    return (
      <Space size="small" wrap onClick={(e) => e.stopPropagation()}>
        <Button
          type="link"
          size="small"
          onClick={() => void openDraftForCompose(row.requestId)}
        >
          수정
        </Button>
        <Button type="link" size="small" danger onClick={() => setCancelTarget(row)}>
          삭제
        </Button>
      </Space>
    );
  };

  const myColumns = [
    {
      title: '제목',
      key: 'subject',
      width: 320,
      align: 'center' as const,
      ellipsis: true,
      render: (_: unknown, row: ApprovalRequestDetail) => getApprovalRequestSubjectLine(row) || '—',
    },
    {
      title: '양식',
      dataIndex: 'documentName',
      key: 'documentName',
      align: 'center' as const,
      ellipsis: true,
      render: (name: string | undefined) => name?.trim() || '—',
    },
    {
      title: '결재선',
      key: 'approvalLineStrip',
      width: 300,
      onCell: () => ({ className: '!tw-align-middle' }),
      onHeaderCell: () => ({ className: '!tw-text-center' }),
      render: (_: unknown, row: ApprovalRequestDetail) => (
        <PendingHomeApprovalLineStrip lines={row.approvalLines} visibleSlots={3} />
      ),
    },
    {
      title: '상태',
      dataIndex: 'requestStatus',
      key: 'requestStatus',
      width: 140,
      align: 'center' as const,
      render: (status: string) => statusTag(status),
    },
    {
      title: '기안일',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 180,
      align: 'center' as const,
      render: (v: string) => formatDateTime(v),
    },
    {
      title: '관리',
      key: 'actions',
      width: 140,
      align: 'center' as const,
      render: renderMyInboxActions,
    },
  ];

  const officialInboxColumns = [
    {
      title: '양식',
      dataIndex: 'documentName',
      key: 'documentName',
      ellipsis: true,
    },
    {
      title: '공문 번호',
      key: 'documentNumber',
      width: 130,
      render: (_: unknown, row: ApprovalRequestDetail) => {
        const st = String(row.requestStatus).toUpperCase();
        const num = row.documentNumber?.trim();
        if (st === 'APPROVED' && num) return num;
        return <Typography.Text type="secondary">발번 전</Typography.Text>;
      },
    },
    {
      title: '상태',
      dataIndex: 'requestStatus',
      key: 'requestStatus',
      width: 120,
      render: (status: string) => statusTag(status),
    },
    {
      title: '발신 부서',
      dataIndex: 'requesterOrganizationName',
      key: 'requesterOrganizationName',
      ellipsis: true,
      render: (v: string | undefined) => v?.trim() || '—',
    },
    {
      title: '수신 부서',
      key: 'recipients',
      ellipsis: true,
      render: (_: unknown, row: ApprovalRequestDetail) => formatOfficialRecipientsSummary(row),
    },
    {
      title: '기안일',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 170,
      render: (v: string) => formatDateTime(v),
    },
    {
      title: '관리',
      key: 'actions',
      width: 240,
      render: renderOfficialInboxActions,
    },
  ];

  const draftInboxColumns = [
    {
      title: '제목',
      key: 'subject',
      ellipsis: true,
      render: (_: unknown, row: ApprovalRequestDetail) => getApprovalRequestSubjectLine(row) || '—',
    },
    {
      title: '양식',
      dataIndex: 'documentName',
      key: 'documentName',
      ellipsis: true,
      render: (name: string | undefined) => name?.trim() || '—',
    },
    {
      title: '최종 저장시간',
      dataIndex: 'updatedAt',
      key: 'updatedAt',
      width: 180,
      render: (v: string) => formatDateTime(v),
    },
    {
      title: '관리',
      key: 'actions',
      width: 160,
      render: renderDraftInboxActions,
    },
  ];

  /** 승인 시 게이트웨이와 동일한 직위 ID 우선(멤버 상세와 불일치할 수 있음) */
  const myPositionIdForProxy =
    getRefreshIdentityHeaders()['X-User-MemberPositionId']?.trim() ||
    drafterProfile?.memberPositionId?.trim();

  const pendingColumns = [
    {
      title: '양식',
      dataIndex: 'documentName',
      key: 'documentName',
    },
    {
      title: '유형',
      key: 'reqKind',
      width: 76,
      render: (_: unknown, row: ApprovalRequestDetail) =>
        String(row.requestType).toUpperCase() === 'OFFICIAL' ? <Tag color="blue">공문</Tag> : '—',
    },
    {
      title: '구분',
      key: 'proxyKind',
      width: 88,
      render: (_: unknown, row: ApprovalRequestDetail) => {
        const myLine = row.approvalLines.find((l) => String(l.approvalStatus).toUpperCase() === 'PENDING');
        if (!myLine) return '—';
        return isPendingApprovalLineForProxyActor(myLine, myPositionIdForProxy) ? (
          <Tag color="purple">대결</Tag>
        ) : (
          <Tag>직접</Tag>
        );
      },
    },
    {
      title: '요청 상태',
      dataIndex: 'requestStatus',
      key: 'requestStatus',
      width: 130,
      render: (status: string) => statusTag(status),
    },
    {
      title: '내 결재선',
      key: 'myLine',
      width: 150,
      render: (_: unknown, row: ApprovalRequestDetail) => {
        const myLine = row.approvalLines.find((l) => String(l.approvalStatus).toUpperCase() === 'PENDING');
        if (!myLine) return '—';
        return `${myLine.stepOrder}단계`;
      },
    },
    {
      title: '관리',
      key: 'actions',
      width: 200,
      render: (_: unknown, row: ApprovalRequestDetail) => {
        const myLine = row.approvalLines.find((l) => String(l.approvalStatus).toUpperCase() === 'PENDING');
        return (
          <Space size="small" wrap onClick={(e) => e.stopPropagation()}>
            <Button
              type="primary"
              size="small"
              disabled={!myLine}
              onClick={() => myLine && setApprovalAction({ approvalId: myLine.approvalId, mode: 'approve' })}
            >
              승인
            </Button>
            <Button
              danger
              size="small"
              disabled={!myLine}
              onClick={() => myLine && setApprovalAction({ approvalId: myLine.approvalId, mode: 'reject' })}
            >
              반려
            </Button>
          </Space>
        );
      },
    },
  ];

  /** 참조(CC)·공람(CIRCULATION) 각각 — 채널 열 없음 */
  const viewerCcOnlyColumns: ColumnsType<ApprovalRequestDetail> = useMemo(
    () => [
      {
        title: '제목',
        key: 'subject',
        ellipsis: true,
        render: (_: unknown, row: ApprovalRequestDetail) => getApprovalRequestSubjectLine(row) || '—',
      },
      { title: '양식', dataIndex: 'documentName', key: 'documentName', ellipsis: true },
      {
        title: '기안자(부서)',
        key: 'drafter',
        ellipsis: true,
        render: (_: unknown, row: ApprovalRequestDetail) => {
          const name = row.requesterName?.trim() || '—';
          const org = row.requesterOrganizationName?.trim() || '—';
          return `${name} (${org})`;
        },
      },
      {
        title: '열람',
        key: 'read',
        width: 88,
        render: (_: unknown, row: ApprovalRequestDetail) =>
          unreadViewerForMember(row, authMemberId) ? <Tag color="error">미열람</Tag> : <Tag>열람</Tag>,
      },
      {
        title: '기안일',
        dataIndex: 'createdAt',
        key: 'createdAt',
        width: 180,
        render: (v: string) => formatDateTime(v),
      },
    ],
    [authMemberId],
  );

  const viewerInboxTabKey = routeSearch.viewerSub === 'circ' ? 'circ' : 'cc';

  const navigateViewerInboxTab = (key: string) => {
    navigate({
      to: '/app/approvals',
      search: (prev) => ({
        ...(prev as Record<string, string | undefined>),
        tab: 'my',
        box: 'per-viewers',
        viewerSub: key === 'circ' ? 'circ' : undefined,
        ...(isEmbedComposeModal ? { embed: APPROVAL_EMBED_QUERY } : { embed: undefined }),
      }),
      replace: true,
    });
  };

  const renderOrgMemberPicker = () => (
    <Card size="small" title="조직도" variant="borderless" className={APPROVAL_COMPOSE_CARD_CLASS}>
      <Input
        value={memberKeyword}
        onChange={(e) => setMemberKeyword(e.target.value)}
        placeholder="이름, 직위, 부서 검색"
        className="tw-mb-2"
      />
      <div className="tw-max-h-[min(52vh,420px)] tw-overflow-auto tw-rounded-md tw-border tw-border-slate-100 tw-bg-white tw-p-1">
        <Tree
          showLine
          blockNode
          expandAction="click"
          treeData={orgTreeDataWithMembers}
          expandedKeys={orgTreeExpandedKeys}
          onExpand={(keys) => setOrgTreeExpandedKeys(keys)}
          selectedKeys={
            orgTreeSelectedKey && !String(orgTreeSelectedKey).startsWith('member:') ? [orgTreeSelectedKey] : []
          }
          onSelect={(keys) => {
            const key = typeof keys[0] === 'string' ? keys[0] : undefined;
            if (!key) {
              setOrgTreeSelectedKey(undefined);
              return;
            }
            if (key.startsWith('member:')) {
              const rest = key.slice('member:'.length);
              const ci = rest.indexOf(':');
              const memberId = ci === -1 ? '' : rest.slice(ci + 1);
              if (memberId) void addFromOrgPickerByCurrentTab({ kind: 'member', memberId });
              setOrgTreeSelectedKey(undefined);
              return;
            }
            setOrgTreeSelectedKey(key);
            void addFromOrgPickerByCurrentTab({ kind: 'org', organizationId: key });
          }}
          titleRender={(nodeData) => {
            const key = String(nodeData.key);
            const isMember = key.startsWith('member:');
            const dragPayload = isMember
              ? (() => {
                  const rest = key.slice('member:'.length);
                  const ci = rest.indexOf(':');
                  const memberId = ci === -1 ? '' : rest.slice(ci + 1);
                  return { kind: 'member' as const, memberId };
                })()
              : { kind: 'org' as const, organizationId: key };
            return (
              <span
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData(APPROVAL_ORG_DRAG_MIME, JSON.stringify(dragPayload));
                  e.dataTransfer.effectAllowed = 'copy';
                }}
                className="tw-inline-flex tw-cursor-grab tw-select-none tw-items-center tw-gap-1"
              >
                {nodeData.title as ReactNode}
              </span>
            );
          }}
        />
      </div>
      <Typography.Paragraph type="secondary" className="!tw-mb-2 !tw-mt-2 !tw-text-xs">
        조직·멤버 노드를 클릭하거나 오른쪽 목록으로 드래그해 추가하세요. 조직 이름을 클릭하면 하위 부서와 소속 멤버가 펼쳐집니다. 오른쪽에는 조직 단위로 표시되며, 제출 시 해당 조직(하위 부서 포함) 소속 멤버 전원에게 반영됩니다.
      </Typography.Paragraph>
      <Divider className="!tw-my-3" />
      <Typography.Text type="secondary" className="tw-mb-2 tw-block tw-text-xs">
        검색 결과 (드래그하여 추가)
      </Typography.Text>
      <Space direction="vertical" className="tw-w-full" size={6}>
        {memberKeyword.trim() ? (
          orgPickerSearchMatches.length ? (
            orgPickerSearchMatches.map((m) => (
              <div
                key={m.memberId}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData(
                    APPROVAL_ORG_DRAG_MIME,
                    JSON.stringify({ kind: 'member' as const, memberId: m.memberId }),
                  );
                  e.dataTransfer.effectAllowed = 'copy';
                }}
                onClick={() => void addFromOrgPickerByCurrentTab({ kind: 'member', memberId: m.memberId })}
                className="tw-flex tw-cursor-grab tw-select-none tw-items-center tw-rounded-lg tw-bg-slate-50/70 tw-px-2 tw-py-1.5 tw-transition-colors hover:tw-bg-slate-100/80"
              >
                <span className="tw-truncate tw-pr-2 tw-text-sm">
                  {m.name} {m.jobTitleName ? `(${m.jobTitleName})` : ''}
                  <span className="tw-text-slate-500"> · {m.organizationName}</span>
                </span>
              </div>
            ))
          ) : (
            <Typography.Text type="secondary" className="tw-text-xs">
              검색 결과가 없습니다.
            </Typography.Text>
          )
        ) : (
          <Typography.Text type="secondary" className="tw-text-xs">
            이름·직위·부서로 검색한 결과를 드래그하거나, 트리에서 바로 드래그하세요.
          </Typography.Text>
        )}
      </Space>
    </Card>
  );

  const renderViewerListPanel = (viewerType: ViewerType) => {
    const list = viewerType === 'CC' ? ccViewers : circulationViewers;
    const setList = viewerType === 'CC' ? setCcViewers : setCirculationViewers;
    const title = viewerType === 'CC' ? '참조자 목록' : '공람자 목록';
    return (
      <Card size="small" title={title} variant="borderless" className={APPROVAL_COMPOSE_CARD_CLASS}>
        <Table<ViewerDraft>
          rowKey={(row) => (row.kind === 'org' ? row.id : row.viewerMemberId)}
          size="small"
          bordered={false}
          pagination={false}
          dataSource={list}
          locale={{ emptyText: '추가된 멤버가 없습니다.' }}
          className={APPROVAL_COMPOSE_TABLE_CLASS}
          columns={[
            {
              title: '타입',
              key: 'kind',
              width: 90,
              render: (_, row) =>
                row.kind === 'org' ? (
                  <Tag color="green">조직</Tag>
                ) : (
                  <Tag color={viewerType === 'CC' ? 'default' : 'blue'}>{viewerType === 'CC' ? '참조' : '공람'}</Tag>
                ),
            },
            {
              title: '이름',
              key: 'name',
              render: (_, row) =>
                row.kind === 'org' ? (
                  <span>
                    {row.organizationName} ({row.members.length}명)
                  </span>
                ) : (
                  <span>
                    {row.name} {row.jobTitleName ? `(${row.jobTitleName})` : ''}
                  </span>
                ),
            },
            {
              title: '부서',
              key: 'organizationName',
              width: 140,
              render: (_, row) => (row.kind === 'org' ? row.organizationName : row.organizationName || '—'),
            },
            {
              title: '관리',
              key: 'actions',
              width: 80,
              render: (_, row) => (
                <Button
                  type="text"
                  size="small"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={() =>
                    setList((prev) =>
                      prev.filter((x) =>
                        row.kind === 'org'
                          ? !(x.kind === 'org' && x.id === row.id)
                          : !(x.kind === 'member' && x.viewerMemberId === row.viewerMemberId),
                      ),
                    )
                  }
                />
              ),
            },
          ]}
        />
      </Card>
    );
  };

  const viewerSectionWithOrg = (viewerType: ViewerType, opts?: { stacked?: boolean }) => {
    const desc =
      viewerType === 'CC'
        ? '결재 진행과 관계없이 바로 열람할 수 있는 참조자(CC)입니다. 조직도에서 조직·멤버를 오른쪽 목록으로 드래그해 추가하세요.'
        : '최종 승인 완료 후 열람할 수 있는 공람자입니다. 조직도에서 조직·멤버를 오른쪽 목록으로 드래그해 추가하세요.';
    const gridClass = opts?.stacked
      ? 'tw-grid tw-grid-cols-1 tw-gap-4'
      : 'tw-grid tw-grid-cols-1 tw-gap-4 lg:tw-grid-cols-[320px_minmax(0,1fr)]';
    return (
      <Space direction="vertical" size={12} className="tw-w-full">
        <Typography.Paragraph type="secondary" className="!tw-mb-0 !tw-text-sm">
          {desc}
        </Typography.Paragraph>
        <div className={gridClass}>
          {renderOrgMemberPicker()}
          <ApprovalOrgDropZone
            onDropMember={(id) => void addViewerFromOrg(id, viewerType)}
            onDropOrg={(oid) => void bulkAddViewersFromOrg(oid, viewerType)}
          >
            {renderViewerListPanel(viewerType)}
          </ApprovalOrgDropZone>
        </div>
      </Space>
    );
  };

  const composeApprovalInfoAsideClass =
    'tw-w-full tw-shrink-0 lg:tw-sticky lg:tw-top-6 lg:tw-self-start lg:tw-w-[min(100%,400px)] xl:tw-w-[420px]';

  const openComposeApprovalModal = (t?: 'approval' | 'cc' | 'circulation') => {
    if (t) setLineInfoTab(t);
    setComposeApprovalInfoModalOpen(true);
  };

  const reloadPolicyApprovalLine = () => {
    if (!selectedDocument?.documentId) return;
    void qc.invalidateQueries({ queryKey: ['approval', 'policy-lines', 'candidates', selectedDocument.documentId] });
    message.info('정책 기본 결재선을 다시 불러옵니다.');
  };

  const viewerInitial = (name: string) => (name.trim().charAt(0) || '?').toUpperCase();

  const sidebarDrafterName = drafterProfile?.name?.trim() || user?.name?.trim() || '—';
  const sidebarDrafterOrg = drafterProfile?.organizationName?.trim() || user?.departmentName?.trim() || '—';
  const sidebarDrafterTitle = drafterProfile?.jobTitleName?.trim() || user?.jobTitle?.trim() || '';

  const composeToolbarGhostBtn =
    '!tw-inline-flex !tw-h-8 !tw-items-center !tw-gap-1 !tw-rounded-sm !tw-border-0 !tw-bg-transparent !tw-px-2 !tw-text-sm !tw-font-normal !tw-text-[#111827] !tw-shadow-none hover:!tw-bg-black/[0.04] disabled:!tw-opacity-50';

  const renderComposeToolbar = (opts?: { showDocumentTitle?: boolean }) => {
    const showTitle = opts?.showDocumentTitle ?? false;
    return (
      <div className="tw-mb-2 tw-flex tw-flex-wrap tw-items-center tw-justify-between tw-gap-2 tw-bg-white tw-px-3 tw-py-2">
        <Space wrap size={[4, 6]} className="!tw-items-center">
          {composeEditingRequestId ? (
            <Tag color="gold" className="!tw-m-0 !tw-text-xs">
              임시저장 수정 중
            </Tag>
          ) : null}
          {composeEditingRequestId ? (
            <Button type="text" size="small" className={composeToolbarGhostBtn} onClick={() => resetComposeToNew()}>
              새 작성
            </Button>
          ) : null}
          <Button type="text" size="small" className={composeToolbarGhostBtn} onClick={() => reloadPolicyApprovalLine()}>
            자동결재선
          </Button>
        </Space>
        <div className="tw-flex tw-flex-wrap tw-items-center tw-gap-x-3 tw-gap-y-2">
          {showTitle && selectedDocument ? (
            <Typography.Text type="secondary" className="!tw-mr-1 !tw-max-w-[10rem] !tw-truncate !tw-text-xs !tw-text-[#666] sm:!tw-max-w-[14rem]">
              {formatApprovalDocumentName(selectedDocument.documentName)}
            </Typography.Text>
          ) : null}
          <Button
            type="text"
            size="small"
            disabled={composeSaving}
            icon={<SaveOutlined className="tw-text-[13px] tw-text-[#333]" />}
            className={composeToolbarGhostBtn}
            onClick={() => void submitCompose('DRAFT')}
          >
            임시저장
          </Button>
          <Button
            type="text"
            size="small"
            disabled={composeSaving}
            icon={<FormOutlined className="tw-text-[13px] tw-text-[#333]" />}
            className={composeToolbarGhostBtn}
            onClick={() => void submitCompose('WAIT')}
          >
            결재요청
          </Button>
        </div>
      </div>
    );
  };

  const renderComposeDocumentSidebar = (opts?: { variant?: 'card' | 'flush' }) => {
    const variant = opts?.variant ?? 'card';
    return (
    <div
      className={clsx(
        composeApprovalInfoAsideClass,
        variant === 'flush'
          ? 'tw-flex tw-h-full tw-min-h-0 tw-flex-col tw-overflow-hidden tw-rounded-lg tw-border tw-border-[#e0e0e0] tw-bg-white tw-shadow-[0_1px_6px_rgba(0,0,0,0.06)]'
          : 'tw-overflow-hidden tw-rounded-xl tw-border tw-border-slate-200 tw-bg-white tw-shadow-[0_1px_4px_rgba(15,23,42,0.06)]',
      )}
    >
      <div className="tw-flex tw-items-center tw-justify-between tw-border-b tw-border-[#e5e7eb] tw-bg-white tw-px-3 tw-py-3">
        <Typography.Text strong className="!tw-text-sm !tw-text-[#111827]">
          결재정보
        </Typography.Text>
        <Button
          type="text"
          size="small"
          className="!tw-flex !tw-h-8 !tw-w-8 !tw-items-center !tw-justify-center !tw-text-[#6b7280]"
          icon={<MoreOutlined className="tw-text-lg tw-rotate-90" />}
        />
      </div>
      <div className={clsx('tw-p-2 sm:tw-p-3', variant === 'flush' ? 'tw-flex tw-min-h-0 tw-flex-1 tw-flex-col tw-bg-[#f5f6f8]' : 'tw-bg-[#f5f6f8]')}>
        <Tabs
          size="small"
          activeKey={composeSidebarTab}
          onChange={(k) => setComposeSidebarTab(k as 'line' | 'doc')}
          tabBarStyle={{ marginBottom: 8 }}
          items={[
            {
              key: 'line',
              label: '결재선',
              children: (
                <div className="tw-space-y-2">
                  <>
                      <button
                        type="button"
                        onClick={() => openComposeApprovalModal('approval')}
                        className="tw-w-full tw-overflow-hidden tw-rounded-lg tw-border tw-border-slate-200 tw-bg-white tw-p-0 tw-text-left tw-shadow-sm tw-transition-colors hover:tw-bg-slate-50 focus:tw-outline-none focus-visible:tw-ring-2 focus-visible:tw-ring-blue-400"
                      >
                        <div className="tw-flex tw-gap-3 tw-p-3">
                          <Avatar className="tw-h-12 tw-w-12 tw-shrink-0 tw-bg-slate-400 tw-text-base" src={drafterProfile?.profileUrl ?? undefined}>
                            {viewerInitial(sidebarDrafterName)}
                          </Avatar>
                          <div className="tw-min-w-0 tw-flex-1">
                            <Typography.Text strong className="!tw-block !tw-text-sm !tw-text-[#111827]">
                              {sidebarDrafterName}
                              {sidebarDrafterTitle ? ` ${sidebarDrafterTitle}` : ''}
                            </Typography.Text>
                            <Typography.Text type="secondary" className="!tw-mt-0.5 !tw-block !tw-text-xs !tw-text-[#666]">
                              {sidebarDrafterOrg}
                            </Typography.Text>
                          </div>
                        </div>
                        <div className="tw-border-t tw-border-slate-100 tw-bg-[#f2f2f2] tw-px-3 tw-py-2 tw-text-center tw-text-xs tw-text-[#888]">
                          기안
                        </div>
                      </button>
                      {orderedApprovalLineDrafts.length === 0 ? (
                        <div className="tw-rounded-lg tw-border tw-border-dashed tw-border-slate-300 tw-bg-white tw-px-3 tw-py-4 tw-text-center tw-text-sm tw-text-slate-500">
                          결재자를 지정하지 않았습니다. 클릭하여 조직도에서 추가하세요.
                        </div>
                      ) : (
                        orderedApprovalLineDrafts.map((row) => (
                          <button
                            key={row.id}
                            type="button"
                            onClick={() => openComposeApprovalModal('approval')}
                            className="tw-w-full tw-rounded-lg tw-border tw-border-slate-200 tw-bg-white tw-p-3 tw-text-left tw-shadow-sm tw-transition-colors hover:tw-bg-slate-50 focus:tw-outline-none focus-visible:tw-ring-2 focus-visible:tw-ring-blue-400"
                          >
                            <div className="tw-flex tw-gap-3">
                              <Avatar className="tw-h-11 tw-w-11 tw-shrink-0 tw-bg-slate-400 tw-text-base">
                                {row.kind === 'org' ? viewerInitial(row.organizationName) : viewerInitial(row.memberName)}
                              </Avatar>
                              <div className="tw-min-w-0 tw-flex-1">
                                <Typography.Text strong className="!tw-block !tw-text-sm">
                                  {row.kind === 'org'
                                    ? `${row.organizationName} (${row.members.length}명)`
                                    : `${row.memberName}${row.jobTitleName ? ` ${row.jobTitleName}` : ''}`}
                                </Typography.Text>
                                <Typography.Text type="secondary" className="!tw-mt-0.5 !tw-block !tw-text-xs">
                                  {row.kind === 'org' ? '조직' : row.organizationName || '—'}
                                </Typography.Text>
                                <Typography.Text type="secondary" className="!tw-mt-1 !tw-block !tw-text-[11px] tw-text-slate-400">
                                  결재 예정 · {row.stepOrder}단계
                                </Typography.Text>
                              </div>
                            </div>
                          </button>
                        ))
                      )}
                      <div className="tw-border-t tw-border-slate-200/90 tw-pt-2">
                        <Button
                          type="link"
                          size="small"
                          className="!tw-h-auto !tw-p-0 !tw-text-left !tw-text-xs"
                          onClick={() => openComposeApprovalModal('cc')}
                        >
                          참조자 {countViewerDraftMembers(ccViewers)}명
                        </Button>
                      </div>
                  </>
                </div>
              ),
            },
            {
              key: 'doc',
              label: '문서정보',
              children: selectedDocument ? (
                <div className="tw-space-y-3">
                  <Descriptions size="small" column={1} bordered className="!tw-bg-white">
                    <Descriptions.Item label="양식명">
                      {formatApprovalDocumentName(selectedDocument.documentName)}
                    </Descriptions.Item>
                    <Descriptions.Item label="유형">
                      {REQUEST_TYPE_LABEL[normalizeApprovalRequestType(selectedDocument.requestType)]}
                    </Descriptions.Item>
                    <Descriptions.Item label="기안자">{sidebarDrafterName}</Descriptions.Item>
                    <Descriptions.Item label="소속">{sidebarDrafterOrg}</Descriptions.Item>
                  </Descriptions>
                  <Divider className="!tw-my-1" />
                  <Typography.Text strong className="!tw-text-xs !tw-text-slate-700">
                    참조
                  </Typography.Text>
                  <div className="tw-space-y-2">
                    {countViewerDraftMembers(ccViewers) === 0 ? (
                      <div className="tw-rounded-lg tw-border tw-border-dashed tw-border-slate-300 tw-bg-white tw-py-4 tw-text-center tw-text-xs tw-text-slate-500">
                        참조자 없음
                      </div>
                    ) : (
                      ccViewers.map((v) =>
                        v.kind === 'org' ? (
                          <div
                            key={v.id}
                            className="tw-flex tw-gap-2 tw-rounded-lg tw-border tw-border-slate-200 tw-bg-white tw-p-2 tw-shadow-sm"
                          >
                            <Avatar size="small" className="tw-shrink-0 tw-bg-slate-400">
                              {viewerInitial(v.organizationName)}
                            </Avatar>
                            <div className="tw-min-w-0">
                              <Typography.Text strong className="!tw-text-xs">
                                {v.organizationName} ({v.members.length}명)
                              </Typography.Text>
                              <Typography.Text type="secondary" className="!tw-mt-0.5 !tw-block !tw-text-[11px]">
                                조직
                              </Typography.Text>
                            </div>
                          </div>
                        ) : (
                          <div
                            key={v.viewerMemberId}
                            className="tw-flex tw-gap-2 tw-rounded-lg tw-border tw-border-slate-200 tw-bg-white tw-p-2 tw-shadow-sm"
                          >
                            <Avatar size="small" className="tw-shrink-0 tw-bg-slate-400">
                              {viewerInitial(v.name)}
                            </Avatar>
                            <div className="tw-min-w-0">
                              <Typography.Text strong className="!tw-text-xs">
                                {v.name}
                                {v.jobTitleName ? ` ${v.jobTitleName}` : ''}
                              </Typography.Text>
                              <Typography.Text type="secondary" className="!tw-mt-0.5 !tw-block !tw-text-[11px]">
                                {v.organizationName || '—'}
                              </Typography.Text>
                            </div>
                          </div>
                        ),
                      )
                    )}
                  </div>
                  <Button type="link" size="small" className="!tw-h-auto !tw-p-0 !tw-text-xs" onClick={() => openComposeApprovalModal('cc')}>
                    참조자 편집
                  </Button>
                  <Divider className="!tw-my-1" />
                  <Typography.Text strong className="!tw-text-xs !tw-text-slate-700">
                    공람
                  </Typography.Text>
                  <Typography.Text type="secondary" className="!tw-mb-1 !tw-block !tw-text-[11px]">
                    공람자는 제출 후 열람합니다. 결재 정보에서 지정합니다.
                  </Typography.Text>
                  <div className="tw-space-y-2">
                    {countViewerDraftMembers(circulationViewers) === 0 ? (
                      <div className="tw-rounded-lg tw-border tw-border-dashed tw-border-slate-300 tw-bg-white tw-py-4 tw-text-center tw-text-xs tw-text-slate-500">
                        공람자 없음
                      </div>
                    ) : (
                      circulationViewers.map((v) =>
                        v.kind === 'org' ? (
                          <div
                            key={v.id}
                            className="tw-flex tw-gap-2 tw-rounded-lg tw-border tw-border-slate-200 tw-bg-white tw-p-2 tw-shadow-sm"
                          >
                            <Avatar size="small" className="tw-shrink-0 tw-bg-slate-400">
                              {viewerInitial(v.organizationName)}
                            </Avatar>
                            <div className="tw-min-w-0">
                              <Typography.Text strong className="!tw-text-xs">
                                {v.organizationName} ({v.members.length}명)
                              </Typography.Text>
                              <Typography.Text type="secondary" className="!tw-mt-0.5 !tw-block !tw-text-[11px]">
                                조직
                              </Typography.Text>
                            </div>
                          </div>
                        ) : (
                          <div
                            key={v.viewerMemberId}
                            className="tw-flex tw-gap-2 tw-rounded-lg tw-border tw-border-slate-200 tw-bg-white tw-p-2 tw-shadow-sm"
                          >
                            <Avatar size="small" className="tw-shrink-0 tw-bg-slate-400">
                              {viewerInitial(v.name)}
                            </Avatar>
                            <div className="tw-min-w-0">
                              <Typography.Text strong className="!tw-text-xs">
                                {v.name}
                                {v.jobTitleName ? ` ${v.jobTitleName}` : ''}
                              </Typography.Text>
                              <Typography.Text type="secondary" className="!tw-mt-0.5 !tw-block !tw-text-[11px]">
                                {v.organizationName || '—'}
                              </Typography.Text>
                            </div>
                          </div>
                        ),
                      )
                    )}
                  </div>
                  <Button type="link" size="small" className="!tw-h-auto !tw-p-0 !tw-text-xs" onClick={() => openComposeApprovalModal('circulation')}>
                    공람자 편집
                  </Button>
                  <Divider className="!tw-my-1" />
                  <Typography.Text strong className="!tw-mb-1 !tw-block !tw-text-xs !tw-text-slate-700">
                    변경이력
                  </Typography.Text>
                  <Typography.Paragraph type="secondary" className="!tw-mb-0 !tw-text-xs">
                    작성 중인 문서에는 변경 이력이 없습니다. 제출 후 상세에서 확인할 수 있습니다.
                  </Typography.Paragraph>
                </div>
              ) : null,
            },
          ]}
        />
      </div>
    </div>
    );
  };

  const renderComposeApprovalLineTable = () => (
    <Card size="small" title="내 결재선" variant="borderless" className={APPROVAL_COMPOSE_CARD_CLASS}>
      <DndContext sensors={approvalLineSensors} collisionDetection={closestCenter} onDragEnd={onApprovalLineDragEnd}>
        <SortableContext items={approvalLineSortableIds} strategy={verticalListSortingStrategy}>
          <Table<ApprovalLineDraft>
            rowKey="id"
            size="small"
            bordered={false}
            pagination={false}
            dataSource={orderedApprovalLineDrafts}
            locale={{ emptyText: '결재선이 없습니다.' }}
            className={APPROVAL_COMPOSE_TABLE_CLASS}
            components={{ body: { row: SortableApprovalTableRow } }}
            columns={[
              {
                title: '타입',
                key: 'type',
                width: 72,
                render: (_, row) =>
                  row.kind === 'org' ? <Tag color="green">조직</Tag> : <Tag color="blue">결재</Tag>,
              },
              { title: '순서', dataIndex: 'stepOrder', key: 'stepOrder', width: 56 },
              {
                title: '이름',
                key: 'approver',
                render: (_, row) =>
                  row.kind === 'org' ? (
                    <span className="tw-whitespace-nowrap [word-break:keep-all]">
                      {row.organizationName} ({row.members.length}명)
                    </span>
                  ) : row.source === 'policy' && row.policyCandidates && row.policyCandidates.length > 1 ? (
                    <Select
                      size="small"
                      className="tw-min-w-[14rem] tw-max-w-[min(100%,22rem)]"
                      value={row.approverMemberPositionId}
                      options={row.policyCandidates.map((c) => ({
                        value: c.memberPositionId,
                        label: `${c.memberName} · ${c.organizationName?.trim() || '—'}${
                          c.jobTitleName?.trim() ? ` (${c.jobTitleName.trim()})` : ''
                        }`,
                      }))}
                      onChange={(pid) => applyPolicyCandidateChoice(row.id, pid)}
                    />
                  ) : (
                    <span className="tw-whitespace-nowrap [word-break:keep-all]">
                      {row.memberName}
                      {row.jobTitleName ? ` ${row.jobTitleName}` : ''}
                    </span>
                  ),
              },
              {
                title: '부서',
                key: 'organizationName',
                width: 120,
                render: (_, row) => (row.kind === 'org' ? row.organizationName : row.organizationName || '—'),
              },
              {
                title: '관리',
                key: 'actions',
                width: 88,
                align: 'center',
                render: (_, row) => {
                  const policyLocked = row.kind === 'member' && row.source === 'policy';
                  const deleteBtn = (
                    <Button
                      type="text"
                      size="small"
                      danger
                      disabled={policyLocked}
                      icon={<DeleteOutlined />}
                      onClick={() =>
                        setApprovalLineDrafts((prev) =>
                          syncStepOrder(prev.filter((item) => item.id !== row.id)),
                        )
                      }
                    />
                  );
                  return (
                    <Space size={4} align="center">
                      <ApprovalLineDragHandle />
                      {policyLocked ? (
                        <Tooltip title="정책에서 지정된 결재 단계는 삭제할 수 없습니다. 후보가 여러 명이면 이름 열에서 선택하세요.">
                          <span className="tw-inline-flex">{deleteBtn}</span>
                        </Tooltip>
                      ) : (
                        deleteBtn
                      )}
                    </Space>
                  );
                },
              },
            ]}
          />
        </SortableContext>
      </DndContext>
    </Card>
  );

  const renderComposeApprovalInfoContent = (opts: { stacked: boolean }) => {
    const stacked = opts.stacked;
    const approvalGridClass = stacked
      ? 'tw-flex tw-flex-col tw-gap-4'
      : 'tw-grid tw-grid-cols-1 tw-gap-4 lg:tw-grid-cols-[minmax(260px,300px)_minmax(0,1fr)]';
    return (
      <Tabs
        size="small"
        activeKey={lineInfoTab}
        onChange={(k) => setLineInfoTab(k as 'approval' | 'cc' | 'circulation')}
        items={[
          {
            key: 'approval',
            label: '결재선',
            children: (
              <>
                <Typography.Paragraph type="secondary" className="!tw-mb-3 !tw-text-sm">
                  정책라인 결재선을 기본으로 불러옴십니다. 조직도에서 멤버·조직을 오른쪽 목록으로 드래그해 추가하고, 관리 열의 드래그 핸들로 순서를 조정하세요.
                </Typography.Paragraph>
                <div className={approvalGridClass}>
                  {renderOrgMemberPicker()}
                  <ApprovalOrgDropZone
                    onDropMember={(id) => void addApproverFromOrg(id)}
                    onDropOrg={(oid) => void bulkAddApproversFromOrg(oid)}
                  >
                    {renderComposeApprovalLineTable()}
                  </ApprovalOrgDropZone>
                </div>
              </>
            ),
          },
          {
            key: 'cc',
            label: '참조자',
            children: viewerSectionWithOrg('CC', { stacked }),
          },
          {
            key: 'circulation',
            label: '공람자',
            children: viewerSectionWithOrg('CIRCULATION', { stacked }),
          },
        ]}
      />
    );
  };

  const isComposeHubEntry = tab === 'compose' && routeSearch.sideNav === 'request-compose';
  const composePhaseView = isComposeHubEntry ? 'select' : composePhase;
  const showComposeWorkbench =
    composePhaseView === 'fill' && selectedDocument != null && selectedSchema.fields.length > 0;

  const pageTitle =
    tab === 'compose'
      ? isComposeHubEntry
        ? '전자결재'
        : '결재 요청 작성'
      : tab === 'admin' && canAdmin
        ? '결재 관리자'
        : guideBox
          ? APPROVAL_GUIDE_BOX_LABEL[guideBox]
          : '내 결재함';
  const pageDescription =
    tab === 'compose'
      ? isComposeHubEntry
        ? '결재 대기, 진행 문서, 공문 알림을 한눈에 확인하고 바로 작성하세요.'
        : '양식을 선택하고 결재선을 구성한 뒤 기안을 제출합니다.'
      : tab === 'admin' && canAdmin
        ? '양식 옵션(활성·부서 문서함 노출)과 결재 순서(직책/단계)를 설정합니다.'
        : guideBox
          ? '내 결재함'
          : '왼쪽 메뉴에서 문서함을 선택하면 목록이 표시됩니다.';

  if (tab === 'admin' && !canAdmin) {
    return <Navigate to="/app/approvals" search={{ tab: 'compose' }} replace />;
  }

  const renderHomeDocListCard = (
    title: string,
    rows: ApprovalRequestDetail[],
    emptyText: string,
    options?: {
      accent?: 'slate' | 'blue';
      actionLabel?: string;
      onAction?: (row: ApprovalRequestDetail) => void;
      cardClassName?: string;
      onFullClick?: () => void;
      /** 「전체」모달 iframe — 해당 카드에 맞는 문서함만 로드 */
      fullListEmbed: { panel: ComposeHomeEmbedPanel };
    },
  ) => {
    const accentClass =
      options?.accent === 'blue' ? 'tw-bg-blue-50/60 tw-border-blue-100' : 'tw-bg-slate-50/80 tw-border-slate-200';
    return (
      <Card className={clsx(APPROVAL_HOME_GRID_DOC_CARD_CLASS, options?.cardClassName)}>
        <div className="tw-mb-3 tw-flex tw-items-center tw-justify-between">
          <Typography.Text strong>{title}</Typography.Text>
          <Button
            type="link"
            size="small"
            onClick={() => {
              if (options?.onFullClick) {
                options.onFullClick();
                return;
              }
              if (!options?.fullListEmbed) return;
              setComposeHomeMoreModal({ kind: 'iframe', panel: options.fullListEmbed.panel });
            }}
          >
            전체
          </Button>
        </div>
        {rows.length === 0 ? (
          <Typography.Text type="secondary">{emptyText}</Typography.Text>
        ) : (
          <div className={APPROVAL_HOME_DOC_LIST_SCROLL}>
            <Space direction="vertical" size={8} className="tw-w-full">
              {rows.slice(0, 20).map((row) => (
                <div
                  key={row.requestId}
                  className={`tw-flex tw-items-center tw-justify-between tw-gap-2 tw-rounded-lg tw-border tw-px-3 tw-py-2 ${accentClass} ${
                    options?.onAction ? '' : 'tw-cursor-pointer tw-transition-colors hover:tw-bg-white/60'
                  }`}
                  onClick={
                    options?.onAction
                      ? undefined
                      : () => {
                          setSelectedRequestId(row.requestId);
                        }
                  }
                  role={options?.onAction ? undefined : 'button'}
                  tabIndex={options?.onAction ? undefined : 0}
                  onKeyDown={
                    options?.onAction
                      ? undefined
                      : (e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setSelectedRequestId(row.requestId);
                          }
                        }
                  }
                >
                  <div className="tw-min-w-0">
                    <Typography.Text strong className="!tw-block tw-truncate">
                      {row.documentName || '—'}
                    </Typography.Text>
                    <Typography.Text type="secondary" className="!tw-block tw-text-xs">
                      {(row.requesterName || '요청자 미상')} · {formatDateTime(row.updatedAt || row.createdAt)}
                    </Typography.Text>
                  </div>
                  {options?.onAction ? (
                    <Button
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation();
                        options.onAction?.(row);
                      }}
                    >
                      {options.actionLabel || '보기'}
                    </Button>
                  ) : null}
                </div>
              ))}
            </Space>
          </div>
        )}
      </Card>
    );
  };

  const renderHomeApprovalFormsCard = () => {
    const accentClass = 'tw-bg-slate-50/80 tw-border-slate-200';
    return (
      <Card className={APPROVAL_HOME_COMPOSE_FORMS_CARD_CLASS}>
        <div className="tw-mb-3 tw-flex tw-items-center tw-justify-between tw-gap-2">
          <Typography.Text strong className="tw-min-w-0">
            결재 양식
          </Typography.Text>
          <Button
            type="primary"
            size="small"
            className="!tw-h-8 !tw-min-w-[5.5rem] !tw-shrink-0 !tw-rounded-lg !tw-px-3 !tw-text-sm !tw-font-semibold tw-shadow-sm"
            onClick={() => {
              setComposeFormSelectInitialId(undefined);
              setComposeFormSelectModalOpen(true);
            }}
          >
            결재 생성
          </Button>
        </div>
        {docsLoading ? (
          <div
            className={clsx(
              APPROVAL_HOME_TOP_ROW_MATCH_SCROLL,
              'tw-flex tw-items-center tw-justify-center tw-py-4',
            )}
          >
            <Spin />
          </div>
        ) : composeHubVisibleDocuments.length === 0 ? (
          <div
            className={clsx(
              APPROVAL_HOME_TOP_ROW_MATCH_SCROLL,
              'tw-flex tw-items-center tw-justify-center tw-py-4',
            )}
          >
            <Typography.Text type="secondary">사용 가능한 활성 양식이 없습니다.</Typography.Text>
          </div>
        ) : (
          <div className={APPROVAL_HOME_TOP_ROW_MATCH_SCROLL}>
            <Space direction="vertical" size={8} className="tw-w-full">
              {composeHubVisibleDocuments.map((doc) => {
                const cat = normalizeApprovalRequestType(doc.requestType);
                return (
                  <div
                    key={doc.documentId}
                    role="button"
                    tabIndex={0}
                    className={`tw-flex tw-cursor-pointer tw-items-center tw-justify-between tw-gap-2 tw-rounded-lg tw-border tw-px-3 tw-py-2 ${accentClass} tw-transition-colors hover:tw-bg-white/60`}
                    onClick={() => {
                      setComposeFormSelectInitialId(doc.documentId);
                      setComposeFormSelectModalOpen(true);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setComposeFormSelectInitialId(doc.documentId);
                        setComposeFormSelectModalOpen(true);
                      }
                    }}
                  >
                    <div className="tw-min-w-0">
                      <Typography.Text strong className="!tw-block tw-truncate">
                        {doc.documentName?.trim() || '—'}
                      </Typography.Text>
                      <Typography.Text type="secondary" className="!tw-block tw-text-xs">
                        {REQUEST_TYPE_LABEL[cat]} · {cat}
                      </Typography.Text>
                    </div>
                  </div>
                );
              })}
            </Space>
          </div>
        )}
      </Card>
    );
  };

  const renderComposeHomeDashboard = () => {
    const viewerMergedRows = mergeRequestsByRequestId([viewerCcRequests, viewerCirculationRequests]);

    const composeHomePendingTable = (rows: ApprovalRequestDetail[]) => (
      <table className="tw-w-full tw-table-fixed tw-border-collapse tw-text-center">
        <colgroup>
          <col className="tw-w-[100px]" />
          <col />
          <col className="tw-w-24" />
          <col className="tw-w-[min(15rem,28vw)]" />
          <col className="tw-w-[120px]" />
          <col className="tw-w-[140px]" />
        </colgroup>
        <thead>
          <tr className="tw-border-b tw-border-slate-200">
            <th scope="col" className="tw-pb-2 tw-px-2 tw-text-xs tw-font-semibold tw-text-slate-500">
              문서 상태
            </th>
            <th scope="col" className="tw-pb-2 tw-px-2 tw-text-xs tw-font-semibold tw-text-slate-500">
              제목
            </th>
            <th scope="col" className="tw-pb-2 tw-px-2 tw-text-xs tw-font-semibold tw-text-slate-500">
              요청자
            </th>
            <th scope="col" className="tw-pb-2 tw-px-2 tw-text-center tw-text-xs tw-font-semibold tw-text-slate-500">
              결재선
            </th>
            <th scope="col" className="tw-pb-2 tw-px-2 tw-text-xs tw-font-semibold tw-text-slate-500">
              기안일
            </th>
            <th scope="col" className="tw-pb-2 tw-px-2 tw-text-xs tw-font-semibold tw-text-slate-500">
              결재 처리
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={6} className="tw-border tw-border-dashed tw-border-slate-200 tw-bg-slate-50/50 tw-p-6 tw-text-center">
                <Typography.Text type="secondary">결재 대기 문서가 없습니다.</Typography.Text>
              </td>
            </tr>
          ) : (
            rows.map((row) => {
              const myLine = row.approvalLines.find((l) => String(l.approvalStatus).toUpperCase() === 'PENDING');
              return (
              <tr key={row.requestId} className="tw-border-b tw-border-slate-200 tw-bg-white">
                <td className="tw-px-2 tw-py-2.5 tw-align-middle">
                  <div className="tw-flex tw-justify-center">
                    <Tag color="gold" className="!tw-m-0">
                      결재대기
                    </Tag>
                  </div>
                </td>
                <td className="tw-min-w-0 tw-px-2 tw-py-2.5 tw-align-middle">
                  <Typography.Text strong className="!tw-block tw-min-w-0 tw-truncate tw-text-center">
                    {getApprovalRequestSubjectLine(row) || row.documentName?.trim() || '—'}
                  </Typography.Text>
                </td>
                <td className="tw-px-2 tw-py-2.5 tw-align-middle">
                  <Typography.Text type="secondary" className="!tw-block tw-truncate tw-text-center tw-text-xs">
                    {row.requesterName || '요청자 미상'}
                  </Typography.Text>
                </td>
                <td className="tw-min-w-0 tw-overflow-hidden tw-px-2 tw-py-2 tw-text-left tw-align-middle">
                  <PendingHomeApprovalLineStrip lines={row.approvalLines} visibleSlots={2} />
                </td>
                <td className="tw-px-2 tw-py-2.5 tw-align-middle">
                  <Typography.Text className="tw-text-center tw-text-xs tw-text-slate-500">
                    {formatDateTime(row.createdAt)}
                  </Typography.Text>
                </td>
                <td className="tw-px-2 tw-py-2.5 tw-align-middle">
                  <div className="tw-flex tw-flex-wrap tw-items-center tw-justify-center tw-gap-2">
                    <Button
                      type="primary"
                      size="small"
                      disabled={!myLine}
                      onClick={() => {
                        if (!myLine) return;
                        setApprovalAction({ approvalId: myLine.approvalId, mode: 'approve' });
                      }}
                    >
                      승인
                    </Button>
                    <Button danger size="small" disabled={!myLine} onClick={() => {
                        if (!myLine) return;
                        setApprovalAction({ approvalId: myLine.approvalId, mode: 'reject' });
                      }}>
                      반려
                    </Button>
                  </div>
                </td>
              </tr>
              );
            })
          )}
        </tbody>
      </table>
    );

    return (
      <div className="tw-space-y-4">
        <div className="tw-grid tw-grid-cols-1 tw-items-start tw-gap-4 xl:tw-grid-cols-3">
          <div className="tw-min-w-0 tw-w-full xl:tw-col-span-2">
            <Card className="tw-w-full tw-rounded-2xl tw-border tw-border-slate-200/90 tw-shadow-sm tw-shadow-slate-900/5">
            <div className="tw-mb-3 tw-flex tw-items-center tw-justify-between">
              <Typography.Text strong>결재 대기 문서 리스트</Typography.Text>
              <Button
                type="link"
                size="small"
                onClick={() =>
                  setComposeHomeMoreModal({
                    kind: 'pending-inbox',
                    title: '결재 대기 문서 전체',
                  })
                }
              >
                전체
              </Button>
            </div>
            <div className={APPROVAL_HOME_TOP_ROW_MATCH_SCROLL}>
              {composeHomePendingTable(pendingRequests.slice(0, 20))}
            </div>
            </Card>
          </div>
          <div className="tw-min-w-0 tw-w-full xl:tw-col-span-1 xl:tw-shrink-0 xl:tw-self-start">
            {renderHomeApprovalFormsCard()}
          </div>
        </div>

        <div className="tw-grid tw-grid-cols-1 tw-gap-4 md:tw-grid-cols-2 xl:tw-grid-cols-3">
          {renderHomeDocListCard('내 기안 문서함', myRequestsAllForSummary, '기안 문서가 없습니다.', {
            fullListEmbed: { panel: 'my-all' },
          })}
          {renderHomeDocListCard('참조/공람 문서', viewerMergedRows, '참조/공람 문서가 없습니다.', {
            fullListEmbed: { panel: 'viewers' },
          })}
          {renderHomeDocListCard(
            '부서 문서함',
            homeDepartmentRequests,
            myOrganizationIdForDept ? '부서 문서가 없습니다.' : '조직 정보가 없어 부서 문서함을 불러올 수 없습니다.',
            {
              fullListEmbed: { panel: 'department' },
            },
          )}
          {renderHomeDocListCard('공문 문서함', homeOfficialSentRequests, '공문 문서가 없습니다.', {
            fullListEmbed: { panel: 'official' },
          })}
          {renderHomeDocListCard(
            '임시 저장 문서',
            myDraftRequests,
            '임시 저장 문서가 없습니다.',
            {
              accent: 'blue',
              actionLabel: '이어쓰기',
              onAction: (row) => void openDraftForCompose(row.requestId),
              fullListEmbed: { panel: 'draft' },
            },
          )}
          <Card className={APPROVAL_HOME_GRID_DOC_CARD_CLASS}>
            <div className="tw-mb-3 tw-flex tw-items-center tw-justify-between">
              <Typography.Text strong>부재 위임</Typography.Text>
              <Button
                type="link"
                size="small"
                onClick={() => setComposeHomeMoreModal({ kind: 'iframe', panel: 'absence' })}
              >
                전체
              </Button>
            </div>
            {homeAbsenceMinePreview.length === 0 && homeAbsenceDelegatedPreview.length === 0 ? (
              <Typography.Text type="secondary">
                내가 등록한 위임과 나에게 위임된 일정이 없습니다.
              </Typography.Text>
            ) : (
              <div className={APPROVAL_HOME_CARD_SCROLL}>
                <Space direction="vertical" size={12} className="tw-w-full">
                  {homeAbsenceMinePreview.length > 0 ? (
                    <div className="tw-w-full tw-space-y-2">
                      <Typography.Text type="secondary" className="!tw-text-xs">
                        내가 등록한 위임
                      </Typography.Text>
                      <Space direction="vertical" size={8} className="tw-w-full">
                        {homeAbsenceMinePreview.map((row) => {
                          const accentClass = 'tw-bg-slate-50/80 tw-border-slate-200';
                          const sid = row.substituteId?.trim() ?? '';
                          const substituteName = absenceHubMemberNameById.get(sid) || '대결자';
                          return (
                            <div
                              key={`mine-${row.proxyId}`}
                              className={`tw-flex tw-items-center tw-justify-between tw-gap-2 tw-rounded-lg tw-border tw-px-3 tw-py-2 ${accentClass}`}
                            >
                              <div className="tw-min-w-0">
                                <div className="tw-flex tw-flex-wrap tw-items-center tw-gap-2">
                                  <Typography.Text strong className="!tw-block tw-truncate">
                                    대결: {substituteName}
                                  </Typography.Text>
                                  {absenceProxyDashboardTag(row)}
                                </div>
                                <Typography.Text type="secondary" className="!tw-block tw-text-xs">
                                  {formatAbsenceProxyRange(row.startDate, row.endDate)}
                                </Typography.Text>
                              </div>
                              <Button
                                size="small"
                                onClick={() =>
                                  navigate({
                                    to: '/app/approvals/absence-proxy',
                                    search: { ...embedSearchSuffix },
                                    replace: true,
                                  })
                                }
                              >
                                보기
                              </Button>
                            </div>
                          );
                        })}
                      </Space>
                    </div>
                  ) : null}
                  {homeAbsenceDelegatedPreview.length > 0 ? (
                    <div className="tw-w-full tw-space-y-2">
                      <Typography.Text type="secondary" className="!tw-text-xs">
                        나에게 위임된 목록
                      </Typography.Text>
                      <Space direction="vertical" size={8} className="tw-w-full">
                        {homeAbsenceDelegatedPreview.map((row) => {
                          const accentClass = 'tw-bg-slate-50/80 tw-border-slate-200';
                          const mid = row.memberId?.trim() ?? '';
                          const absentName = absenceHubMemberNameById.get(mid) || '부재자';
                          return (
                            <div
                              key={`delegated-${row.proxyId}`}
                              className={`tw-flex tw-items-center tw-justify-between tw-gap-2 tw-rounded-lg tw-border tw-px-3 tw-py-2 ${accentClass}`}
                            >
                              <div className="tw-min-w-0">
                                <div className="tw-flex tw-flex-wrap tw-items-center tw-gap-2">
                                  <Typography.Text strong className="!tw-block tw-truncate">
                                    부재자: {absentName}
                                  </Typography.Text>
                                  {absenceProxyDashboardTag(row)}
                                </div>
                                <Typography.Text type="secondary" className="!tw-block tw-text-xs">
                                  {formatAbsenceProxyRange(row.startDate, row.endDate)}
                                </Typography.Text>
                              </div>
                              <Button
                                size="small"
                                onClick={() =>
                                  navigate({
                                    to: '/app/approvals/absence-proxy',
                                    search: { ...embedSearchSuffix },
                                    replace: true,
                                  })
                                }
                              >
                                보기
                              </Button>
                            </div>
                          );
                        })}
                      </Space>
                    </div>
                  ) : null}
                </Space>
              </div>
            )}
          </Card>
        </div>

        <Modal
          title={composeHomeMoreModal?.kind === 'pending-inbox' ? composeHomeMoreModal.title : null}
          open={composeHomeMoreModal != null}
          onCancel={() => setComposeHomeMoreModal(null)}
          footer={null}
          width={1120}
          destroyOnHidden
        style={{ top: 48 }}
          styles={{
            content: {
              height: 820,
              maxHeight: '90vh',
              resize: 'both',
              display: 'flex',
              flexDirection: 'column',
              padding: 0,
              overflow: 'auto',
            },
            header: { flexShrink: 0, marginBottom: 0, padding: '12px 16px' },
            body: { flex: 1, minHeight: 0, padding: 0, overflow: 'hidden' },
          }}
        >
          {composeHomeMoreModal?.kind === 'pending-inbox' ? (
            <PendingApprovalInboxModalContent
              myMemberId={authMemberId}
              myMemberPositionId={drafterProfile?.memberPositionId?.trim()}
              onOpenDetail={(requestId) => setSelectedRequestId(requestId)}
              onStartApprove={(approvalId) => setApprovalAction({ approvalId, mode: 'approve' })}
              onStartReject={(approvalId) => setApprovalAction({ approvalId, mode: 'reject' })}
            />
          ) : composeHomeMoreModal?.kind === 'iframe' ? (
            <iframe
              key={composeHomeMoreModal.panel}
              title="전자결재 문서함"
              src={composeHomeEmbedPanelUrl(composeHomeMoreModal.panel)}
              className="tw-h-full tw-min-h-0 tw-w-full tw-border-0"
            />
          ) : null}
        </Modal>

        <ApprovalFormSelectModal
          open={composeFormSelectModalOpen}
          onCancel={() => {
            setComposeFormSelectModalOpen(false);
            setComposeFormSelectInitialId(undefined);
          }}
          documents={activeDocuments}
          loading={docsLoading}
          initialDocumentId={composeFormSelectInitialId}
          onConfirm={handleApprovalFormSelectConfirm}
        />
      </div>
    );
  };

  return (
    <div
      className={clsx(
        'tw-w-full',
        isEmbedComposeModal
          ? 'tw-flex tw-h-full tw-min-h-0 tw-flex-col tw-gap-4 tw-overflow-y-auto'
          : 'tw-flex tw-flex-col tw-gap-4',
      )}
    >
      <div className={clsx(isEmbedComposeModal && 'tw-flex-shrink-0')}>
        <div className="tw-flex tw-items-center tw-gap-2">
          {!onComposeHub && !isEmbedComposeModal && tab !== 'admin' ? (
            <Button
              type="text"
              icon={<ArrowLeftOutlined />}
              aria-label="전자결재로 돌아가기"
              className="!tw-shrink-0 !tw-text-slate-600 hover:!tw-text-slate-900"
              onClick={() =>
                navigate({
                  to: '/app/approvals',
                  search: { tab: 'compose', sideNav: 'request-compose' },
                  replace: true,
                })
              }
            />
          ) : null}
          <Typography.Title level={4} className="!tw-m-0 !tw-text-slate-900">
            {pageTitle}
          </Typography.Title>
        </div>
        <Typography.Paragraph type="secondary" className="!tw-mb-0 !tw-mt-1 !tw-text-sm">
          {pageDescription}
        </Typography.Paragraph>
      </div>

      {/* `Form.useForm()`은 항상 살아 있는데, 실제 <Form>은 작성 워크벤치(tab=compose·비허브)에서만 마운트되어 경고가 난다. 비표시 시 숨김 Form으로 인스턴스만 연결한다. */}
      {!(tab === 'compose' && !isComposeHubEntry) ? (
        <Form form={form} preserve={false} className="tw-hidden" aria-hidden />
      ) : null}

      {tab === 'compose' && isComposeHubEntry ? (
        renderComposeHomeDashboard()
      ) : tab === 'compose' ? (
        <Card
          className={clsx(
            'tw-border-slate-200/80 tw-shadow-sm',
            showComposeWorkbench && '!tw-rounded-lg tw-border-slate-300 !tw-p-0 tw-shadow-md',
          )}
          styles={{ body: { padding: showComposeWorkbench ? 0 : undefined } }}
        >
          <Form
            form={form}
            layout="vertical"
            initialValues={{ content: {} }}
            onValuesChange={(changed) => {
              if (composeDraftHydratingRef.current) return;
              if ('documentId' in changed) {
                setComposeEditingRequestId(null);
                setApprovalLineDrafts([]);
                setOrgTreeSelectedKey(undefined);
                setCcViewers([]);
                setCirculationViewers([]);
                setOfficialRecipients([]);
                setComposeDeptVisibleYn('Y');
                form.setFieldValue('content', {});
                const nextDocId =
                  typeof changed.documentId === 'string' && changed.documentId.trim().length > 0
                    ? changed.documentId
                    : undefined;
                const nextDoc = nextDocId ? activeDocuments.find((d) => d.documentId === nextDocId) : undefined;
                setSelectedDocumentId(nextDocId);
                setComposeSidebarTab('line');
                setLineInfoTab('approval');
                void applyPolicyLineDrafts(nextDoc ?? null);
                return;
              }
              if (vacationLeaveKindField && familyEventSubtypeField) {
                const cv = changed as { content?: Record<string, unknown> };
                const chContent = cv.content;
                if (chContent && vacationLeaveKindField.name in chContent) {
                  const v = chContent[vacationLeaveKindField.name];
                  if (v !== APPROVAL_FAMILY_EVENT_LEAVE_KIND_OPTION) {
                    form.setFieldValue(['content', familyEventSubtypeField.name], undefined);
                  }
                }
              }
            }}
          >
            {!showComposeWorkbench ? (
              <Steps
                size="small"
                current={composePhaseView === 'select' ? 0 : 1}
                className="tw-mb-6"
                items={[
                  { title: '양식 선택', description: '카테고리·문서' },
                  { title: '작성·결재', description: '내용·결재선·참조' },
                ]}
              />
            ) : null}

            {composePhaseView === 'fill' && selectedDocument && !showComposeWorkbench
              ? renderComposeToolbar({ showDocumentTitle: true })
              : null}

            <Form.Item
              name="documentId"
              label={composePhaseView === 'select' ? '문서 양식' : undefined}
              rules={[{ required: true, message: '카테고리에서 양식을 선택해 주세요.' }]}
              style={composePhaseView === 'fill' ? { display: 'none' } : undefined}
            >
              {composePhaseView === 'select' ? (
                <DocumentFormPicker
                  documents={activeDocuments}
                  loading={docsLoading}
                  onAfterPick={(documentId, doc) => {
                    if (isComposeHubEntry) {
                      navigate({ to: '/app/approvals', search: { tab: 'compose', ...embedSearchSuffix }, replace: true });
                    }
                    setSelectedDocumentId(documentId);
                    setComposeSidebarTab('line');
                    setLineInfoTab('approval');
                    void applyPolicyLineDrafts(doc);
                    setComposePhase((p) => (p === 'select' ? 'fill' : p));
                    queueMicrotask(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
                  }}
                />
              ) : (
                <Input type="hidden" />
              )}
            </Form.Item>

            {composePhaseView === 'select' ? (
              <Typography.Paragraph type="secondary" className="!tw-mb-0 !tw-mt-4 !tw-text-center !tw-text-sm">
                양식을 누르면 작성·결재 화면으로 이동합니다.
              </Typography.Paragraph>
            ) : null}

            {composePhaseView === 'select' ? (
              <Card
                size="small"
                title={
                  <Space size={8}>
                    <FolderOpenOutlined />
                    <span>임시저장함</span>
                    {myDraftRequests.length > 0 ? (
                      <Tag color="gold" className="!tw-m-0">
                        {myDraftRequests.length}
                      </Tag>
                    ) : null}
                  </Space>
                }
                className="!tw-mt-4 tw-border-slate-200/90 tw-shadow-sm"
                styles={{ body: { padding: 12 } }}
              >
                {myDraftsLoading ? (
                  <div className="tw-flex tw-justify-center tw-py-6">
                    <Spin size="small" />
                  </div>
                ) : myDraftRequests.length === 0 ? (
                  <Typography.Text type="secondary" className="tw-text-xs">
                    저장된 임시 문서가 없습니다. 작성 중 &quot;임시저장&quot;하면 여기에서 이어서 작업할 수 있습니다.
                  </Typography.Text>
                ) : (
                  <ul className="tw-m-0 tw-list-none tw-space-y-2 tw-p-0">
                    {myDraftRequests.map((d) => (
                      <li
                        key={d.requestId}
                        className="tw-flex tw-flex-wrap tw-items-center tw-justify-between tw-gap-2 tw-rounded-lg tw-border tw-border-slate-100 tw-bg-slate-50/80 tw-px-3 tw-py-2"
                      >
                        <div className="tw-min-w-0 tw-flex-1">
                          <Typography.Text strong className="!tw-block tw-truncate tw-text-sm">
                            {d.documentName || '—'}
                          </Typography.Text>
                          <Typography.Text type="secondary" className="!tw-block tw-text-xs">
                            {formatDateTime(d.updatedAt || d.createdAt)}
                          </Typography.Text>
                        </div>
                        <Button
                          type="primary"
                          size="small"
                          icon={<FolderOpenOutlined />}
                          onClick={() => void openDraftForCompose(d.requestId)}
                        >
                          불러오기
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            ) : null}

            {composePhaseView === 'fill' && selectedDocument && selectedSchema.fields.length === 0 ? (
              <Alert type="warning" showIcon message="양식 스키마(formSchema)를 해석할 수 없거나 필드가 없습니다. 관리자에게 문의하거나 다른 양식을 선택해 주세요." />
            ) : null}

            {composePhaseView === 'fill' && selectedDocument && selectedSchema.fields.length > 0 ? (
              <div className="tw-flex tw-min-h-[min(100vh-220px,920px)] tw-flex-col tw-overflow-hidden lg:tw-flex-row lg:tw-items-stretch">
                <div className="tw-flex tw-min-h-0 tw-min-w-0 tw-flex-1 tw-flex-col tw-bg-white tw-p-2 sm:tw-p-3">
                  {renderComposeToolbar()}
                  <div className="tw-min-h-0 tw-flex-1 tw-overflow-auto tw-rounded-none tw-bg-white wf-scrollbar">
                    <div className="tw-flex tw-flex-col tw-gap-4 tw-p-2 sm:tw-p-3">
                      <ApprovalFormPaperLayout
                        documentName={formatApprovalDocumentName(selectedDocument.documentName)}
                        categoryLabel={
                          REQUEST_TYPE_LABEL[normalizeApprovalRequestType(selectedDocument.requestType)] ??
                          String(selectedDocument.requestType)
                        }
                        requestTypeCode={normalizeApprovalRequestType(selectedDocument.requestType)}
                        drafterName={drafterProfile?.name?.trim() || user?.name?.trim() || '—'}
                        drafterOrg={
                          drafterProfile?.organizationName?.trim() || user?.departmentName?.trim() || '—'
                        }
                        drafterJobTitle={
                          drafterProfile?.jobTitleName?.trim() || user?.jobTitle?.trim() || undefined
                        }
                        writtenDate={dayjs().format('YYYY-MM-DD')}
                        stampColumn={
                          <ApprovalFormStampColumn
                            drafterName={drafterProfile?.name?.trim() || user?.name?.trim() || '—'}
                            drafterJobTitle={
                              drafterProfile?.jobTitleName?.trim() || user?.jobTitle?.trim() || undefined
                            }
                            applicationWrittenDateIso={dayjs().format('YYYY-MM-DD')}
                            approvers={orderedApprovalLineDrafts.map((r) =>
                              r.kind === 'org'
                                ? {
                                    id: r.id,
                                    memberName: `${r.organizationName} (${r.members.length}명)`,
                                    jobTitleName: '조직',
                                  }
                                : {
                                    id: r.id,
                                    memberName: r.memberName,
                                    jobTitleName: r.jobTitleName,
                                  },
                            )}
                            onOpenEdit={() => openComposeApprovalModal('approval')}
                          />
                        }
                      >
                        {selectedSchema.fields
                          .filter(
                            (field) =>
                              !familyEventSubtypeField ||
                              field.name !== familyEventSubtypeField.name ||
                              showFamilyEventSubtypeInCompose,
                          )
                          .map((field) => {
                          const namePath: (string | number)[] = ['content', field.name];
                          const ph = field.placeholder;
                          const fieldLocked = field.locked === true;
                          const inputRules = fieldLocked
                            ? [{ required: true as const, message: `${field.label} 입력` }]
                            : [];
                          const selectRules = fieldLocked
                            ? [{ required: true as const, message: `${field.label} 선택` }]
                            : [];
                          if (field.type === 'textarea') {
                            return (
                              <ApprovalFormPaperFieldRow key={field.name} label={field.label} required={fieldLocked}>
                                <Form.Item name={namePath} rules={inputRules} className="!tw-mb-0">
                                  <Input.TextArea rows={4} className="!tw-max-w-full" placeholder={ph} />
                                </Form.Item>
                              </ApprovalFormPaperFieldRow>
                            );
                          }
                          if (field.type === 'number') {
                            return (
                              <ApprovalFormPaperFieldRow key={field.name} label={field.label} required={fieldLocked}>
                                <Form.Item name={namePath} rules={inputRules} className="!tw-mb-0">
                                  <Input type="number" className="!tw-max-w-xs" placeholder={ph} />
                                </Form.Item>
                              </ApprovalFormPaperFieldRow>
                            );
                          }
                          if (field.type === 'date') {
                            return (
                              <ApprovalFormPaperFieldRow key={field.name} label={field.label} required={fieldLocked}>
                                <Form.Item name={namePath} rules={inputRules} className="!tw-mb-0">
                                  <Input type="date" className="!tw-max-w-xs" />
                                </Form.Item>
                              </ApprovalFormPaperFieldRow>
                            );
                          }
                          if (field.type === 'datetime-local') {
                            return (
                              <ApprovalFormPaperFieldRow key={field.name} label={field.label} required={fieldLocked}>
                                <Form.Item name={namePath} rules={inputRules} className="!tw-mb-0">
                                  <Input type="datetime-local" className="!tw-max-w-xs" />
                                </Form.Item>
                              </ApprovalFormPaperFieldRow>
                            );
                          }
                          if (field.type === 'time') {
                            return (
                              <ApprovalFormPaperFieldRow key={field.name} label={field.label} required={fieldLocked}>
                                <Form.Item name={namePath} rules={inputRules} className="!tw-mb-0">
                                  <Input type="time" className="!tw-max-w-xs" step={60} />
                                </Form.Item>
                              </ApprovalFormPaperFieldRow>
                            );
                          }
                          if (field.type === 'select') {
                            return (
                              <ApprovalFormPaperFieldRow key={field.name} label={field.label} required={fieldLocked}>
                                <Form.Item name={namePath} rules={selectRules} className="!tw-mb-0">
                                  <Select
                                    className="!tw-max-w-md"
                                    placeholder={ph}
                                    options={(field.options ?? []).map((opt) => ({ value: opt, label: opt }))}
                                  />
                                </Form.Item>
                              </ApprovalFormPaperFieldRow>
                            );
                          }
                          return (
                            <ApprovalFormPaperFieldRow key={field.name} label={field.label} required={fieldLocked}>
                              <Form.Item name={namePath} rules={inputRules} className="!tw-mb-0">
                                <Input className="!tw-max-w-full" placeholder={ph} />
                              </Form.Item>
                            </ApprovalFormPaperFieldRow>
                          );
                        })}
                      </ApprovalFormPaperLayout>
                  {composeSelectedOfficial ? (
                    <Card size="small" title="수신 부서 (공문 필수)" className="tw-border-slate-200">
                        <Alert
                          type="info"
                          showIcon
                          className="tw-mb-3"
                          message="상신 시 수신 부서를 최소 1곳 지정해야 합니다. 부서명은 스냅샷으로 저장됩니다."
                        />
                        <Select
                          mode="multiple"
                          className="tw-w-full"
                          placeholder="조직도 기준 수신 부서를 검색·선택하세요"
                          options={officialOrgSelectOptions}
                          value={officialRecipients.map((r) => r.recipientOrganizationId)}
                          onChange={(ids: string[]) => {
                            const labelById = new Map(officialOrgSelectOptions.map((o) => [o.value, o.label]));
                            setOfficialRecipients(
                              ids.map((id) => ({
                                recipientOrganizationId: id,
                                recipientOrganizationName: labelById.get(id)?.trim() || id,
                              })),
                            );
                          }}
                          showSearch
                          optionFilterProp="label"
                        />
                    </Card>
                  ) : null}
                  <Card size="small" title="부서 문서함 공개" className="tw-border-slate-200">
                      <Space direction="vertical" size="small" className="tw-w-full">
                        <Typography.Paragraph type="secondary" className="!tw-mb-0 tw-text-sm">
                          켜두면 같은 부서 구성원이 부서 문서함에서 제목과 내용을 볼 수 있습니다. 끄면 작성자만 전체를 열람할 수 있고, 다른 부서원에게는 목록에서만 일부 정보가 표시됩니다.
                        </Typography.Paragraph>
                        <Space align="center">
                          <Switch
                            checked={composeSelectedOfficial ? true : composeDeptVisibleYn === 'Y'}
                            disabled={composeSelectedOfficial}
                            onChange={(checked) =>
                              setComposeDeptVisibleYn(checked ? 'Y' : 'N')
                            }
                            aria-label="부서 문서함에 공개"
                          />
                          <Typography.Text className="tw-text-sm">
                            {composeSelectedOfficial || composeDeptVisibleYn === 'Y' ? '공개' : '비공개'}
                          </Typography.Text>
                        </Space>
                        {composeSelectedOfficial ? (
                          <Alert
                            type="info"
                            showIcon
                            className="!tw-mb-0"
                            message="공문은 부서 문서함에 항상 공개됩니다."
                          />
                        ) : null}
                      </Space>
                  </Card>
                  {composeEditingRequestId ? (
                    <Alert
                      type="warning"
                      showIcon
                      className="tw-mb-3"
                      message="임시저장을 다시 저장하면 서버에서 기존 첨부가 비워질 수 있습니다. 저장 후 필요한 파일을 다시 올려 주세요."
                    />
                  ) : null}
                  <div className="tw-mt-3 tw-rounded-sm tw-border tw-border-dashed tw-border-slate-400 tw-bg-white tw-px-3 tw-py-4">
                    {composeAttachmentSlotsLeft > 0 ? (
                      <Upload.Dragger {...composeAttachmentDraggerProps} className="!tw-bg-transparent">
                        <p className="ant-upload-drag-icon">
                          <InboxOutlined />
                        </p>
                        <p className="ant-upload-text">클릭하거나 파일을 여기로 끌어다 놓으세요</p>
                        <p className="ant-upload-hint">
                          최대 {APPROVAL_ATTACHMENT_MAX_COUNT}개, 파일당 10MB 이하, 합계 50MB 이하 (jpg, png, pdf,
                          Office, hwp, zip 등)
                        </p>
                      </Upload.Dragger>
                    ) : (
                      <div
                        role="presentation"
                        className="tw-cursor-not-allowed tw-min-h-[5.5rem] tw-py-6 tw-text-center tw-opacity-70"
                        onClick={() =>
                          void message.warning(
                            `첨부는 최대 ${APPROVAL_ATTACHMENT_MAX_COUNT}개까지 등록할 수 있습니다.`,
                          )
                        }
                      >
                        <PaperClipOutlined className="tw-text-2xl tw-text-slate-400" />
                        <div className="tw-mt-2 tw-text-sm tw-leading-relaxed tw-text-[#333]">
                          첨부 슬롯이 가득 찼습니다.
                        </div>
                        <Typography.Paragraph type="secondary" className="!tw-mb-0 tw-mt-1 tw-text-xs">
                          최대 {APPROVAL_ATTACHMENT_MAX_COUNT}개, 파일당 10MB 이하, 합계 50MB 이하 (jpg, png, pdf, Office,
                          hwp, zip 등)
                        </Typography.Paragraph>
                      </div>
                    )}
                    {composeRemoteAttachmentsLoading ? (
                      <div className="tw-py-2 tw-text-center tw-text-sm tw-text-slate-500">첨부 목록 불러오는 중…</div>
                    ) : null}
                    {(composeRemoteAttachments.length > 0 || composeAttachmentFiles.length > 0) && (
                      <ul className="tw-mb-0 tw-mt-3 tw-list-none tw-space-y-2 tw-border-t tw-border-slate-200 tw-pt-3 tw-pl-0">
                        {composeRemoteAttachments.map((a) => (
                          <li
                            key={a.attachmentId}
                            className="tw-flex tw-flex-wrap tw-items-center tw-justify-between tw-gap-2 tw-text-sm"
                          >
                            <span className="tw-min-w-0 tw-truncate tw-text-slate-800" title={a.fileName}>
                              {a.fileName}
                            </span>
                            <Space size={8} wrap>
                              <Typography.Text type="secondary" className="tw-text-xs">
                                {formatApprovalAttachmentBytes(a.fileSize)}
                              </Typography.Text>
                              <Button
                                type="link"
                                size="small"
                                className="!tw-p-0"
                                onClick={() => window.open(a.approvalUrl, '_blank', 'noopener,noreferrer')}
                              >
                                다운로드
                              </Button>
                              <Button
                                type="link"
                                size="small"
                                danger
                                className="!tw-p-0"
                                loading={deleteComposeRemoteAttachmentM.isPending}
                                disabled={deleteComposeRemoteAttachmentM.isPending}
                                onClick={() => void deleteComposeRemoteAttachmentM.mutateAsync(a.attachmentId)}
                              >
                                삭제
                              </Button>
                            </Space>
                          </li>
                        ))}
                        {composeAttachmentFiles.map((f, idx) => (
                          <li
                            key={`${f.name}-${f.size}-${f.lastModified}-${idx}`}
                            className="tw-flex tw-flex-wrap tw-items-center tw-justify-between tw-gap-2 tw-text-sm"
                          >
                            <span className="tw-min-w-0 tw-truncate tw-text-slate-800" title={f.name}>
                              {f.name}{' '}
                              <Typography.Text type="secondary" className="tw-text-xs">
                                (저장 시 업로드)
                              </Typography.Text>
                            </span>
                            <Space size={8}>
                              <Typography.Text type="secondary" className="tw-text-xs">
                                {formatApprovalAttachmentBytes(f.size)}
                              </Typography.Text>
                              <Button
                                type="link"
                                size="small"
                                danger
                                className="!tw-p-0"
                                onClick={() =>
                                  setComposeAttachmentFiles((prev) => prev.filter((_, i) => i !== idx))
                                }
                              >
                                제거
                              </Button>
                            </Space>
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className="tw-mt-2 tw-text-center tw-text-xs tw-text-slate-500">
                      남은 첨부 슬롯 {composeAttachmentSlotsLeft}개
                    </div>
                  </div>
                  <div className="tw-mt-2 tw-flex tw-flex-wrap tw-items-center tw-gap-2 tw-rounded-sm tw-border tw-border-slate-300 tw-bg-white tw-px-3 tw-py-2">
                    <Typography.Text strong className="!tw-text-sm">
                      관련문서
                    </Typography.Text>
                    <Button
                      type="default"
                      size="small"
                      icon={<SearchOutlined />}
                      onClick={() => message.info('관련문서 검색은 추후 연동 예정입니다.')}
                    >
                      문서 검색
                    </Button>
                  </div>
                  <div className="tw-mt-2">{renderComposeToolbar()}</div>
                    </div>
                  </div>
                </div>
                <aside
                  className={clsx(
                    composeApprovalInfoAsideClass,
                    'tw-max-h-[50vh] tw-shrink-0 tw-overflow-hidden tw-border-t tw-border-[#e5e7eb] tw-bg-white tw-p-0 lg:tw-max-h-none lg:tw-self-stretch lg:tw-border-l lg:tw-border-t-0',
                  )}
                >
                  {renderComposeDocumentSidebar({ variant: 'flush' })}
                </aside>
              </div>
            ) : null}

            {composePhaseView === 'fill' && selectedDocument && selectedSchema.fields.length === 0 ? (
              <div className="tw-mb-4 tw-max-w-lg">{renderComposeDocumentSidebar()}</div>
            ) : null}

          </Form>
        </Card>
      ) : tab === 'admin' && canAdmin ? (
        <ApprovalsAdminPage />
      ) : (
        <div
          className={clsx(
            isEmbedComposeModal && 'tw-flex tw-min-h-0 tw-flex-1 tw-flex-col tw-overflow-hidden',
          )}
        >
          {tab === 'my' ? (
            <Card
              size="small"
              className={clsx(
                'tw-rounded-lg tw-border-slate-200/80 tw-shadow-sm',
                isEmbedComposeModal && 'tw-flex tw-min-h-0 tw-flex-1 tw-flex-col tw-overflow-hidden',
              )}
              styles={
                isEmbedComposeModal
                  ? { body: { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', padding: 16 } }
                  : undefined
              }
            >
              {isEmbedComposeModal ? (
                <div className="tw-flex tw-min-h-0 tw-flex-1 tw-flex-col tw-gap-4">
                  <div className="tw-flex tw-shrink-0 tw-flex-col tw-gap-3">
                    {guideBox === 'per-all' ? (
                      <Tabs
                        size="small"
                        className="[&_.ant-tabs-content]:tw-hidden [&_.ant-tabs-nav]:tw-mb-0"
                        activeKey={requestStatusFilter}
                        onChange={(k) => {
                          const next = k as 'ALL' | ApprovalRequestStatus;
                          navigate({
                            to: '/app/approvals',
                            search: {
                              tab: 'my',
                              box: 'per-all',
                              ...(next === 'ALL' ? {} : { myStatus: next }),
                              ...embedSearchSuffix,
                            },
                            replace: true,
                          });
                        }}
                        items={MY_INBOX_FILTER_TABS.map(({ key, label }) => ({ key, label }))}
                      />
                    ) : null}
                    {guideBox === 'per-official' ? (
                      <Tabs
                        size="small"
                        className="[&_.ant-tabs-content]:tw-hidden [&_.ant-tabs-nav]:tw-mb-0"
                        activeKey={requestStatusFilter}
                        onChange={(k) => {
                          const next = k as 'ALL' | ApprovalRequestStatus;
                          navigate({
                            to: '/app/approvals',
                            search: {
                              tab: 'my',
                              box: 'per-official',
                              ...(next === 'ALL' ? {} : { myStatus: next }),
                              ...embedSearchSuffix,
                            },
                            replace: true,
                          });
                        }}
                        items={OFFICIAL_INBOX_FILTER_TABS.map(({ key, label }) => ({ key, label }))}
                      />
                    ) : null}
                  </div>
                  <div className="tw-min-h-0 tw-flex-1 tw-overflow-auto">
                    {guideBox === 'per-viewers' ? (
                      <Tabs
                        size="small"
                        tabBarStyle={{ marginBottom: 12 }}
                        activeKey={viewerInboxTabKey}
                        onChange={navigateViewerInboxTab}
                        items={[
                          {
                            key: 'cc',
                            label: '참조',
                            children: (
                              <Table<ApprovalRequestDetail>
                                size="small"
                                rowKey="requestId"
                                loading={myTableLoading}
                                columns={viewerCcOnlyColumns}
                                dataSource={viewerCcRequests}
                                pagination={{ pageSize: 10 }}
                                onRow={(record) => ({
                                  onClick: () => setSelectedRequestId(record.requestId),
                                  style: { cursor: 'pointer' },
                                })}
                              />
                            ),
                          },
                          {
                            key: 'circ',
                            label: '공람',
                            children: (
                              <Table<ApprovalRequestDetail>
                                size="small"
                                rowKey="requestId"
                                loading={myTableLoading}
                                columns={viewerCcOnlyColumns}
                                dataSource={viewerCirculationRequests}
                                pagination={{ pageSize: 10 }}
                                onRow={(record) => ({
                                  onClick: () => setSelectedRequestId(record.requestId),
                                  style: { cursor: 'pointer' },
                                })}
                              />
                            ),
                          },
                        ]}
                      />
                    ) : (
                      <Table<ApprovalRequestDetail>
                        size="small"
                        rowKey="requestId"
                        loading={myTableLoading}
                        columns={
                          guideBox === 'per-official'
                            ? officialInboxColumns
                            : guideBox === 'per-draft'
                              ? draftInboxColumns
                              : myColumns
                        }
                        dataSource={myInboxRows}
                        pagination={{ pageSize: 10 }}
                        scroll={guideBox === 'per-official' ? { x: 'max-content' } : undefined}
                        onRow={(record) => ({
                          onClick: () => setSelectedRequestId(record.requestId),
                          style: { cursor: 'pointer' },
                        })}
                      />
                    )}
                  </div>
                </div>
              ) : (
                <>
                  {guideBox === 'per-all' ? (
                    <Tabs
                      size="small"
                      className="tw-mb-3 [&_.ant-tabs-content]:tw-hidden [&_.ant-tabs-nav]:tw-mb-0"
                      activeKey={requestStatusFilter}
                      onChange={(k) => {
                        const next = k as 'ALL' | ApprovalRequestStatus;
                        navigate({
                          to: '/app/approvals',
                          search: {
                            tab: 'my',
                            box: 'per-all',
                            ...(next === 'ALL' ? {} : { myStatus: next }),
                            ...embedSearchSuffix,
                          },
                          replace: true,
                        });
                      }}
                      items={MY_INBOX_FILTER_TABS.map(({ key, label }) => ({ key, label }))}
                    />
                  ) : null}
                  {guideBox === 'per-official' ? (
                    <Tabs
                      size="small"
                      className="tw-mb-3 [&_.ant-tabs-content]:tw-hidden [&_.ant-tabs-nav]:tw-mb-0"
                      activeKey={requestStatusFilter}
                      onChange={(k) => {
                        const next = k as 'ALL' | ApprovalRequestStatus;
                        navigate({
                          to: '/app/approvals',
                          search: {
                            tab: 'my',
                            box: 'per-official',
                            ...(next === 'ALL' ? {} : { myStatus: next }),
                            ...embedSearchSuffix,
                          },
                          replace: true,
                        });
                      }}
                      items={OFFICIAL_INBOX_FILTER_TABS.map(({ key, label }) => ({ key, label }))}
                    />
                  ) : null}
                  {guideBox === 'per-viewers' ? (
                    <Tabs
                      tabBarStyle={{ marginBottom: 12 }}
                      activeKey={viewerInboxTabKey}
                      onChange={navigateViewerInboxTab}
                      items={[
                        {
                          key: 'cc',
                          label: '참조',
                          children: (
                            <Table<ApprovalRequestDetail>
                              rowKey="requestId"
                              loading={myTableLoading}
                              columns={viewerCcOnlyColumns}
                              dataSource={viewerCcRequests}
                              pagination={{ pageSize: 10 }}
                              onRow={(record) => ({
                                onClick: () => setSelectedRequestId(record.requestId),
                                style: { cursor: 'pointer' },
                              })}
                            />
                          ),
                        },
                        {
                          key: 'circ',
                          label: '공람',
                          children: (
                            <Table<ApprovalRequestDetail>
                              rowKey="requestId"
                              loading={myTableLoading}
                              columns={viewerCcOnlyColumns}
                              dataSource={viewerCirculationRequests}
                              pagination={{ pageSize: 10 }}
                              onRow={(record) => ({
                                onClick: () => setSelectedRequestId(record.requestId),
                                style: { cursor: 'pointer' },
                              })}
                            />
                          ),
                        },
                      ]}
                    />
                  ) : (
                    <Table<ApprovalRequestDetail>
                      rowKey="requestId"
                      loading={myTableLoading}
                      columns={
                        guideBox === 'per-official'
                          ? officialInboxColumns
                          : guideBox === 'per-draft'
                            ? draftInboxColumns
                            : myColumns
                      }
                      dataSource={myInboxRows}
                      pagination={{ pageSize: 10 }}
                      scroll={guideBox === 'per-official' ? { x: 'max-content' } : undefined}
                      onRow={(record) => ({
                        onClick: () => setSelectedRequestId(record.requestId),
                        style: { cursor: 'pointer' },
                      })}
                    />
                  )}
                </>
              )}
            </Card>
          ) : null}
          {tab === 'pending' ? (
            <Card
              size="small"
              className={clsx(
                'tw-rounded-lg tw-border-slate-200/80 tw-shadow-sm',
                isEmbedComposeModal && 'tw-flex tw-min-h-0 tw-flex-1 tw-flex-col tw-overflow-hidden',
              )}
              styles={
                isEmbedComposeModal
                  ? { body: { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', padding: 16 } }
                  : undefined
              }
            >
              {(() => {
                const pendingTable = (
                  <Table<ApprovalRequestDetail>
                    size={isEmbedComposeModal ? 'small' : undefined}
                    rowKey="requestId"
                    loading={pendingTableLoading}
                    columns={pendingColumns}
                    dataSource={pendingInboxRows}
                    pagination={{ pageSize: 10 }}
                    onRow={(record) => ({
                      onClick: () => setSelectedRequestId(record.requestId),
                      style: { cursor: 'pointer' },
                    })}
                  />
                );
                return isEmbedComposeModal ? (
                  <div className="tw-min-h-0 tw-flex-1 tw-overflow-auto">{pendingTable}</div>
                ) : (
                  pendingTable
                );
              })()}
            </Card>
          ) : null}
          {tab === 'acted' ? (
            <Card
              size="small"
              className={clsx(
                'tw-rounded-lg tw-border-slate-200/80 tw-shadow-sm',
                isEmbedComposeModal && 'tw-flex tw-min-h-0 tw-flex-1 tw-flex-col tw-overflow-hidden',
              )}
              styles={
                isEmbedComposeModal
                  ? { body: { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', padding: 16 } }
                  : undefined
              }
            >
              {(() => {
                const actedTable = (
                  <Table<ApprovalRequestDetail>
                    size={isEmbedComposeModal ? 'small' : undefined}
                    rowKey="requestId"
                    loading={actedLoading}
                    columns={[
                      { title: '양식', dataIndex: 'documentName', key: 'documentName' },
                      {
                        title: '처리',
                        key: 'proxyAct',
                        width: 88,
                        render: (_: unknown, row: ApprovalRequestDetail) =>
                          requestIncludesMyProxyAct(row, {
                            myMemberId: authMemberId,
                            myMemberPositionId: myPositionIdForProxy,
                          }) ? (
                            <Tag color="purple">대결</Tag>
                          ) : (
                            <Tag>직접</Tag>
                          ),
                      },
                      {
                        title: '요청 상태',
                        dataIndex: 'requestStatus',
                        key: 'requestStatus',
                        width: 130,
                        render: (status: string) => statusTag(status),
                      },
                      {
                        title: '최종 수정일',
                        dataIndex: 'updatedAt',
                        key: 'updatedAt',
                        width: 180,
                        render: (v: string) => formatDateTime(v),
                      },
                    ]}
                    dataSource={actedRequests}
                    pagination={{ pageSize: 10 }}
                    onRow={(record) => ({
                      onClick: () => setSelectedRequestId(record.requestId),
                      style: { cursor: 'pointer' },
                    })}
                  />
                );
                return isEmbedComposeModal ? (
                  <div className="tw-min-h-0 tw-flex-1 tw-overflow-auto">{actedTable}</div>
                ) : (
                  actedTable
                );
              })()}
            </Card>
          ) : null}
        </div>
      )}


      <Modal
        title="미리보기"
        open={composePreviewOpen && composePhaseView === 'fill' && selectedDocument != null && tab === 'compose'}
        onCancel={() => setComposePreviewOpen(false)}
        footer={
          <Button type="primary" onClick={() => setComposePreviewOpen(false)}>
            닫기
          </Button>
        }
        width={720}
        style={{ top: 48 }}
        styles={{ content: { resize: 'both', overflow: 'auto' } }}
      >
        <Typography.Paragraph className="!tw-mb-2">
          <strong>{selectedDocument?.documentName}</strong>
        </Typography.Paragraph>
        <pre className="tw-max-h-[min(60vh,480px)] tw-overflow-auto tw-rounded-lg tw-border tw-border-slate-200 tw-bg-slate-50 tw-p-3 tw-text-xs tw-leading-relaxed">
          {JSON.stringify(form.getFieldsValue(), null, 2)}
        </pre>
      </Modal>

      <Modal
        title="결재 정보"
        open={
          composeApprovalInfoModalOpen && composePhaseView === 'fill' && selectedDocument != null && tab === 'compose'
        }
        onCancel={() => setComposeApprovalInfoModalOpen(false)}
        width={1000}
        style={{ top: 48 }}
        styles={{
          content: { resize: 'both', overflow: 'auto' },
          body: { maxHeight: 'min(72vh, 640px)', overflowY: 'auto', paddingTop: 8 },
        }}
        footer={
          <div className="tw-flex tw-w-full tw-justify-end tw-gap-2">
            <Button onClick={() => setComposeApprovalInfoModalOpen(false)}>취소</Button>
            <Button type="primary" onClick={() => setComposeApprovalInfoModalOpen(false)}>
              확인
            </Button>
          </div>
        }
        destroyOnHidden={false}
      >
        {selectedDocument ? renderComposeApprovalInfoContent({ stacked: false }) : null}
      </Modal>

      <ApprovalRequestReadOnlyModal
        requestId={selectedRequestId}
        onClose={() => {
          setSelectedRequestId(null);
          if (String(routeSearch.approvalRequestId ?? '').trim()) {
            navigate({
              to: '/app/approvals',
              search: (prev) => {
                const p = { ...(prev as Record<string, string | undefined>) };
                delete p.approvalRequestId;
                delete p.approvalModal;
                delete p.approvalOpenAt;
                return p;
              },
              replace: true,
            });
          }
        }}
      />

      <Modal
        title={
          cancelTarget && canSendOfficialDocument(cancelTarget, authMemberId)
            ? '공문 발송 취소'
            : '결재 취소'
        }
        open={cancelTarget != null}
        onCancel={() => {
          setCancelTarget(null);
          setCancelReason('');
        }}
        onOk={() => {
          if (!cancelTarget) return;
          if (!cancelReason.trim()) {
            message.warning('취소 사유를 입력해 주세요.');
            return;
          }
          void cancelRequestM.mutateAsync({ requestId: cancelTarget.requestId, reason: cancelReason.trim() });
        }}
        okText="취소 확정"
        cancelText="닫기"
        confirmLoading={cancelRequestM.isPending}
        style={{ top: 48 }}
        styles={{ content: { resize: 'both', overflow: 'auto' } }}
      >
        {cancelTarget && canSendOfficialDocument(cancelTarget, authMemberId) ? (
          <Typography.Paragraph type="secondary" className="!tw-mb-2 !tw-text-sm">
            승인된 공문이 수신 부서로 발송되기 전에만 취소할 수 있습니다.
          </Typography.Paragraph>
        ) : null}
        <Input.TextArea
          rows={4}
          value={cancelReason}
          onChange={(e) => setCancelReason(e.target.value)}
          placeholder="취소 사유를 입력하세요."
        />
      </Modal>

      <Modal
        title={approvalAction?.mode === 'approve' ? '승인 처리' : '반려 처리'}
        open={approvalAction != null}
        onCancel={() => {
          setApprovalAction(null);
          setApprovalComment('');
        }}
        onOk={() => {
          if (!approvalAction) return;
          if (approvalAction.mode === 'approve') {
            void approveM.mutateAsync({ approvalId: approvalAction.approvalId, comment: approvalComment.trim() || undefined });
            return;
          }
          if (!approvalComment.trim()) {
            message.warning('반려 사유를 입력해 주세요.');
            return;
          }
          void rejectM.mutateAsync({ approvalId: approvalAction.approvalId, comment: approvalComment.trim() });
        }}
        okText={approvalAction?.mode === 'approve' ? '승인' : '반려'}
        cancelText="닫기"
        confirmLoading={approveM.isPending || rejectM.isPending}
      >
        <Input.TextArea
          rows={4}
          value={approvalComment}
          onChange={(e) => setApprovalComment(e.target.value)}
          placeholder={approvalAction?.mode === 'approve' ? '승인 의견(선택)' : '반려 사유(필수)'}
        />
      </Modal>
    </div>
  );
}
