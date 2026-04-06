import {
  ApartmentOutlined,
  BellOutlined,
  ClockCircleOutlined,
  DashboardOutlined,
  DollarOutlined,
  FileDoneOutlined,
  LineChartOutlined,
  MailOutlined,
  MessageOutlined,
  RobotOutlined,
  ScheduleOutlined,
  SearchOutlined,
  SettingOutlined,
  StarOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { Avatar, Badge, Input, Layout, Menu } from 'antd';
import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { Link, Outlet, useNavigate, useRouterState } from '@tanstack/react-router';
import { useAuth } from '@/features/auth/useAuth';
import { APP_BRAND_NAME, APP_MENU_LABEL, APP_MENU_PATH_ORDER, appHeaderTitleFromPath } from '@/app/locale/app-ko';
import { LogoutGlyphIcon } from '@/shared/ui/icons/LogoutGlyphIcon';

const APP_MENU_ICONS: Record<string, ReactNode> = {
  '/app/dashboard': <DashboardOutlined className="tw-text-lg" />,
  '/app/members': <TeamOutlined className="tw-text-lg" />,
  '/app/organization': <ApartmentOutlined className="tw-text-lg" />,
  '/app/attendance': <ClockCircleOutlined className="tw-text-lg" />,
  '/app/leave': <ScheduleOutlined className="tw-text-lg" />,
  '/app/approvals': <FileDoneOutlined className="tw-text-lg" />,
  '/app/payroll': <DollarOutlined className="tw-text-lg" />,
  '/app/mail': <MailOutlined className="tw-text-lg" />,
  '/app/notifications': <BellOutlined className="tw-text-lg" />,
  '/app/performance': <LineChartOutlined className="tw-text-lg" />,
  '/app/evaluations': <StarOutlined className="tw-text-lg" />,
  '/app/ai-assistant': <RobotOutlined className="tw-text-lg" />,
  '/app/settings': <SettingOutlined className="tw-text-lg" />,
};

const appShellMenuItems = APP_MENU_PATH_ORDER.map((path) => ({
  key: path,
  icon: APP_MENU_ICONS[path],
  title: APP_MENU_LABEL[path],
  label: APP_MENU_LABEL[path],
}));

const headerGhostIconClass =
  'tw-flex tw-size-11 tw-items-center tw-justify-center tw-rounded-full tw-text-slate-500 tw-transition-colors hover:tw-bg-slate-100 hover:tw-text-slate-800 focus-visible:tw-outline focus-visible:tw-outline-2 focus-visible:tw-outline-offset-2 focus-visible:tw-outline-[#2563EB]';

const aiAssistantCtaClass =
  'tw-inline-flex tw-h-11 tw-shrink-0 tw-items-center tw-gap-2 tw-rounded-full tw-bg-[#2563EB] tw-px-5 tw-text-sm tw-font-bold tw-text-white tw-no-underline tw-shadow-none tw-transition-[filter,transform] hover:tw-brightness-110 hover:tw-no-underline focus-visible:tw-outline focus-visible:tw-outline-2 focus-visible:tw-outline-offset-2 focus-visible:tw-outline-[#2563EB] active:tw-scale-[0.98]';

function SiderBrandHeader() {
  const { user } = useAuth();
  const companyName = user?.companyName?.trim() || APP_BRAND_NAME;
  const logoUrl = user?.companyLogoUrl?.trim();
  const initial = (companyName[0] ?? 'W').toUpperCase();

  return (
    <div className="tw-flex tw-min-w-0 tw-flex-1 tw-items-center tw-gap-2">
      <Avatar
        src={logoUrl || undefined}
        alt=""
        shape="square"
        size={36}
        className={
          logoUrl
            ? 'tw-shrink-0 tw-rounded-xl tw-bg-white [&_img]:tw-h-full [&_img]:tw-w-full [&_img]:tw-object-contain'
            : 'tw-shrink-0 tw-rounded-xl tw-bg-[#2563EB] tw-text-sm tw-font-bold tw-text-white'
        }
      >
        {initial}
      </Avatar>
      <span className="tw-truncate tw-text-base tw-font-semibold tw-tracking-tight tw-text-slate-900" title={companyName}>
        {companyName}
      </span>
    </div>
  );
}

function SiderUserFooter() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    await navigate({ to: '/login' });
  };

  const name = user?.name?.trim() || '사용자';
  const line1 = [name, user?.jobTitle?.trim()].filter(Boolean).join(' ');
  const dept = user?.departmentName?.trim();
  const avatarLetter = name.slice(0, 1);
  const profileSrc = user?.profileImageUrl?.trim();

  const avatar = (
    <Avatar
      src={profileSrc || undefined}
      alt=""
      className={
        profileSrc ? '[&_img]:tw-object-cover' : 'tw-bg-slate-100 tw-text-sm tw-font-semibold tw-text-[#2563EB]'
      }
      size={40}
    >
      {avatarLetter}
    </Avatar>
  );

  return (
    <div
      className="tw-flex tw-shrink-0 tw-items-center tw-gap-2 tw-px-3 tw-py-3 tw-w-full"
    >
      <Link
        to="/app/settings"
        className="tw-flex tw-min-w-0 tw-flex-1 tw-items-center tw-gap-3 tw-no-underline hover:tw-opacity-90"
      >
        {avatar}
        <div className="tw-min-w-0 tw-flex-1">
          <div className="tw-truncate tw-text-sm tw-font-semibold tw-text-slate-900">{line1}</div>
          <div className="tw-truncate tw-text-xs tw-text-slate-500">{dept || '—'}</div>
        </div>
      </Link>
      <button
        type="button"
        onClick={() => void handleLogout()}
        className="group tw-flex tw-size-9 tw-shrink-0 tw-items-center tw-justify-center tw-rounded-lg tw-border-0 tw-bg-transparent tw-transition-colors hover:tw-bg-slate-100"
        aria-label="로그아웃"
      >
        <LogoutGlyphIcon className="tw-size-[18px] tw-text-slate-400 tw-transition-colors group-hover:tw-text-slate-600" />
      </button>
    </div>
  );
}

