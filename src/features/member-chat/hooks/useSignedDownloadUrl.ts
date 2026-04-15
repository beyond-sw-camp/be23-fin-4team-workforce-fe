import { useQuery } from '@tanstack/react-query';
import { memberChatApi } from '@/features/member-chat/api/memberChatApi';

/**
 * S3 presigned GET URL 을 조회·캐시한다.
 *  - 서명 TTL(1시간)보다 짧게 staleTime 을 잡아 만료 직전 새 URL 로 교체
 *  - `<img src>` / 다운로드 링크에 바로 사용 가능하도록 문자열만 반환
 */
export function useSignedDownloadUrl(key: string | null | undefined) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['member-chat', 'signed-url', key],
    queryFn: () => memberChatApi.getSignedDownloadUrl(key!),
    enabled: Boolean(key),
    // S3 presigned URL TTL 는 1h. 안전마진 10분 확보.
    staleTime: 50 * 60_000,
    gcTime: 55 * 60_000,
    retry: 1,
  });
  return { url: data ?? '', isLoading, isError };
}
