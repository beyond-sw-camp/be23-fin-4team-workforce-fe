import { env } from '@/app/config/env';
import { httpClient } from '@/shared/api/httpClient';
import { unwrapApiResponse } from '@/shared/api/response';
import type {
  MemberChatCursorResponse,
  MemberChatEditRequest,
  MemberChatMessage,
  MemberChatParticipant,
  MemberChatParticipantRole,
  MemberChatParticipantStatus,
  MemberChatPresignedUploadRequest,
  MemberChatPresignedUploadResponse,
  MemberChatReadAckRequest,
  MemberChatRoomSummary,
  MemberChatSendRequest,
} from '@/features/member-chat/model/types';

const MEMBER_CHAT_PREFIX = '/member-chat';

function pickParticipantCount(raw: Record<string, unknown>): number {
  const v = raw.participantCount ?? raw.participant_count;
  if (typeof v === 'number' && !Number.isNaN(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v);
  return 0;
}

function numOpt(raw: Record<string, unknown>, ...keys: string[]): number | undefined {
  for (const k of keys) {
    const v = raw[k];
    if (typeof v === 'number' && !Number.isNaN(v)) return v;
    if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v);
  }
  return undefined;
}

function strOpt(raw: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = raw[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return undefined;
}

function toRoomSummary(raw: Record<string, unknown>): MemberChatRoomSummary {
  return {
    roomId: Number(raw.id ?? 0),
    roomType: String(raw.type ?? 'GROUP') as MemberChatRoomSummary['roomType'],
    title: String(raw.name ?? '채팅방'),
    participantCount: pickParticipantCount(raw),
    unreadCount: numOpt(raw, 'unreadCount', 'unread_count') ?? 0,
    lastMessageId: numOpt(raw, 'lastMessageId', 'last_message_id'),
    lastMessagePreview: strOpt(raw, 'lastMessagePreview', 'last_message_preview'),
    lastMessageSenderId: strOpt(raw, 'lastMessageSenderId', 'last_message_sender_id'),
    lastMessageAt: strOpt(raw, 'lastMessageAt', 'last_message_at'),
    myLastReadMessageId: numOpt(raw, 'myLastReadMessageId', 'my_last_read_message_id'),
    otherPartyLastReadMessageId: numOpt(
      raw,
      'otherPartyLastReadMessageId',
      'other_party_last_read_message_id',
    ),
    otherMemberId: strOpt(raw, 'otherMemberId', 'other_member_id'),
    otherMemberName: strOpt(raw, 'otherMemberName', 'other_member_name'),
    otherMemberProfileUrl: strOpt(raw, 'otherMemberProfileUrl', 'other_member_profile_url'),
    otherMemberJobTitleName: strOpt(raw, 'otherMemberJobTitleName', 'other_member_job_title_name'),
    otherMemberJobGradeName: strOpt(raw, 'otherMemberJobGradeName', 'other_member_job_grade_name'),
    otherMemberOrganizationName: strOpt(
      raw,
      'otherMemberOrganizationName',
      'other_member_organization_name',
    ),
  };
}

function toMessage(raw: Record<string, unknown>): MemberChatMessage {
  // REST(ChatMessageResponse)는 id, STOMP/Redis 이벤트(ChatMessageEvent)는 messageId
  const mid = raw.id ?? raw.messageId ?? raw.message_id;
  return {
    messageId: typeof mid === 'number' ? mid : Number(mid ?? 0),
    roomId: Number((raw.chatRoom as Record<string, unknown> | undefined)?.id ?? raw.roomId ?? 0),
    senderId: String(raw.senderId ?? ''),
    senderName: strOpt(raw, 'senderName', 'sender_name'),
    senderProfileUrl: strOpt(raw, 'senderProfileUrl', 'sender_profile_url'),
    senderJobTitleName: strOpt(raw, 'senderJobTitleName', 'sender_job_title_name'),
    senderJobGradeName: strOpt(raw, 'senderJobGradeName', 'sender_job_grade_name'),
    senderOrganizationName: strOpt(raw, 'senderOrganizationName', 'sender_organization_name'),
    type: String(raw.type ?? 'NORMAL') as MemberChatMessage['type'],
    content: String(raw.content ?? ''),
    createdAt: String(raw.createdAt ?? ''),
    updatedAt: String(raw.updatedAt ?? ''),
    deleted: Boolean(raw.deleted),
    edited: Boolean(raw.edited),
    editedAt: typeof raw.editedAt === 'string' ? raw.editedAt : undefined,
    clientMessageId: typeof raw.clientMessageId === 'string' ? raw.clientMessageId : undefined,
    replyToId: typeof raw.replyToId === 'number' ? raw.replyToId : undefined,
    readerCount: numOpt(raw, 'readerCount', 'reader_count') ?? 0,
  };
}

function toParticipant(raw: Record<string, unknown>): MemberChatParticipant {
  const roleRaw = typeof raw.role === 'string' ? (raw.role as string).toUpperCase() : 'MEMBER';
  const statusRaw = typeof raw.status === 'string' ? (raw.status as string).toUpperCase() : 'JOINED';
  const role: MemberChatParticipantRole =
    roleRaw === 'OWNER' || roleRaw === 'MODERATOR' ? (roleRaw as MemberChatParticipantRole) : 'MEMBER';
  const status: MemberChatParticipantStatus =
    statusRaw === 'JOINED' || statusRaw === 'LEFT' || statusRaw === 'HIDDEN' || statusRaw === 'BANNED'
      ? (statusRaw as MemberChatParticipantStatus)
      : 'JOINED';
  return {
    memberId: String(raw.memberId ?? raw.member_id ?? ''),
    name: strOpt(raw, 'name'),
    profileUrl: strOpt(raw, 'profileUrl', 'profile_url'),
    jobTitleName: strOpt(raw, 'jobTitleName', 'job_title_name'),
    jobGradeName: strOpt(raw, 'jobGradeName', 'job_grade_name'),
    organizationName: strOpt(raw, 'organizationName', 'organization_name'),
    role,
    status,
    lastReadMessageId: numOpt(raw, 'lastReadMessageId', 'last_read_message_id'),
  };
}

function asMessageArray(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) {
    return payload.filter((v): v is Record<string, unknown> => !!v && typeof v === 'object');
  }
  if (payload && typeof payload === 'object') {
    const o = payload as Record<string, unknown>;
    const nested =
      o.items ??
      o.content ??
      o.messages ??
      o.list ??
      (o.data && typeof o.data === 'object' ? (o.data as Record<string, unknown>).items : undefined);
    if (Array.isArray(nested)) {
      return nested.filter((v): v is Record<string, unknown> => !!v && typeof v === 'object');
    }
  }
  return [];
}

