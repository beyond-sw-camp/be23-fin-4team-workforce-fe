/**
 * 상여 발행 탭 - 보너스 일괄 발행 (시뮬 + 발행)
 *
 * 흐름:
 *  1) 보너스 유형 선택 (정기상여 / 성과급 / 명절상여) + 지급일 + 비율 입력
 *  2) [시뮬] -> 대상 직원 / 산출액 미리보기 + 정책 한도 검증
 *  3) [일괄 발행] -> PayrollType=PERFORMANCE_BONUS / SPECIAL_BONUS 명세서 DRAFT 일괄 생성
 *
 * 정책 메뉴는 별도 (/app/salary/bonus-policy) - 여기선 발행만.
 */
import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  App,
  Button,
  Card,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Popconfirm,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { salaryApi } from '@/features/salary-service/api/salaryApi';

type BonusKind = 'REGULAR' | 'PERFORMANCE' | 'HOLIDAY';

const KIND_LABEL: Record<BonusKind, string> = {
  REGULAR: '정기상여',
  PERFORMANCE: '성과급',
  HOLIDAY: '명절상여',
};

type FormValues = {
  bonusKind: BonusKind;
  payDate: dayjs.Dayjs;
  ratePercent?: number | null;
  memo?: string | null;
};

type TargetEntry = {
  memberId: string;
  name: string;
  sabun: string | null;
  organizationName: string | null;
  baseSalary: number;
  bonusAmount: number;
  exceedsLimit: boolean;
  skipReason: string | null;
};

type PreviewRes = {
  bonusKind: string;
  payDate: string;
  policyMaxRate: number | null;
  appliedRate: number | null;
  totalEligible: number;
  totalSkipped: number;
  totalGrossAmount: number;
  targets: TargetEntry[];
};

function formatWon(n: number | null | undefined) {
  if (n == null) return '—';
  return `${Number(n).toLocaleString('ko-KR')}원`;
}

