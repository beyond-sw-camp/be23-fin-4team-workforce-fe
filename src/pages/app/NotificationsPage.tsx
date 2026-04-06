import { Badge, Card, List, Space, Typography } from 'antd';
import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notificationApi } from '@/features/notification/api/notificationApi';
import { AppButton } from '@/shared/ui/AppButton';

export function NotificationsPage() {
  const queryClient = useQueryClient();
  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ['notifications', 'list'],
    queryFn: () => notificationApi.list(),
  });
  const { data: unreadCount = 0 } = useQuery({
    queryKey: ['notifications', 'unreadCount'],
    queryFn: () => notificationApi.unreadCount(),
  });

  const markAsRead = useMutation({
    mutationFn: (id: string) => notificationApi.markAsRead(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const markAllAsRead = useMutation({
    mutationFn: () => notificationApi.markAllAsRead(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  useEffect(() => {
    const unsubscribe = notificationApi.subscribe(() => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    });
    return unsubscribe;
  }, [queryClient]);

  return (
    <Space direction="vertical" className="tw-w-full" size={16}>
      <div>
        <Typography.Title level={4} className="!tw-m-0 !tw-text-slate-900">
          알림
        </Typography.Title>
        <Typography.Paragraph type="secondary" className="!tw-mb-0 !tw-mt-1 !tw-text-sm">
          읽지 않은 알림을 확인하고 처리할 수 있습니다.
        </Typography.Paragraph>
      </div>
      <Card className="tw-border-slate-200/80 tw-shadow-sm">
        <Space className="tw-w-full tw-flex-wrap tw-justify-between" align="center">
          <Space align="center">
            <Typography.Text strong className="tw-text-slate-700">
              미읽음
            </Typography.Text>
            <Badge count={unreadCount} overflowCount={99} showZero />
          </Space>
          <AppButton
            variant="secondary"
            loading={markAllAsRead.isPending}
            onClick={() => {
              void markAllAsRead.mutateAsync();
            }}
          >
            모두 읽음 처리
          </AppButton>
        </Space>
      </Card>

      <Card className="tw-border-slate-200/80 tw-shadow-sm">
        <List
          loading={isLoading}
          dataSource={notifications}
          locale={{ emptyText: '알림이 없습니다.' }}
          renderItem={(item) => (
            <List.Item
              className="!tw-items-start"
              actions={[
                !item.read ? (
                  <AppButton
                    key={`${item.id}-read`}
                    type="link"
                    onClick={() => {
                      void markAsRead.mutateAsync(item.id);
                    }}
                  >
                    읽음 처리
                  </AppButton>
                ) : null,
              ]}
            >
              <List.Item.Meta
                title={
                  <Space wrap>
                    <span className="tw-font-medium tw-text-slate-900">{item.title}</span>
                    {!item.read ? (
                      <Badge status="processing" text="새 알림" className="!tw-text-xs" />
                    ) : null}
                  </Space>
                }
                description={<span className="tw-text-slate-600">{item.content}</span>}
              />
            </List.Item>
          )}
        />
      </Card>
    </Space>
  );
}
