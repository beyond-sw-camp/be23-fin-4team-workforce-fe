import { ShoppingCartOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Card, Col, Image, Row, Space, Typography } from 'antd';
import { esgApi } from '@/features/esg/api/esgApi';
import { esgAccentTextClass, esgPrimaryButtonClass } from '@/features/esg/esgUiTokens';

export function EsgShopPage() {
  const { message } = App.useApp();
  const qc = useQueryClient();

  const { data: cfg } = useQuery({
    queryKey: ['esg', 'config'],
    queryFn: () => esgApi.getConfig(),
    staleTime: 60_000,
  });

  const esgOn = cfg?.esgEnabledYn === 'YES';

  const { data: balance } = useQuery({
    queryKey: ['esg', 'points', 'balance'],
    queryFn: () => esgApi.getPointBalance(),
    enabled: esgOn,
  });

  const totalPts = balance;

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['esg', 'shop', 'items'],
    queryFn: () => esgApi.listShopItems(),
  });

  const orderM = useMutation({
    mutationFn: (itemId: string) => esgApi.orderShopItem(itemId),
    onSuccess: () => {
      message.success('구매 요청이 접수되었습니다.');
      void qc.invalidateQueries({ queryKey: ['esg', 'shop'] });
      void qc.invalidateQueries({ queryKey: ['esg', 'points'] });
    },
    onError: (e: Error) => message.error(e.message || '구매에 실패했습니다.'),
  });

  return (
    <Space direction="vertical" className="tw-w-full" size={16}>
      <div className="tw-flex tw-flex-wrap tw-items-center tw-justify-between tw-gap-3">
        <Typography.Title level={4} className="!tw-m-0 !tw-text-slate-900">
          ESG 사내 샵
        </Typography.Title>
        {esgOn && (
          <Typography.Text className={`tw-text-base tw-font-semibold ${esgAccentTextClass}`}>
            내 포인트{' '}
            {totalPts != null && Number.isFinite(totalPts) ? `${totalPts}P` : '—'}
          </Typography.Text>
        )}
      </div>
      <Row gutter={[16, 16]}>
        {items.map((it, idx) => (
          <Col xs={24} sm={12} md={8} lg={6} key={it.itemId || `shop-item-${idx}`}>
            <Card
              loading={isLoading}
              className="tw-h-full tw-border-slate-200/80 tw-shadow-sm"
              cover={
                it.imageUrl ? (
                  <div className="tw-flex tw-h-40 tw-items-center tw-justify-center tw-bg-slate-50">
                    <Image alt="" src={it.imageUrl} className="tw-max-h-40 tw-object-contain" />
                  </div>
                ) : (
                  <div className="tw-flex tw-h-40 tw-items-center tw-justify-center tw-bg-slate-100">
                    <ShoppingCartOutlined className="tw-text-4xl tw-text-slate-300" />
                  </div>
                )
              }
            >
              <Typography.Title level={5} className="!tw-m-0 !tw-text-base">
                {it.title}
              </Typography.Title>
              <Typography.Paragraph type="secondary" className="!tw-mb-2 !tw-line-clamp-2 !tw-text-sm">
                {it.description ?? ''}
              </Typography.Paragraph>
              <div className="tw-flex tw-items-center tw-justify-between tw-gap-2">
                <span className={`tw-font-semibold ${esgAccentTextClass}`}>{it.requiredPoints}P</span>
                <span className="tw-text-xs tw-text-slate-500">재고 {it.stock}</span>
              </div>
              <Button
                type="primary"
                block
                className={`tw-mt-3 ${esgPrimaryButtonClass}`}
                disabled={it.stock <= 0 || !it.itemId}
                loading={orderM.isPending}
                onClick={() => orderM.mutate(it.itemId)}
              >
                구매
              </Button>
            </Card>
          </Col>
        ))}
      </Row>
      {items.length === 0 && !isLoading && (
        <Typography.Text type="secondary">등록된 물품이 없습니다.</Typography.Text>
      )}
    </Space>
  );
}
