import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Avatar, Button, Input, List, Modal, Space, Tag, Typography, Upload, message } from 'antd';
import { FileImageOutlined, FileOutlined, SearchOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/features/auth/useAuth';
import { memberChatApi } from '@/features/member-chat/api/memberChatApi';
import { memberChatStompClient } from '@/features/member-chat/lib/memberChatStompClient';
import type {
  MemberChatMessage,
  MemberChatReadEvent,
  MemberChatRoomSummary,
} from '@/features/member-chat/model/types';
import { chatSenderInitial, useChatSenderProfiles } from '@/features/member-chat/hooks/useChatSenderProfiles';
import { CreateRoomFromOrgChartModal } from '@/features/member-chat/ui/CreateRoomFromOrgChartModal';
import { AppButton } from '@/shared/ui/AppButton';

function isImageMessage(item: MemberChatMessage) {
  return item.type === 'IMAGE';
}

function isFileMessage(item: MemberChatMessage) {
  return item.type === 'FILE';
}

function formatChatTime(iso?: string) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' });
  } catch {
    return '';
  }
}

/** 같은 로컬 날짜인지 비교용 */
function startOfDayKey(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDateSeparatorLabel(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  });
}

function tryHttpUrl(s: string): string | null {
  try {
    const u = new URL(s);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.href;
  } catch {
    return null;
  }
}

/** 매칭된 토큰 끝의 구두점을 잘라 http(s) URL 로 인정되는 최대 길이를 찾는다. */
function parseUrlFromToken(raw: string): { href: string; label: string } | null {
  let s = raw;
  while (s.length >= 'https://x'.length) {
    const href = tryHttpUrl(s);
    if (href) return { href, label: s };
    const last = s[s.length - 1];
    if (!last || !'.,;:!?)]}'.includes(last)) break;
    s = s.slice(0, -1);
  }
  return null;
}

const URL_IN_TEXT_RE = /https?:\/\/[^\s<]+/gi;

function ChatLinkifiedText({ text, className }: { text: string; className?: string }) {
  const nodes: ReactNode[] = [];
  let last = 0;
  let key = 0;
  const s = text;
  for (const m of s.matchAll(URL_IN_TEXT_RE)) {
    const start = m.index ?? 0;
    if (start > last) {
      nodes.push(
        <span key={`t-${key++}`} className="tw-whitespace-pre-wrap">
          {s.slice(last, start)}
        </span>,
      );
    }
    const raw = m[0];
    const parsed = parseUrlFromToken(raw);
    if (parsed) {
      nodes.push(
        <a
          key={`a-${key++}`}
          href={parsed.href}
          target="_blank"
          rel="noopener noreferrer"
          className="tw-break-all tw-text-blue-600 tw-underline tw-underline-offset-2 hover:tw-text-blue-700"
        >
          {parsed.label}
        </a>,
      );
    } else {
      nodes.push(
        <span key={`t-${key++}`} className="tw-whitespace-pre-wrap">
          {raw}
        </span>,
      );
    }
    last = start + raw.length;
  }
  if (last < s.length) {
    nodes.push(
      <span key={`t-${key++}`} className="tw-whitespace-pre-wrap">
        {s.slice(last)}
      </span>,
    );
  }
  return <p className={className}>{nodes}</p>;
}

/** JWT·API 혼용 시 UUID 문자열 형식이 달라질 수 있어 비교 시 정규화 */
function sameMemberUuid(a?: string | null, b?: string | null): boolean {
  const x = a?.trim();
  const y = b?.trim();
  if (!x || !y) return false;
  return x.replace(/-/g, '').toLowerCase() === y.replace(/-/g, '').toLowerCase();
}

/** 플로팅 채팅 패널(z≈1060) 위에 확인 모달이 오도록 */
const MEMBER_CHAT_OVERLAY_Z = 10_080;

export type MemberChatPanelProps = {
  /** `floating`: 드래그 가능한 플로팅 패널 안에서 높이를 부모에 맞춤 */
  variant?: 'page' | 'floating';
};

