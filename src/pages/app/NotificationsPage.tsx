import { CheckCircleOutlined, DeleteOutlined, RightOutlined } from '@ant-design/icons';
import { App as AntdApp, Card, Empty, Segmented, Space, Spin, Tag, Typography } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import dayjs from 'dayjs';
import { useMemo, useState } from 'react';
import { notificationApi, type NotificationItem } from '@/features/notification/api/notificationApi';
import {
  buildApprovalNotificationNavigate,
  buildGoalBundleNotificationNavigate,
} from '@/features/notification/lib/approvalNotificationRoute';
import { AppButton } from '@/shared/ui/AppButton';
import { AppWorkspacePageTitle } from '@/shared/ui/AppWorkspacePageTitle';

type NotificationFilter = 'all' | 'unread' | 'read';

function isApprovalNotification(type: string): boolean {
  return String(type ?? '').toUpperCase().startsWith('APPROVAL_');
}

function isGoalBundleNotification(type: string, targetType?: string): boolean {
  const t = String(type ?? '').toUpperCase();
  const tt = String(targetType ?? '').toUpperCase();
  return t.startsWith('GOAL_BUNDLE_') || tt.startsWith('GOAL_BUNDLE_');
}

function isLeavePromotionNotification(type: string): boolean {
  const t = String(type ?? '').toUpperCase();
  return t === 'LEAVE_PROMOTION_FIRST' || t === 'LEAVE_PROMOTION_SECOND' || t === 'LEAVE_DESIGNATION';
}

function isRoutableNotification(item: NotificationItem): boolean {
  return (
    isApprovalNotification(item.notificationType) ||
    isGoalBundleNotification(item.notificationType, item.targetType) ||
    isLeavePromotionNotification(item.notificationType)
  );
}

function notificationTone(item: NotificationItem): string {
  const t = String(item.notificationType ?? '').toUpperCase();
  const tt = String(item.targetType ?? '').toUpperCase();
  if (t.startsWith('GOAL_BUNDLE_') || tt.startsWith('GOAL_BUNDLE_')) return 'blue';
  if (t.startsWith('APPROVAL_')) return 'purple';
  if (t.startsWith('LEAVE_')) return 'green';
  if (t.startsWith('EVALUATION_') || t === 'GOAL_EVALUATED') return 'orange';
  return 'default';
}

function dayLabel(dateKey: string): string {
  if (dateKey === 'unknown') return '날짜 없음';
  const day = dayjs(dateKey);
  const today = dayjs();
  if (day.isSame(today, 'day')) return '오늘';
  if (day.isSame(today.subtract(1, 'day'), 'day')) return '어제';
  return day.format('YYYY.MM.DD');
}

function groupByDay(items: NotificationItem[]): Array<{ day: string; items: NotificationItem[] }> {
  const map = new Map<string, NotificationItem[]>();
  for (const item of items) {
    const key = item.createdAt ? dayjs(item.createdAt).format('YYYY-MM-DD') : 'unknown';
    const bucket = map.get(key) ?? [];
    bucket.push(item);
    map.set(key, bucket);
  }
  return [...map.entries()]
    .sort(([a], [b]) => {
      if (a === 'unknown') return 1;
      if (b === 'unknown') return -1;
      return b.localeCompare(a);
    })
    .map(([day, bucket]) => ({ day, items: bucket }));
}

type NotificationRowProps = {
  item: NotificationItem;
  onRoute: (item: NotificationItem) => void;
  onDelete: (id: string) => void;
  deleting: boolean;
};

