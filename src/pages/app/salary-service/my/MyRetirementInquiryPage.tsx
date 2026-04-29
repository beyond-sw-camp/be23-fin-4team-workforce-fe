/** /app/payroll/retirement — 직원 본인 퇴직금 조회 (시뮬레이터)
 *
 *  화면 구성
 *  - 좌상단 [정산 시작일 (입사일, readonly)] [예상 퇴직일 DatePicker] [↻] [계산하기]
 *  - 좌하단 [예상 퇴직금 큰 숫자] [재직일수]
 *  - 우측  [기본정보 카드: 정산 시작일]
 *  - 우상단 [중간정산 허용대상 안내 Popover]
 *
 *  화면 진입 시 오늘 날짜로 자동 시뮬 → 입사일 + 결과 받음
 */
import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Alert,
  App,
  Button,
  Card,
  Col,
  Collapse,
  DatePicker,
  Descriptions,
  Popover,
  Row,
  Space,
  Tag,
  Typography,
} from 'antd';
import { ReloadOutlined, FileTextOutlined } from '@ant-design/icons';
import dayjs, { type Dayjs } from 'dayjs';
import { salaryApi } from '@/features/salary-service/api/salaryApi';
import { memberApi } from '@/features/member/api/memberApi';
import { useAuth } from '@/features/auth/useAuth';
import type { RetirementSimRes } from '@/features/salary-service/types';

const RETIREMENT_TYPE_KO: Record<string, string> = {
  LEGAL: '법정 퇴직금',
  DB: 'DB형 퇴직연금',
  DC: 'DC형 퇴직연금',
};

function formatDateDot(s: string | undefined | null) {
  if (!s) return '—';
  return s.replace(/-/g, '.');
}

function formatWon(n: number) {
  return n.toLocaleString('ko-KR');
}

const MID_SETTLE_INFO = (
  <div style={{ maxWidth: 360 }}>
    <Typography.Paragraph className="!tw-text-xs !tw-mb-2">
      <b>중간정산 허용 대상 (근로자퇴직급여보장법 시행령 제3조)</b>
    </Typography.Paragraph>
    <ul className="tw-text-xs tw-list-disc tw-pl-4 tw-text-slate-700 tw-leading-5">
      <li>무주택자 본인 명의 주택 구입</li>
      <li>무주택자 전세금·보증금 부담</li>
      <li>본인·가족 6개월 이상 요양</li>
      <li>5년 이내 파산·개인회생 결정</li>
      <li>임금피크제 적용</li>
      <li>천재지변 등 고용노동부 인정 사유</li>
    </ul>
    <Typography.Paragraph type="secondary" className="!tw-text-xs !tw-mb-0 tw-mt-2">
      해당 사유 시 회사 인사팀에 문의하세요.
    </Typography.Paragraph>
  </div>
);

