import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FileOutlined, PaperClipOutlined, SearchOutlined, SendOutlined } from '@ant-design/icons';
import { Avatar, Badge, Button, Image, Input, List, Modal, Tag, Tooltip, Typography, Upload, message } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/features/auth/useAuth';
import { memberChatApi } from '@/features/member-chat/api/memberChatApi';
import { memberChatStompClient } from '@/features/member-chat/lib/memberChatStompClient';
import type {
  MemberChatMessage,
  MemberChatRoomSummary,
} from '@/features/member-chat/model/types';
import { chatSenderInitial, useChatSenderProfiles } from '@/features/member-chat/hooks/useChatSenderProfiles';
import { useSignedDownloadUrl } from '@/features/member-chat/hooks/useSignedDownloadUrl';
import {
  encodeAttachmentPayload,
  fallbackNameFromKey,
  formatFileSize,
  parseAttachmentPayload,
} from '@/features/member-chat/lib/attachmentPayload';
import { CreateRoomFromOrgChartModal } from '@/features/member-chat/ui/CreateRoomFromOrgChartModal';
import { GroupParticipantsDrawer } from '@/features/member-chat/ui/GroupParticipantsDrawer';
import { AppButton } from '@/shared/ui/AppButton';

function isImageMessage(item: MemberChatMessage) {
  return item.type === 'IMAGE';
}

function isFileMessage(item: MemberChatMessage) {
  return item.type === 'FILE';
}

/**
 * `<img>` 는 Authorization 헤더를 실어 줄 수 없어 `/files/download` 의 302 응답을 직접 따를 수 없다.
 * 서버가 발급한 presigned S3 URL(자체 서명)을 JSON 으로 받아 src 에 꽂는다.
 */
function ChatImagePreview({ storageKey, alt }: { storageKey: string; alt?: string }) {
  const { url, isLoading, isError } = useSignedDownloadUrl(storageKey);
  if (isLoading) {
    return (
      <div
        className="tw-flex tw-h-40 tw-w-60 tw-max-w-full tw-items-center tw-justify-center tw-rounded-lg tw-bg-slate-100 tw-text-[11px] tw-text-slate-400"
        aria-label="이미지 불러오는 중"
      >
        이미지 불러오는 중…
      </div>
    );
  }
  if (isError || !url) {
    return (
      <div className="tw-flex tw-h-20 tw-w-60 tw-max-w-full tw-items-center tw-justify-center tw-rounded-lg tw-border tw-border-dashed tw-border-rose-300 tw-bg-rose-50 tw-text-[11px] tw-text-rose-500">
        이미지를 불러올 수 없습니다.
      </div>
    );
  }
  return (
    <Image
      src={url}
      alt={alt ?? ''}
      className="tw-max-h-64 tw-max-w-full tw-rounded-lg tw-object-contain"
      preview={{
        mask: '확대',
        zIndex: MEMBER_CHAT_OVERLAY_Z + 120,
      }}
      style={{ maxHeight: '16rem', objectFit: 'contain' }}
    />
  );
}

