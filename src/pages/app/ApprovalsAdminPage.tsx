import { DeleteOutlined, EyeOutlined, PlusOutlined, ReloadOutlined, SaveOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  App,
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Typography,
} from 'antd';
import { useEffect, useMemo, useState } from 'react';
import {
  APPROVAL_REQUEST_TYPES,
  approvalApi,
  type ApprovalRequestType,
} from '@/features/approvals/api/approvalApi';
import { flattenOrganizationsWithMeta } from '@/features/organization/lib/flattenOrganizationTree';
import { organizationApi } from '@/features/organization/api/organizationApi';
import { PERM } from '@/features/permissions/backend-permissions';
import { PermissionGuard } from '@/features/permissions/permission-guard';
import { usePermissions } from '@/features/permissions/usePermissionsHook';

type DocForm = {
  documentName: string;
  requestType: ApprovalRequestType;
  autoApproveYn?: 'Y' | 'N';
  formSchema: string;
};

type PolicyLineDraft = {
  key: string;
  jobTitleId: string;
  stepOrder: number;
  organizationId: string | null;
};

type JobTitleOption = {
  value: string;
  label: string;
};

const REQUEST_TYPE_LABEL: Record<ApprovalRequestType, string> = {
  VACATION: '휴가',
  ATTENDANCE: '근태',
  HR_MOVEMENT: '부서이동',
  SALARY: '급여',
  GENERAL: '일반기안',
  CONTRACT: '전자계약',
  CERTIFICATE: '문서발급',
};

function parseJobTitleOptions(raw: Array<Record<string, unknown>>): JobTitleOption[] {
  return raw
    .map((row) => {
      const idRaw =
        row.jobTitleId ?? row.job_title_id ?? row.id ?? row.uuid ?? row.jobTitleUuid ?? row.job_title_uuid;
      const nameRaw = row.jobTitleName ?? row.job_title_name ?? row.name ?? row.title;
      const value = typeof idRaw === 'string' ? idRaw.trim() : '';
      const name = typeof nameRaw === 'string' ? nameRaw.trim() : '';
      if (!value) return null;
      return { value, label: name || value };
    })
    .filter((item): item is JobTitleOption => item != null)
    .sort((a, b) => a.label.localeCompare(b.label, 'ko'));
}

function defaultSchemaText() {
  return JSON.stringify(
    {
      fields: [
        { name: 'title', label: '제목', type: 'text' },
        { name: 'reason', label: '사유', type: 'textarea' },
      ],
    },
    null,
    2,
  );
}

function validatePolicyLines(rows: PolicyLineDraft[]) {
  if (rows.length === 0) return '정책라인을 1개 이상 추가해 주세요.';
  const sorted = [...rows].sort((a, b) => a.stepOrder - b.stepOrder);
  const seen = new Set<number>();
  for (const [i, row] of sorted.entries()) {
    if (!row.jobTitleId) return `${row.stepOrder}단계의 직책을 선택해 주세요.`;
    if (row.stepOrder < 1) return '결재 순서는 1 이상이어야 합니다.';
    if (seen.has(row.stepOrder)) return '결재 순서가 중복되었습니다.';
    seen.add(row.stepOrder);
    if (row.stepOrder !== i + 1) return '결재 순서는 1부터 연속된 값이어야 합니다.';
  }
  return null;
}

