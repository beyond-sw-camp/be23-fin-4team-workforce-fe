/** /app/leave/grant — 특별휴가 일괄 부여 POST /member-balance/grant (시스템 관리자) */
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Alert, Button, Card, DatePicker, Form, InputNumber, Select, Space, Typography } from 'antd';
import type dayjs from 'dayjs';
import { attendanceApi } from '@/features/salary-service/api/attendanceApi';
import { memberApi } from '@/features/member/api/memberApi';

type FormValues = {
  memberIds: string[];
  totalGranted: number;
  expirationDate?: dayjs.Dayjs | null;
};

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
      name="memberIds"
      label="부여 대상 직원 (복수 선택)"
      rules={[{ required: true, message: '검색 후 직원을 한 명 이상 선택하세요.' }]}
      extra="이름·이메일·부서 등으로 검색한 뒤 여러 직원을 선택할 수 있습니다."
    >
      <Select
        mode="multiple"
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
        maxTagCount="responsive"
      />
    </Form.Item>
  );
}

export function AdminLeaveGrantPage() {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [form] = Form.useForm<FormValues>();
  const selectedMemberIds = Form.useWatch('memberIds', form) as string[] | undefined;

  const grantM = useMutation({
    mutationFn: async (v: FormValues) => {
      const targetIds = Array.from(new Set((v.memberIds ?? []).map((id) => id.trim()).filter(Boolean)));
      if (targetIds.length === 0) throw new Error('부여 대상을 한 명 이상 선택해 주세요.');

      let successCount = 0;
      const failed: string[] = [];
      for (const memberId of targetIds) {
        try {
          await attendanceApi.memberBalance.grant({
            memberId,
            balanceType: 'CARRYOVER',
            totalGranted: v.totalGranted,
            expirationDate: v.expirationDate ? v.expirationDate.format('YYYY-MM-DD') : null,
          });
          successCount += 1;
        } catch {
          failed.push(memberId);
        }
      }
      return { successCount, failedCount: failed.length };
    },
    onSuccess: (result) => {
      if (result.failedCount > 0) {
        message.warning(`특별휴가 일괄 부여 완료: 성공 ${result.successCount}명, 실패 ${result.failedCount}명`);
      } else {
        message.success(`특별휴가가 ${result.successCount}명에게 일괄 부여되었습니다.`);
      }
      form.resetFields();
      void qc.invalidateQueries({ queryKey: ['salary', 'member-balance'] });
    },
    onError: (e: unknown) => message.error(apiErrorMessage(e) || '일괄 부여에 실패했습니다.'),
  });

  return (
    <Space direction="vertical" className="tw-w-full" size={16}>
      <div>
        <Typography.Title level={4} className="!tw-m-0 !tw-text-slate-900">
          특별휴가 일괄 부여
        </Typography.Title>
        <Typography.Paragraph type="secondary" className="!tw-mb-0 !tw-mt-1 !tw-text-sm">
          배치 자동 부여(연차·월차·이월)와 분리해서, 관리자가 예외성 특별휴가를 여러 직원에게 한 번에 부여합니다.
        </Typography.Paragraph>
      </div>

      <Alert
        type="info"
        showIcon
        message="정책 자동 부여와 이 화면의 역할"
        description={
          <div className="tw-text-sm">
            정기 휴가(연차·월차·이월)는 <Typography.Text strong>스케줄러/배치 자동 부여</Typography.Text>가 기본입니다.
            이 화면은 예외성 보상, 포상, 운영 보정 같은 <Typography.Text strong>특별휴가 수동 부여</Typography.Text>에
            사용해 주세요.
          </div>
        }
      />

      <Alert
        type="warning"
        showIcon
        message="현재 저장 방식"
        description={
          <div className="tw-text-sm">
            현재 API 제약으로 특별휴가는 <Typography.Text code>CARRYOVER</Typography.Text> 잔여 통로에 누적 저장됩니다.
            휴가 종류별 별도 잔고 분리를 원하면 백엔드 <Typography.Text code>BalanceType</Typography.Text> 확장이 필요합니다.
          </div>
        }
      />

      <Card className="tw-max-w-xl tw-border-slate-200/80 tw-shadow-sm">
        <Form<FormValues>
          form={form}
          layout="vertical"
          initialValues={{ memberIds: [], totalGranted: 1 }}
          onFinish={(v) => grantM.mutate(v)}
        >
          <MemberGrantTargetField />
          <Form.Item label="부여 통로">
            <Typography.Text strong>CARRYOVER (특별휴가 누적 통로)</Typography.Text>
          </Form.Item>
          <Form.Item name="totalGranted" label="부여 일수" rules={[{ required: true }]}>
            <InputNumber className="tw-w-full" min={0.5} step={0.5} />
          </Form.Item>
          <Form.Item name="expirationDate" label="만료일 (선택)">
            <DatePicker className="tw-w-full" />
          </Form.Item>
          <Typography.Paragraph type="secondary" className="!tw-mb-3 !tw-text-xs">
            선택된 대상: {selectedMemberIds?.length ?? 0}명
          </Typography.Paragraph>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={grantM.isPending}>
              일괄 부여
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </Space>
  );
}
