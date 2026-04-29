/**
 * /app/payroll/$payrollId
 * 한국 표준 급여명세서 양식
 *  - 상단 급여구분 + 근무기간 + 지급일 + 상세 산출방법
 *  - 정보 배너 정상근무 시간 + 실수령액
 *  - 좌우 2단 지급내역 / 공제내역 (세금공제 + 기타공제)
 *  - 우하단 출력 버튼
 */
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  App,
  Button,
  Drawer,
  Popover,
  Select,
  Space,
  Tag,
  Typography,
} from 'antd';
import {
  CloseOutlined,
  PrinterOutlined,
  FileSearchOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/features/auth/useAuth';
import { salaryApi } from '@/features/salary-service/api/salaryApi';
import type { PayrollItem, PayrollTypeCode } from '@/features/salary-service/types';

const PAYROLL_TYPE_KO: Record<string, string> = {
  REGULAR_MONTHLY: '정기급여',
  PERFORMANCE_BONUS: '성과급',
  SPECIAL_BONUS: '특별상여',
  RETROACTIVE: '소급분',
};

function formatWon(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return '—';
  return `${Number(n).toLocaleString('ko-KR')}원`;
}

function formatDateDot(s: string | null | undefined) {
  if (!s) return '—';
  return s.replace(/-/g, '.');
}

// 세금공제로 간주할 항목명
const TAX_DEDUCTION_NAMES = new Set([
  '소득세',
  '주민세',
  '지방소득세',
]);

export function PayrollDetailPage() {
  const { payrollId } = useParams({ strict: false }) as { payrollId: string };
  const { user } = useAuth();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [calcOpen, setCalcOpen] = useState(false);

  const payrollQ = useQuery({
    queryKey: ['salary', 'payroll', payrollId],
    queryFn: () => salaryApi.payroll.getById(payrollId),
    enabled: Boolean(payrollId),
  });

  const payroll = payrollQ.data;
  const canViewPayroll = Boolean(
    payroll && user?.id && (payroll.memberId === user.id || user.isSystemAdmin === true),
  );

  const itemsQ = useQuery({
    queryKey: ['salary', 'payroll', payrollId, 'items'],
    queryFn: () => salaryApi.payroll.listItems(payrollId),
    enabled: Boolean(payrollId) && canViewPayroll,
  });

  const pdfMut = useMutation({
    mutationFn: () => salaryApi.payroll.downloadPayslipPdf(payrollId),
    onSuccess: (blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `payslip-${payrollId}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    },
    onError: async (err: unknown) => {
      // axios responseType=blob 일 때 에러 응답도 Blob 으로 옴 — 텍스트로 풀어서 메시지 노출
      let detail = '';
      const e = err as { response?: { data?: unknown } };
      const data = e?.response?.data;
      if (data instanceof Blob) {
        try {
          const text = await data.text();
          try {
            const json = JSON.parse(text);
            detail = json?.message || json?.error || text;
          } catch {
            detail = text;
          }
        } catch {
          /* noop */
        }
      } else if (typeof data === 'object' && data !== null) {
        detail = (data as { message?: string }).message || '';
      }
      void message.error(detail ? `급여명세서 다운로드 실패: ${detail}` : '급여명세서 다운로드에 실패했습니다.');
    },
  });

  const canDownload =
    canViewPayroll &&
    (payroll?.payrollStatus === 'CONFIRMED' || payroll?.payrollStatus === 'PAID');

  useEffect(() => {
    if (!payroll || !user?.id) return;
    const mine = payroll.memberId === user.id;
    const admin = user.isSystemAdmin === true;
    if (!mine && !admin) {
      void navigate({ to: '/app/payroll' });
    }
  }, [payroll, user?.id, user?.isSystemAdmin, navigate]);

  const sortedItems = useMemo(() => {
    const list = itemsQ.data ?? [];
    return [...list].sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
  }, [itemsQ.data]);

  // 카테고리별 분류
  const earningItems = useMemo(
    () => sortedItems.filter((i) => i.itemType === 'EARNING'),
    [sortedItems],
  );
  const taxDeductionItems = useMemo(
    () =>
      sortedItems.filter(
        (i) => i.itemType === 'DEDUCTION' && TAX_DEDUCTION_NAMES.has(i.itemName ?? ''),
      ),
    [sortedItems],
  );
  const otherDeductionItems = useMemo(
    () =>
      sortedItems.filter(
        (i) => i.itemType === 'DEDUCTION' && !TAX_DEDUCTION_NAMES.has(i.itemName ?? ''),
      ),
    [sortedItems],
  );

  // 근무기간 — payrollYearMonthDay 의 해당월 1일~말일
  const period = useMemo(() => {
    if (!payroll?.payrollYearMonthDay) return null;
    const d = dayjs(payroll.payrollYearMonthDay);
    if (!d.isValid()) return null;
    const start = d.startOf('month').format('YYYY.MM.DD');
    const end = d.endOf('month').format('MM.DD');
    return `${start}~${end}`;
  }, [payroll]);

  if (!payrollId) {
    return <Typography.Text type="danger">급여대장 ID가 없습니다.</Typography.Text>;
  }

  if (payrollQ.isError) {
    return (
      <Typography.Text type="danger">
        조회에 실패했습니다. 권한이나 ID를 확인해 주세요.
      </Typography.Text>
    );
  }

  return (
    <div className="tw-min-h-screen tw-bg-white">
      {/* ─── 상단 헤더 ─── */}
      <div className="tw-flex tw-items-center tw-justify-between tw-px-8 tw-py-5 tw-border-b tw-border-slate-100">
        <Typography.Title level={3} className="!tw-m-0 !tw-font-bold">
          급여명세서
        </Typography.Title>
        <Link to="/app/payroll" className="tw-text-slate-400 hover:tw-text-slate-600">
          <CloseOutlined style={{ fontSize: 22 }} />
        </Link>
      </div>

      {/* ─── 메타 영역 ─── */}
      <div className="tw-flex tw-items-center tw-flex-wrap tw-gap-4 tw-px-8 tw-py-4">
        <Space size={8} align="center">
          <Typography.Text className="!tw-text-sm !tw-text-slate-500">
            급여 구분
          </Typography.Text>
          <Select
            value={payroll?.payrollType ?? 'REGULAR_MONTHLY'}
            disabled
            style={{ width: 140 }}
            options={[
              { value: 'REGULAR_MONTHLY', label: PAYROLL_TYPE_KO.REGULAR_MONTHLY },
              { value: 'PERFORMANCE_BONUS', label: PAYROLL_TYPE_KO.PERFORMANCE_BONUS },
              { value: 'SPECIAL_BONUS', label: PAYROLL_TYPE_KO.SPECIAL_BONUS },
              { value: 'RETROACTIVE', label: PAYROLL_TYPE_KO.RETROACTIVE },
            ]}
          />
        </Space>

        <div className="tw-ml-auto tw-flex tw-items-center tw-gap-6">
          <Space size={6}>
            <Typography.Text className="!tw-text-sm !tw-text-slate-500">근무기간</Typography.Text>
            <Typography.Text strong className="!tw-text-sm">
              {period ?? '—'}
            </Typography.Text>
          </Space>
          <Space size={6}>
            <Typography.Text className="!tw-text-sm !tw-text-slate-500">지급일</Typography.Text>
            <Typography.Text strong className="!tw-text-sm">
              {formatDateDot(payroll?.paidAt ?? payroll?.payrollYearMonthDay)}
            </Typography.Text>
          </Space>
          <Button
            icon={<FileSearchOutlined />}
            onClick={() => setCalcOpen(true)}
            type="default"
          >
            상세 산출방법
          </Button>
        </div>
      </div>

      {/* ─── 정보 배너 ─── */}
      <div className="tw-mx-8 tw-mb-6 tw-rounded-xl tw-bg-[#EEF1FF] tw-px-6 tw-py-5 tw-flex tw-items-center tw-justify-between">
        <Space size={12}>
          <span className="tw-text-blue-500">●</span>
          <Typography.Text className="!tw-text-sm !tw-text-slate-700">
            근무시간
          </Typography.Text>
          <Typography.Text className="!tw-text-sm tw-ml-2 tw-text-slate-500">
            정상근무
          </Typography.Text>
          <Typography.Text strong className="!tw-text-base">
            168H
          </Typography.Text>
        </Space>
        <Space size={12}>
          <span className="tw-text-blue-500">●</span>
          <Typography.Text className="!tw-text-sm !tw-text-slate-700">
            실수령액
          </Typography.Text>
          <Typography.Title level={4} className="!tw-m-0 !tw-font-bold !tw-text-slate-900">
            {formatWon(payroll?.netPay)}
          </Typography.Title>
        </Space>
      </div>

      {/* ─── 메인 2단 ─── */}
      <div className="tw-px-8 tw-grid tw-grid-cols-1 lg:tw-grid-cols-2 tw-gap-12">
        {/* 좌측 — 지급내역 */}
        <section>
          <div className="tw-flex tw-items-baseline tw-justify-between tw-mb-3 tw-pb-3 tw-border-b-2 tw-border-slate-900">
            <Typography.Title level={5} className="!tw-m-0 !tw-font-bold">
              지급내역
            </Typography.Title>
            <Typography.Text strong className="!tw-text-base">
              {formatWon(payroll?.totalPayment)}
            </Typography.Text>
          </div>

          <SubGroup title="수당">
            {earningItems.map((it) => (
              <ItemRow
                key={it.payrollItemId}
                name={it.itemName ?? ''}
                amount={it.amount ?? 0}
                isNonTaxable={it.isTaxableYn === 'N'}
              />
            ))}
            {earningItems.length === 0 && (
              <Typography.Text type="secondary" className="!tw-text-xs">
                지급 항목이 없습니다.
              </Typography.Text>
            )}
          </SubGroup>
        </section>

        {/* 우측 — 공제내역 */}
        <section>
          <div className="tw-flex tw-items-baseline tw-justify-between tw-mb-3 tw-pb-3 tw-border-b-2 tw-border-slate-900">
            <Typography.Title level={5} className="!tw-m-0 !tw-font-bold">
              공제내역
            </Typography.Title>
            <Typography.Text strong className="!tw-text-base !tw-text-red-500">
              -{formatWon(payroll?.totalDeduction)}
            </Typography.Text>
          </div>

          <SubGroup title="세금공제">
            {taxDeductionItems.map((it) => (
              <ItemRow
                key={it.payrollItemId}
                name={it.itemName ?? ''}
                amount={it.amount ?? 0}
              />
            ))}
            {taxDeductionItems.length === 0 && (
              <Typography.Text type="secondary" className="!tw-text-xs">
                세금공제 항목이 없습니다.
              </Typography.Text>
            )}
          </SubGroup>

          <div className="tw-h-4" />

          <SubGroup title="기타공제">
            {otherDeductionItems.map((it) => (
              <ItemRow
                key={it.payrollItemId}
                name={it.itemName ?? ''}
                amount={it.amount ?? 0}
              />
            ))}
            {otherDeductionItems.length === 0 && (
              <Typography.Text type="secondary" className="!tw-text-xs">
                기타공제 항목이 없습니다.
              </Typography.Text>
            )}
          </SubGroup>
        </section>
      </div>

      {/* ─── 출력 버튼 ─── */}
      <div className="tw-flex tw-justify-end tw-px-8 tw-py-8">
        <Button
          icon={<PrinterOutlined />}
          shape="round"
          size="large"
          disabled={!canDownload}
          loading={pdfMut.isPending}
          onClick={() => pdfMut.mutate()}
        >
          출력
        </Button>
      </div>

      {/* ─── 상세 산출방법 Drawer ─── */}
      <Drawer
        open={calcOpen}
        onClose={() => setCalcOpen(false)}
        title="상세 산출방법"
        width={520}
        placement="right"
      >
        <Typography.Paragraph type="secondary" className="!tw-text-xs">
          본 명세서의 모든 항목은 회사 급여 정책 + 한국 노동법 + 세법에 따라 자동 산정됩니다.
        </Typography.Paragraph>

        <CalcSection title="통상시급 환산">
          <Typography.Paragraph className="!tw-text-sm !tw-mb-1">
            <code>통상시급 = (기본급 + 통상임금 항목 합계) ÷ 월 소정근로시간</code>
          </Typography.Paragraph>
          <Typography.Text type="secondary" className="!tw-text-xs">
            한국 표준 209시간 (주 40h × 4.345주 + 주휴 8h × 4.345주)
          </Typography.Text>
        </CalcSection>

        <CalcSection title="가산수당">
          <Typography.Paragraph className="!tw-text-sm !tw-mb-1">
            연장근로 = 통상시급 × 시간 × 1.5<br />
            야간근로 = 통상시급 × 시간 × 0.5 (가산분만)<br />
            휴일근로 = 통상시급 × 시간 × 1.5 (8시간 초과 2.0)
          </Typography.Paragraph>
          <Typography.Text type="secondary" className="!tw-text-xs">
            근로기준법 제56조
          </Typography.Text>
        </CalcSection>

        <CalcSection title="비과세 항목">
          <Typography.Paragraph className="!tw-text-sm !tw-mb-1">
            식대 월 20만원 / 자가운전보조금 월 20만원 / 보육수당 월 20만원 한도
          </Typography.Paragraph>
          <Typography.Text type="secondary" className="!tw-text-xs">
            한도 초과분만 과세소득에 포함
          </Typography.Text>
        </CalcSection>

        <CalcSection title="4대보험 + 원천세">
          <Typography.Paragraph className="!tw-text-sm !tw-mb-1">
            국민연금 4.5% / 건강보험 3.545% / 장기요양 12.95% (건보료 기준)<br />
            고용보험 0.9% / 소득세 (간이세액표) / 지방소득세 (소득세 × 10%)
          </Typography.Paragraph>
          <Typography.Text type="secondary" className="!tw-text-xs">
            국세청 고시 / 보건복지부 고시 / 고용노동부 고시
          </Typography.Text>
        </CalcSection>
      </Drawer>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
 * 보조 컴포넌트
 * ───────────────────────────────────────────────────────────── */

function SubGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="tw-mb-2">
      <Typography.Text strong className="!tw-text-sm !tw-text-slate-700 tw-block tw-mb-2">
        {title}
      </Typography.Text>
      <div className="tw-flex tw-flex-col tw-gap-2.5 tw-pl-1">{children}</div>
    </div>
  );
}

function ItemRow({
  name,
  amount,
  isNonTaxable,
}: {
  name: string;
  amount: number;
  isNonTaxable?: boolean;
}) {
  return (
    <div className="tw-flex tw-items-center tw-justify-between tw-py-1.5 tw-border-b tw-border-slate-100">
      <Space size={6}>
        <Typography.Text className="!tw-text-sm !tw-text-slate-700">{name}</Typography.Text>
        {isNonTaxable && (
          <Tag color="default" className="!tw-text-[10px] !tw-px-1.5 !tw-py-0 !tw-leading-4">
            비과세
          </Tag>
        )}
      </Space>
      <Typography.Text className="!tw-text-sm tw-font-medium">
        {formatWon(amount)}
      </Typography.Text>
    </div>
  );
}

function CalcSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="tw-mb-4 tw-pb-4 tw-border-b tw-border-slate-100 last:tw-border-0">
      <Typography.Title level={5} className="!tw-m-0 !tw-mb-2 !tw-text-slate-900">
        {title}
      </Typography.Title>
      {children}
    </div>
  );
}
