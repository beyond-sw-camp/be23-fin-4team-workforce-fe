import {
  ApartmentOutlined,
  ArrowLeftOutlined,
  CalendarOutlined,
  ClockCircleOutlined,
  CloseOutlined,
  DeleteOutlined,
  DollarOutlined,
  EyeOutlined,
  FileProtectOutlined,
  FileTextOutlined,
  FolderOpenOutlined,
  FormOutlined,
  InfoCircleOutlined,
  MenuOutlined,
  MoreOutlined,
  PaperClipOutlined,
  SafetyCertificateOutlined,
  SaveOutlined,
  SearchOutlined,
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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
  Progress,
  Select,
  Space,
  Spin,
  Steps,
  Table,
  Tabs,
  Tag,
  Tree,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { DataNode } from 'antd/es/tree';
import dayjs from 'dayjs';
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
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
  type ApprovalRequestType,
} from '@/features/approvals/api/approvalApi';
import { absenceProxyApi } from '@/features/approvals/api/absenceProxyApi';
import {
  ApprovalFormPaperFieldRow,
  ApprovalFormPaperLayout,
  ApprovalFormStampColumn,
} from '@/features/approvals/ui/ApprovalFormPaperLayout';
import { useAuth } from '@/features/auth/useAuth';
import clsx from 'clsx';
import {
  APPROVAL_REQUEST_STATUS,
  type ApprovalRequestStatus,
  approvalRequestApi,
  isPendingApprovalLineForProxyActor,
  requestIncludesMyProxyAct,
  type ApprovalLine,
  type ApprovalRequestDetail,
  type ApprovalViewer,
  type CreateApprovalRequestPayload,
  type ViewerType,
} from '@/features/approvals/api/approvalRequestApi';
import { memberApi } from '@/features/member/api/memberApi';
import { organizationApi, type OrgChartOrgNode } from '@/features/organization/api/organizationApi';
import { PERM } from '@/features/permissions/backend-permissions';
import { usePermissions } from '@/features/permissions/usePermissionsHook';
import { ApprovalsAdminPage } from '@/pages/app/ApprovalsAdminPage';
import { parseDetailContentJson, parseFormSchema } from '@/features/approvals/lib/approvalFormSchema';
import { syncApprovalQueryCachesAfterAct } from '@/features/approvals/lib/syncApprovalQueryCaches';
import {
  APPROVAL_GUIDE_BOX_LABEL,
  mergeRequestsByRequestId,
  resolveGuideBox,
  type ApprovalGuideBox,
} from '@/features/approvals/lib/approvalGuideNav';
import { ApprovalRequestReadOnlyModal } from '@/features/approvals/ui/ApprovalRequestReadOnlyModal';
import { getRefreshIdentityHeaders } from '@/shared/stores/authRefreshIdentityStore';

/** 결재 작성 보조 영역: 카드 테두리·회색 헤더 최소화 */
const APPROVAL_COMPOSE_CARD_CLASS = 'tw-shadow-none tw-bg-transparent';
const APPROVAL_COMPOSE_TABLE_CLASS =
  '[&_.ant-table-thead_.ant-table-cell]:!tw-bg-white [&_.ant-table-thead_.ant-table-cell]:!tw-text-slate-600 [&_.ant-table-thead_.ant-table-cell]:!tw-font-semibold';

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
};

