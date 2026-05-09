import {
  ArrowRightOutlined,
  BankOutlined,
  CalendarOutlined,
  FileExcelOutlined,
  PercentageOutlined,
  SafetyCertificateOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { Spin, Typography } from 'antd';
import { useMemo } from 'react';
import { saasApi } from '@/features/saas/api/saasApi';
import { AppWorkspacePageTitle } from '@/shared/ui/AppWorkspacePageTitle';
import { SaasConsoleShell } from '@/pages/saas/SaasConsoleShell';

type MenuItem = {
  key: string;
  title: string;
  description: string;
  tag: string;
  icon: JSX.Element;
  to: '/saas/schedules' | '/saas/tax-table' | '/saas/tax-rate';
};

const currentYear = new Date().getFullYear();

const menuItems: MenuItem[] = [
  {
    key: 'auto-task',
    title: '자동 작업 관리',
    description: '서비스별 배치 작업 스케줄을 확인하고 실행 주기와 활성 상태를 조정합니다.',
    tag: '시스템',
    icon: <CalendarOutlined />,
    to: '/saas/schedules',
  },
  {
    key: 'tax-table',
    title: '간이세액표 관리',
    description: '국세청 기준 간이세액표를 업로드해 모든 고객사 급여 계산 기준에 반영합니다.',
    tag: '급여',
    icon: <FileExcelOutlined />,
    to: '/saas/tax-table',
  },
  {
    key: 'tax-rate',
    title: '4대보험·세금 요율 관리',
    description: '국민연금, 건강보험, 고용보험, 소득세 등 연도별 공제 요율을 관리합니다.',
    tag: '법규',
    icon: <PercentageOutlined />,
    to: '/saas/tax-rate',
  },
];

export default function SaasDashboardPage() {
  const navigate = useNavigate();

  const companiesQ = useQuery({
    queryKey: ['saas', 'companies'],
    queryFn: () => saasApi.company.list(),
  });
  const memberSchedulesQ = useQuery({
    queryKey: ['saas', 'schedules', 'member'],
    queryFn: () => saasApi.schedule.listMember(),
  });
  const salarySchedulesQ = useQuery({
    queryKey: ['saas', 'schedules', 'salary'],
    queryFn: () => saasApi.schedule.listSalary(),
  });
  const taxYearsQ = useQuery({
    queryKey: ['saas', 'tax-table', 'years'],
    queryFn: () => saasApi.taxTable.listYears(),
  });
  const taxRatesQ = useQuery({
    queryKey: ['saas', 'tax-rate', currentYear],
    queryFn: () => saasApi.taxRate.list(currentYear),
  });

  const schedules = useMemo(
    () => [...(memberSchedulesQ.data ?? []), ...(salarySchedulesQ.data ?? [])],
    [memberSchedulesQ.data, salarySchedulesQ.data],
  );
  const dashboardLoading =
    companiesQ.isLoading ||
    memberSchedulesQ.isLoading ||
    salarySchedulesQ.isLoading ||
    taxYearsQ.isLoading ||
    taxRatesQ.isLoading;

  return (
    <SaasConsoleShell>
        <section className="tw-flex tw-flex-col tw-gap-5">
          <div className="tw-flex tw-flex-col tw-gap-4 md:tw-flex-row md:tw-items-start md:tw-justify-between">
            <AppWorkspacePageTitle
              eyebrow="SAAS OPERATIONS"
              title="Workforce 관리자 센터"
              subtitle="전체 서비스 운영에 필요한 자동화, 급여 기준 데이터, 법정 요율을 관리합니다. 설정 변경은 고객사 환경에 반영되므로 변경 전 대상과 적용 연도를 확인해 주세요."
              titleLevel={3}
            />
            <Spin spinning={dashboardLoading}>
              <div className="tw-min-w-[150px] tw-rounded-xl tw-border tw-border-slate-200 tw-bg-white tw-px-4 tw-py-3 tw-shadow-sm">
                <Typography.Text className="tw-text-xs tw-font-bold tw-uppercase tw-tracking-wide tw-text-slate-400">
                  운영 기준 연도
                </Typography.Text>
                <div className="tw-mt-1 tw-text-xl tw-font-black tw-text-[#2563eb]">{currentYear}</div>
              </div>
            </Spin>
          </div>

          <div className="tw-grid tw-gap-3 md:tw-grid-cols-4">
            <MetricCard
              icon={<BankOutlined />}
              label="고객사"
              value={`${companiesQ.data?.length ?? 0}개`}
              description="등록 인스턴스"
            />
            <MetricCard
              icon={<CalendarOutlined />}
              label="자동 작업"
              value={`${schedules.length}개`}
              description={`일시중지 ${schedules.filter((item) => item.paused).length}개`}
            />
            <MetricCard
              icon={<FileExcelOutlined />}
              label="간이세액표"
              value={`${taxYearsQ.data?.length ?? 0}개 연도`}
              description="등록 연도"
            />
            <MetricCard
              icon={<PercentageOutlined />}
              label={`${currentYear} 요율`}
              value={`${taxRatesQ.data?.length ?? 0}건`}
              description="공제 기준"
            />
          </div>
        </section>

        <section className="tw-mt-5 tw-grid tw-gap-3">
          {menuItems.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => navigate({ to: item.to })}
              className="group tw-flex tw-w-full tw-items-center tw-gap-4 tw-rounded-xl tw-border-0 tw-bg-white tw-p-4 tw-text-left tw-shadow-[0_1px_3px_rgba(15,23,42,0.08)] tw-transition hover:tw-bg-white hover:tw-shadow-[0_8px_22px_rgba(37,99,235,0.10)] active:tw-scale-[0.995]"
            >
              <span className="tw-flex tw-h-10 tw-w-10 tw-shrink-0 tw-items-center tw-justify-center tw-rounded-xl tw-bg-blue-50 tw-text-lg tw-text-[#2563eb] tw-transition group-hover:tw-bg-blue-100">
                {item.icon}
              </span>
              <span className="tw-min-w-0 tw-flex-1">
                <span className="tw-flex tw-flex-wrap tw-items-center tw-gap-2">
                  <span className="tw-text-sm tw-font-bold tw-text-slate-900">{item.title}</span>
                  <span className="tw-rounded-md tw-bg-slate-100 tw-px-2 tw-py-0.5 tw-text-[11px] tw-font-bold tw-text-slate-500 group-hover:tw-bg-blue-50 group-hover:tw-text-[#2563eb]">
                    {item.tag}
                  </span>
                </span>
                <span className="tw-mt-1 tw-block tw-text-sm tw-leading-6 tw-text-slate-500">
                  {item.description}
                </span>
              </span>
              <span className="tw-hidden tw-items-center tw-gap-1 tw-text-sm tw-font-bold tw-text-[#1e3a5f] tw-opacity-0 tw-transition group-hover:tw-opacity-100 sm:tw-flex">
                이동하기
                <ArrowRightOutlined />
              </span>
            </button>
          ))}
        </section>

        <section className="tw-mt-5 tw-grid tw-gap-3 md:tw-grid-cols-2">
          <InfoPanel
            icon={<SafetyCertificateOutlined />}
            title="운영 가이드"
            description="운영 콘솔의 변경 작업은 전 고객사에 영향을 줄 수 있습니다. 변경 전 적용 연도와 대상 서비스를 확인해 주세요."
          />
          <InfoPanel
            icon={<SettingOutlined />}
            title="관리 범위"
            description="서버 인스턴스와 데이터베이스 연결 설정은 코드·인프라 배포 영역에서 관리하며, 이 콘솔은 서비스 운영 데이터만 다룹니다."
          />
        </section>
    </SaasConsoleShell>
  );
}

