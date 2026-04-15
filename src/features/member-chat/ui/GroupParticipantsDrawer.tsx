import { Avatar, Empty, List, Modal, Skeleton, Tag, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { memberChatApi } from '@/features/member-chat/api/memberChatApi';
import { chatSenderInitial } from '@/features/member-chat/hooks/useChatSenderProfiles';
import type {
  MemberChatParticipant,
  MemberChatParticipantRole,
} from '@/features/member-chat/model/types';

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
};

const ROLE_LABEL: Record<MemberChatParticipantRole, string> = {
  OWNER: '방장',
  MODERATOR: '운영',
  MEMBER: '',
};

const ROLE_COLOR: Record<MemberChatParticipantRole, string> = {
  OWNER: 'gold',
  MODERATOR: 'blue',
  MEMBER: 'default',
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
}: GroupParticipantsDrawerProps) {
  const { data: participants = [], isLoading } = useQuery({
    queryKey: ['member-chat', 'participants', roomId],
    queryFn: () => memberChatApi.listParticipants(roomId!),
    enabled: open && roomId != null,
    staleTime: 30_000,
  });

  return (
    <Modal
      title={roomTitle ? `${roomTitle} · 참여자` : '참여자'}
      open={open}
      onCancel={onClose}
      footer={null}
      // 플로팅 채팅 패널(z≈1060) 위에 확실히 뜨도록
      zIndex={10_100}
      width={420}
      centered
      destroyOnClose
    >
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
              const roleLabel = ROLE_LABEL[p.role];
              const isMe = sameUuid(p.memberId, meId);
              return (
                <List.Item className="!tw-px-0">
                  <List.Item.Meta
                    avatar={
                      <Avatar src={p.profileUrl || undefined} className="tw-bg-slate-200 tw-text-slate-700">
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
                        {roleLabel ? (
                          <Tag color={ROLE_COLOR[p.role]} className="!tw-m-0">
                            {roleLabel}
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
    </Modal>
  );
}
