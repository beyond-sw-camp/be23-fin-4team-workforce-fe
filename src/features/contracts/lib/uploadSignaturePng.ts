import { memberChatApi } from '@/features/member-chat/api/memberChatApi';

/**
 * 계약 서명용 PNG 를 member-chat 업로드 경로로 올린 뒤, 계약 API에 넣을 HTTPS URL 을 반환한다.
 */
export async function uploadSignaturePngForContract(file: File): Promise<string> {
  const uploaded = await memberChatApi.uploadFile(file);
  const direct = uploaded.url?.trim();
  if (direct) return direct;
  const signed = await memberChatApi.getSignedDownloadUrl(uploaded.key);
  const url = signed.trim();
  if (!url) throw new Error('서명 이미지 URL을 받지 못했습니다.');
  return url;
}
