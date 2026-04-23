import { useNavigate, useParams } from '@tanstack/react-router';
import { Modal, Typography } from 'antd';
import { PERFORMANCE_PAGE_KO } from '@/app/locale/app-ko';
import { GoalApprovalDetailView } from '@/features/goals/ui/GoalApprovalDetailView';
import { DetailPageHeader } from '@/shared/ui/DetailPageHeader';

const { Text } = Typography;

/**
 * 직접 URL로 진입해도 전체 페이지 대신 모달로 승인·반려 UI를 띄웁니다.
 */
export function GoalApprovalDetailPage() {
  const { requestId } = useParams({ strict: false }) as { requestId: string };
  const navigate = useNavigate();

  const goPerformance = () => {
    void navigate({ to: '/app/performance' });
  };

  if (!requestId) {
    return <Text type="danger">요청 ID가 없습니다.</Text>;
  }

  return (
    <div className="tw-min-h-[30vh] tw-p-4">
      <DetailPageHeader
        backTo="/app/performance"
        backLabel="실적·목표"
        title={PERFORMANCE_PAGE_KO.approvalStripTitle}
        subtitle="목표 완료 제출에 대한 승인·반려를 처리합니다."
        showShare={false}
      />
      <Modal
        open
        centered
        width="min(960px, calc(100vw - 32px))"
        title={null}
        footer={null}
        onCancel={goPerformance}
        destroyOnHidden
        maskClosable
        styles={{ body: { maxHeight: 'min(80vh, 720px)', overflowY: 'auto', paddingTop: 8 } }}
      >
        <GoalApprovalDetailView requestId={requestId} onClose={goPerformance} />
      </Modal>
    </div>
  );
}
