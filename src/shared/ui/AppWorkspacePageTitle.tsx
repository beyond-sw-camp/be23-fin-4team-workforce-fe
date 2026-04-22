import type { ReactNode } from 'react';
import { Typography } from 'antd';

const { Title, Paragraph } = Typography;

const eyebrowClass =
  'tw-inline-flex tw-items-center tw-gap-1.5 tw-text-[11px] tw-font-semibold tw-uppercase tw-tracking-wide tw-text-slate-400';

const titleClassBase =
  '!tw-m-0 !tw-text-[24px] !tw-font-bold !tw-leading-tight !tw-tracking-tight !tw-text-[#1e3a5f] sm:!tw-text-[26px]';

export type AppWorkspacePageTitleProps = {
  /** 상단 영문 라인(대문자 톤) — 도메인별 짧은 문구 */
  eyebrow: string;
  /** 메인 페이지 제목 */
  title: ReactNode;
  /** 제목 아래 보조 설명(선택) */
  subtitle?: ReactNode;
  /** 우측 액션(버튼 등, 선택) */
  extra?: ReactNode;
  /** 최외곽 래퍼 — 그리드 `lg:tw-col-span-3` 등 */
  className?: string;
  /** `extra`가 있을 때만: 행 래퍼에 추가 클래스 */
  rowClassName?: string;
  titleLevel?: 1 | 2 | 3 | 4 | 5;
};

/**
 * 탤런트 허브(성과·평가·미팅) 공통 — ✦ + 영문 아이라인 + 메인 타이틀.
 */
export function AppWorkspacePageTitle({
  eyebrow,
  title,
  subtitle,
  extra,
  className,
  rowClassName,
  titleLevel = 3,
}: AppWorkspacePageTitleProps) {
  const titleMargin = subtitle ? '!tw-mb-2' : '!tw-mb-3';

  const head = (
    <div className={['tw-space-y-1', className].filter(Boolean).join(' ')}>
      <div className={eyebrowClass}>
        <span aria-hidden>✦</span>
        {eyebrow}
      </div>
      <Title level={titleLevel} className={`${titleClassBase} ${titleMargin}`}>
        {title}
      </Title>
      {subtitle ? (
        <Paragraph className="!tw-mb-0 !tw-max-w-2xl !tw-text-[15px] !tw-leading-relaxed !tw-text-slate-600">
          {subtitle}
        </Paragraph>
      ) : null}
    </div>
  );

  if (extra) {
    return (
      <div className={['tw-flex tw-items-start tw-justify-between tw-gap-3', rowClassName].filter(Boolean).join(' ')}>
        <div className="tw-min-w-0 tw-flex-1">{head}</div>
        <div className="tw-shrink-0">{extra}</div>
      </div>
    );
  }

  return head;
}
