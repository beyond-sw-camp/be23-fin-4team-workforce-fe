import { RightOutlined, UserOutlined } from '@ant-design/icons';
import { Link } from '@tanstack/react-router';
import { Avatar, Tree } from 'antd';
import type { DataNode } from 'antd/es/tree';
import { type Key, useEffect, useMemo, useState } from 'react';
import {
  type OrgChartMember,
  type OrgChartOrgNode,
  ORG_CHART_HIDDEN_JOB_GRADE,
} from '@/features/organization/api/organizationApi';
import { orgMemberCount } from '@/widgets/organization/orgChartCounts';
import type { OrgChartMemberCountMode } from '@/widgets/organization/OrgChartViewSettingsPopover';

const KS = '\x1f';

/** 자식이 있는 노드 키만 — 검색 등으로 treeData가 바뀔 때마다 펼침 동기화에 사용 */
function collectBranchKeys(nodes: DataNode[]): Key[] {
  const acc: Key[] = [];
  for (const node of nodes) {
    const ch = node.children;
    if (ch?.length) {
      acc.push(node.key as Key);
      acc.push(...collectBranchKeys(ch));
    }
  }
  return acc;
}

function collectMemberTreeKey(nodes: DataNode[] | undefined, memberId: string): string | undefined {
  if (!nodes) return undefined;
  for (const n of nodes) {
    const k = String(n.key);
    if (k.startsWith(`m${KS}`)) {
      const parts = k.split(KS);
      if (parts.length === 3 && parts[0] === 'm' && parts[2] === memberId) return k;
    }
    const found = collectMemberTreeKey(n.children, memberId);
    if (found) return found;
  }
  return undefined;
}

function memberNodes(
  org: OrgChartOrgNode,
  members: OrgChartMember[],
  onMemberSelect: ((memberId: string, opts?: { chartMemberStatus?: string }) => void) | undefined,
  memberMetaByKey: Map<string, { chartMemberStatus?: string }>,
): DataNode[] {
  const visible = members.filter((m) => m.jobGradeName.trim() !== ORG_CHART_HIDDEN_JOB_GRADE);
  return visible.map((m) => {
    const mKey = `m${KS}${org.organizationId}${KS}${m.memberId}`;
    memberMetaByKey.set(mKey, { chartMemberStatus: m.memberStatus });
    const row = (
      <span className="tw-inline-flex tw-min-w-0 tw-max-w-full tw-items-center tw-gap-2 tw-py-0.5">
        <Avatar
          size={22}
          src={m.profileUrl?.trim() || undefined}
          className="tw-shrink-0 tw-bg-slate-200 tw-text-[11px] tw-font-semibold tw-text-slate-700"
        >
          {(m.name[0] ?? '?').toUpperCase()}
        </Avatar>
        <span className="tw-min-w-0 tw-flex-1 tw-truncate tw-text-sm tw-font-medium tw-text-slate-800">{m.name}</span>
        <span className="tw-shrink-0 tw-text-xs tw-text-slate-500">{m.jobGradeName}</span>
      </span>
    );
    return {
      key: mKey,
      title: onMemberSelect ? (
        <button
          type="button"
          className="tw-flex tw-w-full tw-min-w-0 tw-cursor-pointer tw-items-center tw-border-0 tw-bg-transparent tw-p-0 tw-text-left"
          onClick={(e) => {
            e.stopPropagation();
            onMemberSelect(m.memberId, { chartMemberStatus: m.memberStatus });
          }}
        >
          {row}
        </button>
      ) : (
        <Link
          to="/app/members/$memberId"
          params={{ memberId: m.memberId }}
          className="tw-flex tw-w-full tw-min-w-0 tw-items-center hover:tw-underline"
          onClick={(e) => e.stopPropagation()}
        >
          {row}
        </Link>
      ),
      isLeaf: true,
      selectable: Boolean(onMemberSelect),
    };
  });
}

