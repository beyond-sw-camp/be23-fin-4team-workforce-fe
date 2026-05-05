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
            초과근무 현황
          </Typography.Title>
          <Typography.Paragraph type="secondary" className="!tw-mb-0 !tw-mt-1 !tw-text-sm">
            이번 달 직원별 초과근무시간과 월 한도 대비 비율을 확인할 수 있어요.
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
