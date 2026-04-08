import { Card, Space, Typography } from 'antd';
import { useAuth } from '@/features/auth/useAuth';

export function DashboardPage() {
  const { user } = useAuth();
  const isSystemAdmin = user?.isSystemAdmin === true;

  const title = isSystemAdmin ? '관리자 대시보드' : '대시보드';
  const description = isSystemAdmin
    ? '시스템·조직 전체 관점의 주요 현황과 바로 가기를 한곳에서 확인할 수 있습니다.'
    : '주요 현황과 바로 가기를 한곳에서 확인할 수 있습니다.';
  const cardHint = isSystemAdmin
    ? '관리자 대시보드 위젯·차트 영역은 연동 예정입니다.'
    : '대시보드 위젯·차트 영역은 연동 예정입니다.';

  return (
    <Space direction="vertical" className="tw-w-full" size={16}>
      <div>
        <Typography.Title level={4} className="!tw-m-0 !tw-text-slate-900">
          {title}
        </Typography.Title>
        <Typography.Paragraph type="secondary" className="!tw-mb-0 !tw-mt-1 !tw-text-sm">
          {description}
        </Typography.Paragraph>
      </div>
      <Card className="tw-border-slate-200/80 tw-shadow-sm">
        <Typography.Text type="secondary">{cardHint}</Typography.Text>
      </Card>
    </Space>
  );
}
