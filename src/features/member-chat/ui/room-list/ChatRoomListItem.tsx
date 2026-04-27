import { Avatar, Badge, List } from 'antd';
import type { MemberChatRoomSummary } from '@/features/member-chat/model/types';

type Props = {
  room: MemberChatRoomSummary;
  selected: boolean;
  onClick: () => void;
};

function extractGroupAvatarSeeds(title: string): string[] {
  const normalized = title.replace(/\s*외\s*\d+명\s*$/, '').trim();
  const tokens = normalized
    .split(',')
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
  const initials = tokens
    .map((token) => token.replace(/[^\p{L}\p{N}가-힣]/gu, '').slice(0, 1))
    .filter((token) => token.length > 0 && !/^\d+$/.test(token));
  return initials;
}

function countAdditionalParticipants(title: string): number {
  const match = title.match(/외\s*(\d+)\s*명/);
  if (!match?.[1]) return 0;
  const n = Number(match[1]);
  return Number.isFinite(n) ? n : 0;
}

function GroupRoomAvatar({
  title,
  participantCount,
  selected,
}: {
  title: string;
  participantCount?: number;
  selected: boolean;
}) {
  const seeds = extractGroupAvatarSeeds(title);
  const additional = countAdditionalParticipants(title);
  const totalParticipants = Math.max(participantCount ?? 0, seeds.length + additional);
  const visibleSeedCount = Math.min(totalParticipants, 3);
  const visibleSeeds = Array.from({ length: visibleSeedCount }, (_, index) => seeds[index] ?? '?');
  const remainingCount = Math.max(totalParticipants - visibleSeeds.length, 0);
  const cells = [
    ...visibleSeeds,
    ...(remainingCount > 0 ? [`+${remainingCount}`] : []),
  ].slice(0, 4);
  return (
    <div
      className={`tw-grid tw-h-10 tw-w-10 tw-grid-cols-2 tw-grid-rows-2 tw-gap-0.5 tw-overflow-hidden tw-rounded-2xl tw-p-1 ${
        selected ? 'tw-bg-[#2563EB]/15' : 'tw-bg-slate-200'
      }`}
      aria-hidden
    >
      {Array.from({ length: 4 }, (_, index) => {
        const label = cells[index] ?? '';
        const isCounter = label.startsWith('+');
        return (
          <span
            key={`group-avatar-cell-${index}`}
            className={`tw-flex tw-items-center tw-justify-center tw-rounded-md tw-text-[10px] tw-font-bold ${
              selected ? 'tw-bg-[#2563EB] tw-text-white' : 'tw-bg-white tw-text-slate-500'
            }`}
          >
            {isCounter ? label : label.slice(0, 1)}
          </span>
        );
      })}
    </div>
  );
}

/**
 * 채팅방 목록의 행 1개.
 * 선택 시 #2563EB 풀배경 + 텍스트 화이트 (디자인 시스템의 액센트 톤).
 */
export function ChatRoomListItem({ room, selected, onClick }: Props) {
  const isDirect = room.roomType === 'DIRECT';
  const displayName = isDirect
    ? room.otherMemberName?.trim() || '대화 상대'
    : room.title?.trim() || '제목 없음';
  const subtitleLine = isDirect
    ? [
        room.otherMemberJobTitleName?.trim() ||
          room.otherMemberJobGradeName?.trim() ||
          '',
        room.otherMemberOrganizationName?.trim() || '',
      ]
        .filter(Boolean)
        .join(' · ')
    : `그룹 · 참여 ${room.participantCount ?? 0}명`;
  const avatarInitial = displayName.slice(0, 1) || '?';

  return (
    <List.Item
      className={`!tw-cursor-pointer !tw-rounded-xl !tw-border-0 !tw-px-2 !tw-py-2.5 tw-transition-all ${
        selected
          ? '!tw-bg-white !tw-shadow-sm [&_.ant-list-item-meta-title]:!tw-text-[#2563EB]'
          : 'hover:!tw-bg-white'
      }`}
      onClick={onClick}
    >
      <List.Item.Meta
        avatar={
          isDirect ? (
            <Avatar
              src={room.otherMemberProfileUrl || undefined}
              shape="square"
              className={
                selected
                  ? '!tw-rounded-2xl !tw-bg-[#2563EB] !tw-text-white !tw-shadow-sm'
                  : '!tw-rounded-2xl !tw-bg-slate-200 !tw-text-slate-500'
              }
              size={40}
            >
              {avatarInitial}
            </Avatar>
          ) : (
            <GroupRoomAvatar
              title={displayName}
              participantCount={room.participantCount}
              selected={selected}
            />
          )
        }
        title={
          <span className="tw-flex tw-min-w-0 tw-items-center tw-gap-1.5">
            <span className="tw-truncate tw-text-[13px] tw-font-bold">{displayName}</span>
            {room.unreadCount && room.unreadCount > 0 ? (
              <Badge
                count={room.unreadCount}
                overflowCount={99}
                color="#F43F5E"
                className="!tw-ml-auto tw-flex-shrink-0"
              />
            ) : null}
          </span>
        }
        description={
          <span className="tw-flex tw-min-w-0 tw-flex-col tw-gap-0.5 tw-text-[11px] tw-text-slate-500">
            {subtitleLine ? <span className="tw-block tw-truncate">{subtitleLine}</span> : null}
            {room.lastMessagePreview ? (
              <span className="tw-block tw-truncate tw-text-[11px] tw-opacity-90">
                {room.lastMessagePreview}
              </span>
            ) : null}
          </span>
        }
      />
    </List.Item>
  );
}
