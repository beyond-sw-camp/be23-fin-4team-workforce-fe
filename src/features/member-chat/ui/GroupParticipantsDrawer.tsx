import { RightOutlined, SearchOutlined } from '@ant-design/icons';
import { Avatar, Empty, Input, List, Skeleton, Spin, Tag, Tree, Typography, message } from 'antd';
import type { DataNode } from 'antd/es/tree';
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { memberChatApi } from '@/features/member-chat/api/memberChatApi';
import { chatSenderInitial } from '@/features/member-chat/hooks/useChatSenderProfiles';
import type { MemberChatParticipant } from '@/features/member-chat/model/types';
import {
  ORG_CHART_HIDDEN_JOB_GRADE,
  type OrgChartOrgNode,
  organizationApi,
} from '@/features/organization/api/organizationApi';
import { AppButton } from '@/shared/ui/AppButton';
import { AppDoubleActionModal } from '@/shared/ui/AppDoubleActionModal';
import { AppModal } from '@/shared/ui/AppModal';

/**
 * 단체 채팅방 참여자 목록 — 방 제목 클릭 시 뜨는 중앙 팝업(Modal).
 * 컴포넌트 이름은 외부 import 호환을 위해 유지하되, 구현은 Drawer 가 아닌 Modal 이다.
 */
export type GroupParticipantsDrawerProps = {
  open: boolean;
  onClose: () => void;
  roomId: number | null;
  roomTitle?: string;
  meId?: string | null;
  roomType?: 'DIRECT' | 'GROUP';
  mode?: 'participants' | 'invite';
};

function subtitleOf(p: MemberChatParticipant): string {
  const title = p.jobTitleName?.trim() || p.jobGradeName?.trim() || '';
  const org = p.organizationName?.trim() || '';
  return [title, org].filter(Boolean).join(' · ');
}

function sameUuid(a?: string | null, b?: string | null): boolean {
  const x = a?.trim();
  const y = b?.trim();
  if (!x || !y) return false;
  return x.replace(/-/g, '').toLowerCase() === y.replace(/-/g, '').toLowerCase();
}

