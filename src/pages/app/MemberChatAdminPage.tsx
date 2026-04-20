import { Card, Space, Typography } from 'antd';
import { APP_MENU_LABEL } from '@/app/locale/app-ko';
import { MemberChatPanel } from '@/features/member-chat/ui/MemberChatPanel';

export function MemberChatAdminPage() {
  const title = APP_MENU_LABEL['/app/member-chat/admin'];

  return (
    <Space direction="vertical" className="tw-w-full" size={16}>
      <div>
        <Typography.Title level={4} className="!tw-m-0 !tw-text-slate-900">
          {title}
        </Typography.Title>
        <Typography.Paragraph type="secondary" className="!tw-mb-0 !tw-mt-1 !tw-text-sm">
          관리자 전용 화면입니다. 멤버 채팅 방 목록과 대화 내용을 조회할 수 있습니다.
        </Typography.Paragraph>
      </div>
      <Card className="tw-border-slate-200/80 tw-shadow-sm" styles={{ body: { padding: 12 } }}>
        <MemberChatPanel variant="page" />
      </Card>
    </Space>
  );
}
