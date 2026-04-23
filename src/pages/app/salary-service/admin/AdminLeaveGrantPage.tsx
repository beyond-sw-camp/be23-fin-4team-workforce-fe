/** /app/leave/grant — 휴가 부여 POST /member-balance/grant (시스템 관리자) */
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Alert, Button, Card, DatePicker, Form, InputNumber, Select, Space, Typography } from 'antd';
import dayjs from 'dayjs';
import { attendanceApi } from '@/features/salary-service/api/attendanceApi';
import { memberApi } from '@/features/member/api/memberApi';
import type { BalanceTypeCode } from '@/features/salary-service/types';

type FormValues = {
  memberId: string;
  balanceType: BalanceTypeCode;
  totalGranted: number;
  expirationDate?: dayjs.Dayjs | null;
};

const BALANCE_OPTIONS: { value: BalanceTypeCode; label: string; description: string }[] = [
  {
    value: 'ANNUAL',
    label: '당해 연차 (ANNUAL)',
    description: '법정 연차에 해당하는 잔여 통로. 휴가 신청 시 가장 흔하게 차감됩니다.',
  },
  {
    value: 'MONTHLY',
    label: '월차 (MONTHLY)',
    description: '입사 1년 미만 등 월 단위로 쌓는 잔여 통로.',
  },
  {
    value: 'CARRYOVER',
    label: '이월 연차 (CARRYOVER)',
    description: '전년 이월분. 회사 정책에서 이월을 허용할 때 사용합니다.',
  },
];

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

function apiErrorMessage(e: unknown): string {
  if (typeof e === 'object' && e !== null && 'message' in e) {
    const m = (e as { message?: unknown }).message;
    if (typeof m === 'string' && m.trim()) return m;
  }
  if (e instanceof Error) return e.message;
  return '요청에 실패했습니다.';
}

/** GET /member/search — 호출자 소속 회사 직원만 */
function MemberGrantTargetField() {
  const [searchText, setSearchText] = useState('');
  const debounced = useDebouncedValue(searchText, 320);
  const { data: rows = [], isFetching, isError, error } = useQuery({
    queryKey: ['member', 'search', 'leave-grant', debounced],
    queryFn: () => memberApi.searchMembersLookup({ keyword: debounced.trim(), page: 0, size: 30 }),
    enabled: debounced.trim().length >= 1,
    retry: 1,
  });
  const options = useMemo(
    () =>
      rows.map((m) => ({
        value: m.memberId,
        label: [m.name ?? '이름 없음', m.organizationName, m.jobTitleName, m.email].filter(Boolean).join(' · '),
      })),
    [rows],
  );
  const errMsg = isError
    ? apiErrorMessage(error)
    : null;

  return (
    <Form.Item
      name="memberId"
      label="부여 대상 직원"
      rules={[{ required: true, message: '검색 후 직원을 선택하세요.' }]}
      extra="이름·이메일·부서 등으로 검색한 뒤 목록에서 선택합니다. (구성원 UUID를 직접 입력할 필요 없음)"
    >
      <Select
        showSearch
        allowClear
        placeholder="검색어 입력…"
        filterOption={false}
        searchValue={searchText}
        onSearch={setSearchText}
        onClear={() => setSearchText('')}
        notFoundContent={
          debounced.trim().length < 1 ? (
            <span className="tw-text-slate-500">한 글자 이상 입력하세요.</span>
          ) : isFetching ? (
            '검색 중…'
          ) : errMsg ? (
            <span className="tw-text-red-600">{errMsg}</span>
          ) : (
            '검색 결과 없음'
          )
        }
        options={options}
        loading={isFetching}
      />
    </Form.Item>
  );
}