export const memberChatApi = {
  buildDownloadUrl(key: string): string {
    const base = env.VITE_API_BASE_URL.replace(/\/+$/, '');
    return `${base}${MEMBER_CHAT_PREFIX}/files/download?key=${encodeURIComponent(key)}&scanStatus=CLEAN`;
  },

  async listMyRooms(): Promise<MemberChatRoomSummary[]> {
    const response = await httpClient.get(`${MEMBER_CHAT_PREFIX}/rooms`);
    const payload = unwrapApiResponse<unknown>(response.data);
    return Array.isArray(payload)
      ? payload
          .filter((v): v is Record<string, unknown> => !!v && typeof v === 'object')
          .map(toRoomSummary)
      : [];
  },

  async createDirectRoom(targetMemberId: string): Promise<MemberChatRoomSummary> {
    const response = await httpClient.post(`${MEMBER_CHAT_PREFIX}/rooms/direct`, {
      otherMemberId: targetMemberId,
    });
    return toRoomSummary(unwrapApiResponse<Record<string, unknown>>(response.data));
  },

  async createGroupRoom(title: string, memberIds: string[]): Promise<MemberChatRoomSummary> {
    const response = await httpClient.post(`${MEMBER_CHAT_PREFIX}/rooms/group`, {
      name: title,
      memberIds,
    });
    return toRoomSummary(unwrapApiResponse<Record<string, unknown>>(response.data));
  },

  async listParticipants(roomId: number): Promise<MemberChatParticipant[]> {
    const response = await httpClient.get(`${MEMBER_CHAT_PREFIX}/rooms/${roomId}/participants`);
    const payload = unwrapApiResponse<unknown>(response.data);
    if (!Array.isArray(payload)) return [];
    return payload
      .filter((v): v is Record<string, unknown> => !!v && typeof v === 'object')
      .map(toParticipant);
  },

  async addMember(roomId: number, memberId: string): Promise<void> {
    await httpClient.post(`${MEMBER_CHAT_PREFIX}/rooms/${roomId}/members/${encodeURIComponent(memberId)}`);
  },

  async leaveRoom(roomId: number): Promise<void> {
    await httpClient.post(`${MEMBER_CHAT_PREFIX}/rooms/${roomId}/leave`);
  },

  async getRoomHistory(roomId: number, cursor?: number, size = 50): Promise<MemberChatCursorResponse> {
    const response = await httpClient.get(`${MEMBER_CHAT_PREFIX}/rooms/${roomId}/messages`, {
      params: { cursor, size },
    });
    const payload = unwrapApiResponse<unknown>(response.data);
    const rows = asMessageArray(payload);
    const items = rows.map(toMessage);
    const last = items.length > 0 ? items[items.length - 1] : null;
    return { items, nextCursor: last?.messageId ?? null, hasNext: items.length >= size };
  },

  /** 텍스트 등 일반 전송 — STOMP 와 동일 서버 로직(저장·Pub/Sub). 웹에서는 이 경로가 가장 안정적이다. */
  async sendRoomMessage(roomId: number, body: MemberChatSendRequest): Promise<void> {
    await httpClient.post(`${MEMBER_CHAT_PREFIX}/rooms/${roomId}/messages`, body);
  },

  async syncRoomMessages(roomId: number, lastSeenMessageId?: number): Promise<MemberChatMessage[]> {
    const response = await httpClient.get(`${MEMBER_CHAT_PREFIX}/sync`, {
      params: { roomId, lastSeenMessageId },
    });
    const payload = unwrapApiResponse<unknown>(response.data);
    const rows = asMessageArray(payload);
    return rows.map(toMessage);
  },

  async editMessage(messageId: string, request: MemberChatEditRequest): Promise<MemberChatMessage> {
    const response = await httpClient.patch(`${MEMBER_CHAT_PREFIX}/messages/${encodeURIComponent(messageId)}`, request);
    return unwrapApiResponse<MemberChatMessage>(response.data);
  },

  async deleteMessage(messageId: string): Promise<void> {
    await httpClient.delete(`${MEMBER_CHAT_PREFIX}/messages/${encodeURIComponent(messageId)}`);
  },

  async ackRead(roomId: number, request: MemberChatReadAckRequest): Promise<void> {
    await httpClient.post(`${MEMBER_CHAT_PREFIX}/rooms/${roomId}/read`, null, {
      params: { messageId: request.messageId, deviceId: request.deviceId ?? 'web' },
    });
  },

  /**
   * 방 진입/재접속 시 호출 — 서버가 해당 방의 최신 메시지까지 일괄 ack.
   * 서버 ReadReceiptService.ackLatest 는 이미 읽은 상태면 no-op 이다 (idempotent).
   */
  async ackReadLatest(roomId: number, deviceId = 'web'): Promise<number | null> {
    const response = await httpClient.post(`${MEMBER_CHAT_PREFIX}/rooms/${roomId}/read-latest`, null, {
      params: { deviceId },
    });
    const payload = unwrapApiResponse<Record<string, unknown> | null>(response.data);
    const v = payload?.lastReadMessageId;
    if (typeof v === 'number' && !Number.isNaN(v)) return v;
    if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v);
    return null;
  },

  async issuePresignedUpload(
    request: MemberChatPresignedUploadRequest,
  ): Promise<MemberChatPresignedUploadResponse> {
    const response = await httpClient.post(`${MEMBER_CHAT_PREFIX}/files/presigned`, request);
    return unwrapApiResponse<MemberChatPresignedUploadResponse>(response.data);
  },

  /** S3 presigned PUT 대신 서버 경유 업로드(브라우저 CORS 회피) */
  async uploadFile(file: File): Promise<MemberChatPresignedUploadResponse> {
    const form = new FormData();
    form.append('file', file);
    const response = await httpClient.post(`${MEMBER_CHAT_PREFIX}/file-upload`, form, {
      timeout: Math.max(env.apiRequestTimeoutMs, 120_000),
    });
    return unwrapApiResponse<MemberChatPresignedUploadResponse>(response.data);
  },

  async confirmUpload(key: string): Promise<void> {
    await httpClient.post(`${MEMBER_CHAT_PREFIX}/files/confirm`, { key });
  },

  async issuePresignedDownload(key: string): Promise<{ downloadUrl: string }> {
    const response = await httpClient.get(`${MEMBER_CHAT_PREFIX}/files/download`, {
      params: { key, scanStatus: 'CLEAN' },
      maxRedirects: 0,
      validateStatus: (status) => status === 302 || status === 200,
    });
    const location = (response.headers.location as string | undefined) ?? '';
    if (location) return { downloadUrl: location };
    // Browser adapters often follow 302 automatically and expose final URL here.
    const redirectedUrl =
      typeof (response.request as { responseURL?: unknown } | undefined)?.responseURL === 'string'
        ? ((response.request as { responseURL?: string }).responseURL ?? '')
        : '';
    return { downloadUrl: redirectedUrl };
  },

  /**
   * 새 JSON 엔드포인트 — `<img src>` / 다운로드 링크에 바로 사용 가능한 presigned S3 URL 을 JSON 으로 반환.
   * axios 가 302 를 브라우저에서 자동으로 따라가 response.headers.location 을 못 읽는 문제를 회피한다.
   */
  async getSignedDownloadUrl(key: string): Promise<string> {
    const response = await httpClient.get(`${MEMBER_CHAT_PREFIX}/files/signed-url`, {
      params: { key, scanStatus: 'CLEAN' },
    });
    const payload = unwrapApiResponse<Record<string, unknown> | null>(response.data);
    const v = payload?.url;
    return typeof v === 'string' ? v : '';
  },
};
