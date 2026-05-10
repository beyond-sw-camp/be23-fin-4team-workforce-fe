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
  subtitleClassName?: string;
  titleLevel?: 1 | 2 | 3 | 4 | 5;
};

export function AppWorkspacePageTitle({
  eyebrow,
  title,
  subtitle,
  extra,
  className,
  rowClassName,
  subtitleClassName,
  titleLevel = 3,
}: AppWorkspacePageTitleProps) {
  const head = (
    <div className={['tw-space-y-1', className].filter(Boolean).join(' ')}>
      <div className="tw-inline-flex tw-items-center tw-text-[11px] tw-font-semibold tw-uppercase tw-tracking-wide tw-text-slate-400">
        {eyebrow}
      </div>
      <Title
        level={titleLevel}
        className="!tw-m-0 !tw-text-[24px] !tw-font-bold !tw-leading-tight !tw-tracking-normal !tw-text-[#1e3a5f]"
      >
        {title}
      </Title>
      {subtitle ? (
        <Paragraph
          className={[
            '!tw-mb-0 !tw-mt-2 !tw-max-w-2xl !tw-text-sm !tw-leading-relaxed !tw-text-slate-600',
            subtitleClassName,
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {subtitle}
        </Paragraph>
      ) : null}
    </div>
  );

  if (!extra) return head;

  return (
    <div className={['tw-flex tw-flex-col tw-gap-3 md:tw-flex-row md:tw-items-start md:tw-justify-between', rowClassName].filter(Boolean).join(' ')}>
      <div className="tw-min-w-0 tw-flex-1">{head}</div>
      <div className="tw-shrink-0">{extra}</div>
    </div>
  );
}
