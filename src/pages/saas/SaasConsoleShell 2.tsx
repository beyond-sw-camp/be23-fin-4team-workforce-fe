import { LogoutOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { Typography } from 'antd';
import type { ReactNode } from 'react';
import clsx from 'clsx';
import { useAuth } from '@/features/auth/useAuth';
import brandLogo from '@/shared/assets/brand/logo.png';
import { AppButton } from '@/shared/ui/AppButton';
import { SessionAccessTimer } from '@/widgets/app-shell/SessionAccessTimer';

type SaasConsoleShellProps = {
  children: ReactNode;
  contentClassName?: string;
};

export function SaasConsoleShell({ children, contentClassName }: SaasConsoleShellProps) {
  const { logout } = useAuth();

  const handleLogout = async () => {
    try {
      await logout();
    } finally {
      window.location.replace('/login');
    }
  };

  return (
    <div className="wf-scrollbar tw-h-[100dvh] tw-min-h-0 tw-overflow-y-auto tw-bg-slate-50 tw-text-slate-700">
      <header className="tw-sticky tw-top-0 tw-z-10 tw-flex tw-h-16 tw-items-center tw-border-b tw-border-slate-200 tw-bg-white tw-px-4 tw-shadow-none md:tw-px-7">
        <div className="tw-mx-auto tw-flex tw-w-full tw-max-w-6xl tw-items-center tw-justify-between">
          <div className="tw-flex tw-items-center tw-gap-3">
            <div className="tw-flex tw-items-center tw-gap-2">
              <img src={brandLogo} alt="WORKFORCE HR MANAGEMENT" className="tw-h-9 tw-w-auto" />
              <span className="tw-h-3 tw-w-px tw-bg-slate-300" />
              <Typography.Text className="tw-text-sm tw-font-semibold tw-text-slate-500">
                운영 콘솔
              </Typography.Text>
            </div>
          </div>

          <div className="tw-flex tw-items-center tw-gap-2">
            <div className="tw-hidden md:tw-block">
              <SessionAccessTimer size="compact" />
            </div>
            <div className="tw-hidden tw-h-9 tw-items-center tw-gap-1.5 tw-rounded-xl tw-border tw-border-solid tw-border-slate-200 tw-bg-white tw-px-3 tw-shadow-[0_1px_2px_rgba(15,23,42,0.04)] sm:tw-flex">
              <SafetyCertificateOutlined className="tw-text-sm tw-text-[#1e3a5f]" />
              <span className="tw-text-xs tw-font-semibold tw-text-slate-700">Super Admin</span>
            </div>
            <AppButton
              variant="secondary"
              icon={<LogoutOutlined />}
              onClick={() => void handleLogout()}
              className="tw-h-9 tw-rounded-xl tw-px-3 tw-text-xs tw-font-semibold tw-shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
            >
              로그아웃
            </AppButton>
          </div>
        </div>
      </header>

      <main
        className={clsx(
          'tw-mx-auto tw-w-full tw-max-w-6xl tw-px-6 tw-pb-40 tw-pt-6',
          contentClassName,
        )}
      >
        {children}
      </main>
    </div>
  );
}