function orgNodesToTreeData(
  orgs: OrgChartOrgNode[],
  opts: {
    onMemberSelect?: (memberId: string, opts?: { chartMemberStatus?: string }) => void;
    memberMetaByKey: Map<string, { chartMemberStatus?: string }>;
    memberCountMode: OrgChartMemberCountMode;
  },
): DataNode[] {
  const { onMemberSelect, memberMetaByKey, memberCountMode } = opts;

  return orgs.map((org) => {
    const mNodes = memberNodes(org, org.members, onMemberSelect, memberMetaByKey);
    const childOrgNodes = orgNodesToTreeData(org.children, opts);
    const children = [...mNodes, ...childOrgNodes];
    const n = orgMemberCount(org, memberCountMode);

    return {
      key: `o${KS}${org.organizationId}`,
      title: (
        <span className="tw-flex tw-min-w-0 tw-w-full tw-items-center tw-gap-2 tw-pr-1">
          <span className="tw-min-w-0 tw-truncate tw-text-sm tw-font-semibold tw-text-slate-900">{org.name}</span>
          <span className="tw-inline-flex tw-shrink-0 tw-items-center tw-gap-1 tw-rounded-full tw-border tw-border-slate-200 tw-bg-slate-50 tw-px-2 tw-py-0.5 tw-text-xs tw-font-medium tw-tabular-nums tw-text-slate-600">
            <UserOutlined className="tw-text-[11px]" />
            {n}
          </span>
        </span>
      ),
      selectable: false,
      ...(children.length > 0 ? { children } : { isLeaf: true }),
    };
  });
}

type OrgChartTreeHierarchyProps = {
  roots: OrgChartOrgNode[];
  memberCountMode: OrgChartMemberCountMode;
  onMemberSelect?: (memberId: string, opts?: { chartMemberStatus?: string }) => void;
  selectedMemberId?: string | null;
};

export function OrgChartTreeHierarchy({
  roots,
  memberCountMode,
  onMemberSelect,
  selectedMemberId,
}: OrgChartTreeHierarchyProps) {
  const { treeData, memberMetaByKey } = useMemo(() => {
    const memberMetaByKey = new Map<string, { chartMemberStatus?: string }>();
    const treeData = orgNodesToTreeData(roots, {
      onMemberSelect,
      memberMetaByKey,
      memberCountMode,
    });
    return { treeData, memberMetaByKey };
  }, [roots, onMemberSelect, memberCountMode]);

  const selectedKeys = useMemo(() => {
    if (!onMemberSelect || !selectedMemberId) return [];
    const key = collectMemberTreeKey(treeData, selectedMemberId);
    return key ? [key] : [];
  }, [onMemberSelect, selectedMemberId, treeData]);

  const [expandedKeys, setExpandedKeys] = useState<Key[]>([]);

  useEffect(() => {
    setExpandedKeys(collectBranchKeys(treeData));
  }, [treeData]);

  return (
    <Tree
      blockNode
      expandAction="click"
      expandedKeys={expandedKeys}
      onExpand={(keys) => setExpandedKeys(keys as Key[])}
      selectedKeys={selectedKeys}
      treeData={treeData}
      switcherIcon={({ expanded }) => (
        <RightOutlined
          className={`tw-text-[11px] tw-text-slate-400 tw-transition-transform tw-duration-200 tw-ease-out ${expanded ? 'tw-rotate-90' : ''}`}
        />
      )}
      onSelect={(keys) => {
        if (!onMemberSelect) return;
        const key = String(keys[0] ?? '');
        if (!key.startsWith(`m${KS}`)) return;
        const parts = key.split(KS);
        if (parts.length !== 3 || parts[0] !== 'm') return;
        const memberId = parts[2];
        if (!memberId) return;
        const meta = memberMetaByKey.get(key);
        onMemberSelect(memberId, { chartMemberStatus: meta?.chartMemberStatus });
      }}
      className="tw-rounded-lg tw-bg-white tw-p-1 [&_.ant-tree-switcher]:tw-flex [&_.ant-tree-switcher]:tw-w-5 [&_.ant-tree-switcher]:tw-shrink-0 [&_.ant-tree-switcher]:tw-items-center [&_.ant-tree-switcher]:tw-justify-center [&_.ant-tree-switcher]:tw-bg-transparent [&_.ant-tree-node-content-wrapper]:tw-rounded-md"
    />
  );
}
