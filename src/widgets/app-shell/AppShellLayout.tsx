import {
    ApartmentOutlined,
    BellOutlined,
    CalendarOutlined,
    CloseOutlined,
    ClockCircleOutlined,
    ControlOutlined,
    DashboardOutlined,
    DollarOutlined,
    EyeOutlined,
    FileDoneOutlined,
    FileTextOutlined,
    FlagOutlined,
    FolderOpenOutlined,
    FormOutlined,
    GlobalOutlined,
    LineChartOutlined,
    PieChartOutlined,
    MoreOutlined,
    MessageOutlined,
    KeyOutlined,
    PartitionOutlined,
    PoweroffOutlined,
    ProjectOutlined,
    RobotOutlined,
    ScheduleOutlined,
    SafetyCertificateOutlined,
    SettingOutlined,
    ShoppingOutlined,
    StarOutlined,
    TeamOutlined,
    UserOutlined,
    VideoCameraOutlined,
} from '@ant-design/icons';
import {Avatar, Badge, Button, Empty, Layout, Menu, Popover, Spin, Tooltip, message} from 'antd';
import type {MenuProps} from 'antd';
import MenuContext from 'antd/es/menu/MenuContext';
import type {ReactNode} from 'react';
import {useContext, useEffect, useMemo, useState} from 'react';
import {useQuery, useQueryClient} from '@tanstack/react-query';
import {Link, Outlet, useNavigate, useRouterState} from '@tanstack/react-router';
import {useAuth} from '@/features/auth/useAuth';
import {usePermissions} from '@/features/permissions/usePermissionsHook';
import type {EsgConfig} from '@/features/esg/api/esgApi';
import {esgApi} from '@/features/esg/api/esgApi';
import {memberChatApi} from '@/features/member-chat/api/memberChatApi';
import {notificationApi} from '@/features/notification/api/notificationApi';
import {companyApi} from '@/features/organization/api/companyApi';
import {searchApi} from '@/features/search/api/searchApi';
import {organizationApi} from '@/features/organization/api/organizationApi';
import {memberApi} from '@/features/member/api/memberApi';
import {
    APP_BRAND_NAME,
    APP_MENU_ESG_GROUP_LABEL,
    APP_MENU_LABEL,
    APP_MENU_ORG_CHART_LABEL,
    APP_MENU_ORG_CHART_SIDEBAR_KEY,
    APP_MENU_ORG_HR_GROUP_LABEL,
    APP_MENU_PATH_ORDER,
    APP_MENU_TALENT_HUB_LABEL,
    ESG_MENU_LABEL,
    ESG_MENU_PATH_ORDER,
} from '@/app/locale/app-ko';
import {
    APPROVAL_GUIDE_BOX_LABEL,
    APPROVAL_GUIDE_SECTION_ITEMS,
    APPROVAL_GUIDE_SECTION_LABEL,
    APPROVAL_GUIDE_SECTION_ORDER,
    approvalShellMenuItemKeyFromLocation,
    approvalShellSectionOpenKeyFromLocation,
    getApprovalShellSiderEntries,
} from '@/features/approvals/lib/approvalGuideNav';
import {AppSearchField} from '@/shared/ui/AppSearchField';
import {AiChatbotFab} from '@/widgets/app-shell/AiChatbotFab';
import {OrgChartModal} from '@/widgets/organization/OrgChartModal';
import {HeaderSearchMemberDetailModal} from '@/widgets/app-shell/HeaderSearchMemberDetailModal';
import {MemberChatModal} from '@/widgets/app-shell/MemberChatModal';
import {
    APPROVAL_SIDEBAR_ROOT_KEY,
    buildApprovalMenuGroupChildren,
} from '@/widgets/app-shell/approvalSiderMenu';

/** 왼쪽 날개 패널 + 본문 — 접기·펼치기 동일 아이콘(선형·둥근 테두리). */
function SiderPanelToggleIcon({className}: { className?: string }) {
    return (
        <svg
            className={className}
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            width="1em"
            height="1em"
            aria-hidden
        >
            <rect x="3.25" y="4.75" width="17.5" height="14.5" rx="2.5" ry="2.5" stroke="currentColor"
                  strokeWidth="1.65"/>
            <line x1="9.25" y1="6.5" x2="9.25" y2="17.5" stroke="currentColor" strokeWidth="1.65"
                  strokeLinecap="round"/>
        </svg>
    );
}

const APP_MENU_ICONS: Record<string, ReactNode> = {
    '/app/dashboard': <DashboardOutlined className="tw-text-lg"/>,
    '/app/insights': <PieChartOutlined className="tw-text-lg"/>,
    '/app/calendar': <CalendarOutlined className="tw-text-lg"/>,
    '/app/members': <TeamOutlined className="tw-text-lg"/>,
    '/app/organization': <ApartmentOutlined className="tw-text-lg"/>,
    '/app/roles': <KeyOutlined className="tw-text-lg"/>,
    '/app/attendance': <ClockCircleOutlined className="tw-text-lg"/>,
    '/app/leave': <ScheduleOutlined className="tw-text-lg"/>,
    '/app/approvals': <FileDoneOutlined className="tw-text-lg"/>,
    '/app/approvals/department': <FolderOpenOutlined className="tw-text-lg"/>,
    '/app/payroll': <DollarOutlined className="tw-text-lg"/>,
    '/app/notifications': <BellOutlined className="tw-text-lg"/>,
    '/app/member-chat/admin': <MessageOutlined className="tw-text-lg"/>,
    '/app/performance': <LineChartOutlined className="tw-text-lg"/>,
    '/app/evaluations': <StarOutlined className="tw-text-lg"/>,
    '/app/meetings': <VideoCameraOutlined className="tw-text-lg"/>,
    '/app/settings': <SettingOutlined className="tw-text-lg"/>,
};

