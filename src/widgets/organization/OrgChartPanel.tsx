import { RightOutlined } from '@ant-design/icons';
import { Link } from '@tanstack/react-router';
import { Input, Space, Spin, Tree, Typography } from 'antd';
import type { DataNode } from 'antd/es/tree';
import { useMemo, useState } from 'react';
import { PERFORMANCE_PAGE_KO } from '@/app/locale/app-ko';
import {
  type OrgChartData,
  type OrgChartMember,
  type OrgChartOrgNode,
  ORG_CHART_HIDDEN_JOB_GRADE,
} from '@/features/organization/api/organizationApi';

const KS = '\x1f';

/** antd Tree `show-line` 인덴트·리프 연결선 — slate-200 톤으로 통일 */
const ORG_CHART_TREE_LINE_CLASS =
  '[&_.ant-tree-show-line_.ant-tree-indent-unit::before]:![border-inline-end-color:rgb(226_232_240)] ' +
  '[&_.ant-tree-switcher-leaf-line::before]:![border-inline-end-color:rgb(226_232_240)] ' +
  '[&_.ant-tree-switcher-leaf-line::after]:![border-bottom-color:rgb(226_232_240)]';

function orgSubtreeMatchesQuery(node: OrgChartOrgNode, q: string): boolean {
  if (!q) return true;
  const low = q.toLowerCase();
  if (node.name.toLowerCase().includes(low)) return true;
  for (const m of node.members) {
    if (m.jobGradeName.trim() === ORG_CHART_HIDDEN_JOB_GRADE) continue;
    if (
      m.name.toLowerCase().includes(low) ||
      m.jobGradeName.toLowerCase().includes(low) ||
      (m.memberStatus ?? '').toLowerCase().includes(low)
    ) {
      return true;
    }
  }
  return node.children.some((c) => orgSubtreeMatchesQuery(c, q));
}

