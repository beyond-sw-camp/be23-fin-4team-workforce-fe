import {
  BarChartOutlined,
  CheckCircleOutlined,
  CheckOutlined,
  ClockCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  FileDoneOutlined,
  CloseCircleOutlined,
  FilterOutlined,
  MessageOutlined,
  PlusOutlined,
  TeamOutlined,
  ThunderboltOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Col,
  DatePicker,
  Dropdown,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Popover,
  Progress,
  Radio,
  Row,
  Segmented,
  Select,
  Space,
  Spin,
  Switch,
  Tabs,
  Tag,
  Tree,
  TreeSelect,
  Tooltip,
  Typography,
  Upload,
  message,
} from 'antd';
import type { UploadFile } from 'antd/es/upload/interface';
import type { DataNode } from 'antd/es/tree';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/ko';

dayjs.extend(relativeTime);
dayjs.locale('ko');
import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  CreateGoalPayload,
  CreateKpiTemplatePayload,
  Goal,
  GoalApprovalPolicy,
  RollupPolicy,
  KpiCycle,
  KpiTemplate,
  MeasureType,
  OwnerType,
  UpdateGoalPayload,
  UnitType,
  Visibility,
  GoalHealthStatus,
} from '@/features/goals/model/types';
import { PERFORMANCE_PAGE_KO } from '@/app/locale/app-ko';
import { AppButton } from '@/shared/ui/AppButton';
import { AppWorkspacePageTitle } from '@/shared/ui/AppWorkspacePageTitle';
import { AppModal } from '@/shared/ui/AppModal';
import { AppSearchField } from '@/shared/ui/AppSearchField';
import { AppDoubleActionModal } from '@/shared/ui/AppDoubleActionModal';
import { AppSingleActionModal } from '@/shared/ui/AppSingleActionModal';
import { goalApi } from '@/features/goals/api/goalApi';
import { organizationApi } from '@/features/organization/api/organizationApi';
import { flattenOrganizationsWithMeta } from '@/features/organization/lib/flattenOrganizationTree';
import { defaultGoalListFilters, filterGoals, type GoalCycleKey, type GoalListFilters } from '@/features/goals/lib/filterGoals';
import { sortGoals, type GoalListSortKey } from '@/features/goals/lib/sortGoals';
import { GoalApprovalCenterPanel } from '@/features/goals/ui/GoalApprovalCenterPanel';
import { GoalWorkflowSteps } from '@/features/goals/ui/GoalWorkflowSteps';
import { GoalActionBar } from '@/features/goals/ui/GoalActionBar';
import { computeGoalProgressPercent } from '@/features/goals/ui/goalProgressDisplay';
import { buildGoalDisplayProgressMap } from '@/features/goals/ui/goalProgressRollup';
import { GoalsListCards } from '@/features/goals/ui/GoalsListCards';
import { KpiTemplateCards } from '@/features/goals/ui/KpiTemplateCards';
import { PERM } from '@/features/permissions/backend-permissions';
import { PermissionGuard } from '@/features/permissions/permission-guard';
import { useAuth } from '@/features/auth/useAuth';
import {
  MEMBER_DISPLAY_LABEL_UNKNOWN,
  useMemberDisplayNames,
} from '@/features/members/hooks/useMemberDisplayNames';
import { MemberRemoteSelect } from '@/features/members/ui/MemberRemoteSelect';
import { SingleMemberOrgChartSelectModal } from '@/features/members/ui/SingleMemberOrgChartSelectModal';
import { OrganizationTreeSelectModal } from '@/features/organization/ui/OrganizationTreeSelectModal';
import { usePermissions } from '@/features/permissions/usePermissionsHook';
const { RangePicker } = DatePicker;
const { Text, Paragraph } = Typography;

const MEASURE_OPTIONS: { value: MeasureType; label: string; description: string }[] = [
  { value: 'HIGHER_BETTER', label: '높을수록 유리', description: '달성률·매출 등' },
  { value: 'LOWER_BETTER', label: '낮을수록 유리', description: '불량률·비용 등' },
  { value: 'TARGET_MATCH', label: '목표치 일치', description: '목표값에 가깝게 맞출 때' },
];

const GOAL_HEALTH_OPTIONS: { value: GoalHealthStatus; label: string }[] = [
  { value: 'NOT_STARTED', label: '미착수' },
  { value: 'ON_TRACK', label: '순조로움' },
  { value: 'AT_RISK', label: '주의' },
  { value: 'BEHIND', label: '지연' },
  { value: 'COMPLETED', label: '완료' },
];

function goalHealthLabel(h?: string): string {
  const s = (h ?? '').toUpperCase() as GoalHealthStatus;
  const hit = GOAL_HEALTH_OPTIONS.find((o) => o.value === s);
  return hit?.label ?? (h?.trim() ? h : '—');
}

const UNIT_OPTIONS: { value: UnitType; label: string }[] = [
  { value: 'NUMBER', label: '일반 수치' },
  { value: 'AMOUNT', label: '금액' },
  { value: 'PERCENTAGE', label: '백분율(%)' },
  { value: 'RATIO', label: '비율' },
  { value: 'CUSTOM', label: '사용자 정의' },
];

const CYCLE_OPTIONS: { value: KpiCycle; label: string }[] = [
  { value: 'MONTHLY', label: '월간' },
  { value: 'QUARTERLY', label: '분기' },
  { value: 'ANYTIME', label: '상시' },
];

/** KPI 템플릿 등록 모달 — 추천 템플릿 드롭다운 */
type KpiTemplatePresetDef = {
  key: string;
  label: string;
  description: string;
  name: string;
  measureType: MeasureType;
  unitType: UnitType;
  cycle: KpiCycle;
  capPct: number;
  customUnitLabel?: string;
};

const KPI_TEMPLATE_PRESETS: KpiTemplatePresetDef[] = [
  {
    key: 'revenue-achievement',
    label: '분기 매출 달성률',
    description: '백분율 · 높을수록 유리 · 분기',
    name: '분기 매출 달성률',
    measureType: 'HIGHER_BETTER',
    unitType: 'PERCENTAGE',
    cycle: 'QUARTERLY',
    capPct: 120,
  },
  {
    key: 'cost-reduction',
    label: '비용 절감률',
    description: '백분율 · 낮을수록 유리 · 분기',
    name: '비용 절감률',
    measureType: 'LOWER_BETTER',
    unitType: 'PERCENTAGE',
    cycle: 'QUARTERLY',
    capPct: 120,
  },
  {
    key: 'defect-rate',
    label: '불량률',
    description: '백분율 · 낮을수록 유리 · 월간',
    name: '제품·프로세스 불량률',
    measureType: 'LOWER_BETTER',
    unitType: 'PERCENTAGE',
    cycle: 'MONTHLY',
    capPct: 100,
  },
  {
    key: 'nps-score',
    label: 'NPS·만족 점수',
    description: '일반 수치 · 목표치 일치 · 분기',
    name: '고객 NPS',
    measureType: 'TARGET_MATCH',
    unitType: 'NUMBER',
    cycle: 'QUARTERLY',
    capPct: 110,
  },
  {
    key: 'arr-amount',
    label: 'ARR(금액)',
    description: '금액 · 높을수록 유리 · 분기',
    name: '연간 반복 매출(ARR)',
    measureType: 'HIGHER_BETTER',
    unitType: 'AMOUNT',
    cycle: 'QUARTERLY',
    capPct: 120,
  },
  {
    key: 'okr-progress',
    label: 'OKR 달성률',
    description: '비율 · 높을수록 유리 · 분기',
    name: '핵심 결과(KR) 달성률',
    measureType: 'HIGHER_BETTER',
    unitType: 'RATIO',
    cycle: 'QUARTERLY',
    capPct: 120,
  },
];

const VISIBILITY_OPTIONS: { value: Visibility; label: string }[] = [
  { value: 'PUBLIC', label: '전사 공개' },
  { value: 'TEAM_ONLY', label: '팀 내' },
  { value: 'PRIVATE', label: '비공개(본인)' },
];

/**
 * 단위 유형별 고정 표시명 — `CUSTOM`만 사용자 입력.
 * 백분율(% 기준)과 비율(배수·상대비 등)은 지표 해석이 달라 구분합니다.
 */
function fixedUnitLabelForType(ut: UnitType): string {
  switch (ut) {
    case 'NUMBER':
      return '건';
    case 'AMOUNT':
      return '원';
    case 'PERCENTAGE':
      return '%';
    case 'RATIO':
      return '배';
    case 'CUSTOM':
      return '';
    default:
      return '';
  }
}

const OWNER_OPTIONS: { value: OwnerType; label: string }[] = [
  { value: 'MEMBER', label: '구성원 (개인 목표)' },
  { value: 'ORGANIZATION', label: '조직' },
];

const GOAL_STATUS_FILTER_OPTIONS = [
  { value: 'DRAFT', label: '진행 전(초안)' },
  { value: 'ACTIVE', label: '진행 중' },
  { value: 'COMPLETED', label: '완료' },
  { value: 'CANCELLED', label: '취소' },
];

const GOAL_CYCLE_FILTER_OPTIONS: { value: GoalCycleKey; label: string }[] = [
  { value: 'YEARLY', label: '연간' },
  { value: 'HALF', label: '반기' },
  { value: 'QUARTERLY', label: '분기' },
  { value: 'MONTHLY', label: '월간' },
  { value: 'CUSTOM', label: '기간형' },
];

const GOAL_SORT_OPTIONS: { value: GoalListSortKey; label: string }[] = [
  { value: 'endDate-asc', label: PERFORMANCE_PAGE_KO.goalSortEndDateAsc },
  { value: 'endDate-desc', label: PERFORMANCE_PAGE_KO.goalSortEndDateDesc },
  { value: 'progress-asc', label: PERFORMANCE_PAGE_KO.goalSortProgressAsc },
  { value: 'progress-desc', label: PERFORMANCE_PAGE_KO.goalSortProgressDesc },
];

const ROLLUP_POLICY_OPTIONS: { value: RollupPolicy; label: string }[] = [
  { value: 'CHILDREN_AVG', label: PERFORMANCE_PAGE_KO.goalRollupChildrenAvg },
  { value: 'CHILDREN_WEIGHTED', label: PERFORMANCE_PAGE_KO.goalRollupChildrenWeighted },
];

const ACTIVITY_DETAIL_PREVIEW = 3;
const COMMENT_DETAIL_PREVIEW = 3;

function activityCreatedRelative(iso?: string): string {
  if (!iso?.trim()) return '';
  const d = dayjs(iso);
  if (!d.isValid()) return '';
  return d.fromNow();
}

function activityCreatedAbsolute(iso?: string): string {
  if (!iso?.trim()) return '';
  const d = dayjs(iso);
  if (!d.isValid()) return iso.trim();
  return d.format('YYYY.MM.DD HH:mm');
}

function visibilityTag(v: Visibility) {
  const map: Record<Visibility, { color: string; label: string }> = {
    PUBLIC: { color: 'blue', label: '전사' },
    TEAM_ONLY: { color: 'geekblue', label: '팀' },
    PRIVATE: { color: 'default', label: '비공개' },
  };
  const m = map[v] ?? { color: 'default', label: v };
  return <Tag color={m.color}>{m.label}</Tag>;
}

function statusTag(status?: string) {
  const s = (status ?? 'DRAFT').toUpperCase();
  if (s === 'DRAFT') return <Tag color="gold">진행 전</Tag>;
  if (s === 'ACTIVE') return <Tag color="green">진행 중</Tag>;
  if (s === 'COMPLETED') return <Tag color="blue">완료</Tag>;
  if (s === 'CANCELLED') return <Tag color="default">취소</Tag>;
  if (s === 'ARCHIVED') return <Tag color="default">보관(레거시)</Tag>;
  return <Tag>{status ?? '—'}</Tag>;
}

function goalDetailProgressUi(goal: Goal) {
  const fromManual =
    goal.progress != null && Number.isFinite(Number(goal.progress)) ? Number(goal.progress) : null;
  const raw = fromManual != null ? fromManual : computeGoalProgressPercent(goal);
  const rounded = raw != null ? Math.round(raw) : null;
  const barPct = rounded != null ? Math.min(100, rounded) : 0;
  const label = rounded != null ? `${rounded}%` : '—';
  let stroke = '#e2e8f0';
  if (rounded != null) {
    if (rounded > 100) stroke = '#22c55e';
    else if (rounded > 0) stroke = '#3b82f6';
  }
  return { label, barPct, stroke };
}

function narrativeDefaultGoalFilters(): GoalListFilters {
  return { ...defaultGoalListFilters(), owner: 'mine' };
}

function goalStatusNorm(s?: string) {
  return (s ?? '').toUpperCase();
}

function activityUi(type?: string): { label: string; icon: JSX.Element; tone: string; badgeClass: string; cardClass: string } {
  const t = (type ?? '').toUpperCase();
  if (t === 'GOAL_CREATED') {
    return {
      label: '목표 생성',
      icon: <PlusOutlined className="tw-text-[11px]" />,
      tone: 'tw-text-slate-600',
      badgeClass: 'tw-bg-slate-100 tw-text-slate-700',
      cardClass: 'tw-border-slate-200 tw-bg-white',
    };
  }
  if (t === 'PERFORMANCE_SUBMITTED') {
    return {
      label: '실적 제출',
      icon: <BarChartOutlined className="tw-text-[11px]" />,
      tone: 'tw-text-blue-600',
      badgeClass: 'tw-bg-blue-50 tw-text-blue-700',
      cardClass: 'tw-border-blue-100 tw-bg-blue-50/30',
    };
  }
  if (t === 'PERFORMANCE_REVIEWED') {
    return {
      label: '실적 검토',
      icon: <CheckCircleOutlined className="tw-text-[11px]" />,
      tone: 'tw-text-emerald-600',
      badgeClass: 'tw-bg-emerald-50 tw-text-emerald-700',
      cardClass: 'tw-border-emerald-100 tw-bg-emerald-50/30',
    };
  }
  if (t === 'APPROVAL_REQUESTED') {
    return {
      label: '완료 승인 요청',
      icon: <ClockCircleOutlined className="tw-text-[11px]" />,
      tone: 'tw-text-amber-600',
      badgeClass: 'tw-bg-amber-50 tw-text-amber-700',
      cardClass: 'tw-border-amber-100 tw-bg-amber-50/30',
    };
  }
  if (t === 'APPROVED') {
    return {
      label: '승인됨',
      icon: <CheckCircleOutlined className="tw-text-[11px]" />,
      tone: 'tw-text-emerald-600',
      badgeClass: 'tw-bg-emerald-50 tw-text-emerald-700',
      cardClass: 'tw-border-emerald-100 tw-bg-emerald-50/30',
    };
  }
  if (t === 'REJECTED') {
    return {
      label: '반려됨',
      icon: <CloseCircleOutlined className="tw-text-[11px]" />,
      tone: 'tw-text-rose-600',
      badgeClass: 'tw-bg-rose-50 tw-text-rose-700',
      cardClass: 'tw-border-rose-100 tw-bg-rose-50/30',
    };
  }
  if (t === 'PROGRESS_UPDATED') {
    return {
      label: '진행률 반영',
      icon: <BarChartOutlined className="tw-text-[11px]" />,
      tone: 'tw-text-sky-600',
      badgeClass: 'tw-bg-sky-50 tw-text-sky-700',
      cardClass: 'tw-border-sky-100 tw-bg-sky-50/30',
    };
  }
  if (t === 'GOAL_METADATA_UPDATED') {
    return {
      label: '목표 정보 수정',
      icon: <FilterOutlined className="tw-text-[11px]" />,
      tone: 'tw-text-violet-600',
      badgeClass: 'tw-bg-violet-50 tw-text-violet-700',
      cardClass: 'tw-border-violet-100 tw-bg-violet-50/30',
    };
  }
  if (t === 'COMMENT_ADDED') {
    return {
      label: '댓글',
      icon: <MessageOutlined className="tw-text-[11px]" />,
      tone: 'tw-text-slate-600',
      badgeClass: 'tw-bg-slate-100 tw-text-slate-700',
      cardClass: 'tw-border-slate-200 tw-bg-white',
    };
  }
  return {
    label: '댓글/활동',
    icon: <MessageOutlined className="tw-text-[11px]" />,
    tone: 'tw-text-slate-600',
    badgeClass: 'tw-bg-slate-100 tw-text-slate-700',
    cardClass: 'tw-border-slate-200 tw-bg-white',
  };
}

function normalizeUploadFileList(v: unknown): UploadFile[] {
  if (Array.isArray(v)) return v as UploadFile[];
  if (v && typeof v === 'object' && 'fileList' in (v as Record<string, unknown>)) {
    const list = (v as { fileList?: unknown }).fileList;
    return Array.isArray(list) ? (list as UploadFile[]) : [];
  }
  return [];
}

function serializeCompletionEvidence(fileList: UploadFile[] | undefined): string | undefined {
  const rows = (fileList ?? [])
    .map((f) => ({
      name: String(f.name ?? '').trim(),
      url: typeof f.url === 'string' && f.url.trim() !== '' ? f.url.trim() : undefined,
      size: typeof f.size === 'number' ? f.size : undefined,
      type: typeof f.type === 'string' ? f.type : undefined,
      lastModified:
        f.originFileObj && typeof f.originFileObj.lastModified === 'number' ? f.originFileObj.lastModified : undefined,
    }))
    .filter((f) => f.name.length > 0);
  if (rows.length === 0) return undefined;
  return JSON.stringify(rows);
}

function deserializeCompletionEvidence(v: string | null | undefined): UploadFile[] {
  if (!v || v.trim() === '') return [];
  try {
    const parsed = JSON.parse(v) as Array<{ name?: string; url?: string }>;
    if (!Array.isArray(parsed)) return [];
    const out: UploadFile[] = [];
    for (let idx = 0; idx < parsed.length; idx += 1) {
      const name = String(parsed[idx]?.name ?? '').trim();
      if (!name) continue;
      const url = typeof parsed[idx]?.url === 'string' && parsed[idx]!.url!.trim() !== '' ? parsed[idx]!.url!.trim() : undefined;
      out.push({ uid: `saved-${idx}-${name}`, name, status: 'done', url });
    }
    return out;
  } catch {
    // Legacy plain-text format fallback
    return v
      .split(',')
      .map((s, idx) => ({ uid: `legacy-${idx}-${s.trim()}`, name: s.trim(), status: 'done' as UploadFile['status'] }))
      .filter((f) => f.name.length > 0);
  }
}

