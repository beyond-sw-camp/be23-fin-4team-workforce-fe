import {
  DeleteOutlined,
  EditOutlined,
  HolderOutlined,
  PlusOutlined,
  RightOutlined,
  SettingOutlined,
} from '@ant-design/icons';
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
import {
  App,
  Button,
  Card,
  Form,
  Input,
  Popover,
  Radio,
  Space,
  Tabs,
  Tooltip,
  Tree,
  Typography,
} from 'antd';
import type { DataNode } from 'antd/es/tree';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useMemo, useState, type ComponentProps, type CSSProperties, type Key } from 'react';
import {
  type OrganizationTreeNode,
  organizationApi,
} from '@/features/organization/api/organizationApi';
import { OrganizationRolesSection } from '@/features/organization/ui/OrganizationRolesSection';
import { AppWorkspacePageTitle } from '@/shared/ui/AppWorkspacePageTitle';
import { AdminOrgRestructurePage } from '@/pages/app/organization/AdminOrgRestructurePage';
import { AppDoubleActionModal } from '@/shared/ui/AppDoubleActionModal';

type OrgSettingsTab = 'structure' | 'grades' | 'titles' | 'roles' | 'restructure';
type OrgStructureLayoutDirection = 'horizontal' | 'vertical';
type OrgStructureViewSettings = {
  layoutDirection: OrgStructureLayoutDirection;
};
type OrgDraftNode = {
  key: string;
  title: string;
  parentId: string | null;
  children?: OrgDraftNode[];
  isNew?: boolean;
};
type GradeDraftRow = {
  key: string;
  id?: string;
  name: string;
  displayOrder: number;
  isNew?: boolean;
};

const ORG_TAB_KEYS: readonly OrgSettingsTab[] = [
  'structure',
  'grades',
  'titles',
  'roles',
  'restructure',
] as const;
const ORG_VIEW_STORAGE_LAYOUT = 'wf-org-chart-layout-v2';
const ORG_VIEW_LEGACY_LAYOUT = 'wf-org-chart-layout';

function readStoredOrgViewSettings(): OrgStructureViewSettings {
  let layoutDirection: OrgStructureLayoutDirection = 'horizontal';
  try {
    const storedLayout = sessionStorage.getItem(ORG_VIEW_STORAGE_LAYOUT);
    if (storedLayout === 'horizontal' || storedLayout === 'vertical')
      layoutDirection = storedLayout;
  } catch {
    /* ignore */
  }
  return { layoutDirection };
}

function parseOrgTab(raw: unknown): OrgSettingsTab {
  if (typeof raw === 'string' && (ORG_TAB_KEYS as readonly string[]).includes(raw)) {
    return raw as OrgSettingsTab;
  }
  return 'structure';
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
  const sortNodes = (items: OrganizationTreeNode[]) =>
    [...items].sort((a, b) => (pickDisplayOrder(a) ?? 999_999) - (pickDisplayOrder(b) ?? 999_999));
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
        children: Array.isArray(ch) ? sortNodes(ch).map((c, i) => mapOne(c, i)) : undefined,
      };
    };
    return sortNodes(nodes).map((n, i) => mapOne(n, i));
  }

  const byId = new Map<string, DataNode & { parentId: string | null }>();
  const orderById = new Map<string, number | undefined>();
  nodes.forEach((n) => {
    const id = pickOrgId(n);
    if (!id) return;
    orderById.set(id, pickDisplayOrder(n));
    byId.set(id, {
      key: id,
      title: pickOrgName(n) || '(이름 없음)',
      children: [],
      parentId: pickParentId(n),
    });
  });
  const roots: DataNode[] = [];
  byId.forEach((node, id) => {
    const p = node.parentId;
    if (p && byId.has(p)) {
      const parent = byId.get(p)!;
      if (!parent.children) parent.children = [];
      (parent.children as DataNode[]).push(node);
    } else {
      roots.push(node);
    }
  });
  const sortDataNodes = (items: DataNode[]): DataNode[] =>
    items
      .sort((a, b) => {
        const aOrder = orderById.get(String(a.key));
        const bOrder = orderById.get(String(b.key));
        return (aOrder ?? 999_999) - (bOrder ?? 999_999);
      })
      .map((node) => ({
        ...node,
        children: Array.isArray(node.children) ? sortDataNodes(node.children) : node.children,
      }));
  return sortDataNodes(roots);
}

function pickRowId(row: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = row[k];
    if (typeof v === 'string' && v) return v;
    if (typeof v === 'number') return String(v);
  }
  return '';
}

function pickDisplayOrder(row: Record<string, unknown>): number | undefined {
  const raw = row.displayOrder ?? row.display_order;
  if (typeof raw === 'number' && !Number.isNaN(raw)) return raw;
  if (typeof raw === 'string' && raw.trim() !== '') {
    const n = Number(raw);
    return Number.isNaN(n) ? undefined : n;
  }
  return undefined;
}

function toGradeDraftRows(rows: Array<Record<string, unknown>>): GradeDraftRow[] {
  return rows
    .map((row, index) => {
      const id = pickRowId(row, ['id', 'jobGradeId', 'job_grade_id']);
      const displayOrder = pickDisplayOrder(row);
      return {
        key: id || `grade-row-${index}`,
        ...(id ? { id } : {}),
        name: typeof row.name === 'string' ? row.name : String(row.name ?? ''),
        displayOrder: displayOrder ?? index,
      };
    })
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .map((row, index) => ({ ...row, displayOrder: index }));
}

function toTitleDraftRows(rows: Array<Record<string, unknown>>): GradeDraftRow[] {
  return rows
    .map((row, index) => {
      const id = pickRowId(row, ['id', 'jobTitleId', 'job_title_id']);
      const displayOrder = pickDisplayOrder(row);
      return {
        key: id || `title-row-${index}`,
        ...(id ? { id } : {}),
        name: typeof row.name === 'string' ? row.name : String(row.name ?? ''),
        displayOrder: displayOrder ?? index,
      };
    })
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .map((row, index) => ({ ...row, displayOrder: index }));
}

function toDraftNodes(nodes: DataNode[], parentId: string | null = null): OrgDraftNode[] {
  return nodes.map((node) => {
    const key = String(node.key);
    const title = typeof node.title === 'string' ? node.title : String(node.title ?? '');
    return {
      key,
      title,
      parentId,
      children: Array.isArray(node.children) ? toDraftNodes(node.children, key) : undefined,
    };
  });
}

function draftToTreeData(nodes: OrgDraftNode[]): DataNode[] {
  return nodes.map((node) => ({
    key: node.key,
    title: node.title,
    children: node.children ? draftToTreeData(node.children) : undefined,
    isNew: node.isNew,
    parentId: node.parentId,
  }));
}

function addDraftNode(
  nodes: OrgDraftNode[],
  parentId: string | null,
  node: OrgDraftNode,
): OrgDraftNode[] {
  if (parentId === null) return [...nodes, node];
  return nodes.map((item) => {
    if (item.key === parentId) {
      return { ...item, children: [...(item.children ?? []), node] };
    }
    return {
      ...item,
      children: item.children ? addDraftNode(item.children, parentId, node) : item.children,
    };
  });
}

function updateDraftName(nodes: OrgDraftNode[], id: string, name: string): OrgDraftNode[] {
  return nodes.map((node) => {
    if (node.key === id) return { ...node, title: name };
    return {
      ...node,
      children: node.children ? updateDraftName(node.children, id, name) : node.children,
    };
  });
}

