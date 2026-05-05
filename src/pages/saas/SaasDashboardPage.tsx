import { CrownOutlined, FileExcelOutlined, LogoutOutlined, PercentageOutlined, ScheduleOutlined } from '@ant-design/icons';
import { useNavigate } from '@tanstack/react-router';
import { Button, Card, Space, Typography } from 'antd';
import { useAuth } from '@/features/auth/useAuth';

export default function SaasDashboardPage() {
  const navigate = useNavigate();
  const { logout } = useAuth();

  // SaaS 운영자 로그아웃 - 토큰/세션 캐시 비운 뒤 강제 페이지 이동 (router state 잔존 회피)
  const handleLogout = async () => {
    try {
      await logout();
    } finally {
      window.location.replace('/login');
    }
  };

  return (
    <div className="tw-min-h-screen tw-bg-slate-50 tw-p-8">
      <div className="tw-mx-auto tw-max-w-5xl tw-space-y-6">
        <div className="tw-flex tw-items-center tw-justify-between">
          <Space align="center" size={12}>
            <CrownOutlined className="tw-text-2xl tw-text-amber-500" />
            <Typography.Title level={2} className="!tw-m-0">
              SaaS 운영 콘솔
            </Typography.Title>
          </Space>
          <Button icon={<LogoutOutlined />} onClick={() => void handleLogout()}>
            로그아웃
          </Button>
        </div>

        <Card
          hoverable
          onClick={() => navigate({ to: '/saas/schedules' })}
          className="tw-cursor-pointer"
        >
          <Space align="center" size={16}>
            <ScheduleOutlined className="tw-text-3xl tw-text-blue-500" />
            <div>
              <Typography.Title level={4} className="!tw-m-0">
                자동 작업 관리
              </Typography.Title>
              <Typography.Text type="secondary">
                시스템이 자동으로 도는 작업의 시간을 보고 바꿀 수 있어요
              </Typography.Text>
            </div>
          </Space>
        </Card>

        <Card
          hoverable
          onClick={() => navigate({ to: '/saas/tax-table' })}
          className="tw-cursor-pointer"
        >
          <Space align="center" size={16}>
            <FileExcelOutlined className="tw-text-3xl tw-text-emerald-500" />
            <div>
              <Typography.Title level={4} className="!tw-m-0">
                간이세액표 관리
              </Typography.Title>
              <Typography.Text type="secondary">
                국세청 고시 간이세액표 엑셀을 매년 업로드하면 모든 회사 급여 계산에 자동 반영돼요
              </Typography.Text>
            </div>
          </Space>
        </Card>

        <Card
          hoverable
          onClick={() => navigate({ to: '/saas/tax-rate' })}
          className="tw-cursor-pointer"
        >
          <Space align="center" size={16}>
            <PercentageOutlined className="tw-text-3xl tw-text-orange-500" />
            <div>
              <Typography.Title level={4} className="!tw-m-0">
                4대보험·세금 요율 관리
              </Typography.Title>
              <Typography.Text type="secondary">
                국민연금/건보/장기요양/고용/산재/소득세/지방소득세 요율을 연도별로 등록·수정해요
              </Typography.Text>
            </div>
          </Space>
        </Card>
      </div>
    </div>
  );
}