function completionEvidencePreview(v: string | null | undefined): string {
  const files = deserializeCompletionEvidence(v);
  if (files.length === 0) return '';
  return files.map((f) => f.name).join(', ');
}

function parseCommentReactions(v: string | null | undefined): Array<{ emoji: string; memberIds: string[] }> {
  if (!v || v.trim() === '') return [];
  try {
    const parsed = JSON.parse(v) as Array<{ emoji?: string; memberIds?: string[] }>;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((r) => ({
        emoji: String(r?.emoji ?? '').trim(),
        memberIds: Array.isArray(r?.memberIds) ? r!.memberIds.map((x) => String(x).trim()).filter((x) => x.length > 0) : [],
      }))
      .filter((r) => r.emoji.length > 0);
  } catch {
    return [];
  }
}

/**
 * 목표에 연결된 KpiTemplate의 승인 정책을 조회한다.
 * goalApprovalPolicy가 있으면 그대로, 없으면 requireApproval fallback.
 */
function resolveGoalApprovalPolicy(
  goal: Goal,
  templates: KpiTemplate[],
): GoalApprovalPolicy {
  if (!goal.kpiTemplateId) return 'NONE';
  const tpl = templates.find((t) => t.id === goal.kpiTemplateId);
  if (!tpl) return 'NONE';
  if (tpl.goalApprovalPolicy) return tpl.goalApprovalPolicy;
  // legacy fallback
  return tpl.requireApproval ? 'BOTH' : 'NONE';
}

function policyRequiresActivation(p: GoalApprovalPolicy): boolean {
  return p === 'ACTIVATION_ONLY' || p === 'BOTH';
}

function policyRequiresCompletion(p: GoalApprovalPolicy): boolean {
  return p === 'COMPLETION_ONLY' || p === 'BOTH';
}