export function GroupParticipantsDrawer({
  open,
  onClose,
  roomId,
  roomTitle,
  meId,
  roomType,
  mode = 'participants',
}: GroupParticipantsDrawerProps) {
  const queryClient = useQueryClient();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteKeyword, setInviteKeyword] = useState('');
  const [checkedMemberIds, setCheckedMemberIds] = useState<string[]>([]);
  const isGroupRoom = roomType === 'GROUP';
  const showParticipantsModal = open && mode === 'participants';

  useEffect(() => {
    if (!open) {
      setInviteOpen(false);
      setInviteKeyword('');
      setCheckedMemberIds([]);
      return;
    }
    if (mode === 'invite' && isGroupRoom) {
      setInviteOpen(true);
    }
  }, [open, mode, isGroupRoom]);

  const { data: participants = [], isLoading } = useQuery({
    queryKey: ['member-chat', 'participants', roomId],
    queryFn: () => memberChatApi.listParticipants(roomId!),
    enabled: showParticipantsModal && roomId != null,
    staleTime: 30_000,
  });

  const existingMemberIds = useMemo(() => new Set(participants.map((p) => p.memberId)), [participants]);
  const canInvite = isGroupRoom;

  const { data: orgChartData, isLoading: loadingOrgChart } = useQuery({
    queryKey: ['organization', 'org-chart', 'chat-invite', roomId],
    queryFn: () => organizationApi.getOrgChart(),
    enabled: inviteOpen && roomId != null && isGroupRoom,
    staleTime: 60_000,
    retry: 0,
  });

  const addMembersMutation = useMutation({
    mutationFn: async (memberIds: string[]) => {
      if (!roomId) return;
      await Promise.all(memberIds.map((memberId) => memberChatApi.addMember(roomId, memberId)));
    },
    onSuccess: async () => {
      setInviteOpen(false);
      setInviteKeyword('');
      setCheckedMemberIds([]);
      await queryClient.invalidateQueries({ queryKey: ['member-chat', 'participants', roomId] });
      await queryClient.invalidateQueries({ queryKey: ['member-chat', 'rooms'] });
      void message.success('참여자를 초대했습니다.');
      if (mode === 'invite') onClose();
    },
    onError: (e: Error) => {
      if (e.message?.includes('권한') || e.message?.toLowerCase().includes('forbidden')) {
        void message.error('현재 서버 권한 정책상 초대가 제한되어 있습니다.');
        return;
      }
      void message.error(e.message || '참여자 초대에 실패했습니다.');
    },
  });

  const inviteTreeData = useMemo<DataNode[]>(() => {
    const roots = orgChartData?.organizations ?? [];
    if (roots.length === 0) return [];
    const q = inviteKeyword.trim().toLowerCase();

    const orgMatches = (org: OrgChartOrgNode): boolean => {
      if (!q) return true;
      if (org.name.toLowerCase().includes(q)) return true;
      if (
        org.members.some((m) => {
          if (m.jobGradeName.trim() === ORG_CHART_HIDDEN_JOB_GRADE) return false;
          return (
            m.name.toLowerCase().includes(q) ||
            m.jobGradeName.toLowerCase().includes(q) ||
            (m.memberStatus ?? '').toLowerCase().includes(q)
          );
        })
      ) {
        return true;
      }
      return org.children.some(orgMatches);
    };

    const toNodes = (orgs: OrgChartOrgNode[]): DataNode[] =>
      orgs
        .filter(orgMatches)
        .map((org) => {
          const memberLeafs: DataNode[] = org.members
            .filter((m) => {
              if (m.jobGradeName.trim() === ORG_CHART_HIDDEN_JOB_GRADE) return false;
              if (m.memberId === meId) return false;
              if (existingMemberIds.has(m.memberId)) return false;
              if ((m.memberStatus ?? 'ACTIVE') !== 'ACTIVE') return false;
              if (!q) return true;
              return (
                m.name.toLowerCase().includes(q) ||
                m.jobGradeName.toLowerCase().includes(q) ||
                (m.memberStatus ?? '').toLowerCase().includes(q)
              );
            })
            .map((m) => ({
              key: `m:${m.memberId}`,
              title: (
                <span className="tw-text-sm tw-text-slate-800">
                  <span className="tw-font-medium">{m.name}</span>
                  <span className="tw-ml-1 tw-text-xs tw-text-slate-500">{m.jobGradeName}</span>
                </span>
              ),
              isLeaf: true,
            }));
          const children = [...memberLeafs, ...toNodes(org.children)];
          return {
            key: `o:${org.organizationId}`,
            title: (
              <span className="tw-text-sm tw-font-semibold tw-text-slate-800">
                {org.name}
                <span className="tw-ml-1 tw-font-normal tw-text-slate-400">{children.length}</span>
              </span>
            ),
            selectable: false,
            children,
          };
        })
        .filter((n) => Array.isArray(n.children) && n.children.length > 0);

    const nodes = toNodes(roots);
    return nodes;
  }, [orgChartData?.organizations, inviteKeyword, meId, existingMemberIds]);

  const allInviteLeafKeys = useMemo(() => {
    const out: string[] = [];
    const walk = (nodes: DataNode[]) => {
      for (const n of nodes) {
        if (typeof n.key === 'string' && n.key.startsWith('m:')) out.push(n.key);
        if (n.children) walk(n.children);
      }
    };
    walk(inviteTreeData);
    return out;
  }, [inviteTreeData]);

  return (
    <>
      <AppModal
        title={roomTitle ? `${roomTitle} · 참여자` : '참여자'}
        open={showParticipantsModal}
        onCancel={onClose}
        footer={null}
        // 플로팅 채팅 패널(z≈1060) 위에 확실히 뜨도록
        zIndex={10_100}
        width={420}
        centered
        destroyOnHidden
      >
        <div className="tw-px-5 tw-py-4">
        {canInvite ? (
          <div className="tw-mb-3 tw-flex tw-justify-end">
            <AppButton size="small" variant="secondary" onClick={() => setInviteOpen(true)}>
              참여자 초대
            </AppButton>
          </div>
        ) : null}
        {isLoading ? (
          <Skeleton active paragraph={{ rows: 6 }} />
        ) : participants.length === 0 ? (
          <Empty description="참여자가 없습니다" />
        ) : (
          <>
            <Typography.Text type="secondary" className="tw-text-xs">
              총 {participants.length}명
            </Typography.Text>
            <List
              className="tw-mt-2 tw-max-h-[60vh] tw-overflow-y-auto"
              itemLayout="horizontal"
              dataSource={participants}
              rowKey={(p) => p.memberId}
              renderItem={(p) => {
                const sub = subtitleOf(p);
                const isMe = sameUuid(p.memberId, meId);
                return (
                  <List.Item className="!tw-px-0">
                    <List.Item.Meta
                      avatar={
                        <Avatar src={p.profileUrl || undefined} className="tw-bg-slate-200 tw-text-slate-500">
                          {chatSenderInitial(p.name || '?')}
                        </Avatar>
                      }
                      title={
                        <div className="tw-flex tw-items-center tw-gap-1.5">
                          <span className="tw-text-sm tw-font-medium tw-text-slate-900">
                            {p.name || '—'}
                          </span>
                          {isMe ? (
                            <Tag color="geekblue" className="!tw-m-0">
                              나
                            </Tag>
                          ) : null}
                        </div>
                      }
                      description={
                        sub ? (
                          <span className="tw-text-xs tw-text-slate-500">{sub}</span>
                        ) : null
                      }
                    />
                  </List.Item>
                );
              }}
            />
          </>
        )}
        </div>
      </AppModal>
      <AppDoubleActionModal
        title="참여자 초대"
        open={inviteOpen}
        onClose={() => {
          setInviteOpen(false);
          setInviteKeyword('');
          setCheckedMemberIds([]);
          if (mode === 'invite') onClose();
        }}
        onConfirm={() => {
          const memberIds = checkedMemberIds.map((k) => k.replace(/^m:/, ''));
          if (memberIds.length === 0) {
            void message.warning('초대할 구성원을 선택해 주세요.');
            return;
          }
          void addMembersMutation.mutateAsync(memberIds);
        }}
        confirmText="초대"
        cancelText="취소"
        confirmLoading={addMembersMutation.isPending}
        zIndex={10_200}
        width={560}
        destroyOnHidden
      >
        <div className="tw-px-5 tw-py-4">
        <div className="tw-flex tw-flex-col tw-gap-3">
          <Input
            allowClear
            value={inviteKeyword}
            onChange={(e) => setInviteKeyword(e.target.value)}
            placeholder="이름, 직급, 부서 검색"
            prefix={<SearchOutlined className="tw-text-slate-400" />}
          />
          <Spin spinning={loadingOrgChart}>
            <div className="tw-max-h-[min(52vh,440px)] tw-overflow-auto tw-rounded-xl tw-border tw-border-slate-200 tw-bg-white tw-p-2">
              {inviteTreeData.length === 0 ? (
                <Typography.Text type="secondary" className="tw-text-sm">
                  초대 가능한 구성원이 없습니다.
                </Typography.Text>
              ) : (
                <Tree
                  checkable
                  selectable={false}
                  checkedKeys={checkedMemberIds}
                  onCheck={(keys) => {
                    const arr = Array.isArray(keys) ? keys : keys.checked;
                    const onlyMemberKeys = arr
                      .map((k) => String(k))
                      .filter((k) => k.startsWith('m:'));
                    setCheckedMemberIds(onlyMemberKeys);
                  }}
                  treeData={inviteTreeData}
                  switcherIcon={({ expanded }) => (
                    <RightOutlined
                      className={`tw-text-[11px] tw-text-slate-400 tw-transition-transform tw-duration-200 ${expanded ? 'tw-rotate-90' : ''}`}
                    />
                  )}
                />
              )}
            </div>
          </Spin>
          <Typography.Text type="secondary" className="tw-text-xs">
            선택 {checkedMemberIds.length}명 / 초대 가능 {allInviteLeafKeys.length}명
          </Typography.Text>
        </div>
        </div>
      </AppDoubleActionModal>
    </>
  );
}