function collectExistingIds(nodes: OrgDraftNode[]): string[] {
  return nodes.flatMap((node) => [
    ...(node.isNew ? [] : [node.key]),
    ...(node.children ? collectExistingIds(node.children) : []),
  ]);
}

function removeDraftNode(
  nodes: OrgDraftNode[],
  id: string,
): { next: OrgDraftNode[]; removedExistingIds: string[] } {
  const removedExistingIds: string[] = [];
  const next = nodes
    .map((node) => {
      if (node.key === id) {
        removedExistingIds.push(...collectExistingIds([node]));
        return null;
      }
      if (!node.children) return node;
      const result = removeDraftNode(node.children, id);
      removedExistingIds.push(...result.removedExistingIds);
      return { ...node, children: result.next };
    })
    .filter((node): node is OrgDraftNode => node !== null);
  return { next, removedExistingIds };
}

function flattenDraftNodes(nodes: OrgDraftNode[]): OrgDraftNode[] {
  return nodes.flatMap((node) => [
    node,
    ...(node.children ? flattenDraftNodes(node.children) : []),
  ]);
}

function collectNewDraftNodes(nodes: OrgDraftNode[]): OrgDraftNode[] {
  return nodes.flatMap((node) => [
    ...(node.isNew ? [node] : []),
    ...(node.children ? collectNewDraftNodes(node.children) : []),
  ]);
}

function findDraftNode(nodes: OrgDraftNode[], id: string): OrgDraftNode | null {
  for (const node of nodes) {
    if (node.key === id) return node;
    if (node.children) {
      const found = findDraftNode(node.children, id);
      if (found) return found;
    }
  }
  return null;
}

function reorderDraftSiblings(
  nodes: OrgDraftNode[],
  parentId: string | null,
  dragId: string,
  dropId: string,
  placeAfter: boolean,
): OrgDraftNode[] {
  const reorder = (siblings: OrgDraftNode[]) => {
    const from = siblings.findIndex((node) => node.key === dragId);
    const to = siblings.findIndex((node) => node.key === dropId);
    if (from < 0 || to < 0) return siblings;
    const movingNode = siblings[from];
    if (!movingNode) return siblings;
    const next = siblings.filter((node) => node.key !== dragId);
    let insertAt = placeAfter ? to + 1 : to;
    if (from < insertAt) insertAt -= 1;
    next.splice(insertAt, 0, movingNode);
    return next;
  };

  if (parentId === null) return reorder(nodes);

  return nodes.map((node) => {
    if (node.key === parentId) {
      return { ...node, children: reorder(node.children ?? []) };
    }
    return {
      ...node,
      children: node.children
        ? reorderDraftSiblings(node.children, parentId, dragId, dropId, placeAfter)
        : node.children,
    };
  });
}

function collectSiblingIdLists(nodes: OrgDraftNode[], idMap: Map<string, string>): string[][] {
  const toRealId = (id: string) => (id.startsWith('draft-org-') ? idMap.get(id) : id);
  const ownList = nodes.map((node) => toRealId(node.key)).filter((id): id is string => Boolean(id));
  return [
    ...(ownList.length > 1 ? [ownList] : []),
    ...nodes.flatMap((node) => (node.children ? collectSiblingIdLists(node.children, idMap) : [])),
  ];
}

function OrgStructureViewSettingsPopover({
  value,
  onChange,
}: {
  value: OrgStructureViewSettings;
  onChange: (next: OrgStructureViewSettings) => void;
}) {
  const content = (
    <div className="tw-w-[min(92vw,300px)] tw-space-y-5 tw-py-0.5">
      <section>
        <div className="tw-mb-2 tw-text-xs tw-font-semibold tw-tracking-wide tw-text-slate-500">
          정렬 방식
        </div>
        <Radio.Group
          value={value.layoutDirection}
          onChange={(e) =>
            onChange({ layoutDirection: e.target.value as OrgStructureLayoutDirection })
          }
          className="tw-flex tw-w-full tw-flex-col tw-gap-2 [&_.ant-radio-wrapper]:tw-mr-0 [&_.ant-radio-wrapper]:tw-w-full [&_.ant-radio-wrapper]:tw-rounded-lg [&_.ant-radio-wrapper]:tw-border [&_.ant-radio-wrapper]:tw-border-slate-200 [&_.ant-radio-wrapper]:tw-px-3 [&_.ant-radio-wrapper]:tw-py-2 [&_.ant-radio-wrapper]:tw-transition-colors [&_.ant-radio-wrapper-checked]:tw-border-[#2563eb] [&_.ant-radio-wrapper-checked]:tw-bg-[#eff6ff]"
        >
          <Radio value="horizontal" className="!tw-items-start">
            <span className="tw-flex tw-flex-col tw-gap-0.5 tw-text-left">
              <span className="tw-text-sm tw-font-semibold tw-text-slate-900">옆으로</span>
              <span className="tw-text-xs tw-font-normal tw-text-slate-500">
                접는 조직 구조 목록
              </span>
            </span>
          </Radio>
          <Radio value="vertical" className="!tw-items-start">
            <span className="tw-flex tw-flex-col tw-gap-0.5 tw-text-left">
              <span className="tw-text-sm tw-font-semibold tw-text-slate-900">아래로</span>
              <span className="tw-text-xs tw-font-normal tw-text-slate-500">카드형 조직 계층</span>
            </span>
          </Radio>
        </Radio.Group>
      </section>
    </div>
  );

  return (
    <Popover
      content={content}
      trigger="click"
      placement="bottomRight"
      overlayClassName="[&_.ant-popover-inner]:tw-p-4"
    >
      <Button
        type="text"
        className="!tw-inline-flex !tw-h-8 !tw-items-center !tw-justify-center !tw-gap-1.5 !tw-rounded-md !tw-border !tw-border-slate-200 !tw-bg-white !tw-px-2.5 !tw-text-slate-700 hover:!tw-border-slate-300 hover:!tw-bg-slate-50 hover:!tw-text-slate-900"
        aria-label="뷰 설정"
      >
        <SettingOutlined className="!tw-text-sm" />
        <span className="tw-text-xs tw-font-semibold">뷰 설정</span>
      </Button>
    </Popover>
  );
}

