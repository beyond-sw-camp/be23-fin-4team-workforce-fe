/**
 * /app/attendance/work-time
 * 본인 주간 근무시간 요약, 법정 52시간(총) / 12시간(연장) 대비 사용률 자가 체크.
 * 임계치: 75% WARNING, 92% CRITICAL, 100% EXCEEDED.
 */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Card, DatePicker, Descriptions, Progress, Space, Tag, Typography } from 'antd';
import { CheckCircleFilled, ExclamationCircleFilled } from '@ant-design/icons';
import dayjs, { type Dayjs } from 'dayjs';
import { attendanceApi } from '@/features/salary-service/api/attendanceApi';
import type { ComprehensiveOvertimeStatus } from '@/features/salary-service/types';

type Severity = 'normal' | 'warning' | 'critical' | 'exceeded';

function severityOf(percent: number | null | undefined): Severity {
  const p = percent ?? 0;
  if (p >= 100) return 'exceeded';
  if (p >= 92) return 'critical';
  if (p >= 75) return 'warning';
  return 'normal';
}

function percentColor(sev: Severity): string {
  switch (sev) {
    case 'exceeded':
      return '#CF1322';
    case 'critical':
      return '#D4380D';
    case 'warning':
      return '#D48806';
    default:
      return '#2563EB';
  }
}

function formatHm(minutes: number | null | undefined): string {
  const m = Math.max(0, Math.floor(minutes ?? 0));
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return `${h}시간 ${rem}분`;
}

