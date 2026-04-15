import { httpClient } from '@/shared/api/httpClient';
import { unwrapApiResponse } from '@/shared/api/response';

export type MemberChatAdminSearchParams = {
  from?: string;
  to?: string;
  roomId?: number;
  senderId?: string;
  q?: string;
  size?: number;
};

export type MemberChatAdminMessage = {
  id: number;
  roomId: number;
  senderId: string;
  type: string;
  content: string;
  deleted: boolean;
  edited: boolean;
  createdAt: string;
};

export type MemberChatLegalHoldApplyRequest = {
  roomId?: number;
  memberId?: string;
  reason: string;
  caseId?: string;
};

function toAdminMessage(raw: Record<string, unknown>): MemberChatAdminMessage {
  const roomObj = raw.chatRoom as Record<string, unknown> | undefined;
  return {
    id: Number(raw.id ?? 0),
    roomId: Number(roomObj?.id ?? 0),
    senderId: String(raw.senderId ?? ''),
    type: String(raw.type ?? ''),
    content: String(raw.content ?? ''),
    deleted: Boolean(raw.deleted),
    edited: Boolean(raw.edited),
    createdAt: String(raw.createdAt ?? ''),
  };
}

export const memberChatAdminApi = {
  async search(params: MemberChatAdminSearchParams): Promise<MemberChatAdminMessage[]> {
    const response = await httpClient.get('/member-chat/admin/search', { params });
    const payload = unwrapApiResponse<unknown>(response.data);
    return Array.isArray(payload)
      ? payload
          .filter((v): v is Record<string, unknown> => !!v && typeof v === 'object')
          .map(toAdminMessage)
      : [];
  },

  async exportCsv(body: { from?: string; to?: string; roomId?: number }): Promise<Blob> {
    const response = await httpClient.post('/member-chat/admin/export', body, {
      responseType: 'blob',
    });
    return response.data as Blob;
  },

  async applyLegalHold(body: MemberChatLegalHoldApplyRequest): Promise<{ holdId?: number }> {
    const response = await httpClient.post('/member-chat/admin/legal-hold', body);
    const payload = unwrapApiResponse<Record<string, unknown>>(response.data);
    return { holdId: typeof payload?.id === 'number' ? payload.id : undefined };
  },

  async releaseLegalHold(holdId: number): Promise<void> {
    await httpClient.delete(`/member-chat/admin/legal-hold/${holdId}`);
  },
};