function NotificationRow({ item, onRoute, onDelete, deleting }: NotificationRowProps) {
  const unread = item.isRead !== 'YES';
  const routable = isRoutableNotification(item);

  return (
    <div
      role={routable ? 'button' : undefined}
      tabIndex={routable ? 0 : undefined}
      className={`tw-flex tw-w-full tw-items-start tw-gap-4 tw-rounded-xl tw-border tw-px-4 tw-py-3 tw-transition-colors ${
        unread ? 'tw-border-blue-200 tw-bg-blue-50/70 tw-opacity-100' : 'tw-border-slate-100 tw-bg-white tw-opacity-60'
      } ${routable ? 'tw-cursor-pointer hover:tw-border-slate-200 hover:tw-bg-slate-50 focus-visible:tw-outline focus-visible:tw-outline-2 focus-visible:tw-outline-blue-500' : ''}`}
      onClick={() => {
        if (routable) onRoute(item);
      }}
      onKeyDown={(event) => {
        if (!routable) return;
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        onRoute(item);
      }}
    >
      <div className="tw-mt-1.5 tw-shrink-0">
        {unread ? <span className="tw-block tw-size-2 tw-rounded-full tw-bg-blue-600" /> : null}
      </div>
      <div className="tw-min-w-0 tw-flex-1">
        <div className="tw-flex tw-flex-wrap tw-items-center tw-gap-2">
          <Tag color={notificationTone(item)} className={`!tw-m-0 ${unread ? '' : '!tw-text-slate-500'}`}>
            {item.title}
          </Tag>
        </div>
        <div className={`tw-mt-2 tw-text-sm tw-leading-relaxed ${unread ? 'tw-font-medium tw-text-slate-900' : 'tw-text-slate-600'}`}>
          {item.content || '알림 내용이 없습니다.'}
        </div>
        <div className="tw-mt-2 tw-text-xs tw-text-slate-400">
          {item.createdAt ? dayjs(item.createdAt).format('HH:mm') : '-'}
        </div>
      </div>
      <Space className="tw-shrink-0" size={8}>
        <AppButton
          variant="text"
          icon={<DeleteOutlined />}
          className="!tw-text-rose-600 hover:!tw-text-rose-700"
          loading={deleting}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onDelete(item.notificationId);
          }}
        >
          삭제
        </AppButton>
        {routable ? <RightOutlined className="tw-text-xs tw-text-slate-400" /> : null}
      </Space>
    </div>
  );
}

