import { useEffect, useMemo } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { App, Alert, DatePicker, Form, Input, Select, Typography } from 'antd';
import dayjs from 'dayjs';
import { evaluationRedesignApi } from '@/features/evaluation/api/evaluationRedesignApi';
import {
  buildEvaluationPhasesScheduleJson,
  suggestCalibrationWindow,
} from '@/features/evaluation/lib/evaluationPhaseSchedule';
import type { CreateSeasonPayload, SeasonType } from '@/features/evaluation/model/types';
import { goalApi } from '@/features/goals/api/goalApi';
import type { GoalCycle, KpiCycle } from '@/features/goals/model/types';
import { AppDoubleActionModal } from '@/shared/ui/AppDoubleActionModal';

const { RangePicker } = DatePicker;
const { Text } = Typography;

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
};

type FormValues = {
  name: string;
  targetCycleKey: string;
  period: [dayjs.Dayjs, dayjs.Dayjs];
  calibrationWindow: [dayjs.Dayjs, dayjs.Dayjs];
  resultPublishDate?: dayjs.Dayjs;
};

type GoalCycleOption = {
  key: string;
  cycle: KpiCycle;
  seasonType: SeasonType;
  cycleStartDate: string;
  cycleEndDate: string;
  label: string;
  organizationGoalCount: number;
};

const INIT_PERIOD: [dayjs.Dayjs, dayjs.Dayjs] = [dayjs(), dayjs().add(1, 'month')];
const INIT_CAL = suggestCalibrationWindow(INIT_PERIOD[0].format('YYYY-MM-DD'), INIT_PERIOD[1].format('YYYY-MM-DD'));
const INIT_CALIBRATION: [dayjs.Dayjs, dayjs.Dayjs] = [dayjs(INIT_CAL.calibrationStart), dayjs(INIT_CAL.calibrationEnd)];

