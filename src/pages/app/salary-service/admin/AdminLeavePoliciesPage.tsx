/** /app/leave/policies — 연차 정책 CRUD (시스템 관리자) */
import { Link } from '@tanstack/react-router';
import { useMemo, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  App,
  Alert,
  Button,
  Card,
  Divider,
  Form,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { FormInstance } from 'antd';
import {
  CheckCircleTwoTone,
  CloseCircleTwoTone,
  DeleteOutlined,
  EditOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { attendanceApi } from '@/features/salary-service/api/attendanceApi';
import { AppDoubleActionModal } from '@/shared/ui/AppDoubleActionModal';
import { AppUnitInputNumber } from '@/shared/ui/AppUnitInputNumber';
import { AppWorkspacePageTitle } from '@/shared/ui/AppWorkspacePageTitle';
import type { AccrualBaseCode, LeavePolicy } from '@/features/salary-service/types';

type FormValues = {
  accrualBase: AccrualBaseCode;
  defaultAnnualDays: number;
  // 근속별 가산 룰 (근로기준법 60조)
  extraDaysPerInterval: number;
  extraIntervalYears: number;
  maxAnnualDays: number;
  isPromotionYn: boolean;
  promotion1stBeforeDays?: number | null;
  promotion2ndBeforeDays?: number | null;
  isCarryoverYn: boolean;
  carryoverDays?: number | null;
  /** 이월 동의서 사용 여부 - true 면 직원별 동의 받아야 이월 처리 */
  isCarryoverConsentYn: boolean;
  isPayoutYn: boolean;
};

const QK = ['salary', 'leave-policies'] as const;
const NAVY_BUTTON_CLASS =
  '!tw-h-11 !tw-rounded-xl !tw-border-0 !tw-bg-[#1e3a5f] !tw-px-5 !tw-font-semibold !tw-text-white !tw-shadow-none hover:!tw-bg-[#152a45] disabled:!tw-border disabled:!tw-border-slate-200 disabled:!tw-bg-slate-100 disabled:!tw-text-slate-500';
const TABLE_ACTION_BUTTON_CLASS =
  '!tw-inline-flex !tw-size-8 !tw-items-center !tw-justify-center !tw-rounded-lg !tw-border-0 !tw-shadow-none';

function apiErrorMessage(e: unknown): string {
  if (typeof e === 'object' && e !== null && 'message' in e) {
    const m = (e as { message?: unknown }).message;
    if (typeof m === 'string' && m.trim()) return m;
  }
  if (e instanceof Error) return e.message;
  return '요청에 실패했습니다.';
}

const ACCRUAL_KO: Record<string, string> = {
  FISCAL: '회계연도',
  HIRE_DATE: '입사일',
};

function yn(v: string | null | undefined): boolean {
  return v === 'Y' || v === 'YES';
}

function toYn(v: boolean): 'Y' | 'N' {
  return v ? 'Y' : 'N';
}

export function AdminLeavePoliciesPage({ embedded = false }: { embedded?: boolean } = {}) {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<LeavePolicy | null>(null);
  const [form] = Form.useForm<FormValues>();

  const listQ = useQuery({
    queryKey: QK,
    queryFn: () => attendanceApi.leavePolicy.list(),
    /** 정책 목록은 자주 바뀌지 않음 — 탭 이동 시 불필요한 재요청 감소 */
    staleTime: 60_000,
  });

  const leavePromotionEnabled = useMemo(
    () => (listQ.data ?? []).some((p) => yn(p.isPromotionYn)),
    [listQ.data],
  );

  const buildPayload = (v: FormValues) => ({
    accrualBase: v.accrualBase,
    defaultAnnualDays: v.defaultAnnualDays,
    extraDaysPerInterval: v.extraDaysPerInterval,
    extraIntervalYears: v.extraIntervalYears,
    maxAnnualDays: v.maxAnnualDays,
    isPromotionYn: toYn(v.isPromotionYn),
    promotion1stBeforeDays: v.isPromotionYn ? (v.promotion1stBeforeDays ?? null) : null,
    promotion2ndBeforeDays: v.isPromotionYn ? (v.promotion2ndBeforeDays ?? null) : null,
    isCarryoverYn: toYn(v.isCarryoverYn),
    carryoverDays: v.isCarryoverYn ? (v.carryoverDays ?? null) : null,
    isCarryoverConsentYn: v.isCarryoverYn ? toYn(v.isCarryoverConsentYn) : 'N',
    isPayoutYn: toYn(v.isPayoutYn),
  });

  const createM = useMutation({
    mutationFn: (v: FormValues) => attendanceApi.leavePolicy.create(buildPayload(v)),
  });

  const updateM = useMutation({
    mutationFn: (input: { id: string; v: FormValues }) =>
      attendanceApi.leavePolicy.update(input.id, buildPayload(input.v)),
  });

  const deleteM = useMutation({
    mutationFn: (id: string) => attendanceApi.leavePolicy.delete(id),
    onSuccess: (_void, deletedId) => {
      message.success('삭제되었습니다.');
      qc.setQueryData<LeavePolicy[]>(QK, (old) =>
        (old ?? []).filter((p) => p.policyId !== deletedId),
      );
    },
    onError: (e: unknown) => message.error(apiErrorMessage(e) || '삭제에 실패했습니다.'),
  });

  const columns = useMemo<ColumnsType<LeavePolicy>>(
    () => [
      {
        title: '발생기준',
        dataIndex: 'accrualBase',
        key: 'accrualBase',
        width: 120,
        render: (v) => <Tag color="blue">{ACCRUAL_KO[v as string] ?? v}</Tag>,
      },
      {
        title: '기본 부여(일)',
        dataIndex: 'defaultAnnualDays',
        key: 'defaultAnnualDays',
        width: 120,
      },
      {
        title: '촉진제도',
        key: 'promotion',
        width: 200,
        render: (_, r) =>
          yn(r.isPromotionYn) ? (
            <span>
              <Tag color="green">사용</Tag>
              <span className="tw-text-xs tw-text-slate-500">
                1차 {r.promotion1stBeforeDays ?? '-'}일 / 2차 {r.promotion2ndBeforeDays ?? '-'}일
              </span>
            </span>
          ) : (
            <Tag>미사용</Tag>
          ),
      },
      {
        title: '이월',
        key: 'carryover',
        width: 200,
        render: (_, r) =>
          yn(r.isCarryoverYn) ? (
            <span>
              <Tag color="green">허용 ({r.carryoverDays ?? 0}일)</Tag>
            </span>
          ) : (
            <Tag>금지</Tag>
          ),
      },
      {
        title: '미사용 수당',
        dataIndex: 'isPayoutYn',
        key: 'isPayoutYn',
        width: 120,
        render: (v) => (yn(v) ? <Tag color="green">지급</Tag> : <Tag>미지급</Tag>),
      },
      {
        title: '액션',
        key: 'actions',
        width: 96,
        align: 'center',
        render: (_, r) => (
          <Space size={4}>
            <Button
              type="text"
              size="small"
              title="수정"
              aria-label="연차 정책 수정"
              icon={<EditOutlined />}
              className={`${TABLE_ACTION_BUTTON_CLASS} !tw-text-slate-500 hover:!tw-bg-slate-100 hover:!tw-text-slate-900`}
              onClick={() => {
                setEditing(r);
                setOpen(true);
                form.setFieldsValue({
                  accrualBase: (r.accrualBase as AccrualBaseCode) ?? 'FISCAL',
                  defaultAnnualDays: r.defaultAnnualDays ?? 15,
                  extraDaysPerInterval: r.extraDaysPerInterval ?? 1,
                  extraIntervalYears: r.extraIntervalYears ?? 2,
                  maxAnnualDays: r.maxAnnualDays ?? 25,
                  isPromotionYn: yn(r.isPromotionYn),
                  promotion1stBeforeDays: r.promotion1stBeforeDays ?? undefined,
                  promotion2ndBeforeDays: r.promotion2ndBeforeDays ?? undefined,
                  isCarryoverYn: yn(r.isCarryoverYn),
                  isCarryoverConsentYn: yn(r.isCarryoverConsentYn),
                  carryoverDays: r.carryoverDays ?? undefined,
                  isPayoutYn: yn(r.isPayoutYn),
                });
              }}
            />
            <Popconfirm
              title="삭제하시겠어요?"
              okText="삭제"
              cancelText="취소"
              onConfirm={() => r.policyId && deleteM.mutate(r.policyId)}
            >
              <Button
                type="text"
                size="small"
                danger
                title="삭제"
                aria-label="연차 정책 삭제"
                icon={<DeleteOutlined />}
                className={`${TABLE_ACTION_BUTTON_CLASS} hover:!tw-bg-red-50`}
              />
            </Popconfirm>
          </Space>
        ),
      },
    ],
    [deleteM, form],
  );

  const MSG_KEY = 'leave-policy-save';

  const handlePolicyModalOk = () =>
    form.validateFields().then(async (v) => {
      if (editing?.policyId) {
        message.loading({ content: '수정 중…', key: MSG_KEY, duration: 0 });
        try {
          const updated = await updateM.mutateAsync({ id: editing.policyId, v });
          qc.setQueryData<LeavePolicy[]>(QK, (old) => {
            const prev = old ?? [];
            const id = updated.policyId;
            if (!id) return [...prev, updated];
            return prev.map((p) => (p.policyId === id ? { ...p, ...updated } : p));
          });
          setOpen(false);
          setEditing(null);
          form.resetFields();
          message.success({ content: '수정되었습니다.', key: MSG_KEY });
        } catch (e) {
          message.error({ content: apiErrorMessage(e) || '수정에 실패했습니다.', key: MSG_KEY });
        }
        return;
      }

      /** 등록: 모달을 먼저 닫고 상단 로딩으로 진행 표시 — 서버가 느려도 “멈춤”처럼 보이지 않게 */
      setOpen(false);
      const snapshot = { ...v };
      form.resetFields();
      setEditing(null);
      message.loading({ content: '정책 등록 중…', key: MSG_KEY, duration: 0 });
      try {
        const created = await createM.mutateAsync(snapshot);
        qc.setQueryData<LeavePolicy[]>(QK, (old) => [...(old ?? []), created]);
        message.success({ content: '정책이 등록되었습니다.', key: MSG_KEY });
      } catch (e) {
        message.error({ content: apiErrorMessage(e) || '등록에 실패했습니다.', key: MSG_KEY });
        setOpen(true);
        window.setTimeout(() => {
          form.setFieldsValue(snapshot);
        }, 0);
      }
    });

  const pageActions = (
    <Space wrap>
      {leavePromotionEnabled ? (
        <Link to="/app/leave/promotion-no-response">
          <Button type="default">연차 통보 미응답자 관리</Button>
        </Link>
      ) : null}
      <Button
        type="primary"
        className={NAVY_BUTTON_CLASS}
        onClick={() => {
          setEditing(null);
          form.resetFields();
          form.setFieldsValue({
            accrualBase: 'FISCAL',
            defaultAnnualDays: 15,
            extraDaysPerInterval: 1,
            extraIntervalYears: 2,
            maxAnnualDays: 25,
            isPromotionYn: false,
            // 신규 정책 등록 시 표준 기본값 - 근로기준법 권고 기준치
            promotion1stBeforeDays: 180,
            promotion2ndBeforeDays: 60,
            isCarryoverYn: false,
            carryoverDays: 5,
            isCarryoverConsentYn: false,
            isPayoutYn: false,
          });
          setOpen(true);
        }}
      >
        정책 추가
      </Button>
    </Space>
  );

  return (
    <Space direction="vertical" className="tw-w-full" size={16}>
      {embedded ? (
        <div className="tw-flex tw-flex-wrap tw-items-center tw-justify-between tw-gap-3">
          <Typography.Text className="!tw-text-sm !tw-text-slate-600">
            연차 발생, 촉진제도, 이월, 미사용 수당 기준을 관리합니다.
          </Typography.Text>
          {pageActions}
        </div>
      ) : (
        <AppWorkspacePageTitle
          eyebrow="LEAVE"
          title="연차 정책 관리"
          subtitle="연차 발생 기준, 촉진제도, 이월, 미사용 연차 수당 정책을 관리합니다."
          extra={pageActions}
        />
      )}

      {listQ.isError ? (
        <Alert
          type="error"
          showIcon
          message="연차 정책 목록을 불러오지 못했습니다."
          description={apiErrorMessage(listQ.error)}
        />
      ) : null}

      <Card>
        {/* TODO: 서버 페이지네이션 전환 필요 */}
        <Table<LeavePolicy>
          rowKey={(r, index) => (r.policyId ? r.policyId : `row-${index}`)}
          loading={listQ.isLoading || listQ.isFetching}
          dataSource={listQ.data ?? []}
          columns={columns}
          pagination={{ pageSize: 10 }}
          locale={{ emptyText: '등록된 정책이 없습니다.' }}
        />
      </Card>

      <AppDoubleActionModal
        open={open}
        onClose={() => {
          setOpen(false);
          setEditing(null);
          form.resetFields();
        }}
        onConfirm={handlePolicyModalOk}
        confirmLoading={createM.isPending || updateM.isPending}
        confirmText={editing ? '수정' : '등록'}
        cancelText="취소"
        title={editing ? '연차 정책 수정' : '연차 정책 등록'}
        destroyOnHidden
        width="min(96vw, 1180px)"
      >
        <div className="tw-px-5 tw-py-4">
          <PolicyForm form={form} />
        </div>
      </AppDoubleActionModal>
    </Space>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * 정책 폼 — 섹션화 + 인라인 안내 + 의존 검증 + 시뮬레이터
 * 비기술자 관리자가 정책 의도를 명확히 이해하고 설정할 수 있도록 구성
 * ──────────────────────────────────────────────────────────────────────────── */

type PolicyFormProps = {
  form: FormInstance<FormValues>;
};

function PolicyForm({ form }: PolicyFormProps) {
  /** 라이브 검증/시뮬레이션을 위해 watch */
  const isPromotion = Form.useWatch('isPromotionYn', form);
  const isCarryover = Form.useWatch('isCarryoverYn', form);
  const isPayout = Form.useWatch('isPayoutYn', form);
  const defaultDays = Form.useWatch('defaultAnnualDays', form);
  const carryoverDays = Form.useWatch('carryoverDays', form);
  const promo1st = Form.useWatch('promotion1stBeforeDays', form);
  const promo2nd = Form.useWatch('promotion2ndBeforeDays', form);
  const accrualBaseWatch = Form.useWatch('accrualBase', form);
  // 근속 가산 미리보기
  const extraDays = Form.useWatch('extraDaysPerInterval', form);
  const intervalYears = Form.useWatch('extraIntervalYears', form);
  const maxDays = Form.useWatch('maxAnnualDays', form);

  // 백엔드 LeavePolicy.calculateAnnualDays 와 동일 공식 미리보기 전용
  const previewDays = (years: number): number => {
    if (years < 1) return 0;
    const interval = intervalYears && intervalYears > 0 ? intervalYears : 2;
    const extra = extraDays ?? 1;
    const base = defaultDays ?? 15;
    const cap = maxDays ?? 25;
    const steps = Math.max(0, Math.floor((years - 1) / interval));
    return Math.min(base + steps * extra, cap);
  };
  const previewSamples = [1, 3, 5, 10, 15, 21];

  /** 미사용 연차가 그냥 사라지는 위험 조합 */
  const isLossRisk = isCarryover === false && isPayout === false;

  return (
    <Form<FormValues>
      form={form}
      layout="vertical"
      requiredMark="optional"
      size="small"
      className="wf-leave-policy-form"
    >
      <div className="tw-flex tw-gap-4 tw-items-start">
        <div className="tw-flex-1 tw-min-w-0">
          {/* ── ① 발생 ─────────────────────────────────────────── */}
          <SectionHeader index="1" title="발생" desc="연차가 매년 자동으로 부여되는 기준과 일수" />
          <Space className="tw-w-full" size={16} align="start">
            <Form.Item
              label="발생 기준"
              name="accrualBase"
              rules={[{ required: true, message: '발생 기준을 선택해주세요.' }]}
              style={{ width: 300 }}
              extra={
                <>
                  <div>회계연도: 매년 1/1 일괄 부여</div>
                  <div>입사일: 직원별 입사일 기준 부여</div>
                </>
              }
            >
              <Select
                options={[
                  { value: 'FISCAL', label: '회계연도 (매년 1/1 일괄)' },
                  { value: 'HIRE_DATE', label: '입사일 기준' },
                ]}
              />
            </Form.Item>
            <Form.Item
              label="기본 부여 일수 (1년차)"
              name="defaultAnnualDays"
              rules={[{ required: true, message: '부여 일수를 입력해주세요.' }]}
              style={{ width: 200 }}
              extra="법정 최소 15일 (1년 이상 근속자)"
            >
              <AppUnitInputNumber min={0} step={0.5} unit="일" />
            </Form.Item>
          </Space>

          {/* 근속 가산 룰 (근로기준법 60조) */}
          <Space className="tw-w-full !tw-mt-2" size={16} align="start" wrap>
            <Form.Item
              label="추가 부여 주기"
              name="extraIntervalYears"
              rules={[
                { required: true, message: '주기를 입력해주세요.' },
                { type: 'number', min: 1 },
              ]}
              style={{ width: 180 }}
              extra="근로기준법 = 2년"
            >
              <AppUnitInputNumber
                min={1}
                step={1}
                prefixUnit="매"
                unit="년마다"
              />
            </Form.Item>
            <Form.Item
              label="추가 일수"
              name="extraDaysPerInterval"
              rules={[
                { required: true, message: '추가 일수를 입력해주세요.' },
                { type: 'number', min: 0 },
              ]}
              style={{ width: 180 }}
              extra="근로기준법 = 1일씩"
            >
              <AppUnitInputNumber
                min={0}
                step={0.5}
                prefixUnit="+"
                unit="일"
              />
            </Form.Item>
            <Form.Item
              label="최대 한도"
              name="maxAnnualDays"
              rules={[
                { required: true, message: '한도를 입력해주세요.' },
                { type: 'number', min: 0 },
              ]}
              style={{ width: 180 }}
              extra="근로기준법 = 25일"
            >
              <AppUnitInputNumber min={0} step={0.5} unit="일" />
            </Form.Item>
          </Space>

          {/* 미리보기 — 근속별 연차 시뮬레이터 */}
          <div className="tw-rounded tw-bg-slate-50 tw-border tw-border-slate-200 tw-px-3 tw-py-2 tw-mt-2">
            <div className="tw-text-xs tw-text-slate-500 tw-mb-1">근속별 연차 미리보기</div>
            <Space size={[12, 4]} wrap>
              {previewSamples.map((years) => (
                <span key={years} className="tw-text-sm">
                  <span className="tw-text-slate-500">{years}년차</span>{' '}
                  <span className="tw-font-medium tw-text-[#2563EB]">{previewDays(years)}일</span>
                </span>
              ))}
            </Space>
          </div>

          <Divider className="!tw-my-3" />

          {/* ── ② 촉진제도 ─────────────────────────────────────── */}
          <SectionHeader
            index="2"
            title="촉진제도"
            desc="미사용 연차 사용을 사전 안내하는 제도 (근로기준법 61조). 운영 시 미사용 수당 지급 의무 면제 가능"
          />
          <div className="tw-flex tw-flex-wrap tw-items-start tw-gap-4">
            <Form.Item
              label="촉진제도 사용"
              name="isPromotionYn"
              valuePropName="checked"
              className="!tw-mb-0"
            >
              <Switch checkedChildren="ON" unCheckedChildren="OFF" />
            </Form.Item>
            {isPromotion ? (
              <div className="tw-flex-1 tw-min-w-0">
                <Space className="tw-w-full" size={16} align="start" wrap>
                  <Form.Item
                    label="1차 통보 시점"
                    name="promotion1stBeforeDays"
                    rules={[
                      { required: true, message: '1차 통보일을 입력해주세요.' },
                      {
                        validator: (_, value) => {
                          if (typeof value !== 'number') return Promise.resolve();
                          const second = form.getFieldValue('promotion2ndBeforeDays') as
                            | number
                            | undefined;
                          if (typeof second === 'number') {
                            if (value <= second) {
                              return Promise.reject(
                                new Error(
                                  '1차는 2차보다 더 일찍 통보해야 합니다 (값이 더 커야 함).',
                                ),
                              );
                            }
                            // 근로기준법 61조 - 1차 통보 후 10일 이내 직원 회신 권리 보장
                            if (value - second < 10) {
                              return Promise.reject(
                                new Error(
                                  '1차와 2차 사이는 최소 10일 이상이어야 합니다 (직원 회신 기간 보장).',
                                ),
                              );
                            }
                          }
                          return Promise.resolve();
                        },
                      },
                    ]}
                    style={{ width: 220 }}
                    extra="예: 만료 180일 전 (6개월 전)"
                  >
                    <AppUnitInputNumber
                      min={1}
                      unit="일 전"
                      onChange={() =>
                        /** 1차 변경 시 2차의 검증도 다시 돌려야 함 */
                        form.validateFields(['promotion2ndBeforeDays']).catch(() => {})
                      }
                    />
                  </Form.Item>
                  <Form.Item
                    label="2차 통보 시점"
                    name="promotion2ndBeforeDays"
                    rules={[
                      { required: true, message: '2차 통보일을 입력해주세요.' },
                      {
                        validator: (_, value) => {
                          if (typeof value !== 'number') return Promise.resolve();
                          if (value <= 0) {
                            return Promise.reject(new Error('1일 이상이어야 합니다.'));
                          }
                          const first = form.getFieldValue('promotion1stBeforeDays') as
                            | number
                            | undefined;
                          if (typeof first === 'number') {
                            if (value >= first) {
                              return Promise.reject(
                                new Error('2차는 1차 이후여야 합니다 (값이 더 작아야 함).'),
                              );
                            }
                            // 근로기준법 61조 - 1차/2차 사이 최소 10일
                            if (first - value < 10) {
                              return Promise.reject(
                                new Error(
                                  '1차와 2차 사이는 최소 10일 이상이어야 합니다 (직원 회신 기간 보장).',
                                ),
                              );
                            }
                          }
                          return Promise.resolve();
                        },
                      },
                    ]}
                    style={{ width: 220 }}
                    extra="예: 만료 60일 전 (2개월 전)"
                  >
                    <AppUnitInputNumber
                      min={1}
                      unit="일 전"
                      onChange={() =>
                        form.validateFields(['promotion1stBeforeDays']).catch(() => {})
                      }
                    />
                  </Form.Item>
                </Space>
                <Alert
                  type="info"
                  showIcon
                  className="!tw-mb-0 !tw-mt-2"
                  message="통보 시점 안내"
                  description={
                    <>
                      만료일로부터 역산한 일수입니다. 매일 자정 자동 발송되며 알림 이력은
                      저장됩니다.
                    </>
                  }
                />
              </div>
            ) : null}
          </div>

          <Divider className="!tw-my-3" />

          {/* ── ③ 이월 ─────────────────────────────────────────── */}
          <SectionHeader
            index="3"
            title="이월"
            desc="회계연도 종료 후 미사용 연차를 다음 해로 넘김. 매년 1/1 자동 처리"
          />
          <div className="tw-flex tw-flex-wrap tw-items-start tw-gap-4">
            <Form.Item
              label="이월 허용"
              name="isCarryoverYn"
              valuePropName="checked"
              className="!tw-mb-0"
            >
              <Switch checkedChildren="ON" unCheckedChildren="OFF" />
            </Form.Item>
            {isCarryover ? (
              <div className="tw-flex-1 tw-min-w-0">
                <Space className="tw-w-full" size={16} align="start" wrap>
                  <Form.Item
                    label="이월 가능 일수 상한"
                    name="carryoverDays"
                    rules={[
                      { required: true, message: '이월 일수를 입력해주세요.' },
                      {
                        validator: (_, value) => {
                          if (typeof value !== 'number') return Promise.resolve();
                          if (value <= 0)
                            return Promise.reject(new Error('1일 이상이어야 합니다.'));
                          return Promise.resolve();
                        },
                      },
                    ]}
                    style={{ width: 220 }}
                    extra="이 일수까지만 다음 해로 넘김"
                  >
                    <AppUnitInputNumber min={1} unit="일" />
                  </Form.Item>
                  <Form.Item
                    label="이월 동의서 사용"
                    name="isCarryoverConsentYn"
                    valuePropName="checked"
                    extra="ON 이면 직원별 동의 받아야 이월 처리"
                  >
                    <Switch checkedChildren="ON" unCheckedChildren="OFF" />
                  </Form.Item>
                </Space>
              </div>
            ) : null}
          </div>

          <Divider className="!tw-my-3" />

          {/* ── ④ 미사용 수당 ─────────────────────────────────── */}
          <SectionHeader
            index="4"
            title="미사용 연차 수당"
            desc="미사용 연차를 통상시급(기본급 ÷ 209) × 8시간 단가로 1월 급여에 반영"
          />
          <Form.Item
            label="미사용 연차 수당 지급"
            name="isPayoutYn"
            valuePropName="checked"
            extra="ON 이면 만료된 미사용 연차가 다음 1월 급여 항목으로 자동 추가 (※ 현재는 수동 미리보기/확정 필요)"
          >
            <Switch checkedChildren="ON" unCheckedChildren="OFF" />
          </Form.Item>
        </div>

        {/* 우측 sticky 정책 요약 */}
        <div className="tw-w-[320px] tw-shrink-0 tw-sticky tw-top-0 tw-self-start">
          <SectionHeader index="✦" title="정책 요약" desc="현재 설정 시나리오" />
          <PolicySimulator
            defaultDays={defaultDays}
            isPromotion={isPromotion}
            promo1st={promo1st}
            promo2nd={promo2nd}
            isCarryover={isCarryover}
            carryoverDays={carryoverDays}
            isPayout={isPayout}
            accrualBase={accrualBaseWatch}
          />
          {isLossRisk ? (
            <Alert
              className="!tw-mt-3"
              type="warning"
              showIcon
              icon={<WarningOutlined />}
              message="미사용 연차가 그대로 소멸됩니다"
              description="이월·수당 모두 OFF 상태입니다. 촉진제도 운영을 함께 검토해주세요."
            />
          ) : null}
        </div>
      </div>
      {/* 폼 컴팩트화 - 모든 여백 더 축소 */}
      <style>{`
        .wf-leave-policy-form .ant-form-item { margin-bottom: 6px; }
        .wf-leave-policy-form .ant-form-item-label { padding-bottom: 0; }
        .wf-leave-policy-form .ant-form-item-label > label { font-size: 12px; height: 22px; }
        .wf-leave-policy-form .ant-form-item-extra { font-size: 10.5px; line-height: 1.2; margin-top: 1px; color: #94a3b8; }
        .wf-leave-policy-form .ant-divider { margin: 8px 0 !important; border-color: #e2e8f0; }
        .wf-leave-policy-form .ant-input-number, .wf-leave-policy-form .ant-select { font-size: 12px; }
      `}</style>
    </Form>
  );
}

/** 섹션 헤더 — 번호 뱃지 + 제목 + 설명 한 줄 */
function SectionHeader({ index, title, desc }: { index: string; title: string; desc: string }) {
  return (
    <div className="tw-mb-1 tw-flex tw-items-center tw-gap-1.5">
      <span className="tw-inline-flex tw-h-4 tw-w-4 tw-shrink-0 tw-items-center tw-justify-center tw-rounded-full tw-bg-blue-50 tw-text-[9px] tw-font-semibold tw-text-blue-700">
        {index}
      </span>
      <div className="tw-min-w-0 tw-flex tw-items-baseline tw-gap-1.5">
        <div className="tw-text-[13px] tw-font-semibold tw-text-slate-900">{title}</div>
        <div className="tw-text-[11px] tw-text-slate-500 tw-truncate">{desc}</div>
      </div>
    </div>
  );
}

/** 정책 시뮬레이터 — 현재 폼 값으로 실제 동작 시나리오를 자연어로 보여줌 */
function PolicySimulator({
  defaultDays,
  isPromotion,
  promo1st,
  promo2nd,
  isCarryover,
  carryoverDays,
  isPayout,
  accrualBase,
}: {
  defaultDays?: number;
  isPromotion?: boolean;
  promo1st?: number | null;
  promo2nd?: number | null;
  isCarryover?: boolean;
  carryoverDays?: number | null;
  isPayout?: boolean;
  accrualBase?: AccrualBaseCode;
}) {
  const days = typeof defaultDays === 'number' ? defaultDays : 0;
  const carry = typeof carryoverDays === 'number' ? carryoverDays : 0;
  const exampleUnused = Math.max(Math.round(days * 0.4), 5);
  const carriedOver = isCarryover ? Math.min(exampleUnused, carry) : 0;
  const paidOut =
    !isCarryover && isPayout ? exampleUnused : Math.max(exampleUnused - carriedOver, 0);
  const lost = !isCarryover && !isPayout ? exampleUnused : 0;

  const flag = (on?: boolean) =>
    on ? (
      <CheckCircleTwoTone twoToneColor="#16a34a" />
    ) : (
      <CloseCircleTwoTone twoToneColor="#94a3b8" />
    );

  return (
    <div className="tw-rounded-md tw-border tw-border-slate-200 tw-bg-slate-50/60 tw-p-3">
      <div className="tw-grid tw-grid-cols-3 tw-gap-2 tw-text-xs">
        <SummaryCell
          label="촉진제도"
          value={isPromotion ? '운영' : '미운영'}
          icon={flag(isPromotion)}
        />
        <SummaryCell
          label="이월"
          value={isCarryover ? `${carry || '?'}일까지` : '미허용'}
          icon={flag(isCarryover)}
        />
        <SummaryCell
          label="미사용 수당"
          value={isPayout ? '지급' : '미지급'}
          icon={flag(isPayout)}
        />
      </div>
      {isPromotion && typeof promo1st === 'number' && typeof promo2nd === 'number' ? (
        <div className="tw-mt-2 tw-text-xs tw-text-slate-600">
          • 만료 <b>{promo1st}일 전</b>에 1차 알림, <b>{promo2nd}일 전</b>에 2차 알림 자동 발송
        </div>
      ) : null}
      <div className="tw-mt-2 tw-text-xs tw-text-slate-700">
        {(() => {
          // accrualBase 별로 만료/이월/지급 시점 표현 다르게
          const isHire = accrualBase === 'HIRE_DATE';
          const expiryWord = isHire ? '입사 기념일에' : '회계연도 종료 시';
          const carryWord = isHire ? '다음 1년치 잔고로' : '다음 해로';
          const payoutWord = isHire ? '입사 기념일 다음 급여' : '1월 급여';
          return (
            <>
              예시 — 직원이 <b>{exampleUnused}일</b> 미사용 시 ({expiryWord}):
              <ul className="tw-mt-1 tw-mb-0 tw-list-disc tw-pl-5">
                {carriedOver > 0 && (
                  <li>
                    <b>{carriedOver}일</b> {carryWord} 이월
                  </li>
                )}
                {paidOut > 0 && (
                  <li>
                    <b>{paidOut}일</b> {payoutWord}에 미사용 수당으로 반영
                  </li>
                )}
                {lost > 0 && (
                  <li className="tw-text-rose-600">
                    <b>{lost}일</b> 만료로 소멸 (보상 없음)
                  </li>
                )}
              </ul>
            </>
          );
        })()}
      </div>
    </div>
  );
}

function SummaryCell({ label, value, icon }: { label: string; value: string; icon: ReactNode }) {
  return (
    <div className="tw-flex tw-items-center tw-gap-2 tw-rounded tw-bg-white tw-px-3 tw-py-2 tw-shadow-sm">
      {icon}
      <div className="tw-min-w-0">
        <div className="tw-text-[11px] tw-text-slate-500">{label}</div>
        <div className="tw-text-xs tw-font-medium tw-text-slate-800">{value}</div>
      </div>
    </div>
  );
}
