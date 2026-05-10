/**
 * 구성원 화면 검색·직원 등록 등, 일정등록 CTA와 동일한 네이비 톤.
 * AppButton primary는 `!bg-[#2563EB]`와 병합 시 tailwind-merge가 arbitrary bg를 한 덩어리로 못 묶어 파란색이 남을 수 있어, 이 클래스는 antd Button에 직접 붙인다.
 */
export const membersCtaButtonClass =
  '!tw-h-10 !tw-min-h-10 !tw-rounded-xl !tw-border-0 !tw-bg-[#1e3a5f] !tw-font-semibold !tw-shadow-none hover:!tw-bg-[#152a45] disabled:!tw-cursor-not-allowed disabled:!tw-border disabled:!tw-border-slate-200 disabled:!tw-bg-slate-100 disabled:!tw-text-slate-500 disabled:!tw-opacity-100 disabled:!tw-shadow-none disabled:hover:!tw-bg-slate-100 disabled:hover:!tw-text-slate-500';
