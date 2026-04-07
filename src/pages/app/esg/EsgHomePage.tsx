import { Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { Alert, Card, Col, Row, Space, Statistic, Typography } from 'antd';
import { useAuth } from '@/features/auth/useAuth';
import { esgApi } from '@/features/esg/api/esgApi';

export function EsgHomePage() {
  const { user } = useAuth();
  const { data: cfg } = useQuery({
    queryKey: ['esg', 'config'],
    queryFn: () => esgApi.getConfig(),
  });

  const { data: balance } = useQuery({
    queryKey: ['esg', 'points', 'balance'],
    queryFn: () => esgApi.getPointBalance(),
    enabled: cfg?.esgEnabledYn === 'YES',
  });

  const pts = balance ?? undefined;

  if (cfg?.esgEnabledYn !== 'YES') {
    if (user?.isSystemAdmin) {
      return (
        <Alert
          type="info"
          showIcon
          className="tw-rounded-xl"
          message="ESG가 비활성화되어 있습니다."
          description={
            <span>
              <Link to="/app/esg/admin" className="tw-text-[#2563EB]">
                ESG 관리
              </Link>
              에서 기능을 켤 수 있습니다.
            </span>
          }
        />
      );
    }
    return (
      <Alert
        type="warning"
        showIcon
        className="tw-rounded-xl"
        message="ESG가 비활성화되어 있습니다."
      />
    );
  }

  return (
    <Space direction="vertical" className="tw-w-full" size={16}>
      <div>
        <Typography.Title level={4} className="!tw-m-0 !tw-text-slate-900">
          ESG
        </Typography.Title>
        <Typography.Paragraph type="secondary" className="!tw-mb-0 !tw-mt-1 !tw-text-sm">
          환경·사회·지배구조 활동과 포인트를 관리합니다.
        </Typography.Paragraph>
      </div>

      <Row gutter={[16, 16]}>
        {pts != null && Number.isFinite(pts) && (
          <Col xs={24} sm={12} md={8}>
            <Card className="tw-border-slate-200/80 tw-shadow-sm">
              <Statistic title="포인트 잔액" value={pts} suffix="P" />
            </Card>
          </Col>
        )}
        <Col xs={24} sm={12} md={8}>
          <Card className="tw-border-slate-200/80 tw-shadow-sm" title="바로가기">
            <Space direction="vertical">
              <Link to="/app/esg/activities" className="tw-text-[#2563EB]">
                활동 제출
              </Link>
              <Link to="/app/esg/campaigns" className="tw-text-[#2563EB]">
                캠페인
              </Link>
              <Link to="/app/esg/shop" className="tw-text-[#2563EB]">
                사내 샵
              </Link>
            </Space>
          </Card>
        </Col>
      </Row>
    </Space>
  );
}