export function MemberChatPanel({ variant = 'page' }: MemberChatPanelProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [activeRoom, setActiveRoom] = useState<MemberChatRoomSummary | null>(null);
  const [draft, setDraft] = useState('');
  const [createRoomOpen, setCreateRoomOpen] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState<number | null>(null);
  const [editingContent, setEditingContent] = useState('');
  const [readEvents, setReadEvents] = useState<Record<string, MemberChatReadEvent>>({});
  const [uploading, setUploading] = useState(false);
  const [listQuery, setListQuery] = useState('');
  const threadRef = useRef<HTMLDivElement | null>(null);
  const userScrolledUpRef = useRef(false);
  const lastRoomIdForScrollRef = useRef<number | null>(null);

  const scrollThreadToBottom = useCallback((force: boolean) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const el = threadRef.current;
        if (!el) return;
        if (!force && userScrolledUpRef.current) return;
        el.scrollTop = el.scrollHeight;
      });
    });
  }, []);

  const onThreadScroll = useCallback(() => {
    const el = threadRef.current;
    if (!el) return;
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
    userScrolledUpRef.current = dist > 96;
  }, []);

  const isFloating = variant === 'floating';
  const splitHeight = isFloating ? 'tw-h-full tw-min-h-0 tw-flex-1' : 'tw-min-h-[640px]';
  const threadH = isFloating ? 'tw-min-h-0 tw-flex-1 tw-overflow-auto' : 'tw-h-[460px] tw-overflow-auto';

  const { data: rooms = [], isLoading: loadingRooms } = useQuery({
    queryKey: ['member-chat', 'rooms'],
    queryFn: () => memberChatApi.listMyRooms(),
  });

  const filteredRooms = useMemo(() => {
    const q = listQuery.trim().toLowerCase();
    if (!q) return rooms;
    return rooms.filter((r) => (r.title || '').toLowerCase().includes(q));
  }, [rooms, listQuery]);

  const { data: history, isLoading: loadingMessages } = useQuery({
    queryKey: ['member-chat', 'history', activeRoom?.roomId],
    queryFn: () => memberChatApi.getRoomHistory(activeRoom!.roomId),
    enabled: Boolean(activeRoom?.roomId),
  });

  useEffect(() => {
    if (rooms.length === 0) {
      setActiveRoom(null);
      return;
    }
    setActiveRoom((prev) => {
      if (prev && rooms.some((r) => r.roomId === prev.roomId)) return prev;
      return rooms[0] ?? null;
    });
  }, [rooms]);

  useEffect(() => {
    if (!activeRoom?.roomId) return;
    let unsubMessage: () => void = () => {};
    let unsubRead: () => void = () => {};
    let unsubError: () => void = () => {};
    let mounted = true;

    const connect = async () => {
      try {
        await memberChatStompClient.connect();
        if (!mounted) return;
        /** 서버가 방 구독 거부 시 /user/queue/errors 로 통지 — 먼저 에러 큐를 구독해야 알림을 받는다. */
        unsubError = memberChatStompClient.subscribeErrors((raw) => {
          const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null;
          const detail = (o?.message as string) ?? (o?.code as string) ?? JSON.stringify(raw);
          void message.error(`채팅: ${detail}`);
        });
        unsubMessage = memberChatStompClient.subscribeRoomMessages<MemberChatMessage>(
          activeRoom.roomId,
          (payload) => {
            void queryClient.invalidateQueries({ queryKey: ['member-chat', 'history', activeRoom.roomId] });
            const mid = payload?.messageId;
            if (typeof mid === 'number' && mid > 0) {
              void memberChatStompClient.sendReadAck(activeRoom.roomId, { messageId: mid });
            }
          },
        );
        unsubRead = memberChatStompClient.subscribeReadEvents(activeRoom.roomId, (payload) => {
          setReadEvents((prev) => ({ ...prev, [payload.memberId]: payload }));
        });
      } catch (e) {
        void message.error((e as Error).message || '채팅 연결에 실패했습니다.');
      }
    };

    void connect();

    return () => {
      mounted = false;
      unsubMessage();
      unsubRead();
      unsubError();
    };
  }, [activeRoom?.roomId, queryClient]);

  const sendMutation = useMutation({
    mutationFn: async () => {
      if (!activeRoom?.roomId) throw new Error('채팅방을 선택해 주세요.');
      const text = draft.trim();
      if (!text) throw new Error('메시지를 입력해 주세요.');
      const roomId = activeRoom.roomId;
      /** STOMP 대신 REST — 동일 saveAndPublish 경로로 저장되어 히스토리에 반드시 남는다. */
      await memberChatApi.sendRoomMessage(roomId, {
        type: 'NORMAL',
        content: text,
        clientMessageId: crypto.randomUUID(),
      });
      return roomId;
    },
    onSuccess: async (roomId) => {
      setDraft('');
      await queryClient.refetchQueries({ queryKey: ['member-chat', 'history', roomId] });
    },
    onError: (e: Error) => {
      void message.error(e.message || '메시지 전송에 실패했습니다.');
    },
  });

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

  const downloadMutation = useMutation({
    mutationFn: async (key: string) => memberChatApi.issuePresignedDownload(key),
    onSuccess: (res) => {
      if (res.downloadUrl) {
        window.open(res.downloadUrl, '_blank', 'noopener,noreferrer');
      } else {
        void message.warning('다운로드 URL을 가져오지 못했습니다.');
      }
    },
  });

  const orderedMessages = useMemo(() => {
    const items = history?.items ?? [];
    return [...items].sort((a, b) => a.messageId - b.messageId);
  }, [history?.items]);

  const { getRow } = useChatSenderProfiles(orderedMessages, user);

  const latestReadMap = useMemo(() => {
    const byMessageId: Record<number, string[]> = {};
    for (const value of Object.values(readEvents)) {
      const mid = value?.messageId;
      if (mid == null) continue;
      if (!byMessageId[mid]) byMessageId[mid] = [];
      byMessageId[mid].push(value.memberId);
    }
    return byMessageId;
  }, [readEvents]);

  const handleReadAckLatest = () => {
    if (!activeRoom || orderedMessages.length === 0) return;
    const last = orderedMessages[orderedMessages.length - 1]!;
    void memberChatStompClient.sendReadAck(activeRoom.roomId, { messageId: last.messageId, deviceId: 'web' });
    void memberChatApi.ackRead(activeRoom.roomId, { messageId: last.messageId, deviceId: 'web' });
  };

  useEffect(() => {
    const rid = activeRoom?.roomId ?? null;
    const changed = lastRoomIdForScrollRef.current !== rid;
    lastRoomIdForScrollRef.current = rid;
    if (changed) {
      userScrolledUpRef.current = false;
      scrollThreadToBottom(true);
    }
  }, [activeRoom?.roomId, scrollThreadToBottom]);

  useEffect(() => {
    scrollThreadToBottom(false);
  }, [orderedMessages, loadingMessages, scrollThreadToBottom]);

  const uploadBefore = async (file: File) => {
    if (!activeRoom?.roomId) return Upload.LIST_IGNORE;
    setUploading(true);
    try {
      const mime = file.type || 'application/octet-stream';
      const presigned = await memberChatApi.issuePresignedUpload({
        filename: file.name,
        mime,
        size: file.size,
      });
      const put = await fetch(presigned.url, {
        method: 'PUT',
        headers: { 'Content-Type': mime },
        body: file,
      });
      if (!put.ok) {
        throw new Error('파일 업로드(S3 PUT)에 실패했습니다.');
      }
      await memberChatApi.confirmUpload(presigned.key);
      /** 텍스트와 동일하게 REST — 저장·Redis·STOMP fan-out 경로 통일, WS 미연결 시에도 전송 가능 */
      await memberChatApi.sendRoomMessage(activeRoom.roomId, {
        type: mime.startsWith('image/') ? 'IMAGE' : 'FILE',
        content: presigned.key,
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

  const showListEmptyOnboarding = !loadingRooms && rooms.length === 0;
  const hasActiveChat = Boolean(activeRoom);

  return (
    <div
      className={`tw-flex tw-w-full tw-min-h-0 tw-flex-col tw-overflow-hidden lg:tw-flex-row ${splitHeight} ${
        isFloating
          ? 'tw-flex-1 tw-rounded-none tw-border-0 tw-bg-transparent tw-shadow-none'
          : 'tw-rounded-xl tw-border tw-border-solid tw-border-slate-200 tw-bg-white tw-shadow-sm'
      }`}
    >
      {/* 좌측: 채팅방 목록 (텔레그램형 사이드바) */}
      <div
        className={
          isFloating
            ? 'tw-flex tw-min-h-0 tw-w-full tw-max-h-[min(42%,280px)] tw-flex-1 tw-shrink-0 tw-flex-col tw-rounded-none tw-border-slate-200 tw-bg-slate-50/80 lg:tw-max-h-none lg:tw-h-full lg:tw-w-[min(100%,360px)] lg:tw-max-w-[40%] lg:tw-border-r'
            : 'tw-flex tw-h-[min(40vh,320px)] tw-w-full tw-shrink-0 tw-flex-col tw-border-slate-200 tw-bg-slate-50/80 lg:tw-h-auto lg:tw-w-[min(100%,360px)] lg:tw-max-w-[40%] lg:tw-border-r'
        }
      >
        <div className="tw-flex tw-shrink-0 tw-items-center tw-justify-between tw-gap-2 tw-border-b tw-border-slate-200 tw-px-3 tw-py-2.5">
          <Typography.Text strong className="tw-text-slate-800">
            채팅
          </Typography.Text>
          <AppButton
            type="primary"
            size="small"
            onClick={() => setCreateRoomOpen(true)}
          >
            새 대화
          </AppButton>
        </div>
        <div className="tw-shrink-0 tw-px-3 tw-pt-2">
          <Input
            allowClear
            value={listQuery}
            onChange={(e) => setListQuery(e.target.value)}
            placeholder="채팅방 검색"
            prefix={<SearchOutlined className="tw-text-slate-400" />}
            className="tw-rounded-lg"
          />
        </div>
        <div className="tw-flex tw-min-h-0 tw-flex-1 tw-flex-col tw-overflow-hidden tw-px-1 tw-pb-2">
          {showListEmptyOnboarding ? (
            <div className="tw-flex tw-min-h-[200px] tw-flex-1 tw-flex-col tw-items-center tw-justify-center tw-gap-4 tw-px-4 tw-py-6">
              <Typography.Text className="tw-text-center tw-text-sm tw-leading-relaxed tw-text-slate-600">
                동료들과 첫 대화를 나눠보세요!
              </Typography.Text>
            </div>
          ) : (
            <List
              className="member-chat-room-list tw-mt-2 tw-min-h-0 tw-flex-1 tw-overflow-y-auto tw-px-1 [&_.ant-list-items]:tw-divide-y [&_.ant-list-items]:tw-divide-slate-100"
              loading={loadingRooms}
              dataSource={filteredRooms}
              locale={{ emptyText: '검색 결과가 없습니다.' }}
              renderItem={(room) => {
                const selected = activeRoom?.roomId === room.roomId;
                const initial = (room.title || '?').slice(0, 1);
                return (
                  <List.Item
                    className={`!tw-cursor-pointer !tw-rounded-lg !tw-border-0 !tw-px-2 !tw-py-2.5 tw-transition-colors ${
                      selected ? '!tw-bg-[#2563EB] [&_.ant-list-item-meta-title]:!tw-text-white [&_.ant-list-item-meta-description]:!tw-text-white/85' : 'hover:!tw-bg-slate-100'
                    }`}
                    onClick={() => setActiveRoom(room)}
                  >
                    <List.Item.Meta
                      avatar={
                        <Avatar
                          className={
                            selected ? '!tw-bg-white/20 !tw-text-white' : '!tw-bg-slate-200 !tw-text-slate-700'
                          }
                          size={40}
                        >
                          {initial}
                        </Avatar>
                      }
                      title={
                        <span className="tw-line-clamp-1 tw-text-sm tw-font-semibold">
                          {room.title || '제목 없음'}
                        </span>
                      }
                      description={
                        <span className="tw-inline-flex tw-items-center tw-gap-1.5 tw-text-xs">
                          <span>{room.roomType === 'GROUP' ? '그룹' : '1:1'}</span>
                          <span>·</span>
                          <span>{`참여 ${room.participantCount ?? 0}명`}</span>
                          {room.unreadCount && room.unreadCount > 0 ? (
                            <Tag color={selected ? 'blue' : 'blue'} className="!tw-m-0 !tw-ml-1">
                              {room.unreadCount}
                            </Tag>
                          ) : null}
                        </span>
                      }
                    />
                  </List.Item>
                );
              }}
            />
          )}
        </div>
      </div>

      {/* 우측: 활성 대화 */}
      <div className="tw-flex tw-min-h-0 tw-min-w-0 tw-flex-1 tw-flex-col tw-bg-slate-50/40">
        {hasActiveChat ? (
          <>
            <div className="tw-shrink-0 tw-border-b tw-border-slate-200 tw-bg-white tw-px-4 tw-py-3">
              <Typography.Text strong className="tw-text-base tw-text-slate-900">
                {activeRoom!.title || '채팅'}
              </Typography.Text>
              <div className="tw-mt-0.5 tw-text-xs tw-text-slate-500">
                {activeRoom!.roomType === 'GROUP' ? '그룹 채팅' : '1:1 채팅'}
                {typeof activeRoom!.participantCount === 'number'
                  ? ` · 참여 ${activeRoom!.participantCount}명`
                  : null}
              </div>
            </div>
            <div className="tw-flex tw-min-h-0 tw-flex-1 tw-flex-col tw-gap-3 tw-p-3">
              <div
                ref={threadRef}
                onScroll={onThreadScroll}
                className={`tw-rounded-lg tw-border tw-border-slate-200 tw-bg-slate-50 tw-p-3 ${threadH}`}
              >
                <List
                  className="[&_.ant-list-item]:!tw-overflow-visible"
                  loading={loadingMessages}
                  rowKey="messageId"
                  dataSource={orderedMessages}
                  locale={{ emptyText: '메시지가 없습니다.' }}
                  renderItem={(item, index) => {
                    const prev = index > 0 ? orderedMessages[index - 1] : undefined;
                    const showDaySep =
                      orderedMessages.length > 0 &&
                      (!prev || startOfDayKey(prev.createdAt) !== startOfDayKey(item.createdAt));
                    const sender = getRow(item);
                    const isMine = sameMemberUuid(item.senderId, user?.id);
                    const timeLabel = formatChatTime(item.createdAt);
                    const readCount = latestReadMap[item.messageId]?.length ?? 0;
                    const showReadBadge = isMine && readCount > 0;
                    const canEditText =
                      isMine &&
                      !item.deleted &&
                      !isImageMessage(item) &&
                      !isFileMessage(item) &&
                      item.type === 'NORMAL';
                    const canDelete = isMine && !item.deleted;
                    const showMessageActions =
                      isMine &&
                      !item.deleted &&
                      editingMessageId !== item.messageId &&
                      (canEditText || canDelete);

                    const openDeleteConfirm = () => {
                      Modal.confirm({
                        zIndex: MEMBER_CHAT_OVERLAY_Z,
                        title: '이 메시지를 삭제할까요?',
                        content: '상대방 화면에서도 삭제된 메시지로 표시됩니다.',
                        okText: '삭제',
                        okType: 'danger',
                        cancelText: '취소',
                        onOk: () => deleteMutation.mutateAsync(item.messageId),
                      });
                    };

                    const bubbleBody =
                      item.deleted ? (
                        <Typography.Text type="secondary" className="tw-text-sm tw-italic">
                          삭제된 메시지입니다.
                        </Typography.Text>
                      ) : editingMessageId === item.messageId ? (
                        <div className="tw-flex tw-w-full tw-flex-col tw-gap-2">
                          <Input.TextArea
                            value={editingContent}
                            rows={3}
                            onChange={(e) => setEditingContent(e.target.value)}
                            className="!tw-text-sm"
                            autoFocus
                          />
                          <div className="tw-flex tw-justify-end tw-gap-2">
                            <button
                              type="button"
                              className="tw-rounded-md tw-px-2 tw-py-1 tw-text-xs tw-text-slate-600 hover:tw-bg-slate-100"
                              onClick={() => {
                                setEditingMessageId(null);
                                setEditingContent('');
                              }}
                            >
                              취소
                            </button>
                            <Button
                              type="primary"
                              size="small"
                              loading={editMutation.isPending}
                              disabled={!editingContent.trim()}
                              className="!tw-rounded-lg"
                              onClick={() => {
                                void editMutation.mutateAsync({
                                  messageId: item.messageId,
                                  content: editingContent.trim(),
                                });
                              }}
                            >
                              저장
                            </Button>
                          </div>
                        </div>
                      ) : isImageMessage(item) ? (
                        <div>
                          <Tag icon={<FileImageOutlined />} className="!tw-mb-1">
                            이미지
                          </Tag>
                          <Typography.Text className="tw-break-all tw-text-sm">{item.content}</Typography.Text>
                          <div className="tw-mt-1">
                            <button
                              type="button"
                              className="tw-text-xs tw-text-blue-600 hover:tw-underline"
                              onClick={() => {
                                if (item.content) void downloadMutation.mutateAsync(item.content);
                              }}
                            >
                              열기
                            </button>
                          </div>
                        </div>
                      ) : isFileMessage(item) ? (
                        <div>
                          <Tag icon={<FileOutlined />} className="!tw-mb-1">
                            파일
                          </Tag>
                          <Typography.Text className="tw-break-all tw-text-sm">{item.content}</Typography.Text>
                          <div className="tw-mt-1">
                            <button
                              type="button"
                              className="tw-text-xs tw-text-blue-600 hover:tw-underline"
                              onClick={() => {
                                if (item.content) void downloadMutation.mutateAsync(item.content);
                              }}
                            >
                              다운로드
                            </button>
                          </div>
                        </div>
                      ) : (
                        <ChatLinkifiedText
                          text={item.content ?? ''}
                          className="!tw-my-0 tw-text-sm tw-leading-relaxed tw-text-inherit"
                        />
                      );

                    return (
                      <List.Item className="!tw-block !tw-overflow-visible !tw-border-0 !tw-px-0 !tw-py-2">
                        {showDaySep ? (
                          <div
                            className="tw-mb-2 tw-flex tw-w-full tw-justify-center"
                            aria-hidden
                          >
                            <span className="tw-rounded-full tw-bg-slate-200/90 tw-px-3 tw-py-1 tw-text-[11px] tw-font-medium tw-tabular-nums tw-text-slate-600">
                              {formatDateSeparatorLabel(item.createdAt)}
                            </span>
                          </div>
                        ) : null}
                        <div
                          className={`tw-flex tw-w-full tw-gap-2 ${isMine ? 'tw-flex-row-reverse' : 'tw-flex-row'}`}
                        >
                          <Avatar
                            className={
                              isMine
                                ? '!tw-shrink-0 !tw-bg-blue-100 !tw-text-blue-800'
                                : 'tw-shrink-0 tw-bg-slate-200 tw-text-slate-700'
                            }
                            size={36}
                            src={sender.avatarUrl || undefined}
                          >
                            {chatSenderInitial(sender.name)}
                          </Avatar>

                          <div
                            className={`tw-flex tw-min-w-0 tw-max-w-[min(100%,20rem)] tw-flex-col tw-gap-0.5 ${isMine ? 'tw-items-end' : 'tw-items-start'}`}
                          >
                            {!isMine ? (
                              <div className="tw-px-0.5">
                                <Typography.Text strong className="tw-text-sm tw-text-slate-900">
                                  {sender.name}
                                </Typography.Text>
                                {sender.subtitle ? (
                                  <Typography.Text
                                    type="secondary"
                                    className="tw-ml-1.5 tw-text-[11px] tw-leading-none"
                                  >
                                    {sender.subtitle}
                                  </Typography.Text>
                                ) : null}
                              </div>
                            ) : null}

                            <div
                              className={`tw-relative tw-z-[1] tw-inline-flex tw-max-w-full tw-flex-col tw-overflow-visible ${isMine ? 'tw-items-end' : 'tw-items-start'}`}
                            >
                              <div
                                className={`tw-relative tw-isolate tw-z-[1] tw-max-w-full tw-animate-mc-bubble-in tw-overflow-visible tw-rounded-2xl tw-px-3 tw-py-2 tw-shadow-sm ${
                                  isMine
                                    ? 'tw-rounded-tr-sm tw-border tw-border-blue-200/80 tw-bg-blue-50/90 tw-text-slate-900'
                                    : 'tw-rounded-tl-sm tw-border tw-border-slate-200 tw-bg-white'
                                }`}
                              >
                                {bubbleBody}
                              </div>
                              <div
                                className={`tw-mt-1 tw-flex tw-w-full tw-max-w-full tw-flex-wrap tw-items-center tw-gap-x-2 tw-gap-y-1 tw-text-[11px] tw-leading-snug tw-text-slate-400 ${isMine ? 'tw-justify-end' : 'tw-justify-start'}`}
                              >
                                <span className="tw-inline-flex tw-flex-wrap tw-items-center tw-gap-x-1.5">
                                  {timeLabel ? <span className="tw-tabular-nums">{timeLabel}</span> : null}
                                  {item.edited ? (
                                    <>
                                      {timeLabel ? <span className="tw-text-slate-300">·</span> : null}
                                      <span>수정됨</span>
                                    </>
                                  ) : null}
                                  {showReadBadge ? (
                                    <>
                                      {timeLabel || item.edited ? <span className="tw-text-slate-300">·</span> : null}
                                      <span className="tw-font-medium tw-text-blue-600/90">{`읽음 ${readCount}`}</span>
                                    </>
                                  ) : null}
                                </span>
                                {showMessageActions ? (
                                  <span className="tw-inline-flex tw-items-center tw-gap-2 tw-pl-0.5">
                                    {canEditText ? (
                                      <button
                                        type="button"
                                        className="tw-m-0 tw-cursor-pointer tw-border-0 tw-bg-transparent tw-p-0 tw-text-[11px] tw-font-semibold tw-text-slate-500 tw-transition-colors hover:tw-text-[#2563EB] focus:tw-outline-none focus-visible:tw-ring-2 focus-visible:tw-ring-[#2563EB]/30 tw-rounded-sm"
                                        onClick={() => {
                                          setEditingMessageId(item.messageId);
                                          setEditingContent(item.content ?? '');
                                        }}
                                      >
                                        수정
                                      </button>
                                    ) : null}
                                    {canEditText && canDelete ? (
                                      <span className="tw-select-none tw-text-slate-300" aria-hidden>
                                        |
                                      </span>
                                    ) : null}
                                    {canDelete ? (
                                      <button
                                        type="button"
                                        className="tw-m-0 tw-cursor-pointer tw-border-0 tw-bg-transparent tw-p-0 tw-text-[11px] tw-font-semibold tw-text-slate-500 tw-transition-colors hover:tw-text-rose-600 focus:tw-outline-none focus-visible:tw-ring-2 focus-visible:tw-ring-rose-400/40 tw-rounded-sm"
                                        onClick={openDeleteConfirm}
                                      >
                                        삭제
                                      </button>
                                    ) : null}
                                  </span>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        </div>
                      </List.Item>
                    );
                  }}
                />
              </div>
              <div className="tw-flex tw-shrink-0 tw-flex-col tw-gap-1">
                <Input.TextArea
                  rows={isFloating ? 2 : 3}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
                    if (e.key !== 'Enter' || e.shiftKey) return;
                    e.preventDefault();
                    if (sendMutation.isPending || uploading || !activeRoom?.roomId) return;
                    if (!draft.trim()) return;
                    void sendMutation.mutateAsync();
                  }}
                  placeholder="메시지를 입력하세요."
                  disabled={Boolean(!activeRoom || uploading)}
                  className="tw-min-h-[88px] tw-shrink-0 tw-resize-y tw-rounded-lg focus:!tw-border-blue-400 focus:!tw-shadow-[0_0_0_2px_rgba(37,99,235,0.15)]"
                  aria-label="메시지 입력"
                />
                <span className="tw-select-none tw-text-[11px] tw-text-slate-400">
                  Enter로 전송 · Shift+Enter로 줄바꿈
                </span>
              </div>
              <div className="tw-flex tw-shrink-0 tw-justify-between">
                <Space>
                  <Upload showUploadList={false} beforeUpload={(file) => uploadBefore(file as File)}>
                    <AppButton variant="secondary" loading={uploading}>
                      파일 업로드
                    </AppButton>
                  </Upload>
                  <AppButton
                    variant="secondary"
                    onClick={handleReadAckLatest}
                    disabled={!activeRoom || orderedMessages.length === 0}
                  >
                    최신 읽음 처리
                  </AppButton>
                </Space>
                <AppButton
                  loading={sendMutation.isPending}
                  onClick={() => {
                    void sendMutation.mutateAsync();
                  }}
                  disabled={!activeRoom || !draft.trim()}
                >
                  전송
                </AppButton>
              </div>
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
    </div>
  );
}
