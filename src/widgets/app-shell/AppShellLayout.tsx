import {
  ApartmentOutlined,
  BellOutlined,
  CalendarOutlined,
  ClockCircleOutlined,
  ControlOutlined,
  DashboardOutlined,
  DollarOutlined,
  FileDoneOutlined,
  FlagOutlined,
  FormOutlined,
  GlobalOutlined,
  LineChartOutlined,
  MailOutlined,
  KeyOutlined,
  MessageOutlined,
  RobotOutlined,
  ScheduleOutlined,
  SettingOutlined,
  ShoppingOutlined,
  StarOutlined,
  TeamOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { Avatar, Badge, Button, Empty, Layout, Menu, Spin, message } from 'antd';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, Outlet, useNavigate, useRouterState } from '@tanstack/react-router';
import { useAuth } from '@/features/auth/useAuth';
import type { EsgConfig } from '@/features/esg/api/esgApi';
import { esgApi } from '@/features/esg/api/esgApi';
import { notificationApi } from '@/features/notification/api/notificationApi';
import { companyApi } from '@/features/organization/api/companyApi';
import { searchApi } from '@/features/search/api/searchApi';
import { memberApi } from '@/features/member/api/memberApi';
import {
  APP_BRAND_NAME,
  APP_MENU_LABEL,
  APP_MENU_PATH_ORDER,
  ESG_MENU_LABEL,
  ESG_MENU_PATH_ORDER,
} from '@/app/locale/app-ko';
import { AppSearchField } from '@/shared/ui/AppSearchField';
import { LogoutGlyphIcon } from '@/shared/ui/icons/LogoutGlyphIcon';

