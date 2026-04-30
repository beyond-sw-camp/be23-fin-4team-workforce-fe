import { useEffect, useMemo } from 'react';
import { useMutation } from '@tanstack/react-query';
import { App, DatePicker, Form, Input, InputNumber, Select, Typography } from 'antd';
import dayjs from 'dayjs';
import { EVALUATION_PAGE_KO as L } from '@/app/locale/app-ko';
import { evaluationRedesignApi } from '@/features/evaluation/api/evaluationRedesignApi';
import {
  buildEvaluationPhasesScheduleJson,
  suggestCalibrationWindow,
} from '@/features/evaluation/lib/evaluationPhaseSchedule';
import { seasonTypeToKpiCycle } from '@/features/evaluation/lib/seasonTargetCycle';
import type { CreateSeasonPayload, SeasonType } from '@/features/evaluation/model/types';
import type { CycleFormSegment } from '@/features/goals/lib/cyclePeriod';
import { safeToCyclePeriod, toCyclePeriod } from '@/features/goals/lib/cyclePeriod';
import { AppDoubleActionModal } from '@/shared/ui/AppDoubleActionModal';

const { Text } = Typography;

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
};

type FormValues = {
  name: string;
  type: SeasonType;
  cycleYear: number;
  cycleSegment?: CycleFormSegment;
  period: [dayjs.Dayjs, dayjs.Dayjs];
  /** 백엔드 `scheduleJson.phases` 중 CALIBRATION_OPEN 구간 — 운영 기간 안에서 조정 */
  calibrationWindow: [dayjs.Dayjs, dayjs.Dayjs];
  resultPublishDate?: dayjs.Dayjs;
};

const Q_OPTS: { value: CycleFormSegment; label: string }[] = [
  { value: 'Q1', label: '1분기' },
  { value: 'Q2', label: '2분기' },
  { value: 'Q3', label: '3분기' },
  { value: 'Q4', label: '4분기' },
];

const H_OPTS: { value: CycleFormSegment; label: string }[] = [
  { value: 'H1', label: '상반기' },
  { value: 'H2', label: '하반기' },
];

const INIT_PERIOD: [dayjs.Dayjs, dayjs.Dayjs] = [dayjs(), dayjs().add(1, 'month')];
const INIT_CAL = suggestCalibrationWindow(
  INIT_PERIOD[0].format('YYYY-MM-DD'),
  INIT_PERIOD[1].format('YYYY-MM-DD'),
);
const INIT_CALIBRATION: [dayjs.Dayjs, dayjs.Dayjs] = [
  dayjs(INIT_CAL.calibrationStart),
  dayjs(INIT_CAL.calibrationEnd),
];

