import { AppDataTable } from '@/shared/ui/AppDataTable';
import {
  ApartmentOutlined, ArrowLeftOutlined, CalendarOutlined, CarOutlined, CheckCircleFilled, ClockCircleOutlined, CloseCircleOutlined, DeleteOutlined, EyeOutlined, FileTextOutlined, FolderOpenOutlined, FormOutlined, InboxOutlined, MinusOutlined, PlusOutlined, PaperClipOutlined, SaveOutlined, SearchOutlined, SendOutlined, SettingOutlined, } from '@ant-design/icons';
import {
  DndContext, type DragEndEvent, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, } from '@dnd-kit/core';
import {
  SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy, } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert, App, Avatar, Button, Card, DatePicker, Descriptions, Divider, Empty, Form, Input, Popconfirm, Progress, Select, Space, Spin, Switch, Steps, Tabs, Tag, Tooltip, Tree, Typography, Upload } from 'antd';
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
  normalizeApprovalRequestType,
  type ApprovalDocument,
  type ApprovalPolicyLineCandidateMember,
  type ApprovalRequestType,
} from '@/features/approvals/api/approvalApi';
import { approvalRequestTypeLabelKo } from '@/features/approvals/lib/approvalRequestTypeKo';
import { absenceProxyApi, type AbsenceProxyRecord } from '@/features/approvals/api/absenceProxyApi';
import {
  ApprovalFormPaperFieldRow,
  ApprovalFormPaperLayout,
  ApprovalFormPaperStaticNoteRow,
  ApprovalFormStampColumn,
} from '@/features/approvals/ui/ApprovalFormPaperLayout';
import { ApprovalAiTranscribeField } from '@/features/approvals/ui/ApprovalAiTranscribeField';
import { PersonnelOrderItemsField } from '@/features/approvals/ui/PersonnelOrderItemsField';
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
  findMyInboxApprovalLine,
  isInlineSyntheticApprovalId,
  isPendingApprovalLineForProxyActor,
  requestIncludesMyProxyAct,
  type ApprovalLine,
  type ApprovalRequestDetail,
  type ApprovalViewer,
  type CreateApprovalRequestPayload,
  type ViewerType,
} from '@/features/approvals/api/approvalRequestApi';
import { memberApi } from '@/features/member/api/memberApi';
import { attendanceApi } from '@/features/salary-service/api/attendanceApi';
import { salaryApi } from '@/features/salary-service/api/salaryApi';
import type { FlexibleTimeSlot } from '@/features/salary-service/types';
import {
  buildOrgTreeWithMemberLeaves,
  flattenDirectMembersDeduped,
  type OrgPickerMemberRow,
} from '@/features/approvals/lib/approvalOrgTree';
import {
  APPROVAL_ORG_DRAG_MIME,
  ApprovalOrgDropZone,
} from '@/features/approvals/ui/ApprovalOrgDropZone';
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
  stripNonPersistedApprovalContentFields,
} from '@/features/approvals/lib/approvalFormSchema';
import { composeContentPatchWithDefaultTitle } from '@/features/approvals/lib/approvalComposeDefaultTitle';
import {
  APPROVAL_REQUEST_CHANGED_EVENT,
  APPROVAL_REQUEST_CHANGED_MESSAGE,
  invalidateApprovalRequestQueries,
  notifyApprovalRequestChanged,
  syncApprovalQueryCachesAfterAct,
} from '@/features/approvals/lib/syncApprovalQueryCaches';
import {
  APPROVAL_GUIDE_BOX_LABEL,
  mergeRequestsByRequestId,
  resolveGuideBox,
  type ApprovalGuideBox,
} from '@/features/approvals/lib/approvalGuideNav';
import { ApprovalFormSelectModal } from '@/features/approvals/ui/ApprovalFormSelectModal';
import { ApprovalLineMiniStrip } from '@/features/approvals/ui/ApprovalLineMiniStrip';
import { ApprovalRequestReadOnlyModal } from '@/features/approvals/ui/ApprovalRequestReadOnlyModal';
import { PendingApprovalInboxModalContent } from '@/features/approvals/ui/PendingApprovalInboxModal';
import { contractTemplateApi } from '@/features/contracts/api/contractTemplateApi';
import { MyContractsPanel } from '@/features/contracts/ui/MyContractsPanel';
import { getRefreshIdentityHeaders } from '@/shared/stores/authRefreshIdentityStore';
import { AppDoubleActionModal } from '@/shared/ui/AppDoubleActionModal';
import { AppModal } from '@/shared/ui/AppModal';
import { AppSingleActionModal } from '@/shared/ui/AppSingleActionModal';
import { AppWorkspacePageTitle } from '@/shared/ui/AppWorkspacePageTitle';
import { AppSearchBar } from '@/shared/ui';

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
  options?: { documentName?: string | null },
): Promise<ApprovalRequestDetail> {
  const config = options?.documentName
    ? PRE_ACTION_CONFIGS.find((c) => c.documentName === options.documentName)
    : null;
  if (config) {
    return await createApprovalWithPreAction(config, payload, attachmentFiles);
  }
  const res = await approvalRequestApi.createRequest(payload);
  await maybeUploadApprovalAttachments(res.requestId, String(res.requestStatus), attachmentFiles);
  return res;
}

/**
 * salary-service 엔티티와 연동되는 결재 문서 pre-action 설정
 * - submitEntity: 결재 생성 전 salary 엔티티를 먼저 만들고 ID 반환
 * - entityIdField: contentJson 에 주입할 필드명 (consumer 가 이걸로 찾음)
 * - cancelEntity: 결재 생성 실패 시 best-effort 롤백
 * - linkApproval: 결재 생성 후 entity 에 approvalRequestId 역링크
 *                 null 이면 consumer 가 entityId 로 직접 찾기 때문에 생략
 */
type PreActionConfig = {
  documentName: string;
  entityIdField: string;
  /** content 와 첨부파일 유무를 받아 entity 를 생성 — 첨부 sentinel 처리에 사용 */
  submitEntity: (content: Record<string, unknown>, hasAttachment?: boolean) => Promise<string>;
  cancelEntity: (id: string) => Promise<void>;
  linkApproval: ((id: string, approvalRequestId: string) => Promise<void>) | null;
};

const SCHEDULE_SELECTION_PREFILL_STORAGE_KEY = 'wf-approval-prefill-schedule-selection';
const PERSONNEL_ORDER_PREFILL_STORAGE_KEY = 'wf-approval-prefill-personnel-order';
const LEAVE_REQUEST_PREFILL_STORAGE_KEY = 'wf-approval-prefill-leave-request';
const CHATBOT_ACTION_PREFILL_STORAGE_KEY = 'wf-approval-prefill-chatbot-action';

/** 쿼리값이 `prefill=%22true%22`처럼 따옴표가 포함된 문자열일 때 정규화 */
function normalizeUrlSearchToken(v: unknown): string {
  if (v === true) return 'true';
  if (v === false) return 'false';
  if (v == null) return '';
  let s = String(v).trim();
  if (s.length >= 2) {
    const a = s[0];
    const b = s[s.length - 1];
    if ((a === '"' && b === '"') || (a === "'" && b === "'")) {
      s = s.slice(1, -1).trim();
    }
  }
  return s;
}

function isTruthyPrefillParam(v: unknown): boolean {
  if (v === true) return true;
  if (v === false) return false;
  const s = normalizeUrlSearchToken(v).toLowerCase();
  return s === 'true' || s === '1' || s === 'yes';
}

function readStr(content: Record<string, unknown>, key: string): string {
  const v = content[key];
  return typeof v === 'string' ? v : '';
}
function readNum(content: Record<string, unknown>, key: string): number | null {
  const v = content[key];
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v);
  return null;
}
/** YYYY-MM-DD 문자열 배열 추출, 비어있으면 undefined */
function readDateArray(content: Record<string, unknown>, key: string): string[] | undefined {
  const v = content[key];
  if (!Array.isArray(v)) return undefined;
  const out = v
    .map((d) => (typeof d === 'string' ? d.trim() : ''))
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
  return out.length > 0 ? out : undefined;
}

/** 휴가신청서 prefill 정규화: start/end만 와도 plannedDates를 생성해 UI(DatePicker multiple)에 반영 */
function normalizeLeavePrefillContent(
  content: Record<string, unknown>,
  companyHolidaySet: Set<string>,
): Record<string, unknown> {
  const next = { ...content };
  const planned = readDateArray(content, 'plannedDates');
  if (planned && planned.length > 0) {
    next.plannedDates = planned;
    return next;
  }
  const startDate = readStr(content, 'startDate');
  const endDate = readStr(content, 'endDate');
  if (!startDate || !endDate) return next;
  const start = dayjs(startDate, 'YYYY-MM-DD', true);
  const end = dayjs(endDate, 'YYYY-MM-DD', true);
  if (!start.isValid() || !end.isValid()) return next;
  const from = start.isBefore(end) ? start : end;
  const to = start.isBefore(end) ? end : start;
  const out: string[] = [];
  let cursor = from;
  let guard = 0;
  while (!cursor.isAfter(to, 'day') && guard < 500) {
    const dow = cursor.day();
    const ymd = cursor.format('YYYY-MM-DD');
    if (dow !== 0 && dow !== 6 && !companyHolidaySet.has(ymd)) out.push(ymd);
    cursor = cursor.add(1, 'day');
    guard += 1;
  }
  if (out.length > 0) next.plannedDates = out;
  return next;
}

/** HH:mm 또는 HH:mm:ss 시간 문자열을 LocalDateTime 파싱용 ISO 로 조합 */
function toLocalDateTime(date: string, time: string): string {
  if (!date || !time) return '';
  const t = time.length === 5 ? `${time}:00` : time;
  return `${date}T${t}`;
}

/** 휴직 신청서 한글 type → 백엔드 enum 매핑 */
const LEAVE_OF_ABSENCE_TYPE_MAP: Record<string, string> = {
  출산휴가: 'MATERNITY',
  육아휴직: 'PATERNAL',
  장기병가: 'SICK',
  무급휴직: 'UNPAID',
  학업휴직: 'STUDY',
  군복무: 'MILITARY',
};

/** 휴직 종류별 유급 여부 - 종류 자체에 함의되어 있어 따로 입력받지 않고 자동 도출 */
const LEAVE_OF_ABSENCE_PAID_MAP: Record<string, 'Y' | 'N'> = {
  MATERNITY: 'Y', // 출산휴가 - 유급 (근로기준법 74조)
  PATERNAL: 'N', // 육아휴직 - 회사 무급, 고용보험 별도 급여
  SICK: 'N', // 장기병가 - 보수적 기본값 (회사별 정책 따라 가산 가능)
  UNPAID: 'N', // 무급휴직
  STUDY: 'N', // 학업휴직
  MILITARY: 'N', // 군복무
};

/** HH:mm 두 개의 분 차이, 자정 넘어가면 다음날로 보정 */
function minutesBetweenTimes(start: string, end: string): number {
  const [shRaw, smRaw] = start.split(':').map((v) => Number(v));
  const [ehRaw, emRaw] = end.split(':').map((v) => Number(v));
  const sh = shRaw ?? 0;
  const sm = smRaw ?? 0;
  const eh = ehRaw ?? 0;
  const em = emRaw ?? 0;
  if (Number.isNaN(sh) || Number.isNaN(sm) || Number.isNaN(eh) || Number.isNaN(em)) return 0;
  let diff = eh * 60 + em - (sh * 60 + sm);
  if (diff < 0) diff += 24 * 60;
  return diff;
}

const PRE_ACTION_CONFIGS: PreActionConfig[] = [
  {
    documentName: '휴가신청서',
    entityIdField: 'leaveRequestId',
    submitEntity: async (content, hasAttachment) => {
      const companyLeaveTypeId = readStr(content, 'vacationType');
      // 비연속 날짜 - 채워져 있으면 startDate/endDate 는 first/last 로 자동 도출
      const plannedDates = readDateArray(content, 'plannedDates');
      let startDate = readStr(content, 'startDate');
      let endDate = readStr(content, 'endDate');
      if (plannedDates && plannedDates.length > 0) {
        const sorted = [...plannedDates].sort();
        startDate = sorted[0] ?? startDate;
        endDate = sorted[sorted.length - 1] ?? endDate;
      }
      if (!companyLeaveTypeId) {
        throw new Error('휴가 종류를 선택해 주세요.');
      }
      if (!startDate || !endDate) {
        throw new Error('휴가 날짜를 1개 이상 선택해 주세요.');
      }
      // 첨부파일은 결재문서 생성 후에 업로드되지만 백엔드 LeaveRequestService 는
      // requireEvidenceYn=Y 인 휴가에 대해 evidenceFileUrl 이 null/blank 이면 거부함.
      // 결재 첨부파일 슬롯에 파일이 들어 있으면 sentinel 을 보내 검증을 통과시키고,
      // 실제 파일 URL 은 결재 문서 attachments 로 보존된다.
      const evidenceFileUrl = hasAttachment ? 'APPROVAL_ATTACHMENT' : null;
      const r = await attendanceApi.leaveRequest.submit({
        companyLeaveTypeId,
        startDate,
        endDate,
        reason: readStr(content, 'reason') || '휴가 신청',
        evidenceFileUrl,
        ...(plannedDates ? { plannedDates } : {}),
      });
      if (!r.leaveRequestId) throw new Error('휴가 신청 ID 를 받지 못했습니다.');
      return r.leaveRequestId;
    },
    cancelEntity: (id) => attendanceApi.leaveRequest.cancel(id),
    linkApproval: (id, aid) => attendanceApi.leaveRequest.linkApproval(id, aid),
  },
  {
    documentName: '연장근무신청',
    entityIdField: 'overtimeRequestId',
    submitEntity: async (content) => {
      const workDate = readStr(content, 'workDate');
      const startTime = readStr(content, 'startTime');
      const endTime = readStr(content, 'endTime');
      if (!workDate || !startTime || !endTime) {
        throw new Error('근무일자·시간은 필수입니다.');
      }
      // PRE/POST 자동 도출: workDate < 오늘 -> 사후(POST), 그 외(미래·오늘) -> 사전(PRE)
      const today = dayjs().startOf('day');
      const isPost = dayjs(workDate).startOf('day').isBefore(today);
      const startDt = toLocalDateTime(workDate, startTime);
      const endDt = toLocalDateTime(workDate, endTime);
      const minutes = minutesBetweenTimes(startTime, endTime);
      const reason = readStr(content, 'requestReason') || '연장 근무 신청';
      const r = await attendanceApi.overtimeRequest.createMy({
        targetDate: workDate,
        requestType: isPost ? 'POST' : 'PRE',
        plannedStartTime: isPost ? null : startDt,
        plannedEndTime: isPost ? null : endDt,
        requestedMinutes: isPost ? null : minutes,
        actualStartTime: isPost ? startDt : null,
        actualEndTime: isPost ? endDt : null,
        actualMinutes: isPost ? minutes : null,
        reason,
      });
      if (!r.overtimeRequestId) throw new Error('연장근무 신청 ID 를 받지 못했습니다.');
      return r.overtimeRequestId;
    },
    cancelEntity: (id) => attendanceApi.overtimeRequest.cancelMy(id),
    linkApproval: (id, aid) => attendanceApi.overtimeRequest.updateApprovalLink(id, aid),
  },
  {
    documentName: '수당 변경 신청',
    entityIdField: 'memberAllowanceId',
    submitEntity: async (content) => {
      const salaryItemTemplateId = readStr(content, 'salaryItemTemplateId');
      const amount = readNum(content, 'amount');
      const effectiveFrom = readStr(content, 'effectiveFrom');
      if (!salaryItemTemplateId || amount == null || !effectiveFrom) {
        throw new Error('수당 항목·금액·적용 시작일은 필수입니다.');
      }
      const r = await salaryApi.memberAllowance.createMy({
        salaryItemTemplateId,
        amount,
        effectiveFrom,
        reason: readStr(content, 'reason') || null,
      });
      if (!r.memberAllowanceId) throw new Error('수당 신청 ID 를 받지 못했습니다.');
      return r.memberAllowanceId;
    },
    cancelEntity: (id) => salaryApi.memberAllowance.cancelMy(id),
    linkApproval: (id, aid) => salaryApi.memberAllowance.updateApprovalLink(id, aid),
  },

  {
    documentName: '출퇴근시간 변경 신청서',
    entityIdField: 'selectionId',
    submitEntity: async (content) => {
      const targetYearMonth = readStr(content, 'targetYearMonth');
      const slotId = readStr(content, 'slotId');
      // 어느 필드가 비어있는지 분리 안내, slot 미선택이 가장 흔한 케이스
      if (!targetYearMonth) {
        throw new Error('대상 연월이 비어있습니다. 다시 시도해 주세요.');
      }
      if (!slotId) {
        throw new Error('시차출퇴근 스케줄을 선택해 주세요.');
      }
      // HH:mm 형식 입력을 HH:mm:ss 로 정규화
      const normalizeTime = (raw: string): string | null => {
        const s = raw.trim();
        if (!s) return null;
        // HH:mm 또는 HH:mm:ss 만 허용
        if (/^\d{1,2}:\d{2}$/.test(s)) return `${s.padStart(5, '0')}:00`;
        if (/^\d{1,2}:\d{2}:\d{2}$/.test(s)) return s;
        return null;
      };
      const breakStart = normalizeTime(readStr(content, 'breakStart'));
      const breakEnd = normalizeTime(readStr(content, 'breakEnd'));
      const r = await attendanceApi.scheduleSelection.createMy({
        targetYearMonth,
        slotId,
        breakStart,
        breakEnd,
        requestReason: readStr(content, 'requestReason') || null,
      });
      if (!r.selectionId) throw new Error('슬롯 선택 ID 를 받지 못했습니다.');
      return r.selectionId;
    },
    cancelEntity: (id) => attendanceApi.scheduleSelection.cancelMy(id),
    // consumer 가 selectionId 로 직접 찾음, 역링크는 applyApproval 내부에서 설정
    linkApproval: null,
  },
  {
    documentName: '휴직 신청서',
    entityIdField: 'leaveOfAbsenceId',
    submitEntity: async (content) => {
      const typeKo = readStr(content, 'type');
      const type = LEAVE_OF_ABSENCE_TYPE_MAP[typeKo];
      const startDate = readStr(content, 'startDate');
      const endDate = readStr(content, 'endDate');
      if (!type || !startDate || !endDate) {
        throw new Error('휴직 종류·기간은 필수입니다.');
      }
      // 유급 여부는 휴직 종류로부터 자동 도출 (사용자 입력 불필요)
      const isPaidYn = LEAVE_OF_ABSENCE_PAID_MAP[type] ?? 'N';
      const r = await attendanceApi.leaveOfAbsence.submit({
        type,
        startDate,
        endDate,
        isPaidYn,
        reason: readStr(content, 'reason') || null,
        evidenceFileUrl: readStr(content, 'evidenceFileUrl') || null,
      });
      if (!r.leaveOfAbsenceId) throw new Error('휴직 신청 ID 를 받지 못했습니다.');
      return r.leaveOfAbsenceId;
    },
    cancelEntity: (id) => attendanceApi.leaveOfAbsence.cancel(id),
    linkApproval: (id, aid) => attendanceApi.leaveOfAbsence.linkApproval(id, aid),
  },
];

/**
 * pre-action 공통 흐름
 * 1. salary 엔티티 생성 (검증 통과해야 함)
 * 2. contentJson 에 entityId 주입 후 결재 생성
 * 3. (선택) 엔티티에 approvalRequestId 역링크
 * 실패 시 best-effort 롤백
 */
