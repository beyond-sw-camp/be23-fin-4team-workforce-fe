/** /app/attendance/overtime-status - 초과근무 현황 (관리자)
 *
 *  전 직원의 이번 달 누적 OT vs 회사 월 한도 (주52시간/월한도) 모니터링.
 */
import { useNavigate } from '@tanstack/react-router';
import { Button, Space, Typography } from 'antd';
import { OvertimeUsageTab } from '@/pages/app/salary-service/admin/AdminSalarySettingsPage';

export function AdminOvertimeUsagePage() {
  const navigate = useNavigate();

  return (
    <Space direction="vertical" className="tw-w-full" size={16}>
      <div className="tw-flex tw-flex-wrap tw-items-start tw-justify-between tw-gap-3">
        <div>
          <Typography.Title level={1} className="!tw-m-0 !tw-text-slate-900">
            초과 근무 현황
          </Typography.Title>
          <Typography.Paragraph type="secondary" className="!tw-mb-0 !tw-mt-1 !tw-text-sm">
            직원들의 이번 달 실측/승인 초과 근무 시간과 회사 월 한도(주52시간/월한도) 대비 사용률을 확인합니다.
          </Typography.Paragraph>
        </div>
        <Button onClick={() => navigate({ to: '/app/attendance/company' })}>
          근태 현황으로 이동
        </Button>
      </div>
      <OvertimeUsageTab />
    </Space>
  );
}