export function MyWorkTimePage() {
  const [picked, setPicked] = useState<Dayjs>(() => dayjs());
  const dateIso = picked.format('YYYY-MM-DD');

  const summaryQ = useQuery({
    queryKey: ['salary', 'attendance', 'my', 'work-time-summary', dateIso],
    queryFn: () => attendanceApi.attendance.getMyWorkTimeSummary(dateIso),
  });

  // 포괄임금제인 경우에만 데이터 반환, 비포괄/미적용이면 null
  const comprehensiveQ = useQuery<ComprehensiveOvertimeStatus | null>({
    queryKey: ['salary', 'attendance', 'my', 'comprehensive-overtime', dateIso],
    queryFn: () => attendanceApi.comprehensiveOvertime.getMy(dateIso),
  });

  const summary = summaryQ.data;
  const comprehensive = comprehensiveQ.data;

  const totalSev = severityOf(summary?.totalUsagePercent);
  const otSev = severityOf(summary?.overtimeUsagePercent);

  const highest = useMemo<Severity>(() => {
    const order: Severity[] = ['normal', 'warning', 'critical', 'exceeded'];
    return order[Math.max(order.indexOf(totalSev), order.indexOf(otSev))];
  }, [totalSev, otSev]);

  const alertConfig = useMemo(() => {
    switch (highest) {
      case 'exceeded':
        return {
          type: 'error' as const,
          message: '법정 한도를 초과했습니다',
          description:
            '주 52시간(총) 또는 주 12시간(연장) 법정 한도를 초과한 상태입니다. 관리자와 즉시 협의가 필요합니다.',
        };
      case 'critical':
        return {
          type: 'error' as const,
          message: '법정 한도 임박',
          description:
            '사용률이 92%를 초과했습니다. 남은 근무시간을 확인하고, 추가 연장근무 신청 전 관리자와 조율하세요.',
        };
      case 'warning':
        return {
          type: 'warning' as const,
          message: '주의 단계',
          description: '사용률이 75%를 초과했습니다. 남은 근무시간을 주기적으로 점검하세요.',
        };
      default:
        return {
          type: 'success' as const,
          message: '정상 범위',
          description: '법정 한도 내 안정적으로 근무 중입니다.',
        };
    }
  }, [highest]);

  return (
    <Space direction="vertical" className="tw-w-full" size={16}>
      <div className="tw-flex tw-flex-wrap tw-items-end tw-justify-between tw-gap-3">
        <div>
          <Typography.Title level={4} className="!tw-m-0 !tw-text-slate-900">
            내 주간 근무시간
          </Typography.Title>
          <Typography.Text type="secondary" className="tw-text-xs">
            법정 주 52시간(총) / 주 12시간(연장) 대비 사용률을 확인하세요.
          </Typography.Text>
        </div>
        <DatePicker
          value={picked}
          onChange={(d) => d && setPicked(d)}
          allowClear={false}
          format="YYYY-MM-DD"
        />
      </div>

      <Alert
        type={alertConfig.type}
        showIcon
        message={alertConfig.message}
        description={alertConfig.description}
      />

      <Card loading={summaryQ.isLoading} className="tw-border-slate-200/80 tw-shadow-sm">
        {summaryQ.isError && (
          <Typography.Text type="danger">주간 근무시간을 불러오지 못했습니다.</Typography.Text>
        )}

        {summary && (
          <Space direction="vertical" className="tw-w-full" size={20}>
            <Descriptions column={{ xs: 1, sm: 2 }} size="small" bordered>
              <Descriptions.Item label="대상 주간">
                {summary.weekStart ?? '—'} ~ {summary.weekEnd ?? '—'}
              </Descriptions.Item>
              <Descriptions.Item label="기준 일자">{dateIso}</Descriptions.Item>
            </Descriptions>

            <div className="tw-grid tw-grid-cols-1 tw-gap-6 md:tw-grid-cols-2">
              <div>
                <div className="tw-mb-2 tw-flex tw-items-baseline tw-justify-between">
                  <Typography.Text strong>주 총 근무 (법정 52시간)</Typography.Text>
                  <Typography.Text type="secondary" className="tw-text-xs">
                    {formatHm(summary.totalWorkedMinutes)} / {formatHm(summary.totalLimitMinutes)}
                  </Typography.Text>
                </div>
                <Progress
                  percent={summary.totalUsagePercent ?? 0}
                  strokeColor={percentColor(totalSev)}
                  status={totalSev === 'exceeded' ? 'exception' : 'normal'}
                />
              </div>

              <div>
                <div className="tw-mb-2 tw-flex tw-items-baseline tw-justify-between">
                  <Typography.Text strong>주 연장근무 (법정 12시간)</Typography.Text>
                  <Typography.Text type="secondary" className="tw-text-xs">
                    {formatHm(summary.overtimeApprovedMinutes)} /{' '}
                    {formatHm(summary.overtimeLimitMinutes)}
                  </Typography.Text>
                </div>
                <Progress
                  percent={summary.overtimeUsagePercent ?? 0}
                  strokeColor={percentColor(otSev)}
                  status={otSev === 'exceeded' ? 'exception' : 'normal'}
                />
              </div>
            </div>

            <div
              className={
                'tw-rounded-md tw-border tw-p-4 ' +
                (summary.weeklyHolidayEligible
                  ? 'tw-border-emerald-200 tw-bg-emerald-50'
                  : 'tw-border-amber-200 tw-bg-amber-50')
              }
            >
              <div className="tw-mb-2 tw-flex tw-items-center tw-justify-between">
                <Space align="center">
                  {summary.weeklyHolidayEligible ? (
                    <CheckCircleFilled className="tw-text-emerald-500" />
                  ) : (
                    <ExclamationCircleFilled className="tw-text-amber-500" />
                  )}
                  <Typography.Text strong>주휴수당 자격 (근기법 55조)</Typography.Text>
                </Space>
                <Tag color={summary.weeklyHolidayEligible ? 'green' : 'orange'}>
                  {summary.weeklyHolidayEligible ? '자격 충족' : '자격 미충족'}
                </Tag>
              </div>

              <Descriptions column={{ xs: 1, sm: 3 }} size="small">
                <Descriptions.Item label="개근 여부">
                  {summary.weeklyAbsentDays === 0 ? (
                    <Tag color="green">개근</Tag>
                  ) : (
                    <Tag color="red">결근 {summary.weeklyAbsentDays ?? 0}일</Tag>
                  )}
                </Descriptions.Item>
                <Descriptions.Item label="주 근무">
                  {formatHm(summary.totalWorkedMinutes)} /{' '}
                  {formatHm(summary.weeklyHolidayMinRequiredMinutes)} 이상
                </Descriptions.Item>
                <Descriptions.Item label="사유">
                  <Typography.Text type="secondary" className="tw-text-xs">
                    {summary.weeklyHolidayReason ?? '—'}
                  </Typography.Text>
                </Descriptions.Item>
              </Descriptions>

              <Typography.Text type="secondary" className="tw-text-xs">
                ※ 월급제는 월급에 주휴수당이 이미 포함되어 있어 별도 지급은 없습니다. 결근이 있는 주에는
                해당 주 주휴 자격이 상실되어 급여에서 차감될 수 있습니다.
              </Typography.Text>
            </div>

            <Typography.Text type="secondary" className="tw-text-xs">
              ※ 총 근무시간은 승인된 연장근무 및 실제 근무분이 모두 합산됩니다. 연장근무 승인분은
              결재 완료된 건만 반영됩니다.
            </Typography.Text>
          </Space>
        )}
      </Card>

      {comprehensive && comprehensive.fixedLimit != null && (
        <Card
          loading={comprehensiveQ.isLoading}
          className="tw-border-slate-200/80 tw-shadow-sm"
          title="내 포괄임금 고정 OT 현황 (이번 달)"
        >
          <Space direction="vertical" className="tw-w-full" size={16}>
            <Descriptions column={{ xs: 1, sm: 2 }} size="small" bordered>
              <Descriptions.Item label="이번 달 누적 OT">
                {formatHm(comprehensive.approvedMinutes)}
              </Descriptions.Item>
              <Descriptions.Item label="고정 한도">
                {formatHm(comprehensive.fixedLimit)}
              </Descriptions.Item>
              <Descriptions.Item label="사용률">
                <Tag color={(comprehensive.usagePercent ?? 0) >= 100 ? 'red'
                  : (comprehensive.usagePercent ?? 0) >= 80 ? 'orange' : 'default'}>
                  {(comprehensive.usagePercent ?? 0).toFixed(1)}%
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="초과분">
                {!comprehensive.exceedMinutes
                  ? <Typography.Text type="secondary">—</Typography.Text>
                  : <Tag color="red">{formatHm(comprehensive.exceedMinutes)}</Tag>}
              </Descriptions.Item>
            </Descriptions>
            <Progress
              percent={Math.min(100, comprehensive.usagePercent ?? 0)}
              strokeColor={
                (comprehensive.usagePercent ?? 0) >= 100 ? '#CF1322'
                  : (comprehensive.usagePercent ?? 0) >= 80 ? '#D48806' : '#2563EB'
              }
              status={(comprehensive.usagePercent ?? 0) >= 100 ? 'exception' : 'normal'}
            />
            <Typography.Text type="secondary" className="tw-text-xs">
              ※ 포괄임금제는 월 기본급에 고정 OT 분이 포함되어 있습니다. 초과분은 다음 급여에 별도
              지급됩니다.
            </Typography.Text>
          </Space>
        </Card>
      )}
    </Space>
  );
}
