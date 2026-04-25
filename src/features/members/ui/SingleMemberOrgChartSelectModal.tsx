import { RightOutlined, SearchOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Input, Modal, Spin, Tree, Typography } from 'antd';
import type { DataNode } from 'antd/es/tree';
import { useEffect, useMemo, useState } from 'react';
import {
  ORG_CHART_HIDDEN_JOB_GRADE,
  type OrgChartMember,
  type OrgChartOrgNode,
  organizationApi,
} from '@/features/organization/api/organizationApi';

const MEMBER_KEY_PREFIX = 'm:';

type Props = {
  open: boolean;
  title?: string;
  selectedMemberId?: string;
  onClose: () => void;
  onSelect: (member: { memberId: string; name: string }) => void;
};

function subtreeMatches(node: OrgChartOrgNode, q: string): boolean {
  if (!q) return true;
  const low = q.toLowerCase();
  if (node.name.toLowerCase().includes(low)) return true;
  for (const m of node.members) {
    if (m.jobGradeName.trim() === ORG_CHART_HIDDEN_JOB_GRADE) continue;
    if (m.name.toLowerCase().includes(low) || m.jobGradeName.toLowerCase().includes(low)) return true;
  }
  return node.children.some((c) => subtreeMatches(c, q));
}

function filterNodes(nodes: OrgChartOrgNode[], q: string): OrgChartOrgNode[] {
  if (!q.trim()) return nodes;
  return nodes
    .filter((n) => subtreeMatches(n, q))
    .map((n) => ({ ...n, children: filterNodes(n.children, q) }));
}

function memberLabel(m: OrgChartMember): string {
  return `${m.name} (${m.jobGradeName || '직급 없음'})`;
}

export function SingleMemberOrgChartSelectModal({
  open,
  title = '조직도에서 구성원 선택',
  selectedMemberId,
  onClose,
  onSelect,
}: Props) {
  const [keyword, setKeyword] = useState('');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setKeyword('');
    setSelectedKey(selectedMemberId ? `${MEMBER_KEY_PREFIX}${selectedMemberId}` : null);
  }, [open, selectedMemberId]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['organization', 'org-chart', 'single-member-picker'],
    queryFn: () => organizationApi.getOrgChart(),
    enabled: open,
    staleTime: 60_000,
  });

  const filtered = useMemo(
    () => (data?.organizations ? filterNodes(data.organizations, keyword.trim()) : []),
    [data?.organizations, keyword],
  );

  const memberByKey = useMemo(() => {
    const m = new Map<string, { memberId: string; name: string }>();
    const walk = (nodes: OrgChartOrgNode[]) => {
      for (const n of nodes) {
        for (const mem of n.members) {
          if (mem.jobGradeName.trim() === ORG_CHART_HIDDEN_JOB_GRADE) continue;
          m.set(`${MEMBER_KEY_PREFIX}${mem.memberId}`, { memberId: mem.memberId, name: mem.name });
        }
        walk(n.children);
      }
    };
    if (data?.organizations) walk(data.organizations);
    return m;
  }, [data?.organizations]);

  const treeData: DataNode[] = useMemo(() => {
    const build = (nodes: OrgChartOrgNode[]): DataNode[] =>
      nodes.map((org) => {
        const members: DataNode[] = org.members
          .filter((m) => m.jobGradeName.trim() !== ORG_CHART_HIDDEN_JOB_GRADE)
          .map((m) => ({
            key: `${MEMBER_KEY_PREFIX}${m.memberId}`,
            title: memberLabel(m),
            isLeaf: true,
          }));
        const children = [...members, ...build(org.children)];
        return {
          key: `o:${org.organizationId}`,
          title: org.name,
          selectable: false,
          ...(children.length > 0 ? { children } : { isLeaf: true }),
        };
      });
    return build(filtered);
  }, [filtered]);

  const expandedOrgKeys = useMemo(() => {
    const out: string[] = [];
    const walk = (nodes: DataNode[]) => {
      for (const n of nodes) {
        const key = String(n.key ?? '');
        if (key.startsWith('o:')) out.push(key);
        if (Array.isArray(n.children) && n.children.length > 0) {
          walk(n.children as DataNode[]);
        }
      }
    };
    walk(treeData);
    return out;
  }, [treeData]);

  return (
    <Modal
      open={open}
      title={title}
      onCancel={onClose}
      onOk={() => {
        if (!selectedKey) return;
        const sel = memberByKey.get(selectedKey);
        if (!sel) return;
        onSelect(sel);
      }}
      okText="선택"
      cancelText="닫기"
      okButtonProps={{ disabled: !selectedKey }}
      width={560}
      destroyOnHidden
    >
      <div className="tw-space-y-3">
        <Input
          allowClear
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="이름/직급/조직명 검색"
          prefix={<SearchOutlined className="tw-text-slate-400" />}
        />
        <Spin spinning={isLoading}>
          {isError ? (
            <Typography.Text type="danger">조직도를 불러오지 못했습니다.</Typography.Text>
          ) : (
            <div className="tw-max-h-[52vh] tw-overflow-auto tw-rounded-xl tw-border tw-border-slate-200 tw-bg-white tw-p-2">
              <Tree
                blockNode
                showLine={{ showLeafIcon: false }}
                expandedKeys={expandedOrgKeys}
                selectedKeys={selectedKey ? [selectedKey] : []}
                onSelect={(keys) => {
                  const key = String(keys[0] ?? '');
                  if (!key.startsWith(MEMBER_KEY_PREFIX)) return;
                  setSelectedKey(key);
                }}
                treeData={treeData}
                onExpand={() => {
                  // 전체 펼침 UX 고정: 접기 동작을 허용하지 않음
                }}
                switcherIcon={({ expanded }) => (
                  <RightOutlined
                    className={`tw-text-[11px] tw-text-slate-400 tw-transition-transform ${expanded ? 'tw-rotate-90' : ''}`}
                  />
                )}
              />
            </div>
          )}
        </Spin>
      </div>
    </Modal>
  );
}