const ESG_MENU_ICONS: Record<string, ReactNode> = {
    '/app/esg': <GlobalOutlined className="tw-text-lg"/>,
    '/app/esg/activities': <FormOutlined className="tw-text-lg"/>,
    '/app/esg/campaigns': <FlagOutlined className="tw-text-lg"/>,
    '/app/esg/shop': <ShoppingOutlined className="tw-text-lg"/>,
    '/app/esg/admin': <ControlOutlined className="tw-text-lg"/>,
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

const TALENT_HUB_GROUP_KEY = 'group-talent-hub';
const TALENT_HUB_PATHS = ['/app/performance', '/app/evaluations', '/app/meetings'] as const;
const TALENT_HUB_PATH_SET = new Set<string>(TALENT_HUB_PATHS);

const ORG_HR_GROUP_KEY = 'group-org-hr';
const ORG_HR_PATHS = ['/app/members', '/app/organization', '/app/roles'] as const;
const ORG_HR_PATH_SET = new Set<string>(ORG_HR_PATHS);

const ESG_GROUP_KEY = 'group-esg';

const WORK_LEAVE_GROUP_KEY = 'group-work-leave';
const WORK_LEAVE_PATHS = ['/app/attendance', '/app/leave'] as const;
const WORK_LEAVE_PATH_SET = new Set<string>(WORK_LEAVE_PATHS);

const APPROVAL_GROUP_KEY = 'group-approvals';
/** openKeys: 전자결재 하위 구역(ap-section-*). */
const isApprovalGuideSectionOpenKey = (key: string) => key.startsWith('ap-section-');
const APPROVAL_SHELL_MENU_ENTRIES = getApprovalShellSiderEntries();
const APPROVAL_NAV_BY_KEY = new Map(APPROVAL_SHELL_MENU_ENTRIES.map((e) => [e.key, e.navigate]));
const APPROVAL_SECTION_DEFAULT_NAV_BY_KEY = new Map(
    APPROVAL_GUIDE_SECTION_ORDER.map((section) => {
        const firstBox = APPROVAL_GUIDE_SECTION_ITEMS[section][0];
        return [`ap-section-${section}`, APPROVAL_NAV_BY_KEY.get(`ap-${firstBox}`)];
    }),
);

function approvalSectionIcon(section: (typeof APPROVAL_GUIDE_SECTION_ORDER)[number]) {
    if (section === 'do') return <FileTextOutlined className="tw-text-lg"/>;
    if (section === 'personal') return <UserOutlined className="tw-text-lg"/>;
    return <FolderOpenOutlined className="tw-text-lg"/>;
}

function approvalLeafIcon(box: string) {
    if (box === 'do-pending') return <ClockCircleOutlined className="tw-text-lg"/>;
    if (box === 'do-received') return <FileDoneOutlined className="tw-text-lg"/>;
    if (box === 'do-cc-wait') return <EyeOutlined className="tw-text-lg"/>;
    if (box === 'do-upcoming') return <CalendarOutlined className="tw-text-lg"/>;
    if (box === 'per-compose-all') return <FormOutlined className="tw-text-lg"/>;
    if (box === 'per-draft') return <FolderOpenOutlined className="tw-text-lg"/>;
    if (box === 'per-acted-as-approver') return <FileDoneOutlined className="tw-text-lg"/>;
    if (box === 'per-viewers-all') return <EyeOutlined className="tw-text-lg"/>;
    if (box === 'per-inbox-combined') return <BellOutlined className="tw-text-lg"/>;
    if (box === 'per-sent') return <ProjectOutlined className="tw-text-lg"/>;
    if (box === 'per-absence') return <TeamOutlined className="tw-text-lg"/>;
    if (box === 'per-official') return <SafetyCertificateOutlined className="tw-text-lg"/>;
    if (box === 'dept-draft') return <FormOutlined className="tw-text-lg"/>;
    if (box === 'dept-ref') return <EyeOutlined className="tw-text-lg"/>;
    if (box === 'dept-official') return <SafetyCertificateOutlined className="tw-text-lg"/>;
    return <FileTextOutlined className="tw-text-lg"/>;
}

/**
 * antd SubMenu는 접힘 상태에서 기본 툴팁이 없음 — 아이콘+텍스트를 한 덩어리로 감싸 호버 시 그룹명 표시.
 * 펼침일 때는 Tooltip을 쓰지 않음(중복 툴팁 방지).
 */
function SiderGroupedMenuLabel({icon, text}: { icon: ReactNode; text: string }) {
    const {inlineCollapsed} = useContext(MenuContext);
    const inner = (
        <span className="tw-inline-flex tw-min-w-0 tw-w-full tw-items-center tw-gap-3 [&_.anticon]:tw-shrink-0">
      {icon}
            <span className="tw-truncate">{text}</span>
    </span>
    );
    if (!inlineCollapsed) return inner;
    return (
        <Tooltip title={text} placement="right" mouseEnterDelay={0.12}>
            {inner}
        </Tooltip>
    );
}

function buildAppShellMenuItems(
    esgPaths: readonly string[],
    isAdmin: boolean,
    approvalMenuChildren?: NonNullable<MenuProps['items']>,
): NonNullable<MenuProps['items']> {
    const items: NonNullable<MenuProps['items']> = [];
    let hubInserted = false;
    let orgInserted = false;
    let approvalInserted = false;
    let orgChartInserted = false;

    for (const path of APP_MENU_PATH_ORDER) {
        if (path === '/app/members' && !orgChartInserted) {
            orgChartInserted = true;
            items.push({
                key: APP_MENU_ORG_CHART_SIDEBAR_KEY,
                icon: <PartitionOutlined className="tw-text-lg"/>,
                label: APP_MENU_ORG_CHART_LABEL,
                title: APP_MENU_ORG_CHART_LABEL,
            });
        }
        if (TALENT_HUB_PATH_SET.has(path)) {
            if (!hubInserted) {
                hubInserted = true;
                items.push({
                    key: TALENT_HUB_GROUP_KEY,
                    label: (
                        <SiderGroupedMenuLabel icon={<ProjectOutlined className="tw-text-lg"/>}
                                               text={APP_MENU_TALENT_HUB_LABEL}/>
                    ),
                    children: TALENT_HUB_PATHS.map((p) => ({
                        key: p,
                        icon: APP_MENU_ICONS[p],
                        label: APP_MENU_LABEL[p],
                        title: APP_MENU_LABEL[p],
                    })),
                });
            }
            continue;
        }
        if (ORG_HR_PATH_SET.has(path)) {
            if (!isAdmin) {
                continue;
            }
            if (!orgInserted) {
                orgInserted = true;
                items.push({
                    key: ORG_HR_GROUP_KEY,
                    label: (
                        <SiderGroupedMenuLabel icon={<TeamOutlined className="tw-text-lg"/>}
                                               text={APP_MENU_ORG_HR_GROUP_LABEL}/>
                    ),
                    children: ORG_HR_PATHS.map((p) => ({
                        key: p,
                        icon: APP_MENU_ICONS[p],
                        label: APP_MENU_LABEL[p],
                        title: APP_MENU_LABEL[p],
                    })),
                });
            }
            continue;
        }
        if (path === '/app/approvals') {
            if (!approvalInserted) {
                approvalInserted = true;
                if (approvalMenuChildren && approvalMenuChildren.length > 0) {
                    items.push({
                        key: APPROVAL_SIDEBAR_ROOT_KEY,
                        label: (
                            <SiderGroupedMenuLabel icon={<FileDoneOutlined className="tw-text-lg"/>} text="전자결재"/>
                        ),
                        children: approvalMenuChildren,
                    });
                } else {
                    const composeEntry = APPROVAL_SHELL_MENU_ENTRIES[0];
                    const guideLeaves = APPROVAL_SHELL_MENU_ENTRIES.slice(1);
                    const leafByKey = new Map(guideLeaves.map((e) => [e.key, e]));
                    items.push({
                        key: APPROVAL_GROUP_KEY,
                        label: (
                            <SiderGroupedMenuLabel icon={<FileDoneOutlined className="tw-text-lg"/>} text="전자결재"/>
                        ),
                        children: [
                            {
                                key: composeEntry.key,
                                icon: <FormOutlined className="tw-text-lg"/>,
                                label: composeEntry.label,
                                title: composeEntry.label,
                            },
                            ...APPROVAL_GUIDE_SECTION_ORDER.map((section) => ({
                                key: `ap-section-${section}`,
                                label: (
                                    <span
                                        className="tw-inline-flex tw-min-w-0 tw-w-full tw-items-center tw-gap-3 [&_.anticon]:tw-shrink-0">
                    {approvalSectionIcon(section)}
                                        <span className="tw-truncate">{APPROVAL_GUIDE_SECTION_LABEL[section]}</span>
                  </span>
                                ),
                                title: APPROVAL_GUIDE_SECTION_LABEL[section],
                                children: APPROVAL_GUIDE_SECTION_ITEMS[section].map((box) => {
                                    const e = leafByKey.get(`ap-${box}`)!;
                                    return {
                                        key: e.key,
                                        icon: approvalLeafIcon(box),
                                        label: APPROVAL_GUIDE_BOX_LABEL[box],
                                        title: APPROVAL_GUIDE_BOX_LABEL[box],
                                    };
                                }),
                            })),
                        ],
                    });
                }
            }
            continue;
        }
        const leafLabel = APP_MENU_LABEL[path];
        items.push({
            key: path,
            icon: APP_MENU_ICONS[path],
            label: leafLabel,
            title: leafLabel,
        });
        if (path === '/app/calendar' && esgPaths.length > 0) {
            items.push({
                key: ESG_GROUP_KEY,
                label: (
                    <SiderGroupedMenuLabel icon={<GlobalOutlined className="tw-text-lg"/>}
                                           text={APP_MENU_ESG_GROUP_LABEL}/>
                ),
                children: esgPaths.map((p) => ({
                    key: p,
                    icon: ESG_MENU_ICONS[p],
                    label: ESG_MENU_LABEL[p],
                    title: ESG_MENU_LABEL[p],
                })),
            });
        }
    }
    return items;
}

function useAppShellSiderMenuItems(): NonNullable<MenuProps['items']> {
    const {status, user} = useAuth();
    const isAdmin = user?.isSystemAdmin === true;
    const {hasPermission} = usePermissions();

    const {data: esgConfig} = useQuery({
        queryKey: ['esg', 'config'],
        queryFn: () => esgApi.getConfig(),
        enabled: status === 'authenticated',
        retry: false,
        staleTime: 60_000,
    });

    const {data: meMember} = useQuery({
        queryKey: ['member', 'me', user?.id],
        queryFn: () => memberApi.detail(user!.id!),
        enabled: status === 'authenticated' && !!user?.id,
        staleTime: 300_000,
    });

    const {data: approvalOrgChart} = useQuery({
        queryKey: ['organization', 'org-chart'],
        queryFn: () => organizationApi.getOrgChart(),
        enabled: status === 'authenticated',
        staleTime: 300_000,
    });

    return useMemo(() => {
        const esgPaths = ESG_MENU_PATH_ORDER.filter((p) => shouldShowEsgMenuItem(p, esgConfig ?? null, isAdmin));
        const approvalMenuChildren = buildApprovalMenuGroupChildren(approvalOrgChart?.organizations ?? [], {
            myOrganizationId: meMember?.organizationId,
            myOrganizationName: meMember?.organizationName,
        });
        const items = buildAppShellMenuItems(esgPaths, isAdmin, approvalMenuChildren);

        if (!isAdmin) return items;
        const chatAdmin = {
            key: '/app/member-chat/admin',
            icon: <MessageOutlined className="tw-text-lg"/>,
            label: '보안·컴플라이언스 조회',
            title: '보안·컴플라이언스 조회',
        };
        const doc = {
            key: '/app/ai-documents',
            icon: <RobotOutlined className="tw-text-lg"/>,
            label: 'HR 정책 문서',
            title: 'HR 정책 문서',
        };
        return [...items, chatAdmin, doc];
    }, [esgConfig, isAdmin, approvalOrgChart, meMember, status]);
}

const headerGhostIconClass =
    'tw-flex tw-size-11 tw-appearance-none tw-items-center tw-justify-center tw-rounded-full tw-border-0 tw-bg-transparent tw-text-slate-500 tw-shadow-none tw-transition-colors hover:tw-bg-slate-100 hover:tw-text-slate-800 focus-visible:tw-outline focus-visible:tw-outline-2 focus-visible:tw-outline-offset-2 focus-visible:tw-outline-[#2563EB]';

function formatSessionCountdown(totalSeconds: number): string {
    const s = Math.max(0, totalSeconds);
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

function SessionAccessTimer() {
    const {accessExpiresAtMs, refreshAuth} = useAuth();
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
        <div
            className="tw-flex tw-items-center tw-gap-2 tw-rounded-full tw-border tw-border-solid tw-border-slate-200 tw-bg-slate-50 tw-px-3 tw-py-1.5">
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

function SiderBrandHeader({
                              collapsed,
                              onClick,
                          }: {
    collapsed?: boolean;
    onClick?: () => void;
}) {
    const {user, status} = useAuth();
    const {data: companyInfo} = useQuery({
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

    const avatar = (
        <Avatar
            src={logoUrl || undefined}
            alt=""
            shape="square"
            size={collapsed ? 40 : 36}
            className={
                logoUrl
                    ? 'tw-shrink-0 tw-rounded-xl tw-bg-white [&_img]:tw-h-full [&_img]:tw-w-full [&_img]:tw-object-contain'
                    : 'tw-shrink-0 tw-rounded-xl tw-bg-[#2563EB] tw-text-sm tw-font-bold tw-text-white'
            }
        >
            {initial}
        </Avatar>
    );

    if (collapsed) {
        return (
            <Tooltip title={companyName} placement="right">
                <button
                    type="button"
                    className="tw-flex tw-w-full tw-cursor-pointer tw-justify-center tw-border-0 tw-bg-transparent tw-px-1 tw-py-0"
                    onClick={onClick}
                    aria-label="대시보드로 이동"
                >
                    {avatar}
                </button>
            </Tooltip>
        );
    }

    return (
        <button
            type="button"
            className="tw-flex tw-min-w-0 tw-flex-1 tw-cursor-pointer tw-items-center tw-gap-2 tw-border-0 tw-bg-transparent tw-p-0 tw-text-left"
            onClick={onClick}
            aria-label="대시보드로 이동"
        >
            {avatar}
            <div className="tw-flex tw-min-w-0 tw-flex-col tw-leading-tight">
        <span className="tw-truncate tw-text-base tw-font-semibold tw-tracking-tight tw-text-slate-900"
              title={companyName}>
          {companyName}
        </span>
                <span
                    className="tw-truncate tw-text-[11px] tw-font-semibold tw-uppercase tw-tracking-[0.08em] tw-text-slate-500"
                    title={domainLine}
                >
          {domainLine}
        </span>
            </div>
        </button>
    );
}

function SiderAccountPopoverContent({
                                        onClose,
                                        profileSrc,
                                        nameLine,
                                        departmentLine,
                                        emailLine,
                                        onMyPage,
                                        onSettings,
                                        onLogout,
                                    }: {
    onClose: () => void;
    profileSrc?: string;
    nameLine: string;
    departmentLine: string;
    emailLine: string;
    onMyPage: () => void;
    onSettings: () => void;
    onLogout: () => Promise<void>;
}) {
    return (
        <div className="tw-relative tw-w-[min(100vw-24px,288px)] tw-max-w-[288px] tw-px-4 tw-pb-5 tw-pt-2">
            <button
                type="button"
                className="tw-absolute tw-right-2 tw-top-2 tw-flex tw-size-8 tw-items-center tw-justify-center tw-rounded-lg tw-border-0 tw-bg-transparent tw-text-slate-400 tw-transition-colors hover:tw-bg-slate-100 hover:tw-text-slate-700"
                aria-label="닫기"
                onClick={onClose}
            >
                <CloseOutlined/>
            </button>
            <div className="tw-flex tw-flex-col tw-items-center tw-px-2 tw-pt-8">
                <Avatar
                    src={profileSrc || undefined}
                    alt=""
                    shape="square"
                    size={88}
                    icon={!profileSrc ? <UserOutlined className="tw-text-3xl tw-text-slate-500"/> : undefined}
                    className={
                        profileSrc
                            ? '[&_img]:tw-h-full [&_img]:tw-w-full [&_img]:tw-object-cover tw-rounded-2xl'
                            : 'tw-rounded-2xl tw-bg-slate-100'
                    }
                />
                <div className="tw-mt-4 tw-text-center tw-text-base tw-font-bold tw-text-slate-900" title={nameLine}>
                    {nameLine}
                </div>
                <div className="tw-mt-1 tw-text-center tw-text-sm tw-text-slate-700" title={departmentLine}>
                    {departmentLine}
                </div>
                <div className="tw-mt-1 tw-text-center tw-text-xs tw-text-slate-500" title={emailLine}>
                    {emailLine}
                </div>
            </div>
            <div className="tw-mt-8 tw-flex tw-w-full tw-flex-wrap tw-justify-center tw-gap-x-6 tw-gap-y-3">
                <button
                    type="button"
                    className="group tw-flex tw-flex-col tw-items-center tw-gap-2 tw-border-0 tw-bg-transparent tw-p-0 tw-text-slate-700 tw-transition-colors hover:tw-text-slate-900"
                    onClick={() => {
                        onClose();
                        onMyPage();
                    }}
                >
          <span
              className="tw-flex tw-size-14 tw-items-center tw-justify-center tw-rounded-full tw-bg-slate-100 tw-text-lg tw-text-slate-600 tw-transition-colors group-hover:tw-bg-slate-200">
            <UserOutlined/>
          </span>
                    <span className="tw-text-xs tw-font-medium tw-text-slate-600">마이페이지</span>
                </button>
                <button
                    type="button"
                    className="group tw-flex tw-flex-col tw-items-center tw-gap-2 tw-border-0 tw-bg-transparent tw-p-0 tw-text-slate-700 tw-transition-colors hover:tw-text-slate-900"
                    onClick={() => {
                        onClose();
                        onSettings();
                    }}
                >
          <span
              className="tw-flex tw-size-14 tw-items-center tw-justify-center tw-rounded-full tw-bg-slate-100 tw-text-lg tw-text-slate-600 tw-transition-colors group-hover:tw-bg-slate-200">
            <SettingOutlined/>
          </span>
                    <span className="tw-text-xs tw-font-medium tw-text-slate-600">설정</span>
                </button>
                <button
                    type="button"
                    className="group tw-flex tw-flex-col tw-items-center tw-gap-2 tw-border-0 tw-bg-transparent tw-p-0 tw-text-slate-700 tw-transition-colors hover:tw-text-slate-900"
                    onClick={() => {
                        onClose();
                        void onLogout();
                    }}
                >
          <span
              className="tw-flex tw-size-14 tw-items-center tw-justify-center tw-rounded-full tw-bg-slate-100 tw-text-lg tw-text-slate-600 tw-transition-colors group-hover:tw-bg-slate-200">
            <PoweroffOutlined/>
          </span>
                    <span className="tw-text-xs tw-font-medium tw-text-slate-600">로그아웃</span>
                </button>
            </div>
        </div>
    );
}

function SiderUserFooter({collapsed}: { collapsed?: boolean }) {
    const {user, logout} = useAuth();
    const navigate = useNavigate();
    const [accountPopoverOpen, setAccountPopoverOpen] = useState(false);
    const memberId = user?.id?.trim();

    const {data: member} = useQuery({
        queryKey: ['member', 'detail', memberId],
        queryFn: () => memberApi.detail(memberId!),
        enabled: Boolean(memberId),
    });

    const handleLogout = async () => {
        await logout();
        await navigate({to: '/login'});
    };

    const name = user?.name?.trim() || '사용자';
    const jobTitle =
        member?.jobTitleName?.trim() || member?.jobGradeName?.trim() || user?.jobTitle?.trim() || '';
    const nameLine = jobTitle ? `${name} ${jobTitle}` : name;
    const orgLine =
        member?.organizationName?.trim() ||
        user?.departmentName?.trim() ||
        user?.companyName?.trim() ||
        '—';
    const emailLine = member?.email?.trim() || user?.email?.trim() || '—';
    const profileSrc =
        member?.profileUrl?.trim() || user?.profileImageUrl?.trim() || undefined;

    const avatar = (
        <Avatar
            src={profileSrc || undefined}
            alt=""
            icon={!profileSrc ? <UserOutlined className="tw-text-lg tw-text-slate-500"/> : undefined}
            className={
                profileSrc ? '[&_img]:tw-object-cover' : 'tw-bg-slate-100'
            }
            size={40}
        />
    );

    const popoverContent = (
        <SiderAccountPopoverContent
            onClose={() => setAccountPopoverOpen(false)}
            profileSrc={profileSrc}
            nameLine={nameLine}
            departmentLine={orgLine}
            emailLine={emailLine}
            onMyPage={() => {
                void navigate({to: '/app/me'});
            }}
            onSettings={() => {
                void navigate({to: '/app/settings'});
            }}
            onLogout={handleLogout}
        />
    );

    const popoverCommon = {
        open: accountPopoverOpen,
        onOpenChange: setAccountPopoverOpen,
        trigger: 'click' as const,
        arrow: false,
        getPopupContainer: () => document.body,
        styles: {body: {padding: 0}} as const,
        content: popoverContent,
    };

    if (collapsed) {
        return (
            <Popover {...popoverCommon} placement="rightTop">
                <div
                    className="tw-flex tw-w-full tw-shrink-0 tw-cursor-pointer tw-flex-col tw-items-center tw-rounded-lg tw-border-t tw-border-slate-100 tw-px-2 tw-py-3 tw-outline-none hover:tw-bg-slate-50/80 focus-visible:tw-ring-2 focus-visible:tw-ring-blue-500/30"
                    role="button"
                    tabIndex={0}
                    aria-label="계정 정보"
                    aria-expanded={accountPopoverOpen}
                    aria-haspopup="dialog"
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setAccountPopoverOpen((o) => !o);
                        }
                    }}
                >
                    {avatar}
                </div>
            </Popover>
        );
    }

    return (
        <Popover
            {...popoverCommon}
            placement="top"
            /** 트리거(사이드 ~248px)보다 패널(~288px)이 넓어 `topRight`면 왼쪽으로 크게 밀림 → 가운데 정렬 + 살짝 위로 */
            align={{offset: [0, -8]}}
        >
            <div
                className="tw-flex tw-w-full tw-shrink-0 tw-cursor-pointer tw-items-center tw-gap-2 tw-px-3 tw-py-3 tw-outline-none hover:tw-bg-slate-50/80 focus-visible:tw-ring-2 focus-visible:tw-ring-blue-500/30"
                role="button"
                tabIndex={0}
                aria-label="계정 정보"
                aria-expanded={accountPopoverOpen}
                aria-haspopup="dialog"
                onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setAccountPopoverOpen((o) => !o);
                    }
                }}
            >
                <div className="tw-flex tw-min-w-0 tw-flex-1 tw-items-center tw-gap-3">
                    {avatar}
                    <div className="tw-min-w-0 tw-flex-1">
                        <div className="tw-truncate tw-text-sm tw-font-semibold tw-text-slate-900" title={name}>
                            {name}
                        </div>
                        <div className="tw-truncate tw-text-xs tw-text-slate-500" title={orgLine}>
                            {orgLine}
                        </div>
                    </div>
                </div>
                <MoreOutlined className="tw-shrink-0 tw-text-base tw-text-slate-500"/>
            </div>
        </Popover>
    );
}

