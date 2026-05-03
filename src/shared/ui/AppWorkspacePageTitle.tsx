import type { ReactNode } from 'react';
import { Typography } from 'antd';

const { Title, Paragraph } = Typography;

export type AppWorkspacePageTitleProps = {
  eyebrow: string;
  title: ReactNode;
  subtitle?: ReactNode;
  extra?: ReactNode;
  className?: string;
  rowClassName?: string;
  titleLevel?: 1 | 2 | 3 | 4 | 5;
};

export function AppWorkspacePageTitle({
  eyebrow,
  title,
  subtitle,
  extra,
  className,
  rowClassName,
  titleLevel = 3,
}: AppWorkspacePageTitleProps) {
  const head = (
    <div className={['tw-space-y-1', className].filter(Boolean).join(' ')}>
      <div className="tw-inline-flex tw-items-center tw-gap-1.5 tw-text-[11px] tw-font-semibold tw-uppercase tw-tracking-wide tw-text-slate-400">
        <span aria-hidden>•</span>
        {eyebrow}
      </div>
      <Title
        level={titleLevel}
        className="!tw-m-0 !tw-text-[24px] !tw-font-bold !tw-leading-tight !tw-tracking-tight !tw-text-[#1e3a5f] sm:!tw-text-[26px]"
      >
        {title}
      </Title>
      {subtitle ? (
        <Paragraph className="!tw-mb-0 !tw-mt-2 !tw-max-w-2xl !tw-text-[15px] !tw-leading-relaxed !tw-text-slate-600">
          {subtitle}
        </Paragraph>
      ) : null}
    </div>
  );

  if (!extra) return head;

  return (
    <div className={['tw-flex tw-items-center tw-justify-between tw-gap-3', rowClassName].filter(Boolean).join(' ')}>
      <div className="tw-min-w-0 tw-flex-1">{head}</div>
      <div className="tw-shrink-0">{extra}</div>
    </div>
  );
}