export function MyRetirementInquiryPage() {
  const { message } = App.useApp();
  const { user } = useAuth();
  const memberId = user?.id;

  const [resignDate, setResignDate] = useState<Dayjs>(() => dayjs());
  const [result, setResult] = useState<RetirementSimRes | null>(null);

  // 본인 입사일 조회
  const meQ = useQuery({
    queryKey: ['member', 'detail', 'me', memberId ?? ''],
    queryFn: () => memberApi.detailOrNull(memberId ?? ''),
    enabled: Boolean(memberId),
  });

  const profileJoinDate = meQ.data?.joinDate ?? null;

  const simulateM = useMutation({
    mutationFn: (date: Dayjs) =>
      // 백엔드가 joinDate 자동 조회 프론트는 resignDate 만 보내면 됨
      salaryApi.retirement.simulateMine({
        resignDate: date.format('YYYY-MM-DD'),
      }),
    onSuccess: (res) => setResult(res),
    onError: (e: Error) => message.error(e.message || '시뮬레이션 실패'),
  });

  // 화면 진입 시 자동 시뮬 호출 안 함 [계산하기] 클릭 시점에만 실행
  // 정산 시작일 표시는 profileJoinDate 로 미리 채워둠

  const handleReset = () => {
    const today = dayjs();
    setResignDate(today);
    setResult(null);
  };

  const handleCalculate = () => {
    simulateM.mutate(resignDate);
  };

  const joinDateText = formatDateDot(result?.joinDate ?? profileJoinDate);
  const estimated = result?.estimatedAmount ?? 0;
  const days = result?.serviceDays;

  return (
    <Space direction="vertical" className="tw-w-full" size={16}>
      {/* 상단 헤더 */}
      <div className="tw-flex tw-flex-wrap tw-justify-between tw-items-center tw-gap-3">
        <div>
          <Typography.Title level={2} className="!tw-m-0 !tw-text-slate-900">
            퇴직금 조회
          </Typography.Title>
        </div>
        <Popover content={MID_SETTLE_INFO} trigger="click" placement="bottomRight">
          <Button icon={<FileTextOutlined />}>중간정산 허용대상</Button>
        </Popover>
      </div>

      <Row gutter={16}>
        {/* 좌측 — 예상 퇴직금 조회 입력 + 계산하기 버튼 */}
        <Col xs={24} lg={9}>
          <Card
            className="tw-h-full"
            title={
              <Space size={6}>
                <span>예상 퇴직금 조회</span>
                <Typography.Text type="secondary" className="!tw-text-xs">ⓘ</Typography.Text>
              </Space>
            }
          >
            <div className="tw-grid tw-grid-cols-[90px_1fr] tw-gap-y-3 tw-items-center">
              <span className="tw-text-sm tw-text-slate-600">정산 시작일</span>
              <input
                className="tw-border tw-border-slate-200 tw-rounded tw-px-3 tw-py-1.5 tw-bg-slate-50 tw-text-slate-700"
                value={joinDateText}
                readOnly
              />
              <span className="tw-text-sm tw-text-slate-600">예상 퇴직일</span>
              <DatePicker
                value={resignDate}
                onChange={(d) => d && setResignDate(d)}
                format="YYYY.MM.DD"
                allowClear={false}
              />
            </div>
            <div className="tw-flex tw-justify-center tw-gap-2 tw-mt-4">
              <Button icon={<ReloadOutlined />} onClick={handleReset} />
              <Button type="primary" onClick={handleCalculate} loading={simulateM.isPending}>
                계산하기
              </Button>
            </div>
          </Card>
        </Col>

        {/* 가운데 — 예상 퇴직금 큰 숫자 */}
        <Col xs={24} lg={7}>
          <Card className="tw-h-full">
            <div className="tw-text-sm tw-text-slate-500">예상 퇴직금</div>
            <div className="tw-text-right tw-mt-6">
              <Typography.Title level={1} className="!tw-m-0">
                {formatWon(estimated)}
                <span className="tw-text-2xl tw-ml-1 tw-font-normal">원</span>
              </Typography.Title>
              <div className="tw-text-xs tw-text-slate-400 tw-mt-1">
                재직일수 {days != null ? `${days}일` : '-'}
              </div>
            </div>

            {result && !result.eligible && (
              <Alert
                type="warning"
                showIcon
                className="tw-mt-3"
                message="근속 1년 미만 — 법정 퇴직금 지급 대상이 아닙니다."
              />
            )}
          </Card>
        </Col>

        {/* 우측 — 기본정보 */}
        <Col xs={24} lg={8}>
          <Card title="기본정보" className="tw-h-full">
            <Typography.Title level={4} className="!tw-m-0">
              퇴직금
            </Typography.Title>
            <hr className="tw-my-3 tw-border-slate-200" />

            <div className="tw-grid tw-grid-cols-2 tw-gap-y-2 tw-text-sm">
              <span className="tw-text-slate-500">정산 시작일</span>
              <span className="tw-text-right tw-font-medium">{joinDateText}</span>

              {result && (
                <>
                  <span className="tw-text-slate-500">제도</span>
                  <span className="tw-text-right">
                    <Tag color={
                      result.retirementType === 'DC' ? 'green'
                        : result.retirementType === 'DB' ? 'blue'
                          : 'default'
                    }>
                      {RETIREMENT_TYPE_KO[result.retirementType] ?? result.retirementType}
                    </Tag>
                  </span>

                  <span className="tw-text-slate-500">평균 월급</span>
                  <span className="tw-text-right tw-font-medium">
                    {formatWon(result.avgMonthlyWage)}원
                  </span>
                </>
              )}
            </div>

            {result?.modeDescription && (
              <Typography.Paragraph type="secondary" className="!tw-mt-3 !tw-mb-0 !tw-text-xs">
                {result.modeDescription}
              </Typography.Paragraph>
            )}
          </Card>
        </Col>
      </Row>

      {/* 예상 퇴직금 상세 산출내역 펼침 카드 */}
      {result && (
        <Collapse
          defaultActiveKey={['detail']}
          items={[
            {
              key: 'detail',
              label: <span className="tw-font-medium tw-text-slate-700">예상 퇴직금 상세 산출내역</span>,
              children: <RetirementBreakdown result={result} />,
            },
          ]}
        />
      )}

      {result?.disclaimer && (
        <Alert
          type="info"
          showIcon
          message={result.disclaimer}
        />
      )}
    </Space>
  );
}

