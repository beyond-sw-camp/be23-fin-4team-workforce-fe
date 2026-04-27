import { Badge, Card, List, Space, Typography } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { notificationApi } from '@/features/notification/api/notificationApi';
import { buildApprovalNotificationNavigate } from '@/features/notification/lib/approvalNotificationRoute';
import { AppButton } from '@/shared/ui/AppButton';

export function NotificationsPage() {
  const navigate = useNavigate();
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
  const deleteNotificationM = useMutation({
    mutationFn: (id: string) => notificationApi.deleteNotification(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const routeApprovalNotification = async (item: (typeof notifications)[number]) => {
    if (item.isRead !== 'YES') {
      await markAsRead.mutateAsync(item.notificationId);
    }
    await navigate(
      buildApprovalNotificationNavigate({
        notificationType: item.notificationType,
        targetType: item.targetType,
        title: item.title,
        content: item.content,
        targetId: item.targetId,
      }),
    );
  };

  const isApprovalNotification = (type: string) => {
    const t = String(type ?? '').toUpperCase();
    return t.startsWith('APPROVAL_');
  };

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
              className={isApprovalNotification(item.notificationType) ? '!tw-cursor-pointer !tw-items-start hover:tw-bg-slate-50/60' : '!tw-items-start'}
              onClick={() => {
                if (!isApprovalNotification(item.notificationType)) return;
                void routeApprovalNotification(item);
              }}
              actions={[
                item.isRead !== 'YES' ? (
                  <AppButton
                    key={`${item.notificationId}-read`}
                    type="link"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      void markAsRead.mutateAsync(item.notificationId);
                    }}
                  >
                    읽음 처리
                  </AppButton>
                ) : null,
                <AppButton
                  key={`${item.notificationId}-delete`}
                  type="link"
                  className="!tw-text-rose-600 hover:!tw-text-rose-700"
                  loading={deleteNotificationM.isPending}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    void deleteNotificationM.mutateAsync(item.notificationId);
                  }}
                >
                  삭제
                </AppButton>,
              ]}
            >
              <List.Item.Meta
                title={
                  <Space wrap>
                    <span className="tw-font-medium tw-text-slate-900">{item.title}</span>
                    {item.isRead !== 'YES' ? (
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
