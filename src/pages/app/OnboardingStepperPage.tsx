import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type Key,
  type ReactNode,
  type RefObject,
} from 'react';
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import {
  App,
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Popconfirm,
  Popover,
  Progress,
  Radio,
  Space,
  Spin,
  Table,
  Tag,
  Tooltip,
  Tree,
  Typography,
  Upload,
} from 'antd';
import type { DataNode } from 'antd/es/tree';
import type { UploadProps } from 'antd';
import {
  ApartmentOutlined,
  CalendarOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloudUploadOutlined,
  DeleteOutlined,
  EditOutlined,
  ExperimentOutlined,
  FileTextOutlined,
  HolderOutlined,
  InboxOutlined,
  PlusOutlined,
  RightOutlined,
  RocketOutlined,
  SafetyCertificateOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { APP_POST_LOGIN_PATH } from '@/app/config/paths';
import { memberApi } from '@/features/member/api/memberApi';
import { aiApi } from '@/features/ai/api/aiApi';
import { esgApi } from '@/features/esg/api/esgApi';
import { organizationApi } from '@/features/organization/api/organizationApi';
import { OrganizationRolesSection } from '@/features/organization/ui/OrganizationRolesSection';
import type { OrganizationTreeNode } from '@/features/organization/api/organizationApi';
import { AppButton } from '@/shared/ui/AppButton';
import { AppDoubleActionModal } from '@/shared/ui/AppDoubleActionModal';
import { ApprovalsAdminPage } from '@/pages/app/ApprovalsAdminPage';
import { AdminCompanyHolidaysPage } from '@/pages/app/salary-service/admin/AdminCompanyHolidaysPage';
import { AdminSalarySettingsPage } from '@/pages/app/salary-service/admin/AdminSalarySettingsPage';
import { AdminWorkSchedulesPage } from '@/pages/app/salary-service/admin/AdminWorkSchedulesPage';
import { AdminOvertimePoliciesPage } from '@/pages/app/salary-service/admin/AdminOvertimePoliciesPage';
import { AdminLeavePoliciesPage } from '@/pages/app/salary-service/admin/AdminLeavePoliciesPage';
import { AdminRetirementPolicyPage } from '@/pages/app/salary-service/admin/AdminRetirementPolicyPage';
import { AdminBonusPolicyPage } from '@/pages/app/salary-service/admin/AdminBonusPolicyPage';

type StepStatus = 'pending' | 'completed' | 'skipped';
type JobSettingModalState =
  | null
  | { mode: 'create' }
  | { mode: 'edit'; id: string; displayOrder: number };
type JobSettingRow = {
  key: string;
  id: string;
  name: string;
  displayOrder: number;
};

type OnboardingStep = {
  title: string;
  icon: ReactNode;
  apis: string[];
};

type SectionHeaderProps = {
  icon?: ReactNode;
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  compact?: boolean;
};

const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    title: '조직 설정',
    icon: <ApartmentOutlined />,
    apis: ['POST /organization/create'],
  },
  {
    title: '직급/직책 설정',
    icon: <TeamOutlined />,
    apis: ['POST /organization/job-grade/create', 'POST /organization/job-title/create'],
  },
  {
    title: '역할/권한 설정',
    icon: <SafetyCertificateOutlined />,
    apis: ['POST /member/role/create'],
  },
  {
    title: '근무/급여 정책',
    icon: <ClockCircleOutlined />,
    apis: [
      'POST /salary/taxRate',
      'POST /salary/salary-item-templates',
      'POST /salary/salary-policies',
      'POST /work-schedules',
      'POST /attendance/overtime-policies',
      'POST /leave-policies',
      'POST /salary/retirement-policy',
      'POST /salary/bonus-policy',
    ],
  },
  {
    title: '공휴일 설정',
    icon: <CalendarOutlined />,
    apis: [
      'GET /company-holidays',
      'POST /company-holidays',
      'PATCH /company-holidays/{id}',
      'DELETE /company-holidays/{id}',
    ],
  },
  {
    title: '전자결재 양식',
    icon: <FileTextOutlined />,
    apis: ['POST /approval/documents'],
  },
  {
    title: 'ESG 그린장터',
    icon: <ExperimentOutlined />,
    apis: ['PUT /esg/config', 'POST /esg/subjects', 'POST /esg/shop/items'],
  },
  {
    title: 'HR 정책 문서 업로드',
    icon: <CloudUploadOutlined />,
    apis: ['POST /ai/documents/upload'],
  },
];

const INITIAL_STEP_STATUS: StepStatus[] = ONBOARDING_STEPS.map(() => 'pending');
/** 조직 설정 가이드 Popover(2·3단계): 뷰포트 기준으로 위치 보정 */
const ORG_GUIDE_POPOVER_SHARED = {
  getPopupContainer: (trigger: HTMLElement) => trigger.parentElement ?? document.body,
  autoAdjustOverflow: { adjustX: 1 as const, adjustY: 1 as const },
  styles: { body: { maxWidth: 320 } },
} as const;
/** 1단계 안내: Popover 대신 트리 위 인라인(동일 320px 폭, 화면 밖 좌표 버그 방지) */
const ORG_GUIDE_CALLOUT_CLASS =
  'tw-w-full tw-rounded-xl tw-border tw-border-solid tw-border-blue-100 tw-bg-blue-50/70';
const HR_DOC_MAX_BYTES = 10 * 1024 * 1024;
const HR_DOC_ACCEPT_EXT = /\.(pdf|docx|txt)$/i;
const ONBOARDING_PANEL_CLASS = 'tw-border-slate-200/80 tw-shadow-sm [&_.ant-card-body]:tw-p-3';
const ONBOARDING_TABLE_CLASS = 'tw-overflow-hidden tw-rounded-lg tw-border tw-border-slate-200/90';
const ONBOARDING_TABLE_HEADER_CLASS =
  'tw-grid tw-min-h-9 tw-items-center tw-bg-slate-50/90 tw-px-3 tw-text-xs tw-font-semibold tw-text-slate-500';

function validateHrDocFile(file: File): string | null {
  if (!HR_DOC_ACCEPT_EXT.test(file.name)) {
    return '지원 형식은 pdf, docx, txt 입니다.';
  }
  if (file.size > HR_DOC_MAX_BYTES) {
    return '파일 크기는 10MB 이하여야 합니다.';
  }
  return null;
}

function pickOrgId(node: OrganizationTreeNode): string {
  const raw =
    node.id ??
    node.organizationId ??
    node.organization_id ??
    node.uuid ??
    node.organizationUuid ??
    node.organization_uuid;
  if (typeof raw === 'string' && raw) return raw;
  if (typeof raw === 'number') return String(raw);
  return '';
}

function pickOrgName(node: OrganizationTreeNode): string {
  return typeof node.name === 'string' ? node.name : '';
}

function pickParentId(node: OrganizationTreeNode): string | null {
  const p = node.parentId ?? node.parent_id;
  if (p === null || p === undefined || p === '') return null;
  return typeof p === 'string' ? p : String(p);
}

function toTreeNodes(nodes: OrganizationTreeNode[]): DataNode[] {
  if (!nodes.length) return [];
  const nested = nodes.some(
    (n) => Array.isArray(n.children) && (n.children as unknown[]).length > 0,
  );
  if (nested) {
    const mapOne = (n: OrganizationTreeNode, index: number): DataNode => {
      const id = pickOrgId(n);
      const ch = n.children as OrganizationTreeNode[] | undefined;
      return {
        key: id || `org-nested-${index}`,
        title: pickOrgName(n) || '(이름 없음)',
        children: Array.isArray(ch) ? ch.map((c, i) => mapOne(c, i)) : undefined,
      };
    };
    return nodes.map((n, i) => mapOne(n, i));
  }

  const byId = new Map<string, DataNode & { parentId: string | null }>();
  nodes.forEach((n) => {
    const id = pickOrgId(n);
    if (!id) return;
    byId.set(id, {
      key: id,
      title: pickOrgName(n) || '(이름 없음)',
      children: [],
      parentId: pickParentId(n),
    });
  });
  const roots: DataNode[] = [];
  byId.forEach((node) => {
    const p = node.parentId;
    if (p && byId.has(p)) {
      const parent = byId.get(p)!;
      if (!parent.children) parent.children = [];
      (parent.children as DataNode[]).push(node);
    } else {
      roots.push(node);
    }
  });
  return roots;
}

