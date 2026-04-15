import { useNavigate, useParams } from '@tanstack/react-router';
import { Modal, Typography } from 'antd';
import { GoalApprovalDetailView } from '@/features/goals/ui/GoalApprovalDetailView';

const { Text } = Typography;

/**
 * 직접 URL로 진입해도 전체 페이지 대신 모달로 승인·반려 UI를 띄웁니다.
 */
export function GoalApprovalDetailPage() {
  const { requestId } = useParams({ strict: false }) as { requestId: string };
  const navigate = useNavigate();

  const goApprovals = () => {
    void navigate({ to: '/app/performance/approvals' });
  };

  if (!requestId) {
    return <Text type="danger">요청 ID가 없습니다.</Text>;
  }

  return (
    <div className="tw-min-h-[30vh] tw-p-4">
      <Modal
        open
        centered
        width="min(960px, calc(100vw - 32px))"
        title="완료 제출 승인"
        footer={null}
        onCancel={goApprovals}
        destroyOnHidden
        maskClosable
        styles={{ body: { maxHeight: 'min(80vh, 720px)', overflowY: 'auto', paddingTop: 8 } }}
      >
        <GoalApprovalDetailView requestId={requestId} onClose={goApprovals} />
      </Modal>
    </div>
  );
}
