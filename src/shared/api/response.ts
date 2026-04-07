type WrappedApiResponse<T> = {
  success?: boolean;
  message?: string;
  data?: T;
};

/**
 * 표준 봉투 `{ success, message, data }`에서 `data`가 있을 때만 언랩합니다.
 * `data: null`이면 루트 객체를 그대로 반환해 로그인 본문 등 평면 응답과 호환됩니다.
 */
export function unwrapApiResponse<T>(payload: unknown): T {
  if (payload && typeof payload === 'object' && 'data' in payload) {
    const data = (payload as WrappedApiResponse<T>).data;
    if (data !== undefined && data !== null) {
      return data as T;
    }
  }
  return payload as T;
}