function PerformancePage() {
  const { user } = useAuth();
  const { hasPermission } = usePermissions();
  const queryClient = useQueryClient();
  const companyId = user?.companyId?.trim();
  const memberId = user?.id ?? '';
  const creatorOrganizationId = String((user as { organizationId?: string } | null)?.organizationId ?? '').trim();
  const creatorDepartmentName = String((user as { departmentName?: string } | null)?.departmentName ?? '').trim();

  const canCreate = hasPermission(PERM.GOAL_CREATE);
  const canUpdate = hasPermission(PERM.GOAL_UPDATE);

  const [tab, setTab] = useState<'goals' | 'templates'>('goals');
  const [goalScopeTab, setGoalScopeTab] = useState<'mine' | 'all' | 'members'>('all');
  const [templateSearch, setTemplateSearch] = useState('');
  const [goalListSort, setGoalListSort] = useState<GoalListSortKey>('endDate-asc');
  const [goalFilters, setGoalFilters] = useState<GoalListFilters>(() => narrativeDefaultGoalFilters());
  const [ownerPanelSearch, setOwnerPanelSearch] = useState('');
  const [ownerQuickPick, setOwnerQuickPick] = useState<string>('ALL');
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [goalModalOpen, setGoalModalOpen] = useState(false);
  const [goalOrgPickerOpen, setGoalOrgPickerOpen] = useState(false);
  const [goalMemberPickerField, setGoalMemberPickerField] = useState<'memberOwnerId' | 'responsibleMemberId' | null>(null);
  const [goalEditModalOpen, setGoalEditModalOpen] = useState(false);
  const [completionSubmitModalOpen, setCompletionSubmitModalOpen] = useState(false);
  const [activationApprovalModalOpen, setActivationApprovalModalOpen] = useState(false);
  const [completionDraftMap, setCompletionDraftMap] = useState<Record<string, { summary?: string; evidenceFiles?: string; savedAt: string }>>({});
  const [detailGoal, setDetailGoal] = useState<Goal | null>(null);
  const [activitiesExpanded, setActivitiesExpanded] = useState(false);
  const [commentsExpanded, setCommentsExpanded] = useState(false);

  const [tplForm] = Form.useForm<CreateKpiTemplatePayload>();
  const [goalForm] = Form.useForm<
    Omit<CreateGoalPayload, 'startDate' | 'endDate' | 'ownerId'> & {
      range: [dayjs.Dayjs, dayjs.Dayjs];
      /** MEMBER 일 때 — API `ownerId`로 전송 */
      memberOwnerId?: string;
      /** ORGANIZATION 일 때만 — API `ownerId`로 전송 */
      organizationOwnerId?: string;
    }
  >();
  const tplUnitType = Form.useWatch('unitType', tplForm);
  const tplApprovalPolicy = Form.useWatch('goalApprovalPolicy', tplForm) as GoalApprovalPolicy | undefined;
  const goalOwnerType = Form.useWatch('ownerType', goalForm);
  const goalSelectedTplId = Form.useWatch('kpiTemplateId', goalForm);
  const goalOrganizationOwnerId = Form.useWatch('organizationOwnerId', goalForm) as string | undefined;
  const goalMemberOwnerId = Form.useWatch('memberOwnerId', goalForm) as string | undefined;
  const goalResponsibleMemberId = Form.useWatch('responsibleMemberId', goalForm) as string | undefined;
  const [activationApprovalForm] = Form.useForm<{ approverId: string }>();

  useEffect(() => {
    if (!templateModalOpen || tplUnitType == null) return;
    if (tplUnitType === 'CUSTOM') {
      tplForm.setFieldValue('unitLabel', '');
    } else {
      tplForm.setFieldValue('unitLabel', fixedUnitLabelForType(tplUnitType));
    }
  }, [templateModalOpen, tplUnitType, tplForm]);
  const [progressUpdateForm] = Form.useForm<{ value: number; status: GoalHealthStatus; note?: string }>();
  const [goalEditForm] = Form.useForm<{
    title: string;
    description: string;
    visibility: Visibility;
    parentGoalId?: string;
    rollupPolicy?: RollupPolicy;
    cycle?: KpiCycle;
  }>();
  const [completionSubmitForm] = Form.useForm<{
    approverId?: string;
    summary: string;
    evidenceFileList?: UploadFile[];
    checked1: boolean;
    checked2: boolean;
    checked3: boolean;
  }>();
  const [goalCommentDraft, setGoalCommentDraft] = useState('');
  const [goalProgressUpdateModalOpen, setGoalProgressUpdateModalOpen] = useState(false);
  const [approvalHubOpen, setApprovalHubOpen] = useState(false);

  const goalsQuery = useQuery({
    queryKey: ['goals', 'list', companyId],
    queryFn: () => goalApi.listGoals(),
    enabled: Boolean(companyId),
  });

  const templatesQuery = useQuery({
    queryKey: ['goals', 'kpi-templates', companyId],
    queryFn: () => goalApi.listKpiTemplates(),
    enabled: Boolean(companyId),
  });

  const pendingApprovalsQuery = useQuery({
    queryKey: ['goal-approvals', 'pending', companyId],
    queryFn: () => goalApi.listApprovalRequests(),
    enabled: Boolean(companyId),
  });
  const approvalHistoryQuery = useQuery({
    queryKey: ['goal-approvals', 'history', companyId],
    queryFn: () => goalApi.listApprovalRequestsHistory(),
    enabled: Boolean(companyId),
  });
  const organizationsQuery = useQuery({
    queryKey: ['organizations', 'list', companyId],
    queryFn: () => organizationApi.list(),
    enabled: Boolean(companyId),
  });

  const detailActivitiesQuery = useQuery({
    queryKey: ['goals', detailGoal?.id ?? '__closed__', 'activities'],
    queryFn: () => goalApi.listActivities(detailGoal!.id),
    enabled: Boolean(detailGoal?.id),
    retry: false,
  });
  const detailApprovalQuery = useQuery({
    queryKey: ['goals', detailGoal?.id ?? '__closed__', 'approval'],
    queryFn: () => goalApi.getApproval(detailGoal!.id),
    enabled: Boolean(detailGoal?.id),
    retry: false,
  });
  const detailCommentsQuery = useQuery({
    queryKey: ['goals', detailGoal?.id ?? '__closed__', 'comments'],
    queryFn: () => goalApi.listComments(detailGoal!.id),
    enabled: Boolean(detailGoal?.id),
    retry: false,
  });
  const detailProgressUpdatesQuery = useQuery({
    queryKey: ['goals', detailGoal?.id ?? '__closed__', 'updates'],
    queryFn: () => goalApi.listProgressUpdates(detailGoal!.id),
    enabled: Boolean(detailGoal?.id),
    retry: false,
  });

  const sortedDetailActivities = useMemo(() => {
    const raw = detailActivitiesQuery.data;
    const list = Array.isArray(raw) ? raw : [];
    return [...list].sort((a, b) => {
      const ta = dayjs(a.createdAt).valueOf();
      const tb = dayjs(b.createdAt).valueOf();
      const fa = Number.isFinite(ta);
      const fb = Number.isFinite(tb);
      if (!fa && !fb) return 0;
      if (!fa) return 1;
      if (!fb) return -1;
      return tb - ta;
    });
  }, [detailActivitiesQuery.data]);

  useEffect(() => {
    setActivitiesExpanded(false);
    setCommentsExpanded(false);
  }, [detailGoal?.id]);

  useEffect(() => {
    setGoalCommentDraft('');
  }, [detailGoal?.id]);

  useEffect(() => {
    if (!goalProgressUpdateModalOpen || !detailGoal?.id) return;
    const g = detailGoal;
    const pct = computeGoalProgressPercent(g);
    progressUpdateForm.setFieldsValue({
      value:
        g.progress != null && Number.isFinite(Number(g.progress))
          ? Math.round(Number(g.progress))
          : pct != null
            ? Math.round(pct)
            : 0,
      status: (String(g.healthStatus ?? 'ON_TRACK').toUpperCase() as GoalHealthStatus) || 'ON_TRACK',
      note: '',
    });
  }, [goalProgressUpdateModalOpen, detailGoal, progressUpdateForm]);

  useEffect(() => {
    if (detailGoal == null) {
      setGoalProgressUpdateModalOpen(false);
      setGoalEditModalOpen(false);
      setCompletionSubmitModalOpen(false);
    }
  }, [detailGoal]);

  /** 목표 목록 refetch 후 상세 모달이 열려 있으면 집계 필드만 최신 행과 동기화 */
  useEffect(() => {
    const list = goalsQuery.data;
    if (!list) return;
    setDetailGoal((prev) => {
      if (!prev) return prev;
      const next = list.find((g) => g.id === prev.id);
      if (!next) return prev;
      const ownerId =
        next.ownerId != null && String(next.ownerId).trim() !== ''
          ? String(next.ownerId).trim()
          : prev.ownerId;
      return { ...prev, ...next, ownerId };
    });
  }, [goalsQuery.data]);

  const invalidateGoals = () => {
    void queryClient.invalidateQueries({ queryKey: ['goals', 'list'] });
    void queryClient.invalidateQueries({ queryKey: ['goal-approvals'] });
  };
  const invalidateTemplates = () => {
    void queryClient.invalidateQueries({ queryKey: ['goals', 'kpi-templates'] });
  };

  const createTplMutation = useMutation({
    mutationFn: (v: CreateKpiTemplatePayload) => goalApi.createKpiTemplate(v),
    onSuccess: () => {
      message.success('KPI 템플릿이 등록되었습니다.');
      setTemplateModalOpen(false);
      tplForm.resetFields();
      invalidateTemplates();
    },
    onError: (e: Error) => message.error(e.message),
  });

  const deactivateTplMutation = useMutation({
    mutationFn: (kpiTemplateId: string) => goalApi.deactivateKpiTemplate(kpiTemplateId),
    onSuccess: () => {
      message.success('KPI 템플릿을 비활성화했습니다.');
      invalidateTemplates();
    },
    onError: (e: Error) => message.error(e.message),
  });

  const createGoalMutation = useMutation({
    mutationFn: (v: CreateGoalPayload) => goalApi.createGoal(v),
    onSuccess: () => {
      message.success('목표가 생성되었습니다.');
      setGoalModalOpen(false);
      goalForm.resetFields();
      invalidateGoals();
    },
    onError: (e: Error) => message.error(e.message),
  });

  const activateMutation = useMutation({
    mutationFn: (goalId: string) => goalApi.activateGoal(goalId),
    onSuccess: (updatedGoal, goalId) => {
      message.success('진행이 시작되었습니다. 이제 업데이트로 진행 상황을 반영할 수 있어요.');
      invalidateGoals();
      void queryClient.invalidateQueries({ queryKey: ['goals', goalId, 'approval'] });
      setDetailGoal((prev) => prev && updatedGoal ? { ...prev, ...updatedGoal } : prev);
    },
    onError: (e: Error) => message.error(e.message),
  });

  /** 활성화 승인 요청 — approval bundle 생성 */
  const activationApprovalMutation = useMutation({
    mutationFn: (vars: { goalId: string; approverId: string }) =>
      goalApi.requestApproval(vars.goalId, { approverId: vars.approverId }),
    onSuccess: (_data, vars) => {
      message.success('활성화 승인 요청이 전송되었습니다. 승인 후 목표가 활성화됩니다.');
      setActivationApprovalModalOpen(false);
      activationApprovalForm.resetFields();
      invalidateGoals();
      void queryClient.invalidateQueries({ queryKey: ['goals', vars.goalId, 'approval'] });
    },
    onError: (e: Error) => message.error(e.message || '활성화 승인 요청에 실패했습니다.'),
  });

  /** 승인 불필요 시 직접 완료 처리 */
  const directCompleteMutation = useMutation({
    mutationFn: (goalId: string) => goalApi.completeGoal(goalId),
    onSuccess: (updatedGoal, goalId) => {
      message.success('목표가 완료 처리되었습니다.');
      invalidateGoals();
      void queryClient.invalidateQueries({ queryKey: ['goals', goalId, 'approval'] });
      setDetailGoal((prev) => prev && updatedGoal ? { ...prev, ...updatedGoal } : prev);
    },
    onError: (e: Error) => message.error(e.message || '목표 완료 처리에 실패했습니다.'),
  });

  const cancelMutation = useMutation({
    mutationFn: (goalId: string) => goalApi.cancelGoal(goalId),
    onSuccess: (updatedGoal) => {
      message.success('목표가 취소되었습니다.');
      invalidateGoals();
      // 상세 모달이 열려 있으면 즉시 반영
      setDetailGoal((prev) => prev && updatedGoal ? { ...prev, ...updatedGoal } : prev);
    },
    onError: (e: Error) => message.error(e.message || '목표 취소 처리에 실패했습니다.'),
  });

  const completionSubmitMutation = useMutation({
    mutationFn: (vars: {
      goalId: string;
      body: {
        approverId?: string;
        summary?: string;
        evidenceFiles?: string;
      };
    }) => goalApi.submitCompletion(vars.goalId, vars.body),
    onSuccess: (updated, variables) => {
      message.success('완료 제출이 등록되었습니다.');
      setCompletionDraftMap((prev) => {
        const next = { ...prev };
        delete next[variables.goalId];
        return next;
      });
      setCompletionSubmitModalOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['goals', variables.goalId, 'activities'] });
      void queryClient.invalidateQueries({ queryKey: ['goals', variables.goalId, 'comments'] });
      invalidateGoals();
      setDetailGoal((prev) => (prev && prev.id === updated.id ? { ...prev, ...updated } : prev));
    },
    onError: (e: Error) => message.error(e.message || '완료 제출에 실패했습니다.'),
  });

  const refreshDetailGoal = useCallback(
    async (goalId: string) => {
      try {
        const g = await goalApi.getGoal(goalId);
        setDetailGoal(g);
        const pct = computeGoalProgressPercent(g);
        progressUpdateForm.setFieldsValue({
          value:
            g.progress != null && Number.isFinite(Number(g.progress))
              ? Math.round(Number(g.progress))
              : pct != null
                ? Math.round(pct)
                : 0,
          status: (String(g.healthStatus ?? 'ON_TRACK').toUpperCase() as GoalHealthStatus) || 'ON_TRACK',
          note: '',
        });
      } catch (e: unknown) {
        message.error(e instanceof Error ? e.message : '목표 정보를 다시 불러오지 못했습니다.');
      }
    },
    [progressUpdateForm],
  );

  const patchGoalMutation = useMutation({
    mutationFn: (vars: { goalId: string; body: Parameters<typeof goalApi.updateGoal>[1] }) =>
      goalApi.updateGoal(vars.goalId, vars.body),
    onSuccess: (g) => {
      setDetailGoal((prev) => (prev && prev.id === g.id ? { ...prev, ...g } : prev));
      invalidateGoals();
      void queryClient.invalidateQueries({ queryKey: ['goals', g.id, 'activities'] });
      message.success('저장되었습니다.');
    },
    onError: (e: Error) => message.error(e.message || '저장에 실패했습니다.'),
  });

  const createGoalCommentMutation = useMutation({
    mutationFn: (vars: { goalId: string; body: string }) =>
      goalApi.createComment(vars.goalId, { body: vars.body }),
    onSuccess: (_c, variables) => {
      setGoalCommentDraft('');
      void queryClient.invalidateQueries({ queryKey: ['goals', variables.goalId, 'comments'] });
      void queryClient.invalidateQueries({ queryKey: ['goals', variables.goalId, 'activities'] });
      message.success('댓글이 등록되었습니다.');
    },
    onError: (e: Error) => message.error(e.message || '댓글 등록에 실패했습니다.'),
  });
  const toggleCommentReactionMutation = useMutation({
    mutationFn: (vars: { goalId: string; commentId: string; emoji: string }) =>
      goalApi.toggleCommentReaction(vars.goalId, vars.commentId, vars.emoji, memberId),
    onSuccess: (_c, vars) => {
      void queryClient.invalidateQueries({ queryKey: ['goals', vars.goalId, 'comments'] });
      void queryClient.invalidateQueries({ queryKey: ['goals', vars.goalId, 'activities'] });
    },
    onError: (e: Error) => message.error(e.message || '리액션 처리에 실패했습니다.'),
  });

  const addProgressUpdateMutation = useMutation({
    mutationFn: (vars: { goalId: string; value: number; status: GoalHealthStatus; note?: string }) =>
      goalApi.addProgressUpdate(vars.goalId, { value: vars.value, status: vars.status, note: vars.note }),
    onSuccess: async (_u, variables) => {
      setGoalProgressUpdateModalOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['goals', variables.goalId, 'updates'] });
      void queryClient.invalidateQueries({ queryKey: ['goals', variables.goalId, 'activities'] });
      invalidateGoals();
      await refreshDetailGoal(variables.goalId);
      message.success('진행률이 반영되었습니다.');
    },
    onError: (e: Error) => message.error(e.message || '진행률 반영에 실패했습니다.'),
  });

  const templates = templatesQuery.data ?? [];
  const activeTemplatesForGoals = useMemo(
    () => templates.filter((t) => t.isActive !== false),
    [templates],
  );
  const filteredTemplates = useMemo(() => {
    const q = templateSearch.trim().toLowerCase();
    if (!q) return templates;
    return templates.filter((t) => (t.name ?? '').toLowerCase().includes(q));
  }, [templates, templateSearch]);
  const goalsList = goalsQuery.data ?? [];
  const organizationRowsFlat = useMemo(
    () => flattenOrganizationsWithMeta(organizationsQuery.data ?? []),
    [organizationsQuery.data],
  );

  const goalOrganizationTreeData = useMemo(
    () =>
      organizationRowsFlat.map((r) => ({
        id: r.id,
        pId: r.parentId ?? undefined,
        value: r.id,
        title: r.name,
      })),
    [organizationRowsFlat],
  );

  /** 목표 생성 폼에서 선택된 템플릿의 승인 정책 */
  const goalFormPolicy: GoalApprovalPolicy = useMemo(() => {
    if (!goalSelectedTplId) return 'NONE';
    const tpl = templates.find((t) => String(t.id) === String(goalSelectedTplId));
    if (!tpl) return 'NONE';
    if (tpl.goalApprovalPolicy) return tpl.goalApprovalPolicy;
    return tpl.requireApproval ? 'BOTH' : 'NONE';
  }, [goalSelectedTplId, templates]);
  const goalFormNeedsActivationApprover = policyRequiresActivation(goalFormPolicy);
  const goalFormNeedsCompletionApprover = policyRequiresCompletion(goalFormPolicy);

  const orgLabelById = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of organizationRowsFlat) {
      m.set(r.id, r.name);
    }
    return m;
  }, [organizationRowsFlat]);
  const defaultOrganizationOwnerId = useMemo(() => {
    if (creatorOrganizationId && orgLabelById.has(creatorOrganizationId)) {
      return creatorOrganizationId;
    }
    if (!creatorDepartmentName) return undefined;
    const hit = organizationRowsFlat.find((r) => r.name.trim() === creatorDepartmentName);
    if (hit?.id) return hit.id;
    return organizationRowsFlat[0]?.id;
  }, [creatorDepartmentName, creatorOrganizationId, orgLabelById, organizationRowsFlat]);

  const memberIdsForDisplay = useMemo(() => {
    const s = new Set<string>();
    for (const g of goalsList) {
      const oid = g.ownerId?.trim();
      if (!oid) continue;
      if (g.ownerType === 'ORGANIZATION') continue;
      s.add(oid);
    }
    if (detailGoal?.ownerId?.trim() && detailGoal.ownerType !== 'ORGANIZATION') {
      s.add(detailGoal.ownerId.trim());
    }
    const approverId = detailApprovalQuery.data?.approverId?.trim();
    if (approverId) s.add(approverId);
    const activityRows = Array.isArray(detailActivitiesQuery.data) ? detailActivitiesQuery.data : [];
    for (const a of activityRows) {
      const aid = a.actorId?.trim();
      if (aid && aid.toLowerCase() !== 'system') s.add(aid);
    }
    for (const c of detailCommentsQuery.data ?? []) {
      if (c.authorId?.trim()) s.add(c.authorId.trim());
      const reactions = parseCommentReactions(c.reactionsJson);
      for (const row of reactions) {
        for (const rid of row.memberIds) {
          const t = rid.trim();
          if (t) s.add(t);
        }
      }
    }
    for (const u of detailProgressUpdatesQuery.data ?? []) {
      if (u.createdBy?.trim()) s.add(u.createdBy.trim());
    }
    const selectedMemberOwnerId = goalMemberOwnerId?.trim();
    if (selectedMemberOwnerId) s.add(selectedMemberOwnerId);
    const selectedResponsibleId = goalResponsibleMemberId?.trim();
    if (selectedResponsibleId) s.add(selectedResponsibleId);
    return [...s];
  }, [
    goalsList,
    detailGoal,
    detailApprovalQuery.data,
    detailActivitiesQuery.data,
    detailCommentsQuery.data,
    detailProgressUpdatesQuery.data,
    goalMemberOwnerId,
    goalResponsibleMemberId,
  ]);

  const { labelFor: lookupMemberLabel } = useMemberDisplayNames(memberIdsForDisplay);

  const memberLabelForUi = useCallback(
    (id: string | null | undefined) => {
      const t = id?.trim() ?? '';
      if (!t) return '—';
      if (t === memberId) return '나';
      const hit = lookupMemberLabel(t);
      if (hit === MEMBER_DISPLAY_LABEL_UNKNOWN) return PERFORMANCE_PAGE_KO.memberProfileUnknown;
      return hit;
    },
    [lookupMemberLabel, memberId],
  );

  const formatGoalOwner = useCallback(
    (g: Goal) => {
      if (g.ownerType === 'ORGANIZATION') {
        const oid = g.ownerId?.trim() ?? '';
        if (!oid) return '—';
        return orgLabelById.get(oid) ?? memberLabelForUi(oid);
      }
      return memberLabelForUi(g.ownerId);
    },
    [orgLabelById, memberLabelForUi],
  );

  const effectiveOwner = goalScopeTab === 'mine' ? 'mine' : 'all';
  const scopedGoalsByTab = useMemo(() => {
    if (goalScopeTab === 'mine') {
      return goalsList.filter((g) => g.ownerType === 'MEMBER' && g.ownerId === memberId);
    }
    if (goalScopeTab === 'members') {
      return goalsList.filter((g) => g.ownerType === 'MEMBER');
    }
    return goalsList;
  }, [goalScopeTab, goalsList, memberId]);

  /** 빠른 선택·트리 — ownerId만 있을 때 담당 유형 판별용 */
  const ownerPickLabel = useCallback(
    (ownerKey: string) => {
      const sample = scopedGoalsByTab.find((g) => String(g.ownerId ?? '').trim() === ownerKey);
      return sample ? formatGoalOwner(sample) : ownerKey;
    },
    [scopedGoalsByTab, formatGoalOwner],
  );

  const ownerQuickPickOptions = useMemo(() => {
    const ids = [...new Set(scopedGoalsByTab.map((g) => String(g.ownerId ?? '').trim()).filter(Boolean))];
    const q = ownerPanelSearch.trim().toLowerCase();
    if (!q) return ids;
    return ids.filter((id) => {
      if (id.toLowerCase().includes(q)) return true;
      const sample = scopedGoalsByTab.find((g) => String(g.ownerId ?? '').trim() === id);
      const label = sample ? formatGoalOwner(sample) : id;
      return label.toLowerCase().includes(q);
    });
  }, [scopedGoalsByTab, ownerPanelSearch, formatGoalOwner]);

  /** 트리 「구성원」 가지 — 조직 ownerId와 키가 겹치지 않도록 MEMBER 목표만 포함 */
  const ownerQuickPickMemberIds = useMemo(() => {
    const ids = [
      ...new Set(
        scopedGoalsByTab
          .filter((g) => g.ownerType === 'MEMBER')
          .map((g) => String(g.ownerId ?? '').trim())
          .filter(Boolean),
      ),
    ];
    const q = ownerPanelSearch.trim().toLowerCase();
    if (!q) return ids;
    return ids.filter((id) => {
      if (id.toLowerCase().includes(q)) return true;
      const sample = scopedGoalsByTab.find(
        (g) => g.ownerType === 'MEMBER' && String(g.ownerId ?? '').trim() === id,
      );
      const label = sample ? formatGoalOwner(sample) : id;
      return label.toLowerCase().includes(q);
    });
  }, [scopedGoalsByTab, ownerPanelSearch, formatGoalOwner]);

  const ownerTreeData = useMemo<DataNode[]>(() => {
    const memberIds = ownerQuickPickMemberIds;
    const orgNameById = new Map<string, string>();
    const orgParentById = new Map<string, string | null>();
    for (const r of organizationRowsFlat) {
      orgNameById.set(r.id, r.name);
      orgParentById.set(r.id, r.parentId);
    }
    const orgOwnerIds = [...new Set(scopedGoalsByTab.filter((g) => g.ownerType === 'ORGANIZATION').map((g) => g.ownerId))];
    const visibleOrgIds = orgOwnerIds.filter((id) => orgNameById.has(id));
    const childMap = new Map<string, string[]>();
    const roots: string[] = [];
    for (const id of visibleOrgIds) {
      const p = orgParentById.get(id);
      if (p && visibleOrgIds.includes(p)) {
        childMap.set(p, [...(childMap.get(p) ?? []), id]);
      } else roots.push(id);
    }
    const rootOrgIds = new Set(roots);
    const mkNode = (id: string): DataNode => {
      const count = scopedGoalsByTab.filter((g) => String(g.ownerId ?? '').trim() === id).length;
      const isRoot = rootOrgIds.has(id) && !orgParentById.get(id);
      return {
        key: `o:${id}`,
        title: (
          <span>
            {orgNameById.get(id) ?? id}
            {isRoot ? <span className="tw-ml-1.5 tw-rounded tw-bg-blue-100 tw-px-1 tw-py-0.5 tw-text-[10px] tw-font-semibold tw-text-blue-700">주조직</span> : null}
            <span className="tw-ml-1 tw-text-slate-400 tw-text-xs">({count})</span>
          </span>
        ),
        children: (childMap.get(id) ?? []).map(mkNode),
      };
    };
    return [
      {
        key: 'all',
        title: `${PERFORMANCE_PAGE_KO.quickPickAll} (${scopedGoalsByTab.length})`,
        children: [
          {
            key: 'members',
            title: `${PERFORMANCE_PAGE_KO.scopeMembers} (${memberIds.length})`,
            children: memberIds.map((id) => ({
              key: `m:${id}`,
              title: `${ownerPickLabel(id)} (${scopedGoalsByTab.filter((g) => String(g.ownerId ?? '').trim() === id).length})`,
              isLeaf: true,
            })),
          },
          {
            key: 'org',
            title: `조직 목표 (${orgOwnerIds.length})`,
            children:
              roots.length > 0
                ? roots.map(mkNode)
                : orgOwnerIds.map((id) => ({
                    key: `o:${id}`,
                    title: `${orgNameById.get(id) ?? id} (${scopedGoalsByTab.filter((g) => String(g.ownerId ?? '').trim() === id).length})`,
                    isLeaf: true,
                  })),
          },
        ],
      },
    ];
  }, [ownerQuickPickMemberIds, scopedGoalsByTab, memberId, organizationRowsFlat, ownerPickLabel]);

  const ownerTreeSelectedKeys = useMemo(() => {
    if (ownerQuickPick === 'ALL') return ['all'];
    const isOrgOwner = scopedGoalsByTab.some(
      (g) => g.ownerType === 'ORGANIZATION' && String(g.ownerId ?? '').trim() === ownerQuickPick,
    );
    return [isOrgOwner ? `o:${ownerQuickPick}` : `m:${ownerQuickPick}`];
  }, [ownerQuickPick, scopedGoalsByTab]);

  const goalsAfterOwnerQuickPick = useMemo(() => {
    if (ownerQuickPick === 'ALL') return scopedGoalsByTab;
    return scopedGoalsByTab.filter((g) => String(g.ownerId ?? '').trim() === ownerQuickPick);
  }, [scopedGoalsByTab, ownerQuickPick]);

  useEffect(() => {
    setOwnerQuickPick('ALL');
  }, [goalScopeTab]);

  const deactivatingTemplateId =
    deactivateTplMutation.isPending && typeof deactivateTplMutation.variables === 'string'
      ? deactivateTplMutation.variables
      : null;

  const stats = useMemo(() => {
    const scoped = goalsAfterOwnerQuickPick;
    const st = (s?: string) => (s ?? '').toUpperCase();
    const active = scoped.filter((g) => st(g.status) === 'ACTIVE').length;
    const draft = scoped.filter((g) => st(g.status) === 'DRAFT').length;
    const completed = scoped.filter((g) => st(g.status) === 'COMPLETED').length;
    return { total: scoped.length, active, draft, completed };
  }, [goalsAfterOwnerQuickPick]);

  const progressAvg = useMemo(() => {
    const scoped = goalsAfterOwnerQuickPick;
    const progressMap = buildGoalDisplayProgressMap(scoped);
    const active = scoped.filter((g) => goalStatusNorm(g.status) === 'ACTIVE');
    const pcts = active
      .map((g) => progressMap.get(g.id)?.pct ?? null)
      .filter((v): v is number => v != null && Number.isFinite(v));
    if (pcts.length === 0) return null;
    return Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length);
  }, [goalsAfterOwnerQuickPick]);

  const effectiveFilters = useMemo(
    () => ({ ...goalFilters, owner: effectiveOwner as 'all' | 'mine' }),
    [goalFilters, effectiveOwner],
  );
  const filteredGoals = useMemo(
    () => filterGoals(goalsAfterOwnerQuickPick, effectiveFilters, memberId),
    [goalsAfterOwnerQuickPick, effectiveFilters, memberId],
  );
  const sortedFilteredGoals = useMemo(
    () => sortGoals(filteredGoals, goalListSort),
    [filteredGoals, goalListSort],
  );

  const openCreateGoal = useCallback(() => {
    if (!companyId) {
      message.warning('회사 ID를 확인할 수 없어 목표를 생성할 수 없습니다.');
      return;
    }
    void templatesQuery.refetch();
    goalForm.setFieldsValue({
      kpiTemplateId: undefined,
      parentGoalId: undefined,
      rollupPolicy: 'CHILDREN_AVG',
      organizationOwnerId: undefined,
      memberOwnerId: memberId,
      ownerType: 'MEMBER',
      responsibleMemberId: undefined,
      measureType: 'HIGHER_BETTER',
      unitType: 'NUMBER',
      unitLabel: fixedUnitLabelForType('NUMBER'),
      visibility: 'PUBLIC',
      contributionPct: undefined,
      weightPct: undefined,
      capPct: 120,
      baseline: 0,
      range: [dayjs().startOf('month'), dayjs().endOf('month')],
    });
    setGoalModalOpen(true);
  }, [companyId, goalForm, memberId, templatesQuery]);

  const openCreateChildGoal = useCallback((parent: Goal) => {
    if (!companyId) {
      message.warning('회사 ID를 확인할 수 없어 목표를 생성할 수 없습니다.');
      return;
    }
    void templatesQuery.refetch();
    goalForm.setFieldsValue({
      kpiTemplateId: parent.kpiTemplateId ?? undefined,
      parentGoalId: parent.id,
      rollupPolicy: 'CHILDREN_AVG',
      // 기본 전제조건: 생성 모달 진입 시 소유 유형 기본값은 항상 구성원
      ownerType: 'MEMBER',
      organizationOwnerId: undefined,
      memberOwnerId: memberId,
      responsibleMemberId: undefined,
      measureType: parent.measureType ?? 'HIGHER_BETTER',
      unitType: parent.unitType ?? 'NUMBER',
      unitLabel: parent.unitType && parent.unitType !== 'CUSTOM'
        ? fixedUnitLabelForType(parent.unitType)
        : (parent.unitLabel ?? ''),
      visibility: parent.visibility ?? 'PUBLIC',
      contributionPct: undefined,
      weightPct: undefined,
      capPct: Number(parent.capPct ?? 120),
      baseline: Number(parent.baseline ?? 0),
      targetValue: Number(parent.targetValue ?? 100),
      actualValue: 0,
      autoUpdate: parent.autoUpdate ?? false,
      range: [dayjs(parent.startDate), dayjs(parent.endDate)],
      title: '',
      description: '',
      approverId: undefined,
    });
    setGoalModalOpen(true);
    message.info(`"${parent.title}" 하위 목표 생성으로 전환되었습니다.`);
  }, [companyId, goalForm, memberId, templatesQuery]);

  const loadingGoals = goalsQuery.isPending || goalsQuery.isFetching;
  const loadingTpl = templatesQuery.isPending || templatesQuery.isFetching;
  const activatingGoalId =
    activateMutation.isPending && typeof activateMutation.variables === 'string'
      ? activateMutation.variables
      : null;

  return (
    <div className="tw-mx-auto tw-w-full tw-space-y-10">
      {!companyId ? (
        <Alert
          type="warning"
          showIcon
          message="회사 ID(companyId)를 토큰에서 읽을 수 없습니다."
          description="로그인 JWT에 companyId(또는 tenantId 등) 클레임이 있어야 Goal API가 동작합니다. 백엔드·게이트웨이 설정을 확인해 주세요."
        />
      ) : null}

      {companyId ? (
        <>
        <section
          className=""
          aria-label={PERFORMANCE_PAGE_KO.heroTitle}
        >
          <AppWorkspacePageTitle
            className="!tw-mb-2"
            eyebrow={PERFORMANCE_PAGE_KO.workspaceEyebrow}
            title={PERFORMANCE_PAGE_KO.heroTitle}
          />

          <div className="tw-mt-5 tw-space-y-4">
            <div className="tw-grid tw-w-full tw-min-w-0 tw-grid-cols-1 tw-gap-4 lg:tw-grid-cols-3">
              <Card className="tw-h-full tw-rounded-3xl tw-border-slate-200/80 tw-bg-white tw-shadow-[0_1px_2px_rgba(15,23,42,0.05)] [&_.ant-card-body]:tw-p-5">
                <div className="tw-mb-3 tw-flex tw-items-center tw-gap-2">
                  <BarChartOutlined className="tw-text-slate-500" />
                  <Text className="tw-text-lg tw-font-semibold tw-text-slate-900">성과 현황</Text>
                </div>
                <div className="tw-space-y-2.5">
                  <div className="tw-flex tw-items-center tw-justify-between tw-rounded-2xl tw-border tw-border-slate-200/80 tw-bg-white tw-px-4 tw-py-3">
                    <span className="tw-text-slate-600">{PERFORMANCE_PAGE_KO.statAll}</span>
                    <span className="tw-text-2xl tw-font-semibold tw-tabular-nums tw-text-slate-800">{stats.total}</span>
                  </div>
                  <div className="tw-flex tw-items-center tw-justify-between tw-rounded-2xl tw-border tw-border-slate-200/80 tw-bg-white tw-px-4 tw-py-3">
                    <span className="tw-text-slate-600">{PERFORMANCE_PAGE_KO.statActive}</span>
                    <span className="tw-text-2xl tw-font-semibold tw-tabular-nums tw-text-blue-600">{stats.active}</span>
                  </div>
                  <div className="tw-flex tw-items-center tw-justify-between tw-rounded-2xl tw-border tw-border-slate-200/80 tw-bg-white tw-px-4 tw-py-3">
                    <span className="tw-text-slate-600">{PERFORMANCE_PAGE_KO.statCompleted}</span>
                    <span className="tw-text-2xl tw-font-semibold tw-tabular-nums tw-text-emerald-600">{stats.completed}</span>
                  </div>
                </div>
              </Card>

              <Card className="tw-h-full tw-rounded-3xl tw-border-slate-200/80 tw-bg-white tw-shadow-[0_1px_2px_rgba(15,23,42,0.05)] [&_.ant-card-body]:tw-p-5">
                <div className="tw-mb-1 tw-flex tw-items-center tw-gap-2">
                  <ThunderboltOutlined className="tw-text-slate-500" />
                  <Text className="tw-text-lg tw-font-semibold tw-text-slate-900">{PERFORMANCE_PAGE_KO.avgAchievement}</Text>
                </div>
                <Text className="tw-text-xs tw-text-slate-500">진행 중인 목표 기준</Text>
                <div className="tw-flex tw-justify-center tw-py-4">
                  <div
                    className="tw-relative tw-grid tw-h-[124px] tw-w-[124px] tw-place-items-center tw-rounded-full"
                    style={{
                      background: `conic-gradient(#3182f6 ${Math.min(100, Math.max(0, progressAvg ?? 0)) * 3.6}deg, #e2e8f0 0deg)`,
                    }}
                  >
                    <div className="tw-grid tw-h-[104px] tw-w-[104px] tw-place-items-center tw-rounded-full tw-bg-white">
                      <span className="tw-text-[36px] tw-font-semibold tw-leading-none tw-tabular-nums tw-text-slate-800">{progressAvg ?? 0}%</span>
                    </div>
                  </div>
                </div>
                <div className="tw-rounded-xl tw-border tw-border-slate-200/80 tw-bg-white tw-px-3 tw-py-2 tw-text-center tw-text-xs tw-text-slate-500">
                  {PERFORMANCE_PAGE_KO.avgAchievementUnavailable}
                </div>
              </Card>

              {(() => {
                const pendingCount = pendingApprovalsQuery.data?.length ?? 0;
                const myCount = approvalHistoryQuery.data?.length ?? 0;
                const hasPending = pendingCount > 0;
                return (
                  <Card className="tw-h-full tw-rounded-3xl tw-border-slate-200/80 tw-bg-white tw-shadow-[0_1px_2px_rgba(15,23,42,0.05)] [&_.ant-card-body]:tw-flex [&_.ant-card-body]:tw-h-full [&_.ant-card-body]:tw-flex-col [&_.ant-card-body]:tw-p-5">
                    <div className="tw-mb-1 tw-flex tw-items-center tw-gap-2">
                      <FileDoneOutlined className="tw-text-slate-500" />
                      <Text className="tw-text-lg tw-font-semibold tw-text-slate-900">
                        {PERFORMANCE_PAGE_KO.approvalStripTitle}
                      </Text>
                    </div>
                    <Text className="tw-text-xs tw-text-slate-500">
                      {hasPending ? '내가 승인해야 할 목표가 있습니다.' : PERFORMANCE_PAGE_KO.approvalStripEmptyPending}
                    </Text>
                    <div className="tw-mt-5 tw-flex tw-flex-1 tw-flex-col tw-gap-3">
                      <div className="tw-grid tw-h-[60%] tw-w-full tw-grid-cols-2 tw-gap-2.5">
                        <div className="tw-flex tw-min-h-[92px] tw-flex-col tw-items-center tw-justify-center tw-rounded-xl tw-bg-slate-50 tw-px-3 tw-py-3 tw-text-center">
                          <div className="tw-text-[11px] tw-text-slate-500">{PERFORMANCE_PAGE_KO.approvalStripPendingShort}</div>
                          <div className="tw-mt-1 tw-text-[32px] tw-font-semibold tw-leading-none tw-tabular-nums tw-text-[#0f172a]">
                            {pendingCount}
                          </div>
                        </div>
                        <div className="tw-flex tw-min-h-[92px] tw-flex-col tw-items-center tw-justify-center tw-rounded-xl tw-bg-slate-50 tw-px-3 tw-py-3 tw-text-center">
                          <div className="tw-text-[11px] tw-text-slate-500">{PERFORMANCE_PAGE_KO.approvalStripMineShort}</div>
                          <div className="tw-mt-1 tw-text-[32px] tw-font-semibold tw-leading-none tw-tabular-nums tw-text-[#0f172a]">
                            {approvalHistoryQuery.isPending ? '…' : myCount}
                          </div>
                        </div>
                      </div>
                      <Button
                        size="large"
                        onClick={() => setApprovalHubOpen(true)}
                        className="!tw-mt-auto !tw-h-12 !tw-w-full !tw-rounded-xl !tw-border-[#3b5bdb] !tw-bg-[#3b5bdb] !tw-font-semibold !tw-text-white hover:!tw-border-[#304ac7] hover:!tw-bg-[#304ac7]"
                      >
                        {hasPending ? '지금 확인하기' : `${PERFORMANCE_PAGE_KO.approvalStripCenter} →`}
                      </Button>
                    </div>
                  </Card>
                );
              })()}
            </div>
            <Text className="tw-block tw-text-[11px] tw-leading-normal tw-text-slate-400">
              * 집계 범위는 상단 탭별 설정(내 목표 / 전체)에 따라 실시간으로 반영됩니다.
            </Text>
          </div>
        </section>
        </>
      ) : null}

      <Tabs
          className="[&_.ant-tabs-nav]:tw-mb-3 [&_.ant-tabs-nav]:tw-px-0 [&_.ant-tabs-content-holder]:tw-mt-0 [&_.ant-tabs-tab]:!tw-pb-3 [&_.ant-tabs-tab]:!tw-pt-1 [&_.ant-tabs-tab]:!tw-text-slate-600 [&_.ant-tabs-tab.ant-tabs-tab-active_.ant-tabs-tab-btn]:!tw-text-[#1e3a5f] [&_.ant-tabs-tab.ant-tabs-tab-active_.ant-tabs-tab-btn]:!tw-font-semibold [&_.ant-tabs-ink-bar]:!tw-bg-[#3b82f6]"
          activeKey={tab}
          onChange={(k) => setTab(k as 'goals' | 'templates')}
          items={[
            {
              key: 'goals',
              label: PERFORMANCE_PAGE_KO.tabGoals,
              children: (
                <div className="tw-space-y-3">
                  <div className="tw-flex tw-flex-col tw-gap-3 lg:tw-flex-row lg:tw-items-stretch lg:tw-gap-3">
                    <div className="tw-flex tw-w-full tw-flex-col tw-gap-2 lg:tw-w-auto lg:tw-flex-row lg:tw-items-center">
                      <Segmented
                        className="tw-w-full lg:tw-w-auto"
                        value={goalScopeTab}
                        onChange={(v) => setGoalScopeTab(v as 'mine' | 'all' | 'members')}
                        options={[
                          { label: PERFORMANCE_PAGE_KO.scopeMine, value: 'mine' },
                          { label: PERFORMANCE_PAGE_KO.scopeAll, value: 'all' },
                          { label: PERFORMANCE_PAGE_KO.scopeMembers, value: 'members' },
                        ]}
                      />
                    </div>
                    <AppSearchField
                      className="lg:tw-flex-1"
                      placeholder={PERFORMANCE_PAGE_KO.searchPlaceholder}
                      value={goalFilters.search}
                      onChange={(e) => setGoalFilters((f) => ({ ...f, search: e.target.value }))}
                    />
                    <div className="tw-flex tw-min-h-10 tw-shrink-0 tw-flex-col tw-gap-2 sm:tw-flex-row sm:tw-flex-wrap sm:tw-items-center sm:tw-justify-end">
                      <Select
                        value={goalListSort}
                        onChange={(v) => setGoalListSort(v as GoalListSortKey)}
                        options={GOAL_SORT_OPTIONS}
                        className="tw-min-w-0 tw-w-full !tw-text-sm sm:tw-min-w-[176px] sm:tw-w-auto [&_.ant-select-selector]:!tw-min-h-10 [&_.ant-select-selector]:!tw-rounded-xl [&_.ant-select-selector]:!tw-border-slate-200 [&_.ant-select-selector]:!tw-text-slate-800"
                        popupMatchSelectWidth={false}
                      />
                      <Popover
                        placement="bottomLeft"
                        trigger="click"
                        content={
                          <Space direction="vertical" className="tw-w-[min(100vw-48px,360px)]" size={12}>
                            <Space wrap size={[8, 8]} className="tw-w-full">
                              <Select
                                mode="multiple"
                                allowClear
                                placeholder="상태"
                                className="tw-min-w-[160px] tw-max-w-full"
                                value={goalFilters.statuses}
                                onChange={(statuses) =>
                                  setGoalFilters((f) => ({ ...f, statuses: statuses ?? [] }))
                                }
                                options={GOAL_STATUS_FILTER_OPTIONS}
                              />
                              <Select
                                mode="multiple"
                                allowClear
                                placeholder="공개 범위"
                                className="tw-min-w-[160px] tw-max-w-full"
                                value={goalFilters.visibility === 'all' ? undefined : goalFilters.visibility}
                                onChange={(v) =>
                                  setGoalFilters((f) => ({
                                    ...f,
                                    visibility: Array.isArray(v) && v.length > 0 ? (v as Visibility[]) : 'all',
                                  }))
                                }
                                options={VISIBILITY_OPTIONS}
                              />
                              <Select
                                mode="multiple"
                                allowClear
                                placeholder="사이클"
                                className="tw-min-w-[160px] tw-max-w-full"
                                value={goalFilters.cycles.length > 0 ? goalFilters.cycles : undefined}
                                onChange={(v) =>
                                  setGoalFilters((f) => ({
                                    ...f,
                                    cycles: (v as GoalCycleKey[]) ?? [],
                                  }))
                                }
                                options={GOAL_CYCLE_FILTER_OPTIONS}
                              />
                              <RangePicker
                                value={goalFilters.period ?? null}
                                onChange={(rng) =>
                                  setGoalFilters((f) => ({
                                    ...f,
                                    period: rng?.[0] && rng[1] ? [rng[0], rng[1]] : null,
                                  }))
                                }
                              />
                              <Button onClick={() => setGoalFilters(narrativeDefaultGoalFilters())}>
                                필터 초기화
                              </Button>
                            </Space>
                            <Paragraph type="secondary" className="!tw-mb-0 !tw-text-xs">
                              {PERFORMANCE_PAGE_KO.filterHint}
                            </Paragraph>
                          </Space>
                        }
                      >
                        <Button
                          icon={<FilterOutlined />}
                          className="!tw-h-10 !tw-w-full !tw-rounded-xl !tw-border-slate-200 !tw-bg-white !tw-text-slate-700 hover:!tw-border-slate-300 hover:!tw-bg-slate-50 sm:!tw-w-auto"
                        >
                          {PERFORMANCE_PAGE_KO.filterButton}
                        </Button>
                      </Popover>
                      <PermissionGuard required={PERM.GOAL_CREATE} fallback={null}>
                        <Button
                          type="primary"
                          icon={<PlusOutlined />}
                          onClick={openCreateGoal}
                          className="!tw-h-10 !tw-w-full !tw-rounded-xl !tw-border-0 !tw-bg-[#1e3a5f] !tw-font-semibold hover:!tw-bg-[#152a45] sm:!tw-w-auto"
                        >
                          {PERFORMANCE_PAGE_KO.ctaAddGoal}
                        </Button>
                      </PermissionGuard>
                    </div>
                  </div>
                  <Card className="tw-overflow-hidden tw-rounded-2xl tw-border-slate-200/80 tw-bg-white tw-shadow-[0_1px_3px_rgba(15,23,42,0.06)] [&_.ant-card-body]:tw-px-5 [&_.ant-card-body]:tw-pb-5 [&_.ant-card-body]:tw-pt-4 sm:[&_.ant-card-body]:tw-px-7">
                    <Space direction="vertical" className="tw-w-full" size={16}>
                      <div className="tw-grid tw-grid-cols-1 tw-gap-4 xl:tw-grid-cols-[minmax(0,1fr)_280px]">
                        <GoalsListCards
                          goals={sortedFilteredGoals}
                          loading={loadingGoals}
                          memberId={memberId}
                          formatOwnerLabel={formatGoalOwner}
                          canCreate={canCreate}
                          emptyTitle={PERFORMANCE_PAGE_KO.emptyGoalsTitle}
                          emptyHint={PERFORMANCE_PAGE_KO.emptyGoalsHint}
                          onOpenDetail={setDetailGoal}
                          onActivate={(id) => {
                            const goal = goalsList.find((g) => g.id === id);
                            if (goal) {
                              const policy = resolveGoalApprovalPolicy(goal, templates);
                              if (policyRequiresActivation(policy)) {
                                // 승인이 필요한 경우 상세 모달을 열어 승인 요청 흐름으로 유도
                                setDetailGoal(goal);
                                return;
                              }
                            }
                            activateMutation.mutate(id);
                          }}
                          onCreateChildGoal={openCreateChildGoal}
                          activatingGoalId={activatingGoalId}
                          templates={templates}
                        />
                        <aside className="tw-rounded-xl tw-border tw-border-slate-200 tw-bg-white tw-p-3">
                          <Input
                            allowClear
                            value={ownerPanelSearch}
                            onChange={(e) => setOwnerPanelSearch(e.target.value)}
                            placeholder={PERFORMANCE_PAGE_KO.orgSearchPlaceholder}
                            className="!tw-mb-3 [&_.ant-input]:tw-rounded-lg"
                          />
                          <div className="tw-mb-1 tw-text-xs tw-font-semibold tw-text-slate-500">{PERFORMANCE_PAGE_KO.orgPanelTitle}</div>
                          <Tree
                            blockNode
                            showLine
                            defaultExpandAll
                            selectedKeys={ownerTreeSelectedKeys}
                            treeData={ownerTreeData}
                            onSelect={(keys) => {
                              const key = String(keys[0] ?? '');
                              if (!key) return;
                              if (key === 'all') {
                                setOwnerQuickPick('ALL');
                                return;
                              }
                              if (key === 'members' || key === 'org') return;
                              if (key.startsWith('m:') || key.startsWith('o:')) {
                                setOwnerQuickPick(key.slice(2));
                              }
                            }}
                            className="tw-rounded-lg tw-border tw-border-slate-100 tw-bg-slate-50/40 tw-p-2 [&_.ant-tree-node-content-wrapper]:tw-rounded-md"
                          />
                        </aside>
                      </div>
                    </Space>
                  </Card>
                </div>
              ),
            },
            {
              key: 'templates',
              label: PERFORMANCE_PAGE_KO.tabTemplates,
              children: (
                <div className="tw-space-y-3">
                  <div className="tw-flex tw-flex-col tw-gap-3 lg:tw-flex-row lg:tw-items-stretch lg:tw-gap-3">
                    <AppSearchField
                      className="lg:tw-flex-1"
                      placeholder={PERFORMANCE_PAGE_KO.searchTemplatesPlaceholder}
                      value={templateSearch}
                      onChange={(e) => setTemplateSearch(e.target.value)}
                    />
                    <div className="tw-flex tw-min-h-10 tw-shrink-0 tw-justify-end">
                      <PermissionGuard required={PERM.GOAL_CREATE} fallback={null}>
                        <Button
                          type="primary"
                          icon={<PlusOutlined />}
                          onClick={() => setTemplateModalOpen(true)}
                          className="!tw-h-10 !tw-w-full !tw-rounded-xl !tw-border-0 !tw-bg-[#1e3a5f] !tw-font-semibold hover:!tw-bg-[#152a45] sm:!tw-w-auto"
                        >
                          {PERFORMANCE_PAGE_KO.ctaAddTemplate}
                        </Button>
                      </PermissionGuard>
                    </div>
                  </div>
                  <Card className="tw-overflow-hidden tw-rounded-2xl tw-border-slate-200/80 tw-bg-white tw-shadow-[0_1px_3px_rgba(15,23,42,0.06)] [&_.ant-card-body]:tw-px-5 [&_.ant-card-body]:tw-pb-5 [&_.ant-card-body]:tw-pt-4 sm:[&_.ant-card-body]:tw-px-7">
                    <Space direction="vertical" className="tw-w-full" size={16}>
                      <Paragraph className="!tw-mb-0 !tw-text-sm !tw-leading-relaxed !tw-text-slate-600">
                        {PERFORMANCE_PAGE_KO.tabTemplatesIntro}
                      </Paragraph>
                      <KpiTemplateCards
                        templates={filteredTemplates}
                        loading={loadingTpl}
                        emptyMessage={
                          templates.length > 0 && filteredTemplates.length === 0
                            ? PERFORMANCE_PAGE_KO.emptyTemplatesSearch
                            : PERFORMANCE_PAGE_KO.emptyTemplates
                        }
                        canDeactivate={canUpdate}
                        onDeactivate={(id) => deactivateTplMutation.mutate(id)}
                        deactivatingId={deactivatingTemplateId}
                      />
                    </Space>
                  </Card>
                </div>
              ),
            },
          ]}
        />

      {companyId ? (
        <Modal
          title={PERFORMANCE_PAGE_KO.approvalStripCenter}
          open={approvalHubOpen}
          onCancel={() => setApprovalHubOpen(false)}
          footer={null}
          width="min(720px, calc(100vw - 24px))"
          centered
          destroyOnHidden
          styles={{ body: { maxHeight: 'min(78vh, 720px)', overflowY: 'auto' } }}
          zIndex={1050}
        >
          <GoalApprovalCenterPanel showIntro={false} embeddedInModal />
        </Modal>
      ) : null}

      <AppSingleActionModal
        title="KPI 템플릿 등록"
        open={templateModalOpen}
        onClose={() => setTemplateModalOpen(false)}
        onSubmit={() => tplForm.submit()}
        submitText="저장"
        submitLoading={createTplMutation.isPending}
        destroyOnHidden
        width={480}
      >
        <Form<CreateKpiTemplatePayload>
          form={tplForm}
          layout="vertical"
          className="tw-px-5 tw-py-4"
          scrollToFirstError={{ block: 'center', behavior: 'smooth' }}
          onFinish={(v) => {
            if (!companyId) return;
            const unitLabel =
              v.unitType === 'CUSTOM'
                ? String(v.unitLabel ?? '').trim()
                : fixedUnitLabelForType(v.unitType);
            createTplMutation.mutate({ ...v, companyId, unitLabel });
          }}
          onFinishFailed={({ errorFields }) => {
            const first = errorFields?.[0];
            if (!first) return;
            tplForm.scrollToField(first.name, { block: 'center', behavior: 'smooth' });
          }}
          initialValues={{
            measureType: 'HIGHER_BETTER',
            unitType: 'PERCENTAGE',
            unitLabel: '%',
            cycle: 'QUARTERLY',
            capPct: 120,
            goalApprovalPolicy: 'NONE',
          }}
        >
          <div className="tw-flex tw-justify-end tw-mb-2">
            <Dropdown
              menu={{
                items: KPI_TEMPLATE_PRESETS.map((p) => ({
                  key: p.key,
                  label: (
                    <div>
                      <div className="tw-font-medium">{p.label}</div>
                      <div className="tw-text-xs tw-text-gray-400">{p.description}</div>
                    </div>
                  ),
                })),
                onClick: ({ key }) => {
                  const preset = KPI_TEMPLATE_PRESETS.find((x) => x.key === key);
                  if (!preset) return;
                  const ut = preset.unitType;
                  const unitLabel =
                    ut === 'CUSTOM'
                      ? String(preset.customUnitLabel ?? '').trim()
                      : fixedUnitLabelForType(ut);
                  tplForm.setFieldsValue({
                    name: preset.name,
                    measureType: preset.measureType,
                    unitType: ut,
                    unitLabel,
                    cycle: preset.cycle,
                    capPct: preset.capPct,
                  });
                  message.success(PERFORMANCE_PAGE_KO.kpiPresetApplied);
                },
              }}
              placement="bottomRight"
              trigger={['click']}
            >
              <Tooltip title={PERFORMANCE_PAGE_KO.kpiPresetTooltip}>
                <Button type="primary" ghost size="small" icon={<ThunderboltOutlined />}>
                  {PERFORMANCE_PAGE_KO.kpiPresetButton}
                </Button>
              </Tooltip>
            </Dropdown>
          </div>
          <Form.Item name="name" label="템플릿 이름" rules={[{ required: true }]}>
            <Input placeholder="예: 매출 달성률" />
          </Form.Item>
          <Form.Item
            name="measureType"
            label="지표 방향"
            tooltip="달성 수치가 커야 좋은지, 작아야 좋은지, 목표에 맞추면 좋은지 선택합니다."
            rules={[{ required: true }]}
          >
            <Select
              options={MEASURE_OPTIONS.map((o) => ({ value: o.value, label: `${o.label} (${o.description})` }))}
            />
          </Form.Item>
          <Form.Item name="unitType" label="단위 유형" rules={[{ required: true }]}>
            <Select options={UNIT_OPTIONS} />
          </Form.Item>
          <Form.Item
            name="unitLabel"
            label="단위 표시명"
            tooltip={
              tplUnitType === 'CUSTOM'
                ? '사용자 정의 유형만 표시 문자열을 직접 입력합니다. 최대 20자.'
                : '일반 유형은 단위 유형에 맞춰 자동으로 정해집니다.'
            }
            rules={
              tplUnitType === 'CUSTOM'
                ? [
                    { required: true, message: '표시명을 입력하세요.' },
                    { whitespace: true, message: '공백만으로는 등록할 수 없습니다.' },
                    { max: 20, message: '최대 20자입니다.' },
                  ]
                : [{ required: true, message: '단위 유형을 선택하세요.' }]
            }
          >
            <Input
              readOnly={tplUnitType !== 'CUSTOM'}
              placeholder={
                tplUnitType === 'CUSTOM'
                  ? '예: 점, 시간, 건(직접 정의)'
                  : '단위 유형에 따라 자동 설정'
              }
              maxLength={20}
              showCount={tplUnitType === 'CUSTOM'}
              className={tplUnitType !== 'CUSTOM' ? '[&_.ant-input]:tw-bg-slate-50' : undefined}
            />
          </Form.Item>
          <Form.Item name="cycle" label="주기" rules={[{ required: true }]}>
            <Select options={CYCLE_OPTIONS} />
          </Form.Item>
          <Form.Item name="capPct" label="최대 인정 상한(%)" rules={[{ required: true }]}>
            <InputNumber min={0} max={200} className="tw-w-full" />
          </Form.Item>
          <Form.Item
            name="goalApprovalPolicy"
            label="승인 정책"
            tooltip="목표를 활성화하거나 종료할 때 상위자 승인을 요구할 단계를 설정합니다."
            rules={[{ required: true, message: '승인 정책을 선택하세요.' }]}
          >
            <Select
              options={[
                { value: 'NONE', label: '없음 — 자유 진행' },
                { value: 'ACTIVATION_ONLY', label: '활성화 시에만 승인' },
                { value: 'COMPLETION_ONLY', label: '종료 시에만 승인' },
                { value: 'BOTH', label: '활성화 + 종료 모두 승인' },
              ]}
            />
          </Form.Item>
          {tplApprovalPolicy && tplApprovalPolicy !== 'NONE' && (
            <Alert
              type="info"
              showIcon
              className="!tw-mb-4 !tw-rounded-lg"
              message={
                tplApprovalPolicy === 'ACTIVATION_ONLY'
                  ? '이 템플릿으로 생성한 목표는 진행 시작(활성화) 시 승인자 지정이 필요합니다.'
                  : tplApprovalPolicy === 'COMPLETION_ONLY'
                    ? '이 템플릿으로 생성한 목표는 종료(완료) 시 승인자 지정이 필요합니다.'
                    : '이 템플릿으로 생성한 목표는 활성화·종료 모두 승인자 지정이 필요합니다.'
              }
              description="승인자는 목표 생성 시 지정합니다."
            />
          )}
        </Form>
      </AppSingleActionModal>

      <AppSingleActionModal
        title="새 목표"
        open={goalModalOpen}
        onClose={() => setGoalModalOpen(false)}
        onSubmit={() => goalForm.submit()}
        submitText="목표 만들기"
        submitLoading={createGoalMutation.isPending}
        destroyOnHidden
        width={560}
      >
        <Form
          form={goalForm}
          layout="vertical"
          className="tw-px-5 tw-py-4"
          scrollToFirstError={{ block: 'center', behavior: 'smooth' }}
          onFinish={(values) => {
            if (!companyId) return;
            const [start, end] = values.range;
            if (!end.isAfter(start, 'day')) {
              message.error('종료일은 시작일보다 이후여야 합니다.');
              return;
            }
            const baseline = Number(values.baseline);
            const targetValue = Number(values.targetValue);
            if (targetValue === baseline) {
              message.error('목표값은 기준값과 달라야 합니다.');
              return;
            }
            const unitLabelTrim =
              values.unitLabel !== undefined && values.unitLabel !== null
                ? String(values.unitLabel).trim()
                : '';
            const orgOwnerTrim =
              values.organizationOwnerId !== undefined && values.organizationOwnerId !== null
                ? String(values.organizationOwnerId).trim()
                : '';
            const memberOwnerTrim =
              values.memberOwnerId !== undefined && values.memberOwnerId !== null
                ? String(values.memberOwnerId).trim()
                : '';
            const ownerId = values.ownerType === 'MEMBER' ? memberOwnerTrim : orgOwnerTrim;
            if (values.ownerType === 'MEMBER' && !ownerId) {
              message.error(PERFORMANCE_PAGE_KO.goalMemberOwnerRequired);
              return;
            }
            if (values.ownerType === 'ORGANIZATION' && !ownerId) {
              message.error(PERFORMANCE_PAGE_KO.goalOrganizationOwnerRequired);
              return;
            }
            // [TEAM 목표 책임자] ORGANIZATION 목표는 책임자(responsibleMemberId) 필수.
            const responsibleMemberIdTrim =
              values.responsibleMemberId !== undefined && values.responsibleMemberId !== null
                ? String(values.responsibleMemberId).trim()
                : '';
            if (values.ownerType === 'ORGANIZATION' && !responsibleMemberIdTrim) {
              message.error('조직 목표는 책임자를 지정해 주세요.');
              return;
            }
            const payload: CreateGoalPayload = {
              kpiTemplateId: values.kpiTemplateId,
              companyId,
              ownerType: values.ownerType,
              ownerId,
              title: values.title.trim(),
              description: (values.description ?? '').trim(),
              startDate: start.format('YYYY-MM-DD'),
              endDate: end.format('YYYY-MM-DD'),
              measureType: values.measureType,
              unitType: values.unitType,
              baseline,
              targetValue,
              capPct: Math.trunc(Number(values.capPct)),
              visibility: values.visibility,
            };
            if (values.ownerType === 'ORGANIZATION' && responsibleMemberIdTrim) {
              payload.responsibleMemberId = responsibleMemberIdTrim;
            }
            const rp = values.rollupPolicy as RollupPolicy | undefined;
            if (rp === 'CHILDREN_AVG' || rp === 'CHILDREN_WEIGHTED') {
              payload.rollupPolicy = rp;
            }
            const contrib = values.contributionPct;
            if (contrib != null && Number.isFinite(Number(contrib))) {
              payload.contributionPct = Number(contrib);
            }
            const weight = values.weightPct;
            if (weight != null && Number.isFinite(Number(weight))) {
              payload.weightPct = Number(weight);
            }
            if (unitLabelTrim) payload.unitLabel = unitLabelTrim;
            const parentTrim =
              values.parentGoalId !== undefined && values.parentGoalId !== null
                ? String(values.parentGoalId).trim()
                : '';
            if (parentTrim) payload.parentGoalId = parentTrim;
            const approverIdTrim = String(values.approverId ?? '').trim();
            // approverId 는 정책 무관하게 payload 에 실어 보낸다.
            // 서버는 이 값을 Goal.completionApproverId 로 저장해 완료 승인 요청 시 기본값으로 재사용.
            //
            // requireApproval=true 는 "생성 시점에 활성화 번들도 만들어라" 는 신호.
            // ACTIVATION_ONLY / BOTH 정책에서만 true. COMPLETION_ONLY 는 완료 시점에만 번들이 필요하므로 false.
            if (approverIdTrim) payload.approverId = approverIdTrim;
            if (policyRequiresActivation(goalFormPolicy)) {
              payload.requireApproval = true;
            }
            createGoalMutation.mutate(payload);
          }}
          onFinishFailed={({ errorFields }) => {
            const first = errorFields?.[0];
            if (!first) return;
            goalForm.scrollToField(first.name, { block: 'center', behavior: 'smooth' });
          }}
        >
          <Form.Item name="kpiTemplateId" label="KPI 템플릿" rules={[{ required: true, message: '템플릿을 선택하세요.' }]}>
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              loading={templatesQuery.isFetching}
              placeholder={
                templates.length === 0 && !templatesQuery.isFetching
                  ? 'KPI 템플릿 탭에서 먼저 등록해 주세요'
                  : activeTemplatesForGoals.length === 0 && !templatesQuery.isFetching
                    ? PERFORMANCE_PAGE_KO.templateNoActiveForGoal
                    : '템플릿 선택'
              }
              getPopupContainer={(triggerNode) =>
                (triggerNode.closest('.ant-modal-content') as HTMLElement | null) ?? document.body
              }
              options={activeTemplatesForGoals.map((t) => {
                const name = t.name?.trim() ? t.name : `템플릿 ${t.id.slice(0, 8)}…`;
                const sym = t.unitLabel?.trim();
                return {
                  value: t.id,
                  label: sym ? `${name} (${sym})` : name,
                };
              })}
              onChange={(id) => {
                if (id == null) {
                  const ut = goalForm.getFieldValue('unitType') as UnitType | undefined;
                  goalForm.setFieldValue(
                    'unitLabel',
                    ut != null && ut !== 'CUSTOM' ? fixedUnitLabelForType(ut) : '',
                  );
                  return;
                }
                const t = templates.find((x) => String(x.id) === String(id));
                if (t) {
                  const cap =
                    t.capPct != null && t.capPct >= 1 ? Math.trunc(t.capPct) : 120;
                  const ut = t.unitType as UnitType;
                  const ul =
                    ut === 'CUSTOM'
                      ? (t.unitLabel?.trim() ?? '')
                      : fixedUnitLabelForType(ut);
                  goalForm.setFieldsValue({
                    measureType: t.measureType,
                    unitType: ut,
                    capPct: cap,
                    unitLabel: ul,
                    approverId: undefined,
                  });
                }
              }}
            />
          </Form.Item>
          {/* 상위 목표는 리스트 행의 "하위 추가" 액션에서 자동 주입되며, 생성 모달에서는 노출하지 않는다. */}
          <Form.Item name="parentGoalId" hidden>
            <Input type="hidden" />
          </Form.Item>
          <Form.Item
            name="ownerType"
            label="소유 유형"
            tooltip={`${PERFORMANCE_PAGE_KO.goalOwnerTypeMemberHint} ${PERFORMANCE_PAGE_KO.goalOwnerTypeOrgHint}`}
            rules={[{ required: true }]}
            initialValue="MEMBER"
          >
            <Radio.Group
              options={OWNER_OPTIONS}
              optionType="button"
              buttonStyle="solid"
              onChange={(e) => {
                const v = e.target.value as OwnerType;
                if (v === 'MEMBER') {
                  goalForm.setFieldValue('organizationOwnerId', undefined);
                  goalForm.setFieldValue('responsibleMemberId', undefined);
                  if (!String(goalForm.getFieldValue('memberOwnerId') ?? '').trim()) {
                    goalForm.setFieldValue('memberOwnerId', memberId);
                  }
                } else {
                  goalForm.setFieldValue('memberOwnerId', undefined);
                  goalForm.setFieldValue('organizationOwnerId', defaultOrganizationOwnerId);
                  goalForm.setFieldValue('responsibleMemberId', memberId);
                }
              }}
            />
          </Form.Item>
          {goalOwnerType === 'MEMBER' || goalOwnerType == null ? (
            <Form.Item
              name="memberOwnerId"
              label={PERFORMANCE_PAGE_KO.goalMemberOwnerLabel}
              rules={[{ required: true, message: PERFORMANCE_PAGE_KO.goalMemberOwnerRequired }]}
            >
              <div className="tw-space-y-2">
                <Input type="hidden" />
                <div className="tw-rounded-lg tw-border tw-border-slate-200 tw-bg-slate-50/60 tw-px-3 tw-py-2.5">
                  <div className="tw-flex tw-items-center tw-justify-between tw-gap-3">
                    <div className="tw-min-w-0">
                      <Text className="tw-block tw-text-[11px] tw-font-medium tw-text-slate-500">현재 선택</Text>
                      {String(goalMemberOwnerId ?? '').trim() ? (
                        <Tag color="blue" className="!tw-mt-1 !tw-mb-0">
                          {memberLabelForUi(goalMemberOwnerId)}
                        </Tag>
                      ) : (
                        <Text className="tw-text-sm tw-text-slate-400">아직 선택된 구성원이 없습니다.</Text>
                      )}
                    </div>
                    <AppButton
                      variant="secondary"
                      icon={<TeamOutlined />}
                      className="!tw-h-9 !tw-shrink-0 !tw-rounded-full !tw-px-3 !tw-text-xs !tw-font-semibold"
                      onClick={() => setGoalMemberPickerField('memberOwnerId')}
                    >
                      조직도에서 선택
                    </AppButton>
                  </div>
                </div>
              </div>
            </Form.Item>
          ) : null}
          {goalOwnerType === 'ORGANIZATION' ? (
            <>
              <Form.Item
                name="organizationOwnerId"
                label={PERFORMANCE_PAGE_KO.goalOrganizationOwnerLabel}
                rules={[{ required: true, message: PERFORMANCE_PAGE_KO.goalOrganizationOwnerRequired }]}
                extra={
                  goalOrganizationTreeData.length === 0 ? (
                    <Text type="warning">{PERFORMANCE_PAGE_KO.goalOrganizationListEmpty}</Text>
                  ) : undefined
                }
              >
                <div className="tw-space-y-2">
                  <Input type="hidden" />
                  <div className="tw-rounded-lg tw-border tw-border-slate-200 tw-bg-slate-50/60 tw-px-3 tw-py-2.5">
                    <div className="tw-flex tw-items-center tw-justify-between tw-gap-3">
                      <div className="tw-min-w-0">
                        <Text className="tw-block tw-text-[11px] tw-font-medium tw-text-slate-500">현재 선택</Text>
                        {String(goalOrganizationOwnerId ?? '').trim() ? (
                          <Tag color="blue" className="!tw-mt-1 !tw-mb-0">
                            {orgLabelById.get(String(goalOrganizationOwnerId)) ?? String(goalOrganizationOwnerId)}
                          </Tag>
                        ) : (
                          <Text className="tw-text-sm tw-text-slate-400">아직 선택된 조직이 없습니다.</Text>
                        )}
                      </div>
                      <AppButton
                        variant="secondary"
                        icon={<TeamOutlined />}
                        className="!tw-h-9 !tw-shrink-0 !tw-rounded-full !tw-px-3 !tw-text-xs !tw-font-semibold"
                        onClick={() => setGoalOrgPickerOpen(true)}
                        disabled={goalOrganizationTreeData.length === 0}
                      >
                        조직트리에서 선택
                      </AppButton>
                    </div>
                  </div>
                </div>
              </Form.Item>
              <Form.Item
                name="responsibleMemberId"
                label="목표 책임자"
                rules={[{ required: true, message: '조직 목표는 책임자를 지정해 주세요.' }]}
                extra="이 조직 목표의 완료 승인 요청을 주도하고 진행률 편집을 주도할 사원입니다. 팀장이 일반적이지만 담당자 지정 가능."
              >
                <div className="tw-space-y-2">
                  <Input type="hidden" />
                  <div className="tw-rounded-lg tw-border tw-border-slate-200 tw-bg-slate-50/60 tw-px-3 tw-py-2.5">
                    <div className="tw-flex tw-items-center tw-justify-between tw-gap-3">
                      <div className="tw-min-w-0">
                        <Text className="tw-block tw-text-[11px] tw-font-medium tw-text-slate-500">현재 선택</Text>
                        {String(goalResponsibleMemberId ?? '').trim() ? (
                          <Tag color="blue" className="!tw-mt-1 !tw-mb-0">
                            {memberLabelForUi(goalResponsibleMemberId)}
                          </Tag>
                        ) : (
                          <Text className="tw-text-sm tw-text-slate-400">아직 선택된 목표 책임자가 없습니다.</Text>
                        )}
                      </div>
                      <AppButton
                        variant="secondary"
                        icon={<TeamOutlined />}
                        className="!tw-h-9 !tw-shrink-0 !tw-rounded-full !tw-px-3 !tw-text-xs !tw-font-semibold"
                        onClick={() => setGoalMemberPickerField('responsibleMemberId')}
                      >
                        조직도에서 선택
                      </AppButton>
                    </div>
                  </div>
                </div>
              </Form.Item>
            </>
          ) : null}
          <Form.Item
            name="title"
            label="목표 제목"
            rules={[{ required: true }, { max: 300, message: '최대 300자입니다.' }]}
          >
            <Input showCount maxLength={300} />
          </Form.Item>
          <Form.Item
            name="description"
            label="설명"
            rules={[
              { required: true, message: '설명을 입력해 주세요.' },
              { max: 300, message: '최대 300자입니다.' },
            ]}
          >
            <Input.TextArea rows={3} showCount maxLength={300} />
          </Form.Item>
          <Form.Item name="range" label="기간" rules={[{ required: true, message: '기간을 선택하세요.' }]}>
            <RangePicker className="tw-w-full" format="YYYY-MM-DD" />
          </Form.Item>
          <Form.Item
            name="rollupPolicy"
            label={PERFORMANCE_PAGE_KO.goalRollupPolicyLabel}
            tooltip={PERFORMANCE_PAGE_KO.goalRollupPolicyTooltip}
            rules={[{ required: true, message: '롤업 방식을 선택하세요.' }]}
          >
            <Radio.Group
              options={ROLLUP_POLICY_OPTIONS}
              optionType="button"
              buttonStyle="solid"
            />
          </Form.Item>
          <Text type="secondary" className="tw-mb-2 tw-mt-1 tw-block tw-text-xs">
            지표 방향과 단위 유형은 선택한 KPI 템플릿 값이 자동 적용됩니다.
          </Text>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item
                name="measureType"
                label="지표 방향"
                rules={[{ required: true }]}
              >
                <Select
                  disabled
                  options={MEASURE_OPTIONS.map((o) => ({ value: o.value, label: `${o.label} (${o.description})` }))}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="unitType" label="단위 유형" rules={[{ required: true }]}>
                <Select
                  disabled
                  options={UNIT_OPTIONS}
                  onChange={(ut: UnitType) => {
                    if (ut === 'CUSTOM') {
                      goalForm.setFieldValue('unitLabel', '');
                    } else {
                      goalForm.setFieldValue('unitLabel', fixedUnitLabelForType(ut));
                    }
                  }}
                />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item
            name="unitLabel"
            label="단위 표시명"
            tooltip="선택한 KPI 템플릿의 표시명이 자동 반영됩니다."
            rules={[{ max: 20, message: '최대 20자입니다.' }]}
          >
            <Input
              disabled
              placeholder="선택한 템플릿에서 자동 반영"
              maxLength={20}
              className="[&_.ant-input]:tw-bg-slate-50"
            />
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="baseline" label="기준값" rules={[{ required: true }]}>
                <InputNumber className="tw-w-full" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="targetValue"
                label="목표값"
                dependencies={['baseline']}
                rules={[
                  { required: true },
                  ({ getFieldValue }) => ({
                    validator(_, value) {
                      const b = getFieldValue('baseline');
                      if (value != null && b != null && Number(value) === Number(b)) {
                        return Promise.reject(new Error('목표값은 기준값과 달라야 합니다.'));
                      }
                      return Promise.resolve();
                    },
                  }),
                ]}
              >
                <InputNumber className="tw-w-full" min={0} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item
            name="capPct"
            label="달성률 상한(%)"
            tooltip="선택한 KPI 템플릿의 상한값이 자동 반영됩니다."
            rules={[{ required: true, message: '상한(%)을 입력하세요.' }, { type: 'number', min: 1 }]}
          >
            <InputNumber className="tw-w-full" min={1} disabled />
          </Form.Item>
          <Form.Item name="visibility" label="공개 범위" rules={[{ required: true }]}>
            <Radio.Group options={VISIBILITY_OPTIONS} optionType="button" buttonStyle="solid" />
          </Form.Item>

          {/* ── 승인 정책 안내 + 승인자 지정 ── */}
          {goalFormPolicy !== 'NONE' && (
            <div className="tw-rounded-xl tw-border tw-border-blue-200 tw-bg-blue-50/60 tw-p-3 tw-mb-4">
              <div className="tw-mb-2 tw-text-xs tw-font-semibold tw-text-blue-700">
                승인 정책: {goalFormPolicy === 'ACTIVATION_ONLY' ? '활성화 시 승인' : goalFormPolicy === 'COMPLETION_ONLY' ? '종료 시 승인' : '활성화 + 종료 모두 승인'}
              </div>
              <div className="tw-text-xs tw-text-slate-600 tw-mb-3">
                선택한 KPI 템플릿에 승인 정책이 설정되어 있습니다. 승인자를 미리 지정하면 이후 승인 요청 시 자동으로 할당됩니다.
              </div>
              <Form.Item
                name="approverId"
                label={
                  goalFormNeedsActivationApprover && goalFormNeedsCompletionApprover
                    ? '승인자 (활성화 + 종료 공통)'
                    : goalFormNeedsActivationApprover
                      ? '활성화 승인자'
                      : '종료 승인자'
                }
                rules={[{ required: true, message: '승인자를 지정해 주세요.' }]}
                className="!tw-mb-0"
              >
                <MemberRemoteSelect
                  placeholder="승인자를 검색하세요"
                  getPopupContainer={(triggerNode) =>
                    (triggerNode.closest('.ant-modal-content') as HTMLElement | null) ?? document.body
                  }
                />
              </Form.Item>
            </div>
          )}

          <Row gutter={12}>
            <Col span={12}>
              <Form.Item
                name="contributionPct"
                label={PERFORMANCE_PAGE_KO.goalContributionPctLabel}
                tooltip={PERFORMANCE_PAGE_KO.goalContributionPctTooltip}
              >
                <InputNumber className="tw-w-full" min={0} placeholder="선택" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="weightPct"
                label={PERFORMANCE_PAGE_KO.goalWeightPctLabel}
                tooltip={PERFORMANCE_PAGE_KO.goalWeightPctTooltip}
                dependencies={['rollupPolicy']}
                rules={[
                  ({ getFieldValue }) => ({
                    validator(_, value) {
                      if (getFieldValue('rollupPolicy') !== 'CHILDREN_WEIGHTED') return Promise.resolve();
                      if (value != null && Number.isFinite(Number(value))) return Promise.resolve();
                      return Promise.reject(
                        new Error('하위 목표 가중치 합산 방식을 선택한 경우 가중치(%)를 입력해 주세요.'),
                      );
                    },
                  }),
                ]}
              >
                <InputNumber className="tw-w-full" min={0} max={100} placeholder="가중 합산 시 권장" />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </AppSingleActionModal>


      <AppSingleActionModal
        title={PERFORMANCE_PAGE_KO.progressUpdateModalTitle}
        open={goalProgressUpdateModalOpen && detailGoal != null}
        onClose={() => setGoalProgressUpdateModalOpen(false)}
        onSubmit={() => progressUpdateForm.submit()}
        submitText={PERFORMANCE_PAGE_KO.progressUpdateSubmit}
        submitLoading={addProgressUpdateMutation.isPending}
        destroyOnHidden
      >
        {detailGoal ? (
          <>
            <Paragraph type="secondary" className="!tw-mt-0 !tw-text-sm">
              {PERFORMANCE_PAGE_KO.progressUpdateModalLead}
            </Paragraph>
            <Form
              form={progressUpdateForm}
              layout="vertical"
              className="tw-mt-3 tw-px-5 tw-py-4 [&_.ant-form-item]:tw-mb-3"
              onFinish={(values) => {
                addProgressUpdateMutation.mutate({
                  goalId: detailGoal.id,
                  value: Number(values.value),
                  status: values.status,
                  note: values.note?.trim() || undefined,
                });
              }}
            >
              <Row gutter={[12, 0]}>
                <Col xs={24} sm={8}>
                  <Form.Item
                    name="value"
                    label={PERFORMANCE_PAGE_KO.progressUpdateFieldPct}
                    rules={[{ required: true, message: '진행률을 입력해 주세요.' }]}
                  >
                    <InputNumber min={0} max={100} className="tw-w-full" />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={16}>
                  <Form.Item
                    name="status"
                    label={PERFORMANCE_PAGE_KO.progressUpdateFieldStatus}
                    rules={[{ required: true, message: '상태를 선택해 주세요.' }]}
                  >
                    <Select options={GOAL_HEALTH_OPTIONS} labelRender={(o) => o.label ?? String(o.value)} />
                  </Form.Item>
                </Col>
                <Col span={24}>
                  <Form.Item name="note" label={PERFORMANCE_PAGE_KO.progressUpdateFieldNote}>
                    <Input.TextArea rows={2} className="!tw-rounded-lg" />
                  </Form.Item>
                </Col>
              </Row>
              <Space direction="vertical" className="tw-w-full" size={12}>
                {detailProgressUpdatesQuery.data && detailProgressUpdatesQuery.data.length > 0 ? (
                  <div className="tw-rounded-lg tw-border tw-border-slate-100 tw-bg-slate-50/50 tw-px-3 tw-py-2">
                    <div className="tw-mb-2 tw-text-[11px] tw-font-semibold tw-text-slate-500">
                      {PERFORMANCE_PAGE_KO.progressUpdateRecent}
                    </div>
                    <div className="tw-max-h-36 tw-space-y-2 tw-overflow-y-auto wf-scrollbar-modal">
                      {detailProgressUpdatesQuery.data.slice(0, 6).map((u) => (
                        <div key={u.updateId} className="tw-rounded-md tw-bg-white tw-px-2 tw-py-1.5 tw-text-xs">
                          <span className="tw-font-semibold tw-text-slate-800">{Math.round(u.value)}%</span>
                          <span className="tw-text-slate-500"> · {goalHealthLabel(u.status)}</span>
                          {u.note?.trim() ? <div className="tw-mt-0.5 tw-text-slate-600">{u.note}</div> : null}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </Space>
            </Form>
          </>
        ) : null}
      </AppSingleActionModal>

      <AppSingleActionModal
        title="목표 수정"
        open={goalEditModalOpen && detailGoal != null}
        onClose={() => setGoalEditModalOpen(false)}
        onSubmit={() => goalEditForm.submit()}
        submitText="저장"
        submitLoading={patchGoalMutation.isPending}
        destroyOnHidden
        width={560}
      >
        {detailGoal ? (
          <Form
            form={goalEditForm}
            layout="vertical"
            className="tw-px-5 tw-py-4"
            scrollToFirstError={{ block: 'center', behavior: 'smooth' }}
            onFinish={async (values) => {
              const body: UpdateGoalPayload = {
                title: values.title.trim(),
                description: (values.description ?? '').trim(),
                visibility: values.visibility,
              };
              const parentTrim = String(values.parentGoalId ?? '').trim();
              if (parentTrim) body.parentGoalId = parentTrim;
              const rp = values.rollupPolicy as RollupPolicy | undefined;
              if (rp === 'CHILDREN_AVG' || rp === 'CHILDREN_WEIGHTED') body.rollupPolicy = rp;
              const cyc = values.cycle as KpiCycle | undefined;
              if (cyc === 'MONTHLY' || cyc === 'QUARTERLY' || cyc === 'ANYTIME') body.cycle = cyc;
              patchGoalMutation.mutate(
                { goalId: detailGoal.id, body },
                { onSuccess: () => setGoalEditModalOpen(false) },
              );
            }}
            onFinishFailed={({ errorFields }) => {
              const first = errorFields?.[0];
              if (!first) return;
              goalEditForm.scrollToField(first.name, { block: 'center', behavior: 'smooth' });
            }}
          >
            <Form.Item name="title" label="목표 제목" rules={[{ required: true }, { max: 300 }]}>
              <Input showCount maxLength={300} />
            </Form.Item>
            <Form.Item name="description" label="설명" rules={[{ required: true }, { max: 300 }]}>
              <Input.TextArea rows={3} showCount maxLength={300} />
            </Form.Item>
            <Form.Item name="visibility" label="공개 범위" rules={[{ required: true }]}>
              <Select options={VISIBILITY_OPTIONS} />
            </Form.Item>
            <Form.Item name="parentGoalId" label={PERFORMANCE_PAGE_KO.parentGoalLabel}>
              <Select
                allowClear
                showSearch
                optionFilterProp="label"
                placeholder={PERFORMANCE_PAGE_KO.parentGoalPlaceholder}
                options={goalsList
                  .filter((g) => g.id !== detailGoal.id)
                  .map((g) => {
                    const title = g.title?.trim() ? g.title.trim() : `목표 ${g.id.slice(0, 8)}…`;
                    const isCancelled = String(g.status ?? '').toUpperCase() === 'CANCELLED';
                    return {
                      value: g.id,
                      label: `${title} (${g.startDate} ~ ${g.endDate})${isCancelled ? ' · 취소됨' : ''}`,
                      disabled: isCancelled,
                    };
                  })}
              />
            </Form.Item>
            <Form.Item name="rollupPolicy" label={PERFORMANCE_PAGE_KO.goalRollupPolicyLabel}>
              <Radio.Group
                options={ROLLUP_POLICY_OPTIONS}
                optionType="button"
                buttonStyle="solid"
              />
            </Form.Item>
            <Form.Item name="cycle" label="사이클">
              <Select options={CYCLE_OPTIONS} allowClear />
            </Form.Item>
          </Form>
        ) : null}
      </AppSingleActionModal>

      {/* ── 활성화 승인 요청 모달 ── */}
      <AppDoubleActionModal
        title="활성화 승인 요청"
        open={activationApprovalModalOpen && detailGoal != null}
        onClose={() => setActivationApprovalModalOpen(false)}
        onConfirm={() => activationApprovalForm.submit()}
        confirmText="활성화 승인 요청"
        cancelText="취소"
        confirmLoading={activationApprovalMutation.isPending}
        destroyOnHidden
        width={480}
      >
        {detailGoal ? (
          <Form
            form={activationApprovalForm}
            layout="vertical"
            className="tw-px-5 tw-py-4"
            onFinish={(values) => {
              const approverId = String(values.approverId ?? '').trim();
              if (!approverId) {
                message.warning('승인자를 선택해 주세요.');
                return;
              }
              if (approverId === memberId) {
                message.warning('활성화 승인자는 본인으로 지정할 수 없습니다.');
                return;
              }
              activationApprovalMutation.mutate({
                goalId: detailGoal.id,
                approverId,
              });
            }}
          >
            <div className="tw-mb-4 tw-rounded-xl tw-border tw-border-blue-200/80 tw-bg-blue-50/60 tw-px-4 tw-py-3">
              <div className="tw-text-sm tw-font-semibold tw-text-[#1e3a5f]">{detailGoal.title}</div>
              <div className="tw-mt-2 tw-text-xs tw-text-slate-600">
                이 목표는 <Tag color="blue" className="!tw-m-0 !tw-text-[10px]">활성화 승인</Tag> 이 필요합니다.
                승인자가 승인하면 목표가 「진행 중(ACTIVE)」 상태로 전환됩니다.
              </div>
              <div className="tw-mt-2 tw-grid tw-grid-cols-2 tw-gap-2 tw-text-xs tw-text-slate-600">
                <div>기간: {detailGoal.startDate} ~ {detailGoal.endDate}</div>
                <div>목표값: {Math.round(detailGoal.targetValue ?? 0).toLocaleString()}</div>
              </div>
            </div>

            <Form.Item
              name="approverId"
              label="활성화 승인자"
              rules={[{ required: true, message: '승인자를 선택해 주세요.' }]}
              extra="본인 외 멤버를 지정해 주세요. 승인자에게 알림이 전송됩니다."
            >
              <MemberRemoteSelect placeholder="검색하여 승인자를 선택" />
            </Form.Item>

          </Form>
        ) : null}
      </AppDoubleActionModal>

      {/* ── 완료 제출 모달 ── */}
      <AppDoubleActionModal
        title={detailGoal && policyRequiresCompletion(resolveGoalApprovalPolicy(detailGoal, templates)) ? '목표 완료 승인 제출' : '목표 완료 제출'}
        open={completionSubmitModalOpen && detailGoal != null}
        onClose={() => setCompletionSubmitModalOpen(false)}
        onConfirm={() => completionSubmitForm.submit()}
        cancelText="취소"
        confirmText={detailGoal && policyRequiresCompletion(resolveGoalApprovalPolicy(detailGoal, templates)) ? '완료 승인 요청' : '완료 제출'}
        confirmLoading={completionSubmitMutation.isPending}
        destroyOnHidden
        width={680}
      >
        {detailGoal ? (
          (() => {
            const modalPolicy = resolveGoalApprovalPolicy(detailGoal, templates);
            const modalNeedsApproval = policyRequiresCompletion(modalPolicy);
            return (
          <Form
            form={completionSubmitForm}
            layout="vertical"
            className="tw-px-5 tw-py-4"
            onFinish={async (values) => {
              if (!values.checked1 || !values.checked2 || !values.checked3) {
                message.warning('체크리스트를 모두 확인해 주세요.');
                return;
              }
              const approverId = String(values.approverId ?? '').trim();
              if (modalNeedsApproval && !approverId) {
                message.warning('승인자를 선택해 주세요.');
                return;
              }
              if (modalNeedsApproval && approverId === memberId) {
                message.warning('완료 승인자는 본인으로 지정할 수 없습니다.');
                return;
              }
              const hasSummary = String(values.summary ?? '').trim().length > 0;
              let evidenceFilesSerialized = serializeCompletionEvidence(values.evidenceFileList);
              const filesToUpload = (values.evidenceFileList ?? [])
                .map((f) => f.originFileObj as File | undefined)
                .filter((f): f is File => Boolean(f));
              if (filesToUpload.length > 0) {
                try {
                  const uploadedUrls = await goalApi.uploadCompletionFiles(filesToUpload);
                  evidenceFilesSerialized = JSON.stringify(
                    uploadedUrls.map((url, idx) => ({
                      name: filesToUpload[idx]?.name ?? `file-${idx + 1}`,
                      url,
                    })),
                  );
                } catch (e: unknown) {
                  message.error(e instanceof Error ? e.message : '첨부 파일 업로드에 실패했습니다.');
                  return;
                }
              }
              const hasEvidence = Boolean(evidenceFilesSerialized);
              if (modalNeedsApproval && !hasSummary && !hasEvidence) {
                const ok = window.confirm(
                  '완료 근거(요약/첨부)가 비어 있습니다.\n반려될 가능성이 높을 수 있어요. 그래도 완료 승인 요청을 진행할까요?',
                );
                if (!ok) return;
              }
              if (modalNeedsApproval && !approverId) {
                message.warning('완료 승인자를 선택해 주세요.');
                return;
              }
              try {
                const completionBody = {
                  ...(modalNeedsApproval ? { approverId } : {}),
                  summary: String(values.summary ?? '').trim() || undefined,
                  evidenceFiles: evidenceFilesSerialized,
                };
                await completionSubmitMutation.mutateAsync({
                  goalId: detailGoal.id,
                  body: completionBody,
                });
              } catch {
                // 에러 메시지는 mutation onError에서 처리
              }
            }}
          >
            <div className="tw-mb-4 tw-rounded-xl tw-border tw-border-slate-200/90 tw-bg-slate-50/60 tw-px-4 tw-py-3">
              <div className="tw-text-sm tw-font-semibold tw-text-[#1e3a5f]">{detailGoal.title}</div>
              <div className="tw-mt-2 tw-grid tw-grid-cols-2 tw-gap-2 tw-text-xs tw-text-slate-600">
                <div>기간: {detailGoal.startDate} ~ {detailGoal.endDate}</div>
                <div>현재 달성률: {goalDetailProgressUi(detailGoal).label}</div>
                <div>목표값: {Math.round(detailGoal.targetValue ?? 0).toLocaleString()}</div>
                <div>실제값: {Math.round(detailGoal.actualValue ?? 0).toLocaleString()}</div>
              </div>
            </div>

            {modalNeedsApproval ? (
              <Form.Item
                name="approverId"
                label={
                  <span className="tw-inline-flex tw-items-center tw-gap-2">
                    완료 승인자
                    {detailGoal.completionApproverId ? (
                      <Tag color="blue" className="!tw-m-0 !tw-text-[10px]">
                        목표 생성 시 지정됨
                      </Tag>
                    ) : null}
                  </span>
                }
                rules={[{ required: true, message: '승인자를 선택해 주세요.' }]}
                extra={
                  detailGoal.completionApproverId
                    ? '목표 생성 시 지정한 종료 승인자가 자동으로 채워져 있습니다. 필요한 경우 다른 사람으로 변경할 수 있습니다.'
                    : '완료 승인자는 본인 외 멤버로 지정해 주세요.'
                }
              >
                <MemberRemoteSelect placeholder="검색하여 승인자를 선택" />
              </Form.Item>
            ) : null}
            <Form.Item name="summary" label="완료 보고 요약">
              <Input.TextArea rows={3} placeholder="완료 판단 근거를 간단히 요약해 주세요." />
            </Form.Item>
            <Form.Item
              name="evidenceFileList"
              label="첨부 파일"
              valuePropName="fileList"
              getValueFromEvent={normalizeUploadFileList}
              extra="최대 10개 파일까지 선택할 수 있습니다. 제출 시 파일 업로드 후 URL이 저장됩니다."
            >
              <Upload multiple beforeUpload={() => false} maxCount={10}>
                <Button>파일 선택</Button>
              </Upload>
            </Form.Item>

            <div className="tw-mb-3 tw-rounded-lg tw-border tw-border-slate-200 tw-bg-slate-50/60 tw-px-3 tw-py-2.5">
              <Form.Item name="checked1" valuePropName="checked" className="!tw-mb-2">
                <Checkbox>수치/근거를 최종 검토했습니다.</Checkbox>
              </Form.Item>
              <Form.Item name="checked2" valuePropName="checked" className="!tw-mb-2">
                <Checkbox>첨부 파일에 민감정보가 없음을 확인했습니다.</Checkbox>
              </Form.Item>
              <Form.Item name="checked3" valuePropName="checked" className="!tw-mb-0">
                <Checkbox>반려 시 보완 제출이 필요함을 이해했습니다.</Checkbox>
              </Form.Item>
            </div>

            <div className="tw-grid tw-grid-cols-1 tw-gap-2">
              <Button
                onClick={() => {
                  if (!detailGoal) return;
                  const v = completionSubmitForm.getFieldsValue();
                  setCompletionDraftMap((prev) => ({
                    ...prev,
                    [detailGoal.id]: {
                      summary: String(v.summary ?? '').trim() || undefined,
                      evidenceFiles: serializeCompletionEvidence(v.evidenceFileList),
                      savedAt: dayjs().toISOString(),
                    },
                  }));
                  message.success('완료 제출 임시저장됨');
                }}
                className="!tw-rounded-lg"
              >
                임시저장
              </Button>
            </div>
          </Form>
            );
          })()
        ) : null}
      </AppDoubleActionModal>


      <AppModal
        title={
          detailGoal ? (
            (() => {
              const detailGoalStatusForHeader = goalStatusNorm(detailGoal.status);
              const isDetailOwnerForHeader = detailGoal.ownerType === 'MEMBER' && detailGoal.ownerId === memberId;
              const canEditGoalInHeader =
                (isDetailOwnerForHeader || canUpdate) &&
                detailGoalStatusForHeader !== 'COMPLETED' &&
                detailGoalStatusForHeader !== 'CANCELLED';
              const canCancelInHeader = canUpdate && (detailGoalStatusForHeader === 'DRAFT' || detailGoalStatusForHeader === 'ACTIVE');
              return (
                <div className="tw-min-w-0 tw-pr-2">
                  <div className="tw-text-[11px] tw-font-semibold tw-uppercase tw-tracking-wide tw-text-slate-400">
                    목표 상세
                  </div>
                  <div className="tw-mt-1.5 tw-flex tw-items-start tw-justify-between tw-gap-3">
                    <div className="tw-min-w-0 tw-flex-1 tw-text-xl tw-font-bold tw-leading-snug tw-text-[#1e3a5f] tw-break-words">
                      {detailGoal.title}
                    </div>
                    {(canEditGoalInHeader || canCancelInHeader) ? (
                      <div className="tw-flex tw-shrink-0 tw-items-center tw-gap-1.5">
                        {canEditGoalInHeader ? (
                          <Button
                            size="small"
                            icon={<EditOutlined />}
                            className="!tw-rounded-md !tw-border-slate-200 !tw-bg-white !tw-text-slate-700 hover:!tw-border-slate-300 hover:!tw-text-slate-900"
                            onClick={() => {
                              goalEditForm.setFieldsValue({
                                title: detailGoal.title ?? '',
                                description: detailGoal.description ?? '',
                                visibility: detailGoal.visibility,
                                parentGoalId: detailGoal.parentGoalId ?? undefined,
                                rollupPolicy:
                                  detailGoal.rollupPolicy === 'CHILDREN_AVG' || detailGoal.rollupPolicy === 'CHILDREN_WEIGHTED'
                                    ? detailGoal.rollupPolicy
                                    : undefined,
                                cycle:
                                  detailGoal.cycle === 'MONTHLY' || detailGoal.cycle === 'QUARTERLY' || detailGoal.cycle === 'ANYTIME'
                                    ? detailGoal.cycle
                                    : undefined,
                              });
                              setGoalEditModalOpen(true);
                            }}
                          >
                            목표 수정
                          </Button>
                        ) : null}
                        {canCancelInHeader ? (
                          <Button
                            danger
                            size="small"
                            type="text"
                            icon={<DeleteOutlined />}
                            loading={cancelMutation.isPending}
                            onClick={() => {
                              if (!window.confirm('이 목표를 취소할까요? 취소된 목표는 진행 중 목록에서 제외됩니다.')) return;
                              cancelMutation.mutate(detailGoal.id);
                            }}
                            className="!tw-rounded-md"
                          >
                            목표 취소
                          </Button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })()
          ) : (
            '목표 상세'
          )
        }
        open={detailGoal !== null}
        onCancel={() => setDetailGoal(null)}
        footer={null}
        width={1040}
        destroyOnHidden
        classNames={{
          content: '!tw-overflow-hidden tw-rounded-2xl tw-p-0 tw-shadow-[0_8px_30px_rgba(15,23,42,0.12)]',
          header: '!tw-m-0 tw-border-b tw-border-slate-100 tw-px-6 tw-py-5',
          body: 'tw-px-6 tw-py-5',
        }}
      >
        {detailGoal ? (
          (() => {
            const prog = goalDetailProgressUi(detailGoal);
            const detailGoalStatus = goalStatusNorm(detailGoal.status);
            const approvalFlowStatus = String(detailGoal.approvalStatus ?? detailApprovalQuery.data?.approvalStatus ?? 'NOT_REQUESTED').toUpperCase();
            const isDetailOwner = detailGoal.ownerType === 'MEMBER' && detailGoal.ownerId === memberId;
            // [TEAM 목표] 책임자 또는 참여자면 "본인 목표처럼" 편집·완료요청 가능
            const isTeamResponsible =
              detailGoal.ownerType === 'ORGANIZATION' && detailGoal.responsibleMemberId === memberId;
            const isTeamParticipant =
              detailGoal.ownerType === 'ORGANIZATION'
              && (detailGoal.participantMemberIds ?? []).includes(memberId ?? '');
            const isTeamMember = isTeamResponsible || isTeamParticipant;
            // 활성화: 목표 수정 권한이 있어야 상태를 바꿀 수 있음 (이전: canCreate — 생성 권한과 혼재)
            const canDetailActivate = canUpdate && detailGoalStatus === 'DRAFT';
            const canDetailProgressUpdate =
              (isDetailOwner || isTeamMember || canUpdate) && detailGoalStatus === 'ACTIVE' && detailGoal.autoUpdate === false;
            const canDetailToggleAuto = (isDetailOwner || isTeamResponsible || canUpdate) && detailGoalStatus === 'ACTIVE';
            const detailChildGoals = goalsList.filter((g) => String(g.parentGoalId ?? '').trim() === detailGoal.id);
            const detailEndDayDiff = dayjs(detailGoal.endDate).startOf('day').diff(dayjs().startOf('day'), 'day');
            // 취소: COMPLETED·CANCELLED 상태에서는 불가 (취소는 DRAFT·ACTIVE만)
            const canDetailCancel = canUpdate && (detailGoalStatus === 'DRAFT' || detailGoalStatus === 'ACTIVE');
            // 완료 승인 요청: MEMBER 목표 본인, TEAM 목표 책임자/참여자, 운영 우회(canUpdate)
            const canSubmitCompletion = (isDetailOwner || isTeamMember || canUpdate) && detailGoalStatus === 'ACTIVE';
            const detailPolicy = resolveGoalApprovalPolicy(detailGoal, templates);
            const needsActivationApproval = policyRequiresActivation(detailPolicy);
            const needsCompletionApproval = policyRequiresCompletion(detailPolicy);
            const completionDraft = completionDraftMap[detailGoal.id];
            const isDelayed = detailGoalStatus === 'ACTIVE' && dayjs().startOf('day').isAfter(dayjs(detailGoal.endDate), 'day');
            return (
          <div className="tw-grid tw-grid-cols-1 tw-gap-5 lg:tw-grid-cols-[minmax(0,1.45fr)_minmax(320px,0.95fr)]">
            <div className="tw-flex tw-flex-col tw-gap-4">

            {/* ── 워크플로우 스텝 인디케이터 ── */}
            <div className="tw-rounded-xl tw-border tw-border-slate-200/80 tw-bg-white tw-px-4">
              <GoalWorkflowSteps
                goalStatus={detailGoalStatus}
                approvalFlowStatus={approvalFlowStatus}
                approvalPolicy={detailPolicy}
              />
            </div>

            {/* ── 다음 액션 바 ── */}
            <GoalActionBar
              goalStatus={detailGoalStatus}
              approvalFlowStatus={approvalFlowStatus}
              approvalPolicy={detailPolicy}
              isOwner={isDetailOwner}
              canUpdate={canUpdate}
              onActivate={() => activateMutation.mutate(detailGoal.id)}
              onRequestActivationApproval={() => {
                activationApprovalForm.resetFields();
                // 이미 지정된 승인자가 있으면 프리필
                const existingApprover = detailApprovalQuery.data?.approverId?.trim();
                if (existingApprover) {
                  activationApprovalForm.setFieldsValue({ approverId: existingApprover });
                }
                setActivationApprovalModalOpen(true);
              }}
              onRequestCompletionApproval={() => {
                const d = completionDraftMap[detailGoal.id];
                const draftFiles = deserializeCompletionEvidence(d?.evidenceFiles ?? null);
                const submittedFiles = deserializeCompletionEvidence(detailApprovalQuery.data?.completionEvidenceFiles ?? null);
                // 승인자 프리필 우선순위:
                //  1) 진행 중(PENDING) 번들의 approverId — 재요청/보완 재제출 상황
                //  2) 목표 생성 시 저장된 completionApproverId — 정상 케이스
                //  3) undefined — 사용자가 직접 선택
                const existingApprover = detailApprovalQuery.data?.approverId?.trim();
                const defaultApprover = detailGoal.completionApproverId?.trim();
                completionSubmitForm.setFieldsValue({
                  approverId: existingApprover || defaultApprover || undefined,
                  summary: d?.summary ?? '',
                  evidenceFileList: draftFiles.length > 0 ? draftFiles : submittedFiles,
                  checked1: false,
                  checked2: false,
                  checked3: false,
                });
                setCompletionSubmitModalOpen(true);
              }}
              onOpenApprovalCenter={() => setApprovalHubOpen(true)}
              onDirectComplete={() => directCompleteMutation.mutate(detailGoal.id)}
              onCancel={() => cancelMutation.mutate(detailGoal.id)}
              activateLoading={activateMutation.isPending && activatingGoalId === detailGoal.id}
              activationApprovalLoading={activationApprovalMutation.isPending}
              completionApprovalLoading={completionSubmitMutation.isPending}
              directCompleteLoading={directCompleteMutation.isPending}
              cancelLoading={cancelMutation.isPending}
            />

            {isDelayed ? (
              <Alert
                type="warning"
                showIcon
                icon={<WarningOutlined />}
                message="종료일이 지났습니다."
                description={`종료 예정일(${detailGoal.endDate})이 이미 지났습니다. 목표를 완료 처리하거나 기간을 연장해 주세요.`}
                className="!tw-rounded-xl"
              />
            ) : null}
            {detailGoal.description ? (
              <div className="tw-rounded-2xl tw-border tw-border-slate-200/90 tw-bg-white tw-py-4">
                <div className="tw-mb-2 tw-text-xs tw-font-semibold tw-text-slate-500">설명</div>
                <Paragraph className="!tw-mb-0 !tw-whitespace-pre-wrap !tw-text-sm !tw-leading-relaxed !tw-text-slate-700">
                  {detailGoal.description}
                </Paragraph>
              </div>
            ) : null}
            <div className="tw-rounded-2xl tw-border tw-border-slate-200/90 tw-bg-white tw-py-4">
              <div className="tw-flex tw-flex-wrap tw-items-start tw-justify-between tw-gap-3">
                <div>
                  <div className="tw-text-xs tw-font-semibold tw-text-slate-500">진행</div>
                  <div className="tw-mt-1 tw-flex tw-flex-wrap tw-items-center tw-gap-2">
                    <span className="tw-text-3xl tw-font-bold tw-tabular-nums tw-text-[#1e3a5f]">{prog.label}</span>
                    {detailGoal.healthStatus ? (
                      <Tag className="!tw-m-0">{goalHealthLabel(detailGoal.healthStatus)}</Tag>
                    ) : (
                      <Tag className="!tw-m-0">상태 미지정</Tag>
                    )}
                  </div>
                </div>
                <div className="tw-flex tw-flex-wrap tw-items-center tw-gap-2">
                  {detailGoal.autoUpdate !== false && detailGoalStatus === 'ACTIVE' ? (
                    <Tooltip title={PERFORMANCE_PAGE_KO.autoUpdateTooltip}>
                      <span className="tw-inline-flex tw-h-9 tw-items-center tw-rounded-lg tw-border tw-border-amber-100 tw-bg-amber-50/80 tw-px-2.5">
                        <ThunderboltOutlined className="tw-text-lg tw-text-amber-500" />
                      </span>
                    </Tooltip>
                  ) : null}
                  {canDetailProgressUpdate ? (
                    <Button
                      type="default"
                      icon={<CheckOutlined />}
                      className="!tw-rounded-lg"
                      onClick={() => setGoalProgressUpdateModalOpen(true)}
                    >
                      {PERFORMANCE_PAGE_KO.ctaGoalProgressUpdate}
                    </Button>
                  ) : null}
                </div>
              </div>
              <Progress
                percent={prog.barPct}
                showInfo={false}
                strokeColor={prog.stroke}
                trailColor="rgba(15,23,42,0.06)"
                className="!tw-mt-4 !tw-mb-0"
              />
              <div className="tw-mt-1 tw-flex tw-items-center tw-justify-between tw-gap-2 tw-text-xs tw-tabular-nums tw-text-slate-500">
                <span>0</span>
                <span className="tw-text-center tw-font-medium tw-text-slate-600">
                  {PERFORMANCE_PAGE_KO.goalProgressScaleHint}: {Math.round(detailGoal.actualValue ?? 0).toLocaleString()} /{' '}
                  {Math.round(detailGoal.targetValue ?? 0).toLocaleString()}
                  {detailGoal.unitLabel?.trim() ? ` ${detailGoal.unitLabel.trim()}` : ''}
                </span>
                <span>{Math.round(detailGoal.targetValue ?? 0).toLocaleString()}</span>
              </div>
              <div className="tw-mt-4 tw-border-t tw-border-slate-100 tw-pt-3">
                <div className="tw-mb-2 tw-text-xs tw-font-semibold tw-text-slate-500">집계 방식</div>
                {canDetailToggleAuto ? (
                  <Tooltip title={PERFORMANCE_PAGE_KO.autoUpdateTooltip}>
                    <Space size="middle" className="tw-items-center">
                      <ThunderboltOutlined className="tw-text-amber-500" />
                      <span className="tw-text-sm tw-text-slate-700">자동 집계</span>
                      <Switch
                        checked={detailGoal.autoUpdate !== false}
                        loading={patchGoalMutation.isPending}
                        onChange={(checked) =>
                          patchGoalMutation.mutate({ goalId: detailGoal.id, body: { autoUpdate: checked } })
                        }
                      />
                    </Space>
                  </Tooltip>
                ) : (
                  <Text type="secondary" className="!tw-mb-0 !tw-block !tw-text-xs">
                    자동 집계: {detailGoal.autoUpdate === false ? '꺼짐 — 「업데이트」로 진행률을 직접 반영할 수 있어요.' : '켜짐'}
                  </Text>
                )}
                {detailGoalStatus === 'ACTIVE' && detailGoal.autoUpdate !== false ? (
                  <Paragraph type="secondary" className="!tw-mb-0 !tw-mt-2 !tw-text-xs">
                    자동 집계가 켜져 있을 때는 진행률이 하위·실적을 따라갑니다. 하위 목표에서 수치를 맞추거나, 자동 집계를 끈 뒤 「업데이트」를
                    사용하세요.
                  </Paragraph>
                ) : null}
              </div>
            </div>

            {/* 완료 제출 / 직접 완료 액션은 상단 GoalActionBar가 대체 */}

            {detailApprovalQuery.data?.requestId ? (
              <div className="tw-rounded-2xl tw-border tw-border-slate-200/90 tw-bg-white tw-py-4">
                <div className="tw-text-xs tw-font-semibold tw-text-slate-500">최근 완료 제출 내역</div>
                <div className="tw-mt-2 tw-space-y-2">
                  <div className="tw-text-xs tw-text-slate-500">
                    요청 ID: <span className="tw-font-medium tw-text-slate-700">{detailApprovalQuery.data.requestId}</span>
                  </div>
                  <div className="tw-text-xs tw-text-slate-500">
                    상태: <span className="tw-font-medium tw-text-slate-700">{detailApprovalQuery.data.approvalStatus}</span>
                  </div>
                  <div className="tw-text-xs tw-text-slate-500">
                    승인자:{' '}
                    <span className="tw-font-medium tw-text-slate-700">
                      {memberLabelForUi(detailApprovalQuery.data.approverId)}
                    </span>
                  </div>
                  {detailApprovalQuery.data.completionSummary ? (
                    <div>
                      <div className="tw-text-xs tw-font-semibold tw-text-slate-500">완료 보고 요약</div>
                      <div className="tw-mt-1 tw-whitespace-pre-wrap tw-text-sm tw-text-slate-700">
                        {detailApprovalQuery.data.completionSummary}
                      </div>
                    </div>
                  ) : null}
                  {detailApprovalQuery.data.completionEvidenceFiles ? (
                    <div>
                      <div className="tw-text-xs tw-font-semibold tw-text-slate-500">첨부 파일</div>
                      <div className="tw-mt-1 tw-whitespace-pre-wrap tw-text-sm tw-text-slate-700">
                        {completionEvidencePreview(detailApprovalQuery.data.completionEvidenceFiles)}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}

            {detailGoal.parentGoalId ? (() => {
              const pid = String(detailGoal.parentGoalId).trim();
              const p = goalsList.find((g) => g.id === pid);
              const title = p?.title?.trim() ? p.title.trim() : PERFORMANCE_PAGE_KO.parentGoalUnknown;
              return (
                <div className="tw-rounded-2xl tw-border tw-border-slate-200/90 tw-bg-white tw-py-4">
                  <div className="tw-text-xs tw-font-semibold tw-text-slate-500">
                    {PERFORMANCE_PAGE_KO.parentGoalLabel}
                  </div>
                  <div className="tw-mt-2 tw-break-words tw-text-sm tw-font-medium tw-text-slate-800">
                    {p ? (
                      <button
                        type="button"
                        className="tw-m-0 tw-border-0 tw-bg-transparent tw-p-0 tw-text-left tw-font-medium tw-text-[#1e3a5f] hover:tw-underline"
                        onClick={() => setDetailGoal(p)}
                      >
                        {title}
                      </button>
                    ) : (
                      <span>{title}</span>
                    )}
                  </div>
                </div>
              );
            })() : null}

            <div className="tw-rounded-2xl tw-border tw-border-slate-200/90 tw-bg-white tw-py-4">
              <div className="tw-mb-2 tw-text-xs tw-font-semibold tw-text-slate-500">
                {PERFORMANCE_PAGE_KO.subGoalsHeading}
              </div>
              {detailChildGoals.length === 0 ? (
                <Text type="secondary" className="!tw-mb-0 !tw-block !tw-text-xs">
                  {PERFORMANCE_PAGE_KO.subGoalsEmpty}
                </Text>
              ) : (
                <div className="tw-space-y-2">
                  {detailChildGoals.map((cg) => {
                    const subProg = goalDetailProgressUi(cg);
                    return (
                      <div
                        key={cg.id}
                        className="tw-flex tw-items-center tw-justify-between tw-gap-3 tw-rounded-lg tw-border tw-border-slate-200/90 tw-bg-slate-50/60 tw-px-3 tw-py-2.5"
                      >
                        <button
                          type="button"
                          className="tw-m-0 tw-min-w-0 tw-flex-1 tw-truncate tw-border-0 tw-bg-transparent tw-p-0 tw-text-left tw-text-sm tw-font-medium tw-text-[#1e3a5f] hover:tw-underline"
                          onClick={() => setDetailGoal(cg)}
                        >
                          {cg.title}
                        </button>
                        <span className="tw-shrink-0 tw-text-sm tw-font-bold tw-tabular-nums tw-text-[#1e3a5f]">
                          {subProg.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            

            </div>
            <div className="tw-border-t tw-border-slate-200 tw-pt-5 lg:tw-border-0 lg:tw-pl-2 lg:tw-pt-0">
              <div className="tw-rounded-2xl tw-border tw-border-slate-200/90 tw-bg-white tw-px-5 tw-py-4">
                <div className="tw-flex tw-items-center tw-justify-between tw-gap-2">
                  <Text className="!tw-m-0 !tw-text-sm !tw-font-semibold !tw-text-slate-800">목표 정보</Text>
                </div>
                <div className="tw-mt-3 tw-grid tw-grid-cols-1 tw-gap-2">
                  <div className="tw-flex tw-items-center tw-justify-between tw-gap-2 tw-text-xs">
                    <span className="tw-text-slate-500">담당 주체</span>
                    <span className="tw-font-medium tw-text-slate-800">{formatGoalOwner(detailGoal)}</span>
                  </div>
                  <div className="tw-flex tw-items-center tw-justify-between tw-gap-2 tw-text-xs">
                    <span className="tw-text-slate-500">사이클</span>
                    <span className="tw-font-medium tw-text-slate-800">
                      {CYCLE_OPTIONS.find((o) => o.value === detailGoal.cycle)?.label ?? detailGoal.cycle ?? '—'}
                    </span>
                  </div>
                  <div className="tw-flex tw-items-center tw-justify-between tw-gap-2 tw-text-xs">
                    <span className="tw-text-slate-500">목표 기간</span>
                    <div className="tw-flex tw-items-center tw-gap-1.5">
                      {detailGoalStatus === 'ACTIVE' ? (
                        detailEndDayDiff >= 0 ? (
                          <Tag className="!tw-m-0 tw-border-slate-200 tw-bg-white">
                            {PERFORMANCE_PAGE_KO.periodRemainPrefix}
                            {detailEndDayDiff}
                          </Tag>
                        ) : (
                          <Tag color="error" className="!tw-m-0">
                            {PERFORMANCE_PAGE_KO.periodOverdue} {Math.abs(detailEndDayDiff)}일
                          </Tag>
                        )
                      ) : null}
                      <span className="tw-font-medium tw-text-slate-800">
                        {detailGoal.startDate} - {detailGoal.endDate}
                      </span>
                    </div>
                  </div>
                  <div className="tw-flex tw-items-center tw-justify-between tw-gap-2 tw-text-xs">
                    <span className="tw-text-slate-500">공개 범위</span>
                    <span className="tw-font-medium tw-text-slate-800">
                      {VISIBILITY_OPTIONS.find((o) => o.value === detailGoal.visibility)?.label ?? detailGoal.visibility}
                    </span>
                  </div>
                  <div className="tw-mt-1 tw-grid tw-grid-cols-2 tw-gap-2">
                    <div className="tw-rounded-md tw-bg-slate-50 tw-px-2.5 tw-py-2">
                      <div className="tw-text-[11px] tw-font-medium tw-text-slate-500">측정</div>
                      <div className="tw-mt-0.5 tw-text-xs tw-font-semibold tw-text-slate-800">
                        {MEASURE_OPTIONS.find((o) => o.value === detailGoal.measureType)?.label ?? detailGoal.measureType}
                      </div>
                    </div>
                    <div className="tw-rounded-md tw-bg-slate-50 tw-px-2.5 tw-py-2">
                      <div className="tw-text-[11px] tw-font-medium tw-text-slate-500">단위 유형</div>
                      <div className="tw-mt-0.5 tw-text-xs tw-font-semibold tw-text-slate-800">
                        {UNIT_OPTIONS.find((o) => o.value === detailGoal.unitType)?.label ?? detailGoal.unitType}
                      </div>
                    </div>
                    <div className="tw-rounded-md tw-bg-slate-50 tw-px-2.5 tw-py-2">
                      <div className="tw-text-[11px] tw-font-medium tw-text-slate-500">단위 표시명</div>
                      <div className="tw-mt-0.5 tw-text-xs tw-font-semibold tw-text-slate-800">
                        {detailGoal.unitLabel?.trim() || '—'}
                      </div>
                    </div>
                    <div className="tw-rounded-md tw-bg-slate-50 tw-px-2.5 tw-py-2">
                      <div className="tw-text-[11px] tw-font-medium tw-text-slate-500">상한</div>
                      <div className="tw-mt-0.5 tw-text-xs tw-font-semibold tw-tabular-nums tw-text-slate-800">
                        {detailGoal.capPct != null ? `${detailGoal.capPct}%` : '—'}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="tw-mb-3 tw-mt-4 tw-rounded-2xl tw-border tw-border-slate-200/90 tw-bg-white tw-px-5 tw-py-4">
                <div className="tw-flex tw-items-center tw-justify-between tw-gap-2">
                  <Text className="!tw-m-0 !tw-text-sm !tw-font-semibold !tw-text-slate-800">코멘트 내역</Text>
                  {(detailCommentsQuery.data?.length ?? 0) > 0 ? (
                    <Tag className="!tw-m-0 tw-border-slate-200 tw-bg-slate-50 tw-text-xs tw-text-slate-600">
                      {detailCommentsQuery.data?.length ?? 0}건
                    </Tag>
                  ) : null}
                </div>
                <div className="tw-mt-3 tw-rounded-xl tw-border tw-border-slate-200/90 tw-bg-slate-50/60 tw-px-3.5 tw-py-3">
                  {detailCommentsQuery.isPending ? <Spin size="small" className="tw-mb-2" /> : null}
                  {(detailCommentsQuery.data?.length ?? 0) === 0 && !detailCommentsQuery.isPending ? (
                    <Text type="secondary" className="!tw-mb-2 !tw-block !tw-text-xs">
                      등록된 코멘트가 없습니다.
                    </Text>
                  ) : null}
                  <div className="tw-space-y-2">
                    {(commentsExpanded
                      ? (detailCommentsQuery.data ?? [])
                      : (detailCommentsQuery.data ?? []).slice(0, COMMENT_DETAIL_PREVIEW)
                    ).map((c) => (
                      <div key={c.commentId} className="tw-rounded-lg tw-border tw-border-slate-200 tw-bg-white tw-px-3 tw-py-2.5">
                        <div className="tw-text-[11px] tw-font-medium tw-text-slate-500">
                          <Tooltip title={c.authorId}>{memberLabelForUi(c.authorId)}</Tooltip>
                          {c.createdAt ? <span className="tw-text-slate-400"> · {c.createdAt}</span> : null}
                        </div>
                        <Paragraph className="!tw-mb-0 !tw-mt-1 !tw-whitespace-pre-wrap !tw-text-sm !tw-leading-relaxed !tw-text-slate-700">
                          {c.body}
                        </Paragraph>
                        <div className="tw-mt-2 tw-flex tw-flex-wrap tw-gap-1.5">
                          {['👍', '👏', '🔥', '✅'].map((emoji) => {
                            const reactions = parseCommentReactions(c.reactionsJson);
                            const row = reactions.find((r) => r.emoji === emoji);
                            const count = row?.memberIds.length ?? 0;
                            const mine = (row?.memberIds ?? []).includes(memberId);
                            return (
                              <Button
                                key={`${c.commentId}-${emoji}`}
                                size="small"
                                className={`!tw-h-6 !tw-rounded-full !tw-px-2.5 !tw-text-xs ${
                                  mine
                                    ? '!tw-border-blue-300 !tw-bg-blue-50 !tw-text-blue-700'
                                    : '!tw-border-slate-200 !tw-bg-white !tw-text-slate-600'
                                }`}
                                loading={toggleCommentReactionMutation.isPending}
                                onClick={() => toggleCommentReactionMutation.mutate({ goalId: detailGoal.id, commentId: c.commentId, emoji })}
                              >
                                {emoji} {count > 0 ? count : ''}
                              </Button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                  {(detailCommentsQuery.data?.length ?? 0) > COMMENT_DETAIL_PREVIEW ? (
                    <div className="tw-mt-2 tw-flex tw-justify-center">
                      <Button
                        size="small"
                        className="!tw-h-8 !tw-rounded-md !tw-border !tw-border-slate-200 !tw-bg-white !tw-px-6 !tw-text-sm !tw-font-semibold !tw-text-slate-700 hover:!tw-border-slate-300 hover:!tw-text-slate-900"
                        onClick={() => setCommentsExpanded((v) => !v)}
                      >
                        {commentsExpanded ? PERFORMANCE_PAGE_KO.activityShowLess : PERFORMANCE_PAGE_KO.activityShowMore}
                      </Button>
                    </div>
                  ) : null}
                  <div className="tw-mt-3 tw-border-t tw-border-slate-200 tw-pt-3">
                    {canCreate ? (
                      <div className="tw-flex tw-gap-2">
                        <Input.TextArea
                          rows={2}
                          value={goalCommentDraft}
                          onChange={(e) => setGoalCommentDraft(e.target.value)}
                          placeholder="현재 상황을 코멘트로 공유해보세요"
                          className="!tw-h-[84px] !tw-rounded-lg !tw-resize-none"
                        />
                        <Button
                          type="primary"
                          className="!tw-h-auto !tw-rounded-lg !tw-bg-[#1e3a5f] hover:!tw-bg-[#152a45]"
                          disabled={!goalCommentDraft.trim()}
                          loading={createGoalCommentMutation.isPending}
                          onClick={() => {
                            const t = goalCommentDraft.trim();
                            if (!t) return;
                            createGoalCommentMutation.mutate({ goalId: detailGoal.id, body: t });
                          }}
                        >
                          등록
                        </Button>
                      </div>
                    ) : (
                      <Text type="secondary" className="!tw-block !tw-text-xs">
                        댓글 등록은 목표 생성 권한이 있는 계정만 가능합니다.
                      </Text>
                    )}
                  </div>
                </div>
                <div className="tw-mt-4 tw-flex tw-items-center tw-justify-between tw-gap-2">
                  <Text className="!tw-m-0 !tw-text-sm !tw-font-semibold !tw-text-slate-800">활동 로그</Text>
                </div>
                {detailActivitiesQuery.isPending ? (
                  <div className="tw-flex tw-justify-center tw-py-8">
                    <Spin size="small" />
                  </div>
                ) : sortedDetailActivities.length > 0 ? (
                  <>
                    <div
                      className="tw-mt-2 tw-space-y-2"
                    >
                      {(activitiesExpanded
                        ? sortedDetailActivities
                        : sortedDetailActivities.slice(0, ACTIVITY_DETAIL_PREVIEW)).map((row) => {
                        const rel = activityCreatedRelative(row.createdAt);
                        const abs = activityCreatedAbsolute(row.createdAt);
                        const ui = activityUi(row.type);
                        const actor = row.actorId?.trim();
                        const actorName = !actor || actor.toLowerCase() === 'system' ? '시스템' : memberLabelForUi(actor);
                        return (
                          <div key={row.activityId} className={`tw-rounded-xl tw-border tw-px-3.5 tw-py-3 ${ui.cardClass}`}>
                            <div className={`tw-inline-flex tw-items-center tw-gap-1.5 tw-rounded-full tw-px-2 tw-py-0.5 tw-text-xs tw-font-semibold ${ui.badgeClass}`}>
                              {ui.icon}
                              {ui.label}
                            </div>
                            <div className="tw-mt-1.5 tw-whitespace-pre-wrap tw-text-sm tw-leading-relaxed tw-text-slate-700">
                              {row.summary || '내용 없음'}
                            </div>
                            <div className="tw-mt-1.5 tw-flex tw-items-center tw-gap-1 tw-text-[11px] tw-text-slate-500">
                              {actorName}
                              {rel || abs ? (
                                <Tooltip title={abs || undefined}>
                                  <span className="tw-cursor-default">{rel ? ` · ${rel}` : abs ? ` · ${abs}` : ''}</span>
                                </Tooltip>
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {sortedDetailActivities.length > ACTIVITY_DETAIL_PREVIEW ? (
                      <div className="tw-mt-2 tw-flex tw-justify-center">
                        <Button
                          size="small"
                          className="!tw-h-8 !tw-rounded-md !tw-border !tw-border-slate-200 !tw-bg-white !tw-px-6 !tw-text-sm !tw-font-semibold !tw-text-slate-700 hover:!tw-border-slate-300 hover:!tw-text-slate-900"
                          onClick={() => setActivitiesExpanded((v) => !v)}
                        >
                          {activitiesExpanded ? PERFORMANCE_PAGE_KO.activityShowLess : PERFORMANCE_PAGE_KO.activityShowMore}
                        </Button>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <Text type="secondary" className="!tw-mt-1 !tw-block !tw-text-xs">
                    {PERFORMANCE_PAGE_KO.activityEmpty}
                  </Text>
                )}
              </div>
            </div>
          </div>
            );
          })()
        ) : null}
      </AppModal>
      <SingleMemberOrgChartSelectModal
        open={goalMemberPickerField != null}
        title={goalMemberPickerField === 'responsibleMemberId' ? '조직도에서 목표 책임자 선택' : '조직도에서 담당 구성원 선택'}
        selectedMemberId={
          goalMemberPickerField
            ? String(goalForm.getFieldValue(goalMemberPickerField) ?? '')
            : undefined
        }
        onClose={() => setGoalMemberPickerField(null)}
        onSelect={({ memberId: selectedId, name }) => {
          if (!goalMemberPickerField) return;
          goalForm.setFieldValue(goalMemberPickerField, selectedId);
          message.success(`${name} 구성원을 선택했습니다.`);
          setGoalMemberPickerField(null);
        }}
      />
      <OrganizationTreeSelectModal
        open={goalOrgPickerOpen}
        rows={organizationRowsFlat}
        selectedOrganizationId={goalOrganizationOwnerId}
        onClose={() => setGoalOrgPickerOpen(false)}
        onSelect={(organizationId) => {
          goalForm.setFieldValue('organizationOwnerId', organizationId);
          setGoalOrgPickerOpen(false);
        }}
      />
    </div>
  );
}

export default PerformancePage