/** 파일 메시지 하단 링크 — signed URL 을 새 탭으로 연다. */
function ChatFileDownloadLink({ storageKey, fileName }: { storageKey: string; fileName?: string }) {
  const { url, isLoading, isError } = useSignedDownloadUrl(storageKey);
  if (isLoading) {
    return (
      <span className="tw-text-xs tw-text-slate-400" aria-label="다운로드 URL 준비 중">
        준비 중…
      </span>
    );
  }
  if (isError || !url) {
    return (
      <span className="tw-text-xs tw-text-rose-500">다운로드 URL 을 받을 수 없습니다.</span>
    );
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="tw-text-xs tw-text-blue-600 hover:tw-underline"
      aria-label={`${fileName ?? '첨부파일'} 새 탭에서 열기`}
    >
      새 탭에서 열기
    </a>
  );
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
/**
 * UX 정책:
 * - 첫 오픈에서는 기존처럼 첫 방 자동 진입 허용
 * - 한 번 닫은 뒤 재오픈부터는 자동 진입하지 않음 (사용자가 직접 방 선택)
 */
let shouldAutoEnterRoomOnMount = true;

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
  const [editingMessageId, setEditingMessageId] = useState<number | null>(null);
  const [editingContent, setEditingContent] = useState('');
  /** 방 내 각 멤버의 lastReadMessageId — 초기값은 방 진입 시, 이후 READ 이벤트로 갱신 */
  const [perMemberLastRead, setPerMemberLastRead] = useState<Record<string, number>>({});
  const [uploading, setUploading] = useState(false);
  const [listQuery, setListQuery] = useState('');
  const [isCompactLayout, setIsCompactLayout] = useState<boolean>(false);
  const [showCompactRoomList, setShowCompactRoomList] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 1023px)').matches : true,
  );
  const threadRef = useRef<HTMLDivElement | null>(null);
  const userScrolledUpRef = useRef(false);
  const lastRoomIdForScrollRef = useRef<number | null>(null);
  /** 방 전환 시 리셋. 하단에 보이는 최신 메시지까지 읽음 처리한 ID (중복 API 방지) */
  const lastAckedMessageIdRef = useRef(0);
  const orderedMessagesRef = useRef<MemberChatMessage[]>([]);

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

  const ackLatestIfViewing = useCallback(() => {
    const roomId = activeRoom?.roomId;
    if (!roomId) return;
    const list = orderedMessagesRef.current;
    if (list.length === 0) return;
    const last = list[list.length - 1]!;
    if (last.messageId <= lastAckedMessageIdRef.current) return;
    lastAckedMessageIdRef.current = last.messageId;
    // 서버가 "최신까지" 를 결정하는 idempotent API — 중복 호출 안전
    void memberChatStompClient.sendReadLatest(roomId, 'web');
    void memberChatApi.ackReadLatest(roomId, 'web').then(() => {
      // 내 unreadCount 가 0 으로 바뀌므로 방 목록 갱신
      void queryClient.invalidateQueries({ queryKey: ['member-chat', 'rooms'] });
    });
  }, [activeRoom?.roomId, queryClient]);

  const onThreadScroll = useCallback(() => {
    const el = threadRef.current;
    if (!el) return;
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
    const atBottom = dist <= 96;
    userScrolledUpRef.current = !atBottom;
    if (atBottom) {
      ackLatestIfViewing();
    }
  }, [ackLatestIfViewing]);

  const isFloating = variant === 'floating';
  const splitHeight = isFloating ? 'tw-h-full tw-min-h-0 tw-flex-1' : 'tw-min-h-[640px]';
  const threadH = isFloating ? 'tw-min-h-0 tw-flex-1 tw-overflow-auto' : 'tw-h-[460px] tw-overflow-auto';
  const prettyScrollbarClass =
    '[&::-webkit-scrollbar]:tw-h-2 [&::-webkit-scrollbar]:tw-w-2 [&::-webkit-scrollbar-track]:tw-bg-transparent [&::-webkit-scrollbar-thumb]:tw-rounded-full [&::-webkit-scrollbar-thumb]:tw-bg-slate-300/80 hover:[&::-webkit-scrollbar-thumb]:tw-bg-slate-400/80';

  const { data: rooms = [], isLoading: loadingRooms } = useQuery({
    queryKey: ['member-chat', 'rooms'],
    queryFn: () => memberChatApi.listMyRooms(),
  });

  const filteredRooms = useMemo(() => {
    const q = listQuery.trim().toLowerCase();
    if (!q) return rooms;
    return rooms.filter((r) => (r.title || '').toLowerCase().includes(q));
  }, [rooms, listQuery]);

  useEffect(() => {
    if (variant !== 'floating') return;
    const raw = initialDirectMemberId?.trim();
    if (!raw) return;
    let cancelled = false;
    void memberChatApi
      .createDirectRoom(raw)
      .then((room) => {
        if (cancelled) return;
        setActiveRoom(room);
        void queryClient.invalidateQueries({ queryKey: ['member-chat', 'rooms'] });
        onInitialDirectConsumed?.();
      })
      .catch(() => {
        message.error('1:1 채팅방을 열 수 없습니다.');
        onInitialDirectConsumed?.();
      });
    return () => {
      cancelled = true;
    };
  }, [variant, initialDirectMemberId, queryClient, onInitialDirectConsumed]);

  const { data: history, isLoading: loadingMessages } = useQuery({
    queryKey: ['member-chat', 'history', activeRoom?.roomId],
    queryFn: () => memberChatApi.getRoomHistory(activeRoom!.roomId),
    enabled: Boolean(activeRoom?.roomId),
  });

  useEffect(() => {
    const el = panelRootRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const COMPACT_PANEL_WIDTH = 980;
    const applyCompact = (width: number) => {
      const compact = width < COMPACT_PANEL_WIDTH;
      setIsCompactLayout(compact);
      setShowCompactRoomList((prev) => {
        if (!compact) return true;
        if (!activeRoom?.roomId) return true;
        // compact 상태에서는 리사이즈만으로 목록/대화 화면을 강제 전환하지 않는다.
        return prev;
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
          () => {
            void queryClient.invalidateQueries({ queryKey: ['member-chat', 'history', activeRoom.roomId] });
            void queryClient.invalidateQueries({ queryKey: ['member-chat', 'rooms'] });
            /** 읽음은 스크롤이 하단일 때만 ackLatestIfViewing 에서 일괄 처리 */
          },
        );
        unsubRead = memberChatStompClient.subscribeReadEvents(activeRoom.roomId, (payload) => {
          setPerMemberLastRead((prev) => {
            const cur = prev[payload.memberId] ?? 0;
            // lastReadMessageId 가 내려오지 않으면 messageId 로 폴백
            const next = Math.max(cur, payload.lastReadMessageId ?? payload.messageId ?? 0);
            if (next === cur) return prev;
            return { ...prev, [payload.memberId]: next };
          });
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

  const orderedMessages = useMemo(() => {
    const items = history?.items ?? [];
    return [...items].sort((a, b) => a.messageId - b.messageId);
  }, [history?.items]);

  orderedMessagesRef.current = orderedMessages;

  const { getRow } = useChatSenderProfiles(orderedMessages, user);

  const isDirectRoom = activeRoom?.roomType === 'DIRECT';
  const roomParticipantCount = activeRoom?.participantCount ?? 0;

  /**
   * 1:1 방에서 "상대방" 프로필(이름·직급·소속) 결정 우선순위:
   *   1) 방 서머리의 otherMember* (백엔드 enriched, 빈 방에도 존재)
   *   2) 메시지 히스토리 senderInfo (REST 히스토리·STOMP 양쪽에서 채워짐)
   *   3) 방 title 로 폴백
   */
  const directPartner = useMemo(() => {
    if (!isDirectRoom) return null;
    const fromRoom = activeRoom?.otherMemberName?.trim();
    if (fromRoom) {
      const title =
        activeRoom?.otherMemberJobTitleName?.trim() ||
        activeRoom?.otherMemberJobGradeName?.trim() ||
        '';
      const org = activeRoom?.otherMemberOrganizationName?.trim() || '';
      return {
        name: fromRoom,
        subtitle: [title, org].filter(Boolean).join(' · '),
        avatarUrl: activeRoom?.otherMemberProfileUrl ?? null,
      };
    }
    if (!user?.id) return null;
    const other = orderedMessages.find((m) => !sameMemberUuid(m.senderId, user.id));
    if (!other) return null;
    const row = getRow(other);
    return {
      name: row.name,
      subtitle: row.subtitle,
      avatarUrl: row.avatarUrl ?? null,
    };
  }, [
    isDirectRoom,
    activeRoom?.otherMemberName,
    activeRoom?.otherMemberProfileUrl,
    activeRoom?.otherMemberJobTitleName,
    activeRoom?.otherMemberJobGradeName,
    activeRoom?.otherMemberOrganizationName,
    user?.id,
    orderedMessages,
    getRow,
  ]);

  /**
   * 각 메시지를 기준으로 "안 읽은 수" 를 계산해 내 메시지 하단에 표기한다.
   *  - 1:1: 상대 읽음선 ≥ m.id 이면 0, 아니면 1
   *  - 그룹: (참여자수 - 1) - readers  (readers 는 서버 초기값과 라이브 READ 이벤트의 합 — 단조 증가)
   */
  const unreadByMessageId = useMemo(() => {
    const out: Record<number, number> = {};
    if (!activeRoom) return out;
    for (const m of orderedMessages) {
      // 라이브 lastRead 맵(상대+자기 자신)에서 m.id 이상을 읽은 "다른" 멤버 수
      let liveReaders = 0;
      for (const [memberId, lr] of Object.entries(perMemberLastRead)) {
        if (sameMemberUuid(memberId, m.senderId)) continue; // 보낸 사람 제외
        if ((lr ?? 0) >= m.messageId) liveReaders++;
      }

      if (isDirectRoom) {
        const senderIsMe = sameMemberUuid(m.senderId, user?.id);
        if (senderIsMe) {
          const roomOther = activeRoom.otherPartyLastReadMessageId ?? 0;
          const otherRead = roomOther >= m.messageId || liveReaders > 0;
          out[m.messageId] = otherRead ? 0 : 1;
        } else {
          const myRead =
            (user?.id ? perMemberLastRead[user.id] : undefined) ??
            activeRoom.myLastReadMessageId ??
            0;
          out[m.messageId] = myRead >= m.messageId ? 0 : 1;
        }
      } else {
        const serverReaders = m.readerCount ?? 0;
        const readers = Math.max(serverReaders, liveReaders);
        const audience = Math.max(0, roomParticipantCount - 1);
        out[m.messageId] = Math.max(0, audience - readers);
      }
    }
    return out;
  }, [orderedMessages, perMemberLastRead, isDirectRoom, activeRoom, roomParticipantCount, user?.id]);

  /** 방 진입/전환 시 perMemberLastRead 초기화 + 내/상대 읽음선 시드 + 최신까지 자동 ack */
  useEffect(() => {
    const rid = activeRoom?.roomId ?? null;
    const changed = lastRoomIdForScrollRef.current !== rid;
    lastRoomIdForScrollRef.current = rid;
    if (changed) {
      userScrolledUpRef.current = false;
      lastAckedMessageIdRef.current = 0;
      scrollThreadToBottom(true);

      // 시드
      const seed: Record<string, number> = {};
      if (user?.id && activeRoom?.myLastReadMessageId != null) {
        seed[user.id] = activeRoom.myLastReadMessageId;
      }
      setPerMemberLastRead(seed);

      // 방 진입 자동 ack — 목록은 ackLatestIfViewing 에서 invalidate
      if (rid) {
        void memberChatStompClient.sendReadLatest(rid, 'web');
        void memberChatApi.ackReadLatest(rid, 'web').then((lastReadId) => {
          if (lastReadId != null) {
            lastAckedMessageIdRef.current = Math.max(lastAckedMessageIdRef.current, lastReadId);
          }
          void queryClient.invalidateQueries({ queryKey: ['member-chat', 'rooms'] });
        });
      }
    }
  }, [activeRoom?.roomId, activeRoom?.myLastReadMessageId, user?.id, scrollThreadToBottom, queryClient]);

  useEffect(() => {
    scrollThreadToBottom(false);
  }, [orderedMessages, loadingMessages, scrollThreadToBottom]);

  /** 스레드 하단을 보고 있을 때만 최신 메시지까지 읽음(수동 버튼 없음 — 일반 메신저와 동일) */
  useEffect(() => {
    if (loadingMessages || !activeRoom?.roomId) return;
    if (orderedMessages.length === 0) return;
    if (userScrolledUpRef.current) return;
    ackLatestIfViewing();
  }, [activeRoom?.roomId, orderedMessages, loadingMessages, ackLatestIfViewing]);

  const uploadBefore = async (file: File) => {
    if (!activeRoom?.roomId) return Upload.LIST_IGNORE;
    setUploading(true);
    try {
      const uploaded = await memberChatApi.uploadFile(file);
      /** 서버가 S3 저장 후 메시지 전송 — REST로 Redis·STOMP fan-out.
       *  content 에는 원본 파일명·용량을 포함한 JSON 을 넣어, 수신 측이 예쁘게 표시할 수 있게 한다.
       *  구버전 클라이언트/히스토리와의 호환은 parseAttachmentPayload 에서 처리. */
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

  const showListEmptyOnboarding = !loadingRooms && rooms.length === 0;
  const hasActiveChat = Boolean(activeRoom);
  const hideRoomList = isCompactLayout && !showCompactRoomList;
  const hideActiveChatPane = isCompactLayout && showCompactRoomList;

  return (
    <div
      ref={panelRootRef}
      className={`tw-flex tw-w-full tw-min-h-0 tw-flex-col tw-overflow-hidden lg:tw-flex-row ${splitHeight} ${
        isFloating
          ? 'tw-flex-1 tw-rounded-none tw-border-0 tw-bg-transparent tw-shadow-none'
          : 'tw-rounded-xl tw-border tw-border-solid tw-border-slate-200 tw-bg-white tw-shadow-sm'
      }`}
    >
      {/* 좌측: 채팅방 목록 (텔레그램형 사이드바) */}
      <div
        className={
          isCompactLayout
            ? `${hideRoomList ? 'tw-hidden' : 'tw-flex'} tw-min-h-0 tw-w-full tw-shrink-0 tw-flex-col tw-bg-slate-50/95`
            : `tw-flex ${
                isFloating
                  ? 'tw-min-h-0 tw-w-full tw-max-h-[min(42%,280px)] tw-flex-1 tw-shrink-0 tw-flex-col tw-rounded-none tw-border-slate-200 tw-bg-slate-50/80 lg:tw-max-h-none lg:tw-h-full lg:tw-w-[min(100%,360px)] lg:tw-max-w-[40%] lg:tw-border-r'
                  : 'tw-h-[min(40vh,320px)] tw-w-full tw-shrink-0 tw-flex-col tw-border-slate-200 tw-bg-slate-50/80 lg:tw-h-auto lg:tw-w-[min(100%,360px)] lg:tw-max-w-[40%] lg:tw-border-r'
              }`
        }
      >
        <div className="tw-flex tw-shrink-0 tw-items-center tw-justify-between tw-gap-2 tw-border-b tw-border-slate-200 tw-px-3 tw-py-2.5">
          <Typography.Text strong className="tw-text-slate-800">
            채팅
          </Typography.Text>
          <AppButton type="primary" size="small" onClick={() => setCreateRoomOpen(true)}>
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
              className={`member-chat-room-list tw-mt-2 tw-min-h-0 tw-flex-1 tw-overflow-y-auto tw-px-1 [&_.ant-list-items]:tw-divide-y [&_.ant-list-items]:tw-divide-slate-100 ${prettyScrollbarClass}`}
              loading={loadingRooms}
              dataSource={filteredRooms}
              locale={{ emptyText: '검색 결과가 없습니다.' }}
              renderItem={(room) => {
                const selected = activeRoom?.roomId === room.roomId;
                const isDirect = room.roomType === 'DIRECT';
                // 1:1 방은 상대 이름·프로필을, 그룹은 방 제목을 표시
                const displayName = isDirect
                  ? (room.otherMemberName?.trim() || '대화 상대')
                  : (room.title?.trim() || '제목 없음');
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
                    className={`!tw-cursor-pointer !tw-rounded-lg !tw-border-0 !tw-px-2 !tw-py-2.5 tw-transition-colors ${
                      selected ? '!tw-bg-[#2563EB] [&_.ant-list-item-meta-title]:!tw-text-white [&_.ant-list-item-meta-description]:!tw-text-white/85' : 'hover:!tw-bg-slate-100'
                    }`}
                    onClick={() => {
                      setActiveRoom(room);
                      if (isCompactLayout) setShowCompactRoomList(false);
                    }}
                  >
                    <List.Item.Meta
                      avatar={
                        <Avatar
                          src={isDirect ? (room.otherMemberProfileUrl || undefined) : undefined}
                          className={
                            selected ? '!tw-bg-white/20 !tw-text-white' : '!tw-bg-slate-200 !tw-text-slate-700'
                          }
                          size={40}
                        >
                          {avatarInitial}
                        </Avatar>
                      }
                      title={
                        <span className="tw-flex tw-min-w-0 tw-items-center tw-gap-1.5">
                          <span className="tw-truncate tw-text-sm tw-font-semibold">
                            {displayName}
                          </span>
                          {room.unreadCount && room.unreadCount > 0 ? (
                            <Badge
                              count={room.unreadCount}
                              overflowCount={99}
                              color="#EF4444"
                              className="!tw-ml-auto tw-flex-shrink-0"
                            />
                          ) : null}
                        </span>
                      }
                      description={
                        <span className="tw-flex tw-min-w-0 tw-flex-col tw-gap-0.5 tw-text-xs">
                          {subtitleLine ? (
                            <span className="tw-block tw-truncate">{subtitleLine}</span>
                          ) : null}
                          {room.lastMessagePreview ? (
                            <span className="tw-block tw-truncate tw-text-[11px] tw-opacity-80">
                              {room.lastMessagePreview}
                            </span>
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
      <div className={`${hideActiveChatPane ? 'tw-hidden' : 'tw-flex'} tw-min-h-0 tw-min-w-0 tw-flex-1 tw-flex-col tw-bg-slate-50/40 tw-transition-all tw-duration-250`}>
        {hasActiveChat ? (
          <>
            <div className="tw-shrink-0 tw-bg-white tw-px-4 tw-py-3">
              <div className="tw-flex tw-items-start tw-gap-2">
                {isCompactLayout ? (
                  <button
                    type="button"
                    className="tw-mt-0.5 tw-inline-flex tw-h-8 tw-appearance-none tw-items-center tw-justify-center tw-border-0 tw-bg-transparent tw-px-1 tw-text-base tw-font-semibold tw-text-slate-600 tw-shadow-none tw-transition-colors hover:tw-text-[#2563EB] focus:tw-outline-none"
                    onClick={() => setShowCompactRoomList(true)}
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
                      src={directPartner?.avatarUrl || undefined}
                      className="tw-flex-shrink-0 tw-bg-slate-200 tw-text-slate-700"
                    >
                      {chatSenderInitial(directPartner?.name || activeRoom!.title || '?')}
                    </Avatar>
                    <div className="tw-min-w-0">
                      <Typography.Text
                        strong
                        className="tw-block tw-truncate tw-text-base tw-text-slate-900"
                      >
                        {directPartner?.name || activeRoom!.title || '채팅'}
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
                      onClick={() => setParticipantsOpen(true)}
                      className="tw-inline-flex tw-max-w-full tw-appearance-none tw-items-center tw-gap-1 tw-border-0 tw-bg-transparent tw-p-0 tw-text-left tw-text-base tw-font-semibold tw-text-slate-900 tw-shadow-none hover:tw-text-blue-600 focus:tw-outline-none"
                      aria-label="참여자 목록 열기"
                      title="참여자 목록 보기"
                    >
                      <span className="tw-truncate">{activeRoom!.title || '채팅'}</span>
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
                      {typeof activeRoom!.participantCount === 'number'
                        ? ` · 참여 ${activeRoom!.participantCount}명`
                        : null}
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="tw-flex tw-min-h-0 tw-flex-1 tw-flex-col tw-gap-3 tw-p-3">
              <div
                ref={threadRef}
                onScroll={onThreadScroll}
                className={`tw-rounded-lg tw-border tw-border-slate-200 tw-bg-slate-50 tw-p-3 ${threadH} ${prettyScrollbarClass}`}
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
                    // 카톡식 "안 읽은 수" — 모든 메시지에 표시
                    const unreadForMessage = unreadByMessageId[item.messageId] ?? 0;
                    const showUnreadBadge = unreadForMessage > 0;
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
                        (() => {
                          const payload = parseAttachmentPayload(item.content);
                          const displayName = payload.name || fallbackNameFromKey(payload.key);
                          if (!payload.key) {
                            return (
                              <Typography.Text type="secondary" className="tw-text-sm tw-italic">
                                이미지 정보를 불러올 수 없습니다.
                              </Typography.Text>
                            );
                          }
                          return (
                            <div>
                              <ChatImagePreview storageKey={payload.key} alt={displayName} />
                              <div className="tw-mt-1 tw-flex tw-flex-wrap tw-items-center tw-gap-2">
                                <Typography.Text
                                  type="secondary"
                                  className="tw-break-all tw-text-[11px]"
                                  title={displayName}
                                >
                                  {displayName}
                                  {formatFileSize(payload.size) ? ` · ${formatFileSize(payload.size)}` : ''}
                                </Typography.Text>
                              </div>
                            </div>
                          );
                        })()
                      ) : isFileMessage(item) ? (
                        (() => {
                          const payload = parseAttachmentPayload(item.content);
                          const displayName = payload.name || fallbackNameFromKey(payload.key);
                          if (!payload.key) {
                            return (
                              <Typography.Text type="secondary" className="tw-text-sm tw-italic">
                                파일 정보를 불러올 수 없습니다.
                              </Typography.Text>
                            );
                          }
                          const sizeLabel = formatFileSize(payload.size);
                          return (
                            <div>
                              <Tag icon={<FileOutlined />} className="!tw-mb-1">
                                파일
                              </Tag>
                              <div className="tw-flex tw-min-w-0 tw-flex-col tw-gap-0.5">
                                <Typography.Text
                                  strong
                                  className="tw-break-all tw-text-sm"
                                  title={displayName}
                                >
                                  {displayName}
                                </Typography.Text>
                                {sizeLabel ? (
                                  <Typography.Text type="secondary" className="tw-text-[11px]">
                                    {sizeLabel}
                                  </Typography.Text>
                                ) : null}
                              </div>
                              <div className="tw-mt-1">
                                <ChatFileDownloadLink storageKey={payload.key} fileName={displayName} />
                              </div>
                            </div>
                          );
                        })()
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
                                  {showUnreadBadge ? (
                                    <>
                                      {timeLabel || item.edited ? <span className="tw-text-slate-300">·</span> : null}
                                      <span
                                        className="tw-font-semibold tw-text-amber-500"
                                        aria-label={`안 읽은 ${unreadForMessage}명`}
                                      >
                                        {unreadForMessage}
                                      </span>
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
              <div className="tw-flex tw-shrink-0 tw-flex-col tw-gap-1.5">
                <div className="tw-rounded-2xl tw-border tw-border-slate-200/90 tw-bg-white tw-px-3 tw-py-2 tw-shadow-[0_1px_3px_rgba(15,23,42,0.06)]">
                  <Input.TextArea
                    autoSize={{ minRows: 1, maxRows: isFloating ? 5 : 8 }}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
                      if (e.key !== 'Enter' || e.shiftKey) return;
                      e.preventDefault();
                      if (sendMutation.isPending || uploading || !activeRoom?.roomId) return;
                      if (!draft.trim()) return;
                      void sendMutation.mutateAsync();
                    }}
                    placeholder={activeRoom ? '메시지를 입력하세요' : '채팅방을 선택해 주세요'}
                    disabled={Boolean(!activeRoom || uploading)}
                    className="!tw-max-h-[168px] !tw-min-h-[44px] !tw-border-0 !tw-bg-transparent !tw-p-0 !tw-text-[15px] !tw-leading-relaxed !tw-shadow-none placeholder:!tw-text-slate-400 focus:!tw-shadow-none"
                    style={{ resize: 'none' }}
                    aria-label="메시지 입력"
                  />
                  <div className="tw-mt-2 tw-flex tw-items-center tw-justify-between tw-gap-2 tw-border-t tw-border-slate-100 tw-pt-2">
                    <Tooltip
                      title="사진·파일 보내기"
                      zIndex={MEMBER_CHAT_OVERLAY_Z + 50}
                      getPopupContainer={(n) => n.parentElement ?? document.body}
                    >
                      <span className="tw-inline-flex">
                        <Upload showUploadList={false} beforeUpload={(file) => uploadBefore(file as File)}>
                          <button
                            type="button"
                            disabled={Boolean(!activeRoom || uploading)}
                            className="tw-flex tw-h-9 tw-w-9 tw-items-center tw-justify-center tw-rounded-full tw-border-0 tw-bg-transparent tw-text-slate-500 tw-transition-colors hover:tw-bg-slate-100 hover:tw-text-slate-800 disabled:tw-cursor-not-allowed disabled:tw-opacity-40"
                            aria-label="파일 보내기"
                          >
                            <PaperClipOutlined className="tw-text-[18px]" />
                          </button>
                        </Upload>
                      </span>
                    </Tooltip>
                    <Tooltip
                      title="전송 (Enter)"
                      zIndex={MEMBER_CHAT_OVERLAY_Z + 50}
                      getPopupContainer={(n) => n.parentElement ?? document.body}
                    >
                      <AppButton
                        variant="primary"
                        loading={sendMutation.isPending}
                        onClick={() => {
                          void sendMutation.mutateAsync();
                        }}
                        disabled={!activeRoom || !draft.trim()}
                        className="!tw-h-10 !tw-min-h-10 !tw-w-10 !tw-min-w-10 !tw-rounded-full !tw-border-0 !tw-p-0 !tw-shadow-md"
                        icon={<SendOutlined className="tw-text-base" />}
                        aria-label="메시지 전송"
                      />
                    </Tooltip>
                  </div>
                </div>
                <p className="tw-m-0 tw-select-none tw-text-center tw-text-[10px] tw-leading-snug tw-text-slate-400">
                  Enter로 전송 · Shift+Enter로 줄바꿈 · 맨 아래를 보면 자동 읽음
                </p>
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
      <GroupParticipantsDrawer
        open={participantsOpen}
        onClose={() => setParticipantsOpen(false)}
        roomId={activeRoom?.roomId ?? null}
        roomTitle={activeRoom?.title}
        meId={user?.id}
      />
    </div>
  );
}