export function SeasonCreateModal({ open, onClose, onCreated }: Props) {
  const { message } = App.useApp();
  const [form] = Form.useForm<FormValues>();

  const type = Form.useWatch('type', form);
  const cycleYear = Form.useWatch('cycleYear', form);
  const cycleSegment = Form.useWatch('cycleSegment', form);
  const period = Form.useWatch('period', form);

  const kpi = useMemo(() => (type ? seasonTypeToKpiCycle(type) : 'QUARTERLY'), [type]);

  const targetPreview = useMemo(() => {
    if (!cycleYear) return null;
    return safeToCyclePeriod(kpi, cycleYear, cycleSegment ?? undefined);
  }, [kpi, cycleYear, cycleSegment]);

  useEffect(() => {
    if (!open) return;
    const p0 = dayjs();
    const p1 = dayjs().add(1, 'month');
    const {calibrationStart, calibrationEnd} = suggestCalibrationWindow(
      p0.format('YYYY-MM-DD'),
      p1.format('YYYY-MM-DD'),
    );
    form.setFieldsValue({
      name: '',
      type: 'QUARTER',
      cycleYear: dayjs().year(),
      cycleSegment: 'Q1',
      period: [p0, p1],
      calibrationWindow: [dayjs(calibrationStart), dayjs(calibrationEnd)],
      resultPublishDate: undefined,
    });
  }, [open, form]);

  useEffect(() => {
    if (!open || !period?.[0] || !period?.[1]) return;
    const s = period[0].format('YYYY-MM-DD');
    const e = period[1].format('YYYY-MM-DD');
    const {calibrationStart, calibrationEnd} = suggestCalibrationWindow(s, e);
    form.setFieldValue('calibrationWindow', [dayjs(calibrationStart), dayjs(calibrationEnd)]);
  }, [open, period?.[0]?.valueOf(), period?.[1]?.valueOf(), form]);

  useEffect(() => {
    if (!open || !type) return;
    if (type === 'QUARTER') {
      form.setFieldValue('cycleSegment', 'Q1');
    } else if (type === 'HALF_YEAR') {
      form.setFieldValue('cycleSegment', 'H1');
    } else {
      form.setFieldValue('cycleSegment', undefined);
    }
  }, [type, open, form]);

  const createMut = useMutation({
    mutationFn: (body: CreateSeasonPayload) => evaluationRedesignApi.createSeason(body),
    onSuccess: () => {
      message.success(L.seasonCreated);
      form.resetFields();
      onCreated();
      onClose();
    },
  });

  return (
    <AppDoubleActionModal
      title={L.seasonAdd}
      open={open}
      onClose={onClose}
      onConfirm={() => form.submit()}
      width={620}
      destroyOnHidden
      cancelText={L.cancel}
      confirmText={L.save}
      confirmLoading={createMut.isPending}
    >
      <Form<FormValues>
        form={form}
        layout="vertical"
        className="tw-px-5 tw-py-4"
        scrollToFirstError={{ block: 'center', behavior: 'smooth' }}
        initialValues={{
          name: '',
          type: 'QUARTER',
          cycleYear: dayjs().year(),
          cycleSegment: 'Q1',
          period: INIT_PERIOD,
          calibrationWindow: INIT_CALIBRATION,
        }}
        onFinish={(v) => {
          const opsStart = v.period[0].format('YYYY-MM-DD');
          const opsEnd = v.period[1].format('YYYY-MM-DD');
          const phasesDoc = buildEvaluationPhasesScheduleJson({
            opsStart,
            opsEnd,
            calibrationStart: v.calibrationWindow[0].format('YYYY-MM-DD'),
            calibrationEnd: v.calibrationWindow[1].format('YYYY-MM-DD'),
          });
          const cycle = seasonTypeToKpiCycle(v.type);
          const seg = cycle === 'YEARLY' ? undefined : v.cycleSegment;
          const periodDates = toCyclePeriod(cycle, v.cycleYear, seg);
          createMut.mutate({
            name: v.name,
            type: v.type,
            targetCycleStart: periodDates.cycleStartDate,
            startDate: opsStart,
            endDate: opsEnd,
            resultPublishDate: v.resultPublishDate?.format('YYYY-MM-DD'),
            scheduleJson: JSON.stringify(phasesDoc),
          });
        }}
        onFinishFailed={({ errorFields }) => {
          const first = errorFields?.[0];
          if (!first) return;
          form.scrollToField(first.name, { block: 'center', behavior: 'smooth' });
        }}
      >
        <Form.Item name="name" label={L.seasonName} rules={[{ required: true }]}>
          <Input />
        </Form.Item>
        <Form.Item name="type" label={L.seasonType} rules={[{ required: true }]}>
          <Select
            options={[
              { value: 'ANNUAL', label: L.seasonTypeAnnual },
              { value: 'HALF_YEAR', label: L.seasonTypeHalfYear },
              { value: 'QUARTER', label: L.seasonTypeQuarter },
            ]}
          />
        </Form.Item>

        <div className="tw-mb-1 tw-text-sm tw-font-semibold tw-text-slate-800">{L.seasonOkrPeriod}</div>
        <Text type="secondary" className="tw-mb-3 tw-block tw-text-xs">
          {L.seasonOkrPeriodHint}
        </Text>
        <div className="tw-mb-4 tw-grid tw-grid-cols-1 tw-gap-3 sm:tw-grid-cols-3">
          {type !== 'ANNUAL' && (
            <Form.Item
              name="cycleSegment"
              label={L.seasonCycleSegment}
              rules={[{ required: true, message: '회차를 선택하세요' }]}
            >
              <Select
                options={type === 'HALF_YEAR' ? H_OPTS : Q_OPTS}
                placeholder="회차"
              />
            </Form.Item>
          )}
          <Form.Item
            name="cycleYear"
            label={L.seasonCycleYear}
            rules={[{ required: true, message: '연도를 입력하세요' }]}
          >
            <InputNumber min={2000} max={2100} className="!tw-w-full" id="season-cycle-year" />
          </Form.Item>
          <div className="tw-flex tw-flex-col tw-justify-end tw-pb-2">
            <Text type="secondary" className="tw-text-xs">
              {L.seasonTargetPreview}:{' '}
              <Text strong className="tw-text-slate-800">
                {targetPreview ? targetPreview.cycleStartDate : '—'}
              </Text>
            </Text>
          </div>
        </div>

        <div className="tw-mb-1 tw-mt-2 tw-text-sm tw-font-semibold tw-text-slate-800">{L.seasonOpsPeriod}</div>
        <Text type="secondary" className="tw-mb-2 tw-block tw-text-xs">
          {L.seasonOpsPeriodHint}
        </Text>
        <Form.Item name="period" label={L.seasonOpsPeriod} rules={[{ required: true }]}>
          <DatePicker.RangePicker className="tw-w-full" />
        </Form.Item>
        <Form.Item
          name="calibrationWindow"
          label="캘리브레이션·등급 조정 기간"
          rules={[
            { required: true, message: '기간을 선택하세요' },
            {
              validator: (_, value: [dayjs.Dayjs, dayjs.Dayjs] | undefined) => {
                const p = form.getFieldValue('period') as [dayjs.Dayjs, dayjs.Dayjs] | undefined;
                if (!value?.[0] || !value?.[1] || !p?.[0] || !p?.[1]) return Promise.resolve();
                if (value[0].isBefore(p[0], 'day') || value[1].isAfter(p[1], 'day')) {
                  return Promise.reject(new Error('운영 기간(평가 운영) 안에 포함되도록 선택하세요.'));
                }
                return Promise.resolve();
              },
            },
          ]}
          extra={
            <Text type="secondary" className="tw-text-xs">
              시즌 단계 일괄 전이(`StageTransitionScheduler`)용 계약입니다. 운영 기간을 바꾸면 기본값이 다시
              채워지니, 필요 시 이 구간만 조정하세요.
            </Text>
          }
        >
          <DatePicker.RangePicker className="tw-w-full" />
        </Form.Item>
        <Form.Item name="resultPublishDate" label={L.seasonResultPublishDate}>
          <DatePicker className="tw-w-full" />
        </Form.Item>
      </Form>
    </AppDoubleActionModal>
  );
}
