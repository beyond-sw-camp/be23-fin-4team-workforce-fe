import { Pagination } from 'antd';
import type { PaginationProps } from 'antd';
import { twMerge } from 'tailwind-merge';

/** `showTotal`에 넘기기 — 성과/목록 공통 카피 */
export function appPaginationShowTotalLabel(total: number, range: [number, number]) {
  return (
    <>
      <span className="tw-text-slate-400">보이는 범위 </span>
      <span className="tw-tabular-nums tw-text-slate-600">
        {range[0]}–{range[1]}
      </span>
      <span className="tw-text-slate-400"> · 전체 </span>
      <span className="tw-font-semibold tw-tabular-nums tw-text-[#1e3a5f]">{total}</span>
      <span className="tw-text-slate-400">건</span>
    </>
  );
}

/**
 * Ant Design Pagination 래퍼 — 성과·목록 화면 공통 톤
 * (라운드 카드 트레이, 네이비 활성, 부드러운 호버/비활성, 모바일에서 총 건수 단독 행)
 */
const innerStyles =
  '[&_.ant-pagination]:!tw-mb-0 [&_.ant-pagination]:!tw-flex [&_.ant-pagination]:!tw-w-full [&_.ant-pagination]:!tw-flex-wrap [&_.ant-pagination]:!tw-items-center [&_.ant-pagination]:!tw-gap-x-1.5 [&_.ant-pagination]:!tw-gap-y-2 ' +
  '[&_.ant-pagination-total-text]:!tw-basis-full [&_.ant-pagination-total-text]:!tw-text-center [&_.ant-pagination-total-text]:!tw-text-[13px] [&_.ant-pagination-total-text]:!tw-font-medium [&_.ant-pagination-total-text]:!tw-tracking-tight [&_.ant-pagination-total-text]:!tw-text-slate-500 sm:[&_.ant-pagination-total-text]:!tw-basis-auto sm:[&_.ant-pagination-total-text]:!tw-mr-auto sm:[&_.ant-pagination-total-text]:!tw-text-left ' +
  '[&_.ant-pagination-item]:!tw-m-0 [&_.ant-pagination-item]:!tw-min-w-9 [&_.ant-pagination-item]:!tw-h-9 [&_.ant-pagination-item]:!tw-leading-[36px] [&_.ant-pagination-item]:!tw-rounded-xl [&_.ant-pagination-item]:!tw-border [&_.ant-pagination-item]:!tw-border-slate-200/90 [&_.ant-pagination-item]:!tw-bg-white [&_.ant-pagination-item]:!tw-transition-colors [&_.ant-pagination-item]:!tw-duration-150 [&_.ant-pagination-item_a]:!tw-text-slate-700 [&_.ant-pagination-item_a]:!tw-font-medium [&_.ant-pagination-item_a]:!tw-px-0 ' +
  '[&_.ant-pagination-item:not(.ant-pagination-item-active):hover]:!tw-border-slate-300 [&_.ant-pagination-item:not(.ant-pagination-item-active):hover]:!tw-bg-slate-50/90 ' +
  '[&_.ant-pagination-item-active]:!tw-border-[#1e3a5f] [&_.ant-pagination-item-active]:!tw-bg-[#1e3a5f] [&_.ant-pagination-item-active]:!tw-shadow-[0_2px_8px_rgba(30,58,95,0.2)] [&_.ant-pagination-item-active_a]:!tw-text-white ' +
  '[&_.ant-pagination-item-active:hover]:!tw-border-[#152a45] [&_.ant-pagination-item-active:hover]:!tw-bg-[#152a45] ' +
  '[&_.ant-pagination-prev]:!tw-m-0 [&_.ant-pagination-next]:!tw-m-0 ' +
  '[&_.ant-pagination-prev_.ant-pagination-item-link]:!tw-rounded-xl [&_.ant-pagination-next_.ant-pagination-item-link]:!tw-rounded-xl [&_.ant-pagination-jump-prev]:!tw-rounded-xl [&_.ant-pagination-jump-next]:!tw-rounded-xl ' +
  '[&_.ant-pagination-item-link]:!tw-flex [&_.ant-pagination-item-link]:!tw-size-9 [&_.ant-pagination-item-link]:!tw-items-center [&_.ant-pagination-item-link]:!tw-justify-center [&_.ant-pagination-item-link]:!tw-border [&_.ant-pagination-item-link]:!tw-border-slate-200/90 [&_.ant-pagination-item-link]:!tw-bg-white [&_.ant-pagination-item-link]:!tw-text-slate-600 [&_.ant-pagination-item-link]:!tw-transition-colors [&_.ant-pagination-item-link]:!tw-duration-150 [&_.ant-pagination-item-link]:hover:!tw-border-slate-300 [&_.ant-pagination-item-link]:hover:!tw-bg-slate-50/90 [&_.ant-pagination-item-link]:hover:!tw-text-slate-900 ' +
  '[&_.ant-pagination-disabled]:!tw-opacity-100 [&_.ant-pagination-jump-prev.ant-pagination-disabled]:!tw-opacity-100 [&_.ant-pagination-jump-next.ant-pagination-disabled]:!tw-opacity-100 ' +
  '[&_.ant-pagination-disabled_.ant-pagination-item-link]:!tw-cursor-not-allowed [&_.ant-pagination-disabled_.ant-pagination-item-link]:!tw-border-slate-100 [&_.ant-pagination-disabled_.ant-pagination-item-link]:!tw-bg-slate-50/50 [&_.ant-pagination-disabled_.ant-pagination-item-link]:!tw-text-slate-300 ' +
  '[&_.ant-pagination-options]:!tw-m-0 [&_.ant-pagination-options]:!tw-flex [&_.ant-pagination-options]:!tw-items-center sm:[&_.ant-pagination-options]:!tw-ml-1 ' +
  '[&_.ant-pagination-options_.ant-select]:!tw-m-0 [&_.ant-pagination-options_.ant-select]:!tw-min-w-[5.5rem] ' +
  '[&_.ant-pagination-options_.ant-select_.ant-select-selector]:!tw-h-9 [&_.ant-pagination-options_.ant-select_.ant-select-selector]:!tw-min-h-9 [&_.ant-pagination-options_.ant-select_.ant-select-selector]:!tw-rounded-xl [&_.ant-pagination-options_.ant-select_.ant-select-selector]:!tw-border-slate-200/90 [&_.ant-pagination-options_.ant-select_.ant-select-selector]:!tw-bg-white [&_.ant-pagination-options_.ant-select_.ant-select-selector]:!tw-px-3 [&_.ant-pagination-options_.ant-select_.ant-select-selector]:!tw-text-[13px] [&_.ant-pagination-options_.ant-select_.ant-select-selector]:!tw-font-medium [&_.ant-pagination-options_.ant-select_.ant-select-selector]:!tw-text-slate-700 [&_.ant-pagination-options_.ant-select_.ant-select-selector]:!tw-shadow-sm [&_.ant-pagination-options_.ant-select_.ant-select-selector]:!tw-transition-colors [&_.ant-pagination-options_.ant-select_.ant-select-selector]:!tw-duration-150 ' +
  '[&_.ant-pagination-options_.ant-select:hover_.ant-select-selector]:!tw-border-slate-300 [&_.ant-pagination-options_.ant-select:hover_.ant-select-selector]:!tw-bg-slate-50/80';

export type AppPaginationProps = PaginationProps & {
  /** 바깥 카드(트레이)에만 적용 */
  wrapClassName?: string;
};

export function AppPagination({ className, wrapClassName, ...props }: AppPaginationProps) {
  return (
    <div
      className={twMerge(
        'tw-w-full tw-rounded-2xl tw-border tw-border-slate-200/80 tw-bg-gradient-to-b tw-from-white tw-to-[#f8fafc] tw-px-3 tw-py-3 tw-shadow-[0_1px_3px_rgba(15,23,42,0.06),inset_0_1px_0_rgba(255,255,255,0.9)] sm:tw-px-5',
        wrapClassName,
      )}
    >
      <Pagination {...props} className={twMerge(innerStyles, className)} />
    </div>
  );
}
