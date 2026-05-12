import { ArrowLeftOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Card, Form, Input, InputNumber, Space, Spin, Typography } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import type { EsgShopItem } from '@/features/esg/api/esgApi';
import { esgApi } from '@/features/esg/api/esgApi';
import {
  esgModalContentClass,
  esgPrimaryButtonClass,
  esgSurfaceCardClass,
  esgSurfaceCardStyles,
} from '@/features/esg/esgUiTokens';
import { parseApiError } from '@/shared/api/error-parser';
import type { ApiError } from '@/shared/api/types';
import { AppWorkspacePageTitle } from '@/shared/ui/AppWorkspacePageTitle';

function retryUnlessAuthDenied(failureCount: number, error: unknown): boolean {
  const status = (error as Partial<ApiError> | undefined)?.status;
  if (status === 401 || status === 403 || status === 404) return false;
  return failureCount < 2;
}

export function EsgShopItemEditPage() {
  const { itemId: rawItemId } = useParams({ strict: false }) as { itemId: string };
  const itemId = rawItemId?.trim() ?? '';
  const { message } = App.useApp();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [form] = Form.useForm();
  const [imageFile, setImageFile] = useState<File | null>(null);

  const itemsQuery = useQuery({
    queryKey: ['esg', 'shop', 'items'],
    queryFn: () => esgApi.listShopItems(),
    retry: retryUnlessAuthDenied,
  });

  const item: EsgShopItem | undefined = useMemo(() => {
    if (!itemId || !itemsQuery.data?.length) return undefined;
    return itemsQuery.data.find((r) => r.itemId === itemId);
  }, [itemId, itemsQuery.data]);

  useEffect(() => {
    if (!item) return;
    form.setFieldsValue({
      title: item.title,
      description: item.description ?? '',
      requiredPoints: item.requiredPoints,
      stock: item.stock,
    });
  }, [item, form]);

  const updateMut = useMutation({
    mutationFn: async () => {
      const v = await form.validateFields();
      await esgApi.updateShopItem(itemId, {
        title: String(v.title).trim(),
        description: String(v.description ?? '').trim(),
        requiredPoints: Number(v.requiredPoints),
        stock: Number(v.stock),
        image: imageFile,
      });
    },
    onSuccess: () => {
      message.success('물품을 수정했습니다.');
      setImageFile(null);
      void qc.invalidateQueries({ queryKey: ['esg', 'shop'] });
      void navigate({ to: '/app/esg/admin' });
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : parseApiError(e).message;
      message.error(msg || '수정에 실패했습니다.');
    },
  });

  if (!itemId) {
    return (
      <Space direction="vertical" className="tw-w-full" size={16}>
        <Typography.Text type="danger">물품 ID가 없습니다.</Typography.Text>
        <Link to="/app/esg/admin">ESG 운영 관리로 돌아가기</Link>
      </Space>
    );
  }

  if (itemsQuery.isLoading) {
    return (
      <div className="tw-flex tw-min-h-[40vh] tw-items-center tw-justify-center">
        <Spin size="large" />
      </div>
    );
  }

  if (itemsQuery.isError) {
    return (
      <Space direction="vertical" className="tw-w-full" size={16}>
        <Typography.Text type="danger">목록을 불러오지 못했습니다.</Typography.Text>
        <Link to="/app/esg/admin">ESG 운영 관리로 돌아가기</Link>
      </Space>
    );
  }

  if (!item) {
    return (
      <Space direction="vertical" className="tw-w-full" size={16}>
        <Typography.Text type="warning">해당 물품을 찾을 수 없습니다. 목록에서 삭제되었거나 ID가 잘못되었을 수 있습니다.</Typography.Text>
        <Link to="/app/esg/admin">ESG 운영 관리로 돌아가기</Link>
      </Space>
    );
  }

  return (
    <Space direction="vertical" className="tw-w-full" size={20}>
      <div className="tw-flex tw-flex-wrap tw-items-start tw-gap-3">
        <Button
          type="text"
          icon={<ArrowLeftOutlined />}
          aria-label="ESG 운영 관리로 돌아가기"
          className="!tw-shrink-0 !tw-text-slate-600 hover:!tw-text-slate-900"
          onClick={() => void navigate({ to: '/app/esg/admin' })}
        />
        <AppWorkspacePageTitle
          className="!tw-mb-0 tw-min-w-0 tw-flex-1"
          eyebrow="ESG SHOP"
          title="샵 물품 수정"
          subtitle="물품명·설명·포인트·재고를 변경할 수 있습니다. 이미지는 새 파일을 선택할 때만 교체됩니다."
          subtitleClassName="!tw-mt-1 !tw-max-w-2xl"
        />
      </div>

      <div className={esgModalContentClass}>
        <Card className={esgSurfaceCardClass} size="small" styles={esgSurfaceCardStyles} title={item.title}>
          <Form form={form} layout="vertical" className="tw-max-w-xl">
            <Form.Item name="title" label="물품명" rules={[{ required: true, message: '물품명을 입력해 주세요.' }]}>
              <Input />
            </Form.Item>
            <Form.Item name="description" label="설명">
              <Input.TextArea rows={3} placeholder="선택 사항" />
            </Form.Item>
            <Form.Item
              name="requiredPoints"
              label="필요 포인트"
              rules={[
                { required: true, message: '필요 포인트를 입력해 주세요.' },
                {
                  validator: (_, v) => {
                    const n = Number(v);
                    if (!Number.isFinite(n) || n <= 0) {
                      return Promise.reject(new Error('1 이상의 숫자를 입력해 주세요.'));
                    }
                    return Promise.resolve();
                  },
                },
              ]}
            >
              <InputNumber min={1} className="tw-w-full" />
            </Form.Item>
            <Form.Item
              name="stock"
              label="재고 수량"
              rules={[
                { required: true, message: '재고를 입력해 주세요.' },
                {
                  validator: (_, v) => {
                    const n = Number(v);
                    if (!Number.isFinite(n) || n <= 0) {
                      return Promise.reject(new Error('1 이상의 숫자를 입력해 주세요.'));
                    }
                    return Promise.resolve();
                  },
                },
              ]}
            >
              <InputNumber min={1} className="tw-w-full" />
            </Form.Item>
            {item.imageUrl ? (
              <div className="tw-mb-3">
                <Typography.Text className="tw-mb-1 tw-block tw-text-sm tw-font-medium">현재 이미지</Typography.Text>
                <img
                  src={item.imageUrl}
                  alt=""
                  className="tw-max-h-40 tw-max-w-full tw-rounded-lg tw-border tw-border-slate-200 tw-object-contain"
                />
              </div>
            ) : null}
            <Form.Item label="이미지 교체">
              <Typography.Paragraph type="secondary" className="!tw-mb-2 !tw-mt-0 !tw-text-xs">
                파일을 선택하면 서버에서 기존 이미지를 삭제한 뒤 새로 업로드합니다. 변경하지 않으려면 비워 두세요.
              </Typography.Paragraph>
              <input type="file" accept="image/*" onChange={(e) => setImageFile(e.target.files?.[0] ?? null)} />
            </Form.Item>
            <Space wrap>
              <Button
                type="primary"
                className={esgPrimaryButtonClass}
                loading={updateMut.isPending}
                onClick={() => void updateMut.mutateAsync()}
              >
                저장
              </Button>
              <Button onClick={() => void navigate({ to: '/app/esg/admin' })}>취소</Button>
            </Space>
          </Form>
        </Card>
      </div>
    </Space>
  );
}
