import { useEffect, useMemo, useState } from 'react';
import {
  App,
  Button,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Select,
  Space,
  Switch,
  Typography,
} from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/features/auth/useAuth';
import { memberApi } from '@/features/member/api/memberApi';
import { SingleMemberOrgChartSelectModal } from '@/features/members/ui/SingleMemberOrgChartSelectModal';
import { organizationApi } from '@/features/organization/api/organizationApi';
import { findMemberOrganizationId } from '@/features/organization/lib/findMemberOrganizationInOrgChart';
import { flattenOrganizationsWithMeta } from '@/features/organization/lib/flattenOrganizationTree';
import { AppDoubleActionModal } from '@/shared/ui/AppDoubleActionModal';
import { goalApi } from '../api/goalApi';
import {
  cycleSegmentFrom,
  safeToCyclePeriod,
  toCyclePeriod,
  type CycleFormSegment,
} from '../lib/cyclePeriod';
import type { Goal, GoalCreatePayload, GoalOwnerType, KpiCycle } from '../model/types';
import { OrganizationPickerInput } from './OrganizationPickerInput';

const { TextArea } = Input;
const { Text } = Typography;

const GRADE_BADGE = {
  S: 'tw-bg-amber-50 tw-text-amber-700 tw-border-amber-200',
  A: 'tw-bg-cyan-50 tw-text-cyan-700 tw-border-cyan-200',
  B: 'tw-bg-blue-50 tw-text-blue-700 tw-border-blue-200',
  C: 'tw-bg-slate-100 tw-text-slate-600 tw-border-slate-200',
} as const;

const GRADE_HINT = {
  S: '가장 뛰어난 성과를 기대하는 기준',
  A: '목표를 충분히 달성한 기준',
  B: '기본 기대 수준을 충족한 기준',
  C: '최소 기대 수준을 충족한 기준',
} as const;

type Props = {
  open: boolean;
  onClose: () => void;
  goal?: Goal | null;
  defaultOwnerId?: string;
  defaultOwnerType?: GoalOwnerType;
  presetAlignedOrgGoalId?: string | null;
};

type FormShape = {
  ownerType: GoalOwnerType;
  ownerId: string;
  alignedOrgGoalId?: string | null;
  title: string;
  description: string;
  cycle: KpiCycle;
  cycleYear: number;
  cycleSegment?: CycleFormSegment;
  manualPeriodEnabled?: boolean;
  manualCycleRange?: [Dayjs, Dayjs];
  weightPct: number;
  gradeS?: string;
  gradeA?: string;
  gradeB?: string;
  gradeC?: string;
};

