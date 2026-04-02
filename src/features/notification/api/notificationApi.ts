import { httpClient } from '@/shared/api/httpClient';
import { unwrapApiResponse } from '@/shared/api/response';
import { env } from '@/app/config/env';

export type NotificationItem = {
  id: string;
  title: string;
  content: string;
  read: boolean;
  createdAt?: string;
};

export const notificationApi = {
  async list() {
    const response = await httpClient.get('/notification/list');
    return unwrapApiResponse<NotificationItem[]>(response.data) ?? [];
  },
  async unreadCount() {
    const response = await httpClient.get('/notification/unread-count');
    const payload = unwrapApiResponse<{ count?: number } | number>(response.data);
    if (typeof payload === 'number') {
      return payload;
    }
    return payload?.count ?? 0;
  },
  async markAsRead(id: string) {
    const response = await httpClient.patch(`/notification/${id}/read`);
    return unwrapApiResponse<null>(response.data);
  },
  async markAllAsRead() {
    const response = await httpClient.patch('/notification/read-all');
    return unwrapApiResponse<null>(response.data);
  },
  subscribe(onMessage: () => void) {
    const eventSource = new EventSource(`${env.VITE_API_BASE_URL}/notification/subscribe`, { withCredentials: true });
    eventSource.onmessage = () => onMessage();
    eventSource.onerror = () => {
      eventSource.close();
    };
    return () => eventSource.close();
  },
};
