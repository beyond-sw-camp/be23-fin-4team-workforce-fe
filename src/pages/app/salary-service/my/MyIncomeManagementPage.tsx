/** /app/income — 소득관리 (직원 본인)
 *
 *  Phase 2 보너스 정책 기반 예상 카드 추가
 *  - 활성 BonusPolicy + 본인 활성 Salary 기반 정기/성과/명절 보너스 예상액 계산
 *  - 은행 계좌 / 원천징수는 placeholder 유지
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Card, Empty, Space, Statistic, Tabs, Tag, Tooltip, Typography } from 'antd';
import {
  BankOutlined,
  GiftOutlined,
  PercentageOutlined,
  TrophyOutlined,
} from '@ant-design/icons';
import { salaryApi } from '@/features/salary-service/api/salaryApi';
import { useAuth } from '@/features/auth/useAuth';
import type { BonusPolicy, Salary } from '@/features/salary-service/types';

function formatWon(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return '—';
  return `${Number(n).toLocaleString('ko-KR')}원`;
}

function activeAt(salary: Salary, today: string): boolean {
  if (!salary.effectiveFrom) return false;
  if (salary.effectiveFrom > today) return false;
  return !salary.effectiveTo || salary.effectiveTo >= today;
}

function ComingSoon({ title, description }: { title: string; description: string }) {
  return (
    <div className="tw-py-12">
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description={
          <div>
            <Typography.Text strong>{title}</Typography.Text>
            <br />
            <Typography.Text type="secondary" className="tw-text-xs">
              {description}
            </Typography.Text>
          </div>
        }
      />
    </div>
  );
}

/**
 * 보너스 예상 카드 — 활성 정책 + 본인 활성 Salary 기반
 */