async function createApprovalWithPreAction(
  config: PreActionConfig,
  payload: CreateApprovalRequestPayload,
  attachmentFiles?: File[],
): Promise<ApprovalRequestDetail> {
  const content = (() => {
    try {
      return JSON.parse(payload.contentJson ?? '{}') as Record<string, unknown>;
    } catch {
      return {};
    }
  })();

  // Step 1 — 첨부 유무를 함께 전달 (증빙 필수 휴가 등에서 sentinel 처리에 사용)
  const hasAttachment = (attachmentFiles?.length ?? 0) > 0;
  const entityId = await config.submitEntity(content, hasAttachment);

  // Step 2
  const enriched: CreateApprovalRequestPayload = {
    ...payload,
    contentJson: JSON.stringify({ ...content, [config.entityIdField]: entityId }),
  };
  let approval: ApprovalRequestDetail;
  try {
    approval = await approvalRequestApi.createRequest(enriched);
  } catch (err) {
    try {
      await config.cancelEntity(entityId);
    } catch {
      // 롤백 실패는 무시, 서버측 고아 레코드는 별도 정리
    }
    throw err;
  }

  // Step 3 (linkApproval null 이면 consumer 가 entityId 로 찾으므로 생략)
  if (config.linkApproval) {
    try {
      await config.linkApproval(entityId, approval.requestId);
    } catch (err) {
      console.warn(`[${config.documentName}] approval-link failed, consumer fallback used`, err);
    }
  }

  await maybeUploadApprovalAttachments(
    approval.requestId,
    String(approval.requestStatus),
    attachmentFiles,
  );
  return approval;
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
  'tw-rounded-2xl tw-border tw-border-slate-200/90 tw-shadow-sm tw-shadow-slate-900/5';

/** 작성 허브 상단 오른쪽 결재 양식 카드 — 하단 문서함과 달리 min-height 없음 */
const APPROVAL_HOME_COMPOSE_FORMS_CARD_CLASS =
  'tw-rounded-2xl tw-border tw-border-slate-200/90 tw-shadow-sm tw-shadow-slate-900/5';

const APPROVAL_FOLLOWUP_MODAL_HEIGHT = 'min(820px, calc(100dvh - 96px))';
const APPROVAL_FOLLOWUP_MODAL_CONTENT_STYLE: CSSProperties = {
  height: APPROVAL_FOLLOWUP_MODAL_HEIGHT,
  maxHeight: APPROVAL_FOLLOWUP_MODAL_HEIGHT,
  display: 'flex',
  flexDirection: 'column',
  padding: 0,
  overflow: 'hidden',
};
const APPROVAL_FOLLOWUP_MODAL_HEADER_STYLE: CSSProperties = {
  flexShrink: 0,
  marginBottom: 0,
  padding: '12px 16px',
};
const APPROVAL_FOLLOWUP_MODAL_BODY_STYLE: CSSProperties = {
  flex: 1,
  minHeight: 0,
  padding: 0,
  overflow: 'hidden',
};
const APPROVAL_DASHBOARD_MODAL_FRAME_CLASS =
  'tw-flex tw-h-full tw-min-h-0 tw-w-full tw-overflow-hidden tw-bg-slate-50';
const APPROVAL_DASHBOARD_MODAL_IFRAME_CLASS =
  'tw-h-full tw-min-h-0 tw-w-full tw-border-0 tw-bg-slate-50';
const APPROVAL_NAV_FILTER_TABS_CLASS =
  'wf-approval-modal-tabs [&_.ant-tabs-content]:tw-hidden';
const APPROVAL_CONTENT_TABS_CLASS =
  'wf-approval-modal-tabs';

const APPROVAL_EMBED_QUERY = 'compose-modal';
const APPROVAL_HUB_REFRESH_ON_RETURN_KEY = 'wf:approval-hub-refresh-on-return';
const APPROVAL_EMBED_CLOSE_MESSAGE = 'wf:approval-embed-close';

/**
 * 결재 작성 본 화면(워크벤치). `sideNav`가 비어 있으면 허브 대시보드만 보이므로,
 * 임시저장 이어쓰기·허브에서 양식 선택 후 작성 등은 이 값으로 구분한다.
 */
const APPROVAL_COMPOSE_WORKBENCH_SIDE_NAV = 'workbench';

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
function buildApprovalEmbedUrl(
  pathname: string,
  search: Record<string, string | undefined>,
): string {
  const u = new URL(
    pathname,
    typeof window !== 'undefined' ? window.location.origin : 'http://localhost',
  );
  u.searchParams.set('embed', APPROVAL_EMBED_QUERY);
  for (const [k, v] of Object.entries(search)) {
    if (v !== undefined && v !== '') u.searchParams.set(k, v);
  }
  return u.toString();
}

/** 작성 허브「전체」모달 iframe — 카드별로 열리는 문서함 구역 */
type ComposeHomeEmbedPanel =
  | 'my-all'
  | 'viewers'
  | 'department'
  | /** 알림·딥링크 전용 — 허브 카드에서는 사용하지 않음 */
    'official'
  | 'draft'
  | 'absence';
type ApprovalNotificationModal = 'pending' | 'my-all' | 'viewers' | 'official' | 'draft';

/** 허브 문서함 모달 헤더 — 결재 대기 전체 모달과 동일한 겉 형식용 제목 */
const COMPOSE_HOME_EMBED_PANEL_TITLE: Record<ComposeHomeEmbedPanel, string> = {
  'my-all': '결재 상신함 전체',
  viewers: '참조/공람 문서 전체',
  department: '부서 문서함 전체',
  official: '공문 수신함 전체',
  draft: '임시 저장 문서 전체',
  absence: '부재 위임 전체',
};

function composeHomeEmbedPanelModalTitle(modal: {
  kind: 'iframe';
  panel: ComposeHomeEmbedPanel;
  composeDraftId?: string;
  prefillDocumentId?: string;
}): string {
  if (modal.panel === 'draft' && modal.composeDraftId?.trim()) {
    return '임시 저장 문서 이어쓰기';
  }
  return COMPOSE_HOME_EMBED_PANEL_TITLE[modal.panel];
}

function composeHomeEmbedPanelUrl(
  panel: ComposeHomeEmbedPanel,
  opts?: { composeDraftId?: string; prefillDocumentId?: string },
): string {
  switch (panel) {
    case 'my-all':
      return buildApprovalEmbedUrl('/app/approvals/my-requests', {});
    case 'viewers':
      return buildApprovalEmbedUrl('/app/approvals', { tab: 'my', box: 'per-viewers' });
    case 'department':
      return buildApprovalEmbedUrl('/app/approvals/department', {});
    case 'official':
      return buildApprovalEmbedUrl('/app/approvals/department', { deptView: 'received' });
    case 'draft':
      if (opts?.composeDraftId) {
        return buildApprovalEmbedUrl('/app/approvals', {
          tab: 'compose',
          sideNav: APPROVAL_COMPOSE_WORKBENCH_SIDE_NAV,
          composeDraftId: opts.composeDraftId,
        });
      }
      return buildApprovalEmbedUrl(
        '/app/approvals',
        opts?.prefillDocumentId
          ? {
              tab: 'compose',
              sideNav: APPROVAL_COMPOSE_WORKBENCH_SIDE_NAV,
              docId: opts.prefillDocumentId,
            }
          : { tab: 'my', box: 'per-draft' },
      );
    case 'absence':
      return buildApprovalEmbedUrl('/app/approvals/absence-proxy', {});
    default:
      return buildApprovalEmbedUrl('/app/approvals', { tab: 'my', box: 'per-all' });
  }
}

function homeContractPreviewStatusTag(status: string) {
  const s = String(status).toUpperCase();
  if (s === 'SENT') return <Tag color="processing">서명 대기</Tag>;
  if (s === 'SIGNED') return <Tag color="success">완료</Tag>;
  if (s === 'REJECTED') return <Tag color="error">거절</Tag>;
  if (s === 'CANCELED') return <Tag color="default">회수</Tag>;
  if (s === 'CREATED') return <Tag>생성됨</Tag>;
  return <Tag>{status}</Tag>;
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
  const viewportWidthClass = visibleSlots > 0 ? 'tw-w-full tw-max-w-full' : '';
  return (
    <div
      className={clsx(
        'tw-box-border tw-min-w-0 tw-overflow-x-auto tw-overflow-y-hidden wf-scrollbar tw-pr-0.5 [scrollbar-gutter:stable]',
        viewportWidthClass,
      )}
      aria-label="결재선"
    >
      <div className="tw-inline-flex tw-min-w-max tw-items-center tw-gap-0">
        {sorted.map((line, i) => {
          const name =
            line.approverName?.trim() ||
            line.approverJobTitleName?.trim() ||
            `결재 ${line.stepOrder}차`;
          const st = String(line.approvalStatus);
          const title = `${line.stepOrder}단계 · ${name} · ${pendingHomeLineStatusLabel(st)}`;
          const statusUpper = String(st).toUpperCase();
          return (
            <Fragment key={line.approvalId}>
              {i > 0 ? (
                <span
                  className="tw-h-px tw-w-4 tw-shrink-0 tw-bg-slate-200"
                  aria-hidden
                />
              ) : null}
              <div
                title={title}
                className={clsx(
                  'tw-flex tw-h-10 tw-w-[6rem] tw-shrink-0 tw-items-center tw-gap-2 tw-rounded-md tw-border tw-border-slate-200 tw-bg-white tw-px-2 tw-shadow-[0_1px_2px_rgba(15,23,42,0.04)]',
                  statusUpper === 'PENDING' && 'tw-border-amber-200 tw-bg-amber-50/30',
                  statusUpper === 'APPROVED' && 'tw-border-blue-200 tw-bg-blue-50/30',
                  statusUpper === 'REJECTED' && 'tw-border-rose-200 tw-bg-rose-50/30',
                )}
              >
                <span
                  className={clsx(
                    'tw-flex tw-size-5 tw-shrink-0 tw-items-center tw-justify-center tw-rounded-full tw-text-[10px] tw-font-bold',
                    statusUpper === 'APPROVED' && 'tw-bg-blue-100 tw-text-blue-700',
                    statusUpper === 'REJECTED' && 'tw-bg-rose-100 tw-text-rose-700',
                    statusUpper === 'PENDING' && 'tw-bg-amber-100 tw-text-amber-800',
                    !['APPROVED', 'REJECTED', 'PENDING'].includes(statusUpper) &&
                      'tw-bg-slate-100 tw-text-slate-500',
                  )}
                >
                  {line.stepOrder}
                </span>
                <div className="tw-min-w-0 tw-flex-1 tw-leading-tight">
                  <div className="tw-truncate tw-text-[11px] tw-font-semibold tw-text-slate-800">
                    {name}
                  </div>
                  <div
                    className={clsx(
                      'tw-truncate tw-text-[10px] tw-font-medium',
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

function PendingHomeApprovalLineSummary({ lines }: { lines: ApprovalLine[] }) {
  const sorted = [...lines].sort((a, b) => a.stepOrder - b.stepOrder);
  if (sorted.length === 0) {
    return (
      <Typography.Text type="secondary" className="!tw-text-xs">
        —
      </Typography.Text>
    );
  }

  const firstLine = sorted[0]!;
  const focusLine =
    sorted.find((line) => String(line.approvalStatus).toUpperCase() === 'PENDING') ??
    [...sorted]
      .reverse()
      .find((line) => ['APPROVED', 'REJECTED'].includes(String(line.approvalStatus).toUpperCase())) ??
    firstLine;
  const focusStatus = String(focusLine.approvalStatus);
  const focusName =
    focusLine.approverName?.trim() ||
    focusLine.approverJobTitleName?.trim() ||
    `${focusLine.stepOrder}단계`;

  const tooltipTitle = (
    <div className="tw-min-w-[190px] tw-space-y-1.5">
      {sorted.map((line) => {
        const status = String(line.approvalStatus);
        const statusUpper = status.toUpperCase();
        const name =
          line.approverName?.trim() ||
          line.approverJobTitleName?.trim() ||
          `${line.stepOrder}단계`;
        return (
          <div
            key={line.approvalId}
            className="tw-flex tw-items-center tw-justify-between tw-gap-3 tw-rounded-md tw-px-1 tw-py-0.5"
          >
            <span className="tw-flex tw-min-w-0 tw-items-center tw-gap-1.5">
              <span
                className={clsx(
                  'tw-size-1.5 tw-shrink-0 tw-rounded-full',
                  statusUpper === 'APPROVED' && 'tw-bg-blue-500',
                  statusUpper === 'REJECTED' && 'tw-bg-rose-500',
                  statusUpper === 'PENDING' && 'tw-bg-amber-500',
                  !['APPROVED', 'REJECTED', 'PENDING'].includes(statusUpper) && 'tw-bg-slate-400',
                )}
              />
              <span className="tw-min-w-0 tw-truncate tw-text-[12px] tw-font-medium tw-text-slate-700">
                {line.stepOrder}. {name}
              </span>
            </span>
            <span
              className={clsx(
                'tw-shrink-0 tw-text-[11px] tw-font-semibold',
                pendingHomeLineTextClass(status),
              )}
            >
              {pendingHomeLineStatusLabel(status)}
            </span>
          </div>
        );
      })}
    </div>
  );

  return (
    <Tooltip
      title={tooltipTitle}
      placement="topLeft"
      color="#ffffff"
      styles={{
        body: {
          border: '1px solid #e2e8f0',
          borderRadius: 10,
          boxShadow: '0 14px 34px rgba(15, 23, 42, 0.14)',
          color: '#0f172a',
          padding: '8px',
        },
      }}
    >
      <div className="tw-inline-flex tw-max-w-full tw-items-center tw-gap-1 tw-rounded-md tw-bg-slate-50 tw-px-1.5 tw-py-0.5">
        <span
          className={clsx(
            'tw-size-1 tw-shrink-0 tw-rounded-full',
            String(focusStatus).toUpperCase() === 'APPROVED' && 'tw-bg-blue-500',
            String(focusStatus).toUpperCase() === 'REJECTED' && 'tw-bg-rose-500',
            String(focusStatus).toUpperCase() === 'PENDING' && 'tw-bg-amber-500',
            !['APPROVED', 'REJECTED', 'PENDING'].includes(String(focusStatus).toUpperCase()) &&
              'tw-bg-slate-400',
          )}
        />
        <div className="tw-min-w-0">
          <div
            className={clsx(
              'tw-whitespace-nowrap tw-text-xs tw-font-medium tw-leading-tight',
              pendingHomeLineTextClass(focusStatus),
            )}
          >
            {focusName}
          </div>
        </div>
        <span className="tw-shrink-0 tw-text-[11px] tw-font-medium tw-text-slate-500">
          {pendingHomeLineStatusLabel(focusStatus)}
          {sorted.length > 1 ? ` · ${sorted.length}` : ''}
        </span>
      </div>
    </Tooltip>
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
  approverName: string;
}> {
  const ordered = [...rows].sort((a, b) => a.stepOrder - b.stepOrder);
  const out: Array<{ approverMemberId: string; approverMemberPositionId: string; approverName: string }> = [];
  for (const r of ordered) {
    if (r.kind === 'org') {
      for (const m of r.members) {
        out.push({
          approverMemberId: m.approverMemberId,
          approverMemberPositionId: m.approverMemberPositionId,
          approverName: m.memberName?.trim() || '—',
        });
      }
    } else {
      out.push({
        approverMemberId: r.approverMemberId,
        approverMemberPositionId: r.approverMemberPositionId,
        approverName: r.memberName?.trim() || '—',
      });
    }
  }
  return out;
}

function countViewerDraftMembers(rows: ViewerDraft[]): number {
  return rows.reduce((n, r) => n + (r.kind === 'org' ? r.members.length : 1), 0);
}

function flattenCcViewersForPayload(rows: ViewerDraft[]) {
  const out: Array<{ viewerMemberId: string; viewerMemberPositionId: string; viewerType: 'CC' }> =
    [];
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
  const out: Array<{
    viewerMemberId: string;
    viewerMemberPositionId: string;
    viewerType: 'CIRCULATION';
  }> = [];
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

function viewersToDraftRows(viewers: ApprovalViewer[]): {
  cc: ViewerDraft[];
  circulation: ViewerDraft[];
} {
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

/** RequestType enum 주석과 맞춘 카테고리 설명 */
const REQUEST_TYPE_DESC: Record<ApprovalRequestType, string> = {
  VACATION: '휴가 신청 등',
  ATTENDANCE: '출퇴근·시간 관리',
  HR: '인사',
  BUSINESS_TRIP: '출장',
  GENERAL: '일반 기안',
  OFFICIAL: '대외 공문',
};

const REQUEST_TYPE_ICON: Record<ApprovalRequestType, ComponentType<{ className?: string }>> = {
  VACATION: CalendarOutlined,
  ATTENDANCE: ClockCircleOutlined,
  HR: ApartmentOutlined,
  BUSINESS_TRIP: CarOutlined,
  GENERAL: FileTextOutlined,
  OFFICIAL: SendOutlined,
};

const APPROVAL_RECENT_FORMS_KEY = 'workforce.approval.recentForms';
const APPROVAL_HOME_BOOKMARKS_KEY = 'workforce.approval.homeBookmarks';
const APPROVAL_HOME_QUICK_FORMS_KEY = 'workforce.approval.homeQuickForms';

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
          Boolean(x) &&
          typeof x === 'object' &&
          typeof (x as RecentFormEntry).documentId === 'string',
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

function loadQuickHomeForms(): string[] {
  try {
    const raw = localStorage.getItem(APPROVAL_HOME_QUICK_FORMS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((v): v is string => typeof v === 'string')
      .map((v) => v.trim())
      .filter(Boolean)
      .slice(0, 3);
  } catch {
    return [];
  }
}

function saveQuickHomeForms(ids: string[]) {
  try {
    localStorage.setItem(APPROVAL_HOME_QUICK_FORMS_KEY, JSON.stringify(ids.slice(0, 3)));
  } catch {
    /* ignore */
  }
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
    const map = Object.fromEntries(
      APPROVAL_REQUEST_TYPES.map((t) => [t, [] as ApprovalDocument[]]),
    ) as Record<ApprovalRequestType, ApprovalDocument[]>;
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

  const [categoryExpanded, setCategoryExpanded] = useState<
    Partial<Record<ApprovalRequestType, boolean>>
  >({});

  const handleSelect = useCallback(
    (documentId: string) => {
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
    },
    [docById, onAfterPick, onChange, recentForms],
  );

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
          title={
            <span className="tw-text-sm tw-font-semibold tw-text-slate-800">최근 사용한 양식</span>
          }
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
                      <Typography.Text className="!tw-block tw-truncate tw-text-sm">
                        {r.documentName}
                      </Typography.Text>
                      <Typography.Text
                        type="secondary"
                        className="!tw-block tw-truncate tw-text-xs"
                      >
                        {approvalRequestTypeLabelKo(r.requestType)}
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
            const visibleList =
              hasOverflow && !expanded ? list.slice(0, FORM_PICKER_CATEGORY_INITIAL) : list;
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
                    <Typography.Text
                      strong
                      className="!tw-block tw-font-mono tw-text-sm tw-tracking-tight tw-text-slate-900"
                    >
                      {t}
                    </Typography.Text>
                    <Typography.Text
                      type="secondary"
                      className="!tw-mt-0.5 !tw-block tw-text-xs tw-leading-snug"
                    >
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
                          onClick={() =>
                            setCategoryExpanded((prev) => ({ ...prev, [t]: !expanded }))
                          }
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

/** 결재 상신함 — 상태 필터 탭(URL `myStatus`와 동기화) */
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
  const pendingLine = row.approvalLines.find(
    (l) => String(l.approvalStatus).toUpperCase() === 'PENDING',
  );
  if (!pendingLine) return false;
  return !memberKeyEq(pendingLine.approverMemberId, mid);
}

type SortableApprovalLineRowContextValue = {
  setActivatorNodeRef: (element: HTMLElement | null) => void;
  listeners: ReturnType<typeof useSortable>['listeners'];
  attributes: ReturnType<typeof useSortable>['attributes'];
};

const SortableApprovalLineRowContext = createContext<SortableApprovalLineRowContextValue | null>(
  null,
);

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

function SortableApprovalTableRow({
  children,
  style,
  className,
  ...rest
}: SortableApprovalTableRowProps) {
  const id = String(rest['data-row-key'] ?? '');
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
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

function findOrgChartNode(
  roots: OrgChartOrgNode[],
  organizationId: string,
): OrgChartOrgNode | null {
  for (const n of roots) {
    if (n.organizationId === organizationId) return n;
    const found = findOrgChartNode(n.children, organizationId);
    if (found) return found;
  }
  return null;
}

function flattenOrgChartOrganizations(
  roots: OrgChartOrgNode[],
): { value: string; label: string }[] {
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
  return list
    .map((r) => r.recipientOrganizationName?.trim() || r.recipientOrganizationId)
    .join(', ');
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
        composeDraftId?: string;
        docId?: string;
        documentId?: string;
        prefill?: string | boolean | number;
        approvalModal?: string;
        approvalOpenAt?: string;
        approvalRequestId?: string;
        // 근태정정신청 prefill - MyAttendancePage 행별 버튼에서 넘어오는 첫 행 시드값
        corrDate?: string;
        corrClockIn?: string;
        corrClockOut?: string;
        // 연장근무신청 prefill - MyAttendancePage 행별 버튼에서 넘어오는 시드값
        otDate?: string;
        otStartTime?: string;
        otEndTime?: string;
        // 조퇴계 prefill - MyAttendancePage 행별 [조퇴 신청] 버튼에서 넘어오는 시드값
        elDate?: string;
        elTime?: string;
        // 자동 모달 진입 플래그 - prefill 양식 (출퇴근시간 변경 신청서 등)
        // 라우터가 '1' 을 number 1 로 캐스팅하는 케이스 호환
        autoCompose?: string | number;
        // 출퇴근시간 변경 신청서 prefill
        schYearMonth?: string;
        schSlotId?: string;
        schBreakStart?: string;
        schBreakEnd?: string;
        schReason?: string;
      },
  });

  useEffect(() => {
    const refreshApprovalQueries = () => {
      void invalidateApprovalRequestQueries(qc);
    };

    const onApprovalChanged = () => refreshApprovalQueries();
    const onMessage = (event: MessageEvent<unknown>) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data;
      if (!data || typeof data !== 'object') return;
      if ((data as { type?: unknown }).type !== APPROVAL_REQUEST_CHANGED_MESSAGE) return;
      refreshApprovalQueries();
    };

    window.addEventListener(APPROVAL_REQUEST_CHANGED_EVENT, onApprovalChanged);
    window.addEventListener('message', onMessage);

    return () => {
      window.removeEventListener(APPROVAL_REQUEST_CHANGED_EVENT, onApprovalChanged);
      window.removeEventListener('message', onMessage);
    };
  }, [qc]);

  const isEmbedComposeModal = routeSearch.embed === APPROVAL_EMBED_QUERY;
  const embedSearchSuffix = useMemo(
    () => (isEmbedComposeModal ? ({ embed: APPROVAL_EMBED_QUERY } as const) : {}),
    [isEmbedComposeModal],
  );
  const { hasPermission } = usePermissions();
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<ApprovalRequestDetail | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [approvalAction, setApprovalAction] = useState<{
    approvalId: string;
    mode: 'approve' | 'reject';
  } | null>(null);
  const [approvalComment, setApprovalComment] = useState('');
  const [orgTreeSelectedKey, setOrgTreeSelectedKey] = useState<string>();
  const [approvalLineDrafts, setApprovalLineDrafts] = useState<ApprovalLineDraft[]>([]);
  const [lineInfoTab, setLineInfoTab] = useState<'approval' | 'cc' | 'circulation'>('approval');
  const [composeApprovalInfoModalOpen, setComposeApprovalInfoModalOpen] = useState(false);
  const [composePreviewOpen, setComposePreviewOpen] = useState(false);
  const [composeHomeMoreModal, setComposeHomeMoreModal] = useState<
    | {
        kind: 'iframe';
        panel: ComposeHomeEmbedPanel;
        composeDraftId?: string;
        prefillDocumentId?: string;
      }
    | { kind: 'pending-inbox'; title: string }
    | { kind: 'my-contracts'; openContractId?: string }
    | null
  >(null);
  const [quickHomeForms, setQuickHomeForms] = useState<string[]>(() => loadQuickHomeForms());
  const [quickHomeFormsSettingOpen, setQuickHomeFormsSettingOpen] = useState(false);
  const [quickHomeFormsDraft, setQuickHomeFormsDraft] = useState<string[]>([]);
  const [composeFormSelectModalOpen, setComposeFormSelectModalOpen] = useState(false);
  const [composeFormSelectInitialId, setComposeFormSelectInitialId] = useState<string | undefined>(
    undefined,
  );
  // 근태정정신청 자동 모달 - corrDate 진입 시 기존 결재 모달 흐름과 동일한 모양으로 띄움
  const [correctionEmbedSrc, setCorrectionEmbedSrc] = useState<string | null>(null);
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
  /** 허브 모달 iframe에서 `composeDraftId`로 자동 이어쓰기 시 중복 호출 방지 */
  const embedComposeDraftBootRef = useRef<string | null>(null);
  /** 챗봇 prefill URL(documentId/prefill) 자동 부팅 중복 방지 */
  const chatbotPrefillBootRef = useRef<string | null>(null);
  /** 회의록 `ai_transcribe` + attachAudio 일 때 임시저장/제출 직후 첨부 업로드용 */
  const composeMeetingAudioBlobRef = useRef<Blob | null>(null);
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

  const allowedTabs = useMemo(
    () => ['compose', 'my', 'pending', 'acted', ...(canAdmin ? ['admin'] : [])],
    [canAdmin],
  );

  const tab = useMemo(() => {
    const rawTab = routeSearch.tab;
    return typeof rawTab === 'string' && allowedTabs.includes(rawTab) ? rawTab : 'compose';
  }, [routeSearch.tab, allowedTabs]);
  const sideNav = typeof routeSearch.sideNav === 'string' ? routeSearch.sideNav.trim() : '';
  // 결재 양식별 자동 모달 진입 케이스 - 허브 화면 위에 작성 모달 자동 오픈용 플래그
  // 근태정정신청(corrDate) / 연장근무신청(otDate) / autoCompose 플래그(스케줄 등 sessionStorage 사용)
  const isCorrectionEntry = Boolean(routeSearch.corrDate);
  const isOvertimeEntry = Boolean(routeSearch.otDate);
  const isEarlyLeaveEntry = Boolean(routeSearch.elDate);
  const isAutoComposeEntry = String(routeSearch.autoCompose ?? '') === '1';
  const isAutoOpenEntry =
    isCorrectionEntry || isOvertimeEntry || isEarlyLeaveEntry || isAutoComposeEntry;
  const navigateToComposeWorkbench = useCallback(() => {
    navigate({
      to: '/app/approvals',
      search: {
        tab: 'compose',
        sideNav: APPROVAL_COMPOSE_WORKBENCH_SIDE_NAV,
        ...embedSearchSuffix,
      },
      replace: true,
    });
  }, [embedSearchSuffix, navigate]);
  const onComposeHub =
    tab === 'compose' && !isEmbedComposeModal && (sideNav === '' || sideNav === 'request-compose');
  const approvalNotificationModal = useMemo<ApprovalNotificationModal | null>(() => {
    const raw = String(routeSearch.approvalModal ?? '')
      .trim()
      .toLowerCase();
    if (
      raw === 'pending' ||
      raw === 'my-all' ||
      raw === 'viewers' ||
      raw === 'official' ||
      raw === 'draft'
    ) {
      return raw;
    }
    return null;
  }, [routeSearch.approvalModal]);

  useEffect(() => {
    if (!onComposeHub || !approvalNotificationModal) return;
    if (String(routeSearch.approvalRequestId ?? '').trim()) return;
    if (approvalNotificationModal === 'pending') {
      setComposeHomeMoreModal({ kind: 'pending-inbox', title: '결재 처리함 전체' });
      return;
    }
    setComposeHomeMoreModal({ kind: 'iframe', panel: approvalNotificationModal });
  }, [
    onComposeHub,
    approvalNotificationModal,
    routeSearch.approvalOpenAt,
    routeSearch.approvalRequestId,
  ]);

  useEffect(() => {
    if (!onComposeHub) return;
    const refreshIfNeeded = () => {
      try {
        if (sessionStorage.getItem(APPROVAL_HUB_REFRESH_ON_RETURN_KEY) !== '1') return;
        sessionStorage.removeItem(APPROVAL_HUB_REFRESH_ON_RETURN_KEY);
      } catch {
        return;
      }
      void qc.invalidateQueries({ queryKey: ['approval-user'] });
      void qc.invalidateQueries({ queryKey: ['approval', 'documents', 'active'] });
    };
    refreshIfNeeded();
    window.addEventListener('focus', refreshIfNeeded);
    document.addEventListener('visibilitychange', refreshIfNeeded);
    return () => {
      window.removeEventListener('focus', refreshIfNeeded);
      document.removeEventListener('visibilitychange', refreshIfNeeded);
    };
  }, [onComposeHub, qc]);

  useEffect(() => {
    const rid = String(routeSearch.approvalRequestId ?? '').trim();
    if (!rid) return;
    setSelectedRequestId(rid);
  }, [routeSearch.approvalRequestId, routeSearch.approvalOpenAt]);

  const requestStatusFilter = useMemo<ApprovalRequestStatus | 'ALL'>(() => {
    if (tab !== 'my') return 'ALL';
    const box = typeof routeSearch.box === 'string' ? routeSearch.box : undefined;
    if (box === 'per-draft' || String(routeSearch.myStatus).toUpperCase() === 'DRAFT')
      return 'DRAFT';
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

  // dashboardProfile - AppShellLayout 헤더가 부서명 표시할 때 쓰는 동일 쿼리, 캐시 공유
  const { data: myDashboardProfile } = useQuery({
    queryKey: ['member', 'dashboard-profile', authMemberId],
    queryFn: () => memberApi.dashboardProfile(),
    enabled: Boolean(authMemberId),
    retry: false,
    staleTime: 60_000,
  });

  // 인사발령품의서는 인사팀 소속 직원에게만 노출 (관리자 여부 무관, 부서명만으로 필터)
  // 우선순위: dashboardProfile -> drafterProfile(detail) -> JWT user.departmentName
  const myOrgName =
    (myDashboardProfile as { organizationName?: string } | undefined)?.organizationName?.trim() ||
    (drafterProfile as { organizationName?: string } | undefined)?.organizationName?.trim() ||
    user?.departmentName?.trim() ||
    '';
  const isHrTeamMember = myOrgName === '인사팀';
  const pickerDocuments = useMemo(
    () =>
      isHrTeamMember
        ? activeDocuments
        : activeDocuments.filter((d) => d.documentName !== '인사발령품의서'),
    [activeDocuments, isHrTeamMember],
  );

  // 연차신청서 vacationType 필드의 동적 옵션, source="companyLeaveType"
  const { data: companyLeaveTypes = [] } = useQuery({
    queryKey: ['salary', 'company-leave-types'],
    queryFn: () => attendanceApi.companyLeaveType.list(),
    staleTime: 60_000,
  });

  // 휴가 신청 날짜 검증용 - 회사 공휴일 + 본인 휴가 잔여
  // selectedDocument 가 아래쪽에서 정의되므로 enabled 조건은 docId param 기반(TDZ 방지)
  // 결재 메뉴 진입 시 1회 fetch + staleTime 길게 → 부담 작음
  const { data: companyHolidaysForLeave = [] } = useQuery({
    queryKey: ['attendance', 'company-holidays', 'for-leave-form'],
    queryFn: () => attendanceApi.companyHoliday.list(),
    staleTime: 10 * 60_000,
  });
  const companyHolidaySet = useMemo(() => {
    const s = new Set<string>();
    (companyHolidaysForLeave ?? []).forEach((h) => {
      const d = (h as unknown as { holidayDate?: string }).holidayDate;
      if (d) s.add(d);
    });
    return s;
  }, [companyHolidaysForLeave]);
  const { data: myBalances = [] } = useQuery({
    queryKey: ['salary', 'member-balance', 'mine', 'for-leave-form'],
    queryFn: () => attendanceApi.memberBalance.listMine(),
    staleTime: 60_000,
  });
  const companyLeaveTypeOptions = useMemo(
    () =>
      companyLeaveTypes
        .slice()
        .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0))
        .map((t) => ({ value: t.companyLeaveTypeId ?? '', label: t.name ?? '—' }))
        .filter((o) => o.value),
    [companyLeaveTypes],
  );

  // 수당 변경 신청 salaryItemTemplateId 동적 옵션, source="salaryItemTemplate"
  const { data: salaryItemTemplates = [] } = useQuery({
    queryKey: ['salary', 'salary-item-templates'],
    queryFn: () => salaryApi.salaryItemTemplate.list(),
    staleTime: 60_000,
  });
  const { data: myAllowanceHistory = [] } = useQuery({
    queryKey: ['salary', 'allowance', 'my'],
    queryFn: () => salaryApi.memberAllowance.listMy(),
    staleTime: 60_000,
  });
  const activeAllowanceTemplateIds = useMemo(() => {
    const today = dayjs().format('YYYY-MM-DD');
    const ids = new Set<string>();
    for (const row of myAllowanceHistory) {
      const templateId = row.salaryItemTemplateId ?? '';
      if (!templateId) continue;
      const status = String(row.approvalStatus ?? '').toUpperCase();
      const approved = status === 'APPROVED' || status === 'AUTO';
      const started = !row.effectiveFrom || row.effectiveFrom <= today;
      const notEnded = !row.effectiveTo || row.effectiveTo >= today;
      if (approved && started && notEnded) ids.add(templateId);
    }
    return ids;
  }, [myAllowanceHistory]);
  const allowanceFixedAmountByTemplate = useMemo(() => {
    const byTemplate = new Map<string, number>();
    const sorted = [...myAllowanceHistory].sort((a, b) =>
      (b.effectiveFrom ?? '').localeCompare(a.effectiveFrom ?? ''),
    );
    for (const row of sorted) {
      const templateId = row.salaryItemTemplateId ?? '';
      const amount = Number(row.amount ?? NaN);
      const status = String(row.approvalStatus ?? '').toUpperCase();
      if (!templateId || Number.isNaN(amount)) continue;
      if (status !== 'APPROVED' && status !== 'AUTO') continue;
      if (!byTemplate.has(templateId)) byTemplate.set(templateId, amount);
    }
    return byTemplate;
  }, [myAllowanceHistory]);
  const salaryItemTemplateOptions = useMemo(
    () =>
      salaryItemTemplates
        .filter((t) => t.delYn !== 'Y' && t.itemType === 'EARNING')
        .filter((t) => {
          const id = t.salaryItemTemplateId ?? '';
          if (!id) return false;
          const normalizedName = String(t.itemName ?? '').replace(/\s+/g, '');
          if (normalizedName === '기본급') return false;
          if (activeAllowanceTemplateIds.has(id)) return false;
          return true;
        })
        .slice()
        .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0))
        .map((t) => ({ value: t.salaryItemTemplateId ?? '', label: t.itemName ?? '—' }))
        .filter((o) => o.value),
    [activeAllowanceTemplateIds, salaryItemTemplates],
  );

  // 출퇴근시간 변경 slotId 동적 옵션, source="flexibleTimeSlot"
  // 본인 적용 가능한 FLEXIBLE WorkSchedule 만 (본인 개인 스케줄 + 회사 기본)
  const { data: workSchedules = [] } = useQuery({
    queryKey: ['salary', 'work-schedules'],
    queryFn: () => attendanceApi.workSchedule.list(),
    staleTime: 60_000,
  });
  const flexibleWorkScheduleIds = useMemo(
    () =>
      workSchedules
        .filter((s) => s.workType === 'FLEXIBLE' && s.workScheduleId)
        .filter((s) => !s.memberId || s.memberId === user?.id)
        .map((s) => s.workScheduleId!),
    [workSchedules, user?.id],
  );
  const flexibleSlotQueries = useQueries({
    queries: flexibleWorkScheduleIds.map((wsId) => ({
      queryKey: ['salary', 'flexible-slots', wsId] as const,
      queryFn: () => attendanceApi.flexibleSlot.listByWorkSchedule(wsId),
      staleTime: 60_000,
    })),
  });
  /** slotId -> 슬롯 전체 객체. 폼에서 선택된 슬롯의 출퇴근/점심 시간 표시용. */
  const flexibleSlotById = useMemo(() => {
    const m = new Map<string, FlexibleTimeSlot>();
    for (const q of flexibleSlotQueries) {
      for (const slot of q.data ?? []) {
        if (slot.slotId) m.set(slot.slotId, slot);
      }
    }
    return m;
  }, [flexibleSlotQueries]);
  const flexibleTimeSlotOptions = useMemo(() => {
    const seen = new Set<string>();
    const opts: { value: string; label: string }[] = [];
    for (const q of flexibleSlotQueries) {
      for (const slot of q.data ?? []) {
        const id = slot.slotId ?? '';
        if (!id || seen.has(id)) continue;
        seen.add(id);
        const label = `${slot.slotLabel ?? slot.slotCode ?? '—'} (${(slot.startTime ?? '').slice(0, 5)}~${(slot.endTime ?? '').slice(0, 5)})`;
        opts.push({ value: id, label });
      }
    }
    return opts;
  }, [flexibleSlotQueries]);

  // 결재 홈 빠른 양식도 동일 필터 적용
  const composeHubVisibleDocuments = pickerDocuments;
  const quickHomeFormOptions = useMemo(
    () =>
      composeHubVisibleDocuments.map((doc) => ({
        value: doc.documentId,
        label: `${formatApprovalDocumentName(doc.documentName)} · ${approvalRequestTypeLabelKo(doc.requestType)}`,
      })),
    [composeHubVisibleDocuments],
  );
  const quickHomeFormDocs = useMemo(() => {
    const byId = new Map(composeHubVisibleDocuments.map((doc) => [doc.documentId, doc]));
    const picked = quickHomeForms
      .map((id) => byId.get(id))
      .filter((doc): doc is ApprovalDocument => doc != null);
    if (picked.length >= 2) return picked.slice(0, 3);
    const fallback = composeHubVisibleDocuments.filter(
      (doc) => !picked.some((p) => p.documentId === doc.documentId),
    );
    return [...picked, ...fallback].slice(0, Math.min(3, composeHubVisibleDocuments.length));
  }, [composeHubVisibleDocuments, quickHomeForms]);
  const quickHomeDraftDocs = useMemo(() => {
    const byId = new Map(composeHubVisibleDocuments.map((doc) => [doc.documentId, doc]));
    return quickHomeFormsDraft
      .map((id) => byId.get(id))
      .filter((doc): doc is ApprovalDocument => doc != null)
      .slice(0, 3);
  }, [composeHubVisibleDocuments, quickHomeFormsDraft]);
  const quickHomeDraftRemainingOptions = useMemo(() => {
    const selected = new Set(quickHomeDraftDocs.map((doc) => doc.documentId));
    return quickHomeFormOptions.filter((opt) => !selected.has(opt.value));
  }, [quickHomeFormOptions, quickHomeDraftDocs]);

  useEffect(() => {
    const available = new Set(composeHubVisibleDocuments.map((doc) => doc.documentId));
    const valid = quickHomeForms.filter((id) => available.has(id)).slice(0, 3);
    const next = valid.length >= 2 ? valid : quickHomeFormDocs.map((doc) => doc.documentId);
    if (next.join('|') === quickHomeForms.join('|')) return;
    setQuickHomeForms(next);
    saveQuickHomeForms(next);
  }, [composeHubVisibleDocuments, quickHomeForms, quickHomeFormDocs]);

  const selectedDocument = useMemo(
    () => activeDocuments.find((d) => d.documentId === selectedDocumentId) ?? null,
    [activeDocuments, selectedDocumentId],
  );
  const selectedSchema = useMemo(
    () => (selectedDocument ? parseFormSchema(selectedDocument.formSchema) : { fields: [] }),
    [selectedDocument],
  );
  const vacationLeaveKindField = useMemo(
    () =>
      findApprovalFormFieldByLabel(selectedSchema.fields, APPROVAL_VACATION_LEAVE_KIND_FIELD_LABEL),
    [selectedSchema.fields],
  );
  const familyEventSubtypeField = useMemo(
    () =>
      findApprovalFormFieldByLabel(
        selectedSchema.fields,
        APPROVAL_FAMILY_EVENT_SUBTYPE_FIELD_LABEL,
      ),
    [selectedSchema.fields],
  );
  /** `useWatch`는 동적 namePath를 권장하지 않음 — `content`만 구독 후 필드명으로 조회 */
  const watchedContent = Form.useWatch('content', form) as Record<string, unknown> | undefined;
  const watchedVacationLeaveKind =
    vacationLeaveKindField != null && watchedContent && typeof watchedContent === 'object'
      ? watchedContent[vacationLeaveKindField.name]
      : undefined;
  const showFamilyEventSubtypeInCompose =
    familyEventSubtypeField != null &&
    (vacationLeaveKindField == null ||
      watchedVacationLeaveKind === APPROVAL_FAMILY_EVENT_LEAVE_KIND_OPTION);
  const composeSelectedOfficial = useMemo(
    () =>
      selectedDocument != null &&
      normalizeApprovalRequestType(selectedDocument.requestType) === 'OFFICIAL',
    [selectedDocument],
  );

  useEffect(() => {
    composeMeetingAudioBlobRef.current = null;
  }, [selectedDocumentId]);

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
  const actedQueryEnabled = onActedTab || onComposeHub;
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

  const { data: waitingApprovals = [], isFetching: waitingLoading } = useQuery({
    queryKey: ['approval-user', 'approval-waiting'],
    queryFn: () => approvalRequestApi.listWaitingApprovals(),
    enabled: pendingQueryEnabled,
  });

  const { data: actedRequests = [], isFetching: actedLoading } = useQuery({
    queryKey: ['approval-user', 'acted-approvals'],
    queryFn: () => approvalRequestApi.listActedApprovals(),
    enabled: actedQueryEnabled,
  });

  const composeHubInboxPreviewRows = useMemo(() => {
    const map = new Map<string, ApprovalRequestDetail>();
    for (const r of pendingRequests) {
      map.set(r.requestId, r);
    }
    for (const r of waitingApprovals) {
      if (!map.has(r.requestId)) map.set(r.requestId, r);
    }
    for (const r of actedRequests) {
      if (!map.has(r.requestId)) map.set(r.requestId, r);
    }
    return [...map.values()].sort((a, b) => {
      const tb = dayjs(b.createdAt).valueOf();
      const ta = dayjs(a.createdAt).valueOf();
      if (tb !== ta) return tb - ta;
      return a.requestId.localeCompare(b.requestId);
    });
  }, [actedRequests, pendingRequests, waitingApprovals]);

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

  const { data: composeRemoteAttachments = [], isFetching: composeRemoteAttachmentsLoading } =
    useQuery({
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
    () =>
      myRequestsAllForSummary.filter((r) => String(r.requestStatus).toUpperCase() === 'REJECTED')
        .length,
    [myRequestsAllForSummary],
  );
  const unreadViewerCount = useMemo(
    () =>
      [...viewerCcRequests, ...viewerCirculationRequests].filter((row) => {
        const mine = row.viewers?.filter((v) => memberKeyEq(v.viewerMemberId, authMemberId));
        if (!mine?.length) return false;
        return mine.some(
          (v) => String(v.viewerReadStatus).toUpperCase() !== 'READ' || !v.viewedAt?.trim(),
        );
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
  const { data: composeHubMyContracts = [], isLoading: composeHubMyContractsLoading } = useQuery({
    queryKey: ['contract', 'my', 'compose-hub-preview'],
    queryFn: () => contractTemplateApi.listMyContracts(),
    enabled: onComposeHub,
    staleTime: 60_000,
  });
  const composeHubMyContractsPreview = useMemo(() => {
    return [...composeHubMyContracts]
      .sort((a, b) => {
        const ta = dayjs(a.updatedAt || a.createdAt).valueOf();
        const tb = dayjs(b.updatedAt || b.createdAt).valueOf();
        return tb - ta;
      })
      .slice(0, 8);
  }, [composeHubMyContracts]);
  const myOrganizationIdForDept = useMemo(() => {
    const fromDetail = (
      drafterProfile as { organizationId?: string } | undefined
    )?.organizationId?.trim();
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
  }, [onMyTab, guideBox, myRequests, viewerCcRequests, viewerCirculationRequests]);

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

  const closeEmbeddedApprovalModal = () => {
    try {
      sessionStorage.setItem(APPROVAL_HUB_REFRESH_ON_RETURN_KEY, '1');
    } catch {
      // ignore
    }
    try {
      window.parent?.postMessage({ type: APPROVAL_EMBED_CLOSE_MESSAGE }, window.location.origin);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (isEmbedComposeModal) return;
    const handleEmbedClose = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data as { type?: unknown } | null;
      if (!data || typeof data !== 'object' || data.type !== APPROVAL_EMBED_CLOSE_MESSAGE) return;
      setComposeHomeMoreModal(null);
      setCorrectionEmbedSrc(null);
      void qc.invalidateQueries({ queryKey: ['approval-user'] });
      void qc.invalidateQueries({ queryKey: ['approval', 'documents', 'active'] });
    };
    window.addEventListener('message', handleEmbedClose);
    return () => window.removeEventListener('message', handleEmbedClose);
  }, [isEmbedComposeModal, qc]);

  const hardReloadToMyInbox = () => {
    const params = new URLSearchParams({ tab: 'my', box: 'per-all' });
    if (isEmbedComposeModal) params.set('embed', APPROVAL_EMBED_QUERY);
    window.location.replace(`/app/approvals?${params.toString()}`);
  };

  const createRequestM = useMutation({
    mutationFn: (vars: { payload: CreateApprovalRequestPayload; attachmentFiles?: File[] }) =>
      createApprovalRequestWithAttachments(vars.payload, vars.attachmentFiles, {
        documentName: selectedDocument?.documentName ?? null,
      }),
    onSuccess: async (res) => {
      setComposeAttachmentFiles([]);
      await qc.invalidateQueries({ queryKey: ['approval', 'attachments'] });
      if (res.requestStatus === 'DRAFT') {
        message.success('임시저장되었습니다.');
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
        if (isEmbedComposeModal) {
          closeEmbeddedApprovalModal();
          return;
        }
        hardReloadToMyInbox();
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
      if (isEmbedComposeModal) {
        closeEmbeddedApprovalModal();
        return;
      }
      hardReloadToMyInbox();
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
        if (isEmbedComposeModal) {
          closeEmbeddedApprovalModal();
          return;
        }
        hardReloadToMyInbox();
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
      if (isEmbedComposeModal) {
        closeEmbeddedApprovalModal();
        return;
      }
      hardReloadToMyInbox();
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
    composeMeetingAudioBlobRef.current = null;
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
    async (requestId: string): Promise<boolean> => {
      try {
        const detail = await approvalRequestApi.getRequest(requestId);
        if (String(detail.requestStatus).toUpperCase() !== 'DRAFT') {
          message.warning('임시저장 상태의 문서만 불러올 수 있습니다.');
          return false;
        }
        const doc = activeDocuments.find((d) => d.documentId === detail.documentId);
        if (!doc) {
          message.warning('해당 양식이 비활성화되었거나 목록에 없습니다.');
          return false;
        }
        composeDraftHydratingRef.current = true;
        setComposeAttachmentFiles([]);
        composeMeetingAudioBlobRef.current = null;
        setComposeEditingRequestId(detail.requestId);
        setComposeDeptVisibleYn(detail.isDeptVisibleYn === 'N' ? 'N' : 'Y');
        const draftFields = parseFormSchema(doc.formSchema).fields;
        const content = parseDetailContentJson(detail);
        stripNonPersistedApprovalContentFields(content, draftFields);
        const draftLeaveKind = findApprovalFormFieldByLabel(
          draftFields,
          APPROVAL_VACATION_LEAVE_KIND_FIELD_LABEL,
        );
        const draftFamilySubtype = findApprovalFormFieldByLabel(
          draftFields,
          APPROVAL_FAMILY_EVENT_SUBTYPE_FIELD_LABEL,
        );
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
        if (isEmbedComposeModal) {
          navigate({
            to: '/app/approvals',
            search: (prev) => {
              const next: Record<string, unknown> = {
                ...(prev as Record<string, unknown>),
                tab: 'compose',
                sideNav: APPROVAL_COMPOSE_WORKBENCH_SIDE_NAV,
                embed: APPROVAL_EMBED_QUERY,
              };
              delete next.composeDraftId;
              return next as typeof prev;
            },
            replace: true,
          });
        } else {
          navigateToComposeWorkbench();
        }
        message.success('임시저장 문서를 불러왔습니다.');
        void qc.invalidateQueries({ queryKey: ['approval-user', 'my-requests'] });
        void qc.invalidateQueries({ queryKey: ['approval', 'attachments', requestId] });
        queueMicrotask(() => {
          composeDraftHydratingRef.current = false;
        });
        queueMicrotask(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
        return true;
      } catch (e) {
        composeDraftHydratingRef.current = false;
        message.error(e instanceof Error ? e.message : '문서를 불러오지 못했습니다.');
        return false;
      }
    },
    [activeDocuments, form, isEmbedComposeModal, message, navigate, navigateToComposeWorkbench, qc],
  );

  const cancelRequestM = useMutation({
    mutationFn: (vars: { requestId: string; reason: string; isDraft: boolean }) =>
      approvalRequestApi.cancelRequest(vars.requestId, vars.reason),
    onSuccess: async (_data, vars) => {
      message.success(vars.isDraft ? '임시저장 문서를 삭제했습니다.' : '결재 요청을 취소했습니다.');
      setCancelTarget(null);
      setCancelReason('');
      await refreshUserQueries();
    },
    onError: (e: Error) => message.error(e.message || '처리에 실패했습니다.'),
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
      notifyApprovalRequestChanged(detail);
      const proxy = requestIncludesMyProxyAct(detail, {
        myMemberId: authMemberId,
        myMemberPositionId: pid,
      });
      message.success(proxy ? '대결로 승인 처리했습니다.' : '승인 처리했습니다.');
      setApprovalAction(null);
      setApprovalComment('');
      await Promise.all([
        invalidateApprovalRequestQueries(qc),
        qc.invalidateQueries({ queryKey: ['approval', 'documents', 'active'] }),
      ]);
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
      notifyApprovalRequestChanged(detail);
      const proxy = requestIncludesMyProxyAct(detail, {
        myMemberId: authMemberId,
        myMemberPositionId: pid,
      });
      message.success(proxy ? '대결로 반려 처리했습니다.' : '반려 처리했습니다.');
      setApprovalAction(null);
      setApprovalComment('');
      await Promise.all([
        invalidateApprovalRequestQueries(qc),
        qc.invalidateQueries({ queryKey: ['approval', 'documents', 'active'] }),
      ]);
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
        navigateToComposeWorkbench();
      }
      setComposeEditingRequestId(null);
      setApprovalLineDrafts([]);
      setOrgTreeSelectedKey(undefined);
      setCcViewers([]);
      setCirculationViewers([]);
      setOfficialRecipients([]);
      setComposeDeptVisibleYn('Y');
      const contentPatch = composeContentPatchWithDefaultTitle(
        doc.formSchema,
        formatApprovalDocumentName(doc.documentName),
      );
      form.setFieldsValue({ documentId, content: contentPatch });
      setSelectedDocumentId(documentId);
      setComposeSidebarTab('line');
      setLineInfoTab('approval');
      void applyPolicyLineDrafts(doc);
      setComposePhase('fill');
      queueMicrotask(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
    },
    [applyPolicyLineDrafts, form, navigateToComposeWorkbench],
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

  const embedDocId = normalizeUrlSearchToken(routeSearch.docId);
  const chatbotPrefillFlag = isTruthyPrefillParam(routeSearch.prefill);
  const chatbotPrefillDocId = normalizeUrlSearchToken(
    typeof routeSearch.documentId === 'string' && routeSearch.documentId.trim()
      ? routeSearch.documentId
      : routeSearch.docId,
  );
  const composeDraftIdFromUrl =
    typeof routeSearch.composeDraftId === 'string' ? routeSearch.composeDraftId.trim() : '';

  useEffect(() => {
    if (!isEmbedComposeModal || !composeDraftIdFromUrl) {
      embedComposeDraftBootRef.current = null;
      return;
    }
    if (!activeDocuments.length) return;
    if (embedComposeDraftBootRef.current === composeDraftIdFromUrl) return;
    embedComposeDraftBootRef.current = composeDraftIdFromUrl;
    void (async () => {
      const ok = await openDraftForCompose(composeDraftIdFromUrl);
      if (!ok) embedComposeDraftBootRef.current = null;
    })();
  }, [activeDocuments.length, composeDraftIdFromUrl, isEmbedComposeModal, openDraftForCompose]);

  useEffect(() => {
    if (tab !== 'compose') return;
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
    tab,
    embedDocId,
    activeDocuments,
    selectedDocumentId,
    composePhase,
    initializeComposeForDocument,
  ]);

  // 근태정정신청 자동 모달 - 부모 ApprovalsPage(허브)에서 corrDate 받으면 embed 모달 1회 오픈
  // 모달 안의 iframe 은 embed=compose-modal 모드라 작성 화면만 표시됨
  const correctionAutoOpenRef = useRef(false);
  useEffect(() => {
    // embed 모드(모달 안쪽) 이거나 진입 케이스 아니면 무시
    if (isEmbedComposeModal) return;
    if (!isAutoOpenEntry) {
      correctionAutoOpenRef.current = false;
      return;
    }
    if (correctionAutoOpenRef.current) return;
    if (!routeSearch.docId) return;

    const params = new URLSearchParams();
    params.set('tab', 'compose');
    params.set('embed', APPROVAL_EMBED_QUERY);
    params.set('docId', routeSearch.docId);
    // 근태정정신청 prefill
    if (routeSearch.corrDate) params.set('corrDate', routeSearch.corrDate);
    if (routeSearch.corrClockIn) params.set('corrClockIn', routeSearch.corrClockIn);
    if (routeSearch.corrClockOut) params.set('corrClockOut', routeSearch.corrClockOut);
    // 조퇴계 prefill
    if (routeSearch.elDate) params.set('elDate', routeSearch.elDate);
    if (routeSearch.elTime) params.set('elTime', routeSearch.elTime);
    // 연장근무신청 prefill
    if (routeSearch.otDate) params.set('otDate', routeSearch.otDate);
    if (routeSearch.otStartTime) params.set('otStartTime', routeSearch.otStartTime);
    if (routeSearch.otEndTime) params.set('otEndTime', routeSearch.otEndTime);
    // 자동 모달 플래그
    if (isAutoComposeEntry) params.set('autoCompose', '1');
    // 출퇴근시간 변경 신청서 prefill
    if (routeSearch.schYearMonth) params.set('schYearMonth', routeSearch.schYearMonth);
    if (routeSearch.schSlotId) params.set('schSlotId', routeSearch.schSlotId);
    if (routeSearch.schBreakStart) params.set('schBreakStart', routeSearch.schBreakStart);
    if (routeSearch.schBreakEnd) params.set('schBreakEnd', routeSearch.schBreakEnd);
    if (routeSearch.schReason) params.set('schReason', routeSearch.schReason);
    setCorrectionEmbedSrc(`/app/approvals?${params.toString()}`);
    correctionAutoOpenRef.current = true;
  }, [
    isEmbedComposeModal,
    isAutoOpenEntry,
    isAutoComposeEntry,
    routeSearch.docId,
    routeSearch.corrDate,
    routeSearch.corrClockIn,
    routeSearch.corrClockOut,
    routeSearch.otDate,
    routeSearch.otStartTime,
    routeSearch.otEndTime,
    routeSearch.elDate,
    routeSearch.elTime,
    routeSearch.schYearMonth,
    routeSearch.schSlotId,
    routeSearch.schBreakStart,
    routeSearch.schBreakEnd,
    routeSearch.schReason,
  ]);

  // 근태정정신청 prefill - URL 로 넘어온 corrDate 있으면 form 표준 필드에 채우기, 양식 진입 직후 1회만
  const correctionPrefillAppliedRef = useRef(false);
  useEffect(() => {
    if (composePhase !== 'fill') return;
    const doc = activeDocuments.find((d) => d.documentId === selectedDocumentId);
    if (!doc || doc.documentName !== '근태정정신청') {
      correctionPrefillAppliedRef.current = false;
      return;
    }
    if (correctionPrefillAppliedRef.current) return;
    if (!routeSearch.corrDate) return;
    const date = routeSearch.corrDate;
    // 출/퇴근시각 기본값 - URL prefill 우선, 없으면 09:00 / 18:00 으로 채움 (HH:mm 시간만, 직원이 수정 가능)
    const inTime = routeSearch.corrClockIn || '09:00';
    const outTime = routeSearch.corrClockOut || '18:00';
    form.setFieldsValue({
      content: {
        attendanceDate: date,
        requestedClockIn: inTime,
        requestedClockOut: outTime,
      },
    });
    correctionPrefillAppliedRef.current = true;
  }, [
    composePhase,
    selectedDocumentId,
    activeDocuments,
    routeSearch.corrDate,
    routeSearch.corrClockIn,
    routeSearch.corrClockOut,
    form,
  ]);

  // 연장근무신청 prefill - 내 근태 행별 [초과근무 신청] 진입 시 workDate/startTime/endTime 자동 채움
  const overtimePrefillAppliedRef = useRef(false);
  useEffect(() => {
    if (composePhase !== 'fill') return;
    const doc = activeDocuments.find((d) => d.documentId === selectedDocumentId);
    if (!doc || doc.documentName !== '연장근무신청') {
      overtimePrefillAppliedRef.current = false;
      return;
    }
    if (overtimePrefillAppliedRef.current) return;
    if (!routeSearch.otDate) return;
    // 출/퇴근 default 09:00/18:00 동일 규칙, 연장근무는 보통 정규근무 이후 시작이지만 진입 시 시작값으로 안내
    const start = routeSearch.otStartTime || '18:00';
    const end = routeSearch.otEndTime || '20:00';
    form.setFieldsValue({
      content: {
        workDate: routeSearch.otDate,
        startTime: start,
        endTime: end,
      },
    });
    overtimePrefillAppliedRef.current = true;
  }, [
    composePhase,
    selectedDocumentId,
    activeDocuments,
    routeSearch.otDate,
    routeSearch.otStartTime,
    routeSearch.otEndTime,
    form,
  ]);

  // 조퇴계 prefill - 내 근태 행별 [조퇴 신청] 진입 시 attendanceDate/earlyLeaveTime 자동 채움
  const earlyLeavePrefillAppliedRef = useRef(false);
  useEffect(() => {
    if (composePhase !== 'fill') return;
    const doc = activeDocuments.find((d) => d.documentId === selectedDocumentId);
    if (!doc || doc.documentName !== '조퇴계') {
      earlyLeavePrefillAppliedRef.current = false;
      return;
    }
    if (earlyLeavePrefillAppliedRef.current) return;
    if (!routeSearch.elDate) return;
    const time = routeSearch.elTime || dayjs().format('HH:mm');
    form.setFieldsValue({
      content: {
        attendanceDate: routeSearch.elDate,
        earlyLeaveTime: time,
      },
    });
    earlyLeavePrefillAppliedRef.current = true;
  }, [
    composePhase,
    selectedDocumentId,
    activeDocuments,
    routeSearch.elDate,
    routeSearch.elTime,
    form,
  ]);

  // 출퇴근시간 변경 신청서 prefill - URL params(schYearMonth/schSlotId/...) 우선, 없으면 기존 sessionStorage fallback
  // iframe embed 모달에선 부모 sessionStorage 접근 불가 → URL params 가 정공법, sessionStorage 는 호환 유지
  const schedulePrefillAppliedRef = useRef(false);
  useEffect(() => {
    /** 허브가 아닐 때(sideNav=workbench 등)에도 챗봇 prefill 모달을 띄워야 하므로 onComposeHub 제외 */
    if (tab !== 'compose' || isEmbedComposeModal || !chatbotPrefillFlag || !chatbotPrefillDocId) {
      chatbotPrefillBootRef.current = null;
      return;
    }
    if (!activeDocuments.length) return;
    if (chatbotPrefillBootRef.current === chatbotPrefillDocId) return;
    const doc = activeDocuments.find((d) => d.documentId === chatbotPrefillDocId);
    if (!doc) return;
    chatbotPrefillBootRef.current = chatbotPrefillDocId;
    const params = new URLSearchParams();
    params.set('tab', 'compose');
    params.set('embed', APPROVAL_EMBED_QUERY);
    params.set('docId', chatbotPrefillDocId);
    params.set('documentId', chatbotPrefillDocId);
    params.set('prefill', 'true');
    setCorrectionEmbedSrc(`/app/approvals?${params.toString()}`);
    navigate({
      to: '/app/approvals',
      search: { tab: 'compose' },
      replace: true,
    });
  }, [
    activeDocuments,
    chatbotPrefillDocId,
    chatbotPrefillFlag,
    isEmbedComposeModal,
    navigate,
    tab,
  ]);

  useEffect(() => {
    if (tab !== 'compose' || composePhase !== 'fill') return;
    if (!selectedDocument || selectedDocument.documentName !== '출퇴근시간 변경 신청서') {
      schedulePrefillAppliedRef.current = false;
      return;
    }
    if (schedulePrefillAppliedRef.current) return;

    let yearMonth = routeSearch.schYearMonth ?? '';
    let slotId = routeSearch.schSlotId ?? '';
    let breakStart = routeSearch.schBreakStart ?? '';
    let breakEnd = routeSearch.schBreakEnd ?? '';
    let reason = routeSearch.schReason ?? '';

    // sessionStorage fallback - URL params 가 비어있을 때만
    if (!yearMonth || !slotId) {
      const raw = sessionStorage.getItem(SCHEDULE_SELECTION_PREFILL_STORAGE_KEY);
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as {
            targetYearMonth?: string;
            slotId?: string;
            breakStart?: string | null;
            breakEnd?: string | null;
            requestReason?: string | null;
          };
          yearMonth = yearMonth || parsed.targetYearMonth || '';
          slotId = slotId || parsed.slotId || '';
          breakStart = breakStart || parsed.breakStart || '';
          breakEnd = breakEnd || parsed.breakEnd || '';
          reason = reason || parsed.requestReason || '';
        } catch {
          // ignore bad prefill payload
        } finally {
          sessionStorage.removeItem(SCHEDULE_SELECTION_PREFILL_STORAGE_KEY);
        }
      }
    }

    // 출퇴근시간 변경 신청서는 다음달만 신청 가능 - URL prefill 없으면 다음달로 자동 채움
    if (!yearMonth) {
      yearMonth = dayjs().add(1, 'month').format('YYYY-MM');
    }
    const current = (form.getFieldValue('content') ?? {}) as Record<string, unknown>;
    form.setFieldsValue({
      content: {
        ...current,
        targetYearMonth: yearMonth,
        ...(slotId ? { slotId } : {}),
        ...(breakStart ? { breakStart } : {}),
        ...(breakEnd ? { breakEnd } : {}),
        ...(reason ? { requestReason: reason } : {}),
      },
    });
    schedulePrefillAppliedRef.current = true;
  }, [
    composePhase,
    form,
    message,
    selectedDocument,
    tab,
    routeSearch.schYearMonth,
    routeSearch.schSlotId,
    routeSearch.schBreakStart,
    routeSearch.schBreakEnd,
    routeSearch.schReason,
  ]);

  // 인사발령품의서 prefill - 조직 개편 시뮬에서 localStorage 로 넘겨준 contentJson 자동 채움
  // payload: { documentName: "인사발령품의서", contentJson: { effectiveDate, orderCategory, orderCategoryLabel, reason, summaryText, items: [...] } }
  // localStorage 사용 - iframe 모달도 부모와 동일 origin 으로 접근 가능 (sessionStorage는 분리됨)
  // iframe(embed) 안에서만 처리 - 부모쪽이 먼저 localStorage.removeItem 하면 iframe 이 prefill 못 채우는 문제 방지
  const personnelOrderPrefillAppliedRef = useRef(false);
  useEffect(() => {
    if (!isEmbedComposeModal) return;
    if (tab !== 'compose' || composePhase !== 'fill') return;
    if (!selectedDocument || selectedDocument.documentName !== '인사발령품의서') {
      personnelOrderPrefillAppliedRef.current = false;
      return;
    }
    if (personnelOrderPrefillAppliedRef.current) return;
    const raw = localStorage.getItem(PERSONNEL_ORDER_PREFILL_STORAGE_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as {
        documentName?: string;
        contentJson?: Record<string, unknown>;
        recipients?: { recipientOrganizationId: string; recipientOrganizationName: string }[];
      };
      const cj = parsed.contentJson ?? {};
      const current = (form.getFieldValue('content') ?? {}) as Record<string, unknown>;
      // 사용자 노출 textarea 에는 한글 요약 (UUID 등 ID 제외)
      const summaryText = typeof cj.summaryText === 'string' ? cj.summaryText : '';
      form.setFieldsValue({
        content: {
          ...current,
          ...cj,
          contentJsonText: summaryText,
        },
      });
      // 인사발령품의서 = OFFICIAL 양식. recipients (수신 부서) 자동 설정
      // 결재 승인 후 기안자가 [발송] 누르면 회사 모든 부서 부서문서함에 노출
      if (Array.isArray(parsed.recipients) && parsed.recipients.length > 0) {
        setOfficialRecipients(
          parsed.recipients
            .map((r) => ({
              recipientOrganizationId: String(r.recipientOrganizationId ?? '').trim(),
              recipientOrganizationName: String(r.recipientOrganizationName ?? '').trim(),
            }))
            .filter((r) => r.recipientOrganizationId),
        );
      }
      personnelOrderPrefillAppliedRef.current = true;
      message.success(
        '조직 개편 시뮬 변경 사항을 결재 양식에 채웠습니다. 결재선만 지정해 신청하세요.',
      );
    } catch {
      // ignore bad payload
    } finally {
      localStorage.removeItem(PERSONNEL_ORDER_PREFILL_STORAGE_KEY);
    }
  }, [composePhase, form, isEmbedComposeModal, message, selectedDocument, tab]);

  // 휴가신청서 prefill - 휴가 계획 내역 [휴가 신청] 버튼에서 넘겨준 startDate/endDate/plannedDates 자동 채움
  // localStorage 사용 - iframe 모달도 부모와 동일 origin 으로 접근 가능 (sessionStorage는 분리됨)
  // autoCompose 진입은 iframe 안에서 양식이 표시되므로 storage 비우기는 iframe 컨텍스트에서만 수행
  // (부모가 먼저 비워버리면 iframe 까지 prefill 데이터가 도달 못 함)
  useEffect(() => {
    if (tab !== 'compose' || composePhase !== 'fill') return;
    const raw =
      localStorage.getItem(LEAVE_REQUEST_PREFILL_STORAGE_KEY) ??
      sessionStorage.getItem(LEAVE_REQUEST_PREFILL_STORAGE_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as {
        documentId?: string;
        content?: Record<string, unknown>;
      };
      if (!parsed.documentId || parsed.documentId !== selectedDocumentId) return;
      if (!parsed.content || typeof parsed.content !== 'object' || Array.isArray(parsed.content))
        return;
      const normalizedContent =
        selectedDocument?.documentName === '휴가신청서'
          ? normalizeLeavePrefillContent(parsed.content, companyHolidaySet)
          : parsed.content;
      const current = (form.getFieldValue('content') ?? {}) as Record<string, unknown>;
      form.setFieldsValue({
        content: {
          ...current,
          ...normalizedContent,
        },
      });
      message.success(
        '휴가 계획에서 가져온 날짜가 자동 입력되었습니다. 결재선 지정 후 신청하세요.',
      );
      // iframe(embed) 컨텍스트에서만 storage 비움. 부모가 비우면 iframe 에 데이터 도달 못 함
      if (isEmbedComposeModal) {
        localStorage.removeItem(LEAVE_REQUEST_PREFILL_STORAGE_KEY);
        sessionStorage.removeItem(LEAVE_REQUEST_PREFILL_STORAGE_KEY);
      }
    } catch {
      if (isEmbedComposeModal) {
        localStorage.removeItem(LEAVE_REQUEST_PREFILL_STORAGE_KEY);
        sessionStorage.removeItem(LEAVE_REQUEST_PREFILL_STORAGE_KEY);
      }
    }
  }, [
    composePhase,
    form,
    isEmbedComposeModal,
    message,
    selectedDocument,
    selectedDocumentId,
    tab,
    companyHolidaySet,
  ]);

  // 챗봇 액션 prefill - sessionStorage 로 넘겨준 documentId+content 자동 입력
  useEffect(() => {
    if (tab !== 'compose' || composePhase !== 'fill') return;
    const raw = sessionStorage.getItem(CHATBOT_ACTION_PREFILL_STORAGE_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as {
        documentId?: string;
        content?: Record<string, unknown>;
      };
      if (!parsed.documentId || parsed.documentId !== selectedDocumentId) return;
      if (!parsed.content || typeof parsed.content !== 'object' || Array.isArray(parsed.content))
        return;
      const normalizedContent =
        selectedDocument?.documentName === '휴가신청서'
          ? normalizeLeavePrefillContent(parsed.content, companyHolidaySet)
          : parsed.content;
      const current = (form.getFieldValue('content') ?? {}) as Record<string, unknown>;
      form.setFieldsValue({
        content: {
          ...current,
          ...normalizedContent,
        },
      });
      message.info('챗봇 제안값이 결재 양식에 자동 입력되었습니다.');
      sessionStorage.removeItem(CHATBOT_ACTION_PREFILL_STORAGE_KEY);
    } catch {
      sessionStorage.removeItem(CHATBOT_ACTION_PREFILL_STORAGE_KEY);
    }
  }, [composePhase, form, message, selectedDocument, selectedDocumentId, tab, companyHolidaySet]);

  const toggleBookmark = useCallback((requestId: string) => {
    setBookmarkedRequestIds((prev) => {
      const exists = prev.includes(requestId);
      const next = exists
        ? prev.filter((id) => id !== requestId)
        : [requestId, ...prev].slice(0, 20);
      try {
        localStorage.setItem(APPROVAL_HOME_BOOKMARKS_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const syncStepOrder = (rows: ApprovalLineDraft[]) =>
    rows.map((r, idx) => ({ ...r, stepOrder: idx + 1 }));

  const orderedApprovalLineDrafts = useMemo(
    () => syncStepOrder([...approvalLineDrafts]),
    [approvalLineDrafts],
  );
  const approvalLineSortableIds = useMemo(
    () => orderedApprovalLineDrafts.map((r) => r.id),
    [orderedApprovalLineDrafts],
  );

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
    if (authMemberId?.trim() && memberKeyEq(memberId, authMemberId)) {
      message.warning('기안자 본인은 결재선에 추가할 수 없습니다.');
      return;
    }
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
    if (authMemberId?.trim() && memberKeyEq(memberId, authMemberId)) {
      message.warning(
        viewerType === 'CC'
          ? '기안자 본인은 참조자로 추가할 수 없습니다.'
          : '기안자 본인은 공람자로 추가할 수 없습니다.',
      );
      return;
    }
    const list = viewerType === 'CC' ? ccViewers : circulationViewers;
    if (collectViewerMemberIds(list).has(memberId)) {
      message.info(
        viewerType === 'CC'
          ? '이미 참조자로 추가된 멤버입니다.'
          : '이미 공람자로 추가된 멤버입니다.',
      );
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
      const eligibleIds = authMemberId?.trim()
        ? memberIds.filter((id) => !memberKeyEq(id, authMemberId))
        : memberIds;
      if (!memberIds.length) {
        message.info('선택한 조직에 추가할 멤버가 없습니다.');
        return;
      }
      if (!eligibleIds.length) {
        message.warning('기안자 본인만 소속된 경우 결재선에 추가할 수 없습니다.');
        return;
      }
      const newMembers: ApprovalLineOrgMember[] = [];
      for (const memberId of eligibleIds) {
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
        const orgIdx = prev.findIndex(
          (r) => r.kind === 'org' && r.organizationId === organizationId,
        );
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
    [selectedDocument, orgChart, message, authMemberId],
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
      const eligibleIds = authMemberId?.trim()
        ? memberIds.filter((id) => !memberKeyEq(id, authMemberId))
        : memberIds;
      if (!memberIds.length) {
        message.info('선택한 조직에 추가할 멤버가 없습니다.');
        return;
      }
      if (!eligibleIds.length) {
        message.warning('기안자 본인만 소속된 경우 참조·공람에 추가할 수 없습니다.');
        return;
      }
      type Vm = Omit<ViewerMemberDraft, 'kind'>;
      const newMembers: Vm[] = [];
      for (const memberId of eligibleIds) {
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
        const orgIdx = prev.findIndex(
          (r) => r.kind === 'org' && r.organizationId === organizationId,
        );
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
        message.info(
          viewerType === 'CC' ? '모든 멤버가 이미 참조자입니다.' : '모든 멤버가 이미 공람자입니다.',
        );
      } else {
        message.success(
          viewerType === 'CC'
            ? `참조자에 조직 ${node.name} 소속 ${addedCount}명을 반영했습니다.`
            : `공람자에 조직 ${node.name} 소속 ${addedCount}명을 반영했습니다.`,
        );
      }
    },
    [selectedDocument, orgChart, message, authMemberId],
  );

  const addFromOrgPickerByCurrentTab = useCallback(
    async (
      payload: { kind: 'member'; memberId: string } | { kind: 'org'; organizationId: string },
    ) => {
      if (lineInfoTab === 'approval') {
        if (payload.kind === 'member') await addApproverFromOrg(payload.memberId);
        else await bulkAddApproversFromOrg(payload.organizationId);
        return;
      }
      const viewerType: ViewerType = lineInfoTab === 'cc' ? 'CC' : 'CIRCULATION';
      if (payload.kind === 'member') await addViewerFromOrg(payload.memberId, viewerType);
      else await bulkAddViewersFromOrg(payload.organizationId, viewerType);
    },
    [
      addApproverFromOrg,
      addViewerFromOrg,
      bulkAddApproversFromOrg,
      bulkAddViewersFromOrg,
      lineInfoTab,
    ],
  );

  const composeAttachmentAcceptAttr = useMemo(
    () =>
      Array.from(APPROVAL_ATTACHMENT_ALLOWED_EXT)
        .map((ext) => `.${ext}`)
        .join(','),
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
      const values = form.getFieldsValue(true) as {
        documentId?: string;
        content?: Record<string, unknown>;
      };
      if (!selectedDocument) {
        message.warning('양식을 선택해 주세요.');
        return;
      }

      const contentForSubmit = { ...(values.content ?? {}) };
      const isAllowanceChangeDocument = selectedDocument.documentName === '수당 변경 신청';
      if (isAllowanceChangeDocument) {
        const selectedTemplateId = readStr(contentForSubmit, 'salaryItemTemplateId');
        if (status === 'WAIT' && !selectedTemplateId) {
          message.warning('수당 항목을 선택해 주세요.');
          return;
        }
        if (selectedTemplateId) {
          const fixedAmount = allowanceFixedAmountByTemplate.get(selectedTemplateId);
          if (fixedAmount == null) {
            message.warning(
              '선택한 수당의 회사 고정 금액을 찾을 수 없습니다. 관리자에게 확인해 주세요.',
            );
            return;
          }
          contentForSubmit.amount = fixedAmount;
        }
      }
      if (vacationLeaveKindField && familyEventSubtypeField) {
        const kind = contentForSubmit[vacationLeaveKindField.name];
        if (kind !== APPROVAL_FAMILY_EVENT_LEAVE_KIND_OPTION) {
          delete contentForSubmit[familyEventSubtypeField.name];
        }
      }

      // 근태정정신청 special - 출근/퇴근 시각 중 하나 이상은 필수, form 검증으로 못 잡으니 별도 체크
      if (selectedDocument.documentName === '근태정정신청' && status === 'WAIT') {
        const inVal = readStr(contentForSubmit, 'requestedClockIn');
        const outVal = readStr(contentForSubmit, 'requestedClockOut');
        if (!inVal && !outVal) {
          message.warning('정정 출근시각 또는 퇴근시각 중 하나 이상을 입력해 주세요.');
          return;
        }
      }

      // 저장 안 할 필드 제거
      stripNonPersistedApprovalContentFields(contentForSubmit, selectedSchema.fields);

      // 회의 녹음(ai_transcribe) + 일반 첨부 합해서 3개 초과 차단
      const wantsMeetingAudio = selectedSchema.fields.some(
        (f) => f.type === 'ai_transcribe' && f.config?.attachAudio === true,
      );
      const pendingMeetingBlob = composeMeetingAudioBlobRef.current;
      const meetingAudioSlot =
        wantsMeetingAudio && pendingMeetingBlob && pendingMeetingBlob.size > 0 ? 1 : 0;
      if (
        composeRemoteAttachments.length + composeAttachmentFiles.length + meetingAudioSlot >
        APPROVAL_ATTACHMENT_MAX_COUNT
      ) {
        message.warning(
          '첨부는 최대 3개입니다. 회의 녹음을 첨부하려면 일반 첨부 개수를 줄여 주세요.',
        );
        return;
      }

      const flatApprovers = flattenApprovalLinesForSubmit(approvalLineDrafts);
      const approvalLines = flatApprovers.map((line, idx) => ({
        stepOrder: idx + 1,
        approverMemberId: line.approverMemberId,
        approverMemberPositionId: line.approverMemberPositionId,
        approverName: line.approverName,
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
      let resultDetail: ApprovalRequestDetail;
      if (composeEditingRequestId) {
        resultDetail = await updateRequestM.mutateAsync({
          requestId: composeEditingRequestId,
          payload,
          attachmentFiles: attach.length ? attach : undefined,
        });
      } else {
        resultDetail = await createRequestM.mutateAsync({
          payload,
          attachmentFiles: attach.length ? attach : undefined,
        });
      }

      const attachMeeting = wantsMeetingAudio && pendingMeetingBlob && pendingMeetingBlob.size > 0;
      if (attachMeeting) {
        try {
          const file = new File([pendingMeetingBlob], `meeting_${Date.now()}.webm`, {
            type: pendingMeetingBlob.type || 'video/webm',
          });
          await approvalAttachmentsApi.uploadAttachments(resultDetail.requestId, [file]);
          composeMeetingAudioBlobRef.current = null;
          void qc.invalidateQueries({
            queryKey: ['approval', 'attachments', resultDetail.requestId],
          });
        } catch (e) {
          const detail = e instanceof Error ? e.message : String(e);
          message.warning(
            `회의 녹음 첨부에 실패했습니다. 서버에서 webm을 아직 허용하지 않을 수 있습니다. 본문 텍스트는 저장되었습니다. (${detail})`,
          );
        }
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
      <div
        className="tw-flex tw-flex-nowrap tw-items-center tw-justify-center tw-gap-x-2 tw-whitespace-nowrap"
        onClick={(e) => e.stopPropagation()}
      >
        {showResume ? (
          <Button
            type="link"
            size="small"
            className="!tw-h-7 !tw-px-2"
            icon={<FolderOpenOutlined />}
            onClick={() => void openDraftForCompose(row.requestId)}
          >
            이어쓰기
          </Button>
        ) : null}
        {showCancel ? (
          st === 'DRAFT' ? (
            <Tooltip title="삭제">
              <Button
                type="link"
                size="small"
                className="!tw-inline-flex !tw-h-7 !tw-w-7 !tw-items-center !tw-justify-center !tw-p-0"
                danger
                icon={<DeleteOutlined />}
                aria-label="임시저장 문서 삭제"
                onClick={() => setCancelTarget(row)}
              />
            </Tooltip>
          ) : (
            <Button
              type="link"
              size="small"
              className="!tw-h-7 !tw-px-2"
              danger
              onClick={() => setCancelTarget(row)}
            >
              취소
            </Button>
          )
        ) : null}
        {showOfficialPreSendCancel ? (
          <Button
            type="link"
            size="small"
            className="!tw-h-7 !tw-px-2"
            danger
            onClick={() => setCancelTarget(row)}
          >
            발송 취소
          </Button>
        ) : null}
      </div>
    );
  };

  /** 공문 문서함(per-official) — 승인·미발송 시 관리 열을 `발송` / `취소` 버튼으로 표시 */
  const renderOfficialInboxActions = (_: unknown, row: ApprovalRequestDetail) => {
    if (canSendOfficialDocument(row, authMemberId)) {
      const rid = row.requestId;
      return (
        <Space size="small" wrap={false} onClick={(e) => e.stopPropagation()}>
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
      <div
        className="tw-flex tw-flex-nowrap tw-items-center tw-justify-center tw-gap-x-2 tw-whitespace-nowrap"
        onClick={(e) => e.stopPropagation()}
      >
        <Button
          type="link"
          size="small"
          className="!tw-h-7 !tw-px-2"
          icon={<FolderOpenOutlined />}
          onClick={() => void openDraftForCompose(row.requestId)}
        >
          이어쓰기
        </Button>
        <Tooltip title="삭제">
          <Button
            type="link"
            size="small"
            className="!tw-inline-flex !tw-h-7 !tw-w-7 !tw-items-center !tw-justify-center !tw-p-0"
            danger
            icon={<DeleteOutlined />}
            aria-label="임시저장 문서 삭제"
            onClick={() => setCancelTarget(row)}
          />
        </Tooltip>
      </div>
    );
  };

  const myColumns = [
    {
      title: '제목',
      key: 'subject',
      width: 160,
      align: 'left' as const,
      ellipsis: true,
      render: (_: unknown, row: ApprovalRequestDetail) => getApprovalRequestSubjectLine(row) || '—',
    },
    {
      title: '양식',
      dataIndex: 'documentName',
      key: 'documentName',
      width: 120,
      align: 'center' as const,
      ellipsis: true,
      render: (name: string | undefined) => name?.trim() || '—',
    },
    {
      title: '결재선',
      key: 'approvalLineStrip',
      width: 180,
      onCell: () => ({ className: '!tw-align-middle !tw-min-w-0 !tw-max-w-0' }),
      onHeaderCell: () => ({ className: '!tw-text-center' }),
      render: (_: unknown, row: ApprovalRequestDetail) => (
        <ApprovalLineMiniStrip lines={row.approvalLines} visibleSlots={3} />
      ),
    },
    {
      title: '상태',
      dataIndex: 'requestStatus',
      key: 'requestStatus',
      width: 120,
      align: 'center' as const,
      render: (status: string) => statusTag(status),
    },
    {
      title: '기안일',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 148,
      align: 'center' as const,
      render: (v: string) => formatDateTime(v),
    },
    {
      title: '관리',
      key: 'actions',
      width: 168,
      align: 'center' as const,
      onCell: () => ({ style: { verticalAlign: 'middle' as const } }),
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
      width: 160,
      align: 'left' as const,
      ellipsis: true,
      render: (_: unknown, row: ApprovalRequestDetail) => getApprovalRequestSubjectLine(row) || '—',
    },
    {
      title: '양식',
      dataIndex: 'documentName',
      key: 'documentName',
      width: 120,
      align: 'center' as const,
      ellipsis: true,
      render: (name: string | undefined) => name?.trim() || '—',
    },
    {
      title: '최종 저장시간',
      dataIndex: 'updatedAt',
      key: 'updatedAt',
      width: 148,
      align: 'center' as const,
      render: (v: string) => formatDateTime(v),
    },
    {
      title: '관리',
      key: 'actions',
      width: 168,
      align: 'center' as const,
      onCell: () => ({ style: { verticalAlign: 'middle' as const } }),
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
        const myLine = row.approvalLines.find(
          (l) => String(l.approvalStatus).toUpperCase() === 'PENDING',
        );
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
        const myLine = row.approvalLines.find(
          (l) => String(l.approvalStatus).toUpperCase() === 'PENDING',
        );
        if (!myLine) return '—';
        return `${myLine.stepOrder}단계`;
      },
    },
    {
      title: '관리',
      key: 'actions',
      width: 200,
      render: (_: unknown, row: ApprovalRequestDetail) => {
        const myLine = row.approvalLines.find(
          (l) => String(l.approvalStatus).toUpperCase() === 'PENDING',
        );
        return (
          <Space size="small" wrap onClick={(e) => e.stopPropagation()}>
            <Button
              type="primary"
              size="small"
              disabled={!myLine}
              onClick={() =>
                myLine && setApprovalAction({ approvalId: myLine.approvalId, mode: 'approve' })
              }
            >
              승인
            </Button>
            <Button
              danger
              size="small"
              disabled={!myLine}
              onClick={() =>
                myLine && setApprovalAction({ approvalId: myLine.approvalId, mode: 'reject' })
              }
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
        render: (_: unknown, row: ApprovalRequestDetail) =>
          getApprovalRequestSubjectLine(row) || '—',
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
          unreadViewerForMember(row, authMemberId) ? (
            <Tag color="error">미열람</Tag>
          ) : (
            <Tag>열람</Tag>
          ),
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
        ...prev,
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
      <AppSearchBar
        value={memberKeyword}
        onValueChange={setMemberKeyword}
        onSearch={setMemberKeyword}
        placeholder="이름, 직위, 부서 검색"
        ariaLabel="결재 조직도 구성원 검색"
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
            orgTreeSelectedKey && !String(orgTreeSelectedKey).startsWith('member:')
              ? [orgTreeSelectedKey]
              : []
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
        조직·멤버 노드를 클릭하거나 오른쪽 목록으로 드래그해 추가하세요. 조직 이름을 클릭하면 하위
        부서와 소속 멤버가 펼쳐집니다. 오른쪽에는 조직 단위로 표시되며, 제출 시 해당 조직(하위 부서
        포함) 소속 멤버 전원에게 반영됩니다.
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
                onClick={() =>
                  void addFromOrgPickerByCurrentTab({ kind: 'member', memberId: m.memberId })
                }
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
        <AppDataTable<ViewerDraft>
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
                  <Tag color={viewerType === 'CC' ? 'default' : 'blue'}>
                    {viewerType === 'CC' ? '참조' : '공람'}
                  </Tag>
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
              render: (_, row) =>
                row.kind === 'org' ? row.organizationName : row.organizationName || '—',
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

  const viewerInitial = (name: string) => (name.trim().charAt(0) || '?').toUpperCase();

  const sidebarDrafterName = drafterProfile?.name?.trim() || user?.name?.trim() || '—';
  const sidebarDrafterOrg =
    drafterProfile?.organizationName?.trim() || user?.departmentName?.trim() || '—';
  const sidebarDrafterTitle = drafterProfile?.jobTitleName?.trim() || user?.jobTitle?.trim() || '';

  const composeToolbarGhostBtn =
    '!tw-inline-flex !tw-h-8 !tw-items-center !tw-gap-1 !tw-rounded-sm !tw-border-0 !tw-bg-transparent !tw-px-2 !tw-text-sm !tw-font-normal !tw-text-[#111827] !tw-shadow-none hover:!tw-bg-black/[0.04] disabled:!tw-opacity-50';
  const composeActionSecondaryBtn =
    '!tw-inline-flex !tw-h-9 !tw-items-center !tw-gap-1.5 !tw-rounded-lg !tw-border !tw-border-slate-200 !tw-bg-white !tw-px-3.5 !tw-text-sm !tw-font-semibold !tw-text-slate-700 !tw-shadow-none hover:!tw-border-slate-300 hover:!tw-bg-slate-50 hover:!tw-text-slate-900 disabled:!tw-border-slate-200 disabled:!tw-bg-slate-50 disabled:!tw-text-slate-400 disabled:!tw-opacity-100';
  const composeActionPrimaryBtn =
    '!tw-inline-flex !tw-h-9 !tw-items-center !tw-gap-1.5 !tw-rounded-lg !tw-border-[#1e3a5f] !tw-bg-[#1e3a5f] !tw-px-4 !tw-text-sm !tw-font-semibold !tw-text-white !tw-shadow-sm !tw-shadow-slate-900/10 hover:!tw-border-[#172f4d] hover:!tw-bg-[#172f4d] hover:!tw-text-white disabled:!tw-border-[#1e3a5f]/60 disabled:!tw-bg-[#1e3a5f]/60 disabled:!tw-text-white/75 disabled:!tw-opacity-100';

  const renderComposeToolbar = (opts?: { showDocumentTitle?: boolean }) => {
    const showTitle = opts?.showDocumentTitle ?? false;
    const hasDraftMeta = Boolean(composeEditingRequestId);
    const hasDocTitle = showTitle && selectedDocument;
    if (!hasDraftMeta && !hasDocTitle) return null;
    return (
      <div className="tw-mb-2 tw-flex tw-flex-wrap tw-items-center tw-justify-between tw-gap-2 tw-bg-white tw-px-3 tw-py-2">
        <Space wrap size={[4, 6]} className="!tw-items-center">
          {composeEditingRequestId ? (
            <Tag color="gold" className="!tw-m-0 !tw-text-xs">
              임시저장 수정 중
            </Tag>
          ) : null}
          {composeEditingRequestId ? (
            <Button
              type="text"
              size="small"
              className={composeToolbarGhostBtn}
              onClick={() => resetComposeToNew()}
            >
              새 작성
            </Button>
          ) : null}
        </Space>
        {hasDocTitle ? (
          <Typography.Text
            type="secondary"
            className="!tw-max-w-[10rem] !tw-truncate !tw-text-xs !tw-text-[#666] sm:!tw-max-w-[14rem]"
          >
            {formatApprovalDocumentName(selectedDocument.documentName)}
          </Typography.Text>
        ) : null}
      </div>
    );
  };

  /** 스크롤 영역 하단 — 임시저장·결재요청 (상단 툴바에서는 제거) */
  const renderComposeDraftSubmitActions = () => (
    <div className="tw-flex tw-shrink-0 tw-flex-wrap tw-items-center tw-justify-end tw-gap-x-3 tw-gap-y-2 tw-border-t tw-border-slate-200 tw-bg-white tw-px-3 tw-py-2.5">
      <Button
        type="default"
        disabled={composeSaving}
        icon={<SaveOutlined className="tw-text-[13px]" />}
        className={composeActionSecondaryBtn}
        onClick={() => void submitCompose('DRAFT')}
      >
        임시저장
      </Button>
      <Button
        type="primary"
        disabled={composeSaving}
        icon={<FormOutlined className="tw-text-[13px]" />}
        className={composeActionPrimaryBtn}
        onClick={() => void submitCompose('WAIT')}
      >
        결재요청
      </Button>
    </div>
  );

  const renderComposeDocumentSidebar = (opts?: { variant?: 'card' | 'flush' }) => {
    const variant = opts?.variant ?? 'card';
    return (
      <div
        className={clsx(
          composeApprovalInfoAsideClass,
          variant === 'flush'
            ? 'tw-flex tw-h-full tw-min-h-0 tw-flex-col tw-overflow-hidden tw-bg-white'
            : 'tw-overflow-hidden tw-rounded-xl tw-border tw-border-slate-200 tw-bg-white tw-shadow-[0_1px_4px_rgba(15,23,42,0.06)]',
        )}
      >
        <div
          className={clsx(
            'tw-px-3 tw-py-3',
            variant === 'flush'
              ? 'tw-flex tw-min-h-0 tw-flex-1 tw-flex-col tw-overflow-hidden tw-bg-slate-50/80'
              : 'tw-bg-slate-50',
          )}
        >
          <Tabs
            size="small"
            className={clsx(
              'wf-approval-modal-tabs',
              variant === 'flush' && 'wf-compose-approval-sidebar-tabs',
              variant === 'flush' && 'tw-flex tw-min-h-0 tw-flex-1 tw-flex-col tw-overflow-hidden',
            )}
            activeKey={composeSidebarTab}
            onChange={(k) => setComposeSidebarTab(k as 'line' | 'doc')}
            items={[
              {
                key: 'line',
                label: '결재선',
                children: (
                  <div className="wf-compose-approval-line-panel">
                    <>
                      <button
                        type="button"
                        onClick={() => openComposeApprovalModal('approval')}
                        className="wf-compose-approval-line-card wf-compose-approval-line-card-drafter"
                      >
                        <div className="tw-flex tw-gap-3 tw-px-3 tw-py-3">
                          <Avatar
                            className="wf-compose-approval-line-avatar wf-compose-approval-line-avatar-primary"
                            src={drafterProfile?.profileUrl ?? undefined}
                          >
                            {viewerInitial(sidebarDrafterName)}
                          </Avatar>
                          <div className="tw-min-w-0 tw-flex-1">
                            <Typography.Text
                              strong
                              className="!tw-block !tw-text-sm !tw-text-[#102a43]"
                            >
                              {sidebarDrafterName}
                              {sidebarDrafterTitle ? ` ${sidebarDrafterTitle}` : ''}
                            </Typography.Text>
                            <Typography.Text
                              type="secondary"
                              className="!tw-mt-0.5 !tw-block !tw-text-xs !tw-text-slate-500"
                            >
                              {sidebarDrafterOrg}
                            </Typography.Text>
                          </div>
                        </div>
                        <div className="wf-compose-approval-line-role">
                          기안
                        </div>
                      </button>
                      {orderedApprovalLineDrafts.length === 0 ? (
                        <button
                          type="button"
                          onClick={() => openComposeApprovalModal('approval')}
                          className="wf-compose-approval-line-empty"
                        >
                          결재자를 지정하지 않았습니다. 클릭하여 조직도에서 추가하세요.
                        </button>
                      ) : (
                        orderedApprovalLineDrafts.map((row) => (
                          <button
                            key={row.id}
                            type="button"
                            onClick={() => openComposeApprovalModal('approval')}
                            className="wf-compose-approval-line-card"
                          >
                            <div className="tw-flex tw-gap-3 tw-px-3 tw-py-3">
                              <Avatar className="wf-compose-approval-line-avatar">
                                {row.kind === 'org'
                                  ? viewerInitial(row.organizationName)
                                  : viewerInitial(row.memberName)}
                              </Avatar>
                              <div className="tw-min-w-0 tw-flex-1">
                                <Typography.Text strong className="!tw-block !tw-text-sm !tw-text-[#102a43]">
                                  {row.kind === 'org'
                                    ? `${row.organizationName} (${row.members.length}명)`
                                    : `${row.memberName}${row.jobTitleName ? ` ${row.jobTitleName}` : ''}`}
                                </Typography.Text>
                                <Typography.Text
                                  type="secondary"
                                  className="!tw-mt-0.5 !tw-block !tw-text-xs !tw-text-slate-500"
                                >
                                  {row.kind === 'org' ? '조직' : row.organizationName || '—'}
                                </Typography.Text>
                                <Typography.Text
                                  type="secondary"
                                  className="!tw-mt-1 !tw-block !tw-text-[11px] !tw-font-medium !tw-text-slate-400"
                                >
                                  결재 예정 · {row.stepOrder}단계
                                </Typography.Text>
                              </div>
                            </div>
                          </button>
                        ))
                      )}
                      <div className="wf-compose-approval-line-viewers">
                        <Button
                          type="link"
                          size="small"
                          className="!tw-h-auto !tw-p-0 !tw-text-left !tw-text-xs !tw-font-bold !tw-text-[#2563eb]"
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
                  <div className="tw-flex tw-min-h-0 tw-flex-col tw-gap-3">
                    <Descriptions size="small" column={1} bordered className="!tw-bg-white">
                      <Descriptions.Item label="양식명">
                        {formatApprovalDocumentName(selectedDocument.documentName)}
                      </Descriptions.Item>
                      <Descriptions.Item label="유형">
                        {approvalRequestTypeLabelKo(selectedDocument.requestType)}
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
                                <Typography.Text
                                  type="secondary"
                                  className="!tw-mt-0.5 !tw-block !tw-text-[11px]"
                                >
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
                                <Typography.Text
                                  type="secondary"
                                  className="!tw-mt-0.5 !tw-block !tw-text-[11px]"
                                >
                                  {v.organizationName || '—'}
                                </Typography.Text>
                              </div>
                            </div>
                          ),
                        )
                      )}
                    </div>
                    <Button
                      type="link"
                      size="small"
                      className="!tw-h-auto !tw-p-0 !tw-text-xs"
                      onClick={() => openComposeApprovalModal('cc')}
                    >
                      참조자 편집
                    </Button>
                    <Divider className="!tw-my-1" />
                    <Typography.Text strong className="!tw-text-xs !tw-text-slate-700">
                      공람
                    </Typography.Text>
                    <Typography.Text
                      type="secondary"
                      className="!tw-mb-1 !tw-block !tw-text-[11px]"
                    >
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
                                <Typography.Text
                                  type="secondary"
                                  className="!tw-mt-0.5 !tw-block !tw-text-[11px]"
                                >
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
                                <Typography.Text
                                  type="secondary"
                                  className="!tw-mt-0.5 !tw-block !tw-text-[11px]"
                                >
                                  {v.organizationName || '—'}
                                </Typography.Text>
                              </div>
                            </div>
                          ),
                        )
                      )}
                    </div>
                    <Button
                      type="link"
                      size="small"
                      className="!tw-h-auto !tw-p-0 !tw-text-xs"
                      onClick={() => openComposeApprovalModal('circulation')}
                    >
                      공람자 편집
                    </Button>
                    <Divider className="!tw-my-1" />
                    <Typography.Text
                      strong
                      className="!tw-mb-1 !tw-block !tw-text-xs !tw-text-slate-700"
                    >
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
    <Card
      size="small"
      title="내 결재선"
      variant="borderless"
      className={APPROVAL_COMPOSE_CARD_CLASS}
    >
      <DndContext
        sensors={approvalLineSensors}
        collisionDetection={closestCenter}
        onDragEnd={onApprovalLineDragEnd}
      >
        <SortableContext items={approvalLineSortableIds} strategy={verticalListSortingStrategy}>
          <AppDataTable<ApprovalLineDraft>
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
                  ) : row.source === 'policy' &&
                    row.policyCandidates &&
                    row.policyCandidates.length > 1 ? (
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
                render: (_, row) =>
                  row.kind === 'org' ? row.organizationName : row.organizationName || '—',
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
                  정책라인 결재선을 기본으로 불러옴십니다. 조직도에서 멤버·조직을 오른쪽 목록으로
                  드래그해 추가하고, 관리 열의 드래그 핸들로 순서를 조정하세요.
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

  const isComposeHubEntry =
    tab === 'compose' && !isEmbedComposeModal && (sideNav === '' || sideNav === 'request-compose');
  const composePhaseView = isEmbedComposeModal
    ? 'fill'
    : isComposeHubEntry
      ? 'select'
      : composePhase;
  const isComposeFormMounted =
    tab === 'compose' && !isComposeHubEntry && !(isEmbedComposeModal && !selectedDocument);
  const showComposeWorkbench =
    composePhaseView === 'fill' && selectedDocument != null && selectedSchema.fields.length > 0;

  const pageTitle =
    tab === 'compose'
      ? isComposeHubEntry
        ? '전자결재·계약'
        : '결재 요청 작성'
      : tab === 'admin' && canAdmin
        ? '결재 관리자'
        : guideBox
          ? APPROVAL_GUIDE_BOX_LABEL[guideBox]
          : '내 결재함';
  const pageDescription =
    tab === 'compose'
      ? isComposeHubEntry
        ? '결재와 계약 문서를 한곳에서 확인하고 바로 작성하세요.'
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
      options?.accent === 'blue'
        ? 'tw-bg-blue-50/60 tw-border-blue-100'
        : 'tw-bg-slate-50/80 tw-border-slate-200';
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
          <div className="tw-flex tw-min-h-[3.5rem] tw-items-center tw-rounded-xl tw-bg-slate-50/80 tw-px-3">
            <Typography.Text type="secondary" className="!tw-text-sm">
              {emptyText}
            </Typography.Text>
          </div>
        ) : (
          <div className={APPROVAL_HOME_DOC_LIST_SCROLL}>
            <Space direction="vertical" size={8} className="tw-w-full">
              {rows.slice(0, 20).map((row) => {
                const requestStatus = String(row.requestStatus ?? '').trim();
                const requestStatusNode = requestStatus ? statusTag(requestStatus) : null;
                return (
                  <div
                    key={row.requestId}
                    className={`tw-group tw-flex tw-items-start tw-justify-between tw-gap-3 tw-rounded-xl tw-border tw-px-3 tw-py-2.5 ${accentClass} ${
                      options?.onAction
                        ? ''
                        : 'tw-cursor-pointer tw-transition-colors hover:tw-border-blue-200 hover:tw-bg-blue-50/70 focus-visible:tw-ring-2 focus-visible:tw-ring-blue-400 focus-visible:tw-ring-offset-1'
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
                    <span className="tw-mt-0.5 tw-inline-flex tw-size-8 tw-shrink-0 tw-items-center tw-justify-center tw-rounded-lg tw-bg-white tw-text-[#1b365d] tw-shadow-sm tw-shadow-slate-900/5">
                      <FileTextOutlined aria-hidden />
                    </span>
                    <div className="tw-min-w-0 tw-flex-1">
                      <div className="tw-flex tw-min-w-0 tw-items-center tw-gap-2">
                        <Typography.Text
                          strong
                          className="!tw-block tw-min-w-0 tw-flex-1 tw-truncate !tw-text-[13px] !tw-leading-5 !tw-text-slate-900"
                        >
                          {getApprovalRequestSubjectLine(row) || row.documentName || '—'}
                        </Typography.Text>
                        {requestStatusNode ? (
                          <span className="tw-shrink-0 [&_.ant-tag]:!tw-m-0 [&_.ant-tag]:!tw-text-[11px]">
                            {requestStatusNode}
                          </span>
                        ) : null}
                      </div>
                      <Typography.Text
                        type="secondary"
                        className="!tw-mt-0.5 !tw-block !tw-text-[11px] !tw-leading-4"
                      >
                        {row.requesterName || '요청자 미상'} ·{' '}
                        {formatDateTime(row.updatedAt || row.createdAt)}
                      </Typography.Text>
                    </div>
                    {options?.onAction ? (
                      <Button
                        size="small"
                        className="tw-shrink-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          options.onAction?.(row);
                        }}
                      >
                        {options.actionLabel || '보기'}
                      </Button>
                    ) : null}
                  </div>
                );
              })}
            </Space>
          </div>
        )}
      </Card>
    );
  };

  const renderHomeMyContractsCard = () => {
    const accentClass = 'tw-bg-slate-50/80 tw-border-slate-200';
    return (
      <Card className={APPROVAL_HOME_GRID_DOC_CARD_CLASS}>
        <div className="tw-mb-3 tw-flex tw-items-center tw-justify-between">
          <Typography.Text strong>내 계약</Typography.Text>
          <Button type="link" size="small" onClick={() => setComposeHomeMoreModal({ kind: 'my-contracts' })}>
            전체
          </Button>
        </div>
        {composeHubMyContractsLoading && composeHubMyContractsPreview.length === 0 ? (
          <div className="tw-flex tw-min-h-[3.5rem] tw-items-center tw-justify-center">
            <Spin size="small" />
          </div>
        ) : composeHubMyContractsPreview.length === 0 ? (
          <div className="tw-flex tw-min-h-[3.5rem] tw-items-center tw-rounded-xl tw-bg-slate-50/80 tw-px-3">
            <Typography.Text type="secondary" className="!tw-text-sm">
              계약이 없습니다.
            </Typography.Text>
          </div>
        ) : (
          <div className={APPROVAL_HOME_DOC_LIST_SCROLL}>
            <Space direction="vertical" size={8} className="tw-w-full">
              {composeHubMyContractsPreview.map((row) => (
                <div
                  key={row.contractId}
                  role="button"
                  tabIndex={0}
                  className={`tw-group tw-flex tw-items-start tw-justify-between tw-gap-3 tw-rounded-xl tw-border tw-px-3 tw-py-2.5 ${accentClass} tw-cursor-pointer tw-transition-colors hover:tw-border-blue-200 hover:tw-bg-blue-50/70 focus-visible:tw-ring-2 focus-visible:tw-ring-blue-400 focus-visible:tw-ring-offset-1`}
                  onClick={() =>
                    setComposeHomeMoreModal({
                      kind: 'my-contracts',
                      openContractId: row.contractId,
                    })
                  }
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setComposeHomeMoreModal({
                        kind: 'my-contracts',
                        openContractId: row.contractId,
                      });
                    }
                  }}
                >
                  <span className="tw-mt-0.5 tw-inline-flex tw-size-8 tw-shrink-0 tw-items-center tw-justify-center tw-rounded-lg tw-bg-white tw-text-[#1b365d] tw-shadow-sm tw-shadow-slate-900/5">
                    <FileTextOutlined aria-hidden />
                  </span>
                  <div className="tw-min-w-0 tw-flex-1">
                    <div className="tw-flex tw-min-w-0 tw-items-center tw-gap-2">
                      <Typography.Text
                        strong
                        className="!tw-block tw-min-w-0 tw-flex-1 tw-truncate !tw-text-[13px] !tw-leading-5 !tw-text-slate-900"
                      >
                        {row.templateName?.trim() || '—'}
                      </Typography.Text>
                      <span className="tw-shrink-0 [&_.ant-tag]:!tw-m-0 [&_.ant-tag]:!tw-text-[11px]">
                        {homeContractPreviewStatusTag(row.contractStatus)}
                      </span>
                    </div>
                    <Typography.Text
                      type="secondary"
                      className="!tw-mt-0.5 !tw-block !tw-text-[11px] !tw-leading-4"
                    >
                      {(row.contractNumber?.trim() || '문서번호 없음')} · {formatDateTime(row.createdAt)}
                    </Typography.Text>
                  </div>
                </div>
              ))}
            </Space>
          </div>
        )}
      </Card>
    );
  };

  const renderHomeApprovalFormsCard = () => {
    return (
      <Card
        className={clsx(
          APPROVAL_HOME_COMPOSE_FORMS_CARD_CLASS,
          'tw-flex tw-h-full tw-w-full tw-flex-col',
        )}
        styles={{
          body: {
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            minHeight: 0,
            padding: 16,
          },
        }}
      >
        <div className="tw-mb-3 tw-flex tw-shrink-0 tw-items-start tw-justify-between tw-gap-3">
          <div className="tw-min-w-0">
            <Typography.Text
              strong
              className="!tw-block !tw-text-[15px] !tw-leading-5 !tw-text-slate-900"
            >
              빠른 기안
            </Typography.Text>
            <Typography.Text
              type="secondary"
              className="!tw-mt-0.5 !tw-block !tw-text-[11px] !tw-leading-4"
            >
              자주 쓰는 양식을 바로 작성합니다.
            </Typography.Text>
          </div>
          <div className="tw-flex tw-items-center tw-gap-2">
            <Tooltip title="퀵 메뉴 설정">
              <Button
                size="small"
                type="text"
                className="!tw-inline-flex !tw-size-8 !tw-items-center !tw-justify-center !tw-rounded-full !tw-bg-slate-50 !tw-p-0 !tw-text-slate-500 hover:!tw-bg-slate-100 hover:!tw-text-slate-800"
                icon={<SettingOutlined />}
                onClick={() => {
                  setQuickHomeFormsDraft(quickHomeFormDocs.map((doc) => doc.documentId));
                  setQuickHomeFormsSettingOpen(true);
                }}
              />
            </Tooltip>
          </div>
        </div>
        {docsLoading ? (
          <div className="tw-flex tw-min-h-0 tw-flex-1 tw-items-center tw-justify-center">
            <Spin size="small" />
          </div>
        ) : quickHomeFormDocs.length === 0 ? (
          <div className="tw-flex tw-min-h-0 tw-flex-1 tw-items-center tw-justify-center tw-px-1">
            <Typography.Text type="secondary" className="!tw-text-xs">
              사용 가능한 활성 양식이 없습니다.
            </Typography.Text>
          </div>
        ) : (
          <div className="tw-min-h-0 tw-flex-1 tw-overflow-y-auto wf-scrollbar">
            <div className="tw-grid tw-min-h-full tw-grid-cols-1 tw-auto-rows-fr tw-gap-2">
              {quickHomeFormDocs.map((doc) => {
                return (
                  <button
                    key={doc.documentId}
                    type="button"
                    className="tw-group tw-flex tw-h-full tw-min-h-0 tw-w-full tw-appearance-none tw-items-center tw-justify-between tw-gap-3 tw-rounded-xl tw-border-0 tw-bg-slate-50/80 tw-px-3 tw-py-2 tw-text-left tw-shadow-none tw-outline-none tw-transition-colors hover:tw-bg-blue-50/60 focus-visible:tw-ring-2 focus-visible:tw-ring-blue-400 focus-visible:tw-ring-offset-1"
                    onClick={() => {
                      setComposeFormSelectInitialId(doc.documentId);
                      setComposeFormSelectModalOpen(true);
                    }}
                  >
                    <div className="tw-min-w-0 tw-flex-1 tw-leading-tight">
                      <Typography.Text
                        strong
                        className="!tw-mb-0 !tw-block !tw-text-[13px] !tw-leading-5 !tw-text-slate-900 tw-truncate"
                      >
                        {doc.documentName?.trim() || '—'}
                      </Typography.Text>
                      <Typography.Text
                        type="secondary"
                        className="!tw-mb-0 !tw-mt-0.5 !tw-block !tw-text-[11px] !tw-leading-4 tw-truncate"
                      >
                        {approvalRequestTypeLabelKo(doc.requestType)}
                      </Typography.Text>
                    </div>
                    <span className="tw-inline-flex tw-size-7 tw-shrink-0 tw-items-center tw-justify-center tw-rounded-full tw-bg-slate-100 tw-text-slate-500 tw-transition-colors group-hover:tw-bg-[#1b365d] group-hover:tw-text-white">
                      <PlusOutlined className="tw-text-xs" aria-hidden />
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </Card>
    );
  };

  const renderComposeHomeDashboard = () => {
    const viewerMergedRows = mergeRequestsByRequestId([
      viewerCcRequests,
      viewerCirculationRequests,
    ]);
    const composeInboxLineOpts = {
      myMemberId: authMemberId,
      myMemberPositionId: drafterProfile?.memberPositionId?.trim(),
    };

    const getComposeHomeRowKind = (row: ApprovalRequestDetail): 'pending' | 'waiting' | 'acted' => {
      const myLine = findMyInboxApprovalLine(row, composeInboxLineOpts);
      const inboxSt = String(myLine?.approvalStatus ?? '').toUpperCase();
      if (inboxSt === 'APPROVED' || inboxSt === 'REJECTED') return 'acted';
      return inboxSt === 'WAITING' || rowIsUpcomingForApprover(row, authMemberId)
        ? 'waiting'
        : 'pending';
    };

    const getComposeHomeStatus = (
      row: ApprovalRequestDetail,
    ): 'pending' | 'waiting' | 'approved' | 'rejected' | 'acted' => {
      const myLine = findMyInboxApprovalLine(row, composeInboxLineOpts);
      const inboxSt = String(myLine?.approvalStatus ?? '').toUpperCase();
      if (inboxSt === 'APPROVED') return 'approved';
      if (inboxSt === 'REJECTED') return 'rejected';
      if (getComposeHomeRowKind(row) === 'waiting') return 'waiting';
      if (getComposeHomeRowKind(row) === 'acted') return 'acted';
      return 'pending';
    };

    const renderComposeHomeKindTag = (row: ApprovalRequestDetail) => {
      const kind = getComposeHomeRowKind(row);
      const tagClass =
        '!tw-m-0 !tw-rounded !tw-px-1.5 !tw-py-0 !tw-text-xs !tw-font-medium !tw-leading-5';
      if (kind === 'acted') {
        return (
          <Tag color="success" className={tagClass}>
            결재 완료
          </Tag>
        );
      }
      if (kind === 'waiting') {
        return (
          <Tag color="processing" className={tagClass}>
            결재 예정
          </Tag>
        );
      }
      return (
        <Tag color="gold" className={tagClass}>
          결재 대기
        </Tag>
      );
    };

    const renderComposeHomeStatusTag = (row: ApprovalRequestDetail) => {
      const status = getComposeHomeStatus(row);
      const tagClass =
        '!tw-m-0 !tw-rounded !tw-px-1.5 !tw-py-0 !tw-text-xs !tw-font-medium !tw-leading-5';
      if (status === 'approved') {
        return (
          <Tag color="success" className={tagClass}>
            승인
          </Tag>
        );
      }
      if (status === 'rejected') {
        return (
          <Tag color="error" className={tagClass}>
            반려
          </Tag>
        );
      }
      if (status === 'acted') {
        return (
          <Tag color="processing" className={tagClass}>
            처리함
          </Tag>
        );
      }
      if (status === 'waiting') {
        return (
          <Tag color="processing" className={tagClass}>
            대기 중
          </Tag>
        );
      }
      return (
        <Tag color="gold" className={tagClass}>
          결재 대기
        </Tag>
      );
    };

    const composeHomePendingColumns: ColumnsType<ApprovalRequestDetail> = [
      {
        title: '구분',
        key: 'inboxKind',
        width: 72,
        align: 'center',
        filters: [
          { text: '결재 대기', value: 'pending' },
          { text: '결재 예정', value: 'waiting' },
          { text: '결재 완료', value: 'acted' },
        ],
        onFilter: (value, row) => getComposeHomeRowKind(row) === value,
        render: (_: unknown, row) => renderComposeHomeKindTag(row),
      },
      {
        title: '상태',
        key: 'status',
        width: 66,
        align: 'center',
        filters: [
          { text: '결재 대기', value: 'pending' },
          { text: '대기 중', value: 'waiting' },
          { text: '승인', value: 'approved' },
          { text: '반려', value: 'rejected' },
          { text: '처리함', value: 'acted' },
        ],
        onFilter: (value, row) => getComposeHomeStatus(row) === value,
        render: (_: unknown, row) => renderComposeHomeStatusTag(row),
      },
      {
        title: '제목',
        key: 'subject',
        ellipsis: true,
        render: (_: unknown, row) => (
          <Typography.Text className="!tw-block tw-min-w-0 tw-truncate !tw-text-xs !tw-font-medium !tw-text-slate-800">
            {getApprovalRequestSubjectLine(row) || row.documentName?.trim() || '—'}
          </Typography.Text>
        ),
      },
      {
        title: '요청자',
        key: 'requester',
        width: 66,
        ellipsis: true,
        render: (_: unknown, row) => (
          <Typography.Text
            type="secondary"
            className="!tw-block tw-truncate !tw-text-xs !tw-font-normal"
          >
            {row.requesterName || '요청자 미상'}
          </Typography.Text>
        ),
      },
      {
        title: '결재선',
        key: 'approvalLine',
        width: 136,
        render: (_: unknown, row) => (
          <ApprovalLineMiniStrip lines={row.approvalLines} visibleSlots={0} variant="dashboard" />
        ),
      },
      {
        title: '기안일',
        key: 'createdAt',
        width: 96,
        render: (_: unknown, row) => {
          const compactDate = row.createdAt ? dayjs(row.createdAt).format('MM.DD HH:mm') : '—';
          return (
            <Tooltip title={formatDateTime(row.createdAt)}>
              <span className="tw-block tw-whitespace-nowrap tw-text-xs tw-font-normal tw-leading-none tw-text-slate-500 [font-variant-numeric:tabular-nums]">
                {compactDate}
              </span>
            </Tooltip>
          );
        },
      },
      {
        title: '결재 처리',
        key: 'action',
        width: 86,
        align: 'center',
        render: (_: unknown, row) => {
            const myLine = findMyInboxApprovalLine(row, composeInboxLineOpts);
            const inboxSt = String(myLine?.approvalStatus ?? '').toUpperCase();
            const isMyTurnPending =
              inboxSt === 'PENDING' &&
              myLine != null &&
              !isInlineSyntheticApprovalId(myLine.approvalId);
            if (!isMyTurnPending || !myLine) {
              const rowKind = getComposeHomeRowKind(row);
              const status = getComposeHomeStatus(row);
              const label =
                rowKind === 'acted'
                  ? '처리 완료'
                  : status === 'waiting'
                    ? '대기 중'
                    : '액션 없음';
              return (
                <Typography.Text type="secondary" className="!tw-text-xs !tw-font-normal">
                  {label}
                </Typography.Text>
              );
            }
            return (
              <div
                className="tw-flex tw-items-center tw-justify-center tw-gap-0.5"
                onClick={(e) => e.stopPropagation()}
              >
                <Button
                  type="primary"
                  size="small"
                  className="!tw-h-6 !tw-rounded-md !tw-px-1.5 !tw-text-xs"
                  onClick={() => {
                    setApprovalAction({ approvalId: myLine.approvalId, mode: 'approve' });
                  }}
                >
                  승인
                </Button>
                <Button
                  danger
                  size="small"
                  type="text"
                  className="!tw-h-6 !tw-rounded-md !tw-px-1.5 !tw-text-xs"
                  onClick={() => {
                    setApprovalAction({ approvalId: myLine.approvalId, mode: 'reject' });
                  }}
                >
                  반려
                </Button>
              </div>
            );
        },
      },
    ];

    const composeHomePendingTable = (rows: ApprovalRequestDetail[]) => (
      <AppDataTable<ApprovalRequestDetail>
        bare
        size="small"
        rowKey="requestId"
        columns={composeHomePendingColumns}
        dataSource={rows}
        pagination={false}
        locale={{ emptyText: '결재 처리 문서가 없습니다.' }}
              tableLayout="auto"
        scroll={{ y: 158 }}
        onRow={(record) => ({
          onClick: () => setSelectedRequestId(record.requestId),
          style: { cursor: 'pointer' },
        })}
        className="wf-approval-home-pending-table [&_.ant-table-thead>tr>th]:!tw-bg-slate-50/90 [&_.ant-table-thead>tr>th]:!tw-px-1.5 [&_.ant-table-thead>tr>th]:!tw-py-1.5 [&_.ant-table-thead>tr>th]:!tw-text-xs [&_.ant-table-tbody>tr>td]:!tw-align-middle [&_.ant-table-tbody>tr>td]:!tw-px-1.5 [&_.ant-table-tbody>tr>td]:!tw-py-1.5 [&_.ant-table-tbody>tr>td]:!tw-text-xs [&_.ant-table-tbody>tr>td]:!tw-font-normal"
      />
    );

    return (
      <>
        <div className="tw-flex tw-min-w-0 tw-flex-col tw-gap-4">
          <div className="tw-grid tw-grid-cols-1 tw-gap-4 xl:tw-h-[17rem] xl:tw-grid-cols-3 xl:tw-items-stretch">
            <div className="tw-h-full tw-w-full tw-min-w-0 xl:tw-col-span-2">
              <Card
                className="tw-h-full tw-w-full tw-rounded-2xl tw-border tw-border-slate-200/90 tw-shadow-sm tw-shadow-slate-900/5"
                styles={{
                  body: {
                    display: 'flex',
                    flexDirection: 'column',
                    height: '100%',
                    minHeight: 0,
                  },
                }}
              >
                <div className="tw-mb-2 tw-flex tw-items-center tw-justify-between">
                  <Typography.Text strong>결재 처리함</Typography.Text>
                  <Button
                    type="link"
                    size="small"
                    onClick={() =>
                      setComposeHomeMoreModal({
                        kind: 'pending-inbox',
                        title: '결재 처리함 전체',
                      })
                    }
                  >
                    전체
                  </Button>
                </div>
                <div className="tw-min-h-0 tw-flex-1 tw-overflow-y-auto wf-scrollbar tw-pr-0">
                  <Spin spinning={pendingLoading || waitingLoading || actedLoading}>
                    {composeHomePendingTable(composeHubInboxPreviewRows.slice(0, 20))}
                  </Spin>
                </div>
              </Card>
            </div>
            <div className="tw-flex tw-h-full tw-min-h-0 tw-w-full tw-min-w-0 xl:tw-col-span-1">
              {renderHomeApprovalFormsCard()}
            </div>
          </div>

          <div className="tw-grid tw-grid-cols-1 tw-gap-4 md:tw-grid-cols-2 xl:tw-grid-cols-3">
            {renderHomeDocListCard(
              '결재 상신함',
              myRequestsAllForSummary,
              '기안 문서가 없습니다.',
              {
                fullListEmbed: { panel: 'my-all' },
              },
            )}
            {renderHomeDocListCard(
              '참조/공람 문서',
              viewerMergedRows,
              '참조/공람 문서가 없습니다.',
              {
                fullListEmbed: { panel: 'viewers' },
              },
            )}
            {renderHomeDocListCard(
              '부서 문서함',
              homeDepartmentRequests,
              myOrganizationIdForDept
                ? '부서 문서가 없습니다.'
                : '조직 정보가 없어 부서 문서함을 불러올 수 없습니다.',
              {
                fullListEmbed: { panel: 'department' },
              },
            )}
            {renderHomeMyContractsCard()}
            {renderHomeDocListCard(
              '임시 저장 문서',
              myDraftRequests,
              '임시 저장 문서가 없습니다.',
              {
                accent: 'blue',
                actionLabel: '이어쓰기',
                onAction: (row) =>
                  setComposeHomeMoreModal({
                    kind: 'iframe',
                    panel: 'draft',
                    composeDraftId: row.requestId,
                  }),
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
                                  <Typography.Text
                                    type="secondary"
                                    className="!tw-block tw-text-xs"
                                  >
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
                                  <Typography.Text
                                    type="secondary"
                                    className="!tw-block tw-text-xs"
                                  >
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
        </div>

        <AppSingleActionModal
          title={
            composeHomeMoreModal == null
              ? undefined
              : composeHomeMoreModal.kind === 'pending-inbox'
                ? composeHomeMoreModal.title
                : composeHomeMoreModal.kind === 'my-contracts'
                  ? '내 계약 전체'
                  : composeHomeEmbedPanelModalTitle(composeHomeMoreModal)
          }
          open={composeHomeMoreModal != null}
          onClose={() => setComposeHomeMoreModal(null)}
          onSubmit={() => undefined}
          submitText="확인"
          customFooter={null}
          width={1120}
          destroyOnHidden
          styles={{
            content: APPROVAL_FOLLOWUP_MODAL_CONTENT_STYLE,
            header: APPROVAL_FOLLOWUP_MODAL_HEADER_STYLE,
            body: APPROVAL_FOLLOWUP_MODAL_BODY_STYLE,
          }}
        >
          <div className={APPROVAL_DASHBOARD_MODAL_FRAME_CLASS}>
            {composeHomeMoreModal?.kind === 'pending-inbox' ? (
              <PendingApprovalInboxModalContent
                myMemberId={authMemberId}
                myMemberPositionId={drafterProfile?.memberPositionId?.trim()}
                onOpenDetail={(requestId) => setSelectedRequestId(requestId)}
                onStartApprove={(approvalId) =>
                  setApprovalAction({ approvalId, mode: 'approve' })
                }
                onStartReject={(approvalId) => setApprovalAction({ approvalId, mode: 'reject' })}
              />
            ) : composeHomeMoreModal?.kind === 'my-contracts' ? (
              <div className="wf-scrollbar-modal tw-h-full tw-min-h-0 tw-w-full tw-flex-1 tw-overflow-y-auto tw-overflow-x-hidden tw-overscroll-y-contain tw-bg-slate-50 tw-p-4">
                <MyContractsPanel
                  embedded
                  initialDetailContractId={composeHomeMoreModal.openContractId ?? null}
                />
              </div>
            ) : composeHomeMoreModal?.kind === 'iframe' ? (
              <iframe
                key={`${composeHomeMoreModal.panel}-${composeHomeMoreModal.composeDraftId ?? ''}`}
                title="전자결재 문서함"
                src={composeHomeEmbedPanelUrl(composeHomeMoreModal.panel, {
                  composeDraftId: composeHomeMoreModal.composeDraftId,
                })}
                className={APPROVAL_DASHBOARD_MODAL_IFRAME_CLASS}
              />
            ) : null}
          </div>
        </AppSingleActionModal>

        <ApprovalFormSelectModal
          open={composeFormSelectModalOpen}
          onCancel={() => {
            setComposeFormSelectModalOpen(false);
            setComposeFormSelectInitialId(undefined);
          }}
          documents={pickerDocuments}
          loading={docsLoading}
          initialDocumentId={composeFormSelectInitialId}
          onConfirm={handleApprovalFormSelectConfirm}
        />

        {/* 근태정정신청 자동 모달 - corrDate 진입 시 기존 결재 작성 모달 흐름과 동일한 모양으로 띄움 */}
        <AppSingleActionModal
          title="전자결재"
          open={correctionEmbedSrc != null}
          onClose={() => {
            setCorrectionEmbedSrc(null);
            // 모달 닫을 때 prefill 파라미터 제거하고 허브로 복귀
            navigate({
              to: '/app/approvals',
              search: { tab: 'compose' },
              replace: true,
            });
          }}
          onSubmit={() => undefined}
          submitText="확인"
          customFooter={null}
          width={1120}
          destroyOnHidden
          styles={{
            content: APPROVAL_FOLLOWUP_MODAL_CONTENT_STYLE,
            header: APPROVAL_FOLLOWUP_MODAL_HEADER_STYLE,
            body: APPROVAL_FOLLOWUP_MODAL_BODY_STYLE,
          }}
        >
          {correctionEmbedSrc ? (
            <iframe
              key={correctionEmbedSrc}
              title="근태정정신청 작성"
              src={correctionEmbedSrc}
              className="tw-h-full tw-min-h-0 tw-w-full tw-border-0"
            />
          ) : null}
        </AppSingleActionModal>
        <AppDoubleActionModal
          title="퀵 메뉴 설정"
          open={quickHomeFormsSettingOpen}
          onClose={() => setQuickHomeFormsSettingOpen(false)}
          onConfirm={() => {
            const picked = Array.from(
              new Set(quickHomeFormsDraft.map((v) => v.trim()).filter(Boolean)),
            ).slice(0, 3);
            if (picked.length < 2) {
              message.warning('퀵 메뉴 양식을 최소 2개 선택해 주세요.');
              return;
            }
            setQuickHomeForms(picked);
            saveQuickHomeForms(picked);
            setQuickHomeFormsSettingOpen(false);
          }}
          confirmText="저장"
          cancelText="취소"
          destroyOnHidden
        >
          <div className="tw-px-5 tw-py-4">
            <Typography.Paragraph type="secondary" className="!tw-mb-2 !tw-text-sm">
              슬롯 3개 중 2~3개를 채워 빠르게 실행할 양식을 구성하세요.
            </Typography.Paragraph>
            <div className="tw-mb-3 tw-flex tw-items-center tw-justify-between tw-text-xs tw-text-slate-500">
              <span>선택된 양식</span>
              <span>{quickHomeDraftDocs.length}/3</span>
            </div>
            <div className="tw-space-y-2">
              {quickHomeDraftDocs.map((doc) => {
                return (
                  <div
                    key={doc.documentId}
                    className="tw-flex tw-items-center tw-justify-between tw-rounded-md tw-border tw-border-slate-200 tw-bg-slate-50 tw-px-3 tw-py-2"
                  >
                    <div className="tw-min-w-0">
                      <Typography.Text strong className="!tw-block tw-truncate tw-text-sm">
                        {formatApprovalDocumentName(doc.documentName)}
                      </Typography.Text>
                      <Typography.Text type="secondary" className="!tw-block tw-text-xs">
                        {approvalRequestTypeLabelKo(doc.requestType)}
                      </Typography.Text>
                    </div>
                    <Button
                      type="text"
                      size="small"
                      icon={<DeleteOutlined />}
                      aria-label={`${formatApprovalDocumentName(doc.documentName)} 제거`}
                      onClick={() =>
                        setQuickHomeFormsDraft((prev) => prev.filter((id) => id !== doc.documentId))
                      }
                    />
                  </div>
                );
              })}
            </div>
            {quickHomeDraftDocs.length < 3 ? (
              <div className="tw-mt-3">
                <Select
                  className="tw-w-full"
                  value={undefined}
                  options={quickHomeDraftRemainingOptions}
                  placeholder="양식 추가 (최대 3개)"
                  optionFilterProp="label"
                  onSelect={(val) =>
                    setQuickHomeFormsDraft((prev) =>
                      typeof val !== 'string' || prev.includes(val) || prev.length >= 3
                        ? prev
                        : [...prev, val],
                    )
                  }
                />
              </div>
            ) : (
              <Typography.Text type="secondary" className="tw-mt-3 tw-block tw-text-xs">
                최대 3개까지 선택되었습니다.
              </Typography.Text>
            )}
          </div>
        </AppDoubleActionModal>
      </>
    );
  };

  return (
    <div
      className={clsx(
        'tw-w-full',
        isEmbedComposeModal
          ? 'tw-flex tw-h-full tw-min-h-0 tw-flex-col tw-gap-4 tw-overflow-hidden'
          : 'wf-approvals-page-shell tw-flex tw-min-h-full tw-flex-col tw-gap-4',
      )}
    >
      {/* 허브 대시보드 밖(예: sideNav=workbench)에서도 동일 모달이 필요 - 챗봇 prefill 등 */}
      {/* 허브 안(onComposeHub=true)에선 위쪽 그리드의 동일 모달이 뜨므로 중복 렌더 방지 위해 가드 */}
      {!isEmbedComposeModal && !onComposeHub ? (
        <AppSingleActionModal
          title={
            composeHomeMoreModal == null
              ? undefined
              : composeHomeMoreModal.kind === 'pending-inbox'
                ? composeHomeMoreModal.title
                : composeHomeMoreModal.kind === 'my-contracts'
                  ? '내 계약 전체'
                  : composeHomeEmbedPanelModalTitle(composeHomeMoreModal)
          }
          open={composeHomeMoreModal != null}
          onClose={() => setComposeHomeMoreModal(null)}
          onSubmit={() => undefined}
          submitText="확인"
          customFooter={null}
          width={1120}
          destroyOnHidden
          styles={{
            content: APPROVAL_FOLLOWUP_MODAL_CONTENT_STYLE,
            header: APPROVAL_FOLLOWUP_MODAL_HEADER_STYLE,
            body: APPROVAL_FOLLOWUP_MODAL_BODY_STYLE,
          }}
        >
          <div className={APPROVAL_DASHBOARD_MODAL_FRAME_CLASS}>
            {composeHomeMoreModal?.kind === 'pending-inbox' ? (
              <PendingApprovalInboxModalContent
                myMemberId={authMemberId}
                myMemberPositionId={drafterProfile?.memberPositionId?.trim()}
                onOpenDetail={(requestId) => setSelectedRequestId(requestId)}
                onStartApprove={(approvalId) =>
                  setApprovalAction({ approvalId, mode: 'approve' })
                }
                onStartReject={(approvalId) => setApprovalAction({ approvalId, mode: 'reject' })}
              />
            ) : composeHomeMoreModal?.kind === 'my-contracts' ? (
              <div className="wf-scrollbar-modal tw-h-full tw-min-h-0 tw-w-full tw-flex-1 tw-overflow-y-auto tw-overflow-x-hidden tw-overscroll-y-contain tw-bg-slate-50 tw-p-4">
                <MyContractsPanel
                  embedded
                  initialDetailContractId={composeHomeMoreModal.openContractId ?? null}
                />
              </div>
            ) : composeHomeMoreModal?.kind === 'iframe' ? (
              <iframe
                key={`${composeHomeMoreModal.panel}-${composeHomeMoreModal.composeDraftId ?? ''}-${composeHomeMoreModal.prefillDocumentId ?? ''}`}
                title="전자결재 문서함"
                src={composeHomeEmbedPanelUrl(composeHomeMoreModal.panel, {
                  composeDraftId: composeHomeMoreModal.composeDraftId,
                  prefillDocumentId: composeHomeMoreModal.prefillDocumentId,
                })}
                className={APPROVAL_DASHBOARD_MODAL_IFRAME_CLASS}
              />
            ) : null}
          </div>
        </AppSingleActionModal>
      ) : null}

      {!isEmbedComposeModal ? (
        <div
          className={clsx(
            'tw-flex tw-items-center tw-justify-between tw-gap-3',
            (tab === 'admin' && canAdmin) || isComposeHubEntry ? 'tw-shrink-0' : undefined,
          )}
        >
          <div className="tw-flex tw-min-w-0 tw-items-start tw-gap-2">
            {!onComposeHub && tab !== 'admin' ? (
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
            ) : null}
            <AppWorkspacePageTitle
              className="!tw-mb-0"
              eyebrow={isComposeHubEntry ? 'Documents' : 'Approvals'}
              title={pageTitle}
              subtitle={pageDescription}
            />
          </div>
          {tab === 'compose' && onComposeHub ? (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              className="tw-h-11 tw-rounded-2xl tw-font-bold tw-border-0 !tw-bg-[#1e3a5f] hover:!tw-bg-[#152a45] disabled:!tw-cursor-not-allowed disabled:!tw-border disabled:!tw-border-slate-200 disabled:!tw-bg-white disabled:!tw-text-slate-400 disabled:!tw-opacity-100 disabled:!tw-shadow-none disabled:hover:!tw-bg-white disabled:hover:!tw-text-slate-400"
              onClick={() => {
                setComposeFormSelectInitialId(undefined);
                setComposeFormSelectModalOpen(true);
              }}
            >
              새 결재 진행
            </Button>
          ) : null}
        </div>
      ) : null}

      {/* Form이 실제 렌더되지 않는 구간(허브/임베드 로딩 중)에서도 useForm 인스턴스를 연결해 경고를 방지한다. */}
      {!isComposeFormMounted ? (
        <Form form={form} preserve={false} className="tw-hidden" aria-hidden />
      ) : null}

      {tab === 'compose' && isComposeHubEntry ? (
        <div className="tw-flex tw-min-w-0 tw-flex-col">{renderComposeHomeDashboard()}</div>
      ) : tab === 'compose' ? (
        <Card
          className={clsx(
            'tw-border-slate-200/80 tw-shadow-sm',
            showComposeWorkbench && '!tw-rounded-lg tw-border-slate-300 !tw-p-0 tw-shadow-md',
            isEmbedComposeModal && 'tw-flex tw-min-h-0 tw-flex-1 tw-flex-col tw-overflow-hidden',
          )}
          styles={{
            body: isEmbedComposeModal
              ? {
                  flex: 1,
                  minHeight: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  padding: showComposeWorkbench ? 0 : undefined,
                  overflow: 'hidden',
                }
              : { padding: showComposeWorkbench ? 0 : undefined },
          }}
        >
          {isEmbedComposeModal && !selectedDocument ? (
            <div className="tw-flex tw-min-h-[260px] tw-items-center tw-justify-center tw-bg-white">
              <Spin size="large" />
            </div>
          ) : (
            <Form
              form={form}
              layout="vertical"
              className={clsx(
                isEmbedComposeModal && 'tw-flex tw-min-h-0 tw-flex-1 tw-flex-col tw-overflow-hidden',
              )}
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
                  const nextDocId =
                    typeof changed.documentId === 'string' && changed.documentId.trim().length > 0
                      ? changed.documentId
                      : undefined;
                  const nextDoc = nextDocId
                    ? activeDocuments.find((d) => d.documentId === nextDocId)
                    : undefined;
                  form.setFieldValue(
                    'content',
                    nextDoc
                      ? composeContentPatchWithDefaultTitle(
                          nextDoc.formSchema,
                          formatApprovalDocumentName(nextDoc.documentName),
                        )
                      : {},
                  );
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
                    documents={pickerDocuments}
                    loading={docsLoading}
                    onAfterPick={(documentId, doc) => {
                      if (isComposeHubEntry) {
                        navigateToComposeWorkbench();
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
                <Typography.Paragraph
                  type="secondary"
                  className="!tw-mb-0 !tw-mt-4 !tw-text-center !tw-text-sm"
                >
                  양식을 누르면 작성·결재 화면으로 이동합니다.
                </Typography.Paragraph>
              ) : null}

              {composePhaseView === 'select' ? (
                <section className="tw-mt-4 tw-rounded-xl tw-border tw-border-slate-200/90 tw-bg-slate-50/60 tw-p-3">
                  <div className="tw-mb-3 tw-flex tw-items-center tw-justify-between tw-gap-2">
                    <Space size={8}>
                      <FolderOpenOutlined className="tw-text-slate-500" />
                      <Typography.Text strong className="tw-text-sm tw-text-slate-800">
                        임시저장함
                      </Typography.Text>
                    </Space>
                    {myDraftRequests.length > 0 ? (
                      <Tag color="gold" className="!tw-m-0">
                        {myDraftRequests.length}
                      </Tag>
                    ) : null}
                  </div>
                  {myDraftsLoading ? (
                    <div className="tw-flex tw-justify-center tw-py-6">
                      <Spin size="small" />
                    </div>
                  ) : myDraftRequests.length === 0 ? (
                    <Typography.Text type="secondary" className="tw-text-xs">
                      저장된 임시 문서가 없습니다. 작성 중 &quot;임시저장&quot;하면 여기에서 이어서
                      작업할 수 있습니다.
                    </Typography.Text>
                  ) : (
                    <ul className="tw-m-0 tw-list-none tw-space-y-2 tw-p-0">
                      {myDraftRequests.map((d) => (
                        <li
                          key={d.requestId}
                          className="tw-flex tw-flex-wrap tw-items-center tw-justify-between tw-gap-2 tw-rounded-lg tw-border tw-border-slate-100 tw-bg-white tw-px-3 tw-py-2"
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
                </section>
              ) : null}

              {composePhaseView === 'fill' &&
              selectedDocument &&
              selectedSchema.fields.length === 0 ? (
                <Alert
                  type="warning"
                  showIcon
                  message="양식 스키마(formSchema)를 해석할 수 없거나 필드가 없습니다. 관리자에게 문의하거나 다른 양식을 선택해 주세요."
                />
              ) : null}

              {composePhaseView === 'fill' &&
              selectedDocument &&
              selectedSchema.fields.length > 0 ? (
                <div
                  className={clsx(
                    'tw-flex tw-flex-col lg:tw-flex-row lg:tw-items-start',
                    isEmbedComposeModal && 'tw-min-h-0 tw-flex-1 tw-overflow-hidden',
                  )}
                >
                  <div
                    className={clsx(
                      'tw-min-w-0 tw-flex-1 tw-bg-white tw-p-2 sm:tw-p-3',
                      isEmbedComposeModal && 'tw-flex tw-min-h-0 tw-self-stretch tw-flex-col',
                    )}
                  >
                    {renderComposeToolbar()}
                    <div
                      className={clsx(
                        'tw-rounded-none tw-bg-white',
                        isEmbedComposeModal && 'tw-min-h-0 tw-flex-1 tw-overflow-auto wf-scrollbar',
                      )}
                    >
                      <div className="tw-flex tw-flex-col tw-gap-4 tw-p-2 sm:tw-p-3">
                        {selectedSchema.formDescription?.trim() ? (
                          <Alert
                            type="info"
                            showIcon
                            message="인사팀 안내"
                            description={
                              <span className="tw-whitespace-pre-wrap tw-text-sm">
                                {selectedSchema.formDescription.trim()}
                              </span>
                            }
                          />
                        ) : null}
                        {selectedDocument.documentName === '출퇴근시간 변경 신청서' && (
                          <Alert
                            type="warning"
                            showIcon
                            message="동일 대상 연월에 2번 이상 신청할 경우, 가장 마지막에 승인된 신청 내용이 적용됩니다."
                          />
                        )}
                        <ApprovalFormPaperLayout
                          documentName={formatApprovalDocumentName(selectedDocument.documentName)}
                          categoryLabel={approvalRequestTypeLabelKo(selectedDocument.requestType)}
                          requestTypeCode={normalizeApprovalRequestType(
                            selectedDocument.requestType,
                          )}
                          drafterName={drafterProfile?.name?.trim() || user?.name?.trim() || '—'}
                          drafterOrg={
                            drafterProfile?.organizationName?.trim() ||
                            user?.departmentName?.trim() ||
                            '—'
                          }
                          drafterJobTitle={
                            drafterProfile?.jobTitleName?.trim() ||
                            user?.jobTitle?.trim() ||
                            undefined
                          }
                          writtenDate={dayjs().format('YYYY-MM-DD')}
                          stampColumn={
                            <ApprovalFormStampColumn
                              drafterName={
                                drafterProfile?.name?.trim() || user?.name?.trim() || '—'
                              }
                              drafterJobTitle={
                                drafterProfile?.jobTitleName?.trim() ||
                                user?.jobTitle?.trim() ||
                                undefined
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
                              const isAllowanceChangeDocument =
                                selectedDocument.documentName === '수당 변경 신청';
                              // 수당 변경 신청은 회사 고정 금액을 사용하므로 신청 금액 입력 UI는 숨긴다.
                              if (isAllowanceChangeDocument && field.name === 'amount') return null;
                              // hidden 필드는 제출 시 프론트가 auto-populate (예: leaveRequestId), UI 에 미표시
                              if (field.type === 'hidden') return null;
                              if (field.type === 'static_note') {
                                return (
                                  <ApprovalFormPaperStaticNoteRow
                                    key={field.name}
                                    title={field.label?.trim() || undefined}
                                    body={field.staticText?.trim() ?? ''}
                                  />
                                );
                              }
                              // 근태정정신청 출/퇴근시각 - 기존 회사에 이전 datetime-local 로 박혀있는 schema 호환, 강제 time(HH:mm) 렌더
                              if (
                                selectedDocument.documentName === '근태정정신청' &&
                                (field.name === 'requestedClockIn' ||
                                  field.name === 'requestedClockOut')
                              ) {
                                const fieldLockedCorr = field.locked === true;
                                const inputRulesCorr = fieldLockedCorr
                                  ? [{ required: true as const, message: `${field.label} 입력` }]
                                  : [];
                                return (
                                  <ApprovalFormPaperFieldRow
                                    key={field.name}
                                    label={field.label}
                                    required={fieldLockedCorr}
                                  >
                                    <Form.Item
                                      name={['content', field.name]}
                                      rules={inputRulesCorr}
                                      className="!tw-mb-0"
                                    >
                                      <Input type="time" className="!tw-max-w-xs" step={60} />
                                    </Form.Item>
                                  </ApprovalFormPaperFieldRow>
                                );
                              }
                              const namePath: (string | number)[] = ['content', field.name];
                              const ph = field.placeholder;
                              const fieldLocked = field.locked === true;
                              if (field.type === 'ai_transcribe') {
                                return (
                                  <ApprovalFormPaperFieldRow
                                    key={field.name}
                                    label={field.label}
                                    required={fieldLocked}
                                  >
                                    <ApprovalAiTranscribeField
                                      field={field}
                                      onPendingAudioBlobChange={(blob) => {
                                        composeMeetingAudioBlobRef.current = blob;
                                      }}
                                    />
                                  </ApprovalFormPaperFieldRow>
                                );
                              }
                              const inputRules = fieldLocked
                                ? [{ required: true as const, message: `${field.label} 입력` }]
                                : [];
                              const selectRules = fieldLocked
                                ? [{ required: true as const, message: `${field.label} 선택` }]
                                : [];
                              if (field.type === 'personnel_order_items') {
                                // 인사발령품의서 전용 - 직원/부서/직급/직책 선택 패널, contentJsonText 에는 사람 읽기용 요약만 들어감
                                return (
                                  <ApprovalFormPaperFieldRow
                                    key={field.name}
                                    label={field.label}
                                    required={fieldLocked}
                                  >
                                    <PersonnelOrderItemsField />
                                  </ApprovalFormPaperFieldRow>
                                );
                              }
                              if (field.type === 'textarea') {
                                return (
                                  <ApprovalFormPaperFieldRow
                                    key={field.name}
                                    label={field.label}
                                    required={fieldLocked}
                                  >
                                    <Form.Item
                                      name={namePath}
                                      rules={inputRules}
                                      className="!tw-mb-0"
                                    >
                                      <Input.TextArea
                                        rows={4}
                                        className="!tw-max-w-full"
                                        placeholder={ph}
                                      />
                                    </Form.Item>
                                  </ApprovalFormPaperFieldRow>
                                );
                              }
                              if (field.type === 'number') {
                                return (
                                  <ApprovalFormPaperFieldRow
                                    key={field.name}
                                    label={field.label}
                                    required={fieldLocked}
                                  >
                                    <Form.Item
                                      name={namePath}
                                      rules={inputRules}
                                      className="!tw-mb-0"
                                    >
                                      <Input
                                        type="number"
                                        className="!tw-max-w-xs"
                                        placeholder={ph}
                                      />
                                    </Form.Item>
                                  </ApprovalFormPaperFieldRow>
                                );
                              }
                              if (field.type === 'date') {
                                // 근태정정신청 정정 일자 - 내 근태 행별 버튼(corrDate 있음) 진입 시만 disabled, 전자결재 메뉴 직접 진입은 자유 선택
                                const dateDisabled =
                                  selectedDocument.documentName === '근태정정신청' &&
                                  field.name === 'attendanceDate' &&
                                  Boolean(routeSearch.corrDate);
                                // 휴가신청서는 시작일/종료일 입력을 숨기고 아래 "휴가 날짜" multi DatePicker 하나로 통합 처리
                                // 제출 시 PRE_ACTION_CONFIGS 가 plannedDates 의 first/last 로 startDate/endDate 자동 도출
                                const isLeaveRangeField =
                                  selectedDocument.documentName === '휴가신청서' &&
                                  (field.name === 'startDate' || field.name === 'endDate');
                                if (isLeaveRangeField) return null;
                                return (
                                  <ApprovalFormPaperFieldRow
                                    key={field.name}
                                    label={field.label}
                                    required={fieldLocked}
                                  >
                                    <Form.Item
                                      name={namePath}
                                      rules={inputRules}
                                      className="!tw-mb-0"
                                    >
                                      <Input
                                        type="date"
                                        className="!tw-max-w-xs"
                                        disabled={dateDisabled}
                                      />
                                    </Form.Item>
                                  </ApprovalFormPaperFieldRow>
                                );
                              }
                              if (field.type === 'datetime-local') {
                                return (
                                  <ApprovalFormPaperFieldRow
                                    key={field.name}
                                    label={field.label}
                                    required={fieldLocked}
                                  >
                                    <Form.Item
                                      name={namePath}
                                      rules={inputRules}
                                      className="!tw-mb-0"
                                    >
                                      <Input type="datetime-local" className="!tw-max-w-xs" />
                                    </Form.Item>
                                  </ApprovalFormPaperFieldRow>
                                );
                              }
                              if (field.type === 'time') {
                                return (
                                  <ApprovalFormPaperFieldRow
                                    key={field.name}
                                    label={field.label}
                                    required={fieldLocked}
                                  >
                                    <Form.Item
                                      name={namePath}
                                      rules={inputRules}
                                      className="!tw-mb-0"
                                    >
                                      <Input type="time" className="!tw-max-w-xs" step={60} />
                                    </Form.Item>
                                  </ApprovalFormPaperFieldRow>
                                );
                              }
                              if (field.type === 'select') {
                                // source 지정된 select 는 API 로드 옵션 사용, 기본은 정적 options
                                const normalizedLabel = String(field.label ?? '')
                                  .trim()
                                  .replace(/\s+/g, '')
                                  .toUpperCase();
                                const leaveKindLabel =
                                  APPROVAL_VACATION_LEAVE_KIND_FIELD_LABEL.trim()
                                    .replace(/\s+/g, '')
                                    .toUpperCase();
                                const normalizedSource = String(field.source ?? '')
                                  .trim()
                                  .toLowerCase()
                                  .replace(/[-_\s]/g, '');
                                const isCompanyLeaveTypeSource =
                                  normalizedSource === 'companyleavetype' ||
                                  normalizedSource === 'companyleavetypes' ||
                                  normalizedSource === 'leavetype' ||
                                  normalizedSource === 'leavetypes';
                                const isLeaveKindFieldByLabel = normalizedLabel === leaveKindLabel;
                                const dynamicOptions =
                                  isCompanyLeaveTypeSource || isLeaveKindFieldByLabel
                                    ? companyLeaveTypeOptions
                                    : field.source === 'salaryItemTemplate'
                                      ? salaryItemTemplateOptions
                                      : field.source === 'flexibleTimeSlot'
                                        ? flexibleTimeSlotOptions
                                        : null;
                                const selectOptions = dynamicOptions
                                  ? dynamicOptions
                                  : (field.options ?? []).map((opt) => ({
                                      value: opt,
                                      label: opt,
                                    }));
                                // flexibleTimeSlot select 는 선택된 슬롯의 출퇴근/점심 시간을 카드로 보여준다
                                const showSlotInfo = field.source === 'flexibleTimeSlot';
                                return (
                                  <ApprovalFormPaperFieldRow
                                    key={field.name}
                                    label={field.label}
                                    required={fieldLocked}
                                  >
                                    <Form.Item
                                      name={namePath}
                                      rules={selectRules}
                                      className="!tw-mb-0"
                                    >
                                      <Select
                                        className="!tw-max-w-md"
                                        placeholder={ph}
                                        options={selectOptions}
                                        showSearch
                                        optionFilterProp="label"
                                      />
                                    </Form.Item>
                                    {showSlotInfo && (
                                      <Form.Item
                                        shouldUpdate={(prev, next) =>
                                          JSON.stringify(prev?.content?.[field.name]) !==
                                          JSON.stringify(next?.content?.[field.name])
                                        }
                                        noStyle
                                      >
                                        {() => {
                                          const slotId = form.getFieldValue(namePath) as
                                            | string
                                            | undefined;
                                          if (!slotId) return null;
                                          const slot = flexibleSlotById.get(slotId);
                                          if (!slot) return null;
                                          const work =
                                            slot.startTime && slot.endTime
                                              ? `${slot.startTime.slice(0, 5)} ~ ${slot.endTime.slice(0, 5)}`
                                              : '미설정';
                                          const lunch =
                                            slot.breakStart && slot.breakEnd
                                              ? `${slot.breakStart.slice(0, 5)} ~ ${slot.breakEnd.slice(0, 5)}`
                                              : '미설정';
                                          return (
                                            <div className="tw-mt-2 tw-flex tw-flex-wrap tw-gap-2">
                                              <span className="tw-inline-flex tw-items-center tw-gap-1 tw-rounded-md tw-border tw-border-blue-200 tw-bg-blue-50/60 tw-px-2.5 tw-py-1 tw-text-xs tw-text-slate-700">
                                                <span className="tw-text-[11px] tw-text-slate-500">
                                                  출퇴근
                                                </span>
                                                <span className="tw-font-semibold">{work}</span>
                                              </span>
                                              <span className="tw-inline-flex tw-items-center tw-gap-1 tw-rounded-md tw-border tw-border-amber-200 tw-bg-amber-50/60 tw-px-2.5 tw-py-1 tw-text-xs tw-text-slate-700">
                                                <span className="tw-text-[11px] tw-text-slate-500">
                                                  점심
                                                </span>
                                                <span className="tw-font-semibold">{lunch}</span>
                                              </span>
                                            </div>
                                          );
                                        }}
                                      </Form.Item>
                                    )}
                                  </ApprovalFormPaperFieldRow>
                                );
                              }
                              // 대상 연월 (targetYearMonth) -> 월 선택 DatePicker 로 보강. 저장은 YYYY-MM 문자열.
                              // 출퇴근시간 변경 신청서는 다음달만 신청 가능하므로 disabled (개인 근무 스케줄 진입 시 prefill 로 다음달 자동 입력)
                              if (field.name === 'targetYearMonth') {
                                const ymDisabled =
                                  selectedDocument.documentName === '출퇴근시간 변경 신청서';
                                return (
                                  <ApprovalFormPaperFieldRow
                                    key={field.name}
                                    label={field.label}
                                    required={fieldLocked}
                                  >
                                    <Form.Item
                                      name={namePath}
                                      rules={inputRules}
                                      className="!tw-mb-0"
                                      getValueProps={(v) => ({
                                        value: v ? dayjs(v as string, 'YYYY-MM') : null,
                                      })}
                                      getValueFromEvent={(d: dayjs.Dayjs | null) =>
                                        d ? d.format('YYYY-MM') : ''
                                      }
                                    >
                                      <DatePicker
                                        picker="month"
                                        format="YYYY-MM"
                                        placeholder="대상 연월 선택"
                                        className="!tw-max-w-xs"
                                        disabled={ymDisabled}
                                      />
                                    </Form.Item>
                                  </ApprovalFormPaperFieldRow>
                                );
                              }
                              return (
                                <ApprovalFormPaperFieldRow
                                  key={field.name}
                                  label={field.label}
                                  required={fieldLocked}
                                >
                                  <Form.Item
                                    name={namePath}
                                    rules={inputRules}
                                    className="!tw-mb-0"
                                  >
                                    <Input
                                      className="!tw-max-w-full"
                                      placeholder={ph}
                                      onFocus={
                                        field.name === 'title'
                                          ? (e) => {
                                              const el = e.target as HTMLInputElement;
                                              if (typeof el.select === 'function') el.select();
                                            }
                                          : undefined
                                      }
                                    />
                                  </Form.Item>
                                </ApprovalFormPaperFieldRow>
                              );
                            })}
                          {/* 휴가신청서 - 휴가 날짜 multi DatePicker (단일/연속/비연속 모두 한 번에 처리) */}
                          {/* 시작일/종료일 양식 필드는 위에서 숨김 처리, 사용 일수 = 선택한 날짜 개수 */}
                          {/* 주말/회사 공휴일은 disabledDate 로 선택 차단 + 휴가 종류별 잔여 한도 사전 검증 */}
                          {selectedDocument.documentName === '휴가신청서' && (
                            <Form.Item
                              shouldUpdate={(prev, next) =>
                                prev?.content?.vacationType !== next?.content?.vacationType ||
                                JSON.stringify(prev?.content?.plannedDates) !==
                                  JSON.stringify(next?.content?.plannedDates)
                              }
                              noStyle
                            >
                              {() => {
                                const vacationTypeId = form.getFieldValue([
                                  'content',
                                  'vacationType',
                                ]) as string | undefined;
                                const selectedType = companyLeaveTypes.find(
                                  (t) => t.companyLeaveTypeId === vacationTypeId,
                                );
                                const daysPerUse = selectedType?.daysPerUse ?? 1.0;
                                // 잔여 일수 계산 - balanceType 기준 (ANNUAL/CARRYOVER 합산 또는 MONTHLY)
                                // 시스템 기본 휴가는 code 기반, 커스텀은 balanceType 컬럼 사용 가정
                                const code = (selectedType?.code ?? '').toUpperCase();
                                const wantedBalanceTypes = (() => {
                                  if (!selectedType) return [] as string[];
                                  if (code === 'MONTHLY') return ['MONTHLY'];
                                  if (code === 'ANNUAL' || code === 'HALF_AM' || code === 'HALF_PM')
                                    return ['ANNUAL', 'CARRYOVER'];
                                  const bt = (
                                    selectedType as unknown as { balanceType?: string | null }
                                  ).balanceType;
                                  if (bt) return [bt];
                                  return [] as string[]; // 경조/병가 등 - 잔여 차감 없음
                                })();
                                const remainingDays =
                                  wantedBalanceTypes.length === 0
                                    ? null // 잔여 차감 없음 표시 X
                                    : myBalances
                                        .filter((b) =>
                                          wantedBalanceTypes.includes(b.balanceType ?? ''),
                                        )
                                        .reduce((s, b) => s + (b.remaining ?? 0), 0);
                                const maxDaysPerYear = selectedType?.maxDaysPerYear ?? null;
                                const planned =
                                  (form.getFieldValue(['content', 'plannedDates']) as
                                    | string[]
                                    | undefined) ?? [];
                                const usageDays = planned.length * daysPerUse;
                                const exceedsBalance =
                                  remainingDays != null && usageDays > remainingDays;
                                const exceedsYearLimit =
                                  maxDaysPerYear != null && usageDays > maxDaysPerYear;
                                return (
                                  <ApprovalFormPaperFieldRow label="휴가 날짜" required>
                                    <Form.Item
                                      name={['content', 'plannedDates']}
                                      className="!tw-mb-0"
                                      rules={[
                                        {
                                          validator: (_, v) => {
                                            if (!Array.isArray(v) || v.length === 0) {
                                              return Promise.reject(
                                                new Error('휴가 날짜를 1개 이상 선택해 주세요.'),
                                              );
                                            }
                                            if (!vacationTypeId) {
                                              return Promise.reject(
                                                new Error('휴가 종류를 먼저 선택해 주세요.'),
                                              );
                                            }
                                            const used = v.length * daysPerUse;
                                            if (remainingDays != null && used > remainingDays) {
                                              return Promise.reject(
                                                new Error(
                                                  `잔여 ${remainingDays}일을 초과합니다 (요청 ${used}일).`,
                                                ),
                                              );
                                            }
                                            if (maxDaysPerYear != null && used > maxDaysPerYear) {
                                              return Promise.reject(
                                                new Error(
                                                  `${selectedType?.name ?? '해당 휴가'} 연간 한도 ${maxDaysPerYear}일을 초과합니다.`,
                                                ),
                                              );
                                            }
                                            return Promise.resolve();
                                          },
                                        },
                                      ]}
                                      getValueProps={(v) => ({
                                        value: Array.isArray(v)
                                          ? (v as string[])
                                              .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
                                              .map((d) => dayjs(d, 'YYYY-MM-DD'))
                                          : null,
                                      })}
                                      getValueFromEvent={(
                                        d: dayjs.Dayjs[] | dayjs.Dayjs | null,
                                      ) => {
                                        if (!d) return undefined;
                                        const arr = Array.isArray(d) ? d : [d];
                                        const out = arr
                                          .filter((x) => x && x.isValid())
                                          .map((x) => x.format('YYYY-MM-DD'))
                                          .sort();
                                        return out.length > 0 ? out : undefined;
                                      }}
                                    >
                                      <DatePicker
                                        multiple
                                        maxTagCount={10}
                                        format="YYYY-MM-DD"
                                        placeholder="휴가일을 클릭해 하나씩 선택 (주말/공휴일 제외)"
                                        className="!tw-max-w-lg tw-w-full"
                                        // 주말 + 회사 공휴일 + 과거 일자(오늘 이전) 비활성
                                        disabledDate={(current) => {
                                          if (!current || !current.isValid()) return false;
                                          const dow = current.day();
                                          if (dow === 0 || dow === 6) return true;
                                          const ymd = current.format('YYYY-MM-DD');
                                          if (companyHolidaySet.has(ymd)) return true;
                                          return false;
                                        }}
                                      />
                                    </Form.Item>
                                    {/* 잔여 정보 안내 */}
                                    <div className="!tw-mt-1.5 tw-flex tw-flex-wrap tw-items-center tw-gap-2">
                                      {selectedType ? (
                                        <>
                                          <Typography.Text
                                            type="secondary"
                                            className="!tw-text-[11px]"
                                          >
                                            {selectedType.name} · 1회 {daysPerUse}일
                                          </Typography.Text>
                                          {remainingDays != null && (
                                            <Tag
                                              color={exceedsBalance ? 'red' : 'blue'}
                                              className="!tw-m-0 !tw-text-[11px]"
                                            >
                                              잔여 {remainingDays}일
                                            </Tag>
                                          )}
                                          {maxDaysPerYear != null && (
                                            <Tag
                                              color={exceedsYearLimit ? 'red' : 'default'}
                                              className="!tw-m-0 !tw-text-[11px]"
                                            >
                                              연 한도 {maxDaysPerYear}일
                                            </Tag>
                                          )}
                                          <Typography.Text
                                            type="secondary"
                                            className={`!tw-text-[11px] ${exceedsBalance || exceedsYearLimit ? '!tw-text-rose-600' : ''}`}
                                          >
                                            요청 {usageDays}일
                                          </Typography.Text>
                                        </>
                                      ) : (
                                        <Typography.Text
                                          type="secondary"
                                          className="!tw-text-[11px]"
                                        >
                                          휴가 종류를 먼저 선택하면 잔여 일수가 표시됩니다.
                                        </Typography.Text>
                                      )}
                                    </div>
                                  </ApprovalFormPaperFieldRow>
                                );
                              }}
                            </Form.Item>
                          )}
                        </ApprovalFormPaperLayout>
                        {composeSelectedOfficial ? (
                          <section className="tw-rounded-xl tw-border tw-border-slate-200 tw-bg-white tw-p-4">
                            <Typography.Text strong className="tw-mb-3 tw-block tw-text-sm">
                              수신 부서 (공문 필수)
                            </Typography.Text>
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
                                const labelById = new Map(
                                  officialOrgSelectOptions.map((o) => [o.value, o.label]),
                                );
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
                          </section>
                        ) : null}
                        <section className="tw-rounded-xl tw-border tw-border-slate-200 tw-bg-white tw-p-4">
                          <Typography.Text strong className="tw-mb-3 tw-block tw-text-sm">
                            부서 문서함 공개
                          </Typography.Text>
                          <Space direction="vertical" size="small" className="tw-w-full">
                            <Typography.Paragraph type="secondary" className="!tw-mb-0 tw-text-sm">
                              켜두면 같은 부서 구성원이 부서 문서함에서 제목과 내용을 볼 수
                              있습니다. 끄면 작성자만 전체를 열람할 수 있고, 다른 부서원에게는
                              목록에서만 일부 정보가 표시됩니다.
                            </Typography.Paragraph>
                            <Space align="center">
                              <Switch
                                checked={
                                  composeSelectedOfficial ? true : composeDeptVisibleYn === 'Y'
                                }
                                disabled={composeSelectedOfficial}
                                onChange={(checked) => setComposeDeptVisibleYn(checked ? 'Y' : 'N')}
                                aria-label="부서 문서함에 공개"
                              />
                              <Typography.Text className="tw-text-sm">
                                {composeSelectedOfficial || composeDeptVisibleYn === 'Y'
                                  ? '공개'
                                  : '비공개'}
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
                        </section>
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
                            <Upload.Dragger
                              {...composeAttachmentDraggerProps}
                              className="!tw-bg-transparent"
                            >
                              <p className="ant-upload-drag-icon">
                                <InboxOutlined />
                              </p>
                              <p className="ant-upload-text">
                                클릭하거나 파일을 여기로 끌어다 놓으세요
                              </p>
                              <p className="ant-upload-hint">
                                최대 {APPROVAL_ATTACHMENT_MAX_COUNT}개, 파일당 10MB 이하, 합계 50MB
                                이하 (jpg, png, pdf, Office, hwp, zip 등)
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
                                첨부 스케줄이 가득 찼습니다.
                              </div>
                              <Typography.Paragraph
                                type="secondary"
                                className="!tw-mb-0 tw-mt-1 tw-text-xs"
                              >
                                최대 {APPROVAL_ATTACHMENT_MAX_COUNT}개, 파일당 10MB 이하, 합계 50MB
                                이하 (jpg, png, pdf, Office, hwp, zip 등)
                              </Typography.Paragraph>
                            </div>
                          )}
                          {composeRemoteAttachmentsLoading ? (
                            <div className="tw-py-2 tw-text-center tw-text-sm tw-text-slate-500">
                              첨부 목록 불러오는 중…
                            </div>
                          ) : null}
                          {(composeRemoteAttachments.length > 0 ||
                            composeAttachmentFiles.length > 0) && (
                            <ul className="tw-mb-0 tw-mt-3 tw-list-none tw-space-y-2 tw-border-t tw-border-slate-200 tw-pt-3 tw-pl-0">
                              {composeRemoteAttachments.map((a) => (
                                <li
                                  key={a.attachmentId}
                                  className="tw-flex tw-flex-wrap tw-items-center tw-justify-between tw-gap-2 tw-text-sm"
                                >
                                  <span
                                    className="tw-min-w-0 tw-truncate tw-text-slate-800"
                                    title={a.fileName}
                                  >
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
                                      onClick={() =>
                                        window.open(a.approvalUrl, '_blank', 'noopener,noreferrer')
                                      }
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
                                      onClick={() =>
                                        void deleteComposeRemoteAttachmentM.mutateAsync(
                                          a.attachmentId,
                                        )
                                      }
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
                                  <span
                                    className="tw-min-w-0 tw-truncate tw-text-slate-800"
                                    title={f.name}
                                  >
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
                                        setComposeAttachmentFiles((prev) =>
                                          prev.filter((_, i) => i !== idx),
                                        )
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
                      </div>
                    </div>
                    {renderComposeDraftSubmitActions()}
                  </div>
                  <aside
                    className={clsx(
                      composeApprovalInfoAsideClass,
                      'tw-flex tw-min-h-0 tw-max-h-[50vh] tw-shrink-0 tw-flex-col tw-overflow-hidden tw-border-t tw-border-slate-200 tw-bg-white tw-p-0 lg:tw-max-h-none lg:tw-self-stretch lg:tw-border-l lg:tw-border-t-0',
                    )}
                  >
                    {renderComposeDocumentSidebar({ variant: 'flush' })}
                  </aside>
                </div>
              ) : null}

              {composePhaseView === 'fill' &&
              selectedDocument &&
              selectedSchema.fields.length === 0 ? (
                <div className="tw-mb-4 tw-max-w-lg">{renderComposeDocumentSidebar()}</div>
              ) : null}
            </Form>
          )}
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
                isEmbedComposeModal ? 'wf-approval-embed-card' : 'tw-rounded-lg tw-border-slate-200/80 tw-shadow-sm',
                isEmbedComposeModal &&
                  'tw-flex tw-min-h-0 tw-flex-1 tw-flex-col tw-overflow-hidden',
              )}
              styles={
                isEmbedComposeModal
                  ? {
                      body: {
                        flex: 1,
                        minHeight: 0,
                        display: 'flex',
                        flexDirection: 'column',
                        padding: 16,
                      },
                    }
                  : undefined
              }
            >
              {isEmbedComposeModal ? (
                <div className="tw-flex tw-min-h-0 tw-flex-1 tw-flex-col tw-gap-4">
                  <div className="tw-flex tw-shrink-0 tw-flex-col tw-gap-3">
                    {guideBox === 'per-all' ? (
                      <Tabs
                        size="small"
                        className={APPROVAL_NAV_FILTER_TABS_CLASS}
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
                        className={APPROVAL_NAV_FILTER_TABS_CLASS}
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
                  <div className="wf-approval-modal-table-fill">
                    {guideBox === 'per-viewers' ? (
                      <Tabs
                        size="small"
                        className={APPROVAL_CONTENT_TABS_CLASS}
                        activeKey={viewerInboxTabKey}
                        onChange={navigateViewerInboxTab}
                        items={[
                          {
                            key: 'cc',
                            label: '참조',
                            children: (
                              <AppDataTable<ApprovalRequestDetail>
                                size="small"
                                rowKey="requestId"
                                loading={myTableLoading}
                                columns={viewerCcOnlyColumns}
                                dataSource={viewerCcRequests}
                                pagination={{ pageSize: 10 }}
                                className="wf-approval-modal-table"
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
                              <AppDataTable<ApprovalRequestDetail>
                                size="small"
                                rowKey="requestId"
                                loading={myTableLoading}
                                columns={viewerCcOnlyColumns}
                                dataSource={viewerCirculationRequests}
                                pagination={{ pageSize: 10 }}
                                className="wf-approval-modal-table"
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
                      <AppDataTable<ApprovalRequestDetail>
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
                        className="wf-approval-modal-table"
                        tableLayout={guideBox === 'per-official' ? undefined : 'fixed'}
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
                      className={clsx('tw-mb-3', APPROVAL_NAV_FILTER_TABS_CLASS)}
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
                      className={clsx('tw-mb-3', APPROVAL_NAV_FILTER_TABS_CLASS)}
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
                      className={APPROVAL_CONTENT_TABS_CLASS}
                      activeKey={viewerInboxTabKey}
                      onChange={navigateViewerInboxTab}
                      items={[
                        {
                          key: 'cc',
                          label: '참조',
                          children: (
                            <AppDataTable<ApprovalRequestDetail>
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
                            <AppDataTable<ApprovalRequestDetail>
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
                    <AppDataTable<ApprovalRequestDetail>
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
                      tableLayout={guideBox === 'per-official' ? undefined : 'fixed'}
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
                isEmbedComposeModal ? 'wf-approval-embed-card' : 'tw-rounded-lg tw-border-slate-200/80 tw-shadow-sm',
                isEmbedComposeModal &&
                  'tw-flex tw-min-h-0 tw-flex-1 tw-flex-col tw-overflow-hidden',
              )}
              styles={
                isEmbedComposeModal
                  ? {
                      body: {
                        flex: 1,
                        minHeight: 0,
                        display: 'flex',
                        flexDirection: 'column',
                        padding: 16,
                      },
                    }
                  : undefined
              }
            >
              {(() => {
                const pendingTable = (
                  <AppDataTable<ApprovalRequestDetail>
                    size={isEmbedComposeModal ? 'small' : undefined}
                    rowKey="requestId"
                    loading={pendingTableLoading}
                    columns={pendingColumns}
                    dataSource={pendingInboxRows}
                    pagination={{ pageSize: 10 }}
                    className={isEmbedComposeModal ? 'wf-approval-modal-table' : undefined}
                    onRow={(record) => ({
                      onClick: () => setSelectedRequestId(record.requestId),
                      style: { cursor: 'pointer' },
                    })}
                  />
                );
                return isEmbedComposeModal ? (
                  <div className="wf-approval-modal-table-fill">{pendingTable}</div>
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
                isEmbedComposeModal ? 'wf-approval-embed-card' : 'tw-rounded-lg tw-border-slate-200/80 tw-shadow-sm',
                isEmbedComposeModal &&
                  'tw-flex tw-min-h-0 tw-flex-1 tw-flex-col tw-overflow-hidden',
              )}
              styles={
                isEmbedComposeModal
                  ? {
                      body: {
                        flex: 1,
                        minHeight: 0,
                        display: 'flex',
                        flexDirection: 'column',
                        padding: 16,
                      },
                    }
                  : undefined
              }
            >
              {(() => {
                const actedTable = (
                  <AppDataTable<ApprovalRequestDetail>
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
                    className={isEmbedComposeModal ? 'wf-approval-modal-table' : undefined}
                    onRow={(record) => ({
                      onClick: () => setSelectedRequestId(record.requestId),
                      style: { cursor: 'pointer' },
                    })}
                  />
                );
                return isEmbedComposeModal ? (
                  <div className="wf-approval-modal-table-fill">{actedTable}</div>
                ) : (
                  actedTable
                );
              })()}
            </Card>
          ) : null}
        </div>
      )}

      <AppSingleActionModal
        title="미리보기"
        open={
          composePreviewOpen &&
          composePhaseView === 'fill' &&
          selectedDocument != null &&
          tab === 'compose'
        }
        onClose={() => setComposePreviewOpen(false)}
        onSubmit={() => setComposePreviewOpen(false)}
        submitText="닫기"
        width={720}
      >
        {composePreviewOpen &&
        composePhaseView === 'fill' &&
        selectedDocument != null &&
        tab === 'compose' ? (
          <div className="tw-px-5 tw-py-4">
            <Typography.Paragraph className="!tw-mb-2">
              <strong>{selectedDocument.documentName}</strong>
            </Typography.Paragraph>
            <pre className="tw-max-h-[min(60vh,480px)] tw-overflow-auto tw-rounded-lg tw-border tw-border-slate-200 tw-bg-slate-50 tw-p-3 tw-text-xs tw-leading-relaxed">
              {JSON.stringify(form.getFieldsValue(), null, 2)}
            </pre>
          </div>
        ) : null}
      </AppSingleActionModal>

      <AppDoubleActionModal
        title="결재 정보"
        open={
          composeApprovalInfoModalOpen &&
          composePhaseView === 'fill' &&
          selectedDocument != null &&
          tab === 'compose'
        }
        onClose={() => setComposeApprovalInfoModalOpen(false)}
        onConfirm={() => setComposeApprovalInfoModalOpen(false)}
        confirmText="확인"
        cancelText="취소"
        destroyOnHidden={false}
        width={1000}
        zIndex={2600}
        getContainer={
          isEmbedComposeModal
            ? () => {
                try {
                  return window.parent?.document?.body ?? document.body;
                } catch {
                  return document.body;
                }
              }
            : undefined
        }
      >
        <div className="tw-px-5 tw-py-2">
          {selectedDocument ? renderComposeApprovalInfoContent({ stacked: false }) : null}
        </div>
      </AppDoubleActionModal>

      <ApprovalRequestReadOnlyModal
        requestId={selectedRequestId}
        zIndex={2700}
        getContainer={
          isEmbedComposeModal
            ? () => {
                try {
                  return window.parent?.document?.body ?? document.body;
                } catch {
                  return document.body;
                }
              }
            : undefined
        }
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

      <AppDoubleActionModal
        title={
          cancelTarget && canSendOfficialDocument(cancelTarget, authMemberId)
            ? '공문 발송 취소'
            : cancelTarget && String(cancelTarget.requestStatus).toUpperCase() === 'DRAFT'
              ? '임시저장 삭제'
              : '결재 취소'
        }
        open={cancelTarget != null}
        onClose={() => {
          setCancelTarget(null);
          setCancelReason('');
        }}
        onConfirm={() => {
          if (!cancelTarget) return;
          if (!cancelReason.trim()) {
            message.warning(
              String(cancelTarget.requestStatus).toUpperCase() === 'DRAFT'
                ? '삭제 사유를 입력해 주세요.'
                : '취소 사유를 입력해 주세요.',
            );
            return;
          }
          void cancelRequestM.mutateAsync({
            requestId: cancelTarget.requestId,
            reason: cancelReason.trim(),
            isDraft: String(cancelTarget.requestStatus).toUpperCase() === 'DRAFT',
          });
        }}
        confirmText={
          cancelTarget && canSendOfficialDocument(cancelTarget, authMemberId)
            ? '취소 확정'
            : cancelTarget && String(cancelTarget.requestStatus).toUpperCase() === 'DRAFT'
              ? '삭제'
              : '취소 확정'
        }
        cancelText="닫기"
        confirmLoading={cancelRequestM.isPending}
        confirmDanger
      >
        <div className="tw-px-5 tw-py-4">
          {cancelTarget && canSendOfficialDocument(cancelTarget, authMemberId) ? (
            <Typography.Paragraph type="secondary" className="!tw-mb-2 !tw-text-sm">
              승인된 공문이 수신 부서로 발송되기 전에만 취소할 수 있습니다.
            </Typography.Paragraph>
          ) : null}
          <Input.TextArea
            rows={4}
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            placeholder={
              cancelTarget && String(cancelTarget.requestStatus).toUpperCase() === 'DRAFT'
                ? '삭제 사유를 입력하세요.'
                : '취소 사유를 입력하세요.'
            }
          />
        </div>
      </AppDoubleActionModal>

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
          void rejectM.mutateAsync({
            approvalId: approvalAction.approvalId,
            comment: approvalComment.trim(),
          });
        }}
        confirmText={approvalAction?.mode === 'approve' ? '승인' : '반려'}
        cancelText="닫기"
        confirmLoading={approveM.isPending || rejectM.isPending}
        confirmDanger={approvalAction?.mode === 'reject'}
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
    </div>
  );
}
