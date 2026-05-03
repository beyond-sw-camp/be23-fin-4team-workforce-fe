import type { NavigateOptions } from '@tanstack/react-router';

const CONTRACT_NOTIF_TYPES = new Set(['CONTRACT_REMIND', 'CONTRACT_SENT']);

export function isContractNotificationType(type: string | undefined | null): boolean {
  return CONTRACT_NOTIF_TYPES.has(String(type ?? '').trim().toUpperCase());
}

/** targetId(계약 UUID)가 있을 때만 알림 탭에서 해당 계약 상세로 이동 가능 */
export function isContractNotificationRoutable(item: { notificationType: string; targetId?: string }): boolean {
  if (!isContractNotificationType(item.notificationType)) return false;
  return Boolean(String(item.targetId ?? '').trim());
}

export function buildContractNotificationNavigate(targetId?: string | null): NavigateOptions {
  const id = String(targetId ?? '').trim();
  if (id) {
    return { to: '/app/contracts', search: { contractId: id } } as NavigateOptions;
  }
  return { to: '/app/contracts' } as NavigateOptions;
}