function AppShellHeader() {
    const {status} = useAuth();
    const queryClient = useQueryClient();
    const [search, setSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [headerDetailMemberId, setHeaderDetailMemberId] = useState<string | null>(null);
    const [memberChatOpen, setMemberChatOpen] = useState(false);

    useEffect(() => {
        const t = window.setTimeout(() => {
            setDebouncedSearch(search.trim());
        }, 250);
        return () => window.clearTimeout(t);
    }, [search]);

    const {data: searchResult, isFetching: searchLoading} = useQuery({
        queryKey: ['search', 'employees', debouncedSearch],
        queryFn: () => searchApi.searchEmployees(debouncedSearch, 0, 10),
        enabled: debouncedSearch.length > 0,
        staleTime: 10_000,
    });

    const list = searchResult?.content ?? [];
    const showSearchPanel = search.trim().length > 0;

    const {data: unreadCount = 0} = useQuery({
        queryKey: ['notifications', 'unreadCount'],
        queryFn: () => notificationApi.unreadCount(),
        enabled: status === 'authenticated',
        staleTime: 10_000,
    });

    /**
     * 헤더 채팅 아이콘 뱃지 — 내 모든 방의 unreadCount 합.
     * `MemberChatPanel` 과 동일한 query key 를 공유하므로 캐시/invalidate 가 자동 동기화된다.
     */
    const {data: myChatRooms = []} = useQuery({
        queryKey: ['member-chat', 'rooms'],
        queryFn: () => memberChatApi.listMyRooms(),
        enabled: status === 'authenticated',
        // 방별 unreadCount 합(헤더 뱃지)과 목록 카운트를 실시간에 가깝게 유지
        // 현재는 활성 방 외에는 STOMP 직접 구독이 없으므로 짧은 polling으로 동기화한다.
        staleTime: 0,
        refetchInterval: 3_000,
        refetchIntervalInBackground: true,
    });
    const chatUnreadTotal = myChatRooms.reduce(
        (sum, r) => sum + (typeof r.unreadCount === 'number' ? r.unreadCount : 0),
        0,
    );

    useEffect(() => {
        if (status !== 'authenticated') return;
        const unsubscribe = notificationApi.subscribe(() => {
            void queryClient.invalidateQueries({queryKey: ['notifications']});
        });
        return unsubscribe;
    }, [queryClient, status]);

    return (
        <Layout.Header
            className="tw-m-0 tw-flex tw-h-16 tw-shrink-0 tw-items-center tw-gap-3 tw-overflow-visible tw-border-0 tw-border-b tw-border-solid tw-border-slate-200 tw-bg-white tw-px-4 tw-leading-none tw-shadow-none md:tw-gap-6 md:tw-px-7">
            <div className="tw-relative tw-flex tw-min-w-0 tw-flex-1 tw-justify-start">
                <AppSearchField
                    className="tw-max-w-2xl"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="메뉴, 동료, 문서 검색..."
                    aria-label="메뉴, 동료, 문서 검색"
                />
                {showSearchPanel && (
                    <div
                        className="tw-absolute tw-left-0 tw-top-[calc(100%+8px)] tw-z-50 tw-w-full tw-max-w-2xl tw-overflow-hidden tw-rounded-2xl tw-border tw-border-slate-200 tw-bg-white tw-shadow-xl">
                        {searchLoading ? (
                            <div className="tw-flex tw-items-center tw-justify-center tw-p-6">
                                <Spin size="small"/>
                            </div>
                        ) : list.length === 0 ? (
                            <div className="tw-p-4">
                                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="검색 결과가 없습니다."/>
                            </div>
                        ) : (
                            <div className="tw-max-h-[420px] tw-overflow-y-auto tw-py-1">
                                {list.map((row) => {
                                    if (!row.memberId) return null;
                                    return (
                                        <div
                                            key={row.memberId}
                                            role="button"
                                            tabIndex={0}
                                            className="tw-flex tw-cursor-pointer tw-items-start tw-gap-3 tw-px-4 tw-py-3 hover:tw-bg-slate-50"
                                            onClick={() => {
                                                setHeaderDetailMemberId(row.memberId);
                                                setSearch('');
                                            }}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter' || e.key === ' ') {
                                                    e.preventDefault();
                                                    setHeaderDetailMemberId(row.memberId);
                                                    setSearch('');
                                                }
                                            }}
                                        >
                                            <Avatar
                                                src={row.profileUrl || undefined}
                                                icon={!row.profileUrl ? <UserOutlined/> : undefined}
                                                size={32}
                                                className={row.profileUrl ? '[&_img]:tw-object-cover' : 'tw-bg-slate-100'}
                                            />
                                            <div className="tw-min-w-0 tw-flex-1">
                                                <div
                                                    className="tw-truncate tw-text-sm tw-font-semibold tw-text-slate-900">
                                                    {row.name ?? '이름 없음'}
                                                </div>
                                                <div className="tw-truncate tw-text-xs tw-text-slate-500">
                                                    {row.email ?? '—'}
                                                </div>
                                                <div className="tw-truncate tw-text-xs tw-text-slate-400">
                                                    {[row.organizationName, row.jobTitleName, row.memberStatus].filter(Boolean).join(' · ') || '—'}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}
            </div>

            <HeaderSearchMemberDetailModal
                open={headerDetailMemberId != null}
                memberId={headerDetailMemberId}
                onClose={() => setHeaderDetailMemberId(null)}
            />

            <MemberChatModal open={memberChatOpen} onClose={() => setMemberChatOpen(false)}/>

            <div className="tw-flex tw-shrink-0 tw-items-center tw-gap-2 tw-overflow-visible md:tw-gap-4">
                <SessionAccessTimer/>
                <Tooltip title="멤버 채팅">
                    <Badge count={chatUnreadTotal} color="#EF4444" offset={[-8, 8]} showZero={false} overflowCount={99}>
                        <button
                            type="button"
                            className={headerGhostIconClass}
                            aria-label={`멤버 채팅${chatUnreadTotal > 0 ? ` (안 읽은 메시지 ${chatUnreadTotal}건)` : ''}`}
                            onClick={() => setMemberChatOpen(true)}
                        >
                            <MessageOutlined className="tw-text-[20px]"/>
                        </button>
                    </Badge>
                </Tooltip>
                <Badge count={unreadCount} color="#EF4444" offset={[-2, 4]} showZero={false}>
                    <Link to="/app/notifications" className={headerGhostIconClass} aria-label="알림">
                        <BellOutlined className="tw-text-[20px]"/>
                    </Link>
                </Badge>
            </div>
        </Layout.Header>
    );
}

function menuSelectedKeyFromPath(pathname: string, search: Record<string, unknown>): string[] {
    if (/^\/app\/members\/[^/]+$/.test(pathname)) return ['/app/members'];
    if (/^\/app\/meetings\/[^/]+$/.test(pathname)) return ['/app/meetings'];
    if (/^\/app\/performance\//.test(pathname)) return ['/app/performance'];
    if (pathname.startsWith('/app/approvals')) {
        const leaf = approvalShellMenuItemKeyFromLocation(pathname, {
            tab: typeof search.tab === 'string' ? search.tab : undefined,
            box: typeof search.box === 'string' ? search.box : undefined,
            myStatus: typeof search.myStatus === 'string' ? search.myStatus : undefined,
            deptView: typeof search.deptView === 'string' ? search.deptView : undefined,
        });
        return leaf ? [leaf] : [];
    }
    const menuPaths = new Set<string>([
        ...APP_MENU_PATH_ORDER,
        ...ESG_MENU_PATH_ORDER,
        '/app/member-chat/admin',
        '/app/ai-documents',
    ]);
    if (menuPaths.has(pathname)) return [pathname];
    return [];
}

function menuOpenKeysForPath(pathname: string, search: Record<string, unknown>): string[] {
    const keys: string[] = [];
    if (TALENT_HUB_PATH_SET.has(pathname) || /^\/app\/(meetings|performance|evaluations)\//.test(pathname)) keys.push(TALENT_HUB_GROUP_KEY);
    if (ORG_HR_PATH_SET.has(pathname) || /^\/app\/members\/[^/]+$/.test(pathname)) {
        keys.push(ORG_HR_GROUP_KEY);
    }
    if (pathname.startsWith('/app/esg')) keys.push(ESG_GROUP_KEY);
    if (pathname.startsWith('/app/approvals')) {
        keys.push(APPROVAL_GROUP_KEY);
        const sec = approvalShellSectionOpenKeyFromLocation(pathname, {
            tab: typeof search.tab === 'string' ? search.tab : undefined,
            box: typeof search.box === 'string' ? search.box : undefined,
            myStatus: typeof search.myStatus === 'string' ? search.myStatus : undefined,
            deptView: typeof search.deptView === 'string' ? search.deptView : undefined,
        });
        if (sec) keys.push(sec);
    }
    return keys;
}

/** `/app/approvals` 이하 경로(부서 문서함, 부재 위임 등)를 포함하는지. */
function isApprovalsShellPathname(pathname: string): boolean {
    return pathname === '/app/approvals' || pathname.startsWith('/app/approvals/');
}

const SIDER_COLLAPSED_STORAGE_KEY = 'wf-app-shell-sider-collapsed';

function AppShellLayout() {
    /** TanStack Router `location` — 메뉴 selectedKeys/openKeys를 URL과 동기화(AppShell 유지, Outlet만 교체). */
    const location = useRouterState({select: (state) => state.location});
    const pathname = location.pathname;
    const search = location.search as Record<string, unknown>;
    const navigate = useNavigate();
    const menuSelectedKey = useMemo(() => menuSelectedKeyFromPath(pathname, search), [pathname, search]);
    const appShellMenuItems = useAppShellSiderMenuItems();
    const [orgChartModalOpen, setOrgChartModalOpen] = useState(false);

    const [siderCollapsed, setSiderCollapsed] = useState(() => {
        if (typeof window === 'undefined') return false;
        try {
            return window.localStorage.getItem(SIDER_COLLAPSED_STORAGE_KEY) === '1';
        } catch {
            return false;
        }
    });

    useEffect(() => {
        try {
            window.localStorage.setItem(SIDER_COLLAPSED_STORAGE_KEY, siderCollapsed ? '1' : '0');
        } catch {
            /* ignore */
        }
    }, [siderCollapsed]);

    /**
     * TanStack Router location 변경 시: `menuOpenKeysForPath`로 현재 경로에 필요한 부모 키만 openKeys에 추가(이미 열린 전자결재 섹션은 닫지 않음).
     * 전자결재 화면을 벗어나면 group-approvals / ap-section-*만 정리.
     */
    const [menuOpenKeys, setMenuOpenKeys] = useState<string[]>(() => {
        if (typeof window === 'undefined') return [];
        try {
            if (window.localStorage.getItem(SIDER_COLLAPSED_STORAGE_KEY) === '1') return [];
        } catch {
            /* ignore */
        }
        return menuOpenKeysForPath(pathname, search);
    });

    useEffect(() => {
        if (siderCollapsed) {
            setMenuOpenKeys([]);
            return;
        }
        setMenuOpenKeys((prev) => {
            const pathKeys = menuOpenKeysForPath(pathname, search);
            const merged = new Set(prev);
            for (const k of pathKeys) merged.add(k);
            return [...merged];
        });
    }, [pathname, search, siderCollapsed]);

    return (
        <Layout className="tw-flex tw-h-[100dvh] tw-min-h-0 tw-bg-slate-50">
            <Layout.Sider
                theme="light"
                width={248}
                collapsedWidth={76}
                collapsible
                collapsed={siderCollapsed}
                onCollapse={setSiderCollapsed}
                trigger={null}
                className="tw-h-full tw-min-h-0 tw-overflow-hidden tw-border-0 tw-bg-transparent tw-shadow-none [&_.ant-layout-sider-children]:tw-flex [&_.ant-layout-sider-children]:tw-h-full [&_.ant-layout-sider-children]:tw-w-full [&_.ant-layout-sider-children]:tw-min-h-0 [&_.ant-layout-sider-children]:tw-flex-col"
            >
                <div
                    className="tw-flex tw-h-full tw-w-full tw-min-h-0 tw-max-h-full tw-flex-col tw-bg-white tw-shadow-[inset_-1px_0_0_0_rgba(226,232,240,1)]">
                    <div
                        className={`tw-flex tw-h-16 tw-w-full tw-shrink-0 tw-items-center tw-gap-2 ${
                            siderCollapsed ? 'tw-justify-center tw-px-2' : 'tw-px-4'
                        }`}
                    >
                        <SiderBrandHeader
                            collapsed={siderCollapsed}
                            onClick={() => {
                                window.location.assign('/app/dashboard');
                            }}
                        />
                    </div>
                    <div
                        className="wf-scrollbar tw-min-h-0 tw-w-full tw-flex-1 tw-overflow-y-auto tw-overflow-x-hidden">
                        <Menu
                            className="tw-mt-2 tw-w-full !tw-border-0 tw-bg-transparent tw-px-2 tw-pb-3 [&_.ant-menu-item::after]:tw-hidden [&_.ant-menu-submenu-title]:tw-px-3 [&_.ant-menu-submenu-title]:tw-rounded-lg [&_.ant-menu-item-only-child]:tw-rounded-lg"
                            theme="light"
                            mode="inline"
                            inlineCollapsed={siderCollapsed}
                            {...(siderCollapsed ? {triggerSubMenuAction: 'click' as const} : {})}
                            getPopupContainer={() => document.body}
                            selectedKeys={menuSelectedKey}
                            // 접힘 시에도 openKeys를 비우면 팝업 서브메뉴가 절대 열리지 않음 — 항상 동일 상태로 팝업/인라인 전환
                            openKeys={menuOpenKeys}
                            onOpenChange={(keys) => {
                                setMenuOpenKeys(keys as string[]);
                            }}
                            items={appShellMenuItems}
                            onClick={({key, domEvent}) => {
                                domEvent.stopPropagation();
                                const keyStr = String(key);
                                const groupDefaultPath =
                                    keyStr === TALENT_HUB_GROUP_KEY
                                        ? '/app/performance'
                                        : keyStr === ORG_HR_GROUP_KEY
                                            ? '/app/members'
                                            : keyStr === ESG_GROUP_KEY
                                                ? '/app/esg'
                                                : keyStr === WORK_LEAVE_GROUP_KEY
                                                    ? '/app/attendance'
                                                    : null;
                                if (groupDefaultPath) {
                                    void navigate({to: groupDefaultPath});
                                    if (siderCollapsed) setMenuOpenKeys([]);
                                    return;
                                }
                                if (keyStr === APPROVAL_GROUP_KEY) {
                                    const rootNav = APPROVAL_NAV_BY_KEY.get('ap-compose');
                                    if (rootNav) {
                                        void navigate(rootNav as never);
                                        if (siderCollapsed) setMenuOpenKeys([]);
                                        return;
                                    }
                                }
                                if (keyStr.startsWith('ap-section-')) {
                                    const sectionNav = APPROVAL_SECTION_DEFAULT_NAV_BY_KEY.get(keyStr);
                                    if (sectionNav) {
                                        void navigate(sectionNav as never);
                                        if (siderCollapsed) setMenuOpenKeys([]);
                                        return;
                                    }
                                }
                                const apNav = APPROVAL_NAV_BY_KEY.get(String(key));
                                if (apNav) {
                                    void navigate(apNav as never);
                                    if (siderCollapsed) {
                                        setMenuOpenKeys([]);
                                    }
                                    return;
                                }
                                if (key === APP_MENU_ORG_CHART_SIDEBAR_KEY) {
                                    setOrgChartModalOpen(true);
                                    if (siderCollapsed) {
                                        setMenuOpenKeys([]);
                                    }
                                    return;
                                }
                                if (siderCollapsed) {
                                    setMenuOpenKeys([]);
                                }
                                void navigate({to: key});
                            }}
                        />
                    </div>
                    <div className="tw-flex tw-shrink-0 tw-border-t tw-border-slate-100 tw-px-2 tw-py-1.5">
                        <Tooltip
                            title={siderCollapsed ? '사이드바 펼치기' : '사이드바 접기'}
                            placement={siderCollapsed ? 'right' : 'top'}
                        >
                            <Button
                                type="text"
                                block
                                className="!tw-flex !tw-h-auto !tw-min-h-9 !tw-w-full !items-center !justify-center !tw-rounded-lg !tw-bg-slate-50 !tw-py-2 !tw-text-slate-600 hover:!tw-bg-slate-100 hover:!tw-text-slate-800"
                                onClick={() => setSiderCollapsed((c) => !c)}
                                aria-label={siderCollapsed ? '사이드바 펼치기' : '사이드바 접기'}
                            >
                <span className="tw-flex tw-w-full tw-items-center tw-justify-center tw-gap-2">
                  <SiderPanelToggleIcon className="tw-shrink-0 tw-text-lg"/>
                    {siderCollapsed ? null : (
                        <span className="tw-truncate tw-text-sm tw-font-medium tw-text-slate-600">사이드바 접기</span>
                    )}
                </span>
                            </Button>
                        </Tooltip>
                    </div>
                    <SiderUserFooter collapsed={siderCollapsed}/>
                </div>
            </Layout.Sider>
            <Layout className="tw-flex tw-min-h-0 tw-min-w-0 tw-flex-1 tw-flex-col tw-bg-slate-50">
                <AppShellHeader/>
                <Layout.Content
                    className="wf-scrollbar tw-min-h-0 tw-flex-1 tw-overflow-y-auto tw-bg-transparent tw-p-6">
                    <Outlet/>
                </Layout.Content>
            </Layout>
            <AiChatbotFab/>
            <OrgChartModal open={orgChartModalOpen} onClose={() => setOrgChartModalOpen(false)}/>
        </Layout>
    );
}

export default AppShellLayout