export function ApprovalsAdminPage() {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const { hasPermission } = usePermissions();
  const [createOpen, setCreateOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'documents' | 'policy-lines'>('documents');
  const [selectedDocumentId, setSelectedDocumentId] = useState<string>('');
  const [policyDrafts, setPolicyDrafts] = useState<PolicyLineDraft[]>([]);
  const [form] = Form.useForm<DocForm>();

  const canRead = hasPermission(PERM.APPROVAL_AD_READ);
  const canCreate = hasPermission(PERM.APPROVAL_AD_CREATE);
  const canUpdate = hasPermission(PERM.APPROVAL_AD_UPDATE);
  const canDelete = hasPermission(PERM.APPROVAL_AD_DELETE);

  const { data: documents = [], isFetching: docsLoading } = useQuery({
    queryKey: ['approval', 'documents', 'all'],
    queryFn: () => approvalApi.listDocuments(),
    enabled: canRead,
  });

  const { data: activeDocuments = [] } = useQuery({
    queryKey: ['approval', 'documents', 'active'],
    queryFn: () => approvalApi.listActiveDocuments(),
  });

  const { data: jobTitleRaw = [] } = useQuery({
    queryKey: ['organization', 'job-title', 'list'],
    queryFn: () => organizationApi.listJobTitles(),
    staleTime: 60_000,
  });

  const { data: orgTree = [] } = useQuery({
    queryKey: ['organization', 'list'],
    queryFn: () => organizationApi.list(),
    staleTime: 60_000,
  });

  const jobTitleOptions = useMemo(() => parseJobTitleOptions(jobTitleRaw), [jobTitleRaw]);
  const orgOptions = useMemo(() => {
    const flat = flattenOrganizationsWithMeta(orgTree);
    return flat.map((row) => ({
      value: row.id,
      label: `${'  '.repeat(row.depth)}${row.name}`,
    }));
  }, [orgTree]);

  const { data: policyLines = [], isFetching: policyLoading } = useQuery({
    queryKey: ['approval', 'policy-lines', selectedDocumentId],
    queryFn: () => approvalApi.getPolicyLines(selectedDocumentId),
    enabled: selectedDocumentId.length > 0,
  });

  const selectedDocument = useMemo(
    () => documents.find((doc) => doc.documentId === selectedDocumentId) ?? null,
    [documents, selectedDocumentId],
  );
  const isAutoApproveDocument = selectedDocument?.autoApproveYn === 'Y';

  useEffect(() => {
    if (!selectedDocumentId && documents.length > 0) {
      const firstDocument = documents[0];
      if (firstDocument) {
        setSelectedDocumentId(firstDocument.documentId);
      }
    }
  }, [documents, selectedDocumentId]);

  useEffect(() => {
    setPolicyDrafts(
      policyLines.map((line) => ({
        key: line.policyLineId || `${line.documentId}-${line.stepOrder}`,
        jobTitleId: line.jobTitleId,
        stepOrder: line.stepOrder,
        organizationId: line.organizationId,
      })),
    );
  }, [policyLines]);

  const refreshAll = async () => {
    await qc.invalidateQueries({ queryKey: ['approval'] });
  };

  const createDocumentM = useMutation({
    mutationFn: approvalApi.createDocument,
    onSuccess: async () => {
      message.success('양식을 생성했습니다.');
      setCreateOpen(false);
      form.resetFields();
      await refreshAll();
    },
    onError: (e: Error) => message.error(e.message || '양식 생성에 실패했습니다.'),
  });

  const activateM = useMutation({
    mutationFn: (documentId: string) => approvalApi.activateDocument(documentId),
    onSuccess: async () => {
      message.success('양식을 활성화했습니다.');
      await refreshAll();
    },
    onError: (e: Error) => message.error(e.message || '활성화에 실패했습니다.'),
  });

  const deactivateM = useMutation({
    mutationFn: (documentId: string) => approvalApi.deactivateDocument(documentId),
    onSuccess: async () => {
      message.success('양식을 비활성화했습니다.');
      await refreshAll();
    },
    onError: (e: Error) => message.error(e.message || '비활성화에 실패했습니다.'),
  });

  const autoApproveM = useMutation({
    mutationFn: ({ documentId, enabled }: { documentId: string; enabled: boolean }) =>
      enabled ? approvalApi.enableAutoApprove(documentId) : approvalApi.disableAutoApprove(documentId),
    onSuccess: async () => {
      message.success('자동승인 설정을 변경했습니다.');
      await refreshAll();
    },
    onError: (e: Error) => message.error(e.message || '자동승인 변경에 실패했습니다.'),
  });

  const savePolicyLineM = useMutation({
    mutationFn: approvalApi.savePolicyLines,
    onSuccess: async () => {
      message.success('정책라인을 저장했습니다.');
      await refreshAll();
    },
    onError: (e: Error) => message.error(e.message || '정책라인 저장에 실패했습니다.'),
  });

  const deletePolicyLineM = useMutation({
    mutationFn: (documentId: string) => approvalApi.deletePolicyLines(documentId),
    onSuccess: async () => {
      message.success('정책라인을 삭제했습니다.');
      await refreshAll();
      setPolicyDrafts([]);
    },
    onError: (e: Error) => message.error(e.message || '정책라인 삭제에 실패했습니다.'),
  });

  const handleOpenCreate = () => {
    setCreateOpen(true);
    form.setFieldsValue({
      documentName: '',
      requestType: 'GENERAL',
      autoApproveYn: 'N',
      formSchema: defaultSchemaText(),
    });
  };

  const handleSubmitCreate = async () => {
    try {
      const values = await form.validateFields();
      JSON.parse(values.formSchema);
      await createDocumentM.mutateAsync({
        documentName: values.documentName.trim(),
        requestType: values.requestType,
        formSchema: values.formSchema,
        autoApproveYn: values.autoApproveYn ?? 'N',
      });
    } catch (error) {
      if (error instanceof SyntaxError) {
        message.error('formSchema는 유효한 JSON 문자열이어야 합니다.');
      }
    }
  };

  const handleAddPolicyLine = () => {
    if (isAutoApproveDocument) {
      message.info('자동승인 양식은 정책라인 설정이 필요하지 않습니다.');
      return;
    }
    setPolicyDrafts((prev) => [
      ...prev,
      {
        key: `new-${Date.now()}-${Math.random()}`,
        jobTitleId: '',
        stepOrder: prev.length + 1,
        organizationId: null,
      },
    ]);
  };

  const handleSavePolicyLines = async () => {
    if (!selectedDocumentId) {
      message.warning('양식을 먼저 선택해 주세요.');
      return;
    }
    if (isAutoApproveDocument) {
      message.info('자동승인 양식은 정책라인 저장 대상이 아닙니다.');
      return;
    }
    const sorted = [...policyDrafts].sort((a, b) => a.stepOrder - b.stepOrder);
    const errorMessage = validatePolicyLines(sorted);
    if (errorMessage) {
      message.warning(errorMessage);
      return;
    }
    await savePolicyLineM.mutateAsync({
      documentId: selectedDocumentId,
      policyLines: sorted.map((row) => ({
        jobTitleId: row.jobTitleId,
        stepOrder: row.stepOrder,
        organizationId: row.organizationId,
      })),
    });
  };

  const handleDeletePolicyLines = async () => {
    if (!selectedDocumentId) return;
    if (isAutoApproveDocument) {
      message.info('자동승인 양식은 정책라인 삭제가 필요하지 않습니다.');
      return;
    }
    await deletePolicyLineM.mutateAsync(selectedDocumentId);
  };

  return (
    <Space direction="vertical" className="tw-w-full" size={16}>
      <div>
        <Typography.Title level={4} className="!tw-m-0 !tw-text-slate-900">
          결재 관리자
        </Typography.Title>
        <Typography.Paragraph type="secondary" className="!tw-mb-0 !tw-mt-1 !tw-text-sm">
          양식 옵션(활성/자동승인)과 결재 순서(직책/단계)를 설정합니다.
        </Typography.Paragraph>
      </div>

      <PermissionGuard
        required={PERM.APPROVAL_AD_READ}
        fallback={<Alert type="warning" showIcon message="결재 관리자 화면을 보려면 조회 권한이 필요합니다." />}
      >
        <Tabs
          activeKey={activeTab}
          onChange={(key) => setActiveTab(key as 'documents' | 'policy-lines')}
          items={[
            {
              key: 'documents',
              label: '결재 양식 관리',
              children: (
                <Card className="tw-border-slate-200/80 tw-shadow-sm">
                  <div className="tw-mb-4 tw-flex tw-flex-wrap tw-items-center tw-justify-between tw-gap-3">
                    <Typography.Text type="secondary" className="tw-text-sm">
                      전체 {documents.length}개 / 활성 {activeDocuments.length}개
                    </Typography.Text>
                    <Space wrap>
                      <Button icon={<ReloadOutlined />} onClick={() => void refreshAll()}>
                        새로고침
                      </Button>
                      {canCreate ? (
                        <Button type="primary" icon={<PlusOutlined />} onClick={handleOpenCreate}>
                          양식 추가
                        </Button>
                      ) : null}
                    </Space>
                  </div>
                  <Table
                    rowKey="documentId"
                    loading={docsLoading}
                    dataSource={documents}
                    pagination={false}
                    columns={[
                      {
                        title: '양식명',
                        dataIndex: 'documentName',
                        key: 'documentName',
                        render: (name: string, row) => (
                          <button
                            type="button"
                            className="tw-border-0 tw-bg-transparent tw-p-0 tw-font-medium tw-text-[#1e3a5f] hover:tw-underline"
                            onClick={() => {
                              setSelectedDocumentId(row.documentId);
                              setActiveTab('policy-lines');
                            }}
                          >
                            {name}
                          </button>
                        ),
                      },
                      {
                        title: '요청 유형',
                        dataIndex: 'requestType',
                        key: 'requestType',
                        width: 160,
                        render: (type: string) => REQUEST_TYPE_LABEL[type as ApprovalRequestType] ?? type,
                      },
                      {
                        title: '사용 상태',
                        dataIndex: 'isActiveYn',
                        key: 'isActiveYn',
                        width: 140,
                        render: (value: 'Y' | 'N', row) => (
                          <Button
                            size="small"
                            type={value === 'Y' ? 'primary' : 'default'}
                            ghost={value === 'Y'}
                            disabled={!canUpdate}
                            onClick={() =>
                              value === 'Y' ? deactivateM.mutate(row.documentId) : activateM.mutate(row.documentId)
                            }
                          >
                            {value === 'Y' ? '활성' : '비활성'}
                          </Button>
                        ),
                      },
                      {
                        title: '자동승인',
                        dataIndex: 'autoApproveYn',
                        key: 'autoApproveYn',
                        width: 140,
                        render: (value: 'Y' | 'N', row) => (
                          <Button
                            size="small"
                            type={value === 'Y' ? 'primary' : 'default'}
                            disabled={!canUpdate}
                            onClick={() =>
                              autoApproveM.mutate({
                                documentId: row.documentId,
                                enabled: value !== 'Y',
                              })
                            }
                          >
                            {value === 'Y' ? 'ON' : 'OFF'}
                          </Button>
                        ),
                      },
                      {
                        title: '정책라인',
                        key: 'actions',
                        width: 120,
                        render: (_, row) => (
                          <Space size="small" wrap>
                            <Button
                              type="link"
                              size="small"
                              icon={<EyeOutlined />}
                              onClick={() => {
                                setSelectedDocumentId(row.documentId);
                                setActiveTab('policy-lines');
                              }}
                            >
                              정책라인 확인
                            </Button>
                          </Space>
                        ),
                      },
                    ]}
                  />
                </Card>
              ),
            },
            {
              key: 'policy-lines',
              label: '정책라인 관리',
              children: (
                <Card className="tw-border-slate-200/80 tw-shadow-sm">
                  <Space direction="vertical" className="tw-w-full" size={12}>
                    <div className="tw-flex tw-flex-wrap tw-items-center tw-gap-2">
                      <Typography.Text className="tw-min-w-20">양식 선택</Typography.Text>
                      <Select
                        value={selectedDocumentId || undefined}
                        onChange={(v) => {
                          setSelectedDocumentId(v);
                        }}
                        placeholder="양식을 선택하세요"
                        style={{ minWidth: 320 }}
                        options={documents.map((doc) => ({
                          value: doc.documentId,
                          label: `${doc.documentName} (${REQUEST_TYPE_LABEL[doc.requestType as ApprovalRequestType] ?? doc.requestType})`,
                        }))}
                      />
                    </div>
                    <Typography.Text type="secondary" className="tw-text-sm">
                      관리자는 직책과 결재 순서만 설정합니다. 저장 시 기존 정책라인은 전체 교체됩니다.
                    </Typography.Text>
                    {selectedDocument ? (
                      <Card size="small" className="tw-bg-slate-50/60">
                        <Space wrap size={8}>
                          <Typography.Text strong>선택 양식: {selectedDocument.documentName}</Typography.Text>
                          <Tag color={selectedDocument.isActiveYn === 'Y' ? 'success' : 'default'}>
                            {selectedDocument.isActiveYn === 'Y' ? '활성' : '비활성'}
                          </Tag>
                          <Tag color={selectedDocument.autoApproveYn === 'Y' ? 'processing' : 'default'}>
                            자동승인 {selectedDocument.autoApproveYn === 'Y' ? 'ON' : 'OFF'}
                          </Tag>
                        </Space>
                      </Card>
                    ) : null}
                    {isAutoApproveDocument ? (
                      <Alert
                        showIcon
                        type="warning"
                        message="자동승인 양식은 정책라인 설정이 필요하지 않습니다."
                        description="후보 결재자 선택은 일반 사용자가 결재 요청을 올릴 때 진행됩니다."
                      />
                    ) : null}

                    <div className="tw-flex tw-flex-wrap tw-items-center tw-gap-2">
                      {canCreate ? (
                        <Button icon={<PlusOutlined />} onClick={handleAddPolicyLine} disabled={isAutoApproveDocument}>
                          라인 추가
                        </Button>
                      ) : null}
                      {canCreate ? (
                        <Button
                          type="primary"
                          icon={<SaveOutlined />}
                          loading={savePolicyLineM.isPending}
                          disabled={isAutoApproveDocument}
                          onClick={() => void handleSavePolicyLines()}
                        >
                          라인 저장
                        </Button>
                      ) : null}
                      {canDelete ? (
                        <Popconfirm
                          title="선택 양식의 정책라인을 전부 삭제할까요?"
                          okText="삭제"
                          cancelText="취소"
                          disabled={isAutoApproveDocument}
                          onConfirm={() => void handleDeletePolicyLines()}
                        >
                          <Button
                            danger
                            icon={<DeleteOutlined />}
                            loading={deletePolicyLineM.isPending}
                            disabled={isAutoApproveDocument}
                          >
                            전체 삭제
                          </Button>
                        </Popconfirm>
                      ) : null}
                    </div>

                    <Table<PolicyLineDraft>
                      rowKey="key"
                      loading={policyLoading}
                      dataSource={[...policyDrafts].sort((a, b) => a.stepOrder - b.stepOrder)}
                      pagination={false}
                      columns={[
                        {
                          title: '순서',
                          dataIndex: 'stepOrder',
                          key: 'stepOrder',
                          width: 110,
                          render: (value: number, row) => (
                            <InputNumber
                              min={1}
                              value={value}
                              disabled={isAutoApproveDocument}
                              onChange={(next) => {
                                setPolicyDrafts((prev) =>
                                  prev.map((item) =>
                                    item.key === row.key ? { ...item, stepOrder: Number(next) || 1 } : item,
                                  ),
                                );
                              }}
                            />
                          ),
                        },
                        {
                          title: '직책',
                          dataIndex: 'jobTitleId',
                          key: 'jobTitleId',
                          render: (value: string, row) => (
                            <Select
                              value={value || undefined}
                              style={{ minWidth: 220 }}
                              placeholder="직책 선택"
                              disabled={isAutoApproveDocument}
                              options={jobTitleOptions}
                              onChange={(next) =>
                                setPolicyDrafts((prev) =>
                                  prev.map((item) => (item.key === row.key ? { ...item, jobTitleId: next } : item)),
                                )
                              }
                            />
                          ),
                        },
                        {
                          title: '조직(선택)',
                          dataIndex: 'organizationId',
                          key: 'organizationId',
                          render: (value: string | null, row) => (
                            <Select
                              allowClear
                              value={value ?? undefined}
                              style={{ minWidth: 250 }}
                              placeholder="조직 제한 없음"
                              disabled={isAutoApproveDocument}
                              options={orgOptions}
                              onChange={(next) =>
                                setPolicyDrafts((prev) =>
                                  prev.map((item) =>
                                    item.key === row.key ? { ...item, organizationId: next ?? null } : item,
                                  ),
                                )
                              }
                            />
                          ),
                        },
                        {
                          title: '관리',
                          key: 'actions',
                          width: 90,
                          render: (_, row) => (
                            <Button
                              type="link"
                              danger
                              disabled={!canCreate || isAutoApproveDocument}
                              onClick={() => setPolicyDrafts((prev) => prev.filter((item) => item.key !== row.key))}
                            >
                              삭제
                            </Button>
                          ),
                        },
                      ]}
                      locale={{ emptyText: selectedDocumentId ? '정책라인이 없습니다.' : '양식을 먼저 선택하세요.' }}
                    />

                  </Space>
                </Card>
              ),
            },
          ]}
        />
      </PermissionGuard>

      <Modal
        title="결재 양식 추가"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={() => void handleSubmitCreate()}
        okText="등록"
        cancelText="취소"
        confirmLoading={createDocumentM.isPending}
        destroyOnHidden
        width={760}
      >
        <Form<DocForm> form={form} layout="vertical" className="tw-pt-2">
          <Form.Item name="documentName" label="양식명" rules={[{ required: true, message: '양식명을 입력해 주세요.' }]}>
            <Input placeholder="예: 연차신청서" maxLength={100} showCount />
          </Form.Item>
          <Form.Item name="requestType" label="요청 유형" rules={[{ required: true, message: '요청 유형을 선택해 주세요.' }]}>
            <Select
              options={APPROVAL_REQUEST_TYPES.map((type) => ({
                value: type,
                label: `${REQUEST_TYPE_LABEL[type]} (${type})`,
              }))}
            />
          </Form.Item>
          <Form.Item name="autoApproveYn" label="자동승인">
            <Select
              options={[
                { value: 'N', label: '비활성 (N)' },
                { value: 'Y', label: '활성 (Y)' },
              ]}
            />
          </Form.Item>
          <Form.Item
            name="formSchema"
            label="formSchema(JSON 문자열)"
            rules={[{ required: true, message: 'formSchema를 입력해 주세요.' }]}
            extra="지원 type: text, textarea, number, date, select"
          >
            <Input.TextArea rows={12} placeholder='{"fields":[...]}' />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
}