function stepTag(status: StepStatus) {
  if (status === 'completed') {
    return (
      <Tag className="!tw-m-0 !tw-rounded-full !tw-border-emerald-200 !tw-bg-emerald-50 !tw-px-2.5 !tw-py-0.5 !tw-font-semibold !tw-text-emerald-700">
        완료
      </Tag>
    );
  }
  if (status === 'skipped') {
    return (
      <Tag className="!tw-m-0 !tw-rounded-full !tw-border-slate-200 !tw-bg-slate-50 !tw-px-2.5 !tw-py-0.5 !tw-font-semibold !tw-text-slate-500">
        스킵
      </Tag>
    );
  }
  return (
    <Tag className="!tw-m-0 !tw-rounded-full !tw-border-blue-100 !tw-bg-blue-50 !tw-px-2.5 !tw-py-0.5 !tw-font-semibold !tw-text-[#2563EB]">
      진행 전
    </Tag>
  );
}

function getStepTone(status: StepStatus, active: boolean) {
  if (active) {
    return {
      item: 'tw-border-[#2563EB] tw-bg-white tw-shadow-[0_10px_24px_rgba(37,99,235,0.16)]',
      icon: 'tw-bg-[#2563EB] tw-text-white',
      title: 'tw-text-[#1e3a5f]',
      meta: 'tw-text-[#2563EB]',
    };
  }
  if (status === 'completed') {
    return {
      item: 'tw-border-emerald-100 tw-bg-emerald-50/60 hover:tw-border-emerald-200',
      icon: 'tw-bg-emerald-600 tw-text-white',
      title: 'tw-text-emerald-900',
      meta: 'tw-text-emerald-600',
    };
  }
  if (status === 'skipped') {
    return {
      item: 'tw-border-slate-200 tw-bg-slate-50/80 hover:tw-border-slate-300',
      icon: 'tw-bg-slate-200 tw-text-slate-500',
      title: 'tw-text-slate-500',
      meta: 'tw-text-slate-400',
    };
  }
  return {
    item: 'tw-border-slate-200/90 tw-bg-white hover:tw-border-blue-200 hover:tw-bg-blue-50/30',
    icon: 'tw-bg-slate-100 tw-text-slate-500',
    title: 'tw-text-slate-700',
    meta: 'tw-text-slate-400',
  };
}

function collectBranchKeys(nodes: DataNode[]): Key[] {
  return nodes.flatMap((node) => {
    const children = Array.isArray(node.children) ? node.children : [];
    return children.length > 0 ? [node.key as Key, ...collectBranchKeys(children)] : [];
  });
}

function pickRowId(row: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const raw = row[key];
    if (typeof raw === 'string' && raw.trim()) return raw.trim();
    if (typeof raw === 'number' && Number.isFinite(raw)) return String(raw);
  }
  return '';
}

function pickRowName(row: Record<string, unknown>): string {
  const raw =
    row.name ?? row.jobGradeName ?? row.job_grade_name ?? row.jobTitleName ?? row.job_title_name;
  return typeof raw === 'string' ? raw : '';
}

function pickRowDisplayOrder(row: Record<string, unknown>): number | null {
  const raw = row.displayOrder ?? row.display_order;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string' && raw.trim() !== '') {
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function toJobSettingRows(
  rows: Array<Record<string, unknown>>,
  idKeys: string[],
  fallbackPrefix: string,
): JobSettingRow[] {
  return rows
    .map((row, index) => {
      const id = pickRowId(row, idKeys);
      return {
        key: id || `${fallbackPrefix}-${index}`,
        id,
        name: pickRowName(row),
        displayOrder: pickRowDisplayOrder(row) ?? index,
      };
    })
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .map((row, index) => ({ ...row, displayOrder: index }));
}

function SortableJobSettingRow({
  row,
  index,
  label,
  onEdit,
  onDelete,
}: {
  row: JobSettingRow;
  index: number;
  label: '직급' | '직책';
  onEdit: (row: JobSettingRow) => void;
  onDelete: (row: JobSettingRow) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: row.key,
  });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`tw-grid tw-min-h-14 tw-grid-cols-[44px_1fr_92px_96px] tw-items-center tw-border-t tw-border-slate-100 tw-bg-white tw-px-3 tw-text-sm tw-text-slate-700 ${
        isDragging ? 'tw-relative tw-z-10 tw-shadow-lg' : ''
      }`}
    >
      <button
        type="button"
        className="tw-flex tw-h-7 tw-w-7 tw-cursor-grab tw-items-center tw-justify-center tw-rounded-md tw-border-0 tw-bg-transparent tw-p-0 tw-text-slate-400 tw-shadow-none hover:tw-bg-transparent hover:tw-text-slate-600 focus:tw-border-0 focus:tw-bg-transparent focus:tw-outline-none active:tw-cursor-grabbing"
        aria-label={`${label} 순서 이동`}
        {...attributes}
        {...listeners}
      >
        <HolderOutlined className="tw-text-slate-400" />
      </button>
      <div className="tw-min-w-0 tw-truncate tw-font-medium tw-text-slate-900">
        {row.name || '(이름 없음)'}
      </div>
      <div className="tw-text-slate-600">{index}</div>
      <div className="tw-flex tw-justify-end tw-gap-1">
        <Tooltip title="수정">
          <Button
            type="text"
            size="small"
            icon={<EditOutlined />}
            aria-label={`${row.name} ${label} 수정`}
            className="!tw-inline-flex !tw-items-center !tw-justify-center !tw-text-slate-600 hover:!tw-bg-slate-100 hover:!tw-text-slate-900"
            disabled={!row.id}
            onClick={() => onEdit(row)}
          />
        </Tooltip>
        <Tooltip title="삭제">
          <Button
            type="text"
            size="small"
            danger
            icon={<DeleteOutlined />}
            aria-label={`${row.name} ${label} 삭제`}
            className="!tw-inline-flex !tw-items-center !tw-justify-center"
            disabled={!row.id}
            onClick={() => onDelete(row)}
          />
        </Tooltip>
      </div>
    </div>
  );
}

function scrollNearestContainerToBottom(anchor: HTMLElement | null) {
  if (!anchor || typeof window === 'undefined') return;

  let node = anchor.parentElement;
  while (node) {
    const { overflowY } = window.getComputedStyle(node);
    if (overflowY === 'auto' || overflowY === 'scroll') {
      node.scrollTop = node.scrollHeight;
      node.scrollTo({ top: node.scrollHeight, behavior: 'auto' });
      return;
    }
    node = node.parentElement;
  }
}

function asPretty(value: unknown) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value ?? '');
  }
}

function JsonPreviewCard({ title, rows }: { title: string; rows: unknown[] }) {
  return (
    <Card
      size="small"
      className={ONBOARDING_PANEL_CLASS}
      title={<SectionHeader title={title} compact />}
    >
      <pre className="tw-m-0 tw-max-h-56 tw-overflow-auto tw-text-xs">{asPretty(rows)}</pre>
    </Card>
  );
}

function SectionHeader({
  icon,
  eyebrow,
  title,
  description,
  actions,
  compact = false,
}: SectionHeaderProps) {
  return (
    <div
      className={`tw-flex tw-min-w-0 tw-flex-wrap tw-items-start tw-justify-between tw-gap-3 ${
        compact ? 'tw-py-0' : 'tw-py-1'
      }`}
    >
      <div className="tw-flex tw-min-w-0 tw-items-start tw-gap-3">
        {icon ? (
          <span
            className={`tw-flex tw-shrink-0 tw-items-center tw-justify-center tw-rounded-lg tw-border tw-border-slate-200 tw-bg-slate-50 tw-text-slate-600 ${
              compact ? 'tw-h-7 tw-w-7 tw-text-sm' : 'tw-h-8 tw-w-8 tw-text-sm'
            }`}
          >
            {icon}
          </span>
        ) : null}
        <div className="tw-min-w-0">
          {eyebrow ? (
            <Typography.Text className="tw-block tw-text-[10px] tw-font-bold tw-uppercase tw-tracking-[0.08em] tw-text-slate-400">
              {eyebrow}
            </Typography.Text>
          ) : null}
          <span
            className={`tw-block tw-truncate tw-font-bold tw-leading-tight tw-text-slate-950 ${
              compact ? 'tw-text-sm' : 'tw-text-sm'
            }`}
          >
            {title}
          </span>
          {description ? (
            <Typography.Paragraph className="!tw-mb-0 !tw-mt-1 !tw-text-xs !tw-leading-5 !tw-text-slate-500">
              {description}
            </Typography.Paragraph>
          ) : null}
        </div>
      </div>
      {actions ? (
        <div className="tw-flex tw-shrink-0 tw-items-center tw-gap-2">{actions}</div>
      ) : null}
    </div>
  );
}

