import { formatDateSeparatorLabel } from '@/features/member-chat/ui/shared/chatFormatters';

/**
 * 같은 날짜의 첫 메시지 위에 들어가는 캡슐 형태 separator.
 * Phase 3: 양쪽 가는 라인 + 가운데 캡슐.
 */
export function ChatDateSeparator({ iso }: { iso?: string }) {
  const label = formatDateSeparatorLabel(iso);
  if (!label) return null;
  return (
    <div className="tw-my-2 tw-flex tw-w-full tw-items-center tw-gap-4" aria-hidden>
      <div className="tw-h-px tw-flex-1 tw-bg-slate-200/60" />
      <span className="tw-rounded-full tw-border tw-border-slate-100 tw-bg-slate-50 tw-px-3 tw-py-1 tw-text-[10px] tw-font-bold tw-tabular-nums tw-text-slate-400 tw-shadow-sm">
        {label}
      </span>
      <div className="tw-h-px tw-flex-1 tw-bg-slate-200/60" />
    </div>
  );
}