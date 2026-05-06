/** /app/attendance/overtime-policies - 연장근로 정책 관리 (시스템 관리자) */
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  App,
  Button,
  Card,
  Col,
  DatePicker,
  Form,
  InputNumber,
  Row,
  Select,
  Space,
  Table,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { attendanceApi } from '@/features/salary-service/api/attendanceApi';
import { AppButton } from '@/shared/ui/AppButton';
import { AppDoubleActionModal } from '@/shared/ui/AppDoubleActionModal';
import { AppWorkspacePageTitle } from '@/shared/ui/AppWorkspacePageTitle';
import type { OvertimePolicy } from '@/features/salary-service/types';

type FormValues = {
  overtimeFloorMinutes: number;
  postApprovalDeadlineHours?: number;
  weeklyOvertimeLimitMinutes?: number;
  weeklyTotalLimitMinutes?: number;
  dailyOvertimeLimitMinutes?: number;
  monthlyOvertimeLimitMinutes?: number;
  effectiveFrom: dayjs.Dayjs;
  effectiveTo?: dayjs.Dayjs | null;
};

function formatMinutesWithDuration(value?: number | null): string {
  if (value == null) return '-';
  const total = Math.max(0, Math.floor(value));
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  if (hours === 0) return `${total}(${minutes}분)`;
  if (minutes === 0) return `${total}(${hours}시간)`;
  return `${total}(${hours}시간 ${minutes}분)`;
}

/**
 * 연장근로 정책 입력값 cross-field 검증.
 * 통과하면 null, 실패하면 첫 번째 오류 메시지 반환.
 *
 * 검증 규칙:
 *  - 모든 한도값(분) 0 이상
 *  - 일 최대 근무 <= 1440 (24시간)
 *  - 주 최대 총 <= 10080 (7일)
 *  - 월 최대 연장 >= 일 최대 근무
 *  - 월 최대 연장 >= 주 최대 연장
 *  - 주 최대 총 >= 일 최대 근무
 *  - 주 최대 총 >= 주 최대 연장
 *  - 적용 종료일 >= 적용 시작일 (있을 때)
 *  - 사후 결재 마감 시간 0 이상
 *
 * 야간 시간대(22:00-06:00)는 근로기준법 고정값이라 입력받지 않음
 */
function validateOvertimePolicyValues(v: FormValues): string | null {
  const dayMax = v.dailyOvertimeLimitMinutes;
  const monthMax = v.monthlyOvertimeLimitMinutes;
  const weekMax = v.weeklyOvertimeLimitMinutes;
  const weekTotal = v.weeklyTotalLimitMinutes;

  // 절대 한계
  if (dayMax != null && dayMax > 1440)
    return '일 최대 근무시간은 24시간(1440분)을 넘을 수 없습니다.';
  if (weekTotal != null && weekTotal > 10080)
    return '주 최대 총 근무시간은 168시간(10080분)을 넘을 수 없습니다.';

  // 월 최대 연장 vs 일/주 최대
  if (monthMax != null && dayMax != null && monthMax < dayMax) {
    return '월 최대 연장근무시간은 일 최대 근무시간보다 크거나 같아야 합니다.';
  }
  if (monthMax != null && weekMax != null && monthMax < weekMax) {
    return '월 최대 연장근무시간은 주 최대 연장근무시간보다 크거나 같아야 합니다.';
  }

  // 주 최대 총 vs 일/주 최대
  if (weekTotal != null && dayMax != null && weekTotal < dayMax) {
    return '주 최대 총 근무시간은 일 최대 근무시간보다 크거나 같아야 합니다.';
  }
  if (weekTotal != null && weekMax != null && weekTotal < weekMax) {
    return '주 최대 총 근무시간은 주 최대 연장근무시간보다 크거나 같아야 합니다.';
  }

  // 적용 기간
  if (v.effectiveFrom && v.effectiveTo) {
    if (v.effectiveTo.isBefore(v.effectiveFrom, 'day')) {
      return '적용 종료일은 적용 시작일보다 이후여야 합니다.';
    }
  }

  // 사후 결재 마감
  if (v.postApprovalDeadlineHours != null && v.postApprovalDeadlineHours < 0) {
    return '사후 결재 마감 시간은 0 이상이어야 합니다.';
  }

  return null;
}

