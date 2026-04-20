import { RightOutlined, SearchOutlined } from '@ant-design/icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Avatar, Checkbox, Input, Modal, Spin, Tree, Typography, message } from 'antd';
import type { DataNode } from 'antd/es/tree';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { memberChatApi } from '@/features/member-chat/api/memberChatApi';
import type { MemberChatRoomSummary } from '@/features/member-chat/model/types';
import {
  ORG_CHART_HIDDEN_JOB_GRADE,
  type OrgChartOrgNode,
  organizationApi,
} from '@/features/organization/api/organizationApi';
import { AppButton } from '@/shared/ui/AppButton';

const KS = '\x1f';

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

function isSelectableMember(memberId: string, memberStatus: string | undefined, selfMemberId?: string): boolean {
  if (memberId === selfMemberId) return false;
  return (memberStatus ?? 'ACTIVE') === 'ACTIVE';
}

/** 이 조직 노드 서브트리(하위 조직 포함)의 선택 가능한 memberId */
function collectSelectableMemberIdsFromOrg(org: OrgChartOrgNode, selfMemberId?: string): string[] {
  const out: string[] = [];
  const walk = (n: OrgChartOrgNode) => {
    for (const m of n.members) {
      if (m.jobGradeName.trim() === ORG_CHART_HIDDEN_JOB_GRADE) continue;
      if (isSelectableMember(m.memberId, m.memberStatus, selfMemberId)) out.push(m.memberId);
    }
    for (const c of n.children) walk(c);
  };
  walk(org);
  return out;
}

function collectAllSelectableFromRoots(orgs: OrgChartOrgNode[], selfMemberId?: string): string[] {
  const acc: string[] = [];
  for (const o of orgs) acc.push(...collectSelectableMemberIdsFromOrg(o, selfMemberId));
  return acc;
}

function buildNameMap(orgs: OrgChartOrgNode[], selfMemberId?: string, bucket = new Map<string, string>()) {
  for (const org of orgs) {
    for (const m of org.members) {
      if (m.jobGradeName.trim() === ORG_CHART_HIDDEN_JOB_GRADE) continue;
      if (isSelectableMember(m.memberId, m.memberStatus, selfMemberId) && !bucket.has(m.memberId)) {
        bucket.set(m.memberId, m.name);
      }
    }
    buildNameMap(org.children, selfMemberId, bucket);
  }
  return bucket;
}

function buildDefaultGroupTitle(memberIds: string[], nameById: Map<string, string>): string {
  const names = memberIds.map((id) => nameById.get(id) ?? '구성원');
  if (names.length <= 2) return names.join(', ');
  return `${names[0]}, ${names[1]} 외 ${names.length - 2}명`;
}

type CreateRoomFromOrgChartModalProps = {
  open: boolean;
  selfMemberId?: string;
  onClose: () => void;
  onCreated: (room: MemberChatRoomSummary) => void;
};

