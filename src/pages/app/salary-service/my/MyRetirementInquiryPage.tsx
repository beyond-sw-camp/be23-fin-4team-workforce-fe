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
import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Alert,
  App,
  Button,
  Card,
  Col,
  DatePicker,
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

  const joinDate = meQ.data?.joinDate ?? null;

  const simulateM = useMutation({
    mutationFn: (date: Dayjs) => {
      if (!joinDate) {
        return Promise.reject(new Error('입사일 정보를 불러오지 못했습니다.'));
      }
      return salaryApi.retirement.simulateMine({
        joinDate,
        resignDate: date.format('YYYY-MM-DD'),
      });
    },
    onSuccess: (res) => setResult(res),
    onError: (e: Error) => message.error(e.message || '시뮬레이션 실패'),
  });

  // 입사일 로딩 후 오늘 날짜로 자동 시뮬
  useEffect(() => {
    if (joinDate) simulateM.mutate(dayjs());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joinDate]);

  const handleReset = () => {
    const today = dayjs();
    setResignDate(today);
    simulateM.mutate(today);
  };

  const handleCalculate = () => {
    simulateM.mutate(resignDate);
  };

  const joinDateText = formatDateDot(joinDate);
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
        {/* 좌측 — 시뮬레이션 입력 + 결과 */}
        <Col xs={24} lg={16}>
          <Space direction="vertical" className="tw-w-full" size={12}>
            {/* 입력 카드 */}
            <Card
              title={
                <Space size={6}>
                  <span>예상 퇴직금 조회</span>
                  <Typography.Text type="secondary" className="!tw-text-xs">ⓘ</Typography.Text>
                </Space>
              }
            >
              <div className="tw-grid tw-grid-cols-[100px_1fr] tw-gap-y-3 tw-items-center">
                <span className="tw-text-sm tw-text-slate-600">정산 시작일</span>
                <input
                  className="tw-border tw-border-slate-200 tw-rounded tw-px-3 tw-py-1.5 tw-bg-slate-50 tw-text-slate-700 tw-w-[200px]"
                  value={joinDateText}
                  readOnly
                />
                <span className="tw-text-sm tw-text-slate-600">예상 퇴직일</span>
                <DatePicker
                  value={resignDate}
                  onChange={(d) => d && setResignDate(d)}
                  format="YYYY.MM.DD"
                  allowClear={false}
                  style={{ width: 200 }}
                />
              </div>
              <div className="tw-flex tw-justify-center tw-gap-2 tw-mt-4">
                <Button icon={<ReloadOutlined />} onClick={handleReset} />
                <Button type="primary" onClick={handleCalculate} loading={simulateM.isPending}>
                  계산하기
                </Button>
              </div>
            </Card>

            {/* 결과 카드 */}
            <Card>
              <div className="tw-text-sm tw-text-slate-500">예상 퇴직금</div>
              <div className="tw-text-right">
                <Typography.Title level={1} className="!tw-m-0 !tw-mt-1">
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
              {result && result.disclaimer && (
                <Alert
                  type="info"
                  showIcon
                  className="tw-mt-3"
                  message={result.disclaimer}
                />
              )}
            </Card>
          </Space>
        </Col>

        {/* 우측 — 기본정보 */}
        <Col xs={24} lg={8}>
          <Card title="기본정보">
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
    </Space>
  );
}