function PanelDescription({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="tw-flex tw-min-w-0 tw-flex-wrap tw-items-center tw-justify-between tw-gap-3">
      <Typography.Text className="!tw-text-sm !tw-font-normal !tw-leading-5 !tw-text-slate-600">
        {children}
      </Typography.Text>
      {actions ? (
        <div className="tw-flex tw-shrink-0 tw-items-center tw-gap-2">{actions}</div>
      ) : null}
    </div>
  );
}

export default function OnboardingStepperPage() {
  const { message, modal } = App.useApp();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [current, setCurrent] = useState(0);
  const [statuses, setStatuses] = useState<StepStatus[]>(INITIAL_STEP_STATUS);
  const [onboardingEsgEnabledYn, setOnboardingEsgEnabledYn] = useState<'YES' | 'NO'>('NO');
  const [esgApiActivated, setEsgApiActivated] = useState(false);
  const [selectedOrgKeys, setSelectedOrgKeys] = useState<Key[]>([]);
  const [orgModal, setOrgModal] = useState<
    null | { mode: 'create'; parentId: string | null } | { mode: 'edit'; id: string; name: string }
  >(null);
  /** 조직 설정 3단계(하위 조직 생성)까지 완료한 뒤 하단 '다음 단계' 노출 */
  const [orgCreateFlowDone, setOrgCreateFlowDone] = useState(false);
  const [gradeModal, setGradeModal] = useState<JobSettingModalState>(null);
  const [titleModal, setTitleModal] = useState<JobSettingModalState>(null);
  const [draftGrades, setDraftGrades] = useState<JobSettingRow[]>([]);
  const [draftTitles, setDraftTitles] = useState<JobSettingRow[]>([]);
  const [orgForm] = Form.useForm<{ name: string }>();
  /** 조직 설정(스텝 0) 안내: 0=상위 선택, 1=하위 추가 클릭, 2=조직명 입력, 3=다음 단계 이동 */
  const [orgGuideStep, setOrgGuideStep] = useState<0 | 1 | 2 | 3>(0);
  const orgTreeWrapRef = useRef<HTMLDivElement>(null);
  const orgAddBtnRef = useRef<HTMLDivElement>(null);
  const [gradeForm] = Form.useForm<{ name: string; displayOrder: number }>();
  const [titleForm] = Form.useForm<{ name: string; displayOrder: number }>();
  /** 직급/직책(스텝 1) 안내: 0=직급추가, 1=직책추가, 2=다음단계 */
  const [jobGuideStep, setJobGuideStep] = useState<0 | 1 | 2>(0);
  /** ESG 그린장터(스텝 6) 안내: 0=ON/OFF 선택, 1=상한 입력/다음, 2=저장, 3=다음 */
  const [esgGuideStep, setEsgGuideStep] = useState<0 | 1 | 2 | 3>(0);
  const gradeAddBtnRef = useRef<HTMLDivElement>(null);
  const titleAddBtnRef = useRef<HTMLDivElement>(null);
  const jobNextBtnRef = useRef<HTMLDivElement>(null);
  const esgMonthlyLimitWrapRef = useRef<HTMLSpanElement>(null);
  const esgNextBtnWrapRef = useRef<HTMLSpanElement>(null);
  const esgSaveBtnWrapRef = useRef<HTMLSpanElement>(null);
  const orgPrimaryBtnClass =
    '!tw-h-10 !tw-min-h-10 !tw-rounded-xl !tw-border-0 !tw-bg-[#1e3a5f] !tw-text-white !tw-font-semibold !tw-shadow-none hover:!tw-bg-[#152a45] hover:!tw-text-white disabled:!tw-opacity-60';

  const doneCount = useMemo(
    () => statuses.filter((s) => s === 'completed' || s === 'skipped').length,
    [statuses],
  );
  const progressPercent = Math.round((doneCount / ONBOARDING_STEPS.length) * 100);

  const finishMutation = useMutation({
    mutationFn: () => memberApi.completeOnboarding(),
    onSuccess: () => {
      message.success('온보딩 완료 처리되었습니다.');
      void navigate({ to: APP_POST_LOGIN_PATH, replace: true });
    },
    onError: (error: Error) => {
      message.error(error.message || '온보딩 완료 처리에 실패했습니다.');
    },
  });

  const currentStep = ONBOARDING_STEPS[current];
  if (!currentStep) {
    return null;
  }
  const isLast = current === ONBOARDING_STEPS.length - 1;

  const markCurrent = (status: StepStatus) => {
    setStatuses((prev) => prev.map((v, idx) => (idx === current ? status : v)));
  };

  const gotoNext = () => {
    markCurrent('completed');
    if (isLast) {
      void finishMutation.mutateAsync();
      return;
    }
    setCurrent((prev) => Math.min(prev + 1, ONBOARDING_STEPS.length - 1));
  };

  const gotoPrev = () => {
    setCurrent((prev) => Math.max(prev - 1, 0));
  };

  const orgQuery = useQuery({
    queryKey: ['onboarding', 'organizations'],
    queryFn: () => organizationApi.list(),
    enabled: current === 0,
  });
  const orgCreate = useMutation({
    mutationFn: organizationApi.create,
    onSuccess: () => {
      message.success('조직이 생성되었습니다.');
      setOrgCreateFlowDone(true);
      void queryClient.invalidateQueries({ queryKey: ['onboarding', 'organizations'] });
    },
  });
  const orgUpdate = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      organizationApi.update(id, { name }),
    onSuccess: () => {
      message.success('조직명이 수정되었습니다.');
      void queryClient.invalidateQueries({ queryKey: ['onboarding', 'organizations'] });
    },
    onError: (error: Error) => {
      message.error(error.message || '조직 수정에 실패했습니다.');
    },
  });
  const orgDelete = useMutation({
    mutationFn: (organizationId: string) => organizationApi.remove(organizationId),
    onSuccess: () => {
      message.success('조직이 삭제되었습니다.');
      setSelectedOrgKeys([]);
      void queryClient.invalidateQueries({ queryKey: ['onboarding', 'organizations'] });
    },
    onError: (error: Error) => {
      message.error(error.message || '조직 삭제에 실패했습니다.');
    },
  });
  const treeData = useMemo(() => toTreeNodes(orgQuery.data ?? []), [orgQuery.data]);
  const orgExpandedKeys = useMemo(() => collectBranchKeys(treeData), [treeData]);
  const orgStep0TreeHighlight = current === 0 && orgGuideStep === 0 && orgModal == null;
  const selectedOrgId = selectedOrgKeys[0] != null ? String(selectedOrgKeys[0]) : '';

  useEffect(() => {
    if (current !== 0) {
      setOrgGuideStep(0);
    }
  }, [current]);

  useEffect(() => {
    if (current !== 0) return;
    if (orgModal?.mode === 'create') {
      setOrgGuideStep(2);
      return;
    }
    if (orgModal == null) {
      setOrgGuideStep((s) => {
        if (s !== 2) return s;
        return orgCreateFlowDone ? 3 : selectedOrgId ? 1 : 0;
      });
    }
  }, [current, orgModal, selectedOrgId, orgCreateFlowDone]);

  useEffect(() => {
    if (current !== 0) return;
    if (orgGuideStep === 2 || orgGuideStep === 3) return;
    const el = orgGuideStep === 0 ? orgTreeWrapRef.current : orgAddBtnRef.current;
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [current, orgGuideStep]);

  const gradeQuery = useQuery({
    queryKey: ['onboarding', 'job-grades'],
    queryFn: () => organizationApi.listJobGrades(),
    enabled: current === 1,
  });
  const gradeCreate = useMutation({
    mutationFn: organizationApi.createJobGrade,
    onSuccess: () => {
      message.success('직급이 생성되었습니다.');
      void queryClient.invalidateQueries({ queryKey: ['onboarding', 'job-grades'] });
    },
  });
  const gradeUpdate = useMutation({
    mutationFn: ({ id, name, displayOrder }: { id: string; name: string; displayOrder: number }) =>
      organizationApi.updateJobGrade(id, { name, displayOrder }),
    onSuccess: () => {
      message.success('직급이 수정되었습니다.');
      void queryClient.invalidateQueries({ queryKey: ['onboarding', 'job-grades'] });
    },
  });
  const gradeDelete = useMutation({
    mutationFn: organizationApi.removeJobGrade,
    onSuccess: () => {
      message.success('직급이 삭제되었습니다.');
      void queryClient.invalidateQueries({ queryKey: ['onboarding', 'job-grades'] });
    },
  });

  const titleQuery = useQuery({
    queryKey: ['onboarding', 'job-titles'],
    queryFn: () => organizationApi.listJobTitles(),
    enabled: current === 1,
  });
  const titleCreate = useMutation({
    mutationFn: organizationApi.createJobTitle,
    onSuccess: () => {
      message.success('직책이 생성되었습니다.');
      void queryClient.invalidateQueries({ queryKey: ['onboarding', 'job-titles'] });
    },
  });
  const titleUpdate = useMutation({
    mutationFn: ({ id, name, displayOrder }: { id: string; name: string; displayOrder: number }) =>
      organizationApi.updateJobTitle(id, { name, displayOrder }),
    onSuccess: () => {
      message.success('직책이 수정되었습니다.');
      void queryClient.invalidateQueries({ queryKey: ['onboarding', 'job-titles'] });
    },
  });
  const titleDelete = useMutation({
    mutationFn: organizationApi.removeJobTitle,
    onSuccess: () => {
      message.success('직책이 삭제되었습니다.');
      void queryClient.invalidateQueries({ queryKey: ['onboarding', 'job-titles'] });
    },
  });
  const hasGrades = (gradeQuery.data?.length ?? 0) > 0;
  const hasTitles = (titleQuery.data?.length ?? 0) > 0;
  const gradeSensors = useSensors(useSensor(PointerSensor));
  const titleSensors = useSensors(useSensor(PointerSensor));

  useEffect(() => {
    if (current !== 1) return;
    setDraftGrades(
      toJobSettingRows(gradeQuery.data ?? [], ['id', 'jobGradeId', 'job_grade_id'], 'grade-row'),
    );
  }, [current, gradeQuery.data]);

  useEffect(() => {
    if (current !== 1) return;
    setDraftTitles(
      toJobSettingRows(titleQuery.data ?? [], ['id', 'jobTitleId', 'job_title_id'], 'title-row'),
    );
  }, [current, titleQuery.data]);

  useEffect(() => {
    // 스텝바에서 '직급/직책 설정'으로 들어오면 항상 1단계(직급 추가)부터 시작
    if (current === 1) {
      setJobGuideStep(0);
      return;
    }
    setJobGuideStep(0);
  }, [current]);

  useEffect(() => {
    if (current !== 1) return;
    const el =
      jobGuideStep === 0
        ? gradeAddBtnRef.current
        : jobGuideStep === 1
          ? titleAddBtnRef.current
          : jobNextBtnRef.current;
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [current, jobGuideStep]);

  useEffect(() => {
    if (current === 6) {
      setEsgGuideStep(0);
      return;
    }
    setEsgGuideStep(0);
  }, [current]);

  useEffect(() => {
    if (current !== 6 || esgGuideStep !== 1) return;
    if (onboardingEsgEnabledYn === 'YES') {
      esgMonthlyLimitWrapRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      return;
    }
    esgNextBtnWrapRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [current, esgGuideStep, onboardingEsgEnabledYn]);

  useEffect(() => {
    if (current !== 6 || esgGuideStep !== 2 || onboardingEsgEnabledYn !== 'YES') return;
    esgSaveBtnWrapRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [current, esgGuideStep, onboardingEsgEnabledYn]);

  const esgConfigQuery = useQuery({
    queryKey: ['onboarding', 'esg-config'],
    queryFn: () => esgApi.getConfig(),
    enabled: current === 6 && esgApiActivated,
  });
  const esgConfigUpdate = useMutation({
    mutationFn: esgApi.updateConfig,
    onSuccess: () => {
      setEsgApiActivated(true);
      message.success('ESG 설정이 저장되었습니다.');
      void queryClient.invalidateQueries({ queryKey: ['onboarding', 'esg-config'] });
    },
  });

  const hrDocQuery = useQuery({
    queryKey: ['onboarding', 'ai-documents'],
    queryFn: () => aiApi.listDocuments(),
    enabled: current === 7,
  });
  const hrDocUpload = useMutation({
    mutationFn: aiApi.uploadDocument,
    onSuccess: () => {
      message.success('HR 정책 문서가 업로드되었습니다.');
      void queryClient.invalidateQueries({ queryKey: ['onboarding', 'ai-documents'] });
    },
  });
  const hrDocDelete = useMutation({
    mutationFn: (id: string) => aiApi.deleteDocument(id),
    onSuccess: () => {
      message.success('문서가 삭제되었습니다.');
      void queryClient.invalidateQueries({ queryKey: ['onboarding', 'ai-documents'] });
    },
    onError: (e: Error) => {
      message.error(e.message || '삭제에 실패했습니다.');
    },
  });

  const hrDocUploadProps: UploadProps = {
    name: 'file',
    multiple: false,
    showUploadList: false,
    disabled: hrDocUpload.isPending,
    beforeUpload: (file) => {
      const err = validateHrDocFile(file as File);
      if (err) {
        message.warning(err);
        return false;
      }
      hrDocUpload.mutate(file as File);
      return false;
    },
  };

  const renderStepContent = () => {
    if (current === 0) {
      const btnHighlight = current === 0 && orgGuideStep === 1 && orgModal == null;
      const nameHighlight = current === 0 && orgGuideStep === 2 && orgModal?.mode === 'create';
      return (
        <Space direction="vertical" className="tw-w-full">
          <Card
            size="small"
            className={ONBOARDING_PANEL_CLASS}
            title={
              <PanelDescription
                actions={
                  <div ref={orgAddBtnRef} className="tw-inline-flex">
                    <Popover
                      {...ORG_GUIDE_POPOVER_SHARED}
                      title="2단계: 하위 조직 추가"
                      content={
                        <Typography.Paragraph className="!tw-mb-0 tw-max-w-[280px] tw-text-sm">
                          선택한 조직 아래에 새 조직을 만들려면 이 버튼을 눌러 주세요.
                        </Typography.Paragraph>
                      }
                      open={btnHighlight}
                      placement="bottomRight"
                      overlayStyle={{ zIndex: 1060 }}
                    >
                      <span
                        className={`tw-inline-block tw-rounded-xl tw-transition-shadow ${btnHighlight ? 'tw-ring-2 tw-ring-blue-500 tw-ring-offset-2' : ''}`}
                      >
                        <Button
                          icon={<PlusOutlined />}
                          className={orgPrimaryBtnClass}
                          onClick={() => {
                            if (!selectedOrgId) {
                              message.warning('상위 조직을 먼저 선택해 주세요.');
                              return;
                            }
                            orgForm.resetFields();
                            setOrgModal({ mode: 'create', parentId: selectedOrgId });
                          }}
                        >
                          선택 조직 하위 추가
                        </Button>
                      </span>
                    </Popover>
                  </div>
                }
              >
                조직을 선택한 뒤 하위 추가, 수정, 삭제 작업을 진행합니다.
              </PanelDescription>
            }
          >
            <div ref={orgTreeWrapRef} className="tw-box-border tw-min-h-[248px] tw-min-w-0">
              <Popover
                {...ORG_GUIDE_POPOVER_SHARED}
                title="1단계: 상위 조직 선택"
                content={
                  <Typography.Paragraph className="!tw-mb-0 tw-max-w-[280px] tw-text-sm">
                    하위 조직을 넣을 상위 조직을 트리 목록에서 선택해 주세요. 선택한 조직 아래에 새
                    조직을 추가합니다.
                  </Typography.Paragraph>
                }
                open={orgStep0TreeHighlight}
                placement="topLeft"
                overlayStyle={{ zIndex: 1060 }}
              >
                <div
                  className={`tw-min-h-[154px] tw-overflow-hidden tw-rounded-xl tw-bg-slate-50/60 tw-p-3 tw-transition-shadow ${
                    orgStep0TreeHighlight
                      ? 'tw-ring-2 tw-ring-blue-500 tw-ring-offset-2 tw-ring-offset-white'
                      : ''
                  }`}
                >
                  <Spin spinning={orgQuery.isLoading}>
                    {treeData.length === 0 ? (
                      <Typography.Text type="secondary" className="tw-text-sm">
                        등록된 조직이 없습니다.
                      </Typography.Text>
                    ) : (
                      <Tree
                        blockNode
                        draggable={{ icon: <HolderOutlined className="tw-text-slate-400" /> }}
                        switcherIcon={({ expanded }) => (
                          <RightOutlined
                            className={`tw-text-[11px] tw-text-slate-400 tw-transition-transform tw-duration-200 tw-ease-out ${expanded ? 'tw-rotate-90' : ''}`}
                          />
                        )}
                        className="tw-bg-transparent [&_.ant-tree-draggable-icon]:tw-mr-1 [&_.ant-tree-node-content-wrapper]:tw-w-full [&_.ant-tree-node-content-wrapper]:tw-rounded-lg [&_.ant-tree-node-content-wrapper]:tw-py-1 [&_.ant-tree-switcher]:tw-flex [&_.ant-tree-switcher]:tw-w-5 [&_.ant-tree-switcher]:tw-shrink-0 [&_.ant-tree-switcher]:tw-items-center [&_.ant-tree-switcher]:tw-justify-center [&_.ant-tree-switcher]:tw-bg-transparent"
                        treeData={treeData}
                        titleRender={(node) => {
                          const id = String(node.key);
                          const name =
                            typeof node.title === 'string' ? node.title : String(node.title ?? '');
                          return (
                            <div className="tw-flex tw-min-w-0 tw-items-center tw-justify-between tw-gap-2 tw-pr-1">
                              <span className="tw-min-w-0 tw-truncate tw-text-sm tw-font-semibold tw-text-slate-800">
                                {name}
                              </span>
                              <span className="tw-flex tw-shrink-0 tw-items-center tw-gap-1">
                                <Tooltip title="하위 조직 추가">
                                  <Button
                                    type="text"
                                    size="small"
                                    icon={<PlusOutlined />}
                                    className="!tw-h-7 !tw-w-7 !tw-rounded-md !tw-p-0 tw-text-slate-500 hover:!tw-bg-blue-50 hover:!tw-text-blue-700"
                                    aria-label={`${name} 하위 조직 추가`}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedOrgKeys([id]);
                                      setOrgGuideStep(2);
                                      orgForm.resetFields();
                                      setOrgModal({ mode: 'create', parentId: id });
                                    }}
                                  />
                                </Tooltip>
                                <Tooltip title="조직명 수정">
                                  <Button
                                    type="text"
                                    size="small"
                                    icon={<EditOutlined />}
                                    className="!tw-h-7 !tw-w-7 !tw-rounded-md !tw-p-0 tw-text-slate-500 hover:!tw-bg-slate-100 hover:!tw-text-slate-700"
                                    aria-label={`${name} 조직명 수정`}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedOrgKeys([id]);
                                      orgForm.setFieldsValue({ name });
                                      setOrgModal({ mode: 'edit', id, name });
                                    }}
                                  />
                                </Tooltip>
                                <Tooltip title="조직 삭제">
                                  <Button
                                    type="text"
                                    size="small"
                                    danger
                                    icon={<DeleteOutlined />}
                                    className="!tw-h-7 !tw-w-7 !tw-rounded-md !tw-p-0"
                                    aria-label={`${name} 조직 삭제`}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedOrgKeys([id]);
                                      modal.confirm({
                                        title: '선택한 조직을 삭제할까요?',
                                        okText: '삭제',
                                        okType: 'danger',
                                        cancelText: '취소',
                                        onOk: () => orgDelete.mutateAsync(id),
                                      });
                                    }}
                                  />
                                </Tooltip>
                              </span>
                            </div>
                          );
                        }}
                        expandedKeys={orgExpandedKeys}
                        onExpand={() => {
                          // 온보딩에서는 조직 구조를 항상 펼친 상태로 유지한다.
                        }}
                        selectedKeys={selectedOrgKeys}
                        onSelect={(keys) => {
                          const last = keys.at(-1);
                          setSelectedOrgKeys(last != null ? [last] : []);
                          setOrgGuideStep(last != null ? 1 : 0);
                        }}
                      />
                    )}
                  </Spin>
                </div>
              </Popover>
            </div>
          </Card>
          <AppDoubleActionModal
            title={
              orgModal?.mode === 'edit'
                ? '조직명 수정'
                : orgModal?.parentId
                  ? '하위 조직 추가'
                  : '최상위 조직 추가'
            }
            open={orgModal != null}
            onClose={() => setOrgModal(null)}
            onConfirm={async () => {
              const v = await orgForm.validateFields();
              if (!orgModal) return;
              if (orgModal.mode === 'edit') {
                await orgUpdate.mutateAsync({ id: orgModal.id, name: v.name.trim() });
                setOrgModal(null);
                return;
              }
              await orgCreate.mutateAsync({ name: v.name.trim(), parentId: orgModal.parentId });
              setOrgGuideStep(3);
              setOrgModal(null);
            }}
            confirmLoading={orgCreate.isPending || orgUpdate.isPending}
            destroyOnHidden
            confirmText="확인"
          >
            <div className="tw-px-5 tw-py-4">
              <Form form={orgForm} layout="vertical">
                <Popover
                  {...ORG_GUIDE_POPOVER_SHARED}
                  title="3단계: 조직명 입력"
                  content={
                    <Typography.Paragraph className="!tw-mb-0 tw-max-w-[280px] tw-text-sm">
                      추가할 조직 이름을 입력한 뒤 확인을 누르면 저장됩니다. (예: 개발팀, 인사팀)
                    </Typography.Paragraph>
                  }
                  open={nameHighlight}
                  placement="topLeft"
                  overlayStyle={{ zIndex: 1100 }}
                >
                  <Form.Item
                    name="name"
                    label="조직명"
                    rules={[{ required: true, message: '조직명을 입력해 주세요.' }]}
                  >
                    <Input
                      placeholder="예: 본사, 개발팀"
                      classNames={{
                        input: nameHighlight
                          ? 'tw-rounded-md tw-ring-2 tw-ring-blue-500 tw-ring-offset-2 tw-ring-offset-[var(--ant-color-bg-container)]'
                          : '',
                      }}
                    />
                  </Form.Item>
                </Popover>
              </Form>
            </div>
          </AppDoubleActionModal>
        </Space>
      );
    }
    if (current === 1) {
      const gradeBtnHighlight = current === 1 && jobGuideStep === 0 && gradeModal == null;
      const titleBtnHighlight = current === 1 && jobGuideStep === 1 && titleModal == null;
      const handleGradeDragEnd = ({ active, over }: DragEndEvent) => {
        if (!over || active.id === over.id) return;
        setDraftGrades((items) => {
          const oldIndex = items.findIndex((item) => item.key === active.id);
          const newIndex = items.findIndex((item) => item.key === over.id);
          if (oldIndex < 0 || newIndex < 0) return items;
          const next = arrayMove(items, oldIndex, newIndex).map((item, index) => ({
            ...item,
            displayOrder: index,
          }));
          const orderedIds = next.map((row) => row.id).filter((id): id is string => Boolean(id));
          if (orderedIds.length > 1) {
            void organizationApi
              .reorderJobGrades(orderedIds)
              .then(() => queryClient.invalidateQueries({ queryKey: ['onboarding', 'job-grades'] }))
              .catch((error: Error) =>
                message.error(error.message || '직급 순서 저장에 실패했습니다.'),
              );
          }
          return next;
        });
      };
      const handleTitleDragEnd = ({ active, over }: DragEndEvent) => {
        if (!over || active.id === over.id) return;
        setDraftTitles((items) => {
          const oldIndex = items.findIndex((item) => item.key === active.id);
          const newIndex = items.findIndex((item) => item.key === over.id);
          if (oldIndex < 0 || newIndex < 0) return items;
          const next = arrayMove(items, oldIndex, newIndex).map((item, index) => ({
            ...item,
            displayOrder: index,
          }));
          const orderedIds = next.map((row) => row.id).filter((id): id is string => Boolean(id));
          if (orderedIds.length > 1) {
            void organizationApi
              .reorderJobTitles(orderedIds)
              .then(() => queryClient.invalidateQueries({ queryKey: ['onboarding', 'job-titles'] }))
              .catch((error: Error) =>
                message.error(error.message || '직책 순서 저장에 실패했습니다.'),
              );
          }
          return next;
        });
      };
      const renderJobSettingCard = ({
        label,
        rows,
        loading,
        sensors,
        buttonRef,
        highlighted,
        guideTitle,
        guideText,
        onAdd,
        onEdit,
        onDelete,
        onDragEnd,
      }: {
        label: '직급' | '직책';
        rows: JobSettingRow[];
        loading: boolean;
        sensors: ReturnType<typeof useSensors>;
        buttonRef: RefObject<HTMLDivElement>;
        highlighted: boolean;
        guideTitle: string;
        guideText: string;
        onAdd: () => void;
        onEdit: (row: JobSettingRow) => void;
        onDelete: (row: JobSettingRow) => void;
        onDragEnd: (event: DragEndEvent) => void;
      }) => (
        <Card
          size="small"
          className={ONBOARDING_PANEL_CLASS}
          title={
            <PanelDescription
              actions={
                <div ref={buttonRef} className="tw-inline-flex">
                  <Popover
                    {...ORG_GUIDE_POPOVER_SHARED}
                    title={guideTitle}
                    content={
                      <Typography.Paragraph className="!tw-mb-0 tw-max-w-[280px] tw-text-sm">
                        {guideText}
                      </Typography.Paragraph>
                    }
                    open={highlighted}
                    placement="bottomRight"
                    overlayStyle={{ zIndex: 1060 }}
                  >
                    <span
                      className={
                        highlighted
                          ? 'tw-inline-block tw-rounded-xl tw-ring-2 tw-ring-blue-500 tw-ring-offset-2'
                          : 'tw-inline-block'
                      }
                    >
                      <Button
                        icon={<PlusOutlined />}
                        className={orgPrimaryBtnClass}
                        onClick={onAdd}
                      >
                        {label} 추가
                      </Button>
                    </span>
                  </Popover>
                </div>
              }
            >
              {label}명과 순서를 편집합니다.
            </PanelDescription>
          }
        >
          <Spin spinning={loading}>
            <div className={ONBOARDING_TABLE_CLASS}>
              <div className={`${ONBOARDING_TABLE_HEADER_CLASS} tw-grid-cols-[44px_1fr_92px_96px]`}>
                <span />
                <span>{label}명</span>
                <span>{label}순서</span>
                <span className="tw-text-right">작업</span>
              </div>
              {rows.length === 0 ? (
                <div className="tw-border-t tw-border-slate-100 tw-px-3 tw-py-8 tw-text-center tw-text-sm tw-text-slate-500">
                  등록된 {label}이 없습니다.
                </div>
              ) : (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={onDragEnd}
                >
                  <SortableContext
                    items={rows.map((row) => row.key)}
                    strategy={verticalListSortingStrategy}
                  >
                    {rows.map((row, index) => (
                      <SortableJobSettingRow
                        key={row.key}
                        row={row}
                        index={index}
                        label={label}
                        onEdit={onEdit}
                        onDelete={onDelete}
                      />
                    ))}
                  </SortableContext>
                </DndContext>
              )}
            </div>
          </Spin>
        </Card>
      );

      return (
        <Space direction="vertical" className="tw-w-full">
          <div className="tw-grid tw-grid-cols-1 tw-gap-5 lg:tw-grid-cols-2">
            {renderJobSettingCard({
              label: '직급',
              rows: draftGrades,
              loading: gradeQuery.isLoading,
              sensors: gradeSensors,
              buttonRef: gradeAddBtnRef,
              highlighted: gradeBtnHighlight,
              guideTitle: '1단계: 직급 추가',
              guideText:
                '직급을 먼저 추가해 주세요. 추가된 항목은 목록에서 바로 수정하거나 삭제할 수 있습니다.',
              onAdd: () => {
                gradeForm.resetFields();
                setGradeModal({ mode: 'create' });
              },
              onEdit: (row) => {
                gradeForm.setFieldsValue({ name: row.name, displayOrder: row.displayOrder });
                setGradeModal({ mode: 'edit', id: row.id, displayOrder: row.displayOrder });
              },
              onDelete: (row) => {
                modal.confirm({
                  title: '이 직급을 삭제할까요?',
                  okText: '삭제',
                  okType: 'danger',
                  cancelText: '취소',
                  onOk: () => gradeDelete.mutateAsync(row.id),
                });
              },
              onDragEnd: handleGradeDragEnd,
            })}
            {renderJobSettingCard({
              label: '직책',
              rows: draftTitles,
              loading: titleQuery.isLoading,
              sensors: titleSensors,
              buttonRef: titleAddBtnRef,
              highlighted: titleBtnHighlight,
              guideTitle: '2단계: 직책 추가',
              guideText:
                '직책을 추가해 주세요. 추가된 항목은 목록에서 바로 수정하거나 삭제할 수 있습니다.',
              onAdd: () => {
                titleForm.resetFields();
                setTitleModal({ mode: 'create' });
              },
              onEdit: (row) => {
                titleForm.setFieldsValue({ name: row.name, displayOrder: row.displayOrder });
                setTitleModal({ mode: 'edit', id: row.id, displayOrder: row.displayOrder });
              },
              onDelete: (row) => {
                modal.confirm({
                  title: '이 직책을 삭제할까요?',
                  okText: '삭제',
                  okType: 'danger',
                  cancelText: '취소',
                  onOk: () => titleDelete.mutateAsync(row.id),
                });
              },
              onDragEnd: handleTitleDragEnd,
            })}
          </div>
          <AppDoubleActionModal
            title={gradeModal?.mode === 'edit' ? '직급 수정' : '직급 추가'}
            open={gradeModal != null}
            onClose={() => setGradeModal(null)}
            onConfirm={async () => {
              const v = await gradeForm.validateFields();
              const payload = {
                name: v.name.trim(),
                displayOrder:
                  gradeModal?.mode === 'edit' ? gradeModal.displayOrder : draftGrades.length,
              };
              if (gradeModal?.mode === 'edit') {
                await gradeUpdate.mutateAsync({ id: gradeModal.id, ...payload });
              } else {
                await gradeCreate.mutateAsync(payload);
              }
              setJobGuideStep(1);
              setGradeModal(null);
            }}
            confirmLoading={gradeCreate.isPending || gradeUpdate.isPending}
            destroyOnHidden
            confirmText="확인"
          >
            <div className="tw-px-5 tw-py-4">
              <Form form={gradeForm} layout="vertical">
                <Form.Item
                  name="name"
                  label="직급명"
                  rules={[{ required: true, message: '직급명을 입력해 주세요.' }]}
                >
                  <Input placeholder="예: 대리, 과장" />
                </Form.Item>
              </Form>
            </div>
          </AppDoubleActionModal>
          <AppDoubleActionModal
            title={titleModal?.mode === 'edit' ? '직책 수정' : '직책 추가'}
            open={titleModal != null}
            onClose={() => setTitleModal(null)}
            onConfirm={async () => {
              const v = await titleForm.validateFields();
              const payload = {
                name: v.name.trim(),
                displayOrder:
                  titleModal?.mode === 'edit' ? titleModal.displayOrder : draftTitles.length,
              };
              if (titleModal?.mode === 'edit') {
                await titleUpdate.mutateAsync({ id: titleModal.id, ...payload });
              } else {
                await titleCreate.mutateAsync(payload);
              }
              setJobGuideStep(2);
              setTitleModal(null);
            }}
            confirmLoading={titleCreate.isPending || titleUpdate.isPending}
            destroyOnHidden
            confirmText="확인"
          >
            <div className="tw-px-5 tw-py-4">
              <Form form={titleForm} layout="vertical">
                <Form.Item
                  name="name"
                  label="직책명"
                  rules={[{ required: true, message: '직책명을 입력해 주세요.' }]}
                >
                  <Input placeholder="예: 팀장, 담당" />
                </Form.Item>
              </Form>
            </div>
          </AppDoubleActionModal>
        </Space>
      );
    }
    if (current === 2) {
      return <OrganizationRolesSection onMoveToEsgStep={() => setCurrent(6)} />;
    }
    if (current === 3) {
      return (
        <Space direction="vertical" className="tw-w-full">
          <AdminSalarySettingsPage embedded />
          <AdminWorkSchedulesPage embedded />
          <AdminOvertimePoliciesPage embedded />
          <AdminLeavePoliciesPage embedded />
          <AdminRetirementPolicyPage embedded />
          <AdminBonusPolicyPage embedded />
        </Space>
      );
    }
    if (current === 4) {
      return <AdminCompanyHolidaysPage embedded />;
    }
    if (current === 5) {
      return (
        <div className="tw-flex tw-min-h-0 tw-flex-1 tw-w-full tw-flex-col">
          <ApprovalsAdminPage />
        </div>
      );
    }
    if (current === 6) {
      const esgOnOffGuideOpen = current === 6 && esgGuideStep === 0;
      const esgMonthlyGuideOpen =
        current === 6 && esgGuideStep === 1 && onboardingEsgEnabledYn === 'YES';
      const esgSaveGuideOpen =
        current === 6 && esgGuideStep === 2 && onboardingEsgEnabledYn === 'YES';
      return (
        <Space direction="vertical" className="tw-w-full">
          <Card
            className={ONBOARDING_PANEL_CLASS}
            size="small"
            title={
              <PanelDescription>
                사이드바 ESG 설정의 기능 설정과 동일하게 ON/OFF 및 월간 포인트 상한만 저장합니다.
              </PanelDescription>
            }
          >
            <Form
              layout="vertical"
              className="tw-max-w-md"
              initialValues={{
                esgEnabledYn: esgConfigQuery.data?.esgEnabledYn ?? onboardingEsgEnabledYn ?? 'NO',
                monthlyPointLimit: esgConfigQuery.data?.monthlyPointLimit ?? 1000,
              }}
              onFinish={(v) => {
                const nextYn = v.esgEnabledYn as 'YES' | 'NO';
                setOnboardingEsgEnabledYn(nextYn);
                if (nextYn === 'NO') {
                  setEsgApiActivated(false);
                  message.info('ESG 설정이 NO라서 관련 API를 호출하지 않습니다.');
                  return;
                }
                void esgConfigUpdate.mutateAsync({
                  esgEnabledYn: nextYn,
                  monthlyPointLimit: Number(v.monthlyPointLimit) || 0,
                });
                setEsgGuideStep(3);
              }}
            >
              <Form.Item
                name="esgEnabledYn"
                label="ESG 그린장터"
                extra="ON이면 활동 인증, 포인트, 포인트샵이 활성화되고 OFF면 비활성화됩니다."
              >
                <Popover
                  {...ORG_GUIDE_POPOVER_SHARED}
                  title="1단계: ESG ON/OFF 선택"
                  content={
                    <Typography.Paragraph className="!tw-mb-0 tw-max-w-[280px] tw-text-sm">
                      ESG 기능 사용 여부를 먼저 선택해 주세요.
                    </Typography.Paragraph>
                  }
                  open={esgOnOffGuideOpen}
                  placement="rightTop"
                  overlayStyle={{ zIndex: 1060 }}
                >
                  <span
                    className={
                      esgOnOffGuideOpen
                        ? 'tw-inline-block tw-rounded-lg tw-ring-2 tw-ring-blue-500 tw-ring-offset-2'
                        : 'tw-inline-block'
                    }
                  >
                    <Radio.Group
                      onChange={(e) => {
                        const nextYn = e.target.value as 'YES' | 'NO';
                        setOnboardingEsgEnabledYn(nextYn);
                        setEsgGuideStep(1);
                        if (nextYn === 'NO') setEsgApiActivated(false);
                      }}
                    >
                      <Radio value="YES">ON</Radio>
                      <Radio value="NO">OFF</Radio>
                    </Radio.Group>
                  </span>
                </Popover>
              </Form.Item>
              <Form.Item name="monthlyPointLimit" label="월간 포인트 상한">
                <Popover
                  {...ORG_GUIDE_POPOVER_SHARED}
                  title="2단계: 월간 포인트 상한 설정"
                  content={
                    <Typography.Paragraph className="!tw-mb-0 tw-max-w-[280px] tw-text-sm">
                      ON을 선택했다면 월간 포인트 상한 값을 입력해 주세요.
                    </Typography.Paragraph>
                  }
                  open={esgMonthlyGuideOpen}
                  placement="rightTop"
                  overlayStyle={{ zIndex: 1060 }}
                >
                  <span
                    ref={esgMonthlyLimitWrapRef}
                    className={
                      esgMonthlyGuideOpen
                        ? 'tw-inline-block tw-w-full tw-rounded-lg tw-ring-2 tw-ring-blue-500 tw-ring-offset-2'
                        : 'tw-inline-block tw-w-full'
                    }
                  >
                    <InputNumber
                      min={0}
                      className="tw-w-full"
                      onChange={() => {
                        if (onboardingEsgEnabledYn === 'YES') setEsgGuideStep(2);
                      }}
                    />
                  </span>
                </Popover>
              </Form.Item>
              <Popover
                {...ORG_GUIDE_POPOVER_SHARED}
                title="3단계: 저장"
                content={
                  <Typography.Paragraph className="!tw-mb-0 tw-max-w-[280px] tw-text-sm">
                    월간 포인트 상한 값을 확인한 뒤 저장 버튼을 눌러 반영해 주세요.
                  </Typography.Paragraph>
                }
                open={esgSaveGuideOpen}
                placement="rightTop"
                overlayStyle={{ zIndex: 1060 }}
              >
                <span
                  ref={esgSaveBtnWrapRef}
                  className={
                    esgSaveGuideOpen
                      ? 'tw-inline-block tw-rounded-xl tw-ring-2 tw-ring-blue-500 tw-ring-offset-2'
                      : 'tw-inline-block'
                  }
                >
                  <AppButton
                    variant="secondary"
                    className={orgPrimaryBtnClass}
                    htmlType="submit"
                    loading={esgConfigUpdate.isPending}
                  >
                    저장
                  </AppButton>
                </span>
              </Popover>
            </Form>
          </Card>
        </Space>
      );
    }
    if (current === 7) {
      return (
        <Space direction="vertical" className="tw-w-full">
          <Card
            className={ONBOARDING_PANEL_CLASS}
            size="small"
            title={
              <PanelDescription>pdf, docx, txt만 업로드 가능하며 최대 10MB입니다.</PanelDescription>
            }
          >
            <Upload.Dragger {...hrDocUploadProps} accept=".pdf,.docx,.txt">
              <p className="ant-upload-drag-icon">
                <InboxOutlined />
              </p>
              <p className="ant-upload-text">클릭하거나 파일을 여기로 끌어다 놓으세요</p>
              <p className="ant-upload-hint">pdf · docx · txt, 최대 10MB</p>
            </Upload.Dragger>
          </Card>

          <Card
            className={ONBOARDING_PANEL_CLASS}
            size="small"
            title={<PanelDescription>업로드된 문서는 AI 비서 답변에 반영됩니다.</PanelDescription>}
          >
            <Spin spinning={hrDocQuery.isLoading}>
              <Table
                size="small"
                className="[&_.ant-table-thead>tr>th]:!tw-bg-slate-50 [&_.ant-table-thead>tr>th]:!tw-text-xs [&_.ant-table-thead>tr>th]:!tw-font-semibold [&_.ant-table-thead>tr>th]:!tw-text-slate-500"
                rowKey="id"
                pagination={false}
                locale={{ emptyText: '등록된 문서가 없습니다.' }}
                dataSource={hrDocQuery.data ?? []}
                columns={[
                  {
                    title: '문서명',
                    dataIndex: 'documentName',
                    key: 'documentName',
                  },
                  {
                    title: '업로드 일시',
                    dataIndex: 'createdAt',
                    key: 'createdAt',
                    width: 200,
                    render: (v: string) => {
                      const d = dayjs(v);
                      return d.isValid() ? d.format('YYYY-MM-DD HH:mm') : v;
                    },
                  },
                  {
                    title: '관리',
                    key: 'actions',
                    width: 100,
                    render: (_: unknown, row: { id: string }) => (
                      <Popconfirm
                        title="이 문서를 삭제할까요?"
                        okText="삭제"
                        cancelText="취소"
                        okButtonProps={{ danger: true, loading: hrDocDelete.isPending }}
                        onConfirm={() => hrDocDelete.mutate(row.id)}
                      >
                        <button
                          type="button"
                          className="tw-inline-flex tw-items-center tw-gap-1 tw-border-0 tw-bg-transparent tw-text-red-600 hover:tw-underline"
                        >
                          <DeleteOutlined />
                          삭제
                        </button>
                      </Popconfirm>
                    ),
                  },
                ]}
              />
            </Spin>
          </Card>
        </Space>
      );
    }
    return null;
  };

  const orgNextGuideOpen = current === 0 && orgGuideStep === 3 && orgCreateFlowDone;
  const esgNextGuideOpen =
    current === 6 &&
    ((esgGuideStep === 1 && onboardingEsgEnabledYn === 'NO') ||
      (esgGuideStep === 3 && onboardingEsgEnabledYn === 'YES'));
  const jobNextGuideOpen = current === 1 && jobGuideStep === 2 && hasGrades && hasTitles;
  const footerNextGuideOpen = orgNextGuideOpen || jobNextGuideOpen || esgNextGuideOpen;
  const footerNextGuideTitle = orgNextGuideOpen
    ? '다음 단계 이동'
    : jobNextGuideOpen
      ? '3단계: 다음 단계 이동'
      : current === 6 && esgGuideStep === 3 && onboardingEsgEnabledYn === 'YES'
        ? '4단계: 다음 단계 이동'
        : '2단계: 다음 단계 이동';
  const footerNextGuideContent = orgNextGuideOpen
    ? '조직 설정이 완료되었습니다. 다음 버튼으로 직급/직책 설정 단계로 이동해 주세요.'
    : jobNextGuideOpen
      ? '직급/직책 설정이 완료되었습니다. 다음 버튼으로 역할/권한 설정 단계로 이동해 주세요.'
      : current === 6 && esgGuideStep === 3 && onboardingEsgEnabledYn === 'YES'
        ? '저장이 완료되었습니다. 다음 버튼으로 다음 단계로 이동해 주세요.'
        : 'OFF를 선택했다면 저장 없이 다음 버튼으로 이동해 주세요.';
  const footerNextLabel = orgNextGuideOpen
    ? '다음 단계: 직급/직책 설정'
    : jobNextGuideOpen
      ? '다음 단계: 역할/권한 설정'
      : current === ONBOARDING_STEPS.length - 1
        ? '완료'
        : '다음';

  useEffect(() => {
    if (!footerNextGuideOpen) return;
    const scrollToBottom = () => {
      scrollNearestContainerToBottom(esgNextBtnWrapRef.current);
    };
    scrollToBottom();
    const frame = window.requestAnimationFrame(scrollToBottom);
    const timeout = window.setTimeout(() => {
      scrollToBottom();
      window.requestAnimationFrame(scrollToBottom);
    }, 120);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timeout);
    };
  }, [footerNextGuideOpen]);

  return (
    <div className="tw-flex tw-min-h-full tw-w-full tw-max-w-full tw-flex-col tw-gap-4 tw-bg-[#f8fafc] tw-px-4 tw-pb-48 tw-pt-4">
      <div className="tw-flex tw-shrink-0 tw-flex-col tw-gap-3">
        <section className="tw-rounded-2xl tw-bg-[#f8fafc] tw-px-1 tw-py-2">
          <div className="tw-flex tw-items-start tw-justify-between tw-gap-6">
            <div className="tw-min-w-0">
              <Typography.Title
                level={2}
                className="!tw-m-0 !tw-text-[28px] !tw-font-black !tw-leading-tight !tw-tracking-normal !tw-text-slate-950"
              >
                초기 회사 온보딩
              </Typography.Title>
              <Typography.Paragraph className="!tw-mb-0 !tw-mt-3 tw-max-w-3xl !tw-text-[15px] !tw-leading-6 !tw-text-slate-600">
                성공적인 조직 관리를 위한 핵심 설정 단계입니다. 생성/조회 API가 연동되어 있으며,
                나중에 설정하려면 언제든지 건너뛸 수 있습니다.
              </Typography.Paragraph>
            </div>
            <Popconfirm
              title="온보딩 전체를 건너뛸까요?"
              description="남은 단계 없이 온보딩을 완료 처리하고 메인 화면으로 이동합니다. 이후 설정 메뉴에서 언제든 이어서 구성할 수 있습니다."
              okText="건너뛰기"
              cancelText="취소"
              onConfirm={() => void finishMutation.mutateAsync()}
            >
              <Button
                type="link"
                className="!tw-h-auto !tw-shrink-0 !tw-px-0 !tw-py-1 !tw-text-sm !tw-font-bold !tw-text-[#155EEF]"
                loading={finishMutation.isPending}
              >
                전체 건너뛰기 <RightOutlined className="tw-text-[10px]" />
              </Button>
            </Popconfirm>
          </div>

          <div className="tw-mt-10">
            <div className="tw-mb-6 tw-flex tw-items-center tw-justify-between">
              <Typography.Text className="tw-text-[12px] tw-font-bold tw-uppercase tw-tracking-[0.16em] tw-text-slate-500">
                Progress
              </Typography.Text>
              <span className="tw-text-lg tw-font-black tw-leading-none tw-text-[#155EEF]">
                {progressPercent}%
              </span>
            </div>
            <Progress
              percent={progressPercent}
              showInfo={false}
              size="small"
              strokeColor="#2563EB"
              trailColor="#e2e8f0"
            />
          </div>

          <nav aria-label="온보딩 단계" className="tw-mt-7 tw-w-full">
            <ol
              className="tw-m-0 tw-grid tw-w-full tw-list-none tw-gap-3 tw-p-0"
              style={{
                gridTemplateColumns: `repeat(${ONBOARDING_STEPS.length}, minmax(0, 1fr))`,
              }}
            >
              {ONBOARDING_STEPS.map((step, idx) => {
                const isActive = current === idx;
                const status = statuses[idx] ?? 'pending';
                const isCompleted = status === 'completed';
                const isSkipped = status === 'skipped';
                const nodeClass = isActive
                  ? 'tw-border-[#2563EB] tw-bg-[#2563EB] tw-text-white tw-shadow-[0_10px_20px_rgba(37,99,235,0.22)]'
                  : isCompleted
                    ? 'tw-border-emerald-500 tw-bg-emerald-500 tw-text-white'
                    : isSkipped
                      ? 'tw-border-slate-200 tw-bg-slate-100 tw-text-slate-400'
                      : 'tw-border-slate-200 tw-bg-white tw-text-slate-500 hover:tw-border-blue-200 hover:tw-text-[#2563EB]';
                const labelClass = isActive
                  ? 'tw-text-[#155EEF]'
                  : isCompleted
                    ? 'tw-text-emerald-700'
                    : 'tw-text-slate-500';

                return (
                  <li key={step.title} className="tw-min-w-0">
                    <button
                      type="button"
                      className="tw-group tw-flex tw-w-full tw-min-w-0 tw-flex-col tw-items-center tw-gap-2 tw-border-0 tw-bg-transparent tw-p-0 tw-text-center"
                      onClick={() => setCurrent(idx)}
                      title={`${idx + 1}단계: ${step.title}`}
                      aria-label={`${idx + 1}단계: ${step.title}`}
                    >
                      <span
                        className={`tw-flex tw-h-11 tw-w-11 tw-items-center tw-justify-center tw-rounded-xl tw-border tw-text-lg tw-transition-all ${nodeClass}`}
                      >
                        {isCompleted && !isActive ? <CheckCircleOutlined /> : step.icon}
                      </span>
                      <span
                        className={`tw-block tw-w-full tw-truncate tw-text-[11px] tw-font-semibold tw-leading-4 ${labelClass}`}
                      >
                        {step.title}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </nav>
        </section>
      </div>

      <Card
        className="tw-mb-48 tw-shrink-0 tw-border-slate-200/80 tw-shadow-[0_1px_3px_rgba(15,23,42,0.06)]"
        styles={{
          body: {
            paddingTop: 12,
            paddingBottom: 12,
          },
        }}
        title={
          <div className="tw-flex tw-min-w-0 tw-flex-wrap tw-items-center tw-justify-between tw-gap-3 tw-py-0.5">
            <div className="tw-min-w-0">
              <Typography.Text className="tw-block tw-text-[10px] tw-font-bold tw-uppercase tw-tracking-[0.08em] tw-text-slate-400">
                {`Step ${current + 1} of ${ONBOARDING_STEPS.length}`}
              </Typography.Text>
              <span className="tw-block tw-truncate tw-text-base tw-font-bold tw-leading-tight tw-text-slate-950">
                {currentStep.title}
              </span>
            </div>
            <div className="tw-flex tw-flex-wrap tw-items-center tw-gap-2">
              {stepTag(statuses[current] ?? 'pending')}
              <Tag className="!tw-m-0 !tw-rounded-full !tw-border-slate-200 !tw-bg-white !tw-px-2.5 !tw-py-0.5 !tw-text-xs !tw-font-semibold !tw-text-slate-500">
                {`${currentStep.apis.length}개 API`}
              </Tag>
            </div>
          </div>
        }
      >
        <div className="tw-flex tw-flex-col tw-gap-3">
          <div className="tw-flex tw-flex-col tw-px-2">{renderStepContent()}</div>
          <div className="tw-flex tw-shrink-0 tw-flex-wrap tw-items-center tw-justify-between tw-gap-3 tw-border-t tw-border-slate-100 tw-pb-6 tw-pt-3">
            <Typography.Text className="tw-text-xs tw-font-medium tw-text-slate-400">
              단계별 설정은 선택 사항이며, 다음 버튼을 누르면 현재 단계가 완료로 표시됩니다.
            </Typography.Text>
            <Space wrap>
              <AppButton variant="secondary" onClick={gotoPrev} disabled={current === 0}>
                이전
              </AppButton>
              <Popover
                {...ORG_GUIDE_POPOVER_SHARED}
                title={footerNextGuideTitle}
                content={
                  <Typography.Paragraph className="!tw-mb-0 tw-max-w-[280px] tw-text-sm">
                    {footerNextGuideContent}
                  </Typography.Paragraph>
                }
                open={footerNextGuideOpen}
                placement="topRight"
                overlayStyle={{ zIndex: 1060 }}
              >
                <span
                  ref={esgNextBtnWrapRef}
                  className={
                    footerNextGuideOpen
                      ? 'tw-inline-block tw-rounded-xl tw-ring-2 tw-ring-blue-500 tw-ring-offset-2'
                      : 'tw-inline-block'
                  }
                >
                  <AppButton
                    variant="primary"
                    className={orgNextGuideOpen || jobNextGuideOpen ? 'tw-min-w-[220px]' : ''}
                    onClick={gotoNext}
                    loading={isLast ? finishMutation.isPending : false}
                  >
                    {footerNextLabel}
                  </AppButton>
                </span>
              </Popover>
            </Space>
          </div>
        </div>
      </Card>
    </div>
  );
}
