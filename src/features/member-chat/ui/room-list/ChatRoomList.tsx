import { PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { Input, List } from 'antd';
import type { MemberChatRoomSummary } from '@/features/member-chat/model/types';
import { PRETTY_SCROLLBAR_CLASS } from '@/features/member-chat/ui/shared/prettyScrollbar';
import { ChatRoomListItem } from '@/features/member-chat/ui/room-list/ChatRoomListItem';

type Props = {
  rooms: readonly MemberChatRoomSummary[];
  filteredRooms: readonly MemberChatRoomSummary[];
  loading: boolean;
  showEmptyOnboarding: boolean;
  query: string;
  onQueryChange: (next: string) => void;
  activeRoomId: number | null;
  onSelectRoom: (room: MemberChatRoomSummary) => void;
  onNewRoom: () => void;
};

/**
 * 좌측 사이드바 — 새 대화 버튼 + 검색 + 방 리스트.
 */
export function ChatRoomList({
  filteredRooms,
  loading,
  showEmptyOnboarding,
  query,
  onQueryChange,
  activeRoomId,
  onSelectRoom,
  onNewRoom,
}: Props) {
  return (
    <>
      <div className="tw-flex tw-shrink-0 tw-flex-col tw-gap-3 tw-bg-slate-50 tw-px-3 tw-pt-3 tw-pb-2">
        <button
          type="button"
          onClick={onNewRoom}
          className="tw-flex tw-w-full tw-cursor-pointer tw-items-center tw-justify-center tw-gap-2 tw-rounded-xl tw-border tw-border-[#2563EB]/25 tw-bg-white tw-py-2.5 tw-text-xs tw-font-bold tw-text-[#2563EB] tw-shadow-sm tw-transition-colors hover:tw-bg-[#EFF6FF] focus:tw-outline-none focus-visible:tw-ring-2 focus-visible:tw-ring-[#2563EB]/30"
        >
          <PlusOutlined className="tw-text-[12px]" />
          <span>새 대화</span>
        </button>
        <Input
          allowClear
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="검색"
          prefix={<SearchOutlined className="tw-text-slate-400" />}
          className="tw-rounded-xl"
        />
      </div>
      <div className="tw-flex tw-min-h-0 tw-flex-1 tw-flex-col tw-overflow-hidden tw-px-1 tw-pb-2 tw-pt-2">
        {showEmptyOnboarding ? (
          <div className="tw-flex tw-min-h-[200px] tw-flex-1 tw-flex-col tw-items-center tw-justify-center tw-gap-4 tw-px-4 tw-py-6">
            <p className="tw-m-0 tw-text-center tw-text-sm tw-leading-relaxed tw-text-slate-500">
              동료들과 첫 대화를 나눠보세요!
            </p>
          </div>
        ) : (
          <List
            className={`member-chat-room-list tw-mt-2 tw-min-h-0 tw-flex-1 tw-overflow-y-auto tw-rounded-xl tw-px-1.5 tw-py-1 [&_.ant-list-items]:tw-divide-y [&_.ant-list-items]:tw-divide-slate-100 ${PRETTY_SCROLLBAR_CLASS}`}
            loading={loading}
            dataSource={filteredRooms as MemberChatRoomSummary[]}
            locale={{ emptyText: '검색 결과가 없습니다.' }}
            renderItem={(room) => (
              <ChatRoomListItem
                room={room}
                selected={activeRoomId === room.roomId}
                onClick={() => onSelectRoom(room)}
              />
            )}
          />
        )}
      </div>
    </>
  );
}