export function NotificationsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { message } = AntdApp.useApp();
  const [filter, setFilter] = useState<NotificationFilter>('all');

  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ['notifications', 'list'],
    queryFn: () => notificationApi.list(),
  });
  const { data: unreadCount = 0 } = useQuery({
    queryKey: ['notifications', 'unreadCount'],
    queryFn: () => notificationApi.unreadCount(),
  });

  const readCount = notifications.length - unreadCount;
  const filteredNotifications = useMemo(() => {
    if (filter === 'unread') return notifications.filter((item) => item.isRead !== 'YES');
    if (filter === 'read') return notifications.filter((item) => item.isRead === 'YES');
    return notifications;
  }, [filter, notifications]);
  const groupedNotifications = useMemo(() => groupByDay(filteredNotifications), [filteredNotifications]);

  const invalidateNotifications = () => {
    void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    void queryClient.invalidateQueries({ queryKey: ['dashboard', 'notifications'] });
  };

  const markAsRead = useMutation({
    mutationFn: (id: string) => notificationApi.markAsRead(id),
    onSuccess: invalidateNotifications,
  });

  const markAllAsRead = useMutation({
    mutationFn: () => notificationApi.markAllAsRead(),
    onSuccess: () => {
      invalidateNotifications();
      void message.success('모든 알림을 읽음 처리했습니다.');
    },
  });

  const deleteNotificationM = useMutation({
    mutationFn: (id: string) => notificationApi.deleteNotification(id),
    onSuccess: () => {
      invalidateNotifications();
      void message.success('알림을 삭제했습니다.');
    },
  });

  const deleteAllNotifications = useMutation({
    mutationFn: () => notificationApi.deleteAllNotifications(),
    onSuccess: () => {
      invalidateNotifications();
      void message.success('모든 알림을 삭제했습니다.');
    },
  });

  const routeNotification = async (item: NotificationItem) => {
    if (!isRoutableNotification(item)) return;

    if (item.isRead !== 'YES') {
      await markAsRead.mutateAsync(item.notificationId);
    }
    // 연차 사용 촉진 통보 알림은 휴가 계획 관리 페이지로 딥링크
    // (/app/leave/my-promotion 은 폐지되고 /app/leave 에 통합됨)
    if (isLeavePromotionNotification(item.notificationType)) {
      await navigate({ to: '/app/leave' });
      return;
    }

    if (isGoalBundleNotification(item.notificationType, item.targetType)) {
      await navigate(
        buildGoalBundleNotificationNavigate({
          notificationType: item.notificationType,
          targetType: item.targetType,
          title: item.title,
          content: item.content,
          targetId: item.targetId,
        }),
      );
      return;
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

  return (
    <div className="tw-mx-auto tw-w-full tw-space-y-5">
      <AppWorkspacePageTitle
        eyebrow="NOTIFICATIONS"
        title="알림"
        subtitle="읽지 않은 알림을 먼저 확인하고, 관련 화면으로 바로 이동할 수 있습니다."
        extra={
          <Space size={8}>
            <AppButton
              variant="secondary"
              icon={<CheckCircleOutlined />}
              loading={markAllAsRead.isPending}
              onClick={() => void markAllAsRead.mutateAsync()}
            >
              전체 읽음
            </AppButton>
            <AppButton
              variant="secondary"
              icon={<DeleteOutlined />}
              className="!tw-text-rose-600 hover:!tw-text-rose-700"
              loading={deleteAllNotifications.isPending}
              onClick={() => void deleteAllNotifications.mutateAsync()}
            >
              전체 삭제
            </AppButton>
          </Space>
        }
      />

      <Card className="!tw-border-0 !tw-bg-transparent !tw-shadow-none" styles={{ body: { padding: 0 } }}>
        <div className="tw-flex tw-flex-wrap tw-items-center tw-justify-between tw-gap-3">
          <Segmented
            size="middle"
            className="!tw-rounded-lg !tw-border !tw-border-slate-200 !tw-bg-white !tw-p-0.5 [&_.ant-segmented-item]:!tw-min-h-8 [&_.ant-segmented-item-label]:!tw-min-h-7 [&_.ant-segmented-item-label]:!tw-px-3 [&_.ant-segmented-item-label]:!tw-py-0 [&_.ant-segmented-item-label]:!tw-text-xs [&_.ant-segmented-item-label]:!tw-font-medium [&_.ant-segmented-item-label]:!tw-leading-7 [&_.ant-segmented-item-label]:!tw-text-slate-600 [&_.ant-segmented-item-selected]:!tw-bg-blue-600 [&_.ant-segmented-item-selected_.ant-segmented-item-label]:!tw-text-white"
            value={filter}
            onChange={(value) => setFilter(value as NotificationFilter)}
            options={[
              { label: `전체 ${notifications.length}`, value: 'all' },
              { label: `읽지 않음 ${unreadCount}`, value: 'unread' },
              { label: `읽음 ${readCount}`, value: 'read' },
            ]}
          />
          <Typography.Text type="secondary" className="tw-text-xs">
            읽지 않은 알림만 강조 표시됩니다.
          </Typography.Text>
        </div>
      </Card>

      <Card className="!tw-border-0 !tw-bg-transparent !tw-shadow-none" styles={{ body: { padding: 0 } }}>
        <Spin spinning={isLoading}>
          {filteredNotifications.length === 0 ? (
            <div className="tw-py-12">
              <Empty description="표시할 알림이 없습니다." />
            </div>
          ) : (
            <div className="tw-space-y-5">
              {groupedNotifications.map((group) => (
                <section key={`${filter}-${group.day}`} className="tw-space-y-2">
                  <div className="tw-flex tw-items-center tw-gap-2 tw-px-1">
                    <Typography.Text className="tw-text-xs tw-font-semibold tw-text-slate-500">
                      {dayLabel(group.day)}
                    </Typography.Text>
                    <div className="tw-h-px tw-flex-1 tw-bg-slate-100" />
                  </div>
                  <div className="tw-space-y-2">
                    {group.items.map((item) => (
                      <NotificationRow
                        key={item.notificationId}
                        item={item}
                        onRoute={(target) => void routeNotification(target)}
                        onDelete={(id) => void deleteNotificationM.mutateAsync(id)}
                        deleting={deleteNotificationM.isPending}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </Spin>
      </Card>
    </div>
  );
}