function BonusForecastSection() {
  const { user } = useAuth();
  const memberId = user?.id;

  const policyQ = useQuery({
    queryKey: ['salary', 'bonus-policy', 'active'],
    queryFn: () => salaryApi.bonusPolicy.getActive(),
    staleTime: 60_000,
  });

  const salariesQ = useQuery({
    queryKey: ['salary', 'salaries', 'member', memberId],
    queryFn: () => salaryApi.salary.getByMemberId(memberId as string),
    enabled: Boolean(memberId),
    staleTime: 60_000,
  });

  const forecast = useMemo(() => {
    const policy: BonusPolicy | undefined = policyQ.data;
    const salaries = salariesQ.data ?? [];
    if (!policy) return null;

    const today = new Date().toISOString().slice(0, 10);
    const activeSalary = salaries.find((s) => activeAt(s, today));
    const baseSalary = activeSalary?.baseSalary ?? 0;

    // 정기상여 회당 예상액
    const regularUsed = policy.useRegularBonusYn === 'Y';
    const regularAnnualRate = policy.regularBonusAnnualRate ?? 0;
    const regularCount = policy.regularBonusPaymentCount ?? 0;
    const regularPerPayment =
      regularUsed && baseSalary > 0 && regularCount > 0
        ? Math.floor(baseSalary * (regularAnnualRate / 100) / regularCount)
        : 0;
    const regularAnnualTotal =
      regularUsed && baseSalary > 0
        ? Math.floor(baseSalary * (regularAnnualRate / 100))
        : 0;

    // 성과급 1회 최대
    const perfUsed = policy.usePerformanceBonusYn === 'Y';
    const perfMaxRate = policy.performanceBonusMaxRate ?? 0;
    const perfMaxAmount =
      perfUsed && baseSalary > 0
        ? Math.floor(baseSalary * (perfMaxRate / 100))
        : 0;

    // 명절상여 1회 예상
    const holidayUsed = policy.useHolidayBonusYn === 'Y';
    const holidayValue = policy.holidayBonusValue ?? 0;
    const holidayPerPayment =
      holidayUsed
        ? policy.holidayBonusType === 'AMOUNT'
          ? holidayValue
          : baseSalary > 0
            ? Math.floor(baseSalary * (holidayValue / 100))
            : 0
        : 0;

    return {
      policy,
      baseSalary,
      hasSalary: baseSalary > 0,
      regularUsed,
      regularAnnualRate,
      regularCount,
      regularPerPayment,
      regularAnnualTotal,
      perfUsed,
      perfMaxRate,
      perfMaxAmount,
      holidayUsed,
      holidayType: policy.holidayBonusType,
      holidayValue,
      holidayPerPayment,
    };
  }, [policyQ.data, salariesQ.data]);

  if (policyQ.isLoading || salariesQ.isLoading) {
    return (
      <Card loading className="tw-border-slate-200/80 tw-shadow-sm">
        보너스 예상 로딩중
      </Card>
    );
  }

  if (!forecast) {
    return (
      <Alert
        type="info"
        showIcon
        message="회사 보너스 정책이 등록되어 있지 않습니다."
        description="관리자가 보너스 정책을 등록하면 본인 기본급 기준 예상액이 표시됩니다."
      />
    );
  }

  const { policy } = forecast;
  const allDisabled =
    !forecast.regularUsed && !forecast.perfUsed && !forecast.holidayUsed;

  return (
    <Space direction="vertical" className="tw-w-full" size={12}>
      <Alert
        type={forecast.hasSalary ? 'info' : 'warning'}
        showIcon
        message={
          <span className="tw-flex tw-flex-wrap tw-items-center tw-gap-2">
            <b>현재 적용 보너스 정책</b>
            <Tag color="blue">
              본인 기본급 {forecast.hasSalary ? formatWon(forecast.baseSalary) : '미등록'}
            </Tag>
            {policy.effectiveFrom && (
              <Tag>
                {policy.effectiveFrom} ~ {policy.effectiveTo ?? '진행중'}
              </Tag>
            )}
          </span>
        }
        description={
          !forecast.hasSalary ? (
            <Typography.Text type="warning">
              본인 활성 급여 정보가 없어 예상액을 계산할 수 없습니다. 관리자에게 문의하세요.
            </Typography.Text>
          ) : allDisabled ? (
            <Typography.Text type="secondary">
              회사 정책의 모든 보너스 항목이 비활성 상태입니다.
            </Typography.Text>
          ) : null
        }
      />

      <div className="tw-grid tw-grid-cols-1 md:tw-grid-cols-3 tw-gap-3">
        {/* 정기상여 */}
        <Card
          size="small"
          className="tw-border-slate-200/80 tw-shadow-sm"
          title={
            <span>
              <GiftOutlined /> 정기상여
            </span>
          }
        >
          {forecast.regularUsed ? (
            <Space direction="vertical" size={4} className="tw-w-full">
              <Statistic
                title={`연 누계 ${forecast.regularAnnualRate}% / ${forecast.regularCount}회`}
                value={forecast.regularPerPayment}
                suffix="원"
                formatter={(v) => Number(v).toLocaleString('ko-KR')}
                valueStyle={{ color: '#1677ff', fontSize: 22 }}
              />
              <Tooltip title="회사 정책 기준 본인 기본급에 비율을 적용한 예상액 (실제 지급액과 다를 수 있음)">
                <Typography.Text type="secondary" className="tw-text-xs">
                  회당 예상액 · 연 누적 {formatWon(forecast.regularAnnualTotal)}
                </Typography.Text>
              </Tooltip>
            </Space>
          ) : (
            <Typography.Text type="secondary">정책 미사용</Typography.Text>
          )}
        </Card>

        {/* 성과급 */}
        <Card
          size="small"
          className="tw-border-slate-200/80 tw-shadow-sm"
          title={
            <span>
              <TrophyOutlined /> 성과급 (최대)
            </span>
          }
        >
          {forecast.perfUsed ? (
            <Space direction="vertical" size={4} className="tw-w-full">
              <Statistic
                title={`1회 최대 ${forecast.perfMaxRate}%`}
                value={forecast.perfMaxAmount}
                suffix="원"
                formatter={(v) => Number(v).toLocaleString('ko-KR')}
                valueStyle={{ color: '#10b981', fontSize: 22 }}
              />
              {policy.performanceBonusBasis && (
                <Typography.Text type="secondary" className="tw-text-xs">
                  기준: {policy.performanceBonusBasis}
                </Typography.Text>
              )}
              <Typography.Text type="secondary" className="tw-text-xs">
                실제 지급은 평가 결과에 따라 달라집니다.
              </Typography.Text>
            </Space>
          ) : (
            <Typography.Text type="secondary">정책 미사용</Typography.Text>
          )}
        </Card>

        {/* 명절상여 */}
        <Card
          size="small"
          className="tw-border-slate-200/80 tw-shadow-sm"
          title={
            <span>
              <GiftOutlined /> 명절상여
            </span>
          }
        >
          {forecast.holidayUsed ? (
            <Space direction="vertical" size={4} className="tw-w-full">
              <Statistic
                title={
                  forecast.holidayType === 'RATE'
                    ? `기본급 ${forecast.holidayValue}%`
                    : '정액 지급'
                }
                value={forecast.holidayPerPayment}
                suffix="원"
                formatter={(v) => Number(v).toLocaleString('ko-KR')}
                valueStyle={{ color: '#d4af37', fontSize: 22 }}
              />
              <Typography.Text type="secondary" className="tw-text-xs">
                설/추석 등 명절 단위 지급 예상액
              </Typography.Text>
            </Space>
          ) : (
            <Typography.Text type="secondary">정책 미사용</Typography.Text>
          )}
        </Card>
      </div>

      <Typography.Text type="secondary" className="tw-text-xs">
        * 위 금액은 회사 정책 기준 단순 계산 예상치이며, 실제 지급액은 평가 결과 / 회사 사정 / 세금 공제 등에 따라 달라질 수 있습니다.
      </Typography.Text>
    </Space>
  );
}

export function MyIncomeManagementPage() {
  return (
    <Space direction="vertical" className="tw-w-full" size={16}>
      <div>
        <Typography.Title level={4} className="!tw-m-0 !tw-text-slate-900">
          소득관리
        </Typography.Title>
        <Typography.Paragraph type="secondary" className="!tw-mb-0 !tw-mt-1 !tw-text-sm">
          본인 보너스 예상 / 급여 입금 계좌 / 원천징수 세액 조정을 한 곳에서 확인합니다
        </Typography.Paragraph>
      </div>

      <Tabs
        defaultActiveKey="bonus-forecast"
        items={[
          {
            key: 'bonus-forecast',
            label: (
              <span>
                <TrophyOutlined /> 보너스 예상
              </span>
            ),
            children: <BonusForecastSection />,
          },
          {
            key: 'bank-account',
            label: (
              <span>
                <BankOutlined /> 은행 계좌
              </span>
            ),
            children: (
              <ComingSoon
                title="은행 계좌 관리는 준비 중입니다"
                description="다음 단계에서 급여 계좌 등록 / 변경 / 해지 기능이 추가됩니다"
              />
            ),
          },
          {
            key: 'withholding-tax',
            label: (
              <span>
                <PercentageOutlined /> 원천징수 세액 조정
              </span>
            ),
            children: (
              <ComingSoon
                title="원천징수 세액 조정은 준비 중입니다"
                description="다음 단계에서 80% / 100% / 120% 비율 신청 기능이 추가됩니다"
              />
            ),
          },
        ]}
      />
    </Space>
  );
}
