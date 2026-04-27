/** /app/attendance/comprehensive-ot — 포괄임금 OT 현황 (관리자)
 *
 *  포괄임금제 회사 직원의 이번 달 누적 OT vs 고정 OT 한도 모니터링.
 *  배치가 매주 월요일 04:00 기준 알림 발송.
 */
import { Space, Typography } from 'antd';
import { ComprehensiveOvertimeTab } from '@/pages/app/salary-service/admin/AdminSalarySettingsPage';

export function AdminComprehensiveOvertimePage() {
  return (
    <Space direction="vertical" className="tw-w-full" size={16}>
      <div>
        <Typography.Title level={1} className="!tw-m-0 !tw-text-slate-900">
          포괄임금 OT 현황
        </Typography.Title>
        <Typography.Paragraph type="secondary" className="!tw-mb-0 !tw-mt-1 !tw-text-sm">
          포괄임금제 정책을 적용받는 구성원의 이번 달 누적 OT 와 고정 한도를 비교합니다.
        </Typography.Paragraph>
      </div>
      <ComprehensiveOvertimeTab />
    </Space>
  );
}
