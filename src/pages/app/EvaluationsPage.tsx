import { PlusOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Button,
  Card,
  Collapse,
  DatePicker,
  Descriptions,
  Divider,
  Drawer,
  Form,
  Input,
  InputNumber,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { EVALUATION_PAGE_KO } from '@/app/locale/app-ko';
import { evaluationApi } from '@/features/evaluation/api/evaluationApi';
import type {
  ConfirmEvaluationPayload,
  CreateEvaluationPayload,
  CreateEvaluationPolicyPayload,
  EvalCycle,
  EvalType,
  Evaluation,
  EvaluationPolicy,
  GradeType,
  PatchEvaluationScoresPayload,
} from '@/features/evaluation/model/types';
import { PERM } from '@/features/permissions/backend-permissions';
import { PermissionGuard } from '@/features/permissions/permission-guard';
import { usePermissions } from '@/features/permissions/usePermissionsHook';
import { useAuth } from '@/features/auth/useAuth';
import { useMemberDisplayNames } from '@/features/members/hooks/useMemberDisplayNames';
import { MemberRemoteSelect } from '@/features/members/ui/MemberRemoteSelect';
import { isStandardUuidString } from '@/shared/validation/uuid';
import { AppButton } from '@/shared/ui/AppButton';
import { AppModal } from '@/shared/ui/AppModal';

const { Text, Paragraph } = Typography;

const EVAL_CYCLE_OPTIONS: { value: EvalCycle; label: string }[] = [
  { value: 'MONTHLY', label: '월간' },
  { value: 'QUARTERLY', label: '분기' },
  { value: 'SEMI_ANNUAL', label: '반기' },
  { value: 'ANNUAL', label: '연간' },
];

const GRADE_TYPE_OPTIONS: { value: GradeType; label: string }[] = [
  { value: 'ABSOLUTE', label: '절대 평가' },
  { value: 'RELATIVE', label: '상대 평가' },
];

const EVAL_TYPE_OPTIONS: { value: EvalType; label: string }[] = [
  { value: 'SELF', label: '자기' },
  { value: 'SUPERVISOR', label: '상사' },
  { value: 'PEER', label: '동료' },
];

function cycleLabel(c: EvalCycle): string {
  return EVAL_CYCLE_OPTIONS.find((o) => o.value === c)?.label ?? c;
}

function evalTypeLabel(t: EvalType): string {
  return EVAL_TYPE_OPTIONS.find((o) => o.value === t)?.label ?? t;
}

function statusTag(status?: string) {
  const s = (status ?? 'DRAFT').toUpperCase();
  if (s === 'DRAFT') return <Tag color="gold">{EVALUATION_PAGE_KO.statusDraft}</Tag>;
  if (s === 'SUBMITTED') return <Tag color="blue">{EVALUATION_PAGE_KO.statusSubmitted}</Tag>;
  if (s === 'CONFIRMED') return <Tag color="success">{EVALUATION_PAGE_KO.statusConfirmed}</Tag>;
  return <Tag>{status ?? '—'}</Tag>;
}

export function EvaluationsPage() {
  const { user } = useAuth();
  const { hasPermission } = usePermissions();
  const queryClient = useQueryClient();
  const companyId = user?.companyId?.trim();
  const memberId = user?.id ?? '';

  const canRead = hasPermission(PERM.EVALUATION_READ);
  const canCreate = hasPermission(PERM.EVALUATION_CREATE);
  const canUpdate = hasPermission(PERM.EVALUATION_UPDATE);

  const [tab, setTab] = useState<'mine' | 'policies'>('mine');
  useEffect(() => {
    if (!canRead && tab === 'policies') setTab('mine');
  }, [canRead, tab]);
  const [activePolicyOnly, setActivePolicyOnly] = useState(false);
  const [policyForList, setPolicyForList] = useState<string | undefined>();
  const [detailEval, setDetailEval] = useState<Evaluation | null>(null);
  const [policyModalOpen, setPolicyModalOpen] = useState(false);
  const [evalModalOpen, setEvalModalOpen] = useState(false);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);

  const [policyForm] = Form.useForm<CreateEvaluationPolicyPayload>();
  const [evalForm] = Form.useForm<CreateEvaluationPayload>();
  const [scoreForm] = Form.useForm<PatchEvaluationScoresPayload>();
  const [confirmForm] = Form.useForm<ConfirmEvaluationPayload>();

  const myQuery = useQuery({
    queryKey: ['evaluation', 'evaluator', 'me', memberId],
    queryFn: () => evaluationApi.listMyEvaluations(),
    enabled: Boolean(memberId && companyId),
  });

  const policiesQuery = useQuery({
    queryKey: ['evaluation', 'policies', companyId, activePolicyOnly],
    queryFn: () => evaluationApi.listPolicies(activePolicyOnly),
    enabled: Boolean(companyId && canRead),
  });

  const policyEvalsQuery = useQuery({
    queryKey: ['evaluation', 'by-policy', policyForList],
    queryFn: () => evaluationApi.listEvaluationsByPolicy(policyForList!),
    enabled: Boolean(policyForList && canRead),
  });

  const detailRefreshQuery = useQuery({
    queryKey: ['evaluation', 'detail', detailEval?.id],
    queryFn: () => evaluationApi.getEvaluation(detailEval!.id),
    enabled: Boolean(detailEval?.id),
  });

  const calibrationQuery = useQuery({
    queryKey: ['evaluation', 'calibration', detailEval?.id],
    queryFn: () => evaluationApi.listCalibrations(detailEval!.id),
    enabled: Boolean(detailEval?.id && canRead),
  });

  const displayEval = detailRefreshQuery.data ?? detailEval;

  const invalidateEvalQueries = () => {
    void queryClient.invalidateQueries({ queryKey: ['evaluation'] });
  };

  const createPolicyMut = useMutation({
    mutationFn: (body: CreateEvaluationPolicyPayload) => evaluationApi.createPolicy(body),
    onSuccess: () => {
      message.success('평가 정책이 등록되었습니다.');
      setPolicyModalOpen(false);
      policyForm.resetFields();
      invalidateEvalQueries();
    },
    onError: (e: Error) => message.error(e.message),
  });

  const deactivateMut = useMutation({
    mutationFn: (policyId: string) => evaluationApi.deactivatePolicy(policyId),
    onSuccess: () => {
      message.success('정책을 비활성화했습니다.');
      invalidateEvalQueries();
    },
    onError: (e: Error) => message.error(e.message),
  });

  const createEvalMut = useMutation({
    mutationFn: (body: CreateEvaluationPayload) => evaluationApi.createEvaluation(body),
    onSuccess: () => {
      message.success('평가가 생성되었습니다.');
      setEvalModalOpen(false);
      evalForm.resetFields();
      invalidateEvalQueries();
    },
    onError: (e: Error) => message.error(e.message),
  });

  const patchScoresMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: PatchEvaluationScoresPayload }) =>
      evaluationApi.patchScores(id, body),
    onSuccess: () => {
      message.success('저장했습니다.');
      invalidateEvalQueries();
      void detailRefreshQuery.refetch();
    },
    onError: (e: Error) => message.error(e.message),
  });

  const submitMut = useMutation({
    mutationFn: (id: string) => evaluationApi.submitEvaluation(id),
    onSuccess: () => {
      message.success('제출했습니다.');
      invalidateEvalQueries();
      void detailRefreshQuery.refetch();
    },
    onError: (e: Error) => message.error(e.message),
  });

  const confirmMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: ConfirmEvaluationPayload }) =>
      evaluationApi.confirmEvaluation(id, body),
    onSuccess: () => {
      message.success('확정했습니다.');
      setConfirmModalOpen(false);
      confirmForm.resetFields();
      invalidateEvalQueries();
      void detailRefreshQuery.refetch();
    },
    onError: (e: Error) => message.error(e.message),
  });

  const openDetail = useCallback((row: Evaluation) => {
    setDetailEval(row);
    scoreForm.setFieldsValue({
      quantScore: row.quantScore,
      qualScore: row.qualScore,
      goalScoresJson: row.goalScoresJson,
      rubricScoresJson: row.rubricScoresJson,
      comment: row.comment,
      strengthComment: row.strengthComment,
      improveComment: row.improveComment,
    });
  }, [scoreForm]);

  const closeDetail = () => {
    setDetailEval(null);
    scoreForm.resetFields();
  };

  const isDraft = (displayEval?.status ?? '').toUpperCase() === 'DRAFT';
  const isSubmitted = (displayEval?.status ?? '').toUpperCase() === 'SUBMITTED';
  const isMyEvaluation = displayEval && displayEval.evaluatorId === memberId;

  const evaluationMemberIds = useMemo(() => {
    const s = new Set<string>();
    for (const e of myQuery.data ?? []) {
      if (e.evaluateeId?.trim()) s.add(e.evaluateeId.trim());
      if (e.evaluatorId?.trim()) s.add(e.evaluatorId.trim());
    }
    for (const e of policyEvalsQuery.data ?? []) {
      if (e.evaluateeId?.trim()) s.add(e.evaluateeId.trim());
      if (e.evaluatorId?.trim()) s.add(e.evaluatorId.trim());
    }
    if (displayEval?.evaluateeId?.trim()) s.add(displayEval.evaluateeId.trim());
    if (displayEval?.evaluatorId?.trim()) s.add(displayEval.evaluatorId.trim());
    return [...s];
  }, [myQuery.data, policyEvalsQuery.data, displayEval]);

  const { labelFor: evalMemberLabelLookup } = useMemberDisplayNames(evaluationMemberIds);

  const evalMemberLabel = useCallback(
    (id: string | null | undefined) => {
      const t = id?.trim() ?? '';
      if (!t) return '—';
      if (t === memberId) return '나';
      return evalMemberLabelLookup(t);
    },
    [evalMemberLabelLookup, memberId],
  );

  const policyColumns: ColumnsType<EvaluationPolicy> = useMemo(
    () => [
      { title: EVALUATION_PAGE_KO.policyTableName, dataIndex: 'policyName', key: 'policyName', ellipsis: true },
      {
        title: EVALUATION_PAGE_KO.policyTableCycle,
        dataIndex: 'evalCycle',
        key: 'evalCycle',
        width: 88,
        render: (c: EvalCycle) => cycleLabel(c),
      },
      {
        title: EVALUATION_PAGE_KO.policyTablePeriod,
        key: 'period',
        render: (_, r) => `${r.periodStart} ~ ${r.periodEnd}`,
      },
      { title: EVALUATION_PAGE_KO.policyTableResultOpen, dataIndex: 'resultOpenDate', key: 'resultOpenDate', width: 120 },
      {
        title: EVALUATION_PAGE_KO.policyTableActive,
        key: 'active',
        width: 88,
        render: (_, r) => (r.active === false ? <Tag>OFF</Tag> : <Tag color="success">ON</Tag>),
      },
      ...(canUpdate
        ? [
            {
              title: '',
              key: 'act',
              width: 100,
              render: (_: unknown, r: EvaluationPolicy) =>
                r.active !== false ? (
                  <Popconfirm
                    title={EVALUATION_PAGE_KO.policyDeactivateConfirm}
                    onConfirm={() => deactivateMut.mutate(r.id)}
                    okButtonProps={{ loading: deactivateMut.isPending }}
                  >
                    <Button type="link" size="small" className="!tw-px-0">
                      {EVALUATION_PAGE_KO.policyDeactivate}
                    </Button>
                  </Popconfirm>
                ) : null,
            } as const,
          ]
        : []),
    ],
    [canUpdate, deactivateMut.isPending],
  );

  const myColumns: ColumnsType<Evaluation> = useMemo(
    () => [
      {
        title: EVALUATION_PAGE_KO.evalTableEvaluatee,
        dataIndex: 'evaluateeId',
        key: 'evaluateeId',
        render: (id: string) => (
          <Tooltip title={id}>
            <span>{evalMemberLabel(id)}</span>
          </Tooltip>
        ),
      },
      {
        title: EVALUATION_PAGE_KO.evalTableType,
        dataIndex: 'evalType',
        key: 'evalType',
        width: 100,
        render: (t: EvalType) => evalTypeLabel(t),
      },
      {
        title: EVALUATION_PAGE_KO.evalTableStatus,
        dataIndex: 'status',
        key: 'status',
        width: 120,
        render: (s: string) => statusTag(s),
      },
      {
        title: '',
        key: 'open',
        width: 96,
        render: (_: unknown, row) => (
          <Button type="primary" size="small" className="!tw-rounded-lg !tw-bg-[#1e3a5f]" onClick={() => openDetail(row)}>
            {EVALUATION_PAGE_KO.evalOpen}
          </Button>
        ),
      },
    ],
    [evalMemberLabel, openDetail],
  );

  const policyEvalColumns: ColumnsType<Evaluation> = useMemo(
    () => [
      {
        title: EVALUATION_PAGE_KO.evalTableEvaluator,
        dataIndex: 'evaluatorId',
        key: 'evaluatorId',
        render: (id: string) => (
          <Tooltip title={id}>
            <span>{evalMemberLabel(id)}</span>
          </Tooltip>
        ),
      },
      {
        title: EVALUATION_PAGE_KO.evalTableEvaluatee,
        dataIndex: 'evaluateeId',
        key: 'evaluateeId',
        render: (id: string) => (
          <Tooltip title={id}>
            <span>{evalMemberLabel(id)}</span>
          </Tooltip>
        ),
      },
      {
        title: EVALUATION_PAGE_KO.evalTableType,
        dataIndex: 'evalType',
        key: 'evalType',
        width: 100,
        render: (t: EvalType) => evalTypeLabel(t),
      },
      {
        title: EVALUATION_PAGE_KO.evalTableStatus,
        dataIndex: 'status',
        key: 'status',
        width: 120,
        render: (s: string) => statusTag(s),
      },
      {
        title: '',
        key: 'open',
        width: 88,
        render: (_: unknown, row: Evaluation) => (
          <Button type="link" size="small" className="!tw-px-0" onClick={() => openDetail(row)}>
            {EVALUATION_PAGE_KO.evalOpen}
          </Button>
        ),
      },
    ],
    [evalMemberLabel, openDetail],
  );

  return (
    <div className="tw-mx-auto tw-w-full tw-space-y-5">
      {!companyId ? (
        <Alert type="warning" showIcon message="회사 정보(companyId)를 확인할 수 없습니다." />
      ) : null}

      <section className="tw-rounded-2xl tw-border tw-border-slate-200/80" aria-label="평가 안내">
        <div className="tw-px-4 tw-pt-4 sm:tw-px-6 sm:tw-pt-5">
          <Typography.Title level={3} className="!tw-m-0 !tw-text-xl !tw-font-bold !tw-text-[#1e3a5f] sm:!tw-text-2xl">
            평가
          </Typography.Title>
          <Paragraph className="!tw-mb-0 !tw-mt-2 !tw-max-w-3xl !tw-text-sm !tw-leading-relaxed !tw-text-slate-600">
            {EVALUATION_PAGE_KO.pageIntro}
          </Paragraph>
        </div>
        <div className="tw-px-4 tw-pb-4 sm:tw-px-6 sm:tw-pb-5">
          <Collapse
            ghost
            className="!tw-bg-transparent [&_.ant-collapse-header]:!tw-px-0 [&_.ant-collapse-content-box]:!tw-px-0"
            items={[
              {
                key: 'flow',
                label: (
                  <span className="tw-text-sm tw-font-semibold tw-text-slate-700">{EVALUATION_PAGE_KO.flowTitle}</span>
                ),
                children: (
                  <ol className="tw-m-0 tw-list-decimal tw-space-y-2 tw-pl-5 tw-text-sm tw-leading-relaxed tw-text-slate-600">
                    {EVALUATION_PAGE_KO.flowSteps.map((t, i) => (
                      <li key={i}>{t}</li>
                    ))}
                  </ol>
                ),
              },
            ]}
          />
        </div>
      </section>

      <Card className="tw-overflow-hidden tw-rounded-2xl tw-border-slate-200/80 tw-bg-white tw-shadow-[0_1px_3px_rgba(15,23,42,0.06)] [&_.ant-card-body]:tw-px-4 [&_.ant-card-body]:tw-py-5 sm:[&_.ant-card-body]:tw-px-6">
        <Tabs
          activeKey={tab}
          onChange={(k) => setTab(k as 'mine' | 'policies')}
          items={[
            {
              key: 'mine',
              label: EVALUATION_PAGE_KO.tabMine,
              children: (
                <Table<Evaluation>
                  rowKey="id"
                  loading={myQuery.isPending}
                  dataSource={myQuery.data ?? []}
                  columns={myColumns}
                  pagination={{ pageSize: 10, showSizeChanger: true }}
                  locale={{ emptyText: EVALUATION_PAGE_KO.emptyMyEval }}
                  className="[&_.ant-table]:tw-text-sm"
                />
              ),
            },
            ...(canRead
              ? [
                  {
                    key: 'policies',
                    label: EVALUATION_PAGE_KO.tabPolicies,
                    children: (
                      <Space direction="vertical" className="tw-w-full" size={20}>
                        <div className="tw-flex tw-flex-col tw-gap-3 sm:tw-flex-row sm:tw-flex-wrap sm:tw-items-center sm:tw-justify-between">
                          <Space wrap>
                            <Text type="secondary" className="tw-text-sm">
                              {EVALUATION_PAGE_KO.activeOnlyPolicies}
                            </Text>
                            <Switch checked={activePolicyOnly} onChange={setActivePolicyOnly} />
                          </Space>
                          <Space wrap className="tw-w-full sm:tw-w-auto">
                            <PermissionGuard required={PERM.EVALUATION_CREATE} fallback={null}>
                              <Button
                                type="primary"
                                icon={<PlusOutlined />}
                                onClick={() => {
                                  if (!companyId) return;
                                  policyForm.setFieldsValue({
                                    companyId,
                                    policyName: '',
                                    evalCycle: 'ANNUAL',
                                    periodStart: dayjs(),
                                    periodEnd: dayjs().add(6, 'month'),
                                    resultOpenDate: dayjs().add(7, 'month'),
                                    editAllowedDays: 7,
                                    quantWeightPct: 50,
                                    qualWeightPct: 50,
                                    selfWeightPct: 20,
                                    supervisorWeightPct: 60,
                                    peerWeightPct: 20,
                                    gradeType: 'ABSOLUTE',
                                    gradeConfigJson: '{}',
                                    approvalRequired: true,
                                    biasCheckEnabled: true,
                                    peerCountMin: 2,
                                    peerCountMax: 5,
                                  });
                                  setPolicyModalOpen(true);
                                }}
                                className="!tw-h-10 !tw-rounded-xl !tw-border-0 !tw-bg-[#1e3a5f] hover:!tw-bg-[#152a45]"
                              >
                                {EVALUATION_PAGE_KO.ctaNewPolicy}
                              </Button>
                              <Button
                                onClick={() => {
                                  evalForm.resetFields();
                                  setEvalModalOpen(true);
                                }}
                                className="!tw-h-10 !tw-rounded-xl"
                              >
                                {EVALUATION_PAGE_KO.ctaNewEvaluation}
                              </Button>
                            </PermissionGuard>
                          </Space>
                        </div>

                        <Table<EvaluationPolicy>
                          rowKey="id"
                          loading={policiesQuery.isPending}
                          dataSource={policiesQuery.data ?? []}
                          columns={policyColumns}
                          pagination={{ pageSize: 8 }}
                          locale={{ emptyText: EVALUATION_PAGE_KO.emptyPolicies }}
                          className="[&_.ant-table]:tw-text-sm"
                        />

                        <Divider plain className="!tw-my-0">
                          <Text type="secondary" className="tw-text-xs">
                            {EVALUATION_PAGE_KO.policyPickForList}
                          </Text>
                        </Divider>
                        <Select
                          allowClear
                          placeholder="정책 선택"
                          className="tw-w-full sm:tw-max-w-md"
                          options={(policiesQuery.data ?? []).map((p) => ({ value: p.id, label: p.policyName }))}
                          value={policyForList}
                          onChange={(v) => setPolicyForList(v)}
                        />
                        <Table<Evaluation>
                          rowKey="id"
                          loading={policyEvalsQuery.isPending}
                          dataSource={policyEvalsQuery.data ?? []}
                          columns={policyEvalColumns}
                          pagination={{ pageSize: 8 }}
                          locale={{ emptyText: policyForList ? '평가가 없습니다.' : '정책을 선택하세요.' }}
                          className="[&_.ant-table]:tw-text-sm"
                        />
                      </Space>
                    ),
                  },
                ]
              : []),
          ]}
        />
      </Card>

      {!canRead && !canCreate ? (
        <Alert type="info" showIcon message={EVALUATION_PAGE_KO.roleHintNoH} className="tw-rounded-xl" />
      ) : null}

      <Drawer
        title={EVALUATION_PAGE_KO.drawerTitle}
        width={560}
        open={detailEval !== null}
        onClose={closeDetail}
        destroyOnHidden
        classNames={{ body: 'wf-scrollbar-modal' }}
        styles={{ body: { paddingBottom: 24 } }}
      >
        {displayEval ? (
          <Space direction="vertical" className="tw-w-full" size={16}>
            <Descriptions size="small" column={1} bordered>
              <Descriptions.Item label="ID">
                <Text code copyable>
                  {displayEval.id}
                </Text>
              </Descriptions.Item>
              <Descriptions.Item label="정책 ID">
                <Text code copyable>
                  {displayEval.evaluationPolicyId}
                </Text>
              </Descriptions.Item>
              <Descriptions.Item label={EVALUATION_PAGE_KO.evalTableEvaluatee}>
                <Tooltip title={displayEval.evaluateeId}>
                  <span>{evalMemberLabel(displayEval.evaluateeId)}</span>
                </Tooltip>
              </Descriptions.Item>
              <Descriptions.Item label={EVALUATION_PAGE_KO.evalTableEvaluator}>
                <Tooltip title={displayEval.evaluatorId}>
                  <span>{evalMemberLabel(displayEval.evaluatorId)}</span>
                </Tooltip>
              </Descriptions.Item>
              <Descriptions.Item label={EVALUATION_PAGE_KO.evalTableType}>{evalTypeLabel(displayEval.evalType)}</Descriptions.Item>
              <Descriptions.Item label={EVALUATION_PAGE_KO.evalTableStatus}>{statusTag(displayEval.status)}</Descriptions.Item>
              {displayEval.finalScore != null ? (
                <Descriptions.Item label={EVALUATION_PAGE_KO.finalScore}>{displayEval.finalScore}</Descriptions.Item>
              ) : null}
              {displayEval.grade ? (
                <Descriptions.Item label={EVALUATION_PAGE_KO.finalGrade}>{displayEval.grade}</Descriptions.Item>
              ) : null}
            </Descriptions>

            {isDraft && isMyEvaluation ? (
              <Form
                form={scoreForm}
                layout="vertical"
                className="tw-mt-2"
                onFinish={(v) => patchScoresMut.mutate({ id: displayEval.id, body: v })}
              >
                <Form.Item name="quantScore" label="정량 점수">
                  <InputNumber min={0} max={100} className="tw-w-full" />
                </Form.Item>
                <Form.Item name="qualScore" label="정성 점수">
                  <InputNumber min={0} max={100} className="tw-w-full" />
                </Form.Item>
                <Form.Item name="goalScoresJson" label="목표 점수 JSON">
                  <Input.TextArea rows={2} placeholder="{}" />
                </Form.Item>
                <Form.Item name="rubricScoresJson" label="루브릭 JSON">
                  <Input.TextArea rows={2} placeholder="{}" />
                </Form.Item>
                <Form.Item name="comment" label="종합 의견">
                  <Input.TextArea rows={2} />
                </Form.Item>
                <Form.Item name="strengthComment" label="강점">
                  <Input.TextArea rows={2} />
                </Form.Item>
                <Form.Item name="improveComment" label="보완점">
                  <Input.TextArea rows={2} />
                </Form.Item>
                <Space wrap>
                  <AppButton type="primary" htmlType="submit" loading={patchScoresMut.isPending}>
                    {EVALUATION_PAGE_KO.saveDraft}
                  </AppButton>
                  <Popconfirm title={EVALUATION_PAGE_KO.submitWarning} onConfirm={() => submitMut.mutate(displayEval.id)}>
                    <AppButton loading={submitMut.isPending}>{EVALUATION_PAGE_KO.submitEval}</AppButton>
                  </Popconfirm>
                </Space>
              </Form>
            ) : null}

            {isSubmitted && canUpdate ? (
              <Button type="primary" className="!tw-bg-[#1e3a5f]" onClick={() => setConfirmModalOpen(true)}>
                {EVALUATION_PAGE_KO.confirmEval}
              </Button>
            ) : null}

            {canRead ? (
              <>
                <Divider>{EVALUATION_PAGE_KO.tabCalibration}</Divider>
                <Table
                  size="small"
                  loading={calibrationQuery.isPending}
                  dataSource={calibrationQuery.data ?? []}
                  rowKey={(r) => r.id ?? `${r.evaluationId}-${r.reason}-${r.afterScore}`}
                  pagination={false}
                  columns={[
                    { title: '전(B)', dataIndex: 'beforeGrade', width: 72 },
                    { title: '후(A)', dataIndex: 'afterGrade', width: 72 },
                    { title: '전 점수', dataIndex: 'beforeScore', width: 80 },
                    { title: '후 점수', dataIndex: 'afterScore', width: 80 },
                    { title: EVALUATION_PAGE_KO.calibrationReason, dataIndex: 'reason', ellipsis: true },
                  ]}
                />
              </>
            ) : null}
          </Space>
        ) : null}
      </Drawer>

      <AppModal
        title={EVALUATION_PAGE_KO.modalNewPolicyTitle}
        open={policyModalOpen}
        onCancel={() => setPolicyModalOpen(false)}
        footer={null}
        destroyOnHidden
        width={520}
      >
        <Form
          form={policyForm}
          layout="vertical"
          onFinish={(v) => {
            const payload = v as CreateEvaluationPolicyPayload;
            if (!isStandardUuidString(payload.companyId)) {
              message.error(EVALUATION_PAGE_KO.uuidInvalidCompany);
              return;
            }
            const raw = v as Record<string, unknown>;
            const toDateStr = (x: unknown) => (dayjs.isDayjs(x) ? x.format('YYYY-MM-DD') : String(x ?? ''));
            createPolicyMut.mutate({
              ...payload,
              periodStart: toDateStr(raw.periodStart),
              periodEnd: toDateStr(raw.periodEnd),
              resultOpenDate: toDateStr(raw.resultOpenDate),
            });
          }}
        >
          <Form.Item name="companyId" hidden>
            <Input />
          </Form.Item>
          <Form.Item name="policyName" label="정책명" rules={[{ required: true }]}>
            <Input placeholder="예: 2025년 정기 평가" />
          </Form.Item>
          <Form.Item name="evalCycle" label="주기" rules={[{ required: true }]}>
            <Select options={EVAL_CYCLE_OPTIONS} />
          </Form.Item>
          <Form.Item name="periodStart" label="기간 시작" rules={[{ required: true }]}>
            <DatePicker className="tw-w-full" format="YYYY-MM-DD" />
          </Form.Item>
          <Form.Item name="periodEnd" label="기간 종료" rules={[{ required: true }]}>
            <DatePicker className="tw-w-full" format="YYYY-MM-DD" />
          </Form.Item>
          <Form.Item name="resultOpenDate" label="결과 공개일" rules={[{ required: true }]}>
            <DatePicker className="tw-w-full" format="YYYY-MM-DD" />
          </Form.Item>
          <Form.Item name="editAllowedDays" label="수정 허용 일수" rules={[{ required: true }]}>
            <InputNumber min={0} className="tw-w-full" />
          </Form.Item>
          <Form.Item name="quantWeightPct" label="정량 비중(%)" rules={[{ required: true }]}>
            <InputNumber min={0} max={100} className="tw-w-full" />
          </Form.Item>
          <Form.Item name="qualWeightPct" label="정성 비중(%)" rules={[{ required: true }]}>
            <InputNumber min={0} max={100} className="tw-w-full" />
          </Form.Item>
          <Form.Item name="selfWeightPct" label="자기 평가 비중(%)" rules={[{ required: true }]}>
            <InputNumber min={0} max={100} className="tw-w-full" />
          </Form.Item>
          <Form.Item name="supervisorWeightPct" label="상사 비중(%)" rules={[{ required: true }]}>
            <InputNumber min={0} max={100} className="tw-w-full" />
          </Form.Item>
          <Form.Item name="peerWeightPct" label="동료 비중(%)" rules={[{ required: true }]}>
            <InputNumber min={0} max={100} className="tw-w-full" />
          </Form.Item>
          <Form.Item name="gradeType" label="등급 방식" rules={[{ required: true }]}>
            <Select options={GRADE_TYPE_OPTIONS} />
          </Form.Item>
          <Form.Item name="gradeConfigJson" label="등급 설정 JSON" rules={[{ required: true }]}>
            <Input.TextArea rows={3} placeholder="{}" />
          </Form.Item>
          <Form.Item name="approvalRequired" label="승인 필요" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="biasCheckEnabled" label="편향 검사" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="peerCountMin" label="동료 최소 인원" rules={[{ required: true }]}>
            <InputNumber min={0} className="tw-w-full" />
          </Form.Item>
          <Form.Item name="peerCountMax" label="동료 최대 인원" rules={[{ required: true }]}>
            <InputNumber min={0} className="tw-w-full" />
          </Form.Item>
          <AppButton type="primary" htmlType="submit" className="tw-w-full" loading={createPolicyMut.isPending}>
            등록
          </AppButton>
        </Form>
      </AppModal>

      <AppModal
        title={EVALUATION_PAGE_KO.modalNewEvalTitle}
        open={evalModalOpen}
        onCancel={() => setEvalModalOpen(false)}
        footer={null}
        destroyOnHidden
        width={520}
      >
        <Form
          form={evalForm}
          layout="vertical"
          onFinish={(v) => createEvalMut.mutate(v as CreateEvaluationPayload)}
        >
          <Form.Item
            name="evaluationPolicyId"
            label="평가 정책"
            rules={[{ required: true, message: '정책을 선택하세요.' }]}
          >
            <Select
              showSearch
              optionFilterProp="label"
              options={(policiesQuery.data ?? []).map((p) => ({ value: p.id, label: p.policyName }))}
              placeholder="정책 선택"
            />
          </Form.Item>
          <Form.Item
            name="evaluateeId"
            label={EVALUATION_PAGE_KO.evalTableEvaluatee}
            rules={[{ required: true, message: EVALUATION_PAGE_KO.evaluateeIdRequired }]}
          >
            <MemberRemoteSelect placeholder={EVALUATION_PAGE_KO.evaluateeSearchPlaceholder} />
          </Form.Item>
          <Form.Item name="evalType" label={EVALUATION_PAGE_KO.evalTableType} rules={[{ required: true }]}>
            <Select options={EVAL_TYPE_OPTIONS} />
          </Form.Item>
          <AppButton type="primary" htmlType="submit" className="tw-w-full" loading={createEvalMut.isPending}>
            생성
          </AppButton>
        </Form>
      </AppModal>

      <AppModal
        title={EVALUATION_PAGE_KO.confirmTitle}
        open={confirmModalOpen}
        onCancel={() => setConfirmModalOpen(false)}
        footer={null}
        destroyOnHidden
        width={400}
      >
        <Form
          form={confirmForm}
          layout="vertical"
          initialValues={{ finalScore: 80, grade: 'B' }}
          onFinish={(v) => {
            if (!displayEval) return;
            confirmMut.mutate({ id: displayEval.id, body: v as ConfirmEvaluationPayload });
          }}
        >
          <Form.Item name="finalScore" label={EVALUATION_PAGE_KO.finalScore} rules={[{ required: true }]}>
            <InputNumber min={0} max={100} className="tw-w-full" />
          </Form.Item>
          <Form.Item name="grade" label={EVALUATION_PAGE_KO.finalGrade} rules={[{ required: true }]}>
            <Input placeholder="A, B, C …" />
          </Form.Item>
          <AppButton type="primary" htmlType="submit" className="tw-w-full" loading={confirmMut.isPending}>
            {EVALUATION_PAGE_KO.confirmEval}
          </AppButton>
        </Form>
      </AppModal>
    </div>
  );
}
