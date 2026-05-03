// /app/salary/bonus-policy 회사별 보너스 정책 관리
// 정기상여 / 성과급 / 명절상여 3개 영역 회사 표준 룰 관리
// 실제 지급은 PayrollType (PERFORMANCE_BONUS / SPECIAL_BONUS) 새 Payroll 행에서 처리
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  App,
  Button,
  Card,
  DatePicker,
  Divider,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { type Dayjs } from 'dayjs';
import { salaryApi } from '@/features/salary-service/api/salaryApi';
import type {
  BonusEligibilityScopeCode,
  BonusPolicy,
  BonusPolicyCreatePayload,
  HolidayBonusTypeCode,
} from '@/features/salary-service/types';

const ELIGIBILITY_KO: Record<string, string> = {
  ALL: '전직원',
  REGULAR_ONLY: '정규직만',
};

const HOLIDAY_TYPE_KO: Record<string, string> = {
  RATE: '비율 (%)',
  AMOUNT: '정액 (원)',
};

type FormValues = {
  // 정기상여
  useRegularBonusYn: boolean;
  regularBonusAnnualRate?: number;
  regularBonusPaymentCount?: number;

  // 성과급
  usePerformanceBonusYn: boolean;
  performanceBonusMaxRate?: number;
  performanceBonusBasis?: string;

  // 명절상여
  useHolidayBonusYn: boolean;
  holidayBonusType?: HolidayBonusTypeCode;
  holidayBonusValue?: number;

  // 공통
  eligibilityScope: BonusEligibilityScopeCode;
  effectiveRange: [Dayjs, Dayjs | null];
  memo?: string;
};

const QK_LIST = ['salary', 'bonus-policy', 'list'] as const;
const QK_ACTIVE = ['salary', 'bonus-policy', 'active'] as const;

