import { LogoutOutlined, MoreOutlined, UserAddOutlined } from '@ant-design/icons';
import { Avatar, Dropdown, type MenuProps, Typography } from 'antd';
import type { MemberChatRoomSummary } from '@/features/member-chat/model/types';
import {
  chatSenderInitial,
} from '@/features/member-chat/hooks/useChatSenderProfiles';
import type { DirectPartnerInfo } from '@/features/member-chat/hooks/useDirectPartner';
import { MEMBER_CHAT_OVERLAY_Z } from '@/features/member-chat/ui/shared/chatIdentity';

type Props = {
  activeRoom: MemberChatRoomSummary;
  directPartner: DirectPartnerInfo | null;
  isCompactLayout: boolean;
  onOpenParticipants: () => void;
  onOpenInvite: () => void;
  onShowRoomList: () => void;
  onLeaveRoom: () => void;
  leaving: boolean;
};

/**
 * 활성 대화의 상단 헤더.
 *  - 1:1: 상대 프로필
 *  - 그룹: 제목 + 클릭 시 참여자 Drawer
 *  - compact 레이아웃에서는 좌측 뒤로가기 화살표 노출
 */
export function ChatThreadHeader({
  activeRoom,
  directPartner,
  isCompactLayout,
  onOpenParticipants,
  onOpenInvite,
  onShowRoomList,
  onLeaveRoom,
  leaving,
}: Props) {
  const isDirectRoom = activeRoom.roomType === 'DIRECT';
  const leaveLabel = '채팅방 나가기';
  const menuItems: MenuProps['items'] = [
    ...(!isDirectRoom
      ? [
          {
            key: 'invite',
            icon: <UserAddOutlined />,
            label: '멤버 초대',
            onClick: onOpenInvite,
          },
        ]
      : []),
    {
      key: 'leave',
      danger: true,
      icon: <LogoutOutlined />,
      label: leaveLabel,
      onClick: onLeaveRoom,
      disabled: leaving,
    },
  ];

  return (
    <div className="tw-shrink-0 tw-bg-white/85 tw-px-4 tw-py-3 tw-backdrop-blur-sm">
      <div className="tw-flex tw-items-start tw-justify-between tw-gap-2">
        <div className="tw-flex tw-min-w-0 tw-items-start tw-gap-2">
        {isCompactLayout ? (
          <button
            type="button"
            className="tw-mt-0.5 tw-inline-flex tw-h-8 tw-appearance-none tw-items-center tw-justify-center tw-border-0 tw-bg-transparent tw-px-1 tw-text-base tw-font-semibold tw-text-slate-500 tw-shadow-none tw-transition-colors hover:tw-text-[#2563EB] focus:tw-outline-none"
            onClick={onShowRoomList}
            aria-label="채팅방 목록 열기"
          >
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
              className="tw-h-4 tw-w-4"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M14.5 6.5L9 12L14.5 17.5"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        ) : null}
        {isDirectRoom ? (
          <div className="tw-flex tw-min-w-0 tw-items-center tw-gap-2.5">
            <Avatar
              size={36}
              shape="square"
              src={directPartner?.avatarUrl || undefined}
              className="!tw-rounded-2xl tw-flex-shrink-0 !tw-bg-[#2563EB] !tw-text-white !tw-shadow-sm"
            >
              {chatSenderInitial(directPartner?.name || activeRoom.title || '?')}
            </Avatar>
            <div className="tw-min-w-0">
              <Typography.Text strong className="tw-block tw-truncate tw-text-base tw-text-slate-900">
                {directPartner?.name || activeRoom.title || '채팅'}
              </Typography.Text>
              <div className="tw-mt-0.5 tw-truncate tw-text-xs tw-text-slate-500">
                {directPartner?.subtitle || '1:1 채팅'}
              </div>
            </div>
          </div>
        ) : (
          <div className="tw-min-w-0">
            <button
              type="button"
              onClick={onOpenParticipants}
              className="tw-inline-flex tw-max-w-full tw-appearance-none tw-items-center tw-gap-1 tw-border-0 tw-bg-transparent tw-p-0 tw-text-left tw-text-base tw-font-semibold tw-text-slate-900 tw-shadow-none hover:tw-text-[#2563EB] focus:tw-outline-none"
              aria-label="참여자 목록 열기"
              title="참여자 목록 보기"
            >
              <span className="tw-truncate">{activeRoom.title || '채팅'}</span>
              <svg
                viewBox="0 0 24 24"
                aria-hidden="true"
                className="tw-h-3.5 tw-w-3.5 tw-flex-shrink-0 tw-text-slate-400"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M9 6l6 6-6 6"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            <div className="tw-mt-0.5 tw-text-xs tw-text-slate-500">
              그룹 채팅
              {typeof activeRoom.participantCount === 'number'
                ? ` · 참여 ${activeRoom.participantCount}명`
                : null}
            </div>
          </div>
        )}
        </div>
        <Dropdown
          menu={{ items: menuItems }}
          trigger={['click']}
          placement="bottomRight"
          overlayStyle={{ zIndex: MEMBER_CHAT_OVERLAY_Z + 20 }}
        >
          <button
            type="button"
            aria-label="채팅방 메뉴 열기"
            className="tw-inline-flex tw-h-8 tw-w-8 tw-shrink-0 tw-items-center tw-justify-center tw-rounded-lg tw-border-0 tw-bg-transparent tw-text-slate-500 tw-transition-colors hover:tw-bg-slate-100 hover:tw-text-slate-700 focus-visible:tw-outline-none focus-visible:tw-ring-2 focus-visible:tw-ring-[#2563EB]/20"
          >
            <MoreOutlined />
          </button>
        </Dropdown>
      </div>
    </div>
  );
}