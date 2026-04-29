/** /app/attendance/overtime-status — 초과근무 현황 (관리자)
 *
 *  포괄임금제 회사 직원의 이번 달 누적 OT vs 고정 OT 한도 모니터링.
 *  배치가 매주 월요일 04:00 기준 알림 발송.
 */
import { useNavigate } from '@tanstack/react-router';
import { Button, Space, Typography } from 'antd';
import { ComprehensiveOvertimeTab } from '@/pages/app/salary-service/admin/AdminSalarySettingsPage';

export function AdminComprehensiveOvertimePage() {
  const navigate = useNavigate();

  return (
    <Space direction="vertical" className="tw-w-full" size={16}>
      <div className="tw-flex tw-flex-wrap tw-items-start tw-justify-between tw-gap-3">
        <div>
          <Typography.Title level={1} className="!tw-m-0 !tw-text-slate-900">
            초과 근무 현황
          </Typography.Title>
          <Typography.Paragraph type="secondary" className="!tw-mb-0 !tw-mt-1 !tw-text-sm">
            직원들의 이번 달 누적 초과 근무 시간, 고정 한도, 회사 커스텀 일/월 한도를 함께 확인합니다.
          </Typography.Paragraph>
        </div>
        <Button onClick={() => navigate({ to: '/app/attendance/company' })}>
          근태 현황으로 이동
        </Button>
      </div>
      <ComprehensiveOvertimeTab />
    </Space>
  );
}