function MetricCard({
  icon,
  label,
  value,
  description,
}: {
  icon: JSX.Element;
  label: string;
  value: string;
  description: string;
}) {
  return (
    <div className="tw-rounded-xl tw-border tw-border-slate-200 tw-bg-white tw-p-4 tw-shadow-sm">
      <div className="tw-flex tw-items-center tw-gap-3">
        <span className="tw-flex tw-h-9 tw-w-9 tw-items-center tw-justify-center tw-rounded-xl tw-bg-slate-100 tw-text-[#1e3a5f]">
          {icon}
        </span>
        <div>
          <div className="tw-text-xs tw-font-bold tw-text-slate-500">{label}</div>
          <div className="tw-text-lg tw-font-black tw-text-slate-950">{value}</div>
        </div>
      </div>
      <div className="tw-mt-3 tw-text-xs tw-font-medium tw-text-slate-400">{description}</div>
    </div>
  );
}

function InfoPanel({
  icon,
  title,
  description,
}: {
  icon: JSX.Element;
  title: string;
  description: string;
}) {
  return (
    <div className="tw-flex tw-items-start tw-gap-3 tw-rounded-xl tw-border tw-border-slate-200 tw-bg-white tw-p-4 tw-shadow-sm">
      <span className="tw-mt-0.5 tw-text-lg tw-text-slate-400">{icon}</span>
      <div>
        <div className="tw-text-sm tw-font-bold tw-text-slate-900">{title}</div>
        <div className="tw-mt-1 tw-text-sm tw-leading-6 tw-text-slate-500">{description}</div>
      </div>
    </div>
  );
}
