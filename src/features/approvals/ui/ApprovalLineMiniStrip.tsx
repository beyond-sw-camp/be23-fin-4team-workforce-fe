import { CheckCircleFilled, ClockCircleOutlined, CloseCircleOutlined, MinusOutlined } from '@ant-design/icons';
import clsx from 'clsx';
import { Fragment } from 'react';
import { Typography } from 'antd';
import type { ApprovalLine } from '@/features/approvals/api/approvalRequestApi';

function lineStatusLabel(status: string): string {
  const s = String(status).toUpperCase();
  if (s === 'APPROVED') return '승인';
  if (s === 'REJECTED') return '반려';
  if (s === 'PENDING') return '검토 중';
  if (s === 'CANCELED') return '취소';
  return '대기';
}

function lineCardShellClass(status: string): string {
  const s = String(status).toUpperCase();
  if (s === 'APPROVED') return 'tw-border-blue-200 tw-bg-blue-50/95';
  if (s === 'REJECTED') return 'tw-border-rose-200 tw-bg-rose-50/95';
  if (s === 'PENDING') return 'tw-border-amber-200 tw-bg-amber-50/95';
  if (s === 'CANCELED') return 'tw-border-slate-200 tw-bg-slate-100/90';
  return 'tw-border-slate-200 tw-bg-slate-50/95';
}

function lineTextClass(status: string): string {
  const s = String(status).toUpperCase();
  if (s === 'APPROVED') return 'tw-text-blue-700';
  if (s === 'REJECTED') return 'tw-text-rose-700';
  if (s === 'PENDING') return 'tw-text-amber-900';
  if (s === 'CANCELED') return 'tw-text-slate-600';
  return 'tw-text-slate-500';
}

function LineStepIcon({ status }: { status: string }) {
  const s = String(status).toUpperCase();
  if (s === 'APPROVED') return <CheckCircleFilled className="!tw-text-lg tw-text-blue-500" />;
  if (s === 'REJECTED') return <CloseCircleOutlined className="!tw-text-lg tw-text-rose-500" />;
  if (s === 'PENDING') return <ClockCircleOutlined className="!tw-text-lg tw-text-amber-500" />;
  if (s === 'CANCELED') return <MinusOutlined className="!tw-text-lg tw-text-slate-400" />;
  return <MinusOutlined className="!tw-text-lg tw-text-slate-400" />;
}

/** 목록·검색 테이블용 가로 결재선 요약 (내 결재함 스타일과 동일 톤) */
export function ApprovalLineMiniStrip({
  lines,
  visibleSlots = 3,
}: {
  lines: ApprovalLine[];
  /** 0이면 가로 스크롤만, 양수면 최소 너비 고정 */
  visibleSlots?: number;
}) {
  const sorted = [...lines].sort((a, b) => a.stepOrder - b.stepOrder);
  if (sorted.length === 0) {
    return (
      <Typography.Text type="secondary" className="!tw-text-xs">
        —
      </Typography.Text>
    );
  }
  const viewportWidthClass = visibleSlots > 0 ? 'tw-w-[21rem]' : '';
  return (
    <div className={clsx('tw-min-w-0 tw-overflow-x-auto wf-scrollbar tw-pr-0.5', viewportWidthClass)} aria-label="결재선">
      <div className="tw-inline-flex tw-min-w-max tw-items-stretch tw-gap-1">
        {sorted.map((line, i) => {
          const name =
            line.approverName?.trim() ||
            line.approverJobTitleName?.trim() ||
            `결재 ${line.stepOrder}차`;
          const st = String(line.approvalStatus);
          const title = `${name} (${st})`;
          return (
            <Fragment key={line.approvalId}>
              {i > 0 ? (
                <span
                  className="tw-flex tw-shrink-0 tw-items-center tw-px-0.5 tw-text-sm tw-font-light tw-text-slate-300"
                  aria-hidden
                >
                  -
                </span>
              ) : null}
              <div
                title={title}
                className={clsx(
                  'tw-flex tw-h-full tw-min-w-[5.25rem] tw-max-w-[6.5rem] tw-shrink-0 tw-items-center tw-gap-1.5 tw-rounded-lg tw-border tw-px-2 tw-py-1',
                  lineCardShellClass(st),
                )}
              >
                <span className="tw-flex tw-flex-shrink-0 tw-items-center tw-leading-none">
                  <LineStepIcon status={st} />
                </span>
                <div className="tw-min-w-0 tw-flex-1">
                  <div
                    className={clsx(
                      'tw-truncate tw-text-[11px] tw-font-semibold tw-leading-tight',
                      lineTextClass(st),
                    )}
                  >
                    {name}
                  </div>
                  <div
                    className={clsx(
                      'tw-truncate tw-text-[10px] tw-font-medium tw-leading-tight tw-opacity-95',
                      lineTextClass(st),
                    )}
                  >
                    {lineStatusLabel(st)}
                  </div>
                </div>
              </div>
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}
