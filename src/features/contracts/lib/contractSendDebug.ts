import { env } from '@/app/config/env';

export function isContractSendDebugEnabled(): boolean {
  return env.debugContractSend === true;
}

/**
 * 계약 발송 디버그 로그. `.env.local`에 `VITE_DEBUG_CONTRACT_SEND=true` 후 재시작.
 */
export function logContractSendDebug(label: string, payload: Record<string, unknown>): void {
  if (!isContractSendDebugEnabled()) return;
  // eslint-disable-next-line no-console -- 발송 디버그 전용(명시적 env)
  console.info(`[Contract-Send][DEBUG] ${label}`, payload);
}

type MessageInfo = { info: (content: string, duration?: number) => void };

/**
 * 콘솔이 안 보이거나 필터링될 때 클릭 연결을 화면에서 확인하기 위한 토스트.
 * `VITE_DEBUG_CONTRACT_SEND=true`일 때만 동작합니다.
 */
export function notifyContractSendDebug(messageApi: MessageInfo, text: string, durationSec = 3): void {
  if (!isContractSendDebugEnabled()) return;
  messageApi.info(text, durationSec);
  // eslint-disable-next-line no-console -- 발송 디버그 전용(명시적 env)
  console.info(`[Contract-Send][DEBUG] ${text}`);
}
