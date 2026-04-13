import { ArrowLeftOutlined } from '@ant-design/icons';
import { useNavigate } from '@tanstack/react-router';
import { Button, Space, Typography } from 'antd';
import { GoalApprovalCenterPanel } from '@/features/goals/ui/GoalApprovalCenterPanel';

const { Title, Text } = Typography;

export function GoalApprovalsListPage() {
  const navigate = useNavigate();

  return (
    <div className="tw-space-y-6 tw-p-4 md:tw-p-6">
      <Space className="tw-w-full tw-justify-between" wrap>
        <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => void navigate({ to: '/app/performance' })}>
          성과·목표로
        </Button>
      </Space>

      <div>
        <Title level={4} className="!tw-mt-0 !tw-mb-1">
          승인 센터
        </Title>
        <Text type="secondary" className="!tw-text-sm">
          북마크·직접 주소로 열 때는 이 전체 화면을 사용할 수 있습니다.
        </Text>
      </div>

      <GoalApprovalCenterPanel showIntro />
    </div>
  );
}