function OrgStructureVerticalNode({ node }: { node: DataNode }) {
  const children = Array.isArray(node.children) ? node.children : [];
  const title = typeof node.title === 'string' ? node.title : String(node.title ?? '');
  return (
    <>
      <div className="org-structure-card tw-min-w-[180px] tw-rounded-xl tw-border tw-border-slate-200 tw-bg-white tw-px-4 tw-py-3 tw-text-center tw-shadow-[0_1px_3px_rgba(15,23,42,0.06)]">
        <Typography.Text className="tw-text-sm tw-font-semibold tw-text-slate-800">
          {title}
        </Typography.Text>
      </div>
      {children.length > 0 ? (
        <ul>
          {children.map((child) => (
            <li key={String(child.key)}>
              <OrgStructureVerticalNode node={child} />
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
}

function SortableSettingRow({
  row,
  index,
  onEdit,
  onDelete,
  dragLabel,
  editLabel,
  deleteLabel,
}: {
  row: GradeDraftRow;
  index: number;
  onEdit: (row: GradeDraftRow) => void;
  onDelete: (row: GradeDraftRow) => void;
  dragLabel: string;
  editLabel: string;
  deleteLabel: string;
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
      className={`tw-grid tw-min-h-14 tw-grid-cols-[44px_1fr_100px_112px] tw-items-center tw-border-t tw-border-slate-100 tw-bg-white tw-px-3 tw-text-sm tw-text-slate-700 ${
        isDragging ? 'tw-relative tw-z-10 tw-shadow-lg' : ''
      }`}
    >
      <button
        type="button"
        className="tw-flex tw-h-7 tw-w-7 tw-cursor-grab tw-items-center tw-justify-center tw-rounded-md tw-border-0 tw-bg-transparent tw-p-0 tw-text-slate-400 tw-shadow-none hover:tw-bg-transparent hover:tw-text-slate-600 focus:tw-border-0 focus:tw-bg-transparent focus:tw-outline-none active:tw-cursor-grabbing"
        aria-label={dragLabel}
        {...attributes}
        {...listeners}
      >
        <HolderOutlined className="tw-text-slate-400" />
      </button>
      <div className="tw-min-w-0 tw-font-medium tw-text-slate-900">{row.name || '(이름 없음)'}</div>
      <div className="tw-text-slate-600">{index}</div>
      <div className="tw-flex tw-justify-end tw-gap-1">
        <Tooltip title="수정">
          <Button
            type="text"
            size="small"
            icon={<EditOutlined />}
            aria-label={editLabel}
            className="!tw-inline-flex !tw-items-center !tw-justify-center !tw-text-slate-600 hover:!tw-bg-slate-100 hover:!tw-text-slate-900"
            onClick={() => onEdit(row)}
          />
        </Tooltip>
        <Tooltip title="삭제">
          <Button
            type="text"
            size="small"
            danger
            icon={<DeleteOutlined />}
            aria-label={deleteLabel}
            className="!tw-inline-flex !tw-items-center !tw-justify-center"
            onClick={() => onDelete(row)}
          />
        </Tooltip>
      </div>
    </div>
  );
}

export function OrganizationPage() {
  const { message, modal } = App.useApp();
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { tab?: string };
  const activeTab = parseOrgTab(search.tab);
  const qc = useQueryClient();
  const [selectedOrgKeys, setSelectedOrgKeys] = useState<Key[]>([]);
  const [isOrgEditing, setIsOrgEditing] = useState(false);
  const [draftOrgTree, setDraftOrgTree] = useState<OrgDraftNode[]>([]);
  const [draftDeletedOrgIds, setDraftDeletedOrgIds] = useState<string[]>([]);
  const [draftOrgSeq, setDraftOrgSeq] = useState(0);
  const [isGradeEditing, setIsGradeEditing] = useState(false);
  const [draftGrades, setDraftGrades] = useState<GradeDraftRow[]>([]);
  const [draftDeletedGradeIds, setDraftDeletedGradeIds] = useState<string[]>([]);
  const [draftGradeSeq, setDraftGradeSeq] = useState(0);
  const [isTitleEditing, setIsTitleEditing] = useState(false);
  const [draftTitles, setDraftTitles] = useState<GradeDraftRow[]>([]);
  const [draftDeletedTitleIds, setDraftDeletedTitleIds] = useState<string[]>([]);
  const [draftTitleSeq, setDraftTitleSeq] = useState(0);
  const [orgViewSettings, setOrgViewSettings] = useState<OrgStructureViewSettings>(() =>
    readStoredOrgViewSettings(),
  );
  const [orgModal, setOrgModal] = useState<
    null | { mode: 'create'; parentId: string | null } | { mode: 'edit'; id: string; name: string }
  >(null);
  const [gradeModal, setGradeModal] = useState<
    null | { mode: 'create' } | { mode: 'edit'; key: string; name: string }
  >(null);
  const [titleModal, setTitleModal] = useState<
    null | { mode: 'create' } | { mode: 'edit'; key: string; name: string }
  >(null);
  const [orgForm] = Form.useForm<{ name: string }>();
  const [gradeForm] = Form.useForm<{ name: string; displayOrder: number }>();
  const [titleForm] = Form.useForm<{ name: string; displayOrder: number }>();

  const {
    data: orgList = [],
    isFetching: orgLoading,
    refetch: refetchOrgList,
  } = useQuery({
    queryKey: ['organization', 'list'],
    queryFn: () => organizationApi.list(),
    staleTime: 0,
  });

  const { data: grades = [], isFetching: gradesLoading } = useQuery({
    queryKey: ['organization', 'job-grades'],
    queryFn: () => organizationApi.listJobGrades(),
  });

  const { data: titles = [], isFetching: titlesLoading } = useQuery({
    queryKey: ['organization', 'job-titles'],
    queryFn: () => organizationApi.listJobTitles(),
  });

  const treeData = useMemo(() => toTreeNodes(orgList), [orgList]);
  const originalOrgNameById = useMemo(() => {
    const map = new Map<string, string>();
    flattenDraftNodes(toDraftNodes(treeData)).forEach((node) => map.set(node.key, node.title));
    return map;
  }, [treeData]);
  const displayedTreeData = useMemo(
    () => (isOrgEditing ? draftToTreeData(draftOrgTree) : treeData),
    [draftOrgTree, isOrgEditing, treeData],
  );
  const selectedOrgId = selectedOrgKeys[0] != null ? String(selectedOrgKeys[0]) : '';
  const originalGradeById = useMemo(() => {
    const map = new Map<string, GradeDraftRow>();
    toGradeDraftRows(grades).forEach((row) => {
      if (row.id) map.set(row.id, row);
    });
    return map;
  }, [grades]);
  const displayedGrades = useMemo(
    () => (isGradeEditing ? draftGrades : toGradeDraftRows(grades)),
    [draftGrades, grades, isGradeEditing],
  );
  const originalTitleById = useMemo(() => {
    const map = new Map<string, GradeDraftRow>();
    toTitleDraftRows(titles).forEach((row) => {
      if (row.id) map.set(row.id, row);
    });
    return map;
  }, [titles]);
  const displayedTitles = useMemo(
    () => (isTitleEditing ? draftTitles : toTitleDraftRows(titles)),
    [draftTitles, titles, isTitleEditing],
  );
  const gradeSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );
  const titleSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const persistOrgViewSettings = (next: OrgStructureViewSettings) => {
    setOrgViewSettings(next);
    try {
      sessionStorage.setItem(ORG_VIEW_STORAGE_LAYOUT, next.layoutDirection);
      sessionStorage.removeItem(ORG_VIEW_LEGACY_LAYOUT);
    } catch {
      /* ignore */
    }
  };

  const createOrgM = useMutation({
    mutationFn: organizationApi.create,
    onSuccess: async () => {
      message.success('조직이 등록되었습니다.');
      setOrgModal(null);
      void qc.invalidateQueries({ queryKey: ['organization', 'org-chart'] });
      await refetchOrgList();
    },
    onError: (e: Error) => message.error(e.message || '등록에 실패했습니다.'),
  });

  const updateOrgM = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      organizationApi.update(id, { name }),
    onSuccess: async () => {
      message.success('조직명이 수정되었습니다.');
      setOrgModal(null);
      void qc.invalidateQueries({ queryKey: ['organization', 'org-chart'] });
      await refetchOrgList();
    },
    onError: (e: Error) => message.error(e.message || '수정에 실패했습니다.'),
  });

  const deleteOrgM = useMutation({
    mutationFn: organizationApi.remove,
    onSuccess: async () => {
      message.success('조직이 삭제되었습니다.');
      setSelectedOrgKeys([]);
      void qc.invalidateQueries({ queryKey: ['organization', 'org-chart'] });
      await refetchOrgList();
    },
    onError: (e: Error) => message.error(e.message || '삭제에 실패했습니다.'),
  });

  const saveOrgDraftM = useMutation({
    mutationFn: async () => {
      const createdIdByTempId = new Map<string, string>();
      const deletedIds = [...new Set(draftDeletedOrgIds)].reverse();

      for (const id of deletedIds) {
        await organizationApi.remove(id);
      }

      for (const node of collectNewDraftNodes(draftOrgTree)) {
        const parentId = node.parentId?.startsWith('draft-org-')
          ? (createdIdByTempId.get(node.parentId) ?? null)
          : node.parentId;
        const created = (await organizationApi.create({
          name: node.title.trim(),
          parentId,
        })) as unknown;
        const rawId =
          typeof created === 'string' || typeof created === 'number'
            ? created
            : created && typeof created === 'object'
              ? ((created as Record<string, unknown>).id ??
                (created as Record<string, unknown>).organizationId ??
                (created as Record<string, unknown>).organization_id)
              : null;
        if (typeof rawId === 'string' && rawId) createdIdByTempId.set(node.key, rawId);
        if (typeof rawId === 'number') createdIdByTempId.set(node.key, String(rawId));
      }

      const changedExistingNodes = flattenDraftNodes(draftOrgTree).filter((node) => {
        if (node.isNew || draftDeletedOrgIds.includes(node.key)) return false;
        return originalOrgNameById.get(node.key) !== node.title;
      });
      for (const node of changedExistingNodes) {
        await organizationApi.update(node.key, { name: node.title.trim() });
      }

      for (const siblingIds of collectSiblingIdLists(draftOrgTree, createdIdByTempId)) {
        await organizationApi.reorder(siblingIds);
      }
    },
    onSuccess: async () => {
      message.success('조직 구조 수정사항이 저장되었습니다.');
      setIsOrgEditing(false);
      setDraftOrgTree([]);
      setDraftDeletedOrgIds([]);
      setSelectedOrgKeys([]);
      void qc.invalidateQueries({ queryKey: ['organization', 'org-chart'] });
      await refetchOrgList();
    },
    onError: (e: Error) => message.error(e.message || '조직 구조 저장에 실패했습니다.'),
  });

  const saveGradeDraftM = useMutation({
    mutationFn: async () => {
      const createdIdByTempKey = new Map<string, string>();
      const deletedIds = [...new Set(draftDeletedGradeIds)];

      for (const id of deletedIds) {
        await organizationApi.removeJobGrade(id);
      }

      let createIndex = 0;
      for (const row of draftGrades.filter((item) => item.isNew)) {
        const created = (await organizationApi.createJobGrade({
          name: row.name.trim(),
          displayOrder: grades.length + createIndex,
        })) as unknown;
        createIndex += 1;
        const rawId =
          typeof created === 'string' || typeof created === 'number'
            ? created
            : created && typeof created === 'object'
              ? ((created as Record<string, unknown>).id ??
                (created as Record<string, unknown>).jobGradeId ??
                (created as Record<string, unknown>).job_grade_id)
              : null;
        if (typeof rawId === 'string' && rawId) createdIdByTempKey.set(row.key, rawId);
        if (typeof rawId === 'number') createdIdByTempKey.set(row.key, String(rawId));
      }

      for (const row of draftGrades) {
        if (!row.id || row.isNew || deletedIds.includes(row.id)) continue;
        const original = originalGradeById.get(row.id);
        if (!original || original.name !== row.name || original.displayOrder !== row.displayOrder) {
          await organizationApi.updateJobGrade(row.id, {
            name: row.name.trim(),
            displayOrder: row.displayOrder,
          });
        }
      }

      const orderedIds = draftGrades
        .map((row) => (row.isNew ? createdIdByTempKey.get(row.key) : row.id))
        .filter((id): id is string => Boolean(id));
      if (orderedIds.length > 1) {
        await organizationApi.reorderJobGrades(orderedIds);
      }
    },
    onSuccess: () => {
      message.success('직급 수정사항이 저장되었습니다.');
      setIsGradeEditing(false);
      setDraftGrades([]);
      setDraftDeletedGradeIds([]);
      setGradeModal(null);
      void qc.invalidateQueries({ queryKey: ['organization', 'job-grades'] });
      void qc.invalidateQueries({ queryKey: ['organization', 'org-chart'] });
    },
    onError: (e: Error) => message.error(e.message || '직급 저장에 실패했습니다.'),
  });

  const saveTitleDraftM = useMutation({
    mutationFn: async () => {
      const createdIdByTempKey = new Map<string, string>();
      const deletedIds = [...new Set(draftDeletedTitleIds)];

      for (const id of deletedIds) {
        await organizationApi.removeJobTitle(id);
      }

      let createIndex = 0;
      for (const row of draftTitles.filter((item) => item.isNew)) {
        const created = (await organizationApi.createJobTitle({
          name: row.name.trim(),
          displayOrder: titles.length + createIndex,
        })) as unknown;
        createIndex += 1;
        const rawId =
          typeof created === 'string' || typeof created === 'number'
            ? created
            : created && typeof created === 'object'
              ? ((created as Record<string, unknown>).id ??
                (created as Record<string, unknown>).jobTitleId ??
                (created as Record<string, unknown>).job_title_id)
              : null;
        if (typeof rawId === 'string' && rawId) createdIdByTempKey.set(row.key, rawId);
        if (typeof rawId === 'number') createdIdByTempKey.set(row.key, String(rawId));
      }

      for (const row of draftTitles) {
        if (!row.id || row.isNew || deletedIds.includes(row.id)) continue;
        const original = originalTitleById.get(row.id);
        if (!original || original.name !== row.name || original.displayOrder !== row.displayOrder) {
          await organizationApi.updateJobTitle(row.id, {
            name: row.name.trim(),
            displayOrder: row.displayOrder,
          });
        }
      }

      const orderedIds = draftTitles
        .map((row) => (row.isNew ? createdIdByTempKey.get(row.key) : row.id))
        .filter((id): id is string => Boolean(id));
      if (orderedIds.length > 1) {
        await organizationApi.reorderJobTitles(orderedIds);
      }
    },
    onSuccess: () => {
      message.success('직책 수정사항이 저장되었습니다.');
      setIsTitleEditing(false);
      setDraftTitles([]);
      setDraftDeletedTitleIds([]);
      setTitleModal(null);
      void qc.invalidateQueries({ queryKey: ['organization', 'job-titles'] });
      void qc.invalidateQueries({ queryKey: ['organization', 'org-chart'] });
    },
    onError: (e: Error) => message.error(e.message || '직책 저장에 실패했습니다.'),
  });

  const startOrgEditing = () => {
    setDraftOrgTree(toDraftNodes(treeData));
    setDraftDeletedOrgIds([]);
    setSelectedOrgKeys([]);
    setIsOrgEditing(true);
  };

  const cancelOrgEditing = () => {
    setIsOrgEditing(false);
    setDraftOrgTree([]);
    setDraftDeletedOrgIds([]);
    setSelectedOrgKeys([]);
    setOrgModal(null);
  };

  const openCreateChild = (parentId = selectedOrgId) => {
    if (!isOrgEditing) return;
    if (!parentId) {
      message.warning('상위로 쓸 조직을 트리에서 선택해 주세요.');
      return;
    }
    orgForm.resetFields();
    setOrgModal({ mode: 'create', parentId });
  };

  const handleOrgDrop = (
    info: Parameters<NonNullable<ComponentProps<typeof Tree>['onDrop']>>[0],
  ) => {
    if (!isOrgEditing) return;
    const dragId = String(info.dragNode.key);
    const dropId = String(info.node.key);
    if (!dragId || !dropId || dragId === dropId) return;

    const dragNode = findDraftNode(draftOrgTree, dragId);
    const dropNode = findDraftNode(draftOrgTree, dropId);
    if (!dragNode || !dropNode) return;

    const dropPos = String(info.node.pos).split('-');
    const dropPosition = info.dropPosition - Number(dropPos[dropPos.length - 1]);
    if (dropPosition === 0) {
      message.info(
        '조직의 상하 순서만 변경할 수 있습니다. 다른 조직 하위로 이동은 지원하지 않습니다.',
      );
      return;
    }
    if (dragNode.parentId !== dropNode.parentId) {
      message.info('같은 상위 조직을 가진 조직끼리만 순서를 바꿀 수 있습니다.');
      return;
    }

    setDraftOrgTree((nodes) =>
      reorderDraftSiblings(nodes, dragNode.parentId, dragId, dropId, dropPosition > 0),
    );
    setSelectedOrgKeys([dragId]);
  };

  const submitOrgModal = async () => {
    const v = await orgForm.validateFields();
    if (!orgModal) return;
    const name = v.name.trim();
    if (isOrgEditing) {
      if (orgModal.mode === 'create') {
        const key = `draft-org-${draftOrgSeq + 1}`;
        setDraftOrgSeq((seq) => seq + 1);
        setDraftOrgTree((nodes) =>
          addDraftNode(nodes, orgModal.parentId, {
            key,
            title: name,
            parentId: orgModal.parentId,
            isNew: true,
          }),
        );
        setSelectedOrgKeys([key]);
      } else {
        setDraftOrgTree((nodes) => updateDraftName(nodes, orgModal.id, name));
      }
      setOrgModal(null);
      return;
    }
    if (orgModal.mode === 'create') {
      createOrgM.mutate({ name, parentId: orgModal.parentId });
    } else {
      updateOrgM.mutate({ id: orgModal.id, name });
    }
  };

  const startGradeEditing = () => {
    setDraftGrades(toGradeDraftRows(grades));
    setDraftDeletedGradeIds([]);
    setGradeModal(null);
    setIsGradeEditing(true);
  };

  const cancelGradeEditing = () => {
    setIsGradeEditing(false);
    setDraftGrades([]);
    setDraftDeletedGradeIds([]);
    setGradeModal(null);
  };

  const openCreateGrade = () => {
    if (!isGradeEditing) return;
    gradeForm.resetFields();
    setGradeModal({ mode: 'create' });
  };

  const openEditGrade = (row: GradeDraftRow) => {
    if (!isGradeEditing) return;
    gradeForm.setFieldsValue({ name: row.name, displayOrder: row.displayOrder });
    setGradeModal({ mode: 'edit', key: row.key, name: row.name });
  };

  const deleteDraftGrade = (row: GradeDraftRow) => {
    if (!isGradeEditing) return;
    modal.confirm({
      title: '이 직급을 삭제할까요?',
      okText: '삭제',
      okType: 'danger',
      cancelText: '취소',
      onOk: () => {
        setDraftGrades((items) =>
          items
            .filter((item) => item.key !== row.key)
            .map((item, index) => ({ ...item, displayOrder: index })),
        );
        if (row.id) setDraftDeletedGradeIds((ids) => [...ids, row.id!]);
      },
    });
  };

  const handleGradeDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    setDraftGrades((items) => {
      const oldIndex = items.findIndex((item) => item.key === active.id);
      const newIndex = items.findIndex((item) => item.key === over.id);
      if (oldIndex < 0 || newIndex < 0) return items;
      return arrayMove(items, oldIndex, newIndex).map((item, index) => ({
        ...item,
        displayOrder: index,
      }));
    });
  };

  const submitGradeModal = async () => {
    const v = await gradeForm.validateFields();
    if (!gradeModal) return;
    const name = v.name.trim();
    if (gradeModal.mode === 'create') {
      const key = `draft-grade-${draftGradeSeq + 1}`;
      setDraftGradeSeq((seq) => seq + 1);
      setDraftGrades((items) => [...items, { key, name, displayOrder: items.length, isNew: true }]);
    } else {
      setDraftGrades((items) =>
        items.map((item) => (item.key === gradeModal.key ? { ...item, name } : item)),
      );
    }
    setGradeModal(null);
  };

  const startTitleEditing = () => {
    setDraftTitles(toTitleDraftRows(titles));
    setDraftDeletedTitleIds([]);
    setTitleModal(null);
    setIsTitleEditing(true);
  };

  const cancelTitleEditing = () => {
    setIsTitleEditing(false);
    setDraftTitles([]);
    setDraftDeletedTitleIds([]);
    setTitleModal(null);
  };

  const openCreateTitle = () => {
    if (!isTitleEditing) return;
    titleForm.resetFields();
    setTitleModal({ mode: 'create' });
  };

  const openEditTitle = (row: GradeDraftRow) => {
    if (!isTitleEditing) return;
    titleForm.setFieldsValue({ name: row.name, displayOrder: row.displayOrder });
    setTitleModal({ mode: 'edit', key: row.key, name: row.name });
  };

  const deleteDraftTitle = (row: GradeDraftRow) => {
    if (!isTitleEditing) return;
    modal.confirm({
      title: '이 직책을 삭제할까요?',
      okText: '삭제',
      okType: 'danger',
      cancelText: '취소',
      onOk: () => {
        setDraftTitles((items) =>
          items
            .filter((item) => item.key !== row.key)
            .map((item, index) => ({ ...item, displayOrder: index })),
        );
        if (row.id) setDraftDeletedTitleIds((ids) => [...ids, row.id!]);
      },
    });
  };

  const handleTitleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    setDraftTitles((items) => {
      const oldIndex = items.findIndex((item) => item.key === active.id);
      const newIndex = items.findIndex((item) => item.key === over.id);
      if (oldIndex < 0 || newIndex < 0) return items;
      return arrayMove(items, oldIndex, newIndex).map((item, index) => ({
        ...item,
        displayOrder: index,
      }));
    });
  };

  const submitTitleModal = async () => {
    const v = await titleForm.validateFields();
    if (!titleModal) return;
    const name = v.name.trim();
    if (titleModal.mode === 'create') {
      const key = `draft-title-${draftTitleSeq + 1}`;
      setDraftTitleSeq((seq) => seq + 1);
      setDraftTitles((items) => [...items, { key, name, displayOrder: items.length, isNew: true }]);
    } else {
      setDraftTitles((items) =>
        items.map((item) => (item.key === titleModal.key ? { ...item, name } : item)),
      );
    }
    setTitleModal(null);
  };

  const perfCardClass =
    'tw-overflow-hidden tw-rounded-2xl tw-border-slate-200/80 tw-bg-white tw-shadow-[0_1px_3px_rgba(15,23,42,0.06)] [&_.ant-card-body]:tw-px-5 [&_.ant-card-body]:tw-pb-8 [&_.ant-card-body]:tw-pt-6 sm:[&_.ant-card-body]:tw-px-7';

  const sectionLabelClass = 'tw-text-xs tw-font-semibold tw-text-slate-500';

  const toolbarPrimaryBtn =
    '!tw-h-10 !tw-min-h-10 !tw-rounded-xl !tw-border-0 !tw-bg-[#1e3a5f] !tw-font-semibold !tw-shadow-none hover:!tw-bg-[#152a45] disabled:!tw-opacity-60';

  const toolbarSecondaryBtn =
    '!tw-h-10 !tw-min-h-10 !tw-rounded-xl !tw-border !tw-border-slate-200 !tw-bg-white !tw-font-medium !tw-text-slate-700 hover:!tw-border-slate-300 hover:!tw-bg-slate-50';

  const toolbarDangerBtn =
    '!tw-h-10 !tw-min-h-10 !tw-rounded-xl !tw-border-0 !tw-bg-rose-600 !tw-font-semibold hover:!tw-bg-rose-700';

  const addRowBtn =
    '!tw-h-9 !tw-min-h-9 !tw-rounded-xl !tw-border-0 !tw-bg-[#1e3a5f] !tw-px-4 !tw-text-sm !tw-font-semibold hover:!tw-bg-[#152a45]';

  return (
    <div className="tw-w-full">
      <div className="tw-mb-5">
        <AppWorkspacePageTitle
          className="!tw-mb-0"
          eyebrow="Organization Settings"
          title="조직 관리 설정"
          subtitle={
            <>
              조직 구조, 직급·직책, 역할·권한, 조직 개편 시뮬레이션을 한곳에서 관리합니다.
              <br />
              실제 조직도 조회는 왼쪽 메뉴의 전체 조직도에서 확인할 수 있습니다.
            </>
          }
        />
      </div>

      {/* `destroyOnHidden` 모달이 닫히면 내부 Form이 제거되어 useForm 인스턴스가 끊긴다. */}
      {orgModal === null ? (
        <Form form={orgForm} preserve={false} className="tw-hidden" aria-hidden />
      ) : null}
      {gradeModal === null ? (
        <Form form={gradeForm} preserve={false} className="tw-hidden" aria-hidden />
      ) : null}
      {titleModal === null ? (
        <Form form={titleForm} preserve={false} className="tw-hidden" aria-hidden />
      ) : null}

      <Card variant="borderless" className={perfCardClass}>
        <Tabs
          activeKey={activeTab}
          onChange={(key) => {
            const nextTab = key as OrgSettingsTab;
            const moveTab = () =>
              void navigate({
                to: '/app/organization',
                search: { tab: nextTab },
                replace: true,
              });

            if (isOrgEditing || isGradeEditing || isTitleEditing) {
              modal.confirm({
                title: '저장하지 않은 수정사항이 있습니다.',
                content: '탭을 이동하면 현재 수정 중인 내용이 저장되지 않고 사라집니다.',
                okText: '이동하기',
                cancelText: '계속 수정',
                onOk: () => {
                  if (isOrgEditing) cancelOrgEditing();
                  if (isGradeEditing) cancelGradeEditing();
                  if (isTitleEditing) cancelTitleEditing();
                  moveTab();
                },
              });
              return;
            }

            moveTab();
          }}
          items={[
            {
              key: 'structure',
              label: '조직 구조',
              children: (
                <div>
                  <div className="tw-flex tw-flex-wrap tw-items-center tw-justify-between tw-gap-2">
                    <Typography.Text className="tw-text-sm tw-text-slate-500">
                      {isOrgEditing
                        ? '수정 모드입니다. 변경사항은 저장하기 전까지 반영되지 않습니다.'
                        : '수정하기를 누르면 조직 구조를 편집할 수 있습니다.'}
                    </Typography.Text>
                    <Space wrap size={[8, 8]}>
                      {isOrgEditing ? (
                        <>
                          <Button
                            icon={<PlusOutlined />}
                            onClick={() => openCreateChild()}
                            className={toolbarSecondaryBtn}
                          >
                            선택 조직 하위 추가
                          </Button>
                          <Button
                            onClick={cancelOrgEditing}
                            className={toolbarSecondaryBtn}
                            disabled={saveOrgDraftM.isPending}
                          >
                            취소
                          </Button>
                          <Button
                            type="primary"
                            onClick={() => saveOrgDraftM.mutate()}
                            loading={saveOrgDraftM.isPending}
                            className={toolbarPrimaryBtn}
                          >
                            저장하기
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            type="primary"
                            icon={<EditOutlined />}
                            onClick={startOrgEditing}
                            className={toolbarPrimaryBtn}
                          >
                            수정하기
                          </Button>
                          <OrgStructureViewSettingsPopover
                            value={orgViewSettings}
                            onChange={persistOrgViewSettings}
                          />
                        </>
                      )}
                    </Space>
                  </div>
                  {!isOrgEditing ? (
                    <div className="tw-mt-4">
                      <div className="tw-rounded-xl tw-border tw-border-slate-200 tw-bg-white tw-p-3 tw-shadow-[0_1px_3px_rgba(15,23,42,0.06)]">
                        {orgLoading ? (
                          <Typography.Text type="secondary" className="tw-text-sm">
                            불러오는 중…
                          </Typography.Text>
                        ) : treeData.length === 0 ? (
                          <Typography.Text type="secondary" className="tw-text-sm">
                            등록된 조직이 없습니다.
                          </Typography.Text>
                        ) : orgViewSettings.layoutDirection === 'horizontal' ? (
                          <div className="wf-scrollbar tw-max-h-[min(62vh,560px)] tw-min-h-[280px] tw-overflow-auto tw-rounded-lg tw-border tw-border-slate-100 tw-bg-slate-50 tw-p-3">
                            <Tree
                              blockNode
                              switcherIcon={({ expanded }) => (
                                <RightOutlined
                                  className={`tw-text-[11px] tw-text-slate-400 tw-transition-transform tw-duration-200 tw-ease-out ${expanded ? 'tw-rotate-90' : ''}`}
                                />
                              )}
                              className="tw-bg-transparent [&_.ant-tree-node-content-wrapper]:tw-w-full [&_.ant-tree-node-content-wrapper]:tw-rounded-lg [&_.ant-tree-node-content-wrapper]:tw-py-1 [&_.ant-tree-switcher]:tw-flex [&_.ant-tree-switcher]:tw-w-5 [&_.ant-tree-switcher]:tw-shrink-0 [&_.ant-tree-switcher]:tw-items-center [&_.ant-tree-switcher]:tw-justify-center [&_.ant-tree-switcher]:tw-bg-transparent"
                              treeData={treeData}
                              defaultExpandAll
                            />
                          </div>
                        ) : (
                          <div className="wf-scrollbar tw-max-h-[min(62vh,560px)] tw-min-h-[280px] tw-overflow-auto tw-rounded-lg tw-border tw-border-slate-100 tw-bg-slate-50 tw-p-4">
                            <style>{`
                              .org-structure-tree,
                              .org-structure-tree ul {
                                display: flex;
                                justify-content: center;
                                list-style: none;
                                margin: 0;
                                padding: 0;
                              }
                              .org-structure-tree ul {
                                padding-top: 22px;
                                position: relative;
                              }
                              .org-structure-tree ul::before {
                                border-left: 1px solid #cbd5e1;
                                content: '';
                                height: 22px;
                                left: 50%;
                                position: absolute;
                                top: 0;
                              }
                              .org-structure-tree li {
                                align-items: center;
                                display: flex;
                                flex-direction: column;
                                padding: 22px 10px 0;
                                position: relative;
                                text-align: center;
                              }
                              .org-structure-tree > li {
                                padding-top: 0;
                              }
                              .org-structure-tree li::before,
                              .org-structure-tree li::after {
                                border-top: 1px solid #cbd5e1;
                                content: '';
                                height: 22px;
                                position: absolute;
                                top: 0;
                                width: 50%;
                              }
                              .org-structure-tree li::before {
                                right: 50%;
                              }
                              .org-structure-tree li::after {
                                border-left: 1px solid #cbd5e1;
                                left: 50%;
                              }
                              .org-structure-tree > li::before,
                              .org-structure-tree > li::after,
                              .org-structure-tree li:only-child::before,
                              .org-structure-tree li:only-child::after {
                                display: none;
                              }
                              .org-structure-tree li:only-child {
                                padding-top: 0;
                              }
                              .org-structure-tree li:first-child::before,
                              .org-structure-tree li:last-child::after {
                                border-top: 0;
                              }
                              .org-structure-tree li:last-child::before {
                                border-right: 1px solid #cbd5e1;
                                border-radius: 0 6px 0 0;
                              }
                              .org-structure-tree li:first-child::after {
                                border-radius: 6px 0 0 0;
                              }
                              .org-structure-tree li:only-child > ul {
                                padding-top: 22px;
                              }
                            `}</style>
                            <div className="tw-inline-flex tw-min-w-full tw-justify-center">
                              <ul className="org-structure-tree">
                                {treeData.map((node) => (
                                  <li key={String(node.key)}>
                                    <OrgStructureVerticalNode node={node} />
                                  </li>
                                ))}
                              </ul>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="tw-mt-4 tw-min-h-[220px] tw-rounded-xl tw-border tw-border-slate-200/90 tw-bg-slate-50/40 tw-p-3">
                      {orgLoading ? (
                        <Typography.Text type="secondary" className="tw-text-sm">
                          불러오는 중…
                        </Typography.Text>
                      ) : displayedTreeData.length === 0 ? (
                        <Typography.Text type="secondary" className="tw-text-sm">
                          등록된 조직이 없습니다.
                        </Typography.Text>
                      ) : (
                        <Tree
                          blockNode
                          draggable={
                            isOrgEditing
                              ? { icon: <HolderOutlined className="tw-text-slate-400" /> }
                              : false
                          }
                          switcherIcon={({ expanded }) => (
                            <RightOutlined
                              className={`tw-text-[11px] tw-text-slate-400 tw-transition-transform tw-duration-200 tw-ease-out ${expanded ? 'tw-rotate-90' : ''}`}
                            />
                          )}
                          className="tw-bg-transparent [&_.ant-tree-draggable-icon]:tw-mr-1 [&_.ant-tree-node-content-wrapper]:tw-w-full [&_.ant-tree-node-content-wrapper]:tw-rounded-lg [&_.ant-tree-node-content-wrapper]:tw-py-1 [&_.ant-tree-switcher]:tw-flex [&_.ant-tree-switcher]:tw-w-5 [&_.ant-tree-switcher]:tw-shrink-0 [&_.ant-tree-switcher]:tw-items-center [&_.ant-tree-switcher]:tw-justify-center [&_.ant-tree-switcher]:tw-bg-transparent"
                          treeData={displayedTreeData}
                          onDrop={isOrgEditing ? handleOrgDrop : undefined}
                          titleRender={(node) => {
                            const id = String(node.key);
                            const name =
                              typeof node.title === 'string'
                                ? node.title
                                : String(node.title ?? '');
                            const isNew = Boolean((node as DataNode & { isNew?: boolean }).isNew);
                            return (
                              <div className="tw-flex tw-min-w-0 tw-items-center tw-justify-between tw-gap-2 tw-pr-1">
                                <span className="tw-flex tw-min-w-0 tw-items-center tw-gap-2">
                                  <span className="tw-min-w-0 tw-truncate tw-text-sm tw-font-medium tw-text-slate-700">
                                    {name}
                                  </span>
                                  {isNew ? (
                                    <span className="tw-rounded-md tw-bg-blue-50 tw-px-1.5 tw-py-0.5 tw-text-[11px] tw-font-semibold tw-text-blue-700">
                                      신규
                                    </span>
                                  ) : null}
                                </span>
                                {isOrgEditing ? (
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
                                          openCreateChild(id);
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
                                            title: '선택한 조직을 수정 목록에서 제거할까요?',
                                            okText: '제거',
                                            okType: 'danger',
                                            cancelText: '취소',
                                            onOk: () => {
                                              const result = removeDraftNode(draftOrgTree, id);
                                              setDraftOrgTree(result.next);
                                              setDraftDeletedOrgIds((ids) => [
                                                ...ids,
                                                ...result.removedExistingIds,
                                              ]);
                                              setSelectedOrgKeys([]);
                                            },
                                          });
                                        }}
                                      />
                                    </Tooltip>
                                  </span>
                                ) : null}
                              </div>
                            );
                          }}
                          selectedKeys={selectedOrgKeys}
                          onSelect={(keys) => {
                            const lastKey = keys.at(-1);
                            setSelectedOrgKeys(lastKey !== undefined ? [lastKey] : []);
                          }}
                          defaultExpandAll
                        />
                      )}
                    </div>
                  )}
                </div>
              ),
            },
            {
              key: 'grades',
              label: '직급',
              children: (
                <div>
                  <div className="tw-mb-3 tw-flex tw-flex-wrap tw-items-center tw-justify-between tw-gap-2">
                    <Typography.Text className="tw-text-sm tw-text-slate-500">
                      {isGradeEditing
                        ? '직급명과 순서를 편집한 뒤 저장하기를 눌러 반영합니다.'
                        : '수정하기를 누르면 직급을 편집할 수 있습니다.'}
                    </Typography.Text>
                    <Space wrap size={[8, 8]}>
                      {isGradeEditing ? (
                        <>
                          <Button
                            icon={<PlusOutlined />}
                            onClick={openCreateGrade}
                            className={toolbarSecondaryBtn}
                          >
                            직급 추가
                          </Button>
                          <Button
                            onClick={cancelGradeEditing}
                            className={toolbarSecondaryBtn}
                            disabled={saveGradeDraftM.isPending}
                          >
                            취소
                          </Button>
                          <Button
                            type="primary"
                            onClick={() => saveGradeDraftM.mutate()}
                            loading={saveGradeDraftM.isPending}
                            className={toolbarPrimaryBtn}
                          >
                            저장하기
                          </Button>
                        </>
                      ) : (
                        <Button
                          type="primary"
                          icon={<EditOutlined />}
                          onClick={startGradeEditing}
                          className={toolbarPrimaryBtn}
                        >
                          수정하기
                        </Button>
                      )}
                    </Space>
                  </div>
                  <div className="tw-overflow-hidden tw-rounded-xl tw-border tw-border-slate-200/90">
                    <div
                      className={`tw-grid tw-min-h-11 tw-items-center tw-bg-slate-50/90 tw-px-3 tw-text-xs tw-font-semibold tw-text-slate-600 ${
                        isGradeEditing
                          ? 'tw-grid-cols-[44px_1fr_100px_112px]'
                          : 'tw-grid-cols-[1fr_100px]'
                      }`}
                    >
                      {isGradeEditing ? <span /> : null}
                      <span>직급명</span>
                      <span>직급순서</span>
                      {isGradeEditing ? <span className="tw-text-right">작업</span> : null}
                    </div>
                    {gradesLoading ? (
                      <div className="tw-border-t tw-border-slate-100 tw-py-8 tw-text-center tw-text-sm tw-text-slate-500">
                        직급을 불러오는 중입니다.
                      </div>
                    ) : displayedGrades.length === 0 ? (
                      <div className="tw-border-t tw-border-slate-100 tw-py-8 tw-text-center tw-text-sm tw-text-slate-500">
                        등록된 직급이 없습니다.
                      </div>
                    ) : isGradeEditing ? (
                      <DndContext
                        sensors={gradeSensors}
                        collisionDetection={closestCenter}
                        onDragEnd={handleGradeDragEnd}
                      >
                        <SortableContext
                          items={displayedGrades.map((row) => row.key)}
                          strategy={verticalListSortingStrategy}
                        >
                          {displayedGrades.map((row, index) => (
                            <SortableSettingRow
                              key={row.key}
                              row={row}
                              index={index}
                              onEdit={openEditGrade}
                              onDelete={deleteDraftGrade}
                              dragLabel="직급 순서 이동"
                              editLabel="직급 수정"
                              deleteLabel="직급 삭제"
                            />
                          ))}
                        </SortableContext>
                      </DndContext>
                    ) : (
                      displayedGrades.map((row, index) => (
                        <div
                          key={row.key}
                          className="tw-grid tw-min-h-14 tw-grid-cols-[1fr_100px] tw-items-center tw-border-t tw-border-slate-100 tw-bg-white tw-px-3 tw-text-sm tw-text-slate-700"
                        >
                          <div className="tw-min-w-0 tw-font-medium tw-text-slate-900">
                            {row.name || '(이름 없음)'}
                          </div>
                          <div className="tw-text-slate-600">{index}</div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ),
            },
            {
              key: 'titles',
              label: '직책',
              children: (
                <div>
                  <div className="tw-mb-3 tw-flex tw-flex-wrap tw-items-center tw-justify-between tw-gap-2">
                    <Typography.Text className="tw-text-sm tw-text-slate-500">
                      {isTitleEditing
                        ? '직책명과 순서를 편집한 뒤 저장하기를 눌러 반영합니다.'
                        : '수정하기를 누르면 직책을 편집할 수 있습니다.'}
                    </Typography.Text>
                    <Space wrap size={[8, 8]}>
                      {isTitleEditing ? (
                        <>
                          <Button
                            icon={<PlusOutlined />}
                            onClick={openCreateTitle}
                            className={toolbarSecondaryBtn}
                          >
                            직책 추가
                          </Button>
                          <Button
                            onClick={cancelTitleEditing}
                            className={toolbarSecondaryBtn}
                            disabled={saveTitleDraftM.isPending}
                          >
                            취소
                          </Button>
                          <Button
                            type="primary"
                            onClick={() => saveTitleDraftM.mutate()}
                            loading={saveTitleDraftM.isPending}
                            className={toolbarPrimaryBtn}
                          >
                            저장하기
                          </Button>
                        </>
                      ) : (
                        <Button
                          type="primary"
                          icon={<EditOutlined />}
                          onClick={startTitleEditing}
                          className={toolbarPrimaryBtn}
                        >
                          수정하기
                        </Button>
                      )}
                    </Space>
                  </div>
                  <div className="tw-overflow-hidden tw-rounded-xl tw-border tw-border-slate-200/90">
                    <div
                      className={`tw-grid tw-min-h-11 tw-items-center tw-bg-slate-50/90 tw-px-3 tw-text-xs tw-font-semibold tw-text-slate-600 ${
                        isTitleEditing
                          ? 'tw-grid-cols-[44px_1fr_100px_112px]'
                          : 'tw-grid-cols-[1fr_100px]'
                      }`}
                    >
                      {isTitleEditing ? <span /> : null}
                      <span>직책명</span>
                      <span>직책순서</span>
                      {isTitleEditing ? <span className="tw-text-right">작업</span> : null}
                    </div>
                    {titlesLoading ? (
                      <div className="tw-border-t tw-border-slate-100 tw-py-8 tw-text-center tw-text-sm tw-text-slate-500">
                        직책을 불러오는 중입니다.
                      </div>
                    ) : displayedTitles.length === 0 ? (
                      <div className="tw-border-t tw-border-slate-100 tw-py-8 tw-text-center tw-text-sm tw-text-slate-500">
                        등록된 직책이 없습니다.
                      </div>
                    ) : isTitleEditing ? (
                      <DndContext
                        sensors={titleSensors}
                        collisionDetection={closestCenter}
                        onDragEnd={handleTitleDragEnd}
                      >
                        <SortableContext
                          items={displayedTitles.map((row) => row.key)}
                          strategy={verticalListSortingStrategy}
                        >
                          {displayedTitles.map((row, index) => (
                            <SortableSettingRow
                              key={row.key}
                              row={row}
                              index={index}
                              onEdit={openEditTitle}
                              onDelete={deleteDraftTitle}
                              dragLabel="직책 순서 이동"
                              editLabel="직책 수정"
                              deleteLabel="직책 삭제"
                            />
                          ))}
                        </SortableContext>
                      </DndContext>
                    ) : (
                      displayedTitles.map((row, index) => (
                        <div
                          key={row.key}
                          className="tw-grid tw-min-h-14 tw-grid-cols-[1fr_100px] tw-items-center tw-border-t tw-border-slate-100 tw-bg-white tw-px-3 tw-text-sm tw-text-slate-700"
                        >
                          <div className="tw-min-w-0 tw-font-medium tw-text-slate-900">
                            {row.name || '(이름 없음)'}
                          </div>
                          <div className="tw-text-slate-600">{index}</div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ),
            },
            {
              key: 'roles',
              label: '역할·권한',
              children: <OrganizationRolesSection />,
            },
            {
              key: 'restructure',
              label: '조직 개편',
              children: <AdminOrgRestructurePage />,
            },
          ]}
        />
      </Card>

      <AppDoubleActionModal
        title={orgModal?.mode === 'create' ? '하위 조직 추가' : '조직명 수정'}
        open={orgModal !== null}
        onClose={() => setOrgModal(null)}
        onConfirm={() => void submitOrgModal()}
        confirmLoading={createOrgM.isPending || updateOrgM.isPending}
        confirmText="저장"
        destroyOnHidden
      >
        <div className="tw-px-5 tw-py-4">
          <Form form={orgForm} layout="vertical" className="tw-mt-2">
            <Form.Item
              name="name"
              label="조직명"
              rules={[{ required: true, message: '조직명을 입력해 주세요.' }]}
            >
              <Input placeholder="예: 본사, 개발팀" />
            </Form.Item>
          </Form>
        </div>
      </AppDoubleActionModal>

      <AppDoubleActionModal
        title={gradeModal?.mode === 'create' ? '직급 추가' : '직급 수정'}
        open={gradeModal !== null}
        onClose={() => setGradeModal(null)}
        onConfirm={() => void submitGradeModal()}
        confirmLoading={saveGradeDraftM.isPending}
        confirmText="확인"
        confirmButtonClassName={toolbarPrimaryBtn}
        destroyOnHidden
      >
        <div className="tw-px-5 tw-py-4">
          <Form form={gradeForm} layout="vertical" className="tw-mt-2">
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
        title={titleModal?.mode === 'create' ? '직책 추가' : '직책 수정'}
        open={titleModal !== null}
        onClose={() => setTitleModal(null)}
        onConfirm={() => void submitTitleModal()}
        confirmLoading={saveTitleDraftM.isPending}
        confirmText="확인"
        confirmButtonClassName={toolbarPrimaryBtn}
        destroyOnHidden
      >
        <div className="tw-px-5 tw-py-4">
          <Form form={titleForm} layout="vertical" className="tw-mt-2">
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
    </div>
  );
}