export function AdminBonusPolicyPage() {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<BonusPolicy | null>(null);
  const [form] = Form.useForm<FormValues>();

  // 폼 상태 의존성 (Y/N 변경 시 비활성 입력 dim 처리)
  const useRegular = Form.useWatch('useRegularBonusYn', form);
  const usePerf = Form.useWatch('usePerformanceBonusYn', form);
  const useHoliday = Form.useWatch('useHolidayBonusYn', form);
  const holidayType = Form.useWatch('holidayBonusType', form);

  const listQ = useQuery({
    queryKey: QK_LIST,
    queryFn: () => salaryApi.bonusPolicy.list(),
  });
  const activeQ = useQuery({
    queryKey: QK_ACTIVE,
    queryFn: () => salaryApi.bonusPolicy.getActive(),
  });

  const toPayload = (v: FormValues): BonusPolicyCreatePayload => ({
    useRegularBonusYn: v.useRegularBonusYn ? 'Y' : 'N',
    regularBonusAnnualRate: v.useRegularBonusYn ? (v.regularBonusAnnualRate ?? null) : null,
    regularBonusPaymentCount: v.useRegularBonusYn ? (v.regularBonusPaymentCount ?? null) : null,
    usePerformanceBonusYn: v.usePerformanceBonusYn ? 'Y' : 'N',
    performanceBonusMaxRate: v.usePerformanceBonusYn ? (v.performanceBonusMaxRate ?? null) : null,
    performanceBonusBasis: v.usePerformanceBonusYn ? (v.performanceBonusBasis?.trim() || null) : null,
    useHolidayBonusYn: v.useHolidayBonusYn ? 'Y' : 'N',
    holidayBonusType: v.useHolidayBonusYn ? (v.holidayBonusType ?? null) : null,
    holidayBonusValue: v.useHolidayBonusYn ? (v.holidayBonusValue ?? null) : null,
    eligibilityScope: v.eligibilityScope,
    effectiveFrom: v.effectiveRange[0].format('YYYY-MM-DD'),
    effectiveTo: v.effectiveRange[1]?.format('YYYY-MM-DD') ?? null,
    memo: v.memo?.trim() || null,
  });

  const createM = useMutation({
    mutationFn: (v: FormValues) => salaryApi.bonusPolicy.create(toPayload(v)),
    onSuccess: () => {
      message.success('등록 완료 — 이전 활성 정책은 자동으로 마감되었습니다.');
      setOpen(false);
      form.resetFields();
      void qc.invalidateQueries({ queryKey: ['salary', 'bonus-policy'] });
    },
    onError: (e: Error) => message.error(e.message || '등록 실패'),
  });

  const updateM = useMutation({
    mutationFn: ({ id, v }: { id: string; v: FormValues }) => {
      const { effectiveFrom: _ignored, ...rest } = toPayload(v);
      return salaryApi.bonusPolicy.update(id, rest);
    },
    onSuccess: () => {
      message.success('수정 완료');
      setOpen(false);
      setEditing(null);
      form.resetFields();
      void qc.invalidateQueries({ queryKey: ['salary', 'bonus-policy'] });
    },
    onError: (e: Error) => message.error(e.message || '수정 실패'),
  });

  const deleteM = useMutation({
    mutationFn: (id: string) => salaryApi.bonusPolicy.delete(id),
    onSuccess: () => {
      message.success('삭제 완료');
      void qc.invalidateQueries({ queryKey: ['salary', 'bonus-policy'] });
    },
    onError: (e: Error) => message.error(e.message || '삭제 실패'),
  });

  const cols = useMemo<ColumnsType<BonusPolicy>>(
    () => [
      {
        title: '적용 기간',
        key: 'eff',
        width: 220,
        render: (_, r) => `${r.effectiveFrom ?? ''} ~ ${r.effectiveTo ?? '진행중'}`,
      },
      {
        title: '활성',
        dataIndex: 'active',
        key: 'active',
        width: 80,
        render: (v: boolean) => (v ? <Tag color="success">활성</Tag> : <Tag>마감</Tag>),
      },
      {
        title: '정기상여',
        key: 'regular',
        width: 160,
        render: (_, r) =>
          r.useRegularBonusYn === 'Y' ? (
            <span>
              연 {r.regularBonusAnnualRate ?? '—'}% / {r.regularBonusPaymentCount ?? '—'}회
            </span>
          ) : (
            <Typography.Text type="secondary">미사용</Typography.Text>
          ),
      },
      {
        title: '성과급',
        key: 'perf',
        width: 130,
        render: (_, r) =>
          r.usePerformanceBonusYn === 'Y' ? (
            <span>최대 {r.performanceBonusMaxRate ?? '—'}%</span>
          ) : (
            <Typography.Text type="secondary">미사용</Typography.Text>
          ),
      },
      {
        title: '명절상여',
        key: 'holiday',
        width: 160,
        render: (_, r) => {
          if (r.useHolidayBonusYn !== 'Y') {
            return <Typography.Text type="secondary">미사용</Typography.Text>;
          }
          const v = r.holidayBonusValue ?? 0;
          if (r.holidayBonusType === 'RATE') return <span>{v}%</span>;
          if (r.holidayBonusType === 'AMOUNT') return <span>{v.toLocaleString('ko-KR')}원</span>;
          return '—';
        },
      },
      {
        title: '대상',
        dataIndex: 'eligibilityScope',
        key: 'scope',
        width: 100,
        render: (v: string) => ELIGIBILITY_KO[v] ?? v,
      },
      {
        title: '비고',
        dataIndex: 'memo',
        key: 'memo',
        ellipsis: true,
        render: (v) => v || <Typography.Text type="secondary">—</Typography.Text>,
      },
      {
        title: '액션',
        key: 'actions',
        width: 160,
        render: (_, r) => (
          <Space>
            <Button
              size="small"
              onClick={() => {
                setEditing(r);
                form.setFieldsValue({
                  useRegularBonusYn: r.useRegularBonusYn === 'Y',
                  regularBonusAnnualRate: r.regularBonusAnnualRate ?? undefined,
                  regularBonusPaymentCount: r.regularBonusPaymentCount ?? undefined,
                  usePerformanceBonusYn: r.usePerformanceBonusYn === 'Y',
                  performanceBonusMaxRate: r.performanceBonusMaxRate ?? undefined,
                  performanceBonusBasis: r.performanceBonusBasis ?? undefined,
                  useHolidayBonusYn: r.useHolidayBonusYn === 'Y',
                  holidayBonusType: (r.holidayBonusType as HolidayBonusTypeCode) ?? undefined,
                  holidayBonusValue: r.holidayBonusValue ?? undefined,
                  eligibilityScope: (r.eligibilityScope as BonusEligibilityScopeCode) ?? 'ALL',
                  effectiveRange: [
                    r.effectiveFrom ? dayjs(r.effectiveFrom) : dayjs(),
                    r.effectiveTo ? dayjs(r.effectiveTo) : null,
                  ],
                  memo: r.memo ?? undefined,
                });
                setOpen(true);
              }}
            >
              수정
            </Button>
            <Popconfirm
              title="정책을 삭제할까요?"
              description="삭제는 소프트 처리되며, 활성 정책 삭제 후엔 화면 진입 시 기본 비활성 정책이 자동 생성됩니다."
              okText="삭제"
              cancelText="취소"
              onConfirm={() => r.bonusPolicyId && deleteM.mutate(r.bonusPolicyId)}
            >
              <Button size="small" danger>
                삭제
              </Button>
            </Popconfirm>
          </Space>
        ),
      },
    ],
    [deleteM, form],
  );

  return (
    <Space direction="vertical" className="tw-w-full" size={16}>
      <div>
        <Typography.Title level={1} className="!tw-m-0 !tw-text-slate-900">
          보너스 정책
        </Typography.Title>
        <Typography.Paragraph
          type="secondary"
          className="!tw-mb-0 !tw-mt-1 !tw-text-sm"
        >
          정기상여 · 성과급 · 명절상여 회사 표준 룰을 관리합니다. 실제 지급은 급여 정산
          관리에서 PayrollType 을 [성과급] 또는 [특별상여] 로 선택해 새 명세를 발행합니다.
          정책 변경 시 이전 활성 정책은 자동 마감됩니다.
        </Typography.Paragraph>
      </div>

      {activeQ.data && (
        <Alert
          type="info"
          showIcon
          message={
            <span className="tw-flex tw-flex-wrap tw-items-center tw-gap-2">
              <b>현재 활성 정책</b>
              {activeQ.data.useRegularBonusYn === 'Y' && (
                <Tag color="blue">
                  정기상여 연 {activeQ.data.regularBonusAnnualRate ?? '—'}%
                  ({activeQ.data.regularBonusPaymentCount ?? '—'}회)
                </Tag>
              )}
              {activeQ.data.usePerformanceBonusYn === 'Y' && (
                <Tag color="green">
                  성과급 최대 {activeQ.data.performanceBonusMaxRate ?? '—'}%
                </Tag>
              )}
              {activeQ.data.useHolidayBonusYn === 'Y' && (
                <Tag color="gold">
                  명절상여{' '}
                  {activeQ.data.holidayBonusType === 'RATE'
                    ? `${activeQ.data.holidayBonusValue ?? 0}%`
                    : `${(activeQ.data.holidayBonusValue ?? 0).toLocaleString('ko-KR')}원`}
                </Tag>
              )}
              {activeQ.data.useRegularBonusYn !== 'Y' &&
                activeQ.data.usePerformanceBonusYn !== 'Y' &&
                activeQ.data.useHolidayBonusYn !== 'Y' && (
                  <Tag>모든 항목 비활성</Tag>
                )}
            </span>
          }
          description={
            <span className="tw-text-xs tw-text-slate-500">
              적용 기간: {activeQ.data.effectiveFrom} ~ {activeQ.data.effectiveTo ?? '진행중'} ·
              대상 {ELIGIBILITY_KO[activeQ.data.eligibilityScope ?? 'ALL'] ?? '—'}
            </span>
          }
        />
      )}

      <Card>
        <div className="tw-flex tw-justify-end tw-mb-3">
          <Button
            type="primary"
            onClick={() => {
              setEditing(null);
              form.resetFields();
              form.setFieldsValue({
                useRegularBonusYn: false,
                usePerformanceBonusYn: false,
                useHolidayBonusYn: false,
                holidayBonusType: 'RATE',
                eligibilityScope: 'ALL',
                effectiveRange: [dayjs(), null],
              });
              setOpen(true);
            }}
          >
            정책 등록
          </Button>
        </div>

        <Table<BonusPolicy>
          rowKey={(r) => r.bonusPolicyId ?? Math.random().toString()}
          loading={listQ.isLoading}
          dataSource={listQ.data ?? []}
          columns={cols}
          pagination={{ pageSize: 10 }}
          locale={{ emptyText: '등록된 정책이 없습니다.' }}
          size="small"
        />
      </Card>

      <Modal
        open={open}
        onCancel={() => {
          setOpen(false);
          setEditing(null);
          form.resetFields();
        }}
        onOk={() => form.submit()}
        confirmLoading={createM.isPending || updateM.isPending}
        okText={editing ? '수정' : '등록'}
        cancelText="취소"
        title={editing ? '보너스 정책 수정' : '보너스 정책 등록'}
        destroyOnHidden
        width={1120}
        styles={{ body: { paddingTop: 12 } }}
      >
        <Form<FormValues>
          form={form}
          layout="vertical"
          requiredMark={false}
          onFinish={(v) =>
            editing?.bonusPolicyId
              ? updateM.mutate({ id: editing.bonusPolicyId, v })
              : createM.mutate(v)
          }
        >
          <div className="tw-grid tw-grid-cols-1 lg:tw-grid-cols-3 tw-gap-4">
            <div
              className={`tw-rounded-lg tw-border tw-p-4 tw-transition-colors ${
                useRegular
                  ? 'tw-border-blue-200 tw-bg-blue-50/40'
                  : 'tw-border-slate-200 tw-bg-slate-50/60'
              }`}
            >
              <div className="tw-mb-3 tw-flex tw-items-center tw-justify-between tw-gap-2 tw-border-b tw-border-slate-200/80 tw-pb-2">
                <Typography.Text strong className="tw-text-[15px]">
                  정기상여
                </Typography.Text>
                <Form.Item name="useRegularBonusYn" valuePropName="checked" className="!tw-mb-0">
                  <Switch checkedChildren="사용" unCheckedChildren="끔" size="small" />
                </Form.Item>
              </div>
              <Typography.Paragraph type="secondary" className="!tw-mb-3 !tw-mt-0 !tw-text-xs tw-leading-snug">
                기본급 기준 연 누계 비율로 정기 지급합니다. (예: 연 600% = 매년 기본급의 6배 분할 지급)
              </Typography.Paragraph>
              <Form.Item
                label="연 누계 비율 (%)"
                name="regularBonusAnnualRate"
                className="!tw-mb-2"
                rules={
                  useRegular ? [{ required: true, message: '연 누계 비율을 입력하세요.' }] : []
                }
              >
                <InputNumber
                  disabled={!useRegular}
                  min={0}
                  max={2000}
                  step={50}
                  className="tw-w-full"
                  placeholder="예: 600"
                />
              </Form.Item>
              <Form.Item
                label="연 지급 횟수"
                name="regularBonusPaymentCount"
                className="!tw-mb-0"
                rules={
                  useRegular ? [{ required: true, message: '연 지급 횟수를 입력하세요.' }] : []
                }
                extra="분기 4 · 반기 2 · 명절 포함 6 등"
              >
                <InputNumber
                  disabled={!useRegular}
                  min={1}
                  max={24}
                  className="tw-w-full"
                  placeholder="예: 4"
                />
              </Form.Item>
            </div>

            <div
              className={`tw-rounded-lg tw-border tw-p-4 tw-transition-colors ${
                usePerf
                  ? 'tw-border-emerald-200 tw-bg-emerald-50/40'
                  : 'tw-border-slate-200 tw-bg-slate-50/60'
              }`}
            >
              <div className="tw-mb-3 tw-flex tw-items-center tw-justify-between tw-gap-2 tw-border-b tw-border-slate-200/80 tw-pb-2">
                <Typography.Text strong className="tw-text-[15px]">
                  성과급
                </Typography.Text>
                <Form.Item name="usePerformanceBonusYn" valuePropName="checked" className="!tw-mb-0">
                  <Switch checkedChildren="사용" unCheckedChildren="끔" size="small" />
                </Form.Item>
              </div>
              <Typography.Paragraph type="secondary" className="!tw-mb-3 !tw-mt-0 !tw-text-xs tw-leading-snug">
                평가·실적 등에 따른 비정기 지급입니다. 정책에는 최대 한도만 저장합니다.
              </Typography.Paragraph>
              <Form.Item
                label="1회 최대 지급 비율 (%)"
                name="performanceBonusMaxRate"
                className="!tw-mb-2"
                rules={
                  usePerf ? [{ required: true, message: '최대 지급 비율을 입력하세요.' }] : []
                }
                extra="기본급 기준 (예: 200% = 최대 2배)"
              >
                <InputNumber
                  disabled={!usePerf}
                  min={0}
                  max={1000}
                  step={10}
                  className="tw-w-full"
                  placeholder="예: 200"
                />
              </Form.Item>
              <Form.Item label="산정 기준 (메모)" name="performanceBonusBasis" className="!tw-mb-0">
                <Input.TextArea
                  disabled={!usePerf}
                  rows={2}
                  maxLength={500}
                  className="tw-text-sm"
                  placeholder="예: 등급별 차등, EBIT 5% 풀 등"
                />
              </Form.Item>
            </div>

            <div
              className={`tw-rounded-lg tw-border tw-p-4 tw-transition-colors ${
                useHoliday
                  ? 'tw-border-amber-200 tw-bg-amber-50/40'
                  : 'tw-border-slate-200 tw-bg-slate-50/60'
              }`}
            >
              <div className="tw-mb-3 tw-flex tw-items-center tw-justify-between tw-gap-2 tw-border-b tw-border-slate-200/80 tw-pb-2">
                <Typography.Text strong className="tw-text-[15px]">
                  명절상여
                </Typography.Text>
                <Form.Item name="useHolidayBonusYn" valuePropName="checked" className="!tw-mb-0">
                  <Switch checkedChildren="사용" unCheckedChildren="끔" size="small" />
                </Form.Item>
              </div>
              <Typography.Paragraph type="secondary" className="!tw-mb-3 !tw-mt-0 !tw-text-xs tw-leading-snug">
                설·추석 등 명절 별도 지급. 비율(%) 또는 정액(원) 중 선택합니다.
              </Typography.Paragraph>
              <Form.Item
                label="지급 방식"
                name="holidayBonusType"
                className="!tw-mb-2"
                rules={
                  useHoliday ? [{ required: true, message: '지급 방식을 선택하세요.' }] : []
                }
              >
                <Select
                  disabled={!useHoliday}
                  className="tw-w-full"
                  options={[
                    { value: 'RATE', label: HOLIDAY_TYPE_KO.RATE },
                    { value: 'AMOUNT', label: HOLIDAY_TYPE_KO.AMOUNT },
                  ]}
                />
              </Form.Item>
              <Form.Item
                label={holidayType === 'AMOUNT' ? '정액 (원)' : '비율 (%)'}
                name="holidayBonusValue"
                className="!tw-mb-0"
                rules={useHoliday ? [{ required: true, message: '값을 입력하세요.' }] : []}
              >
                <InputNumber
                  disabled={!useHoliday}
                  min={0}
                  step={holidayType === 'AMOUNT' ? 100000 : 10}
                  className="tw-w-full"
                  formatter={
                    holidayType === 'AMOUNT'
                      ? (v) => (v ? `${Number(v).toLocaleString('ko-KR')}` : '')
                      : undefined
                  }
                  parser={
                    holidayType === 'AMOUNT'
                      ? (v) => Number((v ?? '').replace(/[^0-9]/g, '')) as 0
                      : undefined
                  }
                  placeholder={holidayType === 'AMOUNT' ? '예: 1,000,000' : '예: 100'}
                />
              </Form.Item>
            </div>
          </div>

          <Divider className="!tw-my-4" />

          <div className="tw-rounded-lg tw-border tw-border-slate-200 tw-bg-white tw-p-4">
            <Typography.Text strong className="tw-mb-3 tw-block tw-text-[15px]">
              공통
            </Typography.Text>
            <div className="tw-grid tw-grid-cols-1 md:tw-grid-cols-2 tw-gap-x-6 tw-gap-y-1">
              <Form.Item
                label="지급 대상"
                name="eligibilityScope"
                rules={[{ required: true, message: '지급 대상을 선택하세요.' }]}
                className="!tw-mb-0"
              >
                <Select
                  options={[
                    { value: 'ALL', label: ELIGIBILITY_KO.ALL },
                    { value: 'REGULAR_ONLY', label: ELIGIBILITY_KO.REGULAR_ONLY },
                  ]}
                />
              </Form.Item>
              <Form.Item
                label="적용 기간"
                name="effectiveRange"
                rules={[{ required: true, message: '적용 시작일은 필수입니다.' }]}
                className="!tw-mb-0"
                extra={
                  editing
                    ? '시작일은 변경할 수 없습니다. 종료일만 수정됩니다.'
                    : '이전 활성 정책은 시작일 전날로 자동 마감됩니다.'
                }
              >
                <DatePicker.RangePicker
                  allowEmpty={[false, true]}
                  format="YYYY-MM-DD"
                  className="tw-w-full"
                  disabled={editing ? [true, false] : false}
                />
              </Form.Item>
            </div>
            <Form.Item label="비고 (선택)" name="memo" className="!tw-mb-0 !tw-mt-3">
              <Input.TextArea
                maxLength={500}
                rows={1}
                placeholder="정책 변경 사유 등"
                showCount
                className="tw-text-sm"
              />
            </Form.Item>
          </div>
        </Form>
      </Modal>
    </Space>
  );
}