const APP_MENU_ICONS: Record<string, ReactNode> = {
  '/app/dashboard': <DashboardOutlined className="tw-text-lg" />,
  '/app/calendar': <CalendarOutlined className="tw-text-lg" />,
  '/app/members': <TeamOutlined className="tw-text-lg" />,
  '/app/organization': <ApartmentOutlined className="tw-text-lg" />,
  '/app/roles': <KeyOutlined className="tw-text-lg" />,
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

const ESG_MENU_ICONS: Record<string, ReactNode> = {
  '/app/esg': <GlobalOutlined className="tw-text-lg" />,
  '/app/esg/activities': <FormOutlined className="tw-text-lg" />,
  '/app/esg/campaigns': <FlagOutlined className="tw-text-lg" />,
  '/app/esg/shop': <ShoppingOutlined className="tw-text-lg" />,
  '/app/esg/admin': <ControlOutlined className="tw-text-lg" />,
};

function shouldShowEsgMenuItem(path: string, cfg: EsgConfig | null | undefined, isAdmin: boolean): boolean {
  if (path === '/app/esg/admin') {
    return isAdmin;
  }
  if (!cfg || cfg.esgEnabledYn !== 'YES') {
    return false;
  }
  if (path === '/app/esg/campaigns') {
    return cfg.campaignEnabledYn !== 'NO';
  }
  if (path === '/app/esg/shop') {
    return cfg.shopEnabledYn !== 'NO';
  }
  return true;
}

function useAppShellMenuItems() {
  const { status, user } = useAuth();
  const isAdmin = user?.isSystemAdmin === true;
  const { data: esgConfig } = useQuery({
    queryKey: ['esg', 'config'],
    queryFn: () => esgApi.getConfig(),
    enabled: status === 'authenticated',
    retry: false,
    staleTime: 60_000,
  });

  return useMemo(() => {
    const base = APP_MENU_PATH_ORDER.map((path) => ({
      key: path,
      icon: APP_MENU_ICONS[path],
      title: APP_MENU_LABEL[path],
      label: APP_MENU_LABEL[path],
    }));
    const esgPaths = ESG_MENU_PATH_ORDER.filter((p) => shouldShowEsgMenuItem(p, esgConfig ?? null, isAdmin));
    if (esgPaths.length === 0) {
      return base;
    }
    const esgItems = esgPaths.map((path) => ({
      key: path,
      icon: ESG_MENU_ICONS[path],
      title: ESG_MENU_LABEL[path],
      label: ESG_MENU_LABEL[path],
    }));
    const insertAfter = '/app/calendar';
    const idx = base.findIndex((x) => x.key === insertAfter);
    if (idx === -1) {
      return [...base, ...esgItems];
    }
    return [...base.slice(0, idx + 1), ...esgItems, ...base.slice(idx + 1)];
  }, [esgConfig, isAdmin]);
}

const headerGhostIconClass =
  'tw-flex tw-size-11 tw-items-center tw-justify-center tw-rounded-full tw-text-slate-500 tw-transition-colors hover:tw-bg-slate-100 hover:tw-text-slate-800 focus-visible:tw-outline focus-visible:tw-outline-2 focus-visible:tw-outline-offset-2 focus-visible:tw-outline-[#2563EB]';

const aiAssistantCtaClass =
  'tw-inline-flex tw-h-11 tw-shrink-0 tw-items-center tw-gap-2 tw-rounded-full tw-bg-[#2563EB] tw-px-5 tw-text-sm tw-font-bold tw-text-white tw-no-underline tw-shadow-none tw-transition-[filter,transform] hover:tw-brightness-110 hover:tw-no-underline focus-visible:tw-outline focus-visible:tw-outline-2 focus-visible:tw-outline-offset-2 focus-visible:tw-outline-[#2563EB] active:tw-scale-[0.98]';

function formatSessionCountdown(totalSeconds: number): string {
  const s = Math.max(0, totalSeconds);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

function SessionAccessTimer() {
  const { accessExpiresAtMs, refreshAuth } = useAuth();
  const [remainingSec, setRemainingSec] = useState(0);
  const [extending, setExtending] = useState(false);

  useEffect(() => {
    if (accessExpiresAtMs == null) {
      setRemainingSec(0);
      return;
    }
    const tick = () => {
      setRemainingSec(Math.max(0, Math.ceil((accessExpiresAtMs - Date.now()) / 1000)));
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [accessExpiresAtMs]);

  const handleExtend = async () => {
    setExtending(true);
    try {
      const ok = await refreshAuth();
      if (ok) {
        void message.success('세션이 연장되었습니다.');
      } else {
        void message.error('세션 연장에 실패했습니다. 다시 로그인해 주세요.');
      }
    } catch {
      void message.error('세션 연장에 실패했습니다.');
    } finally {
      setExtending(false);
    }
  };

  const warn = remainingSec > 0 && remainingSec <= 5 * 60;

  return (
    <div className="tw-flex tw-items-center tw-gap-2 tw-rounded-full tw-border tw-border-solid tw-border-slate-200 tw-bg-slate-50 tw-px-3 tw-py-1.5">
      <ClockCircleOutlined
        className={warn ? 'tw-text-amber-600' : 'tw-text-slate-500'}
        aria-hidden
      />
      <span
        className={`tw-tabular-nums tw-text-sm tw-font-semibold ${warn ? 'tw-text-amber-700' : 'tw-text-slate-800'}`}
        title="액세스 토큰 만료까지 남은 시간"
      >
        {formatSessionCountdown(remainingSec)}
      </span>
      <Button type="default" size="small" loading={extending} onClick={() => void handleExtend()}>
        연장
      </Button>
    </div>
  );
}

function SiderBrandHeader() {
  const { user, status } = useAuth();
  const { data: companyInfo } = useQuery({
    queryKey: ['company', 'info'],
    queryFn: () => companyApi.getCompanyInfo(),
    enabled: status === 'authenticated',
    staleTime: 60_000,
    retry: false,
  });

  const companyName =
    companyInfo?.companyName?.trim() || user?.companyName?.trim() || APP_BRAND_NAME;

  const logoUrl = (() => {
    if (companyInfo) {
      const u = companyInfo.logoUrl;
      if (typeof u === 'string' && u.trim()) return u.trim();
      return undefined;
    }
    return user?.companyLogoUrl?.trim();
  })();

  const domainLine = companyInfo?.companyDomain?.trim() || 'WORKFORCE HRMS';

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
      <div className="tw-flex tw-min-w-0 tw-flex-col tw-leading-tight">
        <span className="tw-truncate tw-text-base tw-font-semibold tw-tracking-tight tw-text-slate-900" title={companyName}>
          {companyName}
        </span>
        <span
          className="tw-truncate tw-text-[11px] tw-font-semibold tw-uppercase tw-tracking-[0.08em] tw-text-slate-500"
          title={domainLine}
        >
          {domainLine}
        </span>
      </div>
    </div>
  );
}

function SiderUserFooter() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const memberId = user?.id?.trim();

  const { data: member } = useQuery({
    queryKey: ['member', 'detail', memberId],
    queryFn: () => memberApi.detail(memberId!),
    enabled: Boolean(memberId),
  });

  const handleLogout = async () => {
    await logout();
    await navigate({ to: '/login' });
  };

  const name = user?.name?.trim() || '사용자';
  const orgLine =
    member?.organizationName?.trim() ||
    user?.departmentName?.trim() ||
    user?.companyName?.trim() ||
    '—';
  const profileSrc =
    member?.profileUrl?.trim() || user?.profileImageUrl?.trim() || undefined;

  const avatar = (
    <Avatar
      src={profileSrc || undefined}
      alt=""
      icon={!profileSrc ? <UserOutlined className="tw-text-lg tw-text-slate-500" /> : undefined}
      className={
        profileSrc ? '[&_img]:tw-object-cover' : 'tw-bg-slate-100'
      }
      size={40}
    />
  );

  return (
    <div
      className="tw-flex tw-shrink-0 tw-items-center tw-gap-2 tw-px-3 tw-py-3 tw-w-full"
    >
      <Link
        to="/app/me"
        className="tw-flex tw-min-w-0 tw-flex-1 tw-items-center tw-gap-3 tw-no-underline hover:tw-opacity-90"
      >
        {avatar}
        <div className="tw-min-w-0 tw-flex-1">
          <div className="tw-truncate tw-text-sm tw-font-semibold tw-text-slate-900" title={name}>
            {name}
          </div>
          <div className="tw-truncate tw-text-xs tw-text-slate-500" title={orgLine}>
            {orgLine}
          </div>
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

function AppShellHeader() {
  const { status } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const t = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
    }, 250);
    return () => window.clearTimeout(t);
  }, [search]);

  const { data: searchResult, isFetching: searchLoading } = useQuery({
    queryKey: ['search', 'employees', debouncedSearch],
    queryFn: () => searchApi.searchEmployees(debouncedSearch, 0, 10),
    enabled: debouncedSearch.length > 0,
    staleTime: 10_000,
  });

  const list = searchResult?.content ?? [];
  const showSearchPanel = search.trim().length > 0;

  const { data: unreadCount = 0 } = useQuery({
    queryKey: ['notifications', 'unreadCount'],
    queryFn: () => notificationApi.unreadCount(),
    enabled: status === 'authenticated',
    staleTime: 10_000,
  });

  useEffect(() => {
    if (status !== 'authenticated') return;
    const unsubscribe = notificationApi.subscribe(() => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    });
    return unsubscribe;
  }, [queryClient, status]);

  return (
    <Layout.Header className="tw-m-0 tw-flex tw-h-16 tw-shrink-0 tw-items-center tw-gap-3 tw-overflow-visible tw-border-0 tw-border-b tw-border-solid tw-border-slate-200 tw-bg-white tw-px-4 tw-leading-none tw-shadow-none md:tw-gap-6 md:tw-px-7">
      <div className="tw-relative tw-flex tw-min-w-0 tw-flex-1 tw-justify-start">
        <AppSearchField
          className="tw-max-w-2xl"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="메뉴, 동료, 문서 검색..."
          aria-label="메뉴, 동료, 문서 검색"
        />
        {showSearchPanel && (
          <div className="tw-absolute tw-left-0 tw-top-[calc(100%+8px)] tw-z-50 tw-w-full tw-max-w-2xl tw-overflow-hidden tw-rounded-2xl tw-border tw-border-slate-200 tw-bg-white tw-shadow-xl">
            {searchLoading ? (
              <div className="tw-flex tw-items-center tw-justify-center tw-p-6">
                <Spin size="small" />
              </div>
            ) : list.length === 0 ? (
              <div className="tw-p-4">
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="검색 결과가 없습니다." />
              </div>
            ) : (
              <div className="tw-max-h-[420px] tw-overflow-y-auto tw-py-1">
                {list.map((row) => {
                  if (!row.memberId) return null;
                  return (
                    <Link
                      key={row.memberId}
                      to="/app/members/$memberId"
                      params={{ memberId: row.memberId }}
                      className="tw-flex tw-items-start tw-gap-3 tw-px-4 tw-py-3 tw-no-underline hover:tw-bg-slate-50"
                      onClick={() => setSearch('')}
                    >
                      <Avatar
                        src={row.profileUrl || undefined}
                        icon={!row.profileUrl ? <UserOutlined /> : undefined}
                        size={32}
                        className={row.profileUrl ? '[&_img]:tw-object-cover' : 'tw-bg-slate-100'}
                      />
                      <div className="tw-min-w-0 tw-flex-1">
                        <div className="tw-truncate tw-text-sm tw-font-semibold tw-text-slate-900">
                          {row.name ?? '이름 없음'}
                        </div>
                        <div className="tw-truncate tw-text-xs tw-text-slate-500">
                          {row.email ?? '—'}
                        </div>
                        <div className="tw-truncate tw-text-xs tw-text-slate-400">
                          {[row.organizationName, row.jobTitleName, row.memberStatus].filter(Boolean).join(' · ') || '—'}
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="tw-flex tw-shrink-0 tw-items-center tw-gap-2 tw-overflow-visible md:tw-gap-4">
        <SessionAccessTimer />
        <Badge count={unreadCount} color="#EF4444" offset={[-2, 4]} showZero={false}>
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

function menuSelectedKeyFromPath(pathname: string): string[] {
  if (/^\/app\/members\/[^/]+$/.test(pathname)) return ['/app/members'];
  const menuPaths = new Set<string>([...APP_MENU_PATH_ORDER, ...ESG_MENU_PATH_ORDER]);
  if (menuPaths.has(pathname)) return [pathname];
  return [];
}

export function AppShellLayout() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const navigate = useNavigate();
  const menuSelectedKey = useMemo(() => menuSelectedKeyFromPath(pathname), [pathname]);
  const appShellMenuItems = useAppShellMenuItems();

  return (
    <Layout className="tw-flex tw-h-[100dvh] tw-min-h-0 tw-bg-slate-50">
      <Layout.Sider
        theme="light"
        width={248}
        className="tw-h-full tw-min-h-0 tw-overflow-hidden tw-border-0 tw-bg-transparent tw-shadow-none [&_.ant-layout-sider-children]:tw-flex [&_.ant-layout-sider-children]:tw-h-full [&_.ant-layout-sider-children]:tw-w-full [&_.ant-layout-sider-children]:tw-min-h-0 [&_.ant-layout-sider-children]:tw-flex-col"
      >
        <div className="tw-flex tw-h-full tw-w-full tw-min-h-0 tw-max-h-full tw-flex-col tw-bg-white tw-shadow-[inset_-1px_0_0_0_rgba(226,232,240,1)]">
          <div className="tw-flex tw-h-16 tw-w-full tw-shrink-0 tw-items-center tw-gap-2 tw-px-4">
            <SiderBrandHeader />
          </div>
          <div className="wf-scrollbar tw-min-h-0 tw-w-full tw-flex-1 tw-overflow-y-auto tw-overflow-x-hidden">
            <Menu
              className="tw-mt-2 tw-w-full !tw-border-0 tw-bg-transparent tw-px-2 tw-pb-3 [&_.ant-menu-item::after]:tw-hidden"
              theme="light"
              mode="inline"
              selectedKeys={menuSelectedKey}
              items={appShellMenuItems as import('antd').MenuProps['items']}
              onClick={({ key }) => {
                void navigate({ to: key });
              }}
            />
          </div>
          <SiderUserFooter />
        </div>
      </Layout.Sider>
      <Layout className="tw-flex tw-min-h-0 tw-min-w-0 tw-flex-1 tw-flex-col tw-bg-slate-50">
        <AppShellHeader />
        <Layout.Content className="wf-scrollbar tw-min-h-0 tw-flex-1 tw-overflow-y-auto tw-bg-transparent tw-p-6">
          <Outlet />
        </Layout.Content>
      </Layout>
    </Layout>
  );
}
