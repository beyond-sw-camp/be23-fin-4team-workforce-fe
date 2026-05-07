import type { ReactNode } from 'react';

type AppTabLabelProps = {
  children: ReactNode;
  count?: ReactNode;
  suffix?: ReactNode;
  showZero?: boolean;
  className?: string;
};

export function AppTabLabel({
  children,
  count,
  suffix,
  showZero = true,
  className,
}: AppTabLabelProps) {
  const shouldShowCount = count !== undefined && count !== null && (showZero || Number(count) !== 0);

  return (
    <span className={['wf-tab-label', className].filter(Boolean).join(' ')}>
      <span className="wf-tab-label-text">{children}</span>
      {shouldShowCount ? <span className="wf-tab-label-badge">{count}</span> : null}
      {suffix ? <span className="wf-tab-label-suffix">{suffix}</span> : null}
    </span>
  );
}