const REQUEST_TYPE_ICON: Record<ApprovalRequestType, ComponentType<{ className?: string }>> = {
  VACATION: CalendarOutlined,
  ATTENDANCE: ClockCircleOutlined,
  HR_MOVEMENT: ApartmentOutlined,
  SALARY: DollarOutlined,
  GENERAL: FileTextOutlined,
  CONTRACT: FileProtectOutlined,
  CERTIFICATE: SafetyCertificateOutlined,
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

/** 카테고리별 카드에서 처음에 보여 줄 양식 갯수(나머지는 펼치기) */
const FORM_PICKER_CATEGORY_INITIAL = 3;

type DocumentFormPickerProps = {
  value?: string;
  onChange?: (documentId: string) => void;
  /** 양식 카드/최근 목록에서 선택 직후 (같은 양식 재선택 포함) */
  onAfterPick?: (documentId: string, doc?: ApprovalDocument) => void;
  documents: ApprovalDocument[];
  loading?: boolean;
  myPendingApprovalCount?: number;
  mySubmittedInProgressCount?: number;
  onOpenPendingTab?: () => void;
  onOpenMyTab?: () => void;
};

function DocumentFormPicker({
  value,
  onChange,
  onAfterPick,
  documents,
  loading,
  myPendingApprovalCount = 0,
  mySubmittedInProgressCount = 0,
  onOpenPendingTab,
  onOpenMyTab,
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
      <Spin spinning tip="양식 목록 불러오는 중...">
        <div className="tw-min-h-[160px] tw-rounded-xl tw-border tw-border-dashed tw-border-slate-200 tw-bg-slate-50/60" />
      </Spin>
    );
  }

  if (!documents.length) {
    return <Empty description="사용 가능한 활성 양식이 없습니다." />;
  }

  const totalPending = myPendingApprovalCount;
  const inProgress = mySubmittedInProgressCount;

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
        <Card
          size="small"
          className="tw-border-0 tw-bg-gradient-to-br tw-from-slate-800 tw-to-slate-900 tw-text-white tw-shadow-md"
          styles={{ body: { padding: 14 } }}
        >
          <Typography.Text className="!tw-mb-1 !tw-block !tw-text-xs !tw-text-slate-300">결재 요약</Typography.Text>
          <Typography.Title level={5} className="!tw-mb-3 !tw-mt-0 !tw-text-white">
            대기 {totalPending}건
          </Typography.Title>
          <Space direction="vertical" size={6} className="tw-w-full">
            <div className="tw-flex tw-gap-2">
              <Button
                size="small"
                className="tw-flex-1 !tw-border-white/25 !tw-bg-white/10 !tw-text-white hover:!tw-bg-white/20"
                onClick={onOpenMyTab}
              >
                진행 중 {inProgress}
              </Button>
              <Button
                size="small"
                type="primary"
                className="tw-flex-1 !tw-bg-blue-500 hover:!tw-bg-blue-400"
                onClick={onOpenPendingTab}
              >
                결재 대기 {totalPending}
              </Button>
            </div>
          </Space>
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
                                <span className="tw-block tw-font-medium tw-text-slate-800">{doc.documentName}</span>
                                {doc.autoApproveYn === 'Y' ? (
                                  <Tag bordered={false} color="processing" className="!tw-mt-1 !tw-text-[10px]">
                                    자동승인
                                  </Tag>
                                ) : null}
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

function myViewerChannelLabel(row: ApprovalRequestDetail, myMemberId?: string): string {
  const mid = myMemberId?.trim();
  if (!mid) return '—';
  const v = row.viewers?.find((x) => memberKeyEq(x.viewerMemberId, mid));
  if (!v) return '—';
  const t = String(v.viewerType).toUpperCase();
  if (t === 'CC') return '참조';
  if (t === 'CIRCULATION') return '공람';
  return t;
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

type OrgPickerMemberRow = {
  memberId: string;
  name: string;
  jobTitleName: string;
  organizationName: string;
};

function findOrgChartNode(roots: OrgChartOrgNode[], organizationId: string): OrgChartOrgNode | null {
  for (const n of roots) {
    if (n.organizationId === organizationId) return n;
    const found = findOrgChartNode(n.children, organizationId);
    if (found) return found;
  }
  return null;
}

/** 선택 노드 및 모든 하위 조직 소속 멤버(중복 제거) */
function collectOrgMemberRowsUnderNode(node: OrgChartOrgNode): OrgPickerMemberRow[] {
  const rows: OrgPickerMemberRow[] = [];
  const seen = new Set<string>();
  const walk = (n: OrgChartOrgNode) => {
    for (const g of n.jobGrades) {
      for (const m of g.members) {
        if (seen.has(m.memberId)) continue;
        seen.add(m.memberId);
        rows.push({
          memberId: m.memberId,
          name: m.name,
          jobTitleName: m.jobTitleName,
          organizationName: n.name,
        });
      }
    }
    n.children.forEach(walk);
  };
  walk(node);
  return rows;
}

/** 해당 조직 노드에 직접 매달린 멤버만 (하위 부서 제외) */
function collectDirectMembersOfNode(node: OrgChartOrgNode): OrgPickerMemberRow[] {
  const rows: OrgPickerMemberRow[] = [];
  for (const g of node.jobGrades) {
    for (const m of g.members) {
      rows.push({
        memberId: m.memberId,
        name: m.name,
        jobTitleName: m.jobTitleName,
        organizationName: node.name,
      });
    }
  }
  return rows;
}

/** 전체 조직도에서 직접 소속 멤버만 모아 memberId 기준 중복 제거 (검색용) */
function flattenDirectMembersDeduped(roots: OrgChartOrgNode[]): OrgPickerMemberRow[] {
  const seen = new Set<string>();
  const out: OrgPickerMemberRow[] = [];
  const walk = (n: OrgChartOrgNode) => {
    for (const r of collectDirectMembersOfNode(n)) {
      if (seen.has(r.memberId)) continue;
      seen.add(r.memberId);
      out.push(r);
    }
    n.children.forEach(walk);
  };
  roots.forEach(walk);
  return out;
}

/** 조직 트리 + 각 조직 아래 소속 멤버를 자식 노드로 표시 */
function buildOrgTreeWithMemberLeaves(nodes: OrgChartOrgNode[]): DataNode[] {
  const mapNode = (node: OrgChartOrgNode): DataNode => {
    const childOrgs = node.children.map(mapNode);
    const memberLeaves: DataNode[] = [];
    for (const g of node.jobGrades) {
      for (const m of g.members) {
        memberLeaves.push({
          key: `member:${node.organizationId}:${m.memberId}`,
          title: `${m.name}${m.jobTitleName ? ` (${m.jobTitleName})` : ''}`,
          isLeaf: true,
        });
      }
    }
    return {
      key: node.organizationId,
      title: node.name,
      children: [...childOrgs, ...memberLeaves],
    };
  };
  return nodes.map(mapNode);
}

const APPROVAL_ORG_DRAG_MIME = 'application/x-approval-org-picker';

function parseApprovalOrgDrag(e: React.DragEvent): { kind: 'member'; memberId: string } | { kind: 'org'; organizationId: string } | null {
  try {
    const raw = e.dataTransfer.getData(APPROVAL_ORG_DRAG_MIME);
    if (!raw) return null;
    const o = JSON.parse(raw) as { kind?: string; memberId?: string; organizationId?: string };
    if (o.kind === 'member' && o.memberId) return { kind: 'member', memberId: o.memberId };
    if (o.kind === 'org' && o.organizationId) return { kind: 'org', organizationId: o.organizationId };
  } catch {
    /* ignore */
  }
  return null;
}

function ApprovalOrgDropZone(props: {
  children: React.ReactNode;
  onDropMember: (memberId: string) => void;
  onDropOrg: (organizationId: string) => void;
}) {
  const [over, setOver] = useState(false);
  const depthRef = useRef(0);
  return (
    <div
      className={clsx(
        'tw-min-h-0 tw-min-w-0 tw-flex-1 tw-rounded-lg tw-transition-colors',
        over && 'tw-bg-blue-50/50 tw-ring-2 tw-ring-blue-200',
      )}
      onDragEnter={(e) => {
        e.preventDefault();
        depthRef.current += 1;
        setOver(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        depthRef.current -= 1;
        if (depthRef.current <= 0) {
          depthRef.current = 0;
          setOver(false);
        }
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      }}
      onDrop={(e) => {
        e.preventDefault();
        depthRef.current = 0;
        setOver(false);
        const parsed = parseApprovalOrgDrag(e);
        if (!parsed) return;
        if (parsed.kind === 'member') props.onDropMember(parsed.memberId);
        else props.onDropOrg(parsed.organizationId);
      }}
    >
      {props.children}
    </div>
  );
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
      },
  });
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
  const [composeSidebarTab, setComposeSidebarTab] = useState<'line' | 'doc'>('line');
  const [composeAutosaveMode, setComposeAutosaveMode] = useState<'off' | '1m'>('off');
  const [memberKeyword, setMemberKeyword] = useState('');
  const [ccViewers, setCcViewers] = useState<ViewerDraft[]>([]);
  const [circulationViewers, setCirculationViewers] = useState<ViewerDraft[]>([]);
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
  const composeDraftHydratingRef = useRef(false);
  const [form] = Form.useForm();

  const canAdmin = hasPermission(PERM.APPROVAL_AD_READ);
  const { user } = useAuth();
  /** 결재 API·라인의 memberId와 동일해야 함 — JWT/로컬 저장 `X-User-UUID`로 보강 */
  const authMemberId =
    user?.id?.trim() || getRefreshIdentityHeaders()['X-User-UUID']?.trim() || undefined;

  const allowedTabs = useMemo(() => ['compose', 'my', 'pending', 'acted', ...(canAdmin ? ['admin'] : [])], [canAdmin]);

  const tab = useMemo(() => {
    const rawTab = routeSearch.tab;
    return typeof rawTab === 'string' && allowedTabs.includes(rawTab) ? rawTab : 'compose';
  }, [routeSearch.tab, allowedTabs]);
  const onComposeHub = tab === 'compose' && routeSearch.sideNav === 'request-compose';

  const requestStatusFilter = useMemo<ApprovalRequestStatus | 'ALL'>(() => {
    if (tab !== 'my') return 'ALL';
    const box = typeof routeSearch.box === 'string' ? routeSearch.box : undefined;
    if (box === 'per-draft' || String(routeSearch.myStatus).toUpperCase() === 'DRAFT') return 'DRAFT';
    if (box && ['per-all', 'per-viewers', 'per-official'].includes(box)) return 'ALL';
    const ms = routeSearch.myStatus;
    if (
      ms === 'ALL' ||
      (typeof ms === 'string' && (APPROVAL_REQUEST_STATUS as readonly string[]).includes(ms))
    ) {
      return ms as ApprovalRequestStatus | 'ALL';
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

  const selectedDocument = useMemo(
    () => activeDocuments.find((d) => d.documentId === selectedDocumentId) ?? null,
    [activeDocuments, selectedDocumentId],
  );
  const selectedSchema = useMemo(
    () => (selectedDocument ? parseFormSchema(selectedDocument.formSchema) : { fields: [] }),
    [selectedDocument],
  );

  const { data: orgChart } = useQuery({
    queryKey: ['organization', 'org-chart'],
    queryFn: () => organizationApi.getOrgChart(),
    staleTime: 60_000,
  });

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
    queryFn: () =>
      guideBox === 'per-official'
        ? approvalRequestApi.listMyRequests(undefined, 'OFFICIAL')
        : requestStatusFilter === 'ALL'
          ? approvalRequestApi.listMyRequests()
          : approvalRequestApi.listMyRequests(requestStatusFilter),
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
  const myOrganizationIdForDept =
    (drafterProfile as { organizationId?: string } | undefined)?.organizationId?.trim() || '';
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
    mutationFn: approvalRequestApi.createRequest,
    onSuccess: async (res) => {
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
      setComposePhase('select');
      setLineInfoTab('approval');
      queueMicrotask(() => {
        composeDraftHydratingRef.current = false;
      });
      await refreshUserQueries();
      navigate({ to: '/app/approvals', search: { tab: 'my', box: 'per-all' }, replace: true });
    },
    onError: (e: Error) => message.error(e.message || '결재 요청 처리에 실패했습니다.'),
  });

  const updateRequestM = useMutation({
    mutationFn: ({ requestId, payload }: { requestId: string; payload: CreateApprovalRequestPayload }) =>
      approvalRequestApi.updateDraft(requestId, payload),
    onSuccess: async (res, vars) => {
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
      setComposePhase('select');
      setLineInfoTab('approval');
      queueMicrotask(() => {
        composeDraftHydratingRef.current = false;
      });
      await refreshUserQueries();
      navigate({ to: '/app/approvals', search: { tab: 'my', box: 'per-all' }, replace: true });
    },
    onError: (e: Error) => message.error(e.message || '결재 요청 처리에 실패했습니다.'),
  });

  const resetComposeToNew = useCallback(() => {
    composeDraftHydratingRef.current = true;
    setComposeEditingRequestId(null);
    form.resetFields();
    form.setFieldsValue({ content: {} });
    setSelectedDocumentId(undefined);
    setApprovalLineDrafts([]);
    setCcViewers([]);
    setCirculationViewers([]);
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
        setComposeEditingRequestId(detail.requestId);
        const content = parseDetailContentJson(detail);
        form.setFieldsValue({
          documentId: detail.documentId,
          content,
        });
        setSelectedDocumentId(detail.documentId);
        setApprovalLineDrafts(doc.autoApproveYn === 'Y' ? [] : approvalLinesToMemberDrafts(detail.approvalLines));
        const { cc, circulation } = viewersToDraftRows(detail.viewers ?? []);
        setCcViewers(cc);
        setCirculationViewers(circulation);
        setOrgTreeSelectedKey(undefined);
        setComposePhase('fill');
        setLineInfoTab(doc.autoApproveYn === 'Y' ? 'cc' : 'approval');
        navigate({ to: '/app/approvals', search: { tab: 'compose' }, replace: true });
        message.success('임시저장 문서를 불러왔습니다.');
        void qc.invalidateQueries({ queryKey: ['approval-user', 'my-requests'] });
        queueMicrotask(() => {
          composeDraftHydratingRef.current = false;
        });
        queueMicrotask(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
      } catch (e) {
        composeDraftHydratingRef.current = false;
        message.error(e instanceof Error ? e.message : '문서를 불러오지 못했습니다.');
      }
    },
    [activeDocuments, form, message, navigate, qc],
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
      if (!doc || doc.autoApproveYn === 'Y') {
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
            };
          });
        setApprovalLineDrafts(nextDrafts.filter((v) => v != null) as ApprovalLineDraft[]);
      } catch {
        setApprovalLineDrafts([]);
      }
    },
    [composeEditingRequestId, qc],
  );

  const openComposeForRequestType = useCallback(
    (requestType: ApprovalRequestType) => {
      const doc = activeDocuments.find((d) => normalizeApprovalRequestType(d.requestType) === requestType);
      if (!doc) {
        message.info(`${REQUEST_TYPE_LABEL[requestType] ?? requestType} 양식이 활성화되어 있지 않습니다.`);
        return;
      }
      form.setFieldValue('documentId', doc.documentId);
      setSelectedDocumentId(doc.documentId);
      setComposeSidebarTab('line');
      setLineInfoTab(doc.autoApproveYn === 'Y' ? 'cc' : 'approval');
      void applyPolicyLineDrafts(doc);
      setComposePhase('fill');
      navigate({ to: '/app/approvals', search: { tab: 'compose' }, replace: true });
      queueMicrotask(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
    },
    [activeDocuments, applyPolicyLineDrafts, form, message, navigate],
  );

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

  const addApproverFromOrg = async (memberId: string) => {
    if (!selectedDocument || selectedDocument.autoApproveYn === 'Y') return;
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
      if (!selectedDocument || selectedDocument.autoApproveYn === 'Y') return;
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

      const flatApprovers =
        selectedDocument.autoApproveYn === 'Y' ? [] : flattenApprovalLinesForSubmit(approvalLineDrafts);
      const approvalLines = flatApprovers.map((line, idx) => ({
        stepOrder: idx + 1,
        approverMemberId: line.approverMemberId,
        approverMemberPositionId: line.approverMemberPositionId,
      }));

      if (status === 'WAIT' && selectedDocument.autoApproveYn !== 'Y') {
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

      const payload: CreateApprovalRequestPayload = {
        documentId: values.documentId ?? selectedDocument.documentId,
        contentJson: JSON.stringify(values.content ?? {}),
        requestStatus: status,
        ...(approvalLines.length ? { approvalLines } : {}),
        ...(viewersPayload.length ? { viewers: viewersPayload } : {}),
      };

      if (composeEditingRequestId) {
        await updateRequestM.mutateAsync({ requestId: composeEditingRequestId, payload });
      } else {
        await createRequestM.mutateAsync(payload);
      }
    } catch {
      // form validation
    }
  };

  const composeSaving = createRequestM.isPending || updateRequestM.isPending;

  const myColumns = [
    {
      title: '양식',
      dataIndex: 'documentName',
      key: 'documentName',
    },
    {
      title: '상태',
      dataIndex: 'requestStatus',
      key: 'requestStatus',
      width: 140,
      render: (status: string) => statusTag(status),
    },
    {
      title: '요청일',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 180,
      render: (v: string) => formatDateTime(v),
    },
    {
      title: '관리',
      key: 'actions',
      width: 280,
      render: (_: unknown, row: ApprovalRequestDetail) => (
        <Space size="small" wrap>
          <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => setSelectedRequestId(row.requestId)}>
            상세
          </Button>
          {String(row.requestStatus).toUpperCase() === 'DRAFT' ? (
            <Button
              type="link"
              size="small"
              icon={<FolderOpenOutlined />}
              onClick={() => void openDraftForCompose(row.requestId)}
            >
              이어쓰기
            </Button>
          ) : null}
          {(row.requestStatus === 'DRAFT' || row.requestStatus === 'WAIT') && (
            <Button type="link" size="small" danger onClick={() => setCancelTarget(row)}>
              취소
            </Button>
          )}
        </Space>
      ),
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
      width: 240,
      render: (_: unknown, row: ApprovalRequestDetail) => {
        const myLine = row.approvalLines.find((l) => String(l.approvalStatus).toUpperCase() === 'PENDING');
        return (
          <Space size="small">
            <Button type="link" size="small" onClick={() => setSelectedRequestId(row.requestId)}>
              상세
            </Button>
            <Button
              type="link"
              size="small"
              disabled={!myLine}
              onClick={() => myLine && setApprovalAction({ approvalId: myLine.approvalId, mode: 'approve' })}
            >
              승인
            </Button>
            <Button
              type="link"
              size="small"
              danger
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

  const viewerChannelColumns: ColumnsType<ApprovalRequestDetail> = useMemo(
    () => [
      { title: '양식', dataIndex: 'documentName', key: 'documentName' },
      {
        title: '채널',
        key: 'channel',
        width: 88,
        render: (_: unknown, row: ApprovalRequestDetail) => myViewerChannelLabel(row, authMemberId),
      },
      {
        title: '열람',
        key: 'read',
        width: 88,
        render: (_: unknown, row: ApprovalRequestDetail) =>
          unreadViewerForMember(row, authMemberId) ? <Tag color="error">미열람</Tag> : <Tag>열람</Tag>,
      },
      {
        title: '요청 상태',
        dataIndex: 'requestStatus',
        key: 'requestStatus',
        width: 130,
        render: (status: string) => statusTag(status),
      },
      {
        title: '요청일',
        dataIndex: 'createdAt',
        key: 'createdAt',
        width: 180,
        render: (v: string) => formatDateTime(v),
      },
      {
        title: '상세',
        key: 'actions',
        width: 100,
        render: (_: unknown, row: ApprovalRequestDetail) => (
          <Button type="link" size="small" onClick={() => setSelectedRequestId(row.requestId)}>
            보기
          </Button>
        ),
      },
    ],
    [authMemberId],
  );

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
          selectedKeys={
            orgTreeSelectedKey && !String(orgTreeSelectedKey).startsWith('member:') ? [orgTreeSelectedKey] : []
          }
          onSelect={(keys) => {
            const key = typeof keys[0] === 'string' ? keys[0] : undefined;
            if (!key || key.startsWith('member:')) {
              setOrgTreeSelectedKey(undefined);
              return;
            }
            setOrgTreeSelectedKey(key);
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
        조직·멤버 노드를 오른쪽 목록으로 드래그해 추가하세요. 조직 이름을 클릭하면 하위 부서와 소속 멤버가 펼쳐집니다. 오른쪽에는 조직 단위로 표시되며, 제출 시 해당 조직(하위 부서 포함) 소속 멤버 전원에게 반영됩니다.
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
    if (!selectedDocument?.documentId || selectedDocument.autoApproveYn === 'Y') return;
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
          <Button
            type="text"
            size="small"
            icon={<ArrowLeftOutlined className="tw-text-[13px] tw-text-[#333]" />}
            className={composeToolbarGhostBtn}
            onClick={() => setComposePhase('select')}
          >
            양식
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
          {composeEditingRequestId ? (
            <Button type="text" size="small" className={composeToolbarGhostBtn} onClick={() => resetComposeToNew()}>
              새 작성
            </Button>
          ) : null}
          <Button
            type="text"
            size="small"
            icon={<EyeOutlined className="tw-text-[13px] tw-text-[#333]" />}
            className={composeToolbarGhostBtn}
            onClick={() => setComposePreviewOpen(true)}
          >
            미리보기
          </Button>
          <Button
            type="text"
            size="small"
            icon={<CloseOutlined className="tw-text-[12px] tw-text-[#333]" />}
            className={composeToolbarGhostBtn}
            onClick={() => setComposePhase('select')}
          >
            취소
          </Button>
          <Button
            type="text"
            size="small"
            icon={<InfoCircleOutlined className="tw-text-[13px] tw-text-[#333]" />}
            className={composeToolbarGhostBtn}
            onClick={() => openComposeApprovalModal()}
          >
            결재 정보
          </Button>
        </Space>
        <div className="tw-flex tw-flex-wrap tw-items-center tw-gap-x-3 tw-gap-y-2">
          {showTitle && selectedDocument ? (
            <Typography.Text type="secondary" className="!tw-mr-1 !tw-max-w-[10rem] !tw-truncate !tw-text-xs !tw-text-[#666] sm:!tw-max-w-[14rem]">
              {selectedDocument.documentName}
            </Typography.Text>
          ) : null}
          <Select
            size="small"
            value={composeAutosaveMode}
            onChange={(v) => setComposeAutosaveMode(v)}
            variant="borderless"
            popupMatchSelectWidth={false}
            className="!tw-min-w-0 [&_.ant-select-selector]:!tw-px-1 [&_.ant-select-selector]:!tw-text-sm [&_.ant-select-selection-item]:!tw-text-[#111827]"
            options={[
              { value: 'off', label: '자동저장안함' },
              { value: '1m', label: '자동저장(1분)' },
            ]}
          />
          <Button
            type="text"
            size="small"
            icon={<MenuOutlined className="tw-text-[14px] tw-text-[#333]" />}
            className={composeToolbarGhostBtn}
            onClick={() =>
              navigate({ to: '/app/approvals', search: { tab: 'my', box: 'per-all' }, replace: true })
            }
          >
            목록
          </Button>
          {selectedDocument?.autoApproveYn !== 'Y' ? (
            <Button type="text" size="small" className={composeToolbarGhostBtn} onClick={() => reloadPolicyApprovalLine()}>
              자동결재선
            </Button>
          ) : null}
        </div>
      </div>
    );
  };

  const renderComposeDocumentSidebar = (opts: { includeApprovalLine: boolean; variant?: 'card' | 'flush' }) => {
    const variant = opts.variant ?? 'card';
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
                  {opts.includeApprovalLine ? (
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
                  ) : (
                    <div className="tw-space-y-2">
                      <div className="tw-rounded-lg tw-border tw-border-slate-200 tw-bg-white tw-px-3 tw-py-3 tw-text-sm tw-text-slate-600">
                        자동승인 양식입니다. 결재 단계가 없습니다.
                      </div>
                      <Button
                        type="link"
                        size="small"
                        className="!tw-h-auto !tw-p-0 !tw-text-left !tw-text-xs"
                        onClick={() => openComposeApprovalModal('cc')}
                      >
                        참조자 {countViewerDraftMembers(ccViewers)}명
                      </Button>
                    </div>
                  )}
                </div>
              ),
            },
            {
              key: 'doc',
              label: '문서정보',
              children: selectedDocument ? (
                <div className="tw-space-y-3">
                  <Descriptions size="small" column={1} bordered className="!tw-bg-white">
                    <Descriptions.Item label="양식명">{selectedDocument.documentName}</Descriptions.Item>
                    <Descriptions.Item label="유형">
                      {REQUEST_TYPE_LABEL[normalizeApprovalRequestType(selectedDocument.requestType)]}
                    </Descriptions.Item>
                    <Descriptions.Item label="자동승인">{selectedDocument.autoApproveYn === 'Y' ? '예' : '아니오'}</Descriptions.Item>
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
                render: (_, row) => (
                  <Space size={4} align="center">
                    <ApprovalLineDragHandle />
                    <Button
                      type="text"
                      size="small"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={() =>
                        setApprovalLineDrafts((prev) =>
                          syncStepOrder(prev.filter((item) => item.id !== row.id)),
                        )
                      }
                    />
                  </Space>
                ),
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
    const hideApprovalLineTab = selectedDocument?.autoApproveYn === 'Y';

    return (
      <Tabs
        size="small"
        activeKey={lineInfoTab}
        onChange={(k) => setLineInfoTab(k as 'approval' | 'cc' | 'circulation')}
        items={[
          ...(hideApprovalLineTab
            ? []
            : [
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
              ]),
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
        ? '결재 홈'
        : '결재 요청 작성'
      : tab === 'admin' && canAdmin
        ? '관리자 설정'
        : guideBox
          ? APPROVAL_GUIDE_BOX_LABEL[guideBox]
          : '내 결재함';
  const pageDescription =
    tab === 'compose'
      ? isComposeHubEntry
        ? '결재 대기, 진행 문서, 공문 알림을 한눈에 확인하고 바로 작성하세요.'
        : '양식을 선택하고 결재선을 구성한 뒤 기안을 제출합니다.'
      : tab === 'admin' && canAdmin
        ? '결재 관련 관리자 설정을 변경합니다.'
        : guideBox
          ? '내 결재함'
          : '왼쪽 메뉴에서 문서함을 선택하면 목록이 표시됩니다.';

  if (tab === 'admin' && !canAdmin) {
    return <Navigate to="/app/approvals" search={{ tab: 'compose' }} replace />;
  }

  const renderHomeDocListCard = (
    title: string,
    rows: ApprovalRequestDetail[],
    onMore: () => void,
    emptyText: string,
    options?: {
      accent?: 'slate' | 'blue';
      actionLabel?: string;
      onAction?: (row: ApprovalRequestDetail) => void;
      cardClassName?: string;
    },
  ) => {
    const accentClass =
      options?.accent === 'blue' ? 'tw-bg-blue-50/60 tw-border-blue-100' : 'tw-bg-slate-50/80 tw-border-slate-200';
    return (
      <Card
        className={clsx(
          'tw-rounded-2xl tw-border tw-border-slate-200/90 tw-shadow-sm tw-shadow-slate-900/5',
          options?.cardClassName,
        )}
      >
        <div className="tw-mb-3 tw-flex tw-items-center tw-justify-between">
          <Typography.Text strong>{title}</Typography.Text>
          <Button type="link" size="small" onClick={onMore}>
            더보기
          </Button>
        </div>
        {rows.length === 0 ? (
          <Typography.Text type="secondary">{emptyText}</Typography.Text>
        ) : (
          <Space direction="vertical" size={8} className="tw-w-full">
            {rows.slice(0, 3).map((row) => (
              <div
                key={row.requestId}
                className={`tw-flex tw-items-center tw-justify-between tw-gap-2 tw-rounded-lg tw-border tw-px-3 tw-py-2 ${accentClass}`}
              >
                <div className="tw-min-w-0">
                  <Typography.Text strong className="!tw-block tw-truncate">
                    {row.documentName || '—'}
                  </Typography.Text>
                  <Typography.Text type="secondary" className="!tw-block tw-text-xs">
                    {(row.requesterName || '요청자 미상')} · {formatDateTime(row.updatedAt || row.createdAt)}
                  </Typography.Text>
                </div>
                <Button
                  size="small"
                  onClick={() =>
                    options?.onAction ? options.onAction(row) : setSelectedRequestId(row.requestId)
                  }
                >
                  {options?.actionLabel || '보기'}
                </Button>
              </div>
            ))}
          </Space>
        )}
      </Card>
    );
  };

  const renderComposeHomeDashboard = () => {
    const viewerMergedRows = mergeRequestsByRequestId([viewerCcRequests, viewerCirculationRequests]);
    const renderCreateApprovalCard = () => (
      <Card className="tw-rounded-2xl tw-border tw-border-blue-100 tw-bg-gradient-to-br tw-from-blue-50/70 tw-to-white tw-shadow-sm tw-shadow-slate-900/5">
        <div className="tw-mb-3 tw-flex tw-items-start tw-justify-between">
          <div>
            <Typography.Text strong className="!tw-text-slate-900">
              결재 생성
            </Typography.Text>
            <Typography.Paragraph type="secondary" className="!tw-mb-0 !tw-mt-1 !tw-text-xs">
              자주 쓰는 양식으로 빠르게 작성하세요.
            </Typography.Paragraph>
          </div>
          <Button
            type="link"
            size="small"
            className="!tw-px-0"
            onClick={() => navigate({ to: '/app/approvals', search: { tab: 'compose' }, replace: true })}
          >
            작성 화면
          </Button>
        </div>
        <Space direction="vertical" size={10} className="tw-w-full">
          <Button
            block
            type="primary"
            className="!tw-h-10 !tw-rounded-lg !tw-text-left"
            onClick={() => openComposeForRequestType('GENERAL')}
          >
            일반 기안 작성
          </Button>
          <Button
            block
            className="!tw-h-10 !tw-rounded-lg !tw-border-blue-200 !tw-bg-white !tw-text-left"
            onClick={() => openComposeForRequestType('VACATION')}
          >
            휴가 신청 작성
          </Button>
          <Button
            block
            className="!tw-h-10 !tw-rounded-lg !tw-border-blue-200 !tw-bg-white !tw-text-left"
            onClick={() => openComposeForRequestType('SALARY')}
          >
            지출 결의 작성
          </Button>
        </Space>
      </Card>
    );
    return (
      <div className="tw-space-y-4">
        <div className="tw-grid tw-grid-cols-1 tw-gap-4 xl:tw-grid-cols-[minmax(0,1fr)_360px]">
          <Card className="tw-rounded-2xl tw-border tw-border-slate-200/90 tw-shadow-sm tw-shadow-slate-900/5">
            <div className="tw-mb-3 tw-flex tw-items-center tw-justify-between">
              <Typography.Text strong>결재 대기 문서 리스트</Typography.Text>
              <Button
                type="link"
                size="small"
                onClick={() =>
                  navigate({
                    to: '/app/approvals',
                    search: { tab: 'pending', box: 'do-pending' },
                    replace: true,
                  })
                }
              >
                더보기
              </Button>
            </div>
            <div className="tw-grid tw-grid-cols-[120px_minmax(0,1fr)_120px_110px] tw-gap-2 tw-px-1 tw-pb-2 tw-text-xs tw-font-semibold tw-text-slate-500">
              <span>문서상태</span>
              <span>제목 / 요청자</span>
              <span>기안일</span>
              <span>동작</span>
            </div>
            <Space direction="vertical" size={8} className="tw-w-full">
              {pendingRequests.length === 0 ? (
                <div className="tw-rounded-xl tw-border tw-border-dashed tw-border-slate-200 tw-p-4 tw-text-center">
                  <Typography.Text type="secondary">결재 대기 문서가 없습니다.</Typography.Text>
                </div>
              ) : (
                pendingRequests.slice(0, 4).map((row) => (
                  <div
                    key={row.requestId}
                    className="tw-grid tw-grid-cols-[120px_minmax(0,1fr)_120px_110px] tw-items-center tw-gap-2 tw-rounded-xl tw-border tw-border-slate-200 tw-bg-white tw-px-3 tw-py-2"
                  >
                    <Tag color="gold" className="tw-justify-self-start !tw-m-0">
                      결재대기
                    </Tag>
                    <div className="tw-min-w-0">
                      <Typography.Text strong className="!tw-block tw-truncate">
                        {row.documentName || '—'}
                      </Typography.Text>
                      <Typography.Text type="secondary" className="!tw-block tw-text-xs">
                        {row.requesterName || '요청자 미상'}
                      </Typography.Text>
                    </div>
                    <Typography.Text className="tw-text-xs tw-text-slate-500">
                      {formatDateTime(row.createdAt)}
                    </Typography.Text>
                    <Button size="small" onClick={() => setSelectedRequestId(row.requestId)}>
                      보기
                    </Button>
                  </div>
                ))
              )}
            </Space>
          </Card>
          {renderCreateApprovalCard()}
        </div>

        <div className="tw-grid tw-grid-cols-1 tw-gap-4 md:tw-grid-cols-2 xl:tw-grid-cols-3">
          {renderHomeDocListCard(
            '내 기안 문서함',
            myRequestsAllForSummary,
            () => navigate({ to: '/app/approvals', search: { tab: 'my', box: 'per-all' }, replace: true }),
            '기안 문서가 없습니다.',
          )}
          {renderHomeDocListCard(
            '참조/공람 문서',
            viewerMergedRows,
            () => navigate({ to: '/app/approvals', search: { tab: 'my', box: 'per-viewers' }, replace: true }),
            '참조/공람 문서가 없습니다.',
          )}
          {renderHomeDocListCard(
            '부서 문서함',
            homeDepartmentRequests,
            () => navigate({ to: '/app/approvals/department', search: { deptView: 'draft' }, replace: true }),
            myOrganizationIdForDept ? '부서 문서가 없습니다.' : '조직 정보가 없어 부서 문서함을 불러올 수 없습니다.',
            { cardClassName: 'md:tw-min-h-[230px]' },
          )}
          {renderHomeDocListCard(
            '공문 문서함',
            homeOfficialSentRequests,
            () => navigate({ to: '/app/approvals', search: { tab: 'my', box: 'per-official' }, replace: true }),
            '공문 문서가 없습니다.',
          )}
          {renderHomeDocListCard(
            '임시 저장 문서',
            myDraftRequests,
            () => navigate({ to: '/app/approvals', search: { tab: 'my', box: 'per-draft' }, replace: true }),
            '임시 저장 문서가 없습니다.',
            { accent: 'blue', actionLabel: '이어쓰기', onAction: (row) => void openDraftForCompose(row.requestId) },
          )}
        </div>
      </div>
    );
  };

  return (
    <Space direction="vertical" size={16} className="tw-w-full">
      <div>
        <Typography.Title level={4} className="!tw-m-0 !tw-text-slate-900">
          {pageTitle}
        </Typography.Title>
        <Typography.Paragraph type="secondary" className="!tw-mb-0 !tw-mt-1 !tw-text-sm">
          {pageDescription}
        </Typography.Paragraph>
      </div>

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
                form.setFieldValue('content', {});
                const nextDocId =
                  typeof changed.documentId === 'string' && changed.documentId.trim().length > 0
                    ? changed.documentId
                    : undefined;
                const nextDoc = activeDocuments.find((d) => d.documentId === nextDocId);
                setSelectedDocumentId(nextDocId);
                setComposeSidebarTab('line');
                setLineInfoTab(nextDoc?.autoApproveYn === 'Y' ? 'cc' : 'approval');
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
                  myPendingApprovalCount={pendingRequests.length}
                  mySubmittedInProgressCount={mySubmittedInProgressCount}
                  onOpenPendingTab={() =>
                    navigate({ to: '/app/approvals', search: { tab: 'pending' }, replace: true })
                  }
                  onOpenMyTab={() =>
                    navigate({
                      to: '/app/approvals',
                      search: { tab: 'my', box: 'per-all' },
                      replace: true,
                    })
                  }
                  onAfterPick={(documentId, doc) => {
                    if (isComposeHubEntry) {
                      navigate({ to: '/app/approvals', search: { tab: 'compose' }, replace: true });
                    }
                    setSelectedDocumentId(documentId);
                    setComposeSidebarTab('line');
                    setLineInfoTab(doc?.autoApproveYn === 'Y' ? 'cc' : 'approval');
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
                  <div className="tw-min-h-0 tw-flex-1 tw-overflow-auto tw-rounded-none tw-bg-white">
                    <div className="tw-p-2 sm:tw-p-3">
                      <ApprovalFormPaperLayout
                        documentName={selectedDocument.documentName}
                        categoryLabel={
                          REQUEST_TYPE_LABEL[normalizeApprovalRequestType(selectedDocument.requestType)] ??
                          String(selectedDocument.requestType)
                        }
                        requestTypeCode={normalizeApprovalRequestType(selectedDocument.requestType)}
                        autoApproveYn={selectedDocument.autoApproveYn === 'Y' ? 'Y' : 'N'}
                        drafterName={drafterProfile?.name?.trim() || user?.name?.trim() || '—'}
                        drafterOrg={
                          drafterProfile?.organizationName?.trim() || user?.departmentName?.trim() || '—'
                        }
                        drafterJobTitle={
                          drafterProfile?.jobTitleName?.trim() || user?.jobTitle?.trim() || undefined
                        }
                        writtenDate={dayjs().format('YYYY-MM-DD')}
                        stampColumn={
                          selectedDocument.autoApproveYn !== 'Y' ? (
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
                          ) : undefined
                        }
                      >
                        {selectedSchema.fields.map((field) => {
                          const namePath: (string | number)[] = ['content', field.name];
                          const ph = field.placeholder;
                          const requiredRule = { required: true, message: `${field.label} 입력` };
                          const selectRule = { required: true, message: `${field.label} 선택` };
                          if (field.type === 'textarea') {
                            return (
                              <ApprovalFormPaperFieldRow key={field.name} label={field.label} required>
                                <Form.Item name={namePath} rules={[requiredRule]} className="!tw-mb-0">
                                  <Input.TextArea rows={4} className="!tw-max-w-full" placeholder={ph} />
                                </Form.Item>
                              </ApprovalFormPaperFieldRow>
                            );
                          }
                          if (field.type === 'number') {
                            return (
                              <ApprovalFormPaperFieldRow key={field.name} label={field.label} required>
                                <Form.Item name={namePath} rules={[requiredRule]} className="!tw-mb-0">
                                  <Input type="number" className="!tw-max-w-xs" placeholder={ph} />
                                </Form.Item>
                              </ApprovalFormPaperFieldRow>
                            );
                          }
                          if (field.type === 'date') {
                            return (
                              <ApprovalFormPaperFieldRow key={field.name} label={field.label} required>
                                <Form.Item name={namePath} rules={[requiredRule]} className="!tw-mb-0">
                                  <Input type="date" className="!tw-max-w-xs" />
                                </Form.Item>
                              </ApprovalFormPaperFieldRow>
                            );
                          }
                          if (field.type === 'datetime-local') {
                            return (
                              <ApprovalFormPaperFieldRow key={field.name} label={field.label} required>
                                <Form.Item name={namePath} rules={[requiredRule]} className="!tw-mb-0">
                                  <Input type="datetime-local" className="!tw-max-w-xs" />
                                </Form.Item>
                              </ApprovalFormPaperFieldRow>
                            );
                          }
                          if (field.type === 'time') {
                            return (
                              <ApprovalFormPaperFieldRow key={field.name} label={field.label} required>
                                <Form.Item name={namePath} rules={[requiredRule]} className="!tw-mb-0">
                                  <Input type="time" className="!tw-max-w-xs" step={60} />
                                </Form.Item>
                              </ApprovalFormPaperFieldRow>
                            );
                          }
                          if (field.type === 'select') {
                            return (
                              <ApprovalFormPaperFieldRow key={field.name} label={field.label} required>
                                <Form.Item name={namePath} rules={[selectRule]} className="!tw-mb-0">
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
                            <ApprovalFormPaperFieldRow key={field.name} label={field.label} required>
                              <Form.Item name={namePath} rules={[requiredRule]} className="!tw-mb-0">
                                <Input className="!tw-max-w-full" placeholder={ph} />
                              </Form.Item>
                            </ApprovalFormPaperFieldRow>
                          );
                        })}
                      </ApprovalFormPaperLayout>
                    </div>
                  </div>
                  <div className="tw-mt-3 tw-rounded-sm tw-border tw-border-dashed tw-border-slate-400 tw-bg-white tw-py-8 tw-text-center">
                    <PaperClipOutlined className="tw-text-2xl tw-text-slate-400" />
                    <div className="tw-mt-2 tw-text-sm tw-leading-relaxed tw-text-[#333]">
                      이 곳에 파일을 드래그 하세요. 또는{' '}
                      <Button
                        type="link"
                        size="small"
                        className="!tw-h-auto !tw-p-0 !tw-align-baseline !tw-text-sm"
                        onClick={() => message.info('파일 첨부는 추후 연동 예정입니다.')}
                      >
                        파일선택
                      </Button>{' '}
                      (0MB)
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
                <aside
                  className={clsx(
                    composeApprovalInfoAsideClass,
                    'tw-max-h-[50vh] tw-shrink-0 tw-overflow-hidden tw-border-t tw-border-[#e5e7eb] tw-bg-white tw-p-0 lg:tw-max-h-none lg:tw-self-stretch lg:tw-border-l lg:tw-border-t-0',
                  )}
                >
                  {selectedDocument.autoApproveYn === 'Y' ? (
                    <Space direction="vertical" size={12} className="tw-w-full">
                      <Alert
                        type="info"
                        showIcon
                        message="자동승인 양식입니다. 결재자 선택 없이 제출 즉시 승인 처리됩니다."
                      />
                      {renderComposeDocumentSidebar({ includeApprovalLine: false, variant: 'flush' })}
                    </Space>
                  ) : (
                    renderComposeDocumentSidebar({ includeApprovalLine: true, variant: 'flush' })
                  )}
                </aside>
              </div>
            ) : null}

            {composePhaseView === 'fill' &&
            selectedDocument?.autoApproveYn === 'Y' &&
            selectedSchema.fields.length === 0 ? (
              <Space direction="vertical" size={12} className="tw-mb-4 tw-w-full">
                <Alert type="info" showIcon message="자동승인 양식입니다. 결재자 선택 없이 제출 즉시 승인 처리됩니다." />
                <div className="tw-max-w-lg">{renderComposeDocumentSidebar({ includeApprovalLine: false })}</div>
              </Space>
            ) : null}

            {composePhaseView === 'fill' &&
            selectedDocument &&
            selectedDocument.autoApproveYn !== 'Y' &&
            selectedSchema.fields.length === 0 ? (
              <div className="tw-mb-4 tw-max-w-lg">{renderComposeDocumentSidebar({ includeApprovalLine: true })}</div>
            ) : null}

          </Form>
        </Card>
      ) : tab === 'admin' && canAdmin ? (
        <ApprovalsAdminPage />
      ) : (
        <>
          {tab === 'my' ? (
        <Card className="tw-border-slate-200/80 tw-shadow-sm">
          <>
            {guideBox === 'per-official' ? (
              <Alert
                type="info"
                showIcon
                message="공문 문서함: 내가 기안한 OFFICIAL 문서만 표시합니다."
                className="tw-mb-3"
              />
            ) : null}
            {guideBox === 'per-all' ? (
              <div className="tw-mb-3 tw-flex tw-flex-wrap tw-items-center tw-justify-between tw-gap-2">
                <Select<ApprovalRequestStatus | 'ALL'>
                  value={requestStatusFilter}
                  onChange={(v) => {
                    navigate({
                      to: '/app/approvals',
                      search: {
                        tab: 'my',
                        box: 'per-all',
                        ...(v === 'ALL' ? {} : { myStatus: v }),
                      },
                      replace: true,
                    });
                  }}
                  style={{ width: 220 }}
                  options={[
                    { value: 'ALL', label: '전체 상태' },
                    ...APPROVAL_REQUEST_STATUS.map((v) => ({ value: v, label: REQUEST_STATUS_LABEL[v] })),
                  ]}
                />
              </div>
            ) : null}
            <Table<ApprovalRequestDetail>
              rowKey="requestId"
              loading={myTableLoading}
              columns={
                guideBox === 'per-viewers'
                  ? viewerChannelColumns
                  : myColumns
              }
              dataSource={myInboxRows}
              pagination={{ pageSize: 10 }}
            />
          </>
        </Card>
          ) : null}
          {tab === 'pending' ? (
        <Card className="tw-border-slate-200/80 tw-shadow-sm">
          <Table<ApprovalRequestDetail>
            rowKey="requestId"
            loading={pendingTableLoading}
            columns={pendingColumns}
            dataSource={pendingInboxRows}
            pagination={{ pageSize: 10 }}
          />
        </Card>
          ) : null}
          {tab === 'acted' ? (
        <Card className="tw-border-slate-200/80 tw-shadow-sm">
          <Table<ApprovalRequestDetail>
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
              {
                title: '상세',
                key: 'actions',
                width: 100,
                render: (_, row) => (
                  <Button type="link" size="small" onClick={() => setSelectedRequestId(row.requestId)}>
                    보기
                  </Button>
                ),
              },
            ]}
            dataSource={actedRequests}
            pagination={{ pageSize: 10 }}
          />
        </Card>
          ) : null}
        </>
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
        styles={{ body: { maxHeight: 'min(72vh, 640px)', overflowY: 'auto', paddingTop: 8 } }}
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
        onClose={() => setSelectedRequestId(null)}
      />

      <Modal
        title="결재 취소"
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
      >
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
    </Space>
  );
}