export function CreateRoomFromOrgChartModal({
  open,
  selfMemberId,
  onClose,
  onCreated,
}: CreateRoomFromOrgChartModalProps) {
  const queryClient = useQueryClient();
  const [keyword, setKeyword] = useState('');
  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (!open) {
      setKeyword('');
      setSelected(new Set());
    }
  }, [open]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['organization', 'org-chart', 'member-chat-room-create'],
    queryFn: () => organizationApi.getOrgChart(),
    enabled: open,
    staleTime: 60_000,
  });

  const filteredRoots = useMemo(() => {
    if (!data?.organizations.length) return [];
    return filterOrganizationsByQuery(data.organizations, keyword.trim());
  }, [data?.organizations, keyword]);

  const nameById = useMemo(
    () => (data?.organizations ? buildNameMap(data.organizations, selfMemberId) : new Map<string, string>()),
    [data?.organizations, selfMemberId],
  );

  const toggleMember = useCallback((memberId: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(memberId);
      else next.delete(memberId);
      return next;
    });
  }, []);

  const allVisibleIds = useMemo(
    () => collectAllSelectableFromRoots(filteredRoots, selfMemberId),
    [filteredRoots, selfMemberId],
  );

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
          <span className="tw-flex tw-min-w-0 tw-flex-1 tw-items-center tw-gap-2">
            <Avatar size={28} className="tw-shrink-0 tw-bg-slate-200 tw-text-xs tw-text-slate-700">
              {(m.name || '?').slice(0, 1)}
            </Avatar>
            <span className="tw-truncate tw-text-sm tw-text-slate-800">
              <span className="tw-font-medium">{m.name}</span>{' '}
              <span className="tw-text-xs tw-font-normal tw-text-slate-500">{m.jobGradeName}</span>
            </span>
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

    const orgTitleRow = (label: string, memberCount: number) => (
      <div className="tw-flex tw-w-full tw-min-w-0 tw-items-center tw-pr-1">
        <span className="tw-truncate tw-text-sm tw-font-semibold tw-text-slate-800">
          {label}
          <span className="tw-ml-1 tw-font-normal tw-text-slate-400"> {memberCount}</span>
        </span>
      </div>
    );

    function buildOrgNodes(orgs: OrgChartOrgNode[]): DataNode[] {
      return orgs.map((org) => {
        const subtreeIds = collectSelectableMemberIdsFromOrg(org, selfMemberId);
        const memberNodes: DataNode[] = [];
        for (const m of org.members) {
          if (m.jobGradeName.trim() === ORG_CHART_HIDDEN_JOB_GRADE) continue;
          if (!isSelectableMember(m.memberId, m.memberStatus, selfMemberId)) continue;
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
          title: orgTitleRow(org.name, subtreeIds.length),
          selectable: false,
          ...(children.length > 0 ? { children } : { isLeaf: true }),
        };
      });
    }

    const roots = buildOrgNodes(filteredRoots);
    return [
      {
        key: 'root-company',
        title: (
          <div className="tw-flex tw-w-full tw-min-w-0 tw-items-center tw-pr-1">
            <span className="tw-truncate tw-text-sm tw-font-semibold tw-text-[#1e3a5f]">
              {data.companyName}
              <span className="tw-ml-1 tw-font-normal tw-text-slate-400"> {allVisibleIds.length}</span>
            </span>
          </div>
        ),
        selectable: false,
        children: roots.length > 0 ? roots : undefined,
        isLeaf: roots.length === 0,
      },
    ];
  }, [data, filteredRoots, allVisibleIds, selfMemberId, selected, toggleMember]);

  const createDirectMutation = useMutation({
    mutationFn: (otherMemberId: string) => memberChatApi.createDirectRoom(otherMemberId),
    onSuccess: (room) => {
      void queryClient.invalidateQueries({ queryKey: ['member-chat', 'rooms'] });
      message.success('1:1 채팅방이 열렸습니다.');
      onCreated(room);
      onClose();
    },
    onError: (error) => {
      message.error((error as Error).message || '채팅방을 만들지 못했습니다.');
    },
  });

  const createGroupMutation = useMutation({
    mutationFn: ({ title, memberIds }: { title: string; memberIds: string[] }) =>
      memberChatApi.createGroupRoom(title, memberIds),
    onSuccess: (room) => {
      void queryClient.invalidateQueries({ queryKey: ['member-chat', 'rooms'] });
      message.success('그룹 채팅방이 열렸습니다.');
      onCreated(room);
      onClose();
    },
    onError: (error) => {
      message.error((error as Error).message || '그룹 채팅방을 만들지 못했습니다.');
    },
  });

  const pending = createDirectMutation.isPending || createGroupMutation.isPending;
  const selectedCount = selected.size;

  const handleConfirm = () => {
    const ids = Array.from(selected);
    if (ids.length === 0) {
      void message.warning('대화 상대를 한 명 이상 선택해 주세요.');
      return;
    }
    if (ids.length === 1) {
      void createDirectMutation.mutateAsync(ids[0]!);
    } else {
      const title = buildDefaultGroupTitle(ids, nameById);
      void createGroupMutation.mutateAsync({ title, memberIds: ids });
    }
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      destroyOnHidden
      zIndex={1200}
      width={560}
      title={<span className="tw-text-base tw-font-semibold tw-text-slate-900">새 대화</span>}
      styles={{ body: { paddingTop: 8 } }}
    >
      <div className="tw-flex tw-flex-col tw-gap-3">
        <Input
          allowClear
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="이름, 직위, 직책, 직급, 부서, 전화, 아이디"
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
              <div
                className={`tw-max-h-[min(52vh,440px)] tw-overflow-auto tw-rounded-xl tw-border tw-border-slate-200 tw-bg-white tw-p-2 ${ORG_CHART_TREE_LINE_CLASS} [&_.ant-tree-switcher]:tw-flex [&_.ant-tree-switcher]:tw-w-5 [&_.ant-tree-switcher]:tw-shrink-0 [&_.ant-tree-switcher]:tw-items-center [&_.ant-tree-switcher]:tw-justify-center [&_.ant-tree-switcher]:tw-bg-transparent [&_.ant-tree-node-content-wrapper]:tw-rounded-md`}
              >
                <Tree
                  blockNode
                  expandAction="click"
                  showLine={{ showLeafIcon: false }}
                  defaultExpandAll
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
          선택 {selectedCount}명 · 1명이면 1:1, 2명 이상이면 그룹 채팅방이 만들어집니다.
        </Typography.Text>

        <AppButton
          type="primary"
          block
          loading={pending}
          disabled={isLoading || selectedCount === 0}
          className="!tw-h-12 !tw-rounded-xl !tw-border-0 !tw-bg-[#00A3C1] hover:!tw-bg-[#008faf] disabled:!tw-bg-slate-200"
          onClick={handleConfirm}
        >
          확인
        </AppButton>
      </div>
    </Modal>
  );
}