export function AdminLeaveGrantPage() {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [form] = Form.useForm<FormValues>();

  const grantM = useMutation({
    mutationFn: (v: FormValues) =>
      attendanceApi.memberBalance.grant({
        memberId: v.memberId.trim(),
        balanceType: v.balanceType,
        totalGranted: v.totalGranted,
        expirationDate: v.expirationDate ? v.expirationDate.format('YYYY-MM-DD') : null,
      }),
    onSuccess: () => {
      message.success('휴가가 부여되었습니다.');
      form.resetFields();
      void qc.invalidateQueries({ queryKey: ['salary', 'member-balance'] });
    },
    onError: (e: unknown) => message.error(apiErrorMessage(e) || '부여에 실패했습니다.'),
  });

  return (
    <Space direction="vertical" className="tw-w-full" size={16}>
      <div>
        <Typography.Title level={4} className="!tw-m-0 !tw-text-slate-900">
          휴가 부여
        </Typography.Title>
        <Typography.Paragraph type="secondary" className="!tw-mb-0 !tw-mt-1 !tw-text-sm">
          관리자가 특정 직원의{' '}
          <Typography.Text strong>연차·월차·이월</Typography.Text> 잔여 통로에 일수를 수동으로 쌓습니다.{' '}
          <Typography.Text code>POST /member-balance/grant</Typography.Text>
        </Typography.Paragraph>
      </div>

      <Alert
        type="info"
        showIcon
        message="정책 자동 부여와 이 화면의 역할"
        description={
          <div className="tw-text-sm">
            연차·월차 등은 보통{' '}
            <Typography.Text strong>휴가 정책·배치(스케줄러)</Typography.Text>에 따라 입사일·회계연도 등 기준으로 자동
            부여되는 흐름을 둡니다. 이 메뉴는 그보다 <Typography.Text strong>예외 조정</Typography.Text>(정책 반영 전
            보정, 경영 가산, 이월 수동 반영 등)을 위한 수동 부여입니다. 자동이 안 되는지 확인할 때는 배치 실행·정책
            설정·로그를 먼저 보는 것이 좋습니다.
          </div>
        }
      />

      <Alert
        type="warning"
        showIcon
        message="특별 휴가·회사 휴가 종류와의 관계"
        description={
          <div className="tw-text-sm">
            현재 이 API의 <Typography.Text strong>잔여 유형</Typography.Text>은{' '}
            <Typography.Text code>ANNUAL</Typography.Text>, <Typography.Text code>MONTHLY</Typography.Text>,{' '}
            <Typography.Text code>CARRYOVER</Typography.Text> 세 가지뿐입니다. 병가·경조사 등{' '}
            <Typography.Text strong>회사 휴가 종류별로 각각 잔고를 나눠 쌓는 방식</Typography.Text>은 이 화면만으로는
            지원되지 않으며, 백엔드에서 <Typography.Text code>BalanceType</Typography.Text>·차감 로직을 확장해야 합니다.
            지금은 &quot;특별히 일수를 더 준다&quot;는 의미에서 위 세 통로 중 하나를 선택해 부여하는 식으로 쓰는 것이
            맞습니다.
          </div>
        }
      />

      <Card className="tw-max-w-xl tw-border-slate-200/80 tw-shadow-sm">
        <Form<FormValues>
          form={form}
          layout="vertical"
          initialValues={{ balanceType: 'ANNUAL', totalGranted: 1 }}
          onFinish={(v) => grantM.mutate(v)}
        >
          <MemberGrantTargetField />
          <Form.Item name="balanceType" label="잔여 유형 (부여 통로)" rules={[{ required: true }]}>
            <Select
              options={BALANCE_OPTIONS.map((o) => ({
                value: o.value,
                label: `${o.label} — ${o.description}`,
              }))}
            />
          </Form.Item>
          <Form.Item name="totalGranted" label="부여 일수" rules={[{ required: true }]}>
            <InputNumber className="tw-w-full" min={0.5} step={0.5} />
          </Form.Item>
          <Form.Item name="expirationDate" label="만료일 (선택)">
            <DatePicker className="tw-w-full" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={grantM.isPending}>
              부여
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </Space>
  );
}
