import { ShoppingCartOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Card, Image, Space, Typography } from 'antd';
import { esgApi } from '@/features/esg/api/esgApi';
import {
  esgCardLinkButtonClass,
  esgMetricCardStyles,
  esgPrimaryButtonClass,
  esgSurfaceCardClass,
  esgSurfaceCardStyles,
} from '@/features/esg/esgUiTokens';
import { Link } from '@tanstack/react-router';
import { AppWorkspacePageTitle } from '@/shared/ui/AppWorkspacePageTitle';

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
    <Space direction="vertical" className="tw-w-full" size={20}>
      <AppWorkspacePageTitle
        className="!tw-mb-0"
        eyebrow="ESG SHOP"
        title="ESG 샵"
        subtitle="적립한 ESG 포인트로 사내 물품을 구매 요청합니다."
        extra={
          <Link to="/app/esg" className={`${esgCardLinkButtonClass} tw-leading-6`}>
            MY ESG로 이동
          </Link>
        }
      />

      <div className="tw-grid tw-grid-cols-1 tw-gap-5 md:tw-grid-cols-3">
        <Card size="small" className={esgSurfaceCardClass} styles={esgMetricCardStyles}>
          <div className="tw-text-[11px] tw-font-bold tw-uppercase tw-tracking-wide tw-text-slate-400">보유 포인트</div>
          <div className="tw-mt-2 tw-flex tw-items-end tw-gap-1">
            <span className="tw-text-3xl tw-font-bold tw-leading-none tw-text-[#1e3a5f]">
              {esgOn && totalPts != null && Number.isFinite(totalPts) ? totalPts.toLocaleString() : '—'}
            </span>
            <span className="tw-text-sm tw-font-bold tw-text-slate-400">P</span>
          </div>
        </Card>
        <Card size="small" className={esgSurfaceCardClass} styles={esgMetricCardStyles}>
          <div className="tw-text-[11px] tw-font-bold tw-uppercase tw-tracking-wide tw-text-slate-400">등록 물품</div>
          <div className="tw-mt-2 tw-flex tw-items-end tw-gap-1">
            <span className="tw-text-3xl tw-font-bold tw-leading-none tw-text-[#1e3a5f]">{items.length.toLocaleString()}</span>
            <span className="tw-text-sm tw-font-bold tw-text-slate-400">개</span>
          </div>
        </Card>
        <Card size="small" className={esgSurfaceCardClass} styles={esgMetricCardStyles}>
          <div className="tw-text-[11px] tw-font-bold tw-uppercase tw-tracking-wide tw-text-slate-400">구매 가능</div>
          <div className="tw-mt-2 tw-flex tw-items-end tw-gap-1">
            <span className="tw-text-3xl tw-font-bold tw-leading-none tw-text-[#1e3a5f]">
              {items.filter((item) => item.stock > 0 && Boolean(item.itemId)).length.toLocaleString()}
            </span>
            <span className="tw-text-sm tw-font-bold tw-text-slate-400">개</span>
          </div>
        </Card>
      </div>

      <div className="tw-grid tw-grid-cols-1 tw-gap-5 sm:tw-grid-cols-2 xl:tw-grid-cols-4">
        {items.map((it, idx) => (
            <Card
              key={it.itemId || `shop-item-${idx}`}
              loading={isLoading}
              className={`tw-h-full ${esgSurfaceCardClass}`}
              styles={esgSurfaceCardStyles}
              cover={
                it.imageUrl ? (
                  <div className="tw-flex tw-h-36 tw-items-center tw-justify-center tw-rounded-t-2xl tw-bg-slate-50">
                    <Image alt="" src={it.imageUrl} className="tw-max-h-40 tw-object-contain" />
                  </div>
                ) : (
                  <div className="tw-flex tw-h-36 tw-items-center tw-justify-center tw-rounded-t-2xl tw-bg-slate-50">
                    <ShoppingCartOutlined className="tw-text-3xl tw-text-slate-300" />
                  </div>
                )
              }
            >
              <Typography.Title level={5} className="!tw-m-0 !tw-truncate !tw-text-sm !tw-font-bold !tw-text-slate-900">
                {it.title}
              </Typography.Title>
              <Typography.Paragraph type="secondary" className="!tw-mb-4 !tw-mt-1 !tw-line-clamp-2 !tw-min-h-10 !tw-text-xs">
                {it.description ?? ''}
              </Typography.Paragraph>
              <div className="tw-flex tw-items-center tw-justify-between tw-gap-2">
                <span className="tw-text-base tw-font-bold tw-text-[#1e3a5f]">{it.requiredPoints}P</span>
                <span className="tw-text-xs tw-font-semibold tw-text-slate-500">재고 {it.stock}</span>
              </div>
              <Button
                type="primary"
                block
                className={`tw-mt-4 !tw-h-10 !tw-rounded-xl !tw-text-sm !tw-font-bold ${esgPrimaryButtonClass}`}
                disabled={it.stock <= 0 || !it.itemId}
                loading={orderM.isPending}
                onClick={() => orderM.mutate(it.itemId)}
              >
                구매
              </Button>
            </Card>
        ))}
      </div>
      {items.length === 0 && !isLoading && (
        <div className="tw-flex tw-min-h-64 tw-items-center tw-justify-center tw-rounded-2xl tw-border tw-border-dashed tw-border-slate-200/90 tw-bg-white tw-text-sm tw-font-semibold tw-text-slate-400 tw-shadow-sm tw-shadow-slate-900/5">
          등록된 물품이 없습니다.
        </div>
      )}
    </Space>
  );
}
