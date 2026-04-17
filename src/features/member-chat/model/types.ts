export type MemberChatRoomType = 'DIRECT' | 'GROUP';

export type MemberChatMessageType = 'NORMAL' | 'NOTICE' | 'SYSTEM' | 'IMAGE' | 'FILE' | 'REPLY';

export type MemberChatRoomSummary = {
  roomId: number;
  roomType: MemberChatRoomType;
  title: string;
  participantCount?: number;
  /** 내가 아직 안 읽은 메시지 수 (내가 보낸 건 제외) */
  unreadCount?: number;
  /** 방 목록 미리보기 */
  lastMessageId?: number;
  lastMessagePreview?: string;
  lastMessageSenderId?: string;
  lastMessageAt?: string;
  /** 내 읽음선 (방 진입 시 참조) */
  myLastReadMessageId?: number;
  /** 1:1 전용 — 상대방의 읽음선. 그룹방은 undefined. */
  otherPartyLastReadMessageId?: number;
  /** 1:1 전용 — 상대방 프로필 (그룹은 undefined) */
  otherMemberId?: string;
  otherMemberName?: string;
  otherMemberProfileUrl?: string;
  otherMemberJobTitleName?: string;
  otherMemberJobGradeName?: string;
  otherMemberOrganizationName?: string;
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
  /** 이 메시지를 읽은 다른 참여자 수 (보낸 사람 제외) — 그룹 채팅의 "안 읽은 수" 계산에 사용 */
  readerCount?: number;
};

export type MemberChatReadEvent = {
  roomId: number;
  memberId: string;
  /** 이번 ack 시점의 단건 messageId (== lastReadMessageId) */
  messageId: number;
  /** 단조증가형 읽음선. messageId 와 동일 값. */
  lastReadMessageId?: number;
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

export type MemberChatParticipantRole = 'OWNER' | 'MODERATOR' | 'MEMBER';

export type MemberChatParticipantStatus = 'JOINED' | 'LEFT' | 'HIDDEN' | 'BANNED';

export type MemberChatParticipant = {
  memberId: string;
  name?: string;
  profileUrl?: string;
  jobTitleName?: string;
  jobGradeName?: string;
  organizationName?: string;
  role: MemberChatParticipantRole;
  status: MemberChatParticipantStatus;
  lastReadMessageId?: number;
};

export type MemberChatPresignedUploadResponse = {
  /** presigned PUT 시에만 사용. 서버 업로드(`/files/upload`)는 비어 있을 수 있음 */
  url?: string;
  key: string;
  mimeType: string;
  sizeBytes: number;
  /** 원본 파일명 (서버 업로드 경로 응답에 포함) — 이후 메시지 렌더링 시 표시에 사용 */
  fileName?: string;
};

/**
 * FILE / IMAGE 메시지의 content 에 직렬화되는 첨부 메타데이터.
 * 구버전 메시지는 content 가 S3 key 단일 문자열일 수 있어, 파서에서 폴백한다.
 */
export type MemberChatAttachmentPayload = {
  key: string;
  name?: string;
  mime?: string;
  size?: number;
};
