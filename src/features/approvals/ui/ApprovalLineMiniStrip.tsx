import clsx from 'clsx';
import { Typography, Tooltip } from 'antd';
import type { ApprovalLine } from '@/features/approvals/api/approvalRequestApi';

function lineStatusLabel(status: string): string {
  const s = String(status).toUpperCase();
  if (s === 'APPROVED') return '승인';
  if (s === 'REJECTED') return '반려';
  if (s === 'PENDING') return '검토 중';
  if (s === 'CANCELED') return '취소';
  return '대기';
}

function lineDotClass(status: string): string {
  const s = String(status).toUpperCase();
  if (s === 'APPROVED') return 'tw-bg-blue-500';
  if (s === 'REJECTED') return 'tw-bg-rose-500';
  if (s === 'PENDING') return 'tw-bg-amber-500';
  if (s === 'CANCELED') return 'tw-bg-slate-300';
  return 'tw-bg-slate-300';
}

/** 목록·검색 테이블용 가로 결재선 요약. 모든 표 안 결재선은 이 스타일을 기준으로 맞춘다. */
export function ApprovalLineMiniStrip({
  lines,
  visibleSlots = 3,
  variant = 'modal',
}: {
  lines: ApprovalLine[];
  /** 0이면 가로 스크롤만, 양수면 최소 너비 고정 */
  visibleSlots?: number;
  variant?: 'modal' | 'dashboard';
}) {
  const sorted = [...lines].sort((a, b) => a.stepOrder - b.stepOrder);
  if (sorted.length === 0) {
    return (
      <Typography.Text type="secondary" className="!tw-text-xs">
        —
      </Typography.Text>
    );
  }
  const firstLine = sorted[0]!;
  const representativeLine =
    sorted.find((line) => String(line.approvalStatus).toUpperCase() === 'PENDING') ??
    sorted.find((line) => String(line.approvalStatus).toUpperCase() === 'WAITING') ??
    firstLine;
  const tooltipTitle = (
    <div className="tw-min-w-[13rem] tw-space-y-1.5">
      {sorted.map((line) => {
        const status = String(line.approvalStatus ?? '');
        const name =
          line.approverName?.trim() ||
          line.approverJobTitleName?.trim() ||
          `결재 ${line.stepOrder}차`;
        return (
          <div key={line.approvalId} className="tw-flex tw-items-center tw-justify-between tw-gap-4">
            <span className="tw-min-w-0 tw-truncate tw-text-xs tw-font-semibold tw-text-slate-800">
              {line.stepOrder}. {name}
            </span>
            <span className="tw-shrink-0 tw-text-[11px] tw-font-medium tw-text-slate-500">
              {lineStatusLabel(status)}
            </span>
          </div>
        );
      })}
    </div>
  );
  if (variant === 'dashboard') {
    const status = String(representativeLine.approvalStatus ?? '');
    const name =
      representativeLine.approverName?.trim() ||
      representativeLine.approverJobTitleName?.trim() ||
      `결재 ${representativeLine.stepOrder}차`;
    return (
      <Tooltip
        title={tooltipTitle}
        placement="topLeft"
        color="#ffffff"
        styles={{
          body: {
            border: '1px solid #e2e8f0',
            borderRadius: 10,
            boxShadow: '0 12px 28px rgba(15, 23, 42, 0.14)',
            color: '#0f172a',
            padding: '8px',
          },
        }}
      >
        <span className="wf-approval-dashboard-line-summary" aria-label="결재선">
          <span className={`tw-h-1.5 tw-w-1.5 tw-shrink-0 tw-rounded-full ${lineDotClass(status)}`} />
          <span className="tw-min-w-0 tw-truncate">{name}</span>
          <span className="tw-shrink-0 tw-text-slate-500">{lineStatusLabel(status)}</span>
          {sorted.length > 1 ? (
            <span className="tw-shrink-0 tw-text-slate-400">· {sorted.length}</span>
          ) : null}
        </span>
      </Tooltip>
    );
  }
  const viewportWidthClass = visibleSlots > 0 ? 'tw-w-full' : '';
  return (
    <Tooltip
      title={tooltipTitle}
      placement="topLeft"
      color="#ffffff"
      styles={{
        body: {
          border: '1px solid #e2e8f0',
          borderRadius: 10,
          boxShadow: '0 12px 28px rgba(15, 23, 42, 0.14)',
          color: '#0f172a',
          padding: '8px',
        },
      }}
    >
      <div
        className={clsx('wf-approval-modal-line-strip', viewportWidthClass)}
        aria-label="결재선"
      >
        {sorted.map((line, i) => {
          const name =
            line.approverName?.trim() ||
            line.approverJobTitleName?.trim() ||
            `결재 ${line.stepOrder}차`;
          const st = String(line.approvalStatus);
          return (
            <span key={line.approvalId} className="wf-approval-modal-line-chip">
              <span className={`tw-h-1.5 tw-w-1.5 tw-shrink-0 tw-rounded-full ${lineDotClass(st)}`} />
              <span className="tw-shrink-0 tw-font-semibold tw-text-slate-700">{name}</span>
              <span className="tw-shrink-0 tw-text-slate-500">{lineStatusLabel(st)}</span>
              {i === sorted.length - 1 ? null : <span className="tw-sr-only">, </span>}
            </span>
          );
        })}
      </div>
    </Tooltip>
  );
}
