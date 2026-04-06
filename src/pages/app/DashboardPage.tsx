import { Card, Space, Typography } from 'antd';

export function DashboardPage() {
  return (
    <Space direction="vertical" className="tw-w-full" size={16}>
      <div>
        <Typography.Title level={4} className="!tw-m-0 !tw-text-slate-900">
          대시보드
        </Typography.Title>
        <Typography.Paragraph type="secondary" className="!tw-mb-0 !tw-mt-1 !tw-text-sm">
          주요 현황과 바로 가기를 한곳에서 확인할 수 있습니다.
        </Typography.Paragraph>
      </div>
      <Card className="tw-border-slate-200/80 tw-shadow-sm">
        <Typography.Text type="secondary">대시보드 위젯·차트 영역은 연동 예정입니다.</Typography.Text>
      </Card>
    </Space>
  );
}