/* -----------------------------------------------------------
   예상 퇴직금 상세 산출내역
       평균급여 / 평균상여 / 평균임금 / 평균 근속기간 / 근속월수 / 근속일수
       예상 퇴직 소득세 / 예상 퇴직 주민세 / 국민연금 퇴직 전환금 / 예상 공제 총액
       예상 퇴직금 − 예상 공제 총액 = 예상 실 지급액
   추정 항목 (백엔드 미구현) 은 0 원으로 표시 후 안내
   ----------------------------------------------------------- */
function RetirementBreakdown({ result }: { result: RetirementSimRes }) {
  const avgSalary = result.avgMonthlyWage ?? 0;
  // 평균상여 / 국민연금 전환금 백엔드 미구현 0 으로 표기
  const avgBonus = 0;
  const avgWage = avgSalary + avgBonus;

  // 근속 기간 — 일수 / 월수
  const days = result.serviceDays ?? 0;
  const months =
    result.joinDate && result.resignDate
      ? dayjs(result.resignDate).diff(dayjs(result.joinDate), 'month')
      : Math.floor(days / 30);

  // 퇴직소득세 / 주민세 — 정확 계산은 별도 룰 필요 (퇴직소득공제 등)
  // 현재는 백엔드 미구현 0 표기 향후 PayrollCalculationService 확장 시 채움
  const incomeTax = 0;
  const localTax = 0;
  const npConversion = 0;
  const totalDeduction = incomeTax + localTax + npConversion;
  const netPayout = (result.estimatedAmount ?? 0) - totalDeduction;

  const fmt = (n: number) => `${n.toLocaleString('ko-KR')}원`;

  return (
    <div className="tw-flex tw-flex-col tw-gap-6">
      {/* 0. 평균임금 정확 산정 — 근로기준법 제2조 1항 6호 + 시행령 제2조 */}
      <AverageWageBreakdown result={result} />

      {/* 1. 예상 퇴직금 및 기타내역 — bordered Descriptions 2행 3열 */}
      <section>
        <Typography.Title level={5} className="!tw-mt-0 !tw-mb-3">
          예상 퇴직금 및 기타내역
        </Typography.Title>
        <Descriptions
          bordered
          size="middle"
          column={{ xs: 1, sm: 2, md: 3 }}
          labelStyle={{ width: '15%', backgroundColor: '#fafafa' }}
          contentStyle={{ width: '18.33%', textAlign: 'right' }}
          items={[
            { key: 'avgSalary', label: '평균급여',     children: fmt(avgSalary) },
            { key: 'avgBonus',  label: '평균상여',     children: fmt(avgBonus) },
            { key: 'avgWage',   label: '평균임금',     children: fmt(avgWage) },
            { key: 'avgPeriod', label: '평균 근속기간', children: `${days.toLocaleString('ko-KR')}일` },
            { key: 'months',    label: '근속월수',     children: `${months.toLocaleString('ko-KR')}개월` },
            { key: 'days',      label: '근속일수',     children: `${days.toLocaleString('ko-KR')}일` },
          ]}
        />
      </section>

      {/* 2. 예상 공제내역 — 위 표와 동일한 3열 구조. 마지막 행 합계만 span 3 */}
      <section>
        <Typography.Title level={5} className="!tw-mt-0 !tw-mb-3">
          예상 공제내역
        </Typography.Title>
        <Descriptions
          bordered
          size="middle"
          column={{ xs: 1, sm: 2, md: 3 }}
          labelStyle={{ width: '15%', backgroundColor: '#fafafa' }}
          contentStyle={{ width: '18.33%', textAlign: 'right' }}
          items={[
            { key: 'incomeTax',    label: '예상 퇴직 소득세',     children: fmt(incomeTax) },
            { key: 'localTax',     label: '예상 퇴직 주민세',     children: fmt(localTax) },
            { key: 'npConversion', label: '국민연금 퇴직 전환금', children: fmt(npConversion) },
            {
              key: 'totalDeduction',
              label: '예상 공제 총액',
              children: <strong>{fmt(totalDeduction)}</strong>,
            },
            // 위쪽 표와 동일한 3열 구조 유지 위해 빈 셀 2개 채움
            { key: 'pad1', label: '', children: '' },
            { key: 'pad2', label: '', children: '' },
          ]}
        />
      </section>

      {/* 3. 예상 실 지급액 */}
      <section className="tw-bg-blue-50 tw-rounded tw-px-6 tw-py-5">
        <div className="tw-flex tw-items-center tw-justify-center tw-gap-6 tw-flex-wrap">
          <SumBox label="예상 퇴직금" value={fmt(result.estimatedAmount ?? 0)} />
          <span className="tw-text-2xl tw-text-slate-400">−</span>
          <SumBox label="예상 공제 총액" value={fmt(totalDeduction)} />
          <span className="tw-text-2xl tw-text-slate-400">=</span>
          <SumBox label="예상 실 지급액" value={fmt(netPayout)} primary />
        </div>
      </section>
    </div>
  );
}

