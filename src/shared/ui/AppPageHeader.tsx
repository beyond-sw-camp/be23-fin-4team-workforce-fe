import { Typography } from 'antd';

type Props = {
  title: string;
  subtitle?: string;
  extra?: React.ReactNode;
  eyebrow?: string;
};

export function AppPageHeader({ title, subtitle, extra, eyebrow }: Props) {
  return (
    <div className="tw-mb-5 tw-flex tw-flex-col tw-gap-3 md:tw-flex-row md:tw-items-start md:tw-justify-between">
      <div className="tw-min-w-0 tw-space-y-1">
        {eyebrow ? (
          <div className="tw-text-[11px] tw-font-semibold tw-uppercase tw-tracking-wide tw-text-slate-400">
            {eyebrow}
          </div>
        ) : null}
        <Typography.Title
          level={3}
          className="!tw-m-0 !tw-text-[24px] !tw-font-bold !tw-leading-tight !tw-tracking-normal !tw-text-[#1e3a5f]"
        >
          {title}
        </Typography.Title>
        {subtitle ? <div className="tw-mt-2 tw-max-w-2xl tw-text-sm tw-leading-relaxed tw-text-slate-600">{subtitle}</div> : null}
      </div>
      {extra ? <div className="tw-shrink-0">{extra}</div> : null}
    </div>
  );
}
