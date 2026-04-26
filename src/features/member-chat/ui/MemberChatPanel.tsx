import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Typography, Upload, message } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/features/auth/useAuth';
import { memberChatApi } from '@/features/member-chat/api/memberChatApi';
import type {
  MemberChatMessage,
  MemberChatRoomSummary,
} from '@/features/member-chat/model/types';
import { useChatSenderProfiles } from '@/features/member-chat/hooks/useChatSenderProfiles';
import { useChatRoomConnection } from '@/features/member-chat/hooks/useChatRoomConnection';
import { useChatRoomListLiveSync } from '@/features/member-chat/hooks/useChatRoomListLiveSync';
import { useChatReadAck } from '@/features/member-chat/hooks/useChatReadAck';
import { useChatHistoryInfinite } from '@/features/member-chat/hooks/useChatHistoryInfinite';
import { useOptimisticSends } from '@/features/member-chat/hooks/useOptimisticSends';
import { usePerMemberLastRead } from '@/features/member-chat/hooks/usePerMemberLastRead';
import { useDirectPartner } from '@/features/member-chat/hooks/useDirectPartner';
import { useTypingIndicator } from '@/features/member-chat/hooks/useTypingIndicator';
import { encodeAttachmentPayload } from '@/features/member-chat/lib/attachmentPayload';
import { CreateRoomFromOrgChartModal } from '@/features/member-chat/ui/CreateRoomFromOrgChartModal';
import { GroupParticipantsDrawer } from '@/features/member-chat/ui/GroupParticipantsDrawer';
import { ChatRoomList } from '@/features/member-chat/ui/room-list/ChatRoomList';
import { ChatThreadHeader } from '@/features/member-chat/ui/thread/ChatThreadHeader';
import { ChatThread } from '@/features/member-chat/ui/thread/ChatThread';
import { ChatComposer } from '@/features/member-chat/ui/composer/ChatComposer';
import {
  MEMBER_CHAT_OVERLAY_Z,
  sameMemberUuid,
} from '@/features/member-chat/ui/shared/chatIdentity';

/**
 * UX 정책:
 *  - 첫 오픈에서는 첫 방 자동 진입 허용
 *  - 한 번 닫은 뒤 재오픈부터는 자동 진입하지 않음 (사용자가 직접 방 선택)
 */
let shouldAutoEnterRoomOnMount = true;
/** StrictMode/dev 재실행에서 동일 상대 1:1 방 중복 생성 방지용 잠금 */
const directRoomCreateLocks = new Set<string>();

export type MemberChatPanelProps = {
  /** `floating`: 드래그 가능한 플로팅 패널 안에서 높이를 부모에 맞춤 */
  variant?: 'page' | 'floating';
  /** 플로팅 모드에서 설정 시 해당 멤버와 1:1 방 생성·진입 */
  initialDirectMemberId?: string | null;
  onInitialDirectConsumed?: () => void;
};