export function AdminOvertimePoliciesPage({ embedded = false }: { embedded?: boolean } = {}) {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<OvertimePolicy | null>(null);
  const [form] = Form.useForm<FormValues>();

  const listQ = useQuery({
    queryKey: ['salary', 'attendance', 'overtime-policies'],
    queryFn: () => attendanceApi.overtimePolicy.list(),
  });

  const createM = useMutation({
    mutationFn: (v: FormValues) =>
      attendanceApi.overtimePolicy.create({
        overtimeFloorMinutes: v.overtimeFloorMinutes,
        approvalMode: 'HYBRID',
        postApprovalDeadlineHours: v.postApprovalDeadlineHours ?? null,
        weeklyOvertimeLimitMinutes: v.weeklyOvertimeLimitMinutes ?? null,
        weeklyTotalLimitMinutes: v.weeklyTotalLimitMinutes ?? null,
        dailyOvertimeLimitMinutes: v.dailyOvertimeLimitMinutes ?? null,
        monthlyOvertimeLimitMinutes: v.monthlyOvertimeLimitMinutes ?? null,
        holidayWorkRequiresApproval: true,
        effectiveFrom: v.effectiveFrom.format('YYYY-MM-DD'),
        effectiveTo: v.effectiveTo ? v.effectiveTo.format('YYYY-MM-DD') : null,
      }),
    onSuccess: () => {
      message.success('정책이 등록되었습니다.');
      setOpen(false);
      form.resetFields();
      void qc.invalidateQueries({ queryKey: ['salary', 'attendance', 'overtime-policies'] });
    },
    onError: (e: Error) => message.error(e.message || '등록에 실패했습니다.'),
  });

  const updateM = useMutation({
    mutationFn: ({ id, v }: { id: string; v: FormValues }) =>
      attendanceApi.overtimePolicy.update(id, {
        overtimeFloorMinutes: v.overtimeFloorMinutes,
        approvalMode: 'HYBRID',
        postApprovalDeadlineHours: v.postApprovalDeadlineHours ?? null,
        weeklyOvertimeLimitMinutes: v.weeklyOvertimeLimitMinutes ?? null,
        weeklyTotalLimitMinutes: v.weeklyTotalLimitMinutes ?? null,
        dailyOvertimeLimitMinutes: v.dailyOvertimeLimitMinutes ?? null,
        monthlyOvertimeLimitMinutes: v.monthlyOvertimeLimitMinutes ?? null,
        holidayWorkRequiresApproval: true,
        effectiveFrom: v.effectiveFrom.format('YYYY-MM-DD'),
        effectiveTo: v.effectiveTo ? v.effectiveTo.format('YYYY-MM-DD') : null,
      }),
    onSuccess: () => {
      message.success('정책이 수정되었습니다.');
      setOpen(false);
      setEditing(null);
      form.resetFields();
      void qc.invalidateQueries({ queryKey: ['salary', 'attendance', 'overtime-policies'] });
    },
    onError: (e: Error) => message.error(e.message || '수정에 실패했습니다.'),
  });

  const rows = useMemo(
    () =>
      [...(listQ.data ?? [])].sort((a, b) =>
        (b.effectiveFrom ?? '').localeCompare(a.effectiveFrom ?? ''),
      ),
    [listQ.data],
  );

  const columns = useMemo<ColumnsType<OvertimePolicy>>(
    () => [
      { title: '적용 시작일', dataIndex: 'effectiveFrom', key: 'effectiveFrom', width: 130 },
      {
        title: '적용 종료일',
        dataIndex: 'effectiveTo',
        key: 'effectiveTo',
        width: 130,
        render: (v) => v ?? '진행중',
      },
      {
        title: '연장근로 계산 단위(분)',
        dataIndex: 'overtimeFloorMinutes',
        key: 'overtimeFloorMinutes',
        width: 160,
        render: (v) => formatMinutesWithDuration(v),
      },
      {
        title: '일 최대 근무시간(분)',
        dataIndex: 'dailyOvertimeLimitMinutes',
        key: 'dailyOvertimeLimitMinutes',
        width: 140,
        render: (v) => formatMinutesWithDuration(v),
      },
      {
        title: '주 최대 연장근무시간(분)',
        dataIndex: 'weeklyOvertimeLimitMinutes',
        key: 'weeklyOvertimeLimitMinutes',
        width: 160,
        render: (v) => formatMinutesWithDuration(v),
      },
      {
        title: '월 최대 연장근무시간(분)',
        dataIndex: 'monthlyOvertimeLimitMinutes',
        key: 'monthlyOvertimeLimitMinutes',
        width: 160,
        render: (v) => formatMinutesWithDuration(v),
      },
      {
        title: '액션',
        key: 'action',
        width: 90,
        render: (_, r) =>
          r.overtimePolicyId ? (
            <Button
              size="small"
              onClick={() => {
                setEditing(r);
                setOpen(true);
                form.setFieldsValue({
                  overtimeFloorMinutes: r.overtimeFloorMinutes ?? 15,
                  postApprovalDeadlineHours: r.postApprovalDeadlineHours ?? undefined,
                  weeklyOvertimeLimitMinutes: r.weeklyOvertimeLimitMinutes ?? undefined,
                  weeklyTotalLimitMinutes: r.weeklyTotalLimitMinutes ?? undefined,
                  dailyOvertimeLimitMinutes: r.dailyOvertimeLimitMinutes ?? undefined,
                  monthlyOvertimeLimitMinutes: r.monthlyOvertimeLimitMinutes ?? undefined,
                  effectiveFrom: r.effectiveFrom ? dayjs(r.effectiveFrom) : dayjs(),
                  effectiveTo: r.effectiveTo ? dayjs(r.effectiveTo) : null,
                });
              }}
            >
              수정
            </Button>
          ) : (
            '-'
          ),
      },
    ],
    [form],
  );

  const pageActions = (
    <AppButton
      type="primary"
      onClick={() => {
        setEditing(null);
        setOpen(true);
        form.resetFields();
        // 폼 초기값 - 가이드의 예시값을 기본 입력값으로 채워 운영 기준에 맞게 수정만 하면 되도록
        form.setFieldsValue({
          overtimeFloorMinutes: 15,
          postApprovalDeadlineHours: 72,
          dailyOvertimeLimitMinutes: 600,
          monthlyOvertimeLimitMinutes: 2400,
          weeklyOvertimeLimitMinutes: 720,
          weeklyTotalLimitMinutes: 3120,
          effectiveFrom: dayjs(),
        });
      }}
    >
      정책 등록
    </AppButton>
  );

  return (
    <Space direction="vertical" className="tw-w-full" size={16}>
      {embedded ? (
        <div className="tw-flex tw-flex-wrap tw-items-center tw-justify-between tw-gap-3">
          <Typography.Text className="!tw-text-sm !tw-text-slate-600">
            연장근로 계산 단위와 근무시간 한도를 설정합니다.
          </Typography.Text>
          {pageActions}
        </div>
      ) : (
        <AppWorkspacePageTitle
          eyebrow="Attendance"
          title="연장근로 정책"
          subtitle="연장근로 계산 단위와 일/주/월 최대 근무시간 기준을 관리합니다."
          extra={pageActions}
        />
      )}
      <Card
        className="tw-border-slate-200/80 tw-shadow-sm [&_.ant-card-body]:!tw-p-6"
        loading={listQ.isLoading}
      >
        <Table<OvertimePolicy>
          rowKey={(r) => r.overtimePolicyId ?? `${r.effectiveFrom}-${r.effectiveTo}`}
          dataSource={rows}
          columns={columns}
          pagination={{ pageSize: 10 }}
          scroll={{ x: 1100 }}
        />
      </Card>

      <AppDoubleActionModal
        open={open}
        title={editing ? '연장근로 정책 수정' : '연장근로 정책 등록'}
        onClose={() => {
          setOpen(false);
          setEditing(null);
          form.resetFields();
        }}
        onConfirm={() => form.submit()}
        confirmLoading={createM.isPending || updateM.isPending}
        width={750}
        confirmText={editing ? '수정' : '등록'}
      >
        <div className="tw-px-5 tw-py-4">
          <Form<FormValues>
            form={form}
            layout="vertical"
            className="[&_.ant-form-item]:!tw-mb-3"
            onFinish={(v) => {
              // cross-field 논리 검증 - 단일 필드 rule 로 잡기 어려운 상호 관계 검증
              const err = validateOvertimePolicyValues(v);
              if (err) {
                void message.error(err);
                return;
              }
              if (editing?.overtimePolicyId) {
                updateM.mutate({ id: editing.overtimePolicyId, v });
              } else {
                createM.mutate(v);
              }
            }}
          >
            <Row gutter={[12, 4]}>
              <Col span={8}>
                <Form.Item
                  name="overtimeFloorMinutes"
                  label="연장근로 계산 단위(분)"
                  rules={[{ required: true, message: '연장근로 계산 단위를 선택해 주세요.' }]}
                  extra={
                    <>
                      예: 15분 단위는 73분 연장근무를
                      <br />
                      60분으로 계산합니다.
                    </>
                  }
                >
                  <Select
                    style={{ width: 170 }}
                    placeholder="예: 15분 단위"
                    options={[
                      { value: 15, label: '15분 단위' },
                      { value: 30, label: '30분 단위' },
                    ]}
                  />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item
                  name="postApprovalDeadlineHours"
                  label="사후 신청 가능 기한(시간)"
                  extra="근무 종료 후 N시간 이내 사후 결재 신청 허용 (예: 72 = 3일)"
                >
                  <InputNumber min={0} placeholder="예: 72" style={{ width: 170 }} />
                </Form.Item>
              </Col>
            </Row>

            <Row gutter={[12, 4]}>
              <Col span={8}>
                <Form.Item
                  name="dailyOvertimeLimitMinutes"
                  label="일 최대 근무시간(분)"
                  extra="예: 600 (10시간)"
                >
                  <InputNumber min={0} placeholder="예: 600" style={{ width: 170 }} />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item
                  name="monthlyOvertimeLimitMinutes"
                  label="월 최대 연장근무시간(분)"
                  extra="예: 2400 (40시간)"
                >
                  <InputNumber min={0} placeholder="예: 2400" style={{ width: 170 }} />
                </Form.Item>
              </Col>
            </Row>

            <Row gutter={[12, 4]}>
              <Col span={8}>
                <Form.Item
                  name="weeklyOvertimeLimitMinutes"
                  label="주 최대 연장근무시간(분)"
                  extra="예: 720 (12시간)"
                >
                  <InputNumber min={0} placeholder="예: 720" style={{ width: 170 }} />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item
                  name="weeklyTotalLimitMinutes"
                  label="주 최대 총 근무시간(분)"
                  extra="예: 3120 (52시간)"
                >
                  <InputNumber min={0} placeholder="예: 3120" style={{ width: 170 }} />
                </Form.Item>
              </Col>
            </Row>

            <Row gutter={[12, 4]}>
              <Col span={8}>
                <Form.Item
                  name="effectiveFrom"
                  label="적용 시작일"
                  rules={[{ required: true, message: '적용 시작일을 선택해 주세요.' }]}
                  extra="예: 2026-05-01"
                >
                  <DatePicker
                    format="YYYY-MM-DD"
                    placeholder="시작일 선택"
                    style={{ width: 170 }}
                  />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item name="effectiveTo" label="적용 종료일" extra="미입력 시 계속 적용">
                  <DatePicker
                    format="YYYY-MM-DD"
                    placeholder="종료일 선택 (선택)"
                    style={{ width: 170 }}
                  />
                </Form.Item>
              </Col>
            </Row>

            <Alert
              type="success"
              showIcon
              className="!tw-mt-2"
              message="야간근로 시간대는 22:00 ~ 06:00 으로 고정 적용됩니다 (근로기준법)."
            />
          </Form>
        </div>
      </AppDoubleActionModal>
    </Space>
  );
}
