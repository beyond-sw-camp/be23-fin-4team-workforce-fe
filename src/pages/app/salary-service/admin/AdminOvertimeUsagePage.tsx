/** /app/attendance/overtime-status - 초과근무 현황 (관리자)
 *
 *  전 직원의 이번 달 누적 OT vs 회사 월 한도 (주52시간/월한도) 모니터링.
 */
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
        title="초과 근무 현황"
        subtitle="직원들의 이번 달 실측/승인 초과 근무 시간과 회사 월 한도(주52시간/월한도) 대비 사용률을 확인합니다."
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
