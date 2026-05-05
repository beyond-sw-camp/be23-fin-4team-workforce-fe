/** /app/attendance/overtime-status - 초과근무 현황 (관리자) */
import { useNavigate } from '@tanstack/react-router';
import { Button, Space } from 'antd';
import { OvertimeUsageTab } from '@/pages/app/salary-service/admin/AdminSalarySettingsPage';
import { AppWorkspacePageTitle } from '@/shared/ui/AppWorkspacePageTitle';

export function AdminOvertimeUsagePage() {
  const navigate = useNavigate();

  return (
    <Space direction="vertical" className="tw-w-full" size={16}>
      <AppWorkspacePageTitle
        eyebrow="Attendance"
        title="초과근무 현황"
        subtitle="이번 달 직원별 초과근무시간과 월 한도 대비 비율을 확인할 수 있어요."
        extra={(
          <Button onClick={() => navigate({ to: '/app/attendance/company' })}>
            근태 현황으로 이동
          </Button>
        )}
      />
      <OvertimeUsageTab />
    </Space>
  );
}