export function AdminBonusBatchTab() {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [form] = Form.useForm<FormValues>();
  const [preview, setPreview] = useState<PreviewRes | null>(null);

  // 활성 보너스 정책 - 화면 상단 안내 + 한도 표시
  const policyQ = useQuery({
    queryKey: ['salary', 'bonus-policy', 'active'],
    queryFn: () => salaryApi.bonusPolicy.getActive(),
    staleTime: 60_000,
  });
  const policy = policyQ.data;

  const previewM = useMutation({
    mutationFn: (v: FormValues) =>
      salaryApi.bonusBatch.preview({
        bonusKind: v.bonusKind,
        payDate: v.payDate.format('YYYY-MM-DD'),
        ratePercent: v.ratePercent ?? null,
        memo: v.memo?.trim() || null,
      }),
    onSuccess: (res) => setPreview(res),
    onError: (e: Error) => message.error(e.message || '시뮬 실패'),
  });

  const applyM = useMutation({
    mutationFn: (v: FormValues) =>
      salaryApi.bonusBatch.apply({
        bonusKind: v.bonusKind,
        payDate: v.payDate.format('YYYY-MM-DD'),
        ratePercent: v.ratePercent ?? null,
        memo: v.memo?.trim() || null,
      }),
    onSuccess: (res, vars) => {
      message.success(
        `${res.created}건 발행 완료${res.failed > 0 ? ` (실패 ${res.failed}건)` : ''} - 이번달 정산 탭으로 이동합니다.`,
      );
      setPreview(null);
      void qc.invalidateQueries({ queryKey: ['salary', 'payroll'] });
      // 발행한 보너스 명세서가 속한 월의 [이번달 정산] 탭으로 자동 이동 (월 picker 자동 세팅)
      const month = vars.payDate.format('YYYY-MM');
      void navigate({
        to: '/app/payroll/admin',
        search: { tab: 'company', month },
      });
    },
    onError: (e: Error) => message.error(e.message || '발행 실패'),
  });

  const watchKind = Form.useWatch('bonusKind', form);
  const isHolidayAmount = watchKind === 'HOLIDAY' && policy?.holidayBonusType === 'AMOUNT';

  const targetCols: ColumnsType<TargetEntry> = [
    { title: '사번', dataIndex: 'sabun', width: 90, render: (v) => v ?? '—' },
    { title: '이름', dataIndex: 'name', width: 110, render: (v) => v ?? '—' },
    { title: '부서', dataIndex: 'organizationName', width: 130, render: (v) => v ?? '—' },
    {
      title: '기본급',
      dataIndex: 'baseSalary',
      align: 'right',
      width: 130,
      render: (v: number) => formatWon(v),
    },
    {
      title: '산출액',
      dataIndex: 'bonusAmount',
      align: 'right',
      width: 140,
      render: (v: number, r) => {
        if (r.skipReason) return <Typography.Text type="secondary">—</Typography.Text>;
        return (
          <Typography.Text
            strong
            className={r.exceedsLimit ? '!tw-text-red-600' : '!tw-text-blue-600'}
          >
            {formatWon(v)}
          </Typography.Text>
        );
      },
    },
    {
      title: '상태',
      key: 'status',
      width: 160,
      render: (_, r) => {
        if (r.skipReason) return <Tag color="default">{r.skipReason}</Tag>;
        if (r.exceedsLimit) return <Tag color="red">한도 초과</Tag>;
        return <Tag color="green">대상</Tag>;
      },
    },
  ];

  return (
    <Space direction="vertical" className="tw-w-full" size={16}>
      {/* 활성 정책 안내 */}
      {policy ? (
        <Alert
          type="info"
          showIcon
          message="현재 활성 보너스 정책"
          description={
            <Space wrap size={8}>
              {policy.useRegularBonusYn === 'Y' && (
                <Tag color="blue">정기상여 연 {policy.regularBonusAnnualRate}% / {policy.regularBonusPaymentCount}회</Tag>
              )}
              {policy.usePerformanceBonusYn === 'Y' && (
                <Tag color="geekblue">성과급 최대 {policy.performanceBonusMaxRate}%</Tag>
              )}
              {policy.useHolidayBonusYn === 'Y' && (
                <Tag color="gold">
                  명절상여{' '}
                  {policy.holidayBonusType === 'AMOUNT'
                    ? `정액 ${Number(policy.holidayBonusValue).toLocaleString('ko-KR')}원`
                    : `${policy.holidayBonusValue}%`}
                </Tag>
              )}
              <Tag color="default">최소 근속 {policy.minTenureMonths ?? 0}개월</Tag>
              <Tag color="default">{policy.eligibilityScope === 'REGULAR_ONLY' ? '정규직만' : '전직원'}</Tag>
            </Space>
          }
        />
      ) : (
        <Alert
          type="warning"
          showIcon
          message="활성 보너스 정책이 없습니다."
          description="좌측 [상여/성과금 정책] 메뉴에서 정책을 먼저 등록하세요."
        />
      )}

      <Card title="발행 입력">
        <Form<FormValues>
          form={form}
          layout="vertical"
          initialValues={{
            bonusKind: 'REGULAR',
            payDate: dayjs().endOf('month'),
          }}
          onFinish={(v) => previewM.mutate(v)}
        >
          <div className="tw-grid tw-grid-cols-1 md:tw-grid-cols-2 lg:tw-grid-cols-4 tw-gap-3">
            <Form.Item label="보너스 유형" name="bonusKind" rules={[{ required: true }]}>
              <Select
                options={[
                  { value: 'REGULAR', label: '정기상여' },
                  { value: 'PERFORMANCE', label: '성과급' },
                  { value: 'HOLIDAY', label: '명절상여' },
                ]}
              />
            </Form.Item>
            <Form.Item label="지급일" name="payDate" rules={[{ required: true }]}>
              <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
            </Form.Item>
            <Form.Item
              label={isHolidayAmount ? '비율 (정책 정액 자동 적용)' : '지급 비율 (%)'}
              name="ratePercent"
              extra={
                watchKind === 'PERFORMANCE' && policy?.performanceBonusMaxRate
                  ? `정책 최대 ${policy.performanceBonusMaxRate}% 초과 시 한도 초과 표시`
                  : watchKind === 'REGULAR' && policy?.regularBonusAnnualRate && policy?.regularBonusPaymentCount
                    ? `정책 1회당 권장 ${(Number(policy.regularBonusAnnualRate) / Number(policy.regularBonusPaymentCount)).toFixed(0)}% (연 누계 ${policy.regularBonusAnnualRate}% / ${policy.regularBonusPaymentCount}회)`
                    : watchKind === 'HOLIDAY' && policy?.holidayBonusType === 'RATE'
                      ? `정책 ${policy.holidayBonusValue}% 자동 적용`
                      : undefined
              }
              rules={
                watchKind === 'HOLIDAY'
                  ? []
                  : [{ required: true, message: '지급 비율을 입력하세요.' }]
              }
            >
              <InputNumber
                min={0}
                max={1000}
                step={5}
                style={{ width: '100%' }}
                disabled={isHolidayAmount}
                addonAfter="%"
              />
            </Form.Item>
            <Form.Item label="메모 (선택)" name="memo">
              <Input placeholder="예: 2026 Q2 정기상여" maxLength={200} />
            </Form.Item>
          </div>

          <Space>
            <Button type="primary" htmlType="submit" loading={previewM.isPending} disabled={!policy}>
              시뮬 미리보기
            </Button>
            {preview && preview.totalEligible > 0 && (
              <Popconfirm
                title={`${preview.totalEligible}명에게 ${formatWon(preview.totalGrossAmount)} 일괄 발행할까요?`}
                description="명세서는 DRAFT 상태로 생성됩니다. 검토 후 [확정] -> [지급] 처리하세요."
                okText="발행"
                cancelText="취소"
                onConfirm={() => applyM.mutate(form.getFieldsValue())}
              >
                <Button type="primary" danger loading={applyM.isPending}>
                  일괄 발행 ({preview.totalEligible}명)
                </Button>
              </Popconfirm>
            )}
          </Space>
        </Form>
      </Card>

      {preview && (
        <Card title="시뮬 결과">
          <div className="tw-grid tw-grid-cols-2 md:tw-grid-cols-4 tw-gap-3 tw-mb-3">
            <Statistic title="대상 직원" value={preview.totalEligible} suffix="명" />
            <Statistic
              title="자격 미달 (스킵)"
              value={preview.totalSkipped}
              suffix="명"
              valueStyle={{ color: preview.totalSkipped > 0 ? '#ef4444' : undefined }}
            />
            <Statistic
              title="총 지급 합계 (세전)"
              value={preview.totalGrossAmount}
              suffix="원"
              formatter={(v) => Number(v).toLocaleString('ko-KR')}
              valueStyle={{ color: '#1677ff', fontWeight: 700 }}
            />
            <Statistic
              title="적용 비율"
              value={preview.appliedRate ?? '—'}
              suffix={preview.appliedRate != null ? '%' : ''}
            />
          </div>

          <Table<TargetEntry>
            rowKey="memberId"
            dataSource={preview.targets}
            columns={targetCols}
            pagination={{ pageSize: 20 }}
            size="small"
          />
        </Card>
      )}
    </Space>
  );
}