export function SeasonCreateModal({ open, onClose, onCreated }: Props) {
  const { message } = App.useApp();
  const [form] = Form.useForm<FormValues>();
  const period = Form.useWatch('period', form);
  const targetCycleKey = Form.useWatch('targetCycleKey', form);

  const { data: goalCycles = [], isLoading: cyclesLoading } = useQuery({
    queryKey: ['goal-organization-cycles-for-evaluation-season'],
    queryFn: () => goalApi.listOrganizationGoalCycles(),
    enabled: open,
  });

  const targetCycleOptions = useMemo(() => buildGoalCycleOptions(goalCycles), [goalCycles]);
  const selectedCycle = targetCycleOptions.find((item) => item.key === targetCycleKey) ?? null;

  useEffect(() => {
    if (!open) return;
    const p0 = dayjs();
    const p1 = dayjs().add(1, 'month');
    const { calibrationStart, calibrationEnd } = suggestCalibrationWindow(p0.format('YYYY-MM-DD'), p1.format('YYYY-MM-DD'));
    form.setFieldsValue({
      name: '',
      targetCycleKey: undefined,
      period: [p0, p1],
      calibrationWindow: [dayjs(calibrationStart), dayjs(calibrationEnd)],
      resultPublishDate: undefined,
    });
  }, [open, form]);

  useEffect(() => {
    if (!open || targetCycleKey || targetCycleOptions.length === 0) return;
    const first = targetCycleOptions[0];
    if (!first) return;
    form.setFieldsValue({ targetCycleKey: first.key, name: defaultSeasonName(first) });
  }, [open, targetCycleKey, targetCycleOptions, form]);

  useEffect(() => {
    if (!open || !selectedCycle) return;
    const currentName = form.getFieldValue('name');
    if (!currentName?.trim()) form.setFieldValue('name', defaultSeasonName(selectedCycle));
  }, [open, selectedCycle, form]);

  useEffect(() => {
    if (!open || !period?.[0] || !period?.[1]) return;
    const { calibrationStart, calibrationEnd } = suggestCalibrationWindow(
      period[0].format('YYYY-MM-DD'),
      period[1].format('YYYY-MM-DD'),
    );
    form.setFieldValue('calibrationWindow', [dayjs(calibrationStart), dayjs(calibrationEnd)]);
  }, [open, period?.[0]?.valueOf(), period?.[1]?.valueOf(), form]);

  const createMut = useMutation({
    mutationFn: (body: CreateSeasonPayload) => evaluationRedesignApi.createSeason(body),
    onSuccess: () => {
      message.success('평가 기간을 생성했습니다.');
      form.resetFields();
      onCreated();
      onClose();
    },
    onError: (error: any) => {
      message.error(error?.response?.data?.message ?? '평가 기간 생성에 실패했습니다.');
    },
  });

  return (
    <AppDoubleActionModal
      title="평가 기간 생성"
      open={open}
      onClose={onClose}
      onConfirm={() => form.submit()}
      width={660}
      destroyOnHidden
      cancelText="취소"
      confirmText="저장"
      confirmLoading={createMut.isPending}
    >
      <Form<FormValues>
        form={form}
        layout="vertical"
        className="tw-px-5 tw-py-4"
        scrollToFirstError={{ block: 'center', behavior: 'smooth' }}
        initialValues={{ name: '', period: INIT_PERIOD, calibrationWindow: INIT_CALIBRATION }}
        onFinish={(v) => {
          const cycle = targetCycleOptions.find((item) => item.key === v.targetCycleKey);
          if (!cycle) {
            message.error('조직목표가 생성된 목표 기간을 선택해 주세요.');
            return;
          }

          const opsStart = v.period[0].format('YYYY-MM-DD');
          const opsEnd = v.period[1].format('YYYY-MM-DD');
          const phasesDoc = buildEvaluationPhasesScheduleJson({
            opsStart,
            opsEnd,
            calibrationStart: v.calibrationWindow[0].format('YYYY-MM-DD'),
            calibrationEnd: v.calibrationWindow[1].format('YYYY-MM-DD'),
          });

          createMut.mutate({
            name: v.name,
            type: cycle.seasonType,
            targetCycleStart: cycle.cycleStartDate,
            startDate: opsStart,
            endDate: opsEnd,
            resultPublishDate: v.resultPublishDate?.format('YYYY-MM-DD'),
            scheduleJson: JSON.stringify(phasesDoc),
          });
        }}
      >
        <Form.Item name="targetCycleKey" label="평가에 사용할 목표 기간" rules={[{ required: true, message: '조직목표 기간을 선택해 주세요.' }]}>
          <Select
            loading={cyclesLoading}
            placeholder="조직목표가 생성된 목표 기간을 선택하세요"
            options={targetCycleOptions.map((item) => ({
              value: item.key,
              label: `${item.label} · 조직목표 ${item.organizationGoalCount}개`,
            }))}
          />
        </Form.Item>

        {targetCycleOptions.length === 0 && !cyclesLoading ? (
          <Alert
            type="warning"
            showIcon
            className="tw-mb-4"
            message="평가를 만들 조직목표 기간이 없습니다."
            description="먼저 조직목표를 만들고 활성화하면 해당 목표 기간만 이 목록에 표시됩니다."
          />
        ) : null}

        <Form.Item name="name" label="평가명" rules={[{ required: true, message: '평가명을 입력해 주세요.' }]}>
          <Input placeholder="예: 2026 상반기 성과평가" />
        </Form.Item>

        <Form.Item name="period" label="평가 진행 기간" rules={[{ required: true, message: '진행 기간을 선택해 주세요.' }]}>
          <RangePicker className="tw-w-full" />
        </Form.Item>

        <Form.Item name="calibrationWindow" label="등급 검토 기간" rules={[{ required: true, message: '등급 검토 기간을 선택해 주세요.' }]}>
          <RangePicker className="tw-w-full" />
        </Form.Item>

        <Form.Item name="resultPublishDate" label="결과 공개 예정일">
          <DatePicker className="tw-w-full" />
        </Form.Item>

        {selectedCycle ? (
          <div className="tw-rounded-2xl tw-bg-slate-50 tw-p-4 tw-text-sm tw-text-slate-600">
            <Text strong>{selectedCycle.label}</Text>
            <div className="tw-mt-1">조직목표 {selectedCycle.organizationGoalCount}개가 이 평가의 기준으로 사용됩니다.</div>
          </div>
        ) : null}
      </Form>
    </AppDoubleActionModal>
  );
}

function buildGoalCycleOptions(cycles: GoalCycle[]): GoalCycleOption[] {
  return cycles
    .filter((cycle) => cycle.cycleStartDate)
    .map((cycle) => ({
      key: `${cycle.cycle}-${cycle.cycleStartDate}`,
      cycle: cycle.cycle,
      seasonType: toSeasonType(cycle.cycle),
      cycleStartDate: cycle.cycleStartDate,
      cycleEndDate: cycle.cycleEndDate,
      label: `${formatCycle(cycle.cycle)} ${cycle.cycleStartDate}`,
      organizationGoalCount: cycle.organizationGoalCount,
    }));
}

function toSeasonType(cycle: KpiCycle): SeasonType {
  if (cycle === 'YEARLY') return 'ANNUAL';
  if (cycle === 'QUARTERLY') return 'QUARTER';
  return 'HALF_YEAR';
}

function formatCycle(cycle: KpiCycle): string {
  if (cycle === 'YEARLY') return '연간';
  if (cycle === 'QUARTERLY') return '분기';
  return '반기';
}

function defaultSeasonName(cycle: GoalCycleOption): string {
  return `${cycle.cycleStartDate.slice(0, 4)} ${formatCycle(cycle.cycle)} 성과평가`;
}
