import { Outlet } from '@tanstack/react-router';
import { PublicSiteHeader } from '@/pages/public/PublicSiteHeader';

/** 공개 홈 레이아웃: 상단 헤더는 고정하고, 메인만 `<Outlet />`으로 라우팅됩니다. */
export function HomePublicLayout() {
  return (
    <div className="tw-flex tw-min-h-screen tw-flex-col tw-bg-white tw-text-[#0F172A]">
      <PublicSiteHeader />
      <main className="tw-min-h-0 tw-min-w-0 tw-flex-1">
        <Outlet />
      </main>
    </div>
  );
}