function filterOrganizationsByQuery(nodes: OrgChartOrgNode[], q: string): OrgChartOrgNode[] {
  if (!q.trim()) return nodes;
  return nodes
    .filter((n) => orgSubtreeMatchesQuery(n, q))
    .map((n) => ({
      ...n,
      children: filterOrganizationsByQuery(n.children, q),
    }));
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

function memberLeafNodes(
  org: OrgChartOrgNode,
  members: OrgChartMember[],
  onMemberSelect: ((memberId: string, opts?: { chartMemberStatus?: string }) => void) | undefined,
  memberMetaByKey: Map<string, { chartMemberStatus?: string }>,
  showJobGrade = true,
): DataNode[] {
  const visible = members.filter((m) => m.jobGradeName.trim() !== ORG_CHART_HIDDEN_JOB_GRADE);
  return visible.map((m) => {
    const mKey = `m${KS}${org.organizationId}${KS}${m.memberId}`;
    memberMetaByKey.set(mKey, { chartMemberStatus: m.memberStatus });
    return {
      key: mKey,
      title: onMemberSelect ? (
        <span className="tw-inline-flex tw-min-w-0 tw-items-baseline tw-gap-1">
          <span className="tw-font-medium tw-text-[#1e3a5f]">{m.name}</span>
          {showJobGrade ? (
            <span className="tw-text-[13px] tw-text-slate-600">{m.jobGradeName}</span>
          ) : null}
        </span>
      ) : (
        <Link
          to="/app/members/$memberId"
          params={{ memberId: m.memberId }}
          className="tw-inline-flex tw-min-w-0 tw-items-baseline tw-gap-1 tw-font-medium tw-text-[#1e3a5f] hover:tw-underline"
          onClick={(e) => e.stopPropagation()}
        >
          <span>{m.name}</span>
          {showJobGrade ? (
            <span className="tw-text-[13px] tw-font-normal tw-text-slate-600">{m.jobGradeName}</span>
          ) : null}
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
  },
): DataNode[] {
  const { onMemberSelect, memberMetaByKey } = opts;

  return orgs.map((org) => {
    const memberNodes = memberLeafNodes(org, org.members, onMemberSelect, memberMetaByKey);
    const childOrgNodes = orgNodesToTreeData(org.children, opts);
    const children = [...memberNodes, ...childOrgNodes];

    return {
      key: `o${KS}${org.organizationId}`,
      title: <span className="tw-text-sm tw-font-semibold tw-text-slate-800">{org.name}</span>,
      selectable: false,
      ...(children.length > 0 ? { children } : { isLeaf: true }),
    };
  });
}

export function OrgChartPanel({
  data,
  loading,
  fetchError,
  onMemberSelect,
  selectedMemberId,
}: {
  data: OrgChartData | undefined;
  loading: boolean;
  fetchError: boolean;
  onMemberSelect?: (memberId: string, opts?: { chartMemberStatus?: string }) => void;
  selectedMemberId?: string | null;
}) {
  const [orgSearch, setOrgSearch] = useState('');

  const display = data ?? null;

  const filteredRoots = useMemo(() => {
    if (!display?.organizations.length) return [];
    return filterOrganizationsByQuery(display.organizations, orgSearch.trim());
  }, [display, orgSearch]);

  const { treeData, memberMetaByKey } = useMemo(() => {
    const memberMetaByKey = new Map<string, { chartMemberStatus?: string }>();
    if (!display) {
      return { treeData: [] as DataNode[], memberMetaByKey };
    }
    const roots = orgNodesToTreeData(filteredRoots, {
      onMemberSelect,
      memberMetaByKey,
    });
    return { treeData: roots, memberMetaByKey };
  }, [display, filteredRoots, onMemberSelect]);

  const treeSelectedKeys = useMemo(() => {
    if (!onMemberSelect || !selectedMemberId) return [];
    const key = collectMemberTreeKey(treeData, selectedMemberId);
    return key ? [key] : [];
  }, [onMemberSelect, selectedMemberId, treeData]);

  return (
    <Spin spinning={loading}>
      <Space direction="vertical" className="tw-w-full" size={12}>
        {fetchError && !loading ? (
          <Typography.Text type="danger">조직도를 불러오지 못했습니다.</Typography.Text>
        ) : !display ? (
          <Typography.Text type="secondary">{loading ? '' : '조직도 데이터가 없습니다.'}</Typography.Text>
        ) : (
          <div className="tw-rounded-xl tw-border tw-border-slate-200 tw-bg-white tw-p-3 tw-shadow-[0_1px_3px_rgba(15,23,42,0.06)]">
            <Input
              allowClear
              value={orgSearch}
              onChange={(e) => setOrgSearch(e.target.value)}
              placeholder={PERFORMANCE_PAGE_KO.orgSearchPlaceholder}
              className="!tw-mb-3 [&_.ant-input]:tw-rounded-lg"
            />
            {filteredRoots.length === 0 ? (
              <Typography.Text type="secondary" className="tw-text-sm">
                {display.organizations.length === 0
                  ? '등록된 최상위 조직이 없습니다.'
                  : '검색 조건에 맞는 조직·구성원이 없습니다.'}
              </Typography.Text>
            ) : (
              <Tree
                blockNode
                expandAction="click"
                showLine={{ showLeafIcon: false }}
                defaultExpandAll
                selectedKeys={treeSelectedKeys}
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
                className={`tw-rounded-lg tw-border tw-border-slate-100 tw-bg-slate-50/40 tw-p-2 ${ORG_CHART_TREE_LINE_CLASS} [&_.ant-tree-switcher]:tw-flex [&_.ant-tree-switcher]:tw-w-5 [&_.ant-tree-switcher]:tw-shrink-0 [&_.ant-tree-switcher]:tw-items-center [&_.ant-tree-switcher]:tw-justify-center [&_.ant-tree-switcher]:tw-bg-transparent [&_.ant-tree-node-content-wrapper]:tw-rounded-md`}
              />
            )}
          </div>
        )}
      </Space>
    </Spin>
  );
}
