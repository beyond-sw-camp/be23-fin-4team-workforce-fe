import { BankOutlined } from '@ant-design/icons';
import { Link, useNavigate, useRouterState } from '@tanstack/react-router';
import { useCallback, useEffect, useState } from 'react';
import { twMerge } from 'tailwind-merge';
import { AppButton } from '@/shared/ui/AppButton';

function BrandMark({ className }: { className?: string }) {
  return (
    <Link to="/" className={twMerge('tw-flex tw-items-center tw-gap-2 tw-no-underline', className)}>
      <div className="tw-flex tw-h-9 tw-w-9 tw-items-center tw-justify-center tw-rounded-xl tw-bg-[#2563EB] tw-text-white">
        <BankOutlined />
      </div>
      <span className="tw-text-xl tw-font-black tw-tracking-[-0.02em]">
        <span className="tw-text-[#0F172A]">WORK</span>
        <span className="tw-text-[#2563EB]">FORCE</span>
      </span>
    </Link>
  );
}

export function PublicSiteHeader() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [headerSticky, setHeaderSticky] = useState(false);

  const onScroll = useCallback(() => {
    setHeaderSticky(window.scrollY > 48);
  }, []);

  useEffect(() => {
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, [onScroll]);

  const onLandingHero = pathname === '/';
  const transparent = onLandingHero && !headerSticky;

  const goToLogin = () => {
    void navigate({ to: '/login' });
  };

  const navLinkClass = twMerge(
    'tw-hidden tw-min-h-10 tw-select-none tw-items-center tw-justify-center tw-rounded-xl tw-px-3.5 tw-text-[15px] tw-font-semibold tw-leading-none tw-tracking-tight tw-no-underline tw-outline-none tw-transition-colors sm:tw-inline-flex',
    'hover:tw-text-[#2563EB]',
    transparent ? 'tw-text-slate-800 hover:tw-bg-white/30' : 'tw-text-slate-700 hover:tw-bg-slate-900/[0.06]',
    'focus-visible:tw-ring-2 focus-visible:tw-ring-[#2563EB]/35 focus-visible:tw-ring-offset-2',
    transparent ? 'focus-visible:tw-ring-offset-transparent' : 'focus-visible:tw-ring-offset-white',
  );

  return (
    <nav
      className={twMerge(
        'tw-fixed tw-left-0 tw-right-0 tw-top-0 tw-z-[1000] tw-px-5 tw-py-4 tw-transition-all tw-duration-300 md:tw-px-10',
        transparent
          ? 'tw-bg-transparent'
          : 'tw-border-b tw-border-slate-100/80 tw-bg-white/95 tw-shadow-sm tw-backdrop-blur-md',
      )}
    >
      <div className="tw-mx-auto tw-flex tw-max-w-6xl tw-items-center tw-justify-between">
        <BrandMark />
        <div className="tw-flex tw-items-center tw-gap-1 md:tw-gap-2">
          <a href="/#features" className={navLinkClass}>
            기능
          </a>
          <a href="/#faq" className={navLinkClass}>
            FAQ
          </a>
          <AppButton variant="secondary" size="large" className="tw-ml-1 tw-h-10 tw-px-5 md:tw-ml-2" onClick={goToLogin}>
            로그인
          </AppButton>
        </div>
      </div>
    </nav>
  );
}
