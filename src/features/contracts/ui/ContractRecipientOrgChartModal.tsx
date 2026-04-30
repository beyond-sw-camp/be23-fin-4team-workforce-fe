import { RightOutlined, SearchOutlined } from '@ant-design/icons';
import { useEffect, useMemo, useState } from 'react';
import { Checkbox, Input, Spin, Tree, Typography } from 'antd';
import type { DataNode } from 'antd/es/tree';
import { useQuery } from '@tanstack/react-query';
import {
  ORG_CHART_HIDDEN_JOB_GRADE,
  type OrgChartOrgNode,
  organizationApi,
} from '@/features/organization/api/organizationApi';
import { AppSingleActionModal } from '@/shared/ui/AppSingleActionModal';

const KS = '\x1f';

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

function isSelectableMember(memberStatus: string | undefined): boolean {
  return (memberStatus ?? 'ACTIVE') === 'ACTIVE';
}

function collectSelectableMemberIdsFromOrg(org: OrgChartOrgNode): string[] {
  const out: string[] = [];
  const walk = (n: OrgChartOrgNode) => {
    for (const m of n.members) {
      if (m.jobGradeName.trim() === ORG_CHART_HIDDEN_JOB_GRADE) continue;
      if (isSelectableMember(m.memberStatus)) out.push(m.memberId);
    }
    for (const c of n.children) walk(c);
  };
  walk(org);
  return out;
}

function collectAllSelectableFromRoots(orgs: OrgChartOrgNode[]): string[] {
  const acc: string[] = [];
  for (const o of orgs) acc.push(...collectSelectableMemberIdsFromOrg(o));
  return acc;
}

function collectOrgKeys(orgs: OrgChartOrgNode[]): string[] {
  const out: string[] = [];
  const walk = (nodes: OrgChartOrgNode[]) => {
    for (const n of nodes) {
      out.push(`o${KS}${n.organizationId}`);
      walk(n.children);
    }
  };
  walk(orgs);
  return out;
}

type ContractRecipientOrgChartModalProps = {
  open: boolean;
  initialSelectedMemberIds?: string[];
  onClose: () => void;
  onConfirm: (memberIds: string[]) => void;
};