function AppShellHeader({ pathname }: { pathname: string }) {
  const [search, setSearch] = useState('');

  return (
    <Layout.Header className="tw-m-0 tw-flex tw-h-16 tw-shrink-0 tw-items-center tw-gap-3 tw-overflow-visible tw-border-0 tw-border-b tw-border-solid tw-border-slate-200 tw-bg-white tw-px-4 tw-leading-none tw-shadow-none md:tw-gap-6 md:tw-px-7">
      <span
        className="tw-hidden tw-min-w-0 tw-shrink-0 tw-truncate tw-text-sm tw-font-medium tw-text-slate-500 sm:tw-block sm:tw-max-w-[7rem] md:tw-max-w-[9.5rem]"
        title={appHeaderTitleFromPath(pathname)}
      >
        {appHeaderTitleFromPath(pathname)}
      </span>

      <div className="tw-flex tw-min-w-0 tw-flex-1 tw-justify-end">
        <Input
          allowClear
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="메뉴, 동료, 문서 검색..."
          aria-label="메뉴, 동료, 문서 검색"
          variant="borderless"
          size="large"
          prefix={<SearchOutlined className="tw-text-[15px] tw-text-slate-400" />}
          className="tw-h-11 tw-max-w-2xl tw-w-full tw-rounded-full !tw-border-0 !tw-bg-transparent tw-px-3 tw-shadow-none hover:!tw-bg-slate-50 focus-within:!tw-bg-slate-50 [&_.ant-input-affix-wrapper]:!tw-border-0 [&_.ant-input-affix-wrapper]:!tw-shadow-none [&_.ant-input-affix-wrapper-focused]:!tw-shadow-none [&_.ant-input]:!tw-bg-transparent [&_.ant-input]:tw-placeholder:text-slate-400"
        />
      </div>

      <div className="tw-flex tw-shrink-0 tw-items-center tw-gap-2 tw-overflow-visible md:tw-gap-5">
        <Badge dot color="#EF4444" offset={[-2, 4]}>
          <Link to="/app/notifications" className={headerGhostIconClass} aria-label="알림">
            <BellOutlined className="tw-text-[20px]" />
          </Link>
        </Badge>

        <Link to="/app/ai-assistant" className={`${aiAssistantCtaClass} tw-px-4 sm:tw-px-5`} aria-label="AI 비서">
          <MessageOutlined className="tw-text-base" />
          <span className="tw-hidden sm:tw-inline">AI 비서</span>
        </Link>
      </div>
    </Layout.Header>
  );
}

function menuSelectedKeyFromPath(pathname: string): string {
  if (/^\/app\/members\/[^/]+$/.test(pathname)) return '/app/members';
  return pathname;
}

export function AppShellLayout() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const navigate = useNavigate();
  const menuSelectedKey = useMemo(() => menuSelectedKeyFromPath(pathname), [pathname]);

  return (
    <Layout className="tw-flex tw-h-[100dvh] tw-min-h-0 tw-bg-slate-50">
      <Layout.Sider
        theme="light"
        width={248}
        className="tw-h-full tw-min-h-0 tw-overflow-hidden tw-border-0 tw-bg-transparent tw-shadow-none [&_.ant-layout-sider-children]:tw-flex [&_.ant-layout-sider-children]:tw-h-full [&_.ant-layout-sider-children]:tw-w-full [&_.ant-layout-sider-children]:tw-min-h-0 [&_.ant-layout-sider-children]:tw-flex-col"
      >
        <div className="tw-flex tw-h-full tw-w-full tw-min-h-0 tw-max-h-full tw-flex-col tw-bg-white">
          <div className="tw-flex tw-h-16 tw-w-full tw-shrink-0 tw-items-center tw-gap-2 tw-px-4">
            <SiderBrandHeader />
          </div>
          <div className="tw-min-h-0 tw-w-full tw-flex-1 tw-overflow-y-auto tw-overflow-x-hidden">
            <Menu
              className="tw-mt-2 tw-w-full !tw-border-0 tw-bg-transparent tw-px-2 tw-pb-3 [&_.ant-menu-item::after]:tw-hidden"
              theme="light"
              mode="inline"
              selectedKeys={[menuSelectedKey]}
              items={appShellMenuItems}
              onClick={({ key }) => {
                void navigate({ to: key });
              }}
            />
          </div>
          <SiderUserFooter />
        </div>
      </Layout.Sider>
      <Layout className="tw-flex tw-min-h-0 tw-min-w-0 tw-flex-1 tw-flex-col tw-bg-slate-50">
        <AppShellHeader pathname={pathname} />
        <Layout.Content className="tw-min-h-0 tw-flex-1 tw-overflow-y-auto tw-bg-transparent tw-p-6">
          <Outlet />
        </Layout.Content>
      </Layout>
    </Layout>
  );
}
