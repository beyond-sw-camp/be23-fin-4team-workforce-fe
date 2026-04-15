import { env } from '@/app/config/env';
import { httpClient } from '@/shared/api/httpClient';
import { unwrapApiResponse } from '@/shared/api/response';
import type {
  MemberChatCursorResponse,
  MemberChatEditRequest,
  MemberChatMessage,
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

function toRoomSummary(raw: Record<string, unknown>): MemberChatRoomSummary {
  return {
    roomId: Number(raw.id ?? 0),
    roomType: String(raw.type ?? 'GROUP') as MemberChatRoomSummary['roomType'],
    title: String(raw.name ?? '채팅방'),
    participantCount: pickParticipantCount(raw),
    legalHold: Boolean(raw.legalHold),
  };
}

function strOpt(raw: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = raw[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return undefined;
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
};
