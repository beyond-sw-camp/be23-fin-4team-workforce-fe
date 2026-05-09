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
import {
  useEffect,
  useMemo,
  useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useMutation,
  useQuery,
  useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  App,
  Button,
  Card,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Statistic,
  Switch,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { salaryApi } from '@/features/salary-service/api/salaryApi';
import { evaluationRedesignApi } from '@/features/evaluation/api/evaluationRedesignApi';
import { AppUnitInputNumber } from '@/shared/ui/AppUnitInputNumber';

import { AppDataTable } from '@/shared/ui/AppDataTable';

type BonusKind = 'REGULAR' | 'PERFORMANCE' | 'HOLIDAY';

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
    mutationFn: (v: FormValues) => {
      // HOLIDAY는 정책값 그대로 -> 일괄, REGULAR/PERFORMANCE는 행별 비율로 차등 발행
      // 토글 OFF (paidFlags=false) 행은 items 에서 제외 -> BE 단에서 발행 안 함
      const items = v.bonusKind !== 'HOLIDAY' && preview
        ? preview.targets
            .filter((t) => !t.skipReason && paidFlags[t.memberId])
            .map((t) => ({
              memberId: t.memberId,
              ratePercent: editedRates[t.memberId] ?? 0,
            }))
            .filter((it) => it.ratePercent > 0)
        : null;
      return salaryApi.bonusBatch.apply({
        bonusKind: v.bonusKind,
        payDate: v.payDate.format('YYYY-MM-DD'),
        ratePercent: v.ratePercent ?? null,
        memo: v.memo?.trim() || null,
        items,
      });
    },
    onSuccess: (res, vars) => {
      const month = vars.payDate.format('YYYY-MM');
      // 발행한 명세서가 속한 정산월의 [정산 처리] 탭으로 이동 - 셀렉터 자동 세팅
      // 미래월/이번달 동일 - [정산 처리]는 월 셀렉터 기반이라 어떤 달이든 처리 가능
      message.success(
        `${res.created}건 발행 완료${res.failed > 0 ? ` (실패 ${res.failed}건)` : ''}`,
      );
      setPreview(null);
      void qc.invalidateQueries({ queryKey: ['salary', 'payroll'] });
      void navigate({
        to: '/app/payroll/admin',
        search: { tab: 'company', month },
      });
    },
    onError: (e: Error) => message.error(e.message || '발행 실패'),
  });

  const watchKind = Form.useWatch('bonusKind', form);
  const watchRate = Form.useWatch('ratePercent', form) as number | undefined;
  const watchPayDate = Form.useWatch('payDate', form) as dayjs.Dayjs | undefined;
  const isHolidayAmount = watchKind === 'HOLIDAY' && policy?.holidayBonusType === 'AMOUNT';

  // 지급일이 이번 달이 아니면 정산월 안내
  const currentMonthStr = dayjs().format('YYYY-MM');
  const targetMonthStr = watchPayDate?.format('YYYY-MM');
  const isFuturePayMonth = !!targetMonthStr && targetMonthStr !== currentMonthStr;

  // 행별 비율 - 시뮬 직후 form.ratePercent 로 초기화, 사용자가 행별 직접 수정 가능
  // HOLIDAY는 정책값 그대로라 차등 X (입력 비활성)
  const [editedRates, setEditedRates] = useState<Record<string, number>>({});
  // 행별 지급/미지급 토글 - 자격 미달자는 자동 OFF 잠금, 그 외는 ON 디폴트
  const [paidFlags, setPaidFlags] = useState<Record<string, boolean>>({});
  useEffect(() => {
    if (!preview) return;
    const baseRate = Number(form.getFieldValue('ratePercent') ?? 0);
    const initRates: Record<string, number> = {};
    const initPaid: Record<string, boolean> = {};
    for (const t of preview.targets) {
      if (!t.skipReason) {
        initRates[t.memberId] = baseRate;
        initPaid[t.memberId] = true;
      } else {
        initPaid[t.memberId] = false;
      }
    }
    setEditedRates(initRates);
    setPaidFlags(initPaid);
  }, [preview, form]);

  // 보너스 유형/지급일 바뀌면 시뮬 결과 초기화 - 종류 다르면 대상자/충돌도 다름
  useEffect(() => {
    setPreview(null);
    setEditedRates({});
  }, [watchKind, watchPayDate]);

  // 평가 결과 불러오기 모달 - 시즌 선택 후 [{memberId, finalGrade}] 로 prefill
  const [evalModalOpen, setEvalModalOpen] = useState(false);
  const [selectedSeasonId, setSelectedSeasonId] = useState<string | null>(null);
  const seasonsQ = useQuery({
    queryKey: ['evaluation', 'seasons'],
    queryFn: () => evaluationRedesignApi.listSeasons(),
    enabled: evalModalOpen,
  });
  const gradesM = useMutation({
    mutationFn: (seasonId: string) => evaluationRedesignApi.findFinalGrades(seasonId),
    onSuccess: (grades) => {
      if (!preview) {
        message.warning('먼저 [시뮬 미리보기]를 실행해 주세요.');
        return;
      }
      // 정책의 등급 -> 비율 매핑 파싱
      let mapping: Record<string, number> = {};
      try {
        if (policy?.gradeBonusRatesJson) {
          mapping = JSON.parse(policy.gradeBonusRatesJson);
        }
      } catch {
        message.error('정책의 등급별 비율 정보를 읽을 수 없습니다.');
        return;
      }
      if (Object.keys(mapping).length === 0) {
        message.warning('[상여금 정책]에서 비율을 먼저 설정해주세요.');
        return;
      }
      // memberId -> finalGrade 매핑
      const gradeByMember: Record<string, string> = {};
      for (const g of grades) gradeByMember[g.memberId] = g.finalGrade;

      const next: Record<string, number> = {};
      let matched = 0;
      let unmatched = 0;
      for (const t of preview.targets) {
        if (t.skipReason) continue;
        const grade = gradeByMember[t.memberId];
        if (grade != null && mapping[grade] != null) {
          next[t.memberId] = Number(mapping[grade]);
          matched++;
        } else {
          // 매핑 없으면 0% (미지급)
          next[t.memberId] = 0;
          unmatched++;
        }
      }
      setEditedRates(next);
      setEvalModalOpen(false);
      message.success(`${matched}명 등급 적용 완료${unmatched > 0 ? ` (${unmatched}명 등급 정보 없음)` : ''}`);
    },
    onError: (e: Error) => message.error(e.message || '평가 결과 조회 실패'),
  });

  // 행별 산출액 - 정기/성과: baseSalary x rate, 명절: 정책 산출액 그대로
  const computeRowAmount = (t: TargetEntry, kind: BonusKind | undefined, rate: number): number => {
    if (t.skipReason) return 0;
    if (kind === 'HOLIDAY') return t.bonusAmount;
    return Math.round((t.baseSalary * (rate || 0)) / 100);
  };

  // 한도 초과 - 성과급에서 정책 max 비율 초과인지
  const isRowOverLimit = (rate: number): boolean => {
    if (watchKind !== 'PERFORMANCE') return false;
    const max = policy?.performanceBonusMaxRate;
    if (max == null) return false;
    return rate > Number(max);
  };

  // 발행 직전 합계 - 행별 비율 + 지급 토글 기준
  const editedSummary = useMemo(() => {
    if (!preview) return { total: 0, count: 0, eligible: 0, paying: 0 };
    let total = 0;
    let paying = 0;
    let eligible = 0;
    for (const t of preview.targets) {
      if (t.skipReason) continue;
      eligible++;
      // 토글 OFF 면 미지급 - 비율/산출 무시
      if (!paidFlags[t.memberId]) continue;
      const r = editedRates[t.memberId] ?? 0;
      const amt = computeRowAmount(t, watchKind, r);
      if (amt > 0) {
        total += amt;
        paying++;
      }
    }
    return { total, count: preview.targets.length, eligible, paying };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview, editedRates, paidFlags, watchKind]);

  // form.ratePercent 변경 시 편집 안 한 행은 따라 변경. 이미 사용자가 손댄 행은 유지하기 어려우니 단순화 - 모두 동기화
  useEffect(() => {
    if (!preview) return;
    const baseRate = Number(watchRate ?? 0);
    setEditedRates((prev) => {
      const next: Record<string, number> = { ...prev };
      for (const t of preview.targets) {
        if (!t.skipReason) next[t.memberId] = baseRate;
      }
      return next;
    });
  }, [watchRate, preview]);

  const targetCols: ColumnsType<TargetEntry> = [
    {
      title: '지급',
      key: 'paid',
      width: 70,
      align: 'center',
      render: (_, r) => {
        // 자격 미달자는 정책상 강제 OFF 잠금
        const disabled = !!r.skipReason;
        const checked = !!paidFlags[r.memberId];
        return (
          <Switch
            size="small"
            disabled={disabled}
            checked={checked}
            onChange={(v) => setPaidFlags((prev) => ({ ...prev, [r.memberId]: v }))}
          />
        );
      },
    },
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
      title: '지급 비율 (%)',
      key: 'rate',
      width: 130,
      align: 'right',
      render: (_, r) => {
        if (r.skipReason) return <Typography.Text type="secondary">—</Typography.Text>;
        if (watchKind === 'HOLIDAY') return <Typography.Text type="secondary">정책값</Typography.Text>;
        const paid = !!paidFlags[r.memberId];
        const rate = editedRates[r.memberId] ?? 0;
        return (
          <InputNumber
            min={0}
            max={1000}
            step={5}
            value={rate}
            size="small"
            disabled={!paid}
            style={{ width: 90 }}
            onChange={(v) =>
              setEditedRates((prev) => ({ ...prev, [r.memberId]: Number(v ?? 0) }))
            }
          />
        );
      },
    },
    {
      title: '산출액',
      key: 'amount',
      align: 'right',
      width: 140,
      render: (_, r) => {
        if (r.skipReason) return <Typography.Text type="secondary">—</Typography.Text>;
        const paid = !!paidFlags[r.memberId];
        if (!paid) return <Typography.Text type="secondary">미지급</Typography.Text>;
        const rate = editedRates[r.memberId] ?? 0;
        const amt = computeRowAmount(r, watchKind, rate);
        if (amt <= 0) return <Typography.Text type="secondary">미지급</Typography.Text>;
        const over = isRowOverLimit(rate);
        return (
          <Typography.Text strong className={over ? '!tw-text-red-600' : '!tw-text-blue-600'}>
            {formatWon(amt)}
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
        const paid = !!paidFlags[r.memberId];
        if (!paid) return <Tag color="default">미지급</Tag>;
        const rate = editedRates[r.memberId] ?? 0;
        const amt = computeRowAmount(r, watchKind, rate);
        if (amt <= 0) return <Tag color="default">미지급</Tag>;
        if (isRowOverLimit(rate)) return <Tag color="red">한도 초과</Tag>;
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
          message="현재 활성 상여금 정책"
          description={
            <Space wrap size={8}>
              {policy.useRegularBonusYn === 'Y' && (
                <Tag color="blue">정기상여 연 {policy.regularBonusAnnualRate}% / {policy.regularBonusPaymentCount}회</Tag>
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
          message="상여금 정책이 없습니다."
          description="좌측 [상여금 정책] 메뉴에서 정책을 먼저 등록하세요."
        />
      )}

      <Card title="지급 대상 등록">
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
            <Form.Item label="상여금 유형" name="bonusKind" rules={[{ required: true }]}>
              <Select
                options={[
                  { value: 'REGULAR', label: '정기상여' },
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
                  ? `정책 최대 ${policy.performanceBonusMaxRate}% (초과 입력 차단)`
                  : watchKind === 'REGULAR' && policy?.regularBonusAnnualRate && policy?.regularBonusPaymentCount
                    ? `정책 1회당 권장 ${(Number(policy.regularBonusAnnualRate) / Number(policy.regularBonusPaymentCount)).toFixed(0)}% / 1회 최대 ${policy.regularBonusAnnualRate}% (연 누계 한도)`
                    : watchKind === 'HOLIDAY' && policy?.holidayBonusType === 'RATE'
                      ? `정책 ${policy.holidayBonusValue}% 자동 적용`
                      : undefined
              }
              rules={
                watchKind === 'HOLIDAY'
                  ? []
                  : [
                      { required: true, message: '지급 비율을 입력하세요.' },
                      {
                        type: 'number',
                        min: 0,
                        max: (() => {
                          if (watchKind === 'PERFORMANCE') {
                            return Number(policy?.performanceBonusMaxRate ?? 200);
                          }
                          if (watchKind === 'REGULAR') {
                            return Number(policy?.regularBonusAnnualRate ?? 400);
                          }
                          return 1000;
                        })(),
                        message: '정책 한도를 초과할 수 없습니다.',
                      },
                    ]
              }
            >
              <AppUnitInputNumber
                min={0}
                max={(() => {
                  if (isHolidayAmount) return 1000;
                  if (watchKind === 'PERFORMANCE') {
                    return Number(policy?.performanceBonusMaxRate ?? 200);
                  }
                  if (watchKind === 'REGULAR') {
                    return Number(policy?.regularBonusAnnualRate ?? 400);
                  }
                  return 1000;
                })()}
                step={5}
                disabled={isHolidayAmount}
                unit="%"
              />
            </Form.Item>
            <Form.Item label="메모 (선택)" name="memo">
              <Input placeholder="예: 2026 Q2 정기상여" maxLength={200} />
            </Form.Item>
          </div>

          {/* 지급일 정산월 짧게 안내 */}
          {isFuturePayMonth && (
            <Alert
              type="info"
              showIcon
              className="!tw-mb-3"
              message={`${targetMonthStr} 정산에 추가됩니다.`}
            />
          )}

          <Space>
            <Button type="primary" htmlType="submit" loading={previewM.isPending} disabled={!policy}>
              시뮬 미리보기
            </Button>
            {preview && editedSummary.paying > 0 && (
              <Popconfirm
                title={`${editedSummary.paying}명에게 ${formatWon(editedSummary.total)} 지급 등록할까요?`}
                description="등록 후 [정산 처리] 탭에서 검토·지급하세요."
                okText="지급 대상 등록"
                cancelText="취소"
                onConfirm={() => applyM.mutate(form.getFieldsValue())}
              >
                <Button type="primary" danger loading={applyM.isPending}>
                  지급 대상 등록 ({editedSummary.paying}명)
                </Button>
              </Popconfirm>
            )}
          </Space>
        </Form>
      </Card>

      {preview && (
        <Card
          title={
            <Space>
              <span>시뮬 결과</span>
              {watchKind === 'PERFORMANCE' && (
                <Tag color="geekblue">평가 결과별 차등 입력</Tag>
              )}
            </Space>
          }
          extra={
            watchKind === 'PERFORMANCE' && (
              <Button size="small" onClick={() => setEvalModalOpen(true)}>
                평가 결과 불러오기
              </Button>
            )
          }
        >
          <div className="tw-grid tw-grid-cols-2 md:tw-grid-cols-4 tw-gap-3 tw-mb-3">
            <Statistic title="지급 대상" value={editedSummary.paying} suffix="명" />
            <Statistic
              title="미지급 / 자격 미달"
              value={editedSummary.count - editedSummary.paying}
              suffix="명"
              valueStyle={{ color: editedSummary.count - editedSummary.paying > 0 ? '#ef4444' : undefined }}
            />
            <Statistic
              title="총 지급 합계 (세전)"
              value={editedSummary.total}
              suffix="원"
              formatter={(v) => Number(v).toLocaleString('ko-KR')}
              valueStyle={{ color: '#1677ff', fontWeight: 700 }}
            />
            <Statistic
              title={watchKind === 'HOLIDAY' ? '정책값 적용' : '기본 비율'}
              value={watchKind === 'HOLIDAY' ? '—' : (watchRate ?? '—')}
              suffix={watchKind !== 'HOLIDAY' && watchRate != null ? '%' : ''}
            />
          </div>

          <AppDataTable<TargetEntry>
            rowKey="memberId"
            dataSource={preview.targets}
            columns={targetCols}
            pagination={{ pageSize: 20 }}
            size="small"
          />
        </Card>
      )}

      {/* 평가 결과 불러오기 모달 - 시즌 선택 후 등급 매핑 적용 */}
      <Modal
        title="평가 결과 불러오기"
        open={evalModalOpen}
        onCancel={() => setEvalModalOpen(false)}
        onOk={() => {
          if (!selectedSeasonId) {
            message.warning('평가 사이클을 선택하세요.');
            return;
          }
          gradesM.mutate(selectedSeasonId);
        }}
        okText="등급 적용"
        cancelText="취소"
        confirmLoading={gradesM.isPending}
        destroyOnHidden
      >
        <Space direction="vertical" className="tw-w-full" size={12}>
          <Typography.Text type="secondary">
            선택한 평가 사이클의 등급에 따라 행별 비율이 자동 채워집니다. 이후 수동 조정 가능합니다.
          </Typography.Text>
          <Select
            placeholder="평가 사이클 선택"
            style={{ width: '100%' }}
            loading={seasonsQ.isPending}
            value={selectedSeasonId ?? undefined}
            onChange={(v) => setSelectedSeasonId(v)}
            options={(seasonsQ.data ?? []).map((s) => ({
              value: s.seasonId,
              label: `${s.name ?? '(이름 없음)'} - ${s.targetCycle ?? ''}${s.resultsPublishedAt ? ' · 결과 공개됨' : ''}`,
            }))}
          />
          {(() => {
            // 정책 JSON 파싱 - 사람이 읽기 쉬운 태그로 표시 (예: S 15% / A 10%)
            let parsed: Record<string, number> | null = null;
            try {
              if (policy?.gradeBonusRatesJson) {
                parsed = JSON.parse(policy.gradeBonusRatesJson);
              }
            } catch {
              parsed = null;
            }
            const entries = parsed ? Object.entries(parsed) : [];
            if (entries.length > 0) {
              return (
                <Alert
                  type="info"
                  showIcon
                  message="등급별 지급 비율"
                  description={
                    <Space wrap size={6}>
                      {entries.map(([g, r]) => (
                        <Tag key={g} color="geekblue">{g} {r}%</Tag>
                      ))}
                    </Space>
                  }
                />
              );
            }
            return (
              <Alert
                type="warning"
                showIcon
                message="비율 미설정"
                description="[상여금 정책 탭]에서 확인해주세요."
              />
            );
          })()}
        </Space>
      </Modal>
    </Space>
  );
}