export function GoalEditModal({
  open,
  onClose,
  goal,
  defaultOwnerId,
  defaultOwnerType,
  presetAlignedOrgGoalId,
}: Props) {
  const { message } = App.useApp();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<FormShape>();
  const [memberPickerOpen, setMemberPickerOpen] = useState(false);
  const [selectedOwnerMemberLabel, setSelectedOwnerMemberLabel] = useState('');
  const isEdit = !!goal;
  const ownerType = Form.useWatch('ownerType', form) ?? defaultOwnerType ?? 'MEMBER';
  const selectedOwnerId = Form.useWatch('ownerId', form);
  const selectedCycle = Form.useWatch('cycle', form);
  const selectedObjectiveId = Form.useWatch('alignedOrgGoalId', form);
  const isObjective = ownerType === 'ORGANIZATION';

  const { data: currentMemberDetail } = useQuery({
    queryKey: ['member-detail', user?.id],
    queryFn: () => memberApi.detail(user!.id),
    enabled: open && !!user?.id,
    staleTime: 60_000,
  });

  const { data: organizationTree = [] } = useQuery({
    queryKey: ['organizations', 'goal-owner-default'],
    queryFn: () => organizationApi.list(),
    enabled: open && defaultOwnerType === 'ORGANIZATION' && !!user?.id,
    staleTime: 5 * 60_000,
  });
  const { data: orgChart } = useQuery({
    queryKey: ['organizations', 'org-chart', 'goal-owner-default'],
    queryFn: () => organizationApi.getOrgChart(),
    enabled: open && defaultOwnerType === 'ORGANIZATION' && !!user?.id,
    staleTime: 5 * 60_000,
  });

  const organizationRows = useMemo(
    () => flattenOrganizationsWithMeta(organizationTree as any),
    [organizationTree],
  );
  const organizationIds = useMemo(
    () => new Set(organizationRows.map((row) => row.id)),
    [organizationRows],
  );
  const organizationIdFromTree = useMemo(
    () => (user?.id ? findMemberOrganizationId(orgChart?.organizations ?? [], user.id) : null),
    [orgChart?.organizations, user?.id],
  );
  const defaultObjectiveOwnerId = useMemo(() => {
    if (defaultOwnerType !== 'ORGANIZATION') return defaultOwnerId || '';
    return (
      currentMemberDetail?.organizationId ||
      organizationIdFromTree ||
      (defaultOwnerId && organizationIds.has(defaultOwnerId) ? defaultOwnerId : '') ||
      ''
    );
  }, [
    currentMemberDetail?.organizationId,
    defaultOwnerId,
    defaultOwnerType,
    organizationIdFromTree,
    organizationIds,
  ]);
  const defaultObjectiveOwnerName = useMemo(() => {
    if (!defaultObjectiveOwnerId) return currentMemberDetail?.organizationName || '';
    return (
      organizationRows.find((row) => row.id === defaultObjectiveOwnerId)?.name ||
      currentMemberDetail?.organizationName ||
      ''
    );
  }, [currentMemberDetail?.organizationName, defaultObjectiveOwnerId, organizationRows]);

  const { data: availableObjectives = [], isLoading: isObjectivesLoading } = useQuery({
    queryKey: ['goal-my-objectives-for-create'],
    queryFn: () => goalApi.listMyObjectives(),
    enabled: open && ownerType === 'MEMBER' && !!user?.id,
  });

  const objectiveOptions = useMemo(
    () =>
      availableObjectives.map((item) => ({
        value: item.goalId,
        label: `${item.title} · ${item.cycleKey}`,
      })),
    [availableObjectives],
  );
  const selectedObjective = useMemo(
    () => availableObjectives.find((item) => item.goalId === selectedObjectiveId) ?? null,
    [availableObjectives, selectedObjectiveId],
  );
  const currentMemberOwnerId = currentMemberDetail?.memberId || user?.id || defaultOwnerId || '';
  const currentMemberOwnerLabel = currentMemberDetail
    ? [
        currentMemberDetail.name,
        currentMemberDetail.organizationName,
        currentMemberDetail.jobGradeName,
      ]
        .map((value) => value?.trim())
        .filter(Boolean)
        .join(' · ')
    : [user?.name, user?.departmentName, user?.jobTitle]
        .map((value) => value?.trim())
        .filter(Boolean)
        .join(' · ');
  const krSetupReady = isObjective || !!selectedObjective;
  const isKrCycleLocked = !isObjective && !!selectedObjective;

  useEffect(() => {
    if (!open) return;
    if (goal) {
      form.setFieldsValue({
        ownerType: goal.ownerType,
        ownerId: goal.ownerId,
        alignedOrgGoalId: goal.alignedOrgGoalId ?? null,
        title: goal.title,
        description: goal.description,
        cycle: goal.cycle,
        cycleYear: dayjs(goal.cycleStartDate).year(),
        cycleSegment: cycleSegmentFrom(goal.cycle, goal.cycleStartDate),
        manualPeriodEnabled: false,
        manualCycleRange: [dayjs(goal.cycleStartDate), dayjs(goal.cycleEndDate)],
        weightPct: goal.weightPct,
        gradeS: goal.gradeS ?? '',
        gradeA: goal.gradeA ?? '',
        gradeB: goal.gradeB ?? '',
        gradeC: goal.gradeC ?? '',
      });
      setSelectedOwnerMemberLabel('');
      return;
    }

    form.resetFields();
    form.setFieldsValue({
      ownerType: defaultOwnerType ?? 'MEMBER',
      ownerId:
        (defaultOwnerType ?? 'MEMBER') === 'ORGANIZATION'
          ? defaultObjectiveOwnerId
          : currentMemberOwnerId,
      alignedOrgGoalId: presetAlignedOrgGoalId ?? null,
      cycle: 'QUARTERLY',
      cycleYear: dayjs().year(),
      cycleSegment: 'Q1',
      manualPeriodEnabled: false,
      weightPct: 0,
      gradeS: '',
      gradeA: '',
      gradeB: '',
      gradeC: '',
    });
    setSelectedOwnerMemberLabel(
      (defaultOwnerType ?? 'MEMBER') === 'MEMBER' ? currentMemberOwnerLabel : '',
    );
  }, [
    currentMemberOwnerId,
    currentMemberOwnerLabel,
    defaultObjectiveOwnerId,
    defaultOwnerType,
    form,
    goal,
    open,
    presetAlignedOrgGoalId,
  ]);

  useEffect(() => {
    if (!open || isEdit || ownerType !== 'ORGANIZATION' || !defaultObjectiveOwnerId) return;
    const currentOwnerId = form.getFieldValue('ownerId');
    if (currentOwnerId !== defaultObjectiveOwnerId) {
      form.setFieldValue('ownerId', defaultObjectiveOwnerId);
      form.validateFields(['ownerId']).catch(() => undefined);
    }
  }, [defaultObjectiveOwnerId, form, isEdit, open, ownerType]);

  useEffect(() => {
    if (!open || isEdit || ownerType !== 'MEMBER' || !currentMemberOwnerId) return;
    const currentOwnerId = form.getFieldValue('ownerId');
    if (currentOwnerId !== currentMemberOwnerId) {
      form.setFieldValue('ownerId', currentMemberOwnerId);
      form.validateFields(['ownerId']).catch(() => undefined);
    }
    setSelectedOwnerMemberLabel(currentMemberOwnerLabel);
  }, [currentMemberOwnerId, currentMemberOwnerLabel, form, isEdit, open, ownerType]);

  useEffect(() => {
    if (!open || isEdit || ownerType !== 'MEMBER' || !selectedObjective) return;
    const segment = cycleSegmentFrom(selectedObjective.cycle, selectedObjective.cycleStartDate);
    form.setFieldsValue({
      cycle: selectedObjective.cycle,
      cycleYear: dayjs(selectedObjective.cycleStartDate).year(),
      cycleSegment: segment,
      manualPeriodEnabled: false,
      manualCycleRange: [
        dayjs(selectedObjective.cycleStartDate),
        dayjs(selectedObjective.cycleEndDate),
      ],
      title: selectedObjective.title,
      description: selectedObjective.description || '',
    });
  }, [form, isEdit, open, ownerType, selectedObjective]);

  const createMut = useMutation({
    mutationFn: (payload: GoalCreatePayload) => goalApi.createGoal(payload),
    onSuccess: () => {
      message.success('목표를 생성했어요.');
      invalidateGoalQueries();
      onClose();
    },
    onError: (error: any) => message.error(error?.message ?? '목표 생성에 실패했어요.'),
  });

  const updateMut = useMutation({
    mutationFn: async () => {
      if (!goal) throw new Error('goal is required');
      const targetGoalId = goal.goalId;
      const values = await form.validateFields();
      if (isObjective && !values.ownerId) {
        form.setFields([{ name: 'ownerId', errors: ['소유 조직을 선택해 주세요.'] }]);
        throw new Error('소유 조직을 선택해 주세요.');
      }
      const payload = isObjective
        ? {
            ownerId: values.ownerId,
            title: values.title,
            description: values.description,
            gradeS: values.gradeS,
            gradeA: values.gradeA,
            gradeB: values.gradeB,
            gradeC: values.gradeC,
          }
        : {
            title: values.title,
            description: values.description,
            weightPct: values.weightPct,
            alignedOrgGoalId: values.alignedOrgGoalId || null,
          };
      const updated = await goalApi.updateGoal(goal.goalId, payload);
      return { updated, targetGoalId };
    },
    onSuccess: ({ updated, targetGoalId }) => {
      patchGoalInCache(updated, targetGoalId);
      message.success('목표를 수정했어요.');
      invalidateGoalQueries();
      onClose();
    },
    onError: (error: any) => message.error(error?.message ?? '목표 수정에 실패했어요.'),
  });

  async function handleSubmit() {
    if (isEdit) {
      updateMut.mutate();
      return;
    }

    const values = await form.validateFields();
    if (values.ownerType === 'ORGANIZATION' && !values.ownerId) {
      form.setFields([{ name: 'ownerId', errors: ['소유 조직을 선택해 주세요.'] }]);
      message.warning('소유 조직을 선택해 주세요.');
      return;
    }
    const period =
      values.manualPeriodEnabled && values.manualCycleRange
        ? {
            cycleStartDate: values.manualCycleRange[0].format('YYYY-MM-DD'),
            cycleEndDate: values.manualCycleRange[1].format('YYYY-MM-DD'),
          }
        : toCyclePeriod(values.cycle, values.cycleYear, values.cycleSegment);

    const payload: GoalCreatePayload = {
      ownerType: values.ownerType,
      ownerId: values.ownerId,
      alignedOrgGoalId:
        values.ownerType === 'ORGANIZATION' ? null : values.alignedOrgGoalId || null,
      title: values.title,
      description: values.description,
      cycle: values.cycle,
      ...period,
      weightPct: values.ownerType === 'ORGANIZATION' ? 0 : values.weightPct,
      gradeS: values.ownerType === 'ORGANIZATION' ? values.gradeS : undefined,
      gradeA: values.ownerType === 'ORGANIZATION' ? values.gradeA : undefined,
      gradeB: values.ownerType === 'ORGANIZATION' ? values.gradeB : undefined,
      gradeC: values.ownerType === 'ORGANIZATION' ? values.gradeC : undefined,
    };
    createMut.mutate(payload);
  }

  return (
    <AppDoubleActionModal
      open={open}
      title={isEdit ? '목표 수정' : isObjective ? '조직 목표 생성' : '개인 목표 생성'}
      onClose={onClose}
      onConfirm={handleSubmit}
      confirmText="저장"
      cancelText="취소"
      width={760}
      destroyOnHidden={false}
      forceRender
      confirmLoading={createMut.isPending || updateMut.isPending}
    >
      <div className="tw-space-y-5 tw-px-5 tw-py-4">
        <Form form={form} layout="vertical">
          <SectionHeader title="기본 정보" />

          <Form.Item name="ownerType" rules={[{ required: true }]} hidden>
            <Input type="hidden" />
          </Form.Item>

          <div className="tw-grid tw-grid-cols-1 tw-gap-3">
            <Form.Item shouldUpdate noStyle>
              {({ getFieldValue, setFieldValue }) => {
                const currentOwnerType = getFieldValue('ownerType') as GoalOwnerType;
                const ownerId = (getFieldValue('ownerId') as string | undefined) ?? '';
                if (currentOwnerType === 'ORGANIZATION') {
                  return (
                    <Form.Item label="소유 조직" name="ownerId" rules={[{ required: true }]}>
                      <OrganizationPickerInput
                        value={ownerId}
                        onChange={(orgId) => setFieldValue('ownerId', orgId)}
                        placeholder="조직 목표를 소유할 조직을 선택하세요."
                        selectedOrganizationName={defaultObjectiveOwnerName}
                      />
                    </Form.Item>
                  );
                }
                return (
                  <Form.Item label="소유 구성원" required>
                    <>
                      <Form.Item name="ownerId" rules={[{ required: true }]} noStyle>
                        <Input type="hidden" />
                      </Form.Item>
                      {isEdit ? (
                        <Input
                          readOnly
                          disabled
                          placeholder="개인 목표를 소유할 구성원을 선택하세요."
                          value={ownerId ? selectedOwnerMemberLabel || '선택된 구성원' : ''}
                        />
                      ) : (
                        <Space.Compact className="tw-w-full">
                          <Input
                            readOnly
                            placeholder="개인 목표를 소유할 구성원을 선택하세요."
                            value={
                              ownerId
                                ? selectedOwnerMemberLabel || currentMemberOwnerLabel || '내 계정'
                                : ''
                            }
                          />
                          <Button onClick={() => setMemberPickerOpen(true)}>구성원 선택</Button>
                        </Space.Compact>
                      )}
                    </>
                  </Form.Item>
                );
              }}
            </Form.Item>
          </div>

          {!isObjective && (
            <Form.Item
              className="tw-mt-2"
              label="상위 조직 목표"
              name="alignedOrgGoalId"
              rules={[
                {
                  required: true,
                  message: '개인 목표는 상위 조직 목표와 반드시 연결되어야 합니다.',
                },
              ]}
              tooltip="개인 목표는 상위 조직 목표의 S/A/B/C 기준을 그대로 참조합니다."
            >
              <Select
                placeholder="연결할 조직 목표를 먼저 선택하세요."
                options={objectiveOptions}
                loading={isObjectivesLoading}
                disabled={isObjectivesLoading}
                notFoundContent={
                  isObjectivesLoading
                    ? '조직 목표 목록을 불러오는 중입니다.'
                    : '내 조직에서 연결 가능한 조직 목표가 없습니다.'
                }
                showSearch
                optionFilterProp="label"
              />
            </Form.Item>
          )}

          <Form.Item label="제목" name="title" rules={[{ required: true, max: 300 }]}>
            <Input
              placeholder={
                isObjective ? '예: 2026 Q2 고객 경험 개선' : '예: 주요 고객 계약 성사율 90% 달성'
              }
            />
          </Form.Item>

          <Form.Item label="설명" name="description" rules={[{ required: true }]}>
            <TextArea rows={3} placeholder="목표의 배경과 기대 결과를 적어 주세요." />
          </Form.Item>

          <SectionHeader
            title={isObjective ? '목표 기간' : '목표 기간 / 가중치'}
            className="tw-mt-2"
          />

          <div
            className={
              isObjective ? 'tw-grid tw-grid-cols-3 tw-gap-3' : 'tw-grid tw-grid-cols-4 tw-gap-3'
            }
          >
            <Form.Item label="기간 유형" name="cycle" rules={[{ required: true }]}>
              <Select
                disabled={isEdit || (!isObjective && !krSetupReady) || isKrCycleLocked}
                onChange={(nextCycle) => {
                  if (isEdit) return;
                  if (nextCycle === 'QUARTERLY') form.setFieldValue('cycleSegment', 'Q1');
                  else if (nextCycle === 'HALF_YEARLY') form.setFieldValue('cycleSegment', 'H1');
                  else form.setFieldValue('cycleSegment', undefined);
                }}
                options={[
                  { value: 'QUARTERLY', label: '분기' },
                  { value: 'HALF_YEARLY', label: '반기' },
                  { value: 'YEARLY', label: '연간' },
                ]}
              />
            </Form.Item>

            <Form.Item
              label="연도"
              name="cycleYear"
              rules={[{ required: true, type: 'number', min: 2000, max: 2100 }]}
            >
              <InputNumber
                disabled={isEdit || (!isObjective && !krSetupReady) || isKrCycleLocked}
                min={2000}
                max={2100}
                style={{ width: '100%' }}
              />
            </Form.Item>

            <Form.Item shouldUpdate noStyle>
              {({ getFieldValue }) => {
                const cycle = getFieldValue('cycle') as KpiCycle;
                if (cycle === 'YEARLY') return <div />;
                return (
                  <Form.Item
                    label={cycle === 'QUARTERLY' ? '분기' : '반기'}
                    name="cycleSegment"
                    rules={[{ required: true }]}
                  >
                    <Select
                      disabled={isEdit || (!isObjective && !krSetupReady) || isKrCycleLocked}
                      options={
                        cycle === 'QUARTERLY'
                          ? [
                              { value: 'Q1', label: '1분기' },
                              { value: 'Q2', label: '2분기' },
                              { value: 'Q3', label: '3분기' },
                              { value: 'Q4', label: '4분기' },
                            ]
                          : [
                              { value: 'H1', label: '상반기' },
                              { value: 'H2', label: '하반기' },
                            ]
                      }
                    />
                  </Form.Item>
                );
              }}
            </Form.Item>

            {!isObjective && (
              <Form.Item
                label="가중치(%)"
                name="weightPct"
                rules={[{ required: true, type: 'number', min: 0, max: 100 }]}
                tooltip="같은 목표 기간의 개인 목표 가중치 합이 100%여야 승인 요청이 가능합니다."
              >
                <InputNumber min={0} max={100} style={{ width: '100%' }} disabled={!krSetupReady} />
              </Form.Item>
            )}
          </div>

          <Form.Item shouldUpdate noStyle>
            {({ getFieldValue }) => {
              const cycle = getFieldValue('cycle') as KpiCycle;
              const year = getFieldValue('cycleYear') as number | undefined;
              const segment = getFieldValue('cycleSegment') as CycleFormSegment | undefined;
              const manual = !!getFieldValue('manualPeriodEnabled');
              const period = safeToCyclePeriod(cycle, year, segment);
              return (
                <div className="tw-space-y-2">
                  <Form.Item
                    label="기간 직접 입력"
                    name="manualPeriodEnabled"
                    valuePropName="checked"
                    style={{ marginBottom: 0 }}
                  >
                    <Switch disabled={isEdit || (!isObjective && !krSetupReady)} />
                  </Form.Item>
                  {!manual ? (
                    <div className="tw-rounded-xl tw-border tw-border-slate-200 tw-bg-slate-50 tw-p-3 tw-text-sm tw-text-slate-600">
                      자동 계산 기간:{' '}
                      <span className="tw-font-semibold">
                        {period
                          ? `${period.cycleStartDate} ~ ${period.cycleEndDate}`
                          : '목표 기간을 먼저 선택해 주세요.'}
                      </span>
                    </div>
                  ) : (
                    <Form.Item
                      label="목표 기간"
                      name="manualCycleRange"
                      rules={[{ required: true, message: '기간을 입력해 주세요.' }]}
                      style={{ marginBottom: 0 }}
                    >
                      <DatePicker.RangePicker
                        disabled={isEdit || (!isObjective && !krSetupReady)}
                        style={{ width: '100%' }}
                      />
                    </Form.Item>
                  )}
                </div>
              );
            }}
          </Form.Item>
          {!isObjective && !krSetupReady && (
            <div className="tw-rounded-xl tw-border tw-border-slate-200 tw-bg-slate-50 tw-p-3 tw-text-xs tw-text-slate-500">
              상위 조직 목표를 선택하면 목표 기간, 가중치, 공개 범위를 입력할 수 있어요.
            </div>
          )}

          {isObjective ? (
            <>
              <SectionHeader title="평가 기준 (S/A/B/C)" className="tw-mt-2" />
              <div className="tw-space-y-3 tw-rounded-2xl tw-border tw-border-slate-200 tw-bg-slate-50/60 tw-p-4">
                {(['S', 'A', 'B', 'C'] as const).map((grade) => (
                  <div key={grade} className="tw-flex tw-items-center tw-gap-3">
                    <span
                      className={
                        'tw-inline-flex tw-h-8 tw-w-12 tw-shrink-0 tw-items-center tw-justify-center tw-rounded-full tw-border tw-text-sm tw-font-bold ' +
                        GRADE_BADGE[grade]
                      }
                    >
                      {grade}
                    </span>
                    <Form.Item
                      name={`grade${grade}` as keyof FormShape}
                      rules={[{ required: true, message: `${grade} 등급 기준을 입력해 주세요.` }]}
                      style={{ marginBottom: 0, flex: 1 }}
                    >
                      <Input placeholder={GRADE_HINT[grade]} />
                    </Form.Item>
                  </div>
                ))}
              </div>
              <div className="tw-mt-3 tw-rounded-xl tw-border tw-border-blue-100 tw-bg-blue-50/60 tw-p-4 tw-text-sm tw-text-slate-600">
                조직 목표가 S/A/B/C 평가 기준의 기준점이 됩니다. 같은 조직 목표에 연결된 모든 개인
                목표가 이 기준을 공통으로 참조합니다.
              </div>
            </>
          ) : null}
        </Form>
      </div>

      <SingleMemberOrgChartSelectModal
        open={memberPickerOpen}
        selectedMemberId={selectedOwnerId}
        onClose={() => setMemberPickerOpen(false)}
        onSelect={(member) => {
          form.setFieldValue('ownerId', member.memberId);
          setSelectedOwnerMemberLabel(
            `${member.name} · ${member.organizationName} · ${member.jobGradeName}`,
          );
          setMemberPickerOpen(false);
        }}
      />
    </AppDoubleActionModal>
  );

  function invalidateGoalQueries() {
    queryClient.invalidateQueries({ queryKey: ['goals-mine'] });
    queryClient.invalidateQueries({ queryKey: ['goals-my-objectives'] });
    queryClient.invalidateQueries({ queryKey: ['goals-company'] });
    queryClient.invalidateQueries({ queryKey: ['goals-company-all'] });
    queryClient.invalidateQueries({ queryKey: ['goals-org'] });
    queryClient.invalidateQueries({ queryKey: ['goals-org-objectives'] });
    queryClient.invalidateQueries({ queryKey: ['goal-available-objectives'] });
  }

  function patchGoalInCache(updatedGoal: Goal, fallbackGoalId?: string) {
    const targetGoalId = updatedGoal.goalId || fallbackGoalId;
    if (!targetGoalId) return;
    const entries = queryClient.getQueriesData({}) as Array<[readonly unknown[], unknown]>;
    for (const [queryKey, data] of entries) {
      if (!Array.isArray(data)) continue;
      const hasGoalShape = data.some(
        (item) => item && typeof item === 'object' && 'goalId' in (item as Record<string, unknown>),
      );
      if (!hasGoalShape) continue;
      queryClient.setQueryData(queryKey, (prev: unknown) => {
        if (!Array.isArray(prev)) return prev;
        let touched = false;
        const next = prev.map((item) => {
          if (!item || typeof item !== 'object') return item;
          const record = item as Record<string, unknown>;
          const recordId =
            typeof record.goalId === 'string'
              ? record.goalId
              : typeof record.id === 'string'
                ? record.id
                : '';
          if (recordId !== targetGoalId) return item;
          touched = true;
          return { ...record, ...updatedGoal, goalId: targetGoalId };
        });
        return touched ? next : prev;
      });
    }
  }
}

function SectionHeader({ title, className }: { title: string; className?: string }) {
  return (
    <div className={`tw-mb-3 ${className ?? ''}`}>
      <Text className="!tw-text-[12px] !tw-font-semibold !tw-uppercase !tw-tracking-wide !tw-text-slate-400">
        {title}
      </Text>
    </div>
  );
}