function SumBox({ label, value, primary }: { label: string; value: string; primary?: boolean }) {
  return (
    <div className="tw-flex tw-flex-col tw-items-center">
      <span className="tw-text-xs tw-text-slate-500 tw-mb-1">{label}</span>
      <span
        className={`tw-rounded tw-bg-white tw-border tw-border-slate-200 tw-px-4 tw-py-2 tw-text-base ${
          primary ? 'tw-font-bold tw-text-[#2563EB]' : 'tw-font-medium tw-text-slate-800'
        }`}
      >
        {value}
      </span>
    </div>
  );
}

/* -----------------------------------------------------------
   평균임금 정확 산정 breakdown
     근로기준법 제2조 1항 6호 평균임금 정의
       (직전 3개월 임금총액 + 12개월 상여 환산 + 12개월 연차수당 환산) / 3개월 일수
     시행령 제2조 평균임금 < 통상시급 일액 이면 통상시급 일액 적용
   ----------------------------------------------------------- */
function AverageWageBreakdown({ result }: { result: RetirementSimRes }) {
  // 백엔드 새 필드 미존재 시 (DC 또는 구버전 응답) breakdown 숨김
  if (
    result.appliedDailyWage == null &&
    result.averageDailyWage == null &&
    result.basePeriodPayment == null
  ) {
    return null;
  }

  const fmt = (n?: number) =>
    n == null ? '—' : `${Number(n).toLocaleString('ko-KR')}원`;

  const isAverage = result.appliedBasis === 'AVERAGE';
  const isOrdinary = result.appliedBasis === 'ORDINARY';

  return (
    <section>
      <div className="tw-flex tw-items-center tw-flex-wrap tw-gap-2 tw-mb-3">
        <Typography.Title level={5} className="!tw-mt-0 !tw-mb-0">
          평균임금 산정 내역
        </Typography.Title>
        <Tag color="default">근로기준법 제2조 1항 6호</Tag>
        {(result.excludedLeaveDays ?? 0) > 0 && (
          <Tag color="orange">
            휴직기간 {result.excludedLeaveDays}일 제외 ({result.excludedLeaveCount ?? 0}건) · 시행령 제2조
          </Tag>
        )}
      </div>

      <Descriptions
        bordered
        size="middle"
        column={{ xs: 1, sm: 2, md: 3 }}
        labelStyle={{ width: '15%', backgroundColor: '#fafafa' }}
        contentStyle={{ width: '18.33%', textAlign: 'right' }}
        items={[
          {
            key: 'basePeriod',
            label: '직전 3개월 임금총액',
            children: fmt(result.basePeriodPayment),
          },
          {
            key: 'basePeriodDays',
            label: '3개월 일수',
            children: (() => {
              const base = result.basePeriodDays;
              const excluded = result.excludedLeaveDays ?? 0;
              const adjusted = result.adjustedPeriodDays;
              if (base == null) return '—';
              if (excluded > 0) {
                return (
                  <span>
                    <Typography.Text delete type="secondary">{base}일</Typography.Text>
                    {' → '}
                    <strong>{adjusted ?? base - excluded}일</strong>
                    <Typography.Text type="secondary" className="!tw-ml-1 !tw-text-xs">
                      (휴직 {excluded}일 제외)
                    </Typography.Text>
                  </span>
                );
              }
              return `${base}일`;
            })(),
          },
          {
            key: 'simpleAvg',
            label: '단순 일평균',
            children: fmt(result.simpleDailyAverage),
          },
          {
            key: 'bonusAdd',
            label: '12개월 상여 환산',
            children: (
              <span>
                {fmt(result.bonusAddition12mAvg)}
                <Typography.Text type="secondary" className="!tw-ml-1 !tw-text-xs">
                  × 3/12
                </Typography.Text>
              </span>
            ),
          },
          {
            key: 'leaveAdd',
            label: '12개월 연차수당 환산',
            children: (
              <span>
                {fmt(result.unusedLeaveAddition12mAvg)}
                <Typography.Text type="secondary" className="!tw-ml-1 !tw-text-xs">
                  × 3/12
                </Typography.Text>
              </span>
            ),
          },
          {
            key: 'avgDaily',
            label: '평균임금 일액',
            children: (
              <span className={isAverage ? 'tw-font-bold tw-text-emerald-600' : ''}>
                {fmt(result.averageDailyWage)}
              </span>
            ),
          },
          {
            key: 'ordinaryDaily',
            label: '통상시급 일액',
            children: (
              <span className={isOrdinary ? 'tw-font-bold tw-text-blue-600' : ''}>
                {fmt(result.ordinaryDailyWage)}
              </span>
            ),
          },
          {
            key: 'appliedDaily',
            label: (
              <span>
                <strong>적용 일액</strong>
                <Typography.Text type="secondary" className="!tw-ml-1 !tw-text-xs">
                  시행령 제2조
                </Typography.Text>
              </span>
            ),
            children: (
              <span className="tw-font-bold tw-text-[#2563EB]">
                {fmt(result.appliedDailyWage)}
              </span>
            ),
          },
          {
            key: 'appliedBasis',
            label: '적용 기준',
            children: isAverage ? (
              <Tag color="green">평균임금</Tag>
            ) : isOrdinary ? (
              <Tag color="blue">통상시급</Tag>
            ) : (
              <Tag>—</Tag>
            ),
          },
        ]}
      />

      <Alert
        type={isOrdinary ? 'warning' : 'info'}
        showIcon
        className="!tw-mt-3"
        message={
          isOrdinary
            ? '평균임금이 통상시급 일액보다 적어 시행령 제2조에 따라 통상시급 일액이 적용되었습니다.'
            : '평균임금 일액이 통상시급 일액 이상이므로 평균임금이 적용되었습니다.'
        }
        description={
          <Typography.Text type="secondary" className="!tw-text-xs">
            퇴직금 = 적용 일액 × 30 × 근속일수 / 365
          </Typography.Text>
        }
      />
    </section>
  );
}
