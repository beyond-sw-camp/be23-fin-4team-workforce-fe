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
      <Card>
        <Space className="tw-w-full tw-justify-between">
          <Typography.Title level={4} className="!tw-m-0">
            Notifications
          </Typography.Title>
          <Space>
            <Badge count={unreadCount} overflowCount={99} />
            <AppButton
              variant="secondary"
              loading={markAllAsRead.isPending}
              onClick={() => {
                void markAllAsRead.mutateAsync();
              }}
            >
              Mark all as read
            </AppButton>
          </Space>
        </Space>
      </Card>

      <Card>
        <List
          loading={isLoading}
          dataSource={notifications}
          locale={{ emptyText: '알림이 없습니다.' }}
          renderItem={(item) => (
            <List.Item
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
                  <Space>
                    <span>{item.title}</span>
                    {!item.read ? <Badge status="processing" text="NEW" /> : null}
                  </Space>
                }
                description={item.content}
              />
            </List.Item>
          )}
        />
      </Card>
    </Space>
  );
}
