import type { ApiError } from '@/shared/api/types';

type AxiosLikeError = {
  message?: string;
  response?: {
    status?: number;
    data?:
      | {
      code?: string;
      errorCode?: string;
      message?: string;
      error_message?: string;
      error?: string;
      detail?: string;
      reason?: string;
      exception?: string;
      traceId?: string;
      trace_id?: string;
      fieldErrors?: Array<{ field: string; message: string }>;
      field_errors?: Array<{ field: string; message: string }>;
      status_code?: number;
    }
      | string;
  };
};

export function parseApiError(error: unknown): ApiError {
  const axiosError = error as AxiosLikeError;
  const response = axiosError?.response;
  const data = response?.data;
  const normalizedData = typeof data === 'string' ? undefined : data;
  const status = response?.status ?? normalizedData?.status_code ?? 0;
  const statusFallbackMessage =
    status === 400
      ? '잘못된 요청입니다.'
      : status === 401
        ? '인증이 필요하거나 토큰이 유효하지 않습니다.'
        : status === 403
          ? '접근 권한이 없습니다.'
          : status === 404
            ? '요청한 리소스를 찾을 수 없습니다.'
            : status >= 500
              ? '서버 내부 오류가 발생했습니다.'
              : '알 수 없는 에러가 발생했습니다.';
  const message =
    (typeof data === 'string' ? data : undefined) ??
    normalizedData?.message ??
    normalizedData?.error_message ??
    normalizedData?.error ??
    normalizedData?.detail ??
    normalizedData?.reason ??
    normalizedData?.exception ??
    axiosError?.message ??
    statusFallbackMessage;

  return {
    status,
    code: normalizedData?.code ?? normalizedData?.errorCode,
    message,
    traceId: normalizedData?.traceId ?? normalizedData?.trace_id,
    fieldErrors: normalizedData?.fieldErrors ?? normalizedData?.field_errors,
  };
}
