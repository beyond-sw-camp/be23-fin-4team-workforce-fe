export type MemberChatRoomType = 'DIRECT' | 'GROUP';

export type MemberChatMessageType = 'NORMAL' | 'NOTICE' | 'SYSTEM' | 'IMAGE' | 'FILE' | 'REPLY';

export type MemberChatRoomSummary = {
  roomId: number;
  roomType: MemberChatRoomType;
  title: string;
  participantCount?: number;
  unreadCount?: number;
  lastMessagePreview?: string;
  lastMessageAt?: string;
  legalHold?: boolean;
};

export type MemberChatMessage = {
  messageId: number;
  roomId: number;
  senderId: string;
  /** REST 히스토리/동기화에서 서버가 채움 */
  senderName?: string;
  senderProfileUrl?: string;
  senderJobTitleName?: string;
  senderJobGradeName?: string;
  senderOrganizationName?: string;
  type: MemberChatMessageType;
  content?: string;
  createdAt: string;
  updatedAt?: string;
  deleted: boolean;
  edited?: boolean;
  editedAt?: string;
  clientMessageId?: string;
  replyToId?: number;
};

export type MemberChatReadEvent = {
  roomId: number;
  memberId: string;
  messageId: number;
  deviceId?: string;
  readAt?: string;
};

export type MemberChatCursorResponse = {
  items: MemberChatMessage[];
  nextCursor?: number | null;
  hasNext: boolean;
};

export type MemberChatSendRequest = {
  type: MemberChatMessageType;
  content?: string;
  clientMessageId: string;
  replyToId?: number;
};

export type MemberChatEditRequest = {
  content: string;
};

export type MemberChatReadAckRequest = {
  messageId: number;
  deviceId?: string;
};

export type MemberChatPresignedUploadRequest = {
  filename: string;
  mime: string;
  size: number;
};

export type MemberChatPresignedUploadResponse = {
  url: string;
  key: string;
  mimeType: string;
  sizeBytes: number;
};