export function MemberChatPanel({
  variant = 'page',
  initialDirectMemberId = null,
  onInitialDirectConsumed,
}: MemberChatPanelProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const panelRootRef = useRef<HTMLDivElement | null>(null);
  const [activeRoom, setActiveRoom] = useState<MemberChatRoomSummary | null>(null);
  const [draft, setDraft] = useState('');
  const [createRoomOpen, setCreateRoomOpen] = useState(false);
  const [participantsOpen, setParticipantsOpen] = useState(false);
  const [participantsModalMode, setParticipantsModalMode] = useState<'participants' | 'invite'>(
    'participants',
  );
  const [editingMessageId, setEditingMessageId] = useState<number | null>(null);
  const [editingContent, setEditingContent] = useState('');
  const [uploading, setUploading] = useState(false);
  const [listQuery, setListQuery] = useState('');
  const [isCompactLayout, setIsCompactLayout] = useState<boolean>(false);
  const [showCompactRoomList, setShowCompactRoomList] = useState<boolean>(false);

  const isFloating = variant === 'floating';
  const splitHeight = isFloating ? 'tw-h-full tw-min-h-0 tw-flex-1' : 'tw-min-h-[640px]';
  const threadH = isFloating
    ? 'tw-min-h-0 tw-flex-1 tw-overflow-auto'
    : 'tw-h-[460px] tw-overflow-auto';

  // 방 목록
  const { data: rooms = [], isLoading: loadingRooms } = useQuery({
    queryKey: ['member-chat', 'rooms'],
    queryFn: () => memberChatApi.listMyRooms(),
  });

  const filteredRooms = useMemo(() => {
    const q = listQuery.trim().toLowerCase();
    if (!q) return rooms;
    return rooms.filter((r) => (r.title || '').toLowerCase().includes(q));
  }, [rooms, listQuery]);

  // 플로팅 모드: 외부에서 1:1 진입 intent 가 있으면 자동 생성/진입
  //
  // 주의: cancelled 플래그를 두지 않는다.
  //   - BE 의 createDirectRoom 은 idempotent (getOrCreateDirectRoom) 이라 중복 호출 안전.
  //   - StrictMode 의 effect 더블 invoke 에서 첫 호출의 .then() 이 cancelled=true 로 스킵되면
  //     "BE 에는 방이 생겼는데 FE 상태가 안 바뀌는" 버그가 발생한다 (조직도 → 메신저 진입 케이스).
  //   - setActiveRoom 이 unmount 후에 호출되더라도 React 가 무시할 뿐 상태 일관성에는 영향 없음.
  useEffect(() => {
    if (!isFloating) return;
    const raw = initialDirectMemberId?.trim();
    if (!raw) return;
    if (loadingRooms) return;
    const existingDirectRoom = rooms.find(
      (room) => room.roomType === 'DIRECT' && sameMemberUuid(room.otherMemberId, raw),
    );
    if (existingDirectRoom) {
      setActiveRoom(existingDirectRoom);
      // 컴팩트 모드(좁은 폭) 일 때 자동으로 채팅 화면을 펼쳐서 새 방이 즉시 보이게 함
      setShowCompactRoomList(false);
      onInitialDirectConsumed?.();
      return;
    }
    if (directRoomCreateLocks.has(raw)) return;
    directRoomCreateLocks.add(raw);
    void memberChatApi
      .createDirectRoom(raw)
      .then((room) => {
        setActiveRoom(room);
        setShowCompactRoomList(false);
        void queryClient.invalidateQueries({ queryKey: ['member-chat', 'rooms'] });
        onInitialDirectConsumed?.();
      })
      .catch(() => {
        message.error('1:1 채팅방을 열 수 없습니다.');
        onInitialDirectConsumed?.();
      })
      .finally(() => {
        directRoomCreateLocks.delete(raw);
      });
  }, [isFloating, initialDirectMemberId, loadingRooms, rooms, queryClient, onInitialDirectConsumed]);

  // 메시지 히스토리 (무한 스크롤)
  const {
    orderedMessages: serverOrderedMessages,
    isLoading: loadingMessages,
    isFetchingOlder,
    hasMoreOlder,
    fetchOlder,
  } = useChatHistoryInfinite(activeRoom?.roomId ?? null);

  // 컴팩트 레이아웃 감지
  useEffect(() => {
    const el = panelRootRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const COMPACT_PANEL_WIDTH = 780;
    const applyCompact = (width: number) => {
      const compact = width < COMPACT_PANEL_WIDTH;
      setIsCompactLayout(compact);
      setShowCompactRoomList((prev) => {
        // 데스크탑 폭으로 돌아가도 사용자의 마지막 포커스 상태를 보존한다.
        if (!compact) return prev;
        // 컴팩트 폭에서는 활성 방이 있으면 기본 포커스를 대화창에 둔다.
        if (activeRoom?.roomId) return false;
        // 활성 방이 없을 때만 목록 화면을 기본으로 보여준다.
        return true;
      });
    };
    applyCompact(el.clientWidth);
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      applyCompact(entry.contentRect.width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [activeRoom?.roomId]);

  // 첫 방 자동 진입 (1회) + 방 목록 동기화
  useEffect(() => {
    if (rooms.length === 0) {
      setActiveRoom(null);
      return;
    }
    setActiveRoom((prev) => {
      if (prev && rooms.some((r) => r.roomId === prev.roomId)) return prev;
      if (!shouldAutoEnterRoomOnMount) return null;
      return rooms[0] ?? null;
    });
  }, [rooms]);

  useEffect(() => {
    return () => {
      shouldAutoEnterRoomOnMount = false;
    };
  }, []);

  // 옵티미스틱 전송 — pending/failed 메시지를 로컬 보관
  const {
    optimistic: optimisticMessages,
    send: sendOptimistic,
    retry: retryOptimistic,
    drop: dropOptimistic,
  } = useOptimisticSends({
    roomId: activeRoom?.roomId ?? null,
    selfMemberId: user?.id,
    serverMessages: serverOrderedMessages,
  });

  // 서버 + optimistic 합쳐 시간순 정렬
  const orderedMessages = useMemo(() => {
    if (optimisticMessages.length === 0) return serverOrderedMessages;
    // optimistic 의 messageId 는 항상 큰 값이라 자연스럽게 끝쪽으로 정렬됨
    return [...serverOrderedMessages, ...optimisticMessages].sort(
      (a, b) => a.messageId - b.messageId,
    );
  }, [serverOrderedMessages, optimisticMessages]);

  // 발신자 프로필
  const { getRow } = useChatSenderProfiles(orderedMessages, user);

  const showListEmptyOnboarding = !loadingRooms && rooms.length === 0;
  const hasActiveChat = Boolean(activeRoom);
  const hideRoomList = isCompactLayout && !showCompactRoomList;
  const hideActiveChatPane = isCompactLayout && showCompactRoomList;

  /**
   * 방 진입 시점의 myLastReadMessageId 를 캡처. 같은 방 내에서는 이 앵커 위에 한 번만
   * "새 메시지" separator 가 그려지고, 자동 ack 가 진행되어도 같은 위치에 머문다.
   * 방을 바꾸면 새 앵커로 갱신.
   */
  const [lastReadAnchor, setLastReadAnchor] = useState<number | null>(null);
  const lastAnchorRoomIdRef = useRef<number | null>(null);
  useEffect(() => {
    const rid = activeRoom?.roomId ?? null;
    if (lastAnchorRoomIdRef.current === rid) return;
    lastAnchorRoomIdRef.current = rid;
    setLastReadAnchor(activeRoom?.myLastReadMessageId ?? null);
  }, [activeRoom?.roomId, activeRoom?.myLastReadMessageId]);
  /**
   * 대화창이 사용자에게 실제로 보이는 상태인지.
   * 컴팩트 모드에서 채팅방 목록이 펼쳐져 있으면 false → 자동 ack 비활성화.
   */
  const isThreadVisible = hasActiveChat && !hideActiveChatPane;

  // 읽음/스크롤 ack
  const {
    threadRef,
    userScrolledUpRef,
    userScrolledUp,
    onThreadScroll,
    scrollThreadToBottom,
    ackLatestIfViewing,
    suspendViewingAck,
  } = useChatReadAck({
    roomId: activeRoom?.roomId ?? null,
    orderedMessages,
    myLastReadMessageId: activeRoom?.myLastReadMessageId,
    viewing: isThreadVisible,
  });

  // 새 메시지 다운 버튼 — 위로 스크롤한 상태에서 도착한 미본 메시지 수 추적
  const [unseenCount, setUnseenCount] = useState(0);
  const lastTotalRef = useRef(0);
  useEffect(() => {
    const total = orderedMessages.length;
    if (!userScrolledUp) {
      // 하단 도달 → 카운터 리셋
      setUnseenCount(0);
      lastTotalRef.current = total;
      return;
    }
    if (total > lastTotalRef.current) {
      setUnseenCount((c) => c + (total - lastTotalRef.current));
    }
    lastTotalRef.current = total;
  }, [orderedMessages, userScrolledUp]);
  // 방 전환 시 카운터 리셋
  useEffect(() => {
    setUnseenCount(0);
    lastTotalRef.current = 0;
  }, [activeRoom?.roomId]);

  // 답장 대상 (입력창 위 미리보기 표시 + 전송 시 replyToId)
  const [replyTo, setReplyTo] = useState<MemberChatMessage | null>(null);
  // 방 전환 시 답장 상태 리셋
  useEffect(() => {
    setReplyTo(null);
  }, [activeRoom?.roomId]);

  // 멤버별 lastRead + 메시지별 미읽음수
  const { unreadByMessageId, onReadEvent } = usePerMemberLastRead({
    activeRoom,
    orderedMessages,
    selfMemberId: user?.id,
  });

  // STOMP 메시지/READ/에러 구독 (활성 방 한정)
  useChatRoomConnection({
    roomId: activeRoom?.roomId ?? null,
    onReadEvent,
  });

  // 모든 방 메시지 토픽에 가벼운 구독 — 비활성 방의 unread 도 실시간 반영.
  const allRoomIds = useMemo(() => rooms.map((r) => r.roomId), [rooms]);
  useChatRoomListLiveSync(allRoomIds);

  // 1:1 상대 정보
  const directPartner = useDirectPartner({
    activeRoom,
    orderedMessages,
    selfMemberId: user?.id,
    getRow,
  });

  // 타이핑 인디케이터
  const { typingMemberIds, notifyTyping } = useTypingIndicator({
    roomId: activeRoom?.roomId ?? null,
    selfMemberId: user?.id,
  });

  // 메시지 변동 시 자동 스크롤 + 자동 ack
  useEffect(() => {
    scrollThreadToBottom(false);
  }, [orderedMessages, loadingMessages, scrollThreadToBottom]);

  useEffect(() => {
    if (loadingMessages || !activeRoom?.roomId) return;
    if (orderedMessages.length === 0) return;
    if (userScrolledUpRef.current) return;
    if (!isThreadVisible) return; // 접힌 상태(방 목록 화면) 에서는 자동 ack 금지
    ackLatestIfViewing();
  }, [activeRoom?.roomId, orderedMessages, loadingMessages, ackLatestIfViewing, userScrolledUpRef, isThreadVisible]);

  // 텍스트 전송은 Optimistic — 임시 메시지를 즉시 화면에 표시 후 서버 응답으로 교체.
  const editMutation = useMutation({
    mutationFn: async (payload: { messageId: number; content: string }) => {
      await memberChatApi.editMessage(payload.messageId.toString(), { content: payload.content });
    },
    onSuccess: async () => {
      setEditingMessageId(null);
      setEditingContent('');
      await queryClient.invalidateQueries({ queryKey: ['member-chat', 'history', activeRoom?.roomId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (messageId: number) => {
      await memberChatApi.deleteMessage(messageId.toString());
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['member-chat', 'history', activeRoom?.roomId] });
    },
  });

  const leaveRoomMutation = useMutation({
    mutationFn: async (payload: {
      roomId: number;
      roomType: MemberChatRoomSummary['roomType'];
      participantCount?: number;
      title: string;
    }) => {
      await memberChatApi.leaveRoom(payload.roomId);
      return payload;
    },
    onMutate: async (payload) => {
      const { roomId } = payload;
      await queryClient.cancelQueries({ queryKey: ['member-chat', 'rooms'] });
      const prevRooms = queryClient.getQueryData<MemberChatRoomSummary[]>(['member-chat', 'rooms']) ?? [];
      const nextRooms = prevRooms.filter((r) => r.roomId !== roomId);
      queryClient.setQueryData(['member-chat', 'rooms'], nextRooms);

      const leavingCurrent = activeRoom?.roomId === roomId;
      if (leavingCurrent) {
        // 현재 방을 나갈 때는 로컬 상태를 즉시 정리해 UX 지연을 줄인다.
        setReplyTo(null);
        setEditingMessageId(null);
        setEditingContent('');
        setDraft('');
        setParticipantsOpen(false);
        setParticipantsModalMode('participants');

        const fallback = nextRooms[0] ?? null;
        setActiveRoom(fallback);
        if (isCompactLayout && !fallback) setShowCompactRoomList(true);
      }

      return { prevRooms, leavingCurrent, payload };
    },
    onError: (e: Error, payload, ctx) => {
      const roomId = payload.roomId;
      if (ctx?.prevRooms) {
        queryClient.setQueryData(['member-chat', 'rooms'], ctx.prevRooms);
      }
      if (ctx?.leavingCurrent) {
        const restore = (ctx.prevRooms ?? []).find((r) => r.roomId === roomId) ?? null;
        setActiveRoom(restore);
      }
      void message.error(e.message || '채팅방 나가기에 실패했습니다.');
    },
    onSuccess: async (payload, _vars, ctx) => {
      if (ctx?.leavingCurrent) {
        // 나간 방 히스토리는 즉시 정리해 stale 데이터 재표시를 방지
        queryClient.removeQueries({ queryKey: ['member-chat', 'history', payload.roomId], exact: false });
      }
      const isDirect = payload.roomType === 'DIRECT';
      const wasLastParticipant = !isDirect && (payload.participantCount ?? 0) <= 1;
      if (isDirect) {
        void message.success('대화를 숨겼습니다. 다시 메시지를 보내면 목록에 다시 나타납니다.');
        return;
      }
      if (wasLastParticipant) {
        void message.success(
          `"${payload.title}"에서 나갔습니다. 마지막 참여자라 채팅방이 자동 정리됩니다.`,
        );
        return;
      }
      void message.success(`"${payload.title}"에서 나갔습니다.`);
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ['member-chat', 'rooms'] });
    },
  });

  const onRequestDelete = useCallback(
    (messageId: number) => {
      Modal.confirm({
        zIndex: MEMBER_CHAT_OVERLAY_Z,
        title: '이 메시지를 삭제할까요?',
        content: '상대방 화면에서도 삭제된 메시지로 표시됩니다.',
        okText: '삭제',
        okType: 'danger',
        cancelText: '취소',
        onOk: () => deleteMutation.mutateAsync(messageId),
      });
    },
    [deleteMutation],
  );

  // 파일 업로드
  const uploadBefore = async (file: File) => {
    if (!activeRoom?.roomId) return Upload.LIST_IGNORE;
    setUploading(true);
    try {
      const uploaded = await memberChatApi.uploadFile(file);
      const encoded = encodeAttachmentPayload({
        key: uploaded.key,
        name: uploaded.fileName ?? file.name,
        mime: uploaded.mimeType,
        size: uploaded.sizeBytes,
      });
      await memberChatApi.sendRoomMessage(activeRoom.roomId, {
        type: uploaded.mimeType.startsWith('image/') ? 'IMAGE' : 'FILE',
        content: encoded,
        clientMessageId: crypto.randomUUID(),
      });
      await queryClient.refetchQueries({ queryKey: ['member-chat', 'history', activeRoom.roomId] });
      void message.success('파일을 전송했습니다.');
    } catch (e) {
      void message.error((e as Error).message || '파일 업로드에 실패했습니다.');
    } finally {
      setUploading(false);
    }
    return Upload.LIST_IGNORE;
  };

  const handleSend = useCallback(() => {
    const text = draft;
    if (!text.trim()) return;
    const replyToId = replyTo?.messageId;
    setDraft('');
    setReplyTo(null);
    void sendOptimistic(text, replyToId);
  }, [draft, replyTo, sendOptimistic]);

  const handleDraftChange = useCallback(
    (next: string) => {
      setDraft(next);
      if (next.trim()) notifyTyping();
    },
    [notifyTyping],
  );

  const handleStartEdit = useCallback((id: number, currentContent: string) => {
    setEditingMessageId(id);
    setEditingContent(currentContent);
  }, []);

  const handleCancelEdit = useCallback(() => {
    setEditingMessageId(null);
    setEditingContent('');
  }, []);

  const handleSubmitEdit = useCallback(
    async (id: number) => {
      const content = editingContent.trim();
      if (!content) return;
      await editMutation.mutateAsync({ messageId: id, content });
    },
    [editingContent, editMutation],
  );

  return (
    <div
      ref={panelRootRef}
      className={`tw-flex tw-w-full tw-min-h-0 tw-flex-col tw-overflow-hidden lg:tw-flex-row ${splitHeight} ${
        isFloating
          ? 'tw-flex-1 tw-rounded-none tw-border-0 tw-bg-transparent tw-shadow-none'
          : 'tw-rounded-xl tw-border tw-border-solid tw-border-slate-200 tw-bg-white tw-shadow-sm'
      }`}
    >
      {/* 좌측: 채팅방 목록 */}
      <div
        className={
          isCompactLayout
            ? `${hideRoomList ? 'tw-hidden' : 'tw-flex'} tw-min-h-0 tw-w-full tw-shrink-0 tw-flex-col tw-bg-slate-50`
            : `tw-flex ${
                isFloating
                  ? 'tw-min-h-0 tw-w-full tw-max-h-[min(42%,280px)] tw-flex-1 tw-shrink-0 tw-flex-col tw-rounded-none tw-border-slate-200 tw-bg-slate-50 lg:tw-max-h-none lg:tw-h-full lg:tw-w-[min(100%,360px)] lg:tw-max-w-[40%] lg:tw-border-r'
                  : 'tw-h-[min(40vh,320px)] tw-w-full tw-shrink-0 tw-flex-col tw-border-slate-200 tw-bg-slate-50 lg:tw-h-auto lg:tw-w-[min(100%,360px)] lg:tw-max-w-[40%] lg:tw-border-r'
              }`
        }
      >
        <ChatRoomList
          rooms={rooms}
          filteredRooms={filteredRooms}
          loading={loadingRooms}
          showEmptyOnboarding={showListEmptyOnboarding}
          query={listQuery}
          onQueryChange={setListQuery}
          activeRoomId={activeRoom?.roomId ?? null}
          onSelectRoom={(room) => {
            setActiveRoom(room);
            if (isCompactLayout) setShowCompactRoomList(false);
          }}
          onNewRoom={() => setCreateRoomOpen(true)}
        />
      </div>

      {/* 우측: 활성 대화 */}
      <div
        className={`${
          hideActiveChatPane ? 'tw-hidden' : 'tw-flex'
        } tw-min-h-0 tw-min-w-0 tw-flex-1 tw-flex-col tw-bg-slate-50/40 tw-transition-all tw-duration-250`}
      >
        {hasActiveChat && activeRoom ? (
          <>
            <ChatThreadHeader
              activeRoom={activeRoom}
              directPartner={directPartner}
              isCompactLayout={isCompactLayout}
              onOpenParticipants={() => {
                setParticipantsModalMode('participants');
                setParticipantsOpen(true);
              }}
              onOpenInvite={() => {
                setParticipantsModalMode('invite');
                setParticipantsOpen(true);
              }}
              onShowRoomList={() => {
                suspendViewingAck();
                setActiveRoom(null);
                setShowCompactRoomList(true);
              }}
              leaving={leaveRoomMutation.isPending}
              onLeaveRoom={() => {
                const roomId = activeRoom.roomId;
                const title = activeRoom.title?.trim() || '현재 채팅방';
                const isDirect = activeRoom.roomType === 'DIRECT';
                const participantCount = activeRoom.participantCount;
                const isLastInGroup = !isDirect && (participantCount ?? 0) <= 1;
                Modal.confirm({
                  zIndex: MEMBER_CHAT_OVERLAY_Z,
                  title: '채팅방에서 나갈까요?',
                  content: isLastInGroup
                    ? `"${title}"에서 나가면 내 목록에서 사라지며, 마지막 참여자라 채팅방이 자동 정리됩니다.`
                    : `나가면 "${title}" 대화가 내 목록에서 사라집니다.`,
                  okText: '나가기',
                  okType: 'danger',
                  cancelText: '취소',
                  onOk: () =>
                    leaveRoomMutation.mutateAsync({
                      roomId,
                      roomType: activeRoom.roomType,
                      participantCount,
                      title,
                    }),
                });
              }}
            />
            <div className="tw-flex tw-min-h-0 tw-flex-1 tw-flex-col tw-gap-3 tw-p-3">
              <ChatThread
                threadRef={threadRef}
                onScroll={onThreadScroll}
                loadingMessages={loadingMessages}
                orderedMessages={orderedMessages}
                selfMemberId={user?.id}
                unreadByMessageId={unreadByMessageId}
                getRow={getRow}
                editingMessageId={editingMessageId}
                editingContent={editingContent}
                onEditingContentChange={setEditingContent}
                onStartEdit={handleStartEdit}
                onCancelEdit={handleCancelEdit}
                onSubmitEdit={handleSubmitEdit}
                editingLoading={editMutation.isPending}
                onRequestDelete={onRequestDelete}
                typingMemberIds={typingMemberIds}
                threadHeightClass={threadH}
                hasMoreOlder={hasMoreOlder}
                isFetchingOlder={isFetchingOlder}
                onReachTop={() => {
                  // 위치 보존: 현재 scrollHeight 캡처 후 다음 렌더에서 보정
                  const el = threadRef.current;
                  const before = el ? el.scrollHeight : 0;
                  fetchOlder();
                  // 다음 페인트 직후, 늘어난 만큼 scrollTop 을 더해 같은 메시지가 같은 자리에 보이도록.
                  requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                      const cur = threadRef.current;
                      if (!cur) return;
                      const delta = cur.scrollHeight - before;
                      if (delta > 0) cur.scrollTop = cur.scrollTop + delta;
                    });
                  });
                }}
                lastReadAnchor={lastReadAnchor}
                getOptimistic={(msg) => {
                  const opt = optimisticMessages.find((o) => o.messageId === msg.messageId);
                  if (!opt || !opt.clientMessageId) return null;
                  const cmid = opt.clientMessageId;
                  return {
                    status: opt.optimistic.status,
                    onRetry: () => void retryOptimistic(cmid),
                    onDrop: () => dropOptimistic(cmid),
                  };
                }}
                newMessagesCount={unseenCount}
                showNewMessagesButton={userScrolledUp}
                onScrollDownToNew={() => {
                  scrollThreadToBottom(true, 'smooth');
                  setUnseenCount(0);
                }}
                onReply={(msg) => setReplyTo(msg)}
                onJumpToMessage={(messageId) => {
                  const root = threadRef.current;
                  if (!root) return;
                  const el = root.querySelector(
                    `[data-message-id="${messageId}"]`,
                  ) as HTMLElement | null;
                  if (!el) return;
                  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  el.classList.add('mc-jump-flash');
                  window.setTimeout(() => el.classList.remove('mc-jump-flash'), 1500);
                }}
              />
              <ChatComposer
                draft={draft}
                onDraftChange={handleDraftChange}
                onSend={handleSend}
                onAttach={(file) => uploadBefore(file)}
                disabled={!activeRoom}
                uploading={uploading}
                sending={false}
                isFloating={isFloating}
                replyTo={replyTo}
                replyToSenderName={replyTo ? getRow(replyTo).name : undefined}
                onCancelReply={() => setReplyTo(null)}
              />
            </div>
          </>
        ) : (
          <div className="tw-flex tw-min-h-[200px] tw-flex-1 tw-flex-col tw-items-center tw-justify-center tw-bg-slate-100/50 tw-px-6 tw-py-12">
            <Typography.Text type="secondary" className="tw-text-center tw-text-sm">
              {loadingRooms ? '불러오는 중…' : '왼쪽에서 채팅방을 선택해 주세요.'}
            </Typography.Text>
          </div>
        )}
      </div>

      <CreateRoomFromOrgChartModal
        open={createRoomOpen}
        selfMemberId={user?.id}
        onClose={() => setCreateRoomOpen(false)}
        onCreated={(room) => {
          setActiveRoom(room);
        }}
      />
      <GroupParticipantsDrawer
        open={participantsOpen}
        onClose={() => {
          setParticipantsOpen(false);
          setParticipantsModalMode('participants');
        }}
        roomId={activeRoom?.roomId ?? null}
        roomTitle={activeRoom?.title}
        meId={user?.id}
        roomType={activeRoom?.roomType}
        mode={participantsModalMode}
      />
    </div>
  );
}