export function ContractRecipientOrgChartModal({
  open,
  initialSelectedMemberIds,
  onClose,
  onConfirm,
}: ContractRecipientOrgChartModalProps) {
  const [keyword, setKeyword] = useState('');
  const [selected, setSelected] = useState<Set<string>>(() => new Set(initialSelectedMemberIds ?? []));
  const [expandedKeys, setExpandedKeys] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    setKeyword('');
    setExpandedKeys([]);
    setSelected(new Set(initialSelectedMemberIds ?? []));
  }, [open, initialSelectedMemberIds]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['organization', 'org-chart', 'contract-recipient-picker'],
    queryFn: () => organizationApi.getOrgChart(),
    enabled: open,
    staleTime: 60_000,
  });

  const filteredRoots = useMemo(() => {
    if (!data?.organizations.length) return [];
    return filterOrganizationsByQuery(data.organizations, keyword.trim());
  }, [data?.organizations, keyword]);

  const toggleMember = (memberId: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(memberId);
      else next.delete(memberId);
      return next;
    });
  };

  const allVisibleIds = useMemo(() => collectAllSelectableFromRoots(filteredRoots), [filteredRoots]);

  useEffect(() => {
    if (!open) return;
    const orgKeys = collectOrgKeys(filteredRoots);
    setExpandedKeys(['root-company', ...orgKeys]);
  }, [open, filteredRoots]);

  const applyBulkSelection = (memberIds: string[], checked: boolean) => {
    if (memberIds.length === 0) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) {
        for (const id of memberIds) next.add(id);
      } else {
        for (const id of memberIds) next.delete(id);
      }
      return next;
    });
  };

  const treeData: DataNode[] = useMemo(() => {
    if (!data) return [];

    const memberRow = (m: { memberId: string; name: string; jobGradeName: string }) => {
      const isOn = selected.has(m.memberId);
      const flip = () => toggleMember(m.memberId, !isOn);
      return (
        <div
          className="tw-flex tw-w-full tw-min-w-0 tw-cursor-pointer tw-items-center tw-justify-between tw-gap-2 tw-rounded-md tw-pr-1 hover:tw-bg-slate-50/90"
          role="button"
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation();
            flip();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              e.stopPropagation();
              flip();
            }
          }}
        >
          <span className="tw-truncate tw-text-sm tw-text-slate-800">
            <span className="tw-font-medium">{m.name}</span>{' '}
            <span className="tw-text-xs tw-font-normal tw-text-slate-500">{m.jobGradeName}</span>
          </span>
          <span className="tw-shrink-0" onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
            <Checkbox
              checked={isOn}
              onChange={(e) => {
                e.stopPropagation();
                toggleMember(m.memberId, e.target.checked);
              }}
            />
          </span>
        </div>
      );
    };

    const orgTitleRow = (
      label: string,
      memberCount: number,
      checked: boolean,
      indeterminate: boolean,
      onToggle: (checked: boolean) => void,
    ) => (
      <div className="tw-flex tw-w-full tw-min-w-0 tw-items-center tw-justify-between tw-gap-2 tw-pr-1">
        <span className="tw-truncate tw-text-sm tw-font-semibold tw-text-slate-800">
          {label}
          <span className="tw-ml-1 tw-font-normal tw-text-slate-400"> {memberCount}</span>
        </span>
        <span className="tw-shrink-0" onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
          <Checkbox
            checked={checked}
            indeterminate={indeterminate}
            onChange={(e) => onToggle(e.target.checked)}
            aria-label={`${label} 전체 선택`}
          />
        </span>
      </div>
    );

    function buildOrgNodes(orgs: OrgChartOrgNode[]): DataNode[] {
      return orgs.map((org) => {
        const subtreeIds = collectSelectableMemberIdsFromOrg(org);
        const checkedCount = subtreeIds.filter((id) => selected.has(id)).length;
        const orgChecked = subtreeIds.length > 0 && checkedCount === subtreeIds.length;
        const orgIndeterminate = checkedCount > 0 && checkedCount < subtreeIds.length;
        const memberNodes: DataNode[] = [];
        for (const m of org.members) {
          if (m.jobGradeName.trim() === ORG_CHART_HIDDEN_JOB_GRADE) continue;
          if (!isSelectableMember(m.memberStatus)) continue;
          memberNodes.push({
            key: `m${KS}${org.organizationId}${KS}${m.memberId}`,
            title: memberRow(m),
            isLeaf: true,
          });
        }
        const childOrgNodes = buildOrgNodes(org.children);
        const children = [...memberNodes, ...childOrgNodes];
        return {
          key: `o${KS}${org.organizationId}`,
          title: orgTitleRow(org.name, subtreeIds.length, orgChecked, orgIndeterminate, (checked) =>
            applyBulkSelection(subtreeIds, checked),
          ),
          selectable: false,
          ...(children.length > 0 ? { children } : { isLeaf: true }),
        };
      });
    }

    const roots = buildOrgNodes(filteredRoots);
    const rootCheckedCount = allVisibleIds.filter((id) => selected.has(id)).length;
    const rootChecked = allVisibleIds.length > 0 && rootCheckedCount === allVisibleIds.length;
    const rootIndeterminate = rootCheckedCount > 0 && rootCheckedCount < allVisibleIds.length;
    return [
      {
        key: 'root-company',
        title: (
          <div className="tw-flex tw-w-full tw-min-w-0 tw-items-center tw-justify-between tw-gap-2 tw-pr-1">
            <span className="tw-truncate tw-text-sm tw-font-semibold tw-text-[#1e3a5f]">
              {data.companyName}
              <span className="tw-ml-1 tw-font-normal tw-text-slate-400"> {allVisibleIds.length}</span>
            </span>
            <span className="tw-shrink-0" onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
              <Checkbox
                checked={rootChecked}
                indeterminate={rootIndeterminate}
                onChange={(e) => applyBulkSelection(allVisibleIds, e.target.checked)}
                aria-label="회사 전체 선택"
              />
            </span>
          </div>
        ),
        selectable: false,
        children: roots.length > 0 ? roots : undefined,
        isLeaf: roots.length === 0,
      },
    ];
  }, [data, filteredRoots, allVisibleIds, selected]);

  const selectedCount = selected.size;

  return (
    <AppSingleActionModal
      open={open}
      onClose={onClose}
      onSubmit={() => onConfirm(Array.from(selected))}
      submitText="선택 추가"
      submitDisabled={isLoading || selectedCount === 0}
      destroyOnHidden
      zIndex={1200}
      width={640}
      title={<span className="tw-text-base tw-font-semibold tw-text-slate-900">조직도에서 직원 선택</span>}
    >
      <div className="tw-flex tw-flex-col tw-gap-3 tw-px-5 tw-py-4 tw-pt-2">
        <Input
          allowClear
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="이름, 직급, 부서 검색"
          prefix={<SearchOutlined className="tw-text-slate-400" />}
          className="tw-rounded-xl tw-bg-slate-50 [&_.ant-input]:tw-bg-transparent"
        />
        <div>
          <div className="tw-mb-2 tw-text-xs tw-font-semibold tw-text-slate-500">조직도</div>
          <Spin spinning={isLoading}>
            {isError ? (
              <Typography.Text type="danger">조직도를 불러오지 못했습니다.</Typography.Text>
            ) : filteredRoots.length === 0 && data ? (
              <Typography.Text type="secondary" className="tw-text-sm">
                {data.organizations.length === 0
                  ? '등록된 조직이 없습니다.'
                  : '검색 조건에 맞는 조직·구성원이 없습니다.'}
              </Typography.Text>
            ) : (
              <div className="tw-max-h-[min(56vh,500px)] tw-overflow-auto tw-rounded-xl tw-border tw-border-slate-200 tw-bg-white tw-p-2">
                <Tree
                  blockNode
                  expandAction="click"
                  showLine={{ showLeafIcon: false }}
                  expandedKeys={expandedKeys}
                  onExpand={(keys) => setExpandedKeys(keys as string[])}
                  selectable={false}
                  treeData={treeData}
                  switcherIcon={({ expanded }) => (
                    <RightOutlined
                      className={`tw-text-[11px] tw-text-slate-400 tw-transition-transform tw-duration-200 tw-ease-out ${expanded ? 'tw-rotate-90' : ''}`}
                    />
                  )}
                />
              </div>
            )}
          </Spin>
        </div>
        <Typography.Text type="secondary" className="!tw-mb-0 tw-block tw-text-xs">
          선택 {selectedCount}명
        </Typography.Text>
      </div>
    </AppSingleActionModal>
  );
}
