import type { NavigateOptions } from '@tanstack/react-router';

const CONTRACT_NOTIF_TYPES = new Set([
  'CONTRACT_REMIND',
  'CONTRACT_SENT',
  'CONTRACT_SIGNED',
  'CONTRACT_CANCELED',
  'CONTRACT_EXPIRED',
  'CONTRACT_DECLINED',
  'CONTRACT_REJECTED',
  'CONTRACT_COMPLETED',
  'CONTRACT_VIEWED',
]);

export function isContractNotificationType(type: string | undefined | null): boolean {
  return CONTRACT_NOTIF_TYPES.has(String(type ?? '').trim().toUpperCase());
}

/**
 * 알림 payload의 targetId 또는 JSON content 안의 contractId 등에서 계약 ID 추출
 */
export function resolveContractNotificationTargetId(item: {
  notificationType: string;
  targetId?: string;
  content?: string;
}): string | undefined {
  if (!isContractNotificationType(item.notificationType)) return undefined;
  const direct = String(item.targetId ?? '').trim();
  if (direct) return direct;
  const raw = String(item.content ?? '').trim();
  if (!raw) return undefined;
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    const id = o.contractId ?? o.contract_id;
    if (typeof id === 'string' && id.trim()) return id.trim();
  } catch {
    /* 본문이 JSON이 아닐 수 있음 */
  }
  return undefined;
}

/** 계약 ID를 알 수 있을 때만 알림에서 해당 계약 상세로 이동 가능 */
export function isContractNotificationRoutable(item: {
  notificationType: string;
  targetId?: string;
  content?: string;
}): boolean {
  return Boolean(resolveContractNotificationTargetId(item));
}

export function buildContractNotificationNavigate(targetId?: string | null): NavigateOptions {
  const id = String(targetId ?? '').trim();
  if (id) {
    return { to: '/app/contracts', search: { contractId: id } } as NavigateOptions;
  }
  return { to: '/app/contracts' } as NavigateOptions;
}
