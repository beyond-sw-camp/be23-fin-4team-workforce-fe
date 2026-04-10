import { DeleteOutlined, EyeOutlined, SendOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  App,
  Button,
  Card,
  Descriptions,
  Divider,
  Form,
  Input,
  Modal,
  Radio,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Tree,
  Typography,
} from 'antd';
import type { DataNode } from 'antd/es/tree';
import dayjs from 'dayjs';
import { useEffect, useMemo, useState } from 'react';
import { approvalApi, type ApprovalRequestType } from '@/features/approvals/api/approvalApi';
import {
  APPROVAL_REQUEST_STATUS,
  approvalRequestApi,
  type ApprovalRequestDetail,
  type ApprovalRequestStatus,
} from '@/features/approvals/api/approvalRequestApi';
import { memberApi } from '@/features/member/api/memberApi';
import { organizationApi, type OrgChartOrgNode } from '@/features/organization/api/organizationApi';
import { PERM } from '@/features/permissions/backend-permissions';
import { usePermissions } from '@/features/permissions/usePermissionsHook';
import { ApprovalsAdminPage } from '@/pages/app/ApprovalsAdminPage';

type FormFieldType = 'text' | 'textarea' | 'number' | 'date' | 'select';

type FormFieldSchema = {
  name: string;
  label: string;
  type: FormFieldType;
  options?: string[];
};

type FormSchema = {
  fields: FormFieldSchema[];
};

type ApprovalLineDraft = {
  id: string;
  stepOrder: number;
  approverMemberId: string;
  approverMemberPositionId: string;
  memberName: string;
  jobTitleName: string;
  organizationName: string;
  source: 'policy' | 'manual';
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

const REQUEST_STATUS_LABEL: Record<ApprovalRequestStatus, string> = {
  DRAFT: '임시저장',
  WAIT: '제출됨',
  PENDING: '결재 진행 중',
  APPROVED: '승인',
  REJECTED: '반려',
  CANCELED: '취소',
};

function formatDateTime(value?: string | null) {
  if (!value) return '—';
  const d = dayjs(value);
  return d.isValid() ? d.format('YYYY-MM-DD HH:mm') : value;
}

function parseFormSchema(raw: string): FormSchema {
  try {
    const parsed = JSON.parse(raw) as { fields?: unknown };
    const fields = Array.isArray(parsed.fields)
      ? parsed.fields
          .map((item): FormFieldSchema | null => {
            if (!item || typeof item !== 'object') return null;
            const o = item as Record<string, unknown>;
            const name = typeof o.name === 'string' ? o.name.trim() : '';
            const label = typeof o.label === 'string' ? o.label.trim() : '';
            const type = typeof o.type === 'string' ? (o.type as FormFieldType) : 'text';
            const options = Array.isArray(o.options)
              ? o.options.filter((v): v is string => typeof v === 'string').map((v) => v.trim())
              : undefined;
            if (!name || !label || !['text', 'textarea', 'number', 'date', 'select'].includes(type)) return null;
            return { name, label, type, ...(options?.length ? { options } : {}) };
          })
          .filter((f): f is FormFieldSchema => f != null)
      : [];
    return { fields };
  } catch {
    return { fields: [] };
  }
}

function statusTag(status: string) {
  const u = status.toUpperCase();
  if (u === 'APPROVED') return <Tag color="success">승인</Tag>;
  if (u === 'REJECTED') return <Tag color="error">반려</Tag>;
  if (u === 'CANCELED') return <Tag color="default">취소</Tag>;
  if (u === 'PENDING') return <Tag color="processing">결재중</Tag>;
  if (u === 'WAIT') return <Tag color="processing">제출됨</Tag>;
  return <Tag>{REQUEST_STATUS_LABEL[u as ApprovalRequestStatus] ?? status}</Tag>;
}

export function ApprovalsPage() {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const { hasPermission } = usePermissions();
  const [tab, setTab] = useState('compose');
  const [requestStatusFilter, setRequestStatusFilter] = useState<ApprovalRequestStatus | 'ALL'>('ALL');
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<ApprovalRequestDetail | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [approvalAction, setApprovalAction] = useState<{ approvalId: string; mode: 'approve' | 'reject' } | null>(null);
  const [approvalComment, setApprovalComment] = useState('');
  const [orgTreeSelectedKey, setOrgTreeSelectedKey] = useState<string>();
  const [approvalLineDrafts, setApprovalLineDrafts] = useState<ApprovalLineDraft[]>([]);
  const [lineInfoTab, setLineInfoTab] = useState<'approval' | 'cc' | 'circulation'>('approval');
  const [memberKeyword, setMemberKeyword] = useState('');
  const [form] = Form.useForm();

  const canAdmin = hasPermission(PERM.APPROVAL_AD_READ);

  const { data: activeDocuments = [], isFetching: docsLoading } = useQuery({
    queryKey: ['approval', 'documents', 'active'],
    queryFn: () => approvalApi.listActiveDocuments(),
  });

  const selectedDocumentId = Form.useWatch('documentId', form);
  const selectedDocument = useMemo(
    () => activeDocuments.find((d) => d.documentId === selectedDocumentId) ?? null,
    [activeDocuments, selectedDocumentId],
  );
  const selectedSchema = useMemo(
    () => (selectedDocument ? parseFormSchema(selectedDocument.formSchema) : { fields: [] }),
    [selectedDocument],
  );

  const { data: candidateLines = [] } = useQuery({
    queryKey: ['approval', 'policy-lines', 'candidates', selectedDocument?.documentId],
    queryFn: () => approvalApi.getPolicyLineCandidates(selectedDocument!.documentId),
    enabled: Boolean(selectedDocument?.documentId) && selectedDocument?.autoApproveYn !== 'Y',
  });

  const { data: orgChart } = useQuery({
    queryKey: ['organization', 'org-chart'],
    queryFn: () => organizationApi.getOrgChart(),
    staleTime: 60_000,
  });

  const { data: myRequests = [], isFetching: myLoading } = useQuery({
    queryKey: ['approval-user', 'my-requests', requestStatusFilter],
    queryFn: () =>
      requestStatusFilter === 'ALL'
        ? approvalRequestApi.listMyRequests()
        : approvalRequestApi.listMyRequests(requestStatusFilter),
  });

  const { data: pendingRequests = [], isFetching: pendingLoading } = useQuery({
    queryKey: ['approval-user', 'pending-approvals'],
    queryFn: () => approvalRequestApi.listPendingApprovals(),
  });

  const { data: actedRequests = [], isFetching: actedLoading } = useQuery({
    queryKey: ['approval-user', 'acted-approvals'],
    queryFn: () => approvalRequestApi.listActedApprovals(),
  });

  const { data: selectedRequestDetail, isFetching: detailLoading } = useQuery({
    queryKey: ['approval-user', 'request-detail', selectedRequestId],
    queryFn: () => approvalRequestApi.getRequest(selectedRequestId!),
    enabled: Boolean(selectedRequestId),
  });

  const refreshUserQueries = async () => {
    await qc.invalidateQueries({ queryKey: ['approval-user'] });
    await qc.invalidateQueries({ queryKey: ['approval', 'documents', 'active'] });
  };

  const createRequestM = useMutation({
    mutationFn: approvalRequestApi.createRequest,
    onSuccess: async (res) => {
      message.success(res.requestStatus === 'DRAFT' ? '임시저장되었습니다.' : '결재 요청이 제출되었습니다.');
      form.resetFields();
      setApprovalLineDrafts([]);
      await refreshUserQueries();
      setTab('my');
    },
    onError: (e: Error) => message.error(e.message || '결재 요청 처리에 실패했습니다.'),
  });

  const cancelRequestM = useMutation({
    mutationFn: ({ requestId, reason }: { requestId: string; reason: string }) =>
      approvalRequestApi.cancelRequest(requestId, reason),
    onSuccess: async () => {
      message.success('결재 요청을 취소했습니다.');
      setCancelTarget(null);
      setCancelReason('');
      await refreshUserQueries();
    },
    onError: (e: Error) => message.error(e.message || '취소에 실패했습니다.'),
  });

  const approveM = useMutation({
    mutationFn: ({ approvalId, comment }: { approvalId: string; comment?: string }) =>
      approvalRequestApi.approve(approvalId, comment),
    onSuccess: async () => {
      message.success('승인 처리했습니다.');
      setApprovalAction(null);
      setApprovalComment('');
      await refreshUserQueries();
    },
    onError: (e: Error) => message.error(e.message || '승인 처리에 실패했습니다.'),
  });

  const rejectM = useMutation({
    mutationFn: ({ approvalId, comment }: { approvalId: string; comment: string }) =>
      approvalRequestApi.reject(approvalId, comment),
    onSuccess: async () => {
      message.success('반려 처리했습니다.');
      setApprovalAction(null);
      setApprovalComment('');
      await refreshUserQueries();
    },
    onError: (e: Error) => message.error(e.message || '반려 처리에 실패했습니다.'),
  });

  const orgTreeData = useMemo<DataNode[]>(() => {
    const toTree = (node: OrgChartOrgNode): DataNode => ({
      key: node.organizationId,
      title: node.name,
      ...(node.children.length ? { children: node.children.map(toTree) } : {}),
    });
    return (orgChart?.organizations ?? []).map(toTree);
  }, [orgChart]);

  const orgMembersById = useMemo(() => {
    const map = new Map<string, Array<{ memberId: string; name: string; jobTitleName: string; organizationName: string }>>();
    const walk = (node: OrgChartOrgNode) => {
      const members = node.jobGrades.flatMap((g) =>
        g.members.map((m) => ({
          memberId: m.memberId,
          name: m.name,
          jobTitleName: m.jobTitleName,
          organizationName: node.name,
        })),
      );
      map.set(node.organizationId, members);
      node.children.forEach(walk);
    };
    (orgChart?.organizations ?? []).forEach(walk);
    return map;
  }, [orgChart]);

  const selectedOrgMembers = useMemo(() => {
    if (!orgTreeSelectedKey) return [];
    return orgMembersById.get(orgTreeSelectedKey) ?? [];
  }, [orgMembersById, orgTreeSelectedKey]);

  const filteredOrgMembers = useMemo(() => {
    const q = memberKeyword.trim().toLowerCase();
    if (!q) return selectedOrgMembers;
    return selectedOrgMembers.filter(
      (m) => `${m.name} ${m.jobTitleName} ${m.organizationName}`.toLowerCase().includes(q),
    );
  }, [memberKeyword, selectedOrgMembers]);

  useEffect(() => {
    if (!selectedDocument || selectedDocument.autoApproveYn === 'Y') {
      setApprovalLineDrafts([]);
      return;
    }
    const nextDrafts = [...candidateLines]
      .sort((a, b) => a.stepOrder - b.stepOrder)
      .map((line): ApprovalLineDraft | null => {
        const first = line.candidates[0];
        if (!first) return null;
        return {
          id: `policy-${line.policyLineId}`,
          stepOrder: line.stepOrder,
          approverMemberId: first.memberId,
          approverMemberPositionId: first.memberPositionId,
          memberName: first.memberName,
          jobTitleName: first.jobTitleName,
          organizationName: first.organizationName,
          source: 'policy',
        };
      });
    const normalized = nextDrafts.filter((v) => v != null) as ApprovalLineDraft[];
    setApprovalLineDrafts(normalized);
  }, [candidateLines, selectedDocument]);

  const syncStepOrder = (rows: ApprovalLineDraft[]) => rows.map((r, idx) => ({ ...r, stepOrder: idx + 1 }));

  const addApproverFromOrg = async (memberId: string) => {
    if (!selectedDocument || selectedDocument.autoApproveYn === 'Y') return;
    if (approvalLineDrafts.some((d) => d.approverMemberId === memberId)) {
      message.info('이미 결재선에 추가된 멤버입니다.');
      return;
    }
    try {
      const detail = await memberApi.detail(memberId);
      const positionId = detail.memberPositionId?.trim();
      if (!positionId) {
        message.warning('선택 멤버의 직위 정보를 찾을 수 없습니다.');
        return;
      }
      setApprovalLineDrafts((prev) =>
        syncStepOrder([
          ...prev,
          {
            id: `manual-${memberId}-${Date.now()}`,
            stepOrder: prev.length + 1,
            approverMemberId: memberId,
            approverMemberPositionId: positionId,
            memberName: detail.name || memberId,
            jobTitleName: detail.jobTitleName || '',
            organizationName: detail.organizationName || '',
            source: 'manual',
          },
        ]),
      );
    } catch (e) {
      message.error(e instanceof Error ? e.message : '멤버 정보를 불러오지 못했습니다.');
    }
  };

  const submitCompose = async (status: 'DRAFT' | 'WAIT') => {
    try {
      const values = await form.validateFields();
      if (!selectedDocument) {
        message.warning('양식을 선택해 주세요.');
        return;
      }

      const approvalLines =
        selectedDocument.autoApproveYn === 'Y'
          ? []
          : syncStepOrder([...approvalLineDrafts]).map((line) => ({
              stepOrder: line.stepOrder,
              approverMemberId: line.approverMemberId,
              approverMemberPositionId: line.approverMemberPositionId,
            }));

      if (status === 'WAIT' && selectedDocument.autoApproveYn !== 'Y') {
        if (!approvalLines.length) {
          message.warning('결재선을 1명 이상 지정해 주세요.');
          return;
        }
        const duplicate = new Set<string>();
        for (const line of approvalLines) {
          if (duplicate.has(line.approverMemberId)) {
            message.warning('결재자 중복은 허용되지 않습니다.');
            return;
          }
          duplicate.add(line.approverMemberId);
        }
        if (approvalLines.some((line, idx) => line.stepOrder !== idx + 1)) {
          message.warning('결재 순서는 1부터 연속이어야 합니다.');
          return;
        }
      }

      await createRequestM.mutateAsync({
        documentId: values.documentId,
        contentJson: JSON.stringify(values.content ?? {}),
        requestStatus: status,
        ...(approvalLines.length ? { approvalLines } : {}),
      });
    } catch {
      // form validation
    }
  };

  const myColumns = [
    {
      title: '양식',
      dataIndex: 'documentName',
      key: 'documentName',
    },
    {
      title: '상태',
      dataIndex: 'requestStatus',
      key: 'requestStatus',
      width: 140,
      render: (status: string) => statusTag(status),
    },
    {
      title: '요청일',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 180,
      render: (v: string) => formatDateTime(v),
    },
    {
      title: '관리',
      key: 'actions',
      width: 210,
      render: (_: unknown, row: ApprovalRequestDetail) => (
        <Space size="small">
          <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => setSelectedRequestId(row.requestId)}>
            상세
          </Button>
          {(row.requestStatus === 'DRAFT' || row.requestStatus === 'WAIT') && (
            <Button type="link" size="small" danger onClick={() => setCancelTarget(row)}>
              취소
            </Button>
          )}
        </Space>
      ),
    },
  ];

  const pendingColumns = [
    {
      title: '양식',
      dataIndex: 'documentName',
      key: 'documentName',
    },
    {
      title: '요청 상태',
      dataIndex: 'requestStatus',
      key: 'requestStatus',
      width: 130,
      render: (status: string) => statusTag(status),
    },
    {
      title: '내 결재선',
      key: 'myLine',
      width: 150,
      render: (_: unknown, row: ApprovalRequestDetail) => {
        const myLine = row.approvalLines.find((l) => String(l.approvalStatus).toUpperCase() === 'PENDING');
        if (!myLine) return '—';
        return `${myLine.stepOrder}단계`;
      },
    },
    {
      title: '관리',
      key: 'actions',
      width: 240,
      render: (_: unknown, row: ApprovalRequestDetail) => {
        const myLine = row.approvalLines.find((l) => String(l.approvalStatus).toUpperCase() === 'PENDING');
        return (
          <Space size="small">
            <Button type="link" size="small" onClick={() => setSelectedRequestId(row.requestId)}>
              상세
            </Button>
            <Button
              type="link"
              size="small"
              disabled={!myLine}
              onClick={() => myLine && setApprovalAction({ approvalId: myLine.approvalId, mode: 'approve' })}
            >
              승인
            </Button>
            <Button
              type="link"
              size="small"
              danger
              disabled={!myLine}
              onClick={() => myLine && setApprovalAction({ approvalId: myLine.approvalId, mode: 'reject' })}
            >
              반려
            </Button>
          </Space>
        );
      },
    },
  ];

  return (
    <Space direction="vertical" size={16} className="tw-w-full">
      <div>
        <Typography.Title level={4} className="!tw-m-0 !tw-text-slate-900">
          전자결재
        </Typography.Title>
        <Typography.Paragraph type="secondary" className="!tw-mb-0 !tw-mt-1 !tw-text-sm">
          결재 요청 작성, 내 결재 이력 조회, 결재 처리(승인/반려)를 수행합니다.
        </Typography.Paragraph>
      </div>

      <Tabs
        activeKey={tab}
        onChange={setTab}
        items={[
          {
            key: 'compose',
            label: '결재 요청 작성',
            children: (
              <Card className="tw-border-slate-200/80 tw-shadow-sm">
                <Form
                  form={form}
                  layout="vertical"
                  initialValues={{ content: {} }}
                  onValuesChange={(changed) => {
                    if ('documentId' in changed) {
                      setApprovalLineDrafts([]);
                      setOrgTreeSelectedKey(undefined);
                      form.setFieldValue('content', {});
                    }
                  }}
                >
                  <Form.Item name="documentId" label="양식 선택" rules={[{ required: true, message: '양식을 선택해 주세요.' }]}>
                    <Select
                      loading={docsLoading}
                      options={activeDocuments.map((doc) => ({
                        value: doc.documentId,
                        label: `${doc.documentName} (${REQUEST_TYPE_LABEL[doc.requestType as ApprovalRequestType] ?? doc.requestType})`,
                      }))}
                      placeholder="활성 양식을 선택하세요"
                    />
                  </Form.Item>

                  {selectedDocument ? (
                    <Card size="small" className="tw-mb-4 tw-bg-slate-50/60">
                      <Space wrap size={8}>
                        <Typography.Text strong>{selectedDocument.documentName}</Typography.Text>
                        <Tag color={selectedDocument.autoApproveYn === 'Y' ? 'processing' : 'default'}>
                          자동승인 {selectedDocument.autoApproveYn === 'Y' ? 'ON' : 'OFF'}
                        </Tag>
                      </Space>
                    </Card>
                  ) : null}

                  {selectedDocument && selectedSchema.fields.length === 0 ? (
                    <Alert type="warning" showIcon message="양식 스키마(formSchema)를 해석할 수 없습니다." />
                  ) : null}

                  {selectedSchema.fields.map((field) => {
                    const namePath: (string | number)[] = ['content', field.name];
                    if (field.type === 'textarea') {
                      return (
                        <Form.Item key={field.name} name={namePath} label={field.label} rules={[{ required: true, message: `${field.label} 입력` }]}>
                          <Input.TextArea rows={3} />
                        </Form.Item>
                      );
                    }
                    if (field.type === 'number') {
                      return (
                        <Form.Item key={field.name} name={namePath} label={field.label} rules={[{ required: true, message: `${field.label} 입력` }]}>
                          <Input type="number" />
                        </Form.Item>
                      );
                    }
                    if (field.type === 'date') {
                      return (
                        <Form.Item key={field.name} name={namePath} label={field.label} rules={[{ required: true, message: `${field.label} 입력` }]}>
                          <Input type="date" />
                        </Form.Item>
                      );
                    }
                    if (field.type === 'select') {
                      return (
                        <Form.Item key={field.name} name={namePath} label={field.label} rules={[{ required: true, message: `${field.label} 선택` }]}>
                          <Select options={(field.options ?? []).map((opt) => ({ value: opt, label: opt }))} />
                        </Form.Item>
                      );
                    }
                    return (
                      <Form.Item key={field.name} name={namePath} label={field.label} rules={[{ required: true, message: `${field.label} 입력` }]}>
                        <Input />
                      </Form.Item>
                    );
                  })}

                  {selectedDocument?.autoApproveYn === 'Y' ? (
                    <Alert type="info" showIcon message="자동승인 양식입니다. 결재자 선택 없이 제출 즉시 승인 처리됩니다." />
                  ) : selectedDocument ? (
                    <Card size="small" title="결재 정보" className="tw-mb-4">
                      <Tabs
                        size="small"
                        activeKey={lineInfoTab}
                        onChange={(k) => setLineInfoTab(k as 'approval' | 'cc' | 'circulation')}
                        items={[
                          { key: 'approval', label: '결재선' },
                          { key: 'cc', label: '참조자' },
                          { key: 'circulation', label: '열람자' },
                        ]}
                      />
                      {lineInfoTab !== 'approval' ? (
                        <Alert
                          showIcon
                          type="info"
                          className="tw-mb-3"
                          message={lineInfoTab === 'cc' ? '참조자 설정' : '열람자 설정'}
                          description="이 단계는 다음 작업에서 연결 예정입니다. 현재는 결재선 편집 후 제출할 수 있습니다."
                        />
                      ) : null}
                      <Typography.Paragraph type="secondary" className="!tw-mb-3 !tw-text-sm">
                        정책라인 결재선을 기본으로 불러왔습니다. 조직도에서 멤버를 추가하고 우측에서 순서를 조정하세요.
                      </Typography.Paragraph>
                      <div className="tw-grid tw-grid-cols-1 tw-gap-4 lg:tw-grid-cols-[320px_minmax(0,1fr)]">
                        <Card size="small" title="조직도">
                          <Input
                            value={memberKeyword}
                            onChange={(e) => setMemberKeyword(e.target.value)}
                            placeholder="이름, 직위, 부서 검색"
                            className="tw-mb-2"
                          />
                          <Tree
                            treeData={orgTreeData}
                            selectedKeys={orgTreeSelectedKey ? [orgTreeSelectedKey] : []}
                            onSelect={(keys) => setOrgTreeSelectedKey(typeof keys[0] === 'string' ? keys[0] : undefined)}
                            defaultExpandAll
                          />
                          <Divider className="!tw-my-3" />
                          <Typography.Text type="secondary" className="tw-mb-2 tw-block tw-text-xs">
                            조직 멤버 선택
                          </Typography.Text>
                          <Space direction="vertical" className="tw-w-full" size={6}>
                            {filteredOrgMembers.length ? (
                              filteredOrgMembers.map((m) => (
                                <div
                                  key={m.memberId}
                                  className="tw-flex tw-items-center tw-justify-between tw-rounded-md tw-border tw-border-slate-200 tw-px-2 tw-py-1.5"
                                >
                                  <span className="tw-truncate tw-pr-2 tw-text-sm">
                                    {m.name} {m.jobTitleName ? `(${m.jobTitleName})` : ''}
                                  </span>
                                  <Button size="small" onClick={() => void addApproverFromOrg(m.memberId)}>
                                    추가
                                  </Button>
                                </div>
                              ))
                            ) : (
                              <Typography.Text type="secondary" className="tw-text-xs">
                                조직을 선택하면 멤버 목록이 표시됩니다.
                              </Typography.Text>
                            )}
                          </Space>
                        </Card>
                        <Card size="small" title="내 결재선">
                          <Table<ApprovalLineDraft>
                            rowKey="id"
                            size="small"
                            pagination={false}
                            dataSource={syncStepOrder([...approvalLineDrafts])}
                            locale={{ emptyText: '결재선이 없습니다.' }}
                            columns={[
                              {
                                title: '타입',
                                key: 'type',
                                width: 90,
                                render: () => <Tag color="blue">결재</Tag>,
                              },
                              { title: '순서', dataIndex: 'stepOrder', key: 'stepOrder', width: 70 },
                              {
                                title: '이름',
                                key: 'approver',
                                render: (_, row) => (
                                  <span>
                                    {row.memberName} {row.jobTitleName ? `(${row.jobTitleName})` : ''}
                                  </span>
                                ),
                              },
                              {
                                title: '부서',
                                dataIndex: 'organizationName',
                                key: 'organizationName',
                                width: 140,
                                render: (v: string) => v || '—',
                              },
                              {
                                title: '상태',
                                key: 'state',
                                width: 90,
                                render: () => <Tag>예정</Tag>,
                              },
                              {
                                title: '관리',
                                key: 'actions',
                                width: 180,
                                render: (_, row, idx) => (
                                  <Space size={4}>
                                    <Button
                                      size="small"
                                      disabled={idx === 0}
                                      onClick={() =>
                                        setApprovalLineDrafts((prev) => {
                                          const list = [...prev];
                                          const t = list[idx - 1];
                                          const cur = list[idx];
                                          if (!cur || !t) return prev;
                                          list[idx - 1] = cur;
                                          list[idx] = t;
                                          return syncStepOrder(list);
                                        })
                                      }
                                    >
                                      ↑
                                    </Button>
                                    <Button
                                      size="small"
                                      disabled={idx === approvalLineDrafts.length - 1}
                                      onClick={() =>
                                        setApprovalLineDrafts((prev) => {
                                          const list = [...prev];
                                          const t = list[idx + 1];
                                          const cur = list[idx];
                                          if (!cur || !t) return prev;
                                          list[idx + 1] = cur;
                                          list[idx] = t;
                                          return syncStepOrder(list);
                                        })
                                      }
                                    >
                                      ↓
                                    </Button>
                                    <Button
                                      type="text"
                                      size="small"
                                      danger
                                      icon={<DeleteOutlined />}
                                      onClick={() =>
                                        setApprovalLineDrafts((prev) =>
                                          syncStepOrder(prev.filter((item) => item.id !== row.id)),
                                        )
                                      }
                                    >
                                    </Button>
                                  </Space>
                                ),
                              },
                            ]}
                          />
                          <div className="tw-mt-3 tw-flex tw-items-center tw-justify-end tw-gap-3 tw-border-t tw-border-slate-100 tw-pt-2">
                            <Typography.Text className="tw-text-xs tw-text-slate-500">합의방식</Typography.Text>
                            <Radio.Group value="SEQUENTIAL" options={[{ value: 'SEQUENTIAL', label: '순차합의' }]} />
                          </div>
                        </Card>
                      </div>
                    </Card>
                  ) : null}

                  <Space wrap>
                    <Button onClick={() => void submitCompose('DRAFT')}>임시저장</Button>
                    <Button type="primary" icon={<SendOutlined />} onClick={() => void submitCompose('WAIT')}>
                      제출
                    </Button>
                  </Space>
                </Form>
              </Card>
            ),
          },
          {
            key: 'my',
            label: '내 결재함',
            children: (
              <Card className="tw-border-slate-200/80 tw-shadow-sm">
                <div className="tw-mb-3 tw-flex tw-flex-wrap tw-items-center tw-justify-between tw-gap-2">
                  <Select<ApprovalRequestStatus | 'ALL'>
                    value={requestStatusFilter}
                    onChange={(v) => setRequestStatusFilter(v)}
                    style={{ width: 220 }}
                    options={[
                      { value: 'ALL', label: '전체 상태' },
                      ...APPROVAL_REQUEST_STATUS.map((v) => ({ value: v, label: REQUEST_STATUS_LABEL[v] })),
                    ]}
                  />
                </div>
                <Table<ApprovalRequestDetail>
                  rowKey="requestId"
                  loading={myLoading}
                  columns={myColumns}
                  dataSource={myRequests}
                  pagination={{ pageSize: 10 }}
                />
              </Card>
            ),
          },
          {
            key: 'pending',
            label: '결재 대기함',
            children: (
              <Card className="tw-border-slate-200/80 tw-shadow-sm">
                <Table<ApprovalRequestDetail>
                  rowKey="requestId"
                  loading={pendingLoading}
                  columns={pendingColumns}
                  dataSource={pendingRequests}
                  pagination={{ pageSize: 10 }}
                />
              </Card>
            ),
          },
          {
            key: 'acted',
            label: '결재 완료함',
            children: (
              <Card className="tw-border-slate-200/80 tw-shadow-sm">
                <Table<ApprovalRequestDetail>
                  rowKey="requestId"
                  loading={actedLoading}
                  columns={[
                    { title: '양식', dataIndex: 'documentName', key: 'documentName' },
                    {
                      title: '요청 상태',
                      dataIndex: 'requestStatus',
                      key: 'requestStatus',
                      width: 130,
                      render: (status: string) => statusTag(status),
                    },
                    {
                      title: '최종 수정일',
                      dataIndex: 'updatedAt',
                      key: 'updatedAt',
                      width: 180,
                      render: (v: string) => formatDateTime(v),
                    },
                    {
                      title: '상세',
                      key: 'actions',
                      width: 100,
                      render: (_, row) => (
                        <Button type="link" size="small" onClick={() => setSelectedRequestId(row.requestId)}>
                          보기
                        </Button>
                      ),
                    },
                  ]}
                  dataSource={actedRequests}
                  pagination={{ pageSize: 10 }}
                />
              </Card>
            ),
          },
          ...(canAdmin
            ? [
                {
                  key: 'admin',
                  label: '관리자 설정',
                  children: <ApprovalsAdminPage />,
                },
              ]
            : []),
        ]}
      />

      <Modal
        title="결재 상세"
        open={selectedRequestId != null}
        onCancel={() => setSelectedRequestId(null)}
        footer={null}
        width={860}
      >
        {detailLoading || !selectedRequestDetail ? (
          <Typography.Text type="secondary">불러오는 중...</Typography.Text>
        ) : (
          <Space direction="vertical" size={12} className="tw-w-full">
            <Descriptions size="small" bordered column={2}>
              <Descriptions.Item label="양식">{selectedRequestDetail.documentName}</Descriptions.Item>
              <Descriptions.Item label="상태">{statusTag(selectedRequestDetail.requestStatus)}</Descriptions.Item>
              <Descriptions.Item label="요청일">{formatDateTime(selectedRequestDetail.createdAt)}</Descriptions.Item>
              <Descriptions.Item label="수정일">{formatDateTime(selectedRequestDetail.updatedAt)}</Descriptions.Item>
            </Descriptions>
            <Card size="small" title="내용">
              <pre className="tw-m-0 tw-whitespace-pre-wrap tw-break-words">
                {selectedRequestDetail.contentJson || '{}'}
              </pre>
            </Card>
            <Card size="small" title="결재라인">
              <Table
                size="small"
                rowKey="approvalId"
                pagination={false}
                dataSource={[...selectedRequestDetail.approvalLines].sort((a, b) => a.stepOrder - b.stepOrder)}
                columns={[
                  { title: '순서', dataIndex: 'stepOrder', key: 'stepOrder', width: 80 },
                  {
                    title: '상태',
                    dataIndex: 'approvalStatus',
                    key: 'approvalStatus',
                    width: 130,
                    render: (v: string) => <Tag>{v}</Tag>,
                  },
                  {
                    title: '의견',
                    dataIndex: 'comment',
                    key: 'comment',
                    render: (v: string | null) => v || '—',
                  },
                  {
                    title: '처리일',
                    dataIndex: 'actedAt',
                    key: 'actedAt',
                    width: 180,
                    render: (v: string | null) => formatDateTime(v),
                  },
                ]}
              />
            </Card>
          </Space>
        )}
      </Modal>

      <Modal
        title="결재 취소"
        open={cancelTarget != null}
        onCancel={() => {
          setCancelTarget(null);
          setCancelReason('');
        }}
        onOk={() => {
          if (!cancelTarget) return;
          if (!cancelReason.trim()) {
            message.warning('취소 사유를 입력해 주세요.');
            return;
          }
          void cancelRequestM.mutateAsync({ requestId: cancelTarget.requestId, reason: cancelReason.trim() });
        }}
        okText="취소 확정"
        cancelText="닫기"
        confirmLoading={cancelRequestM.isPending}
      >
        <Input.TextArea
          rows={4}
          value={cancelReason}
          onChange={(e) => setCancelReason(e.target.value)}
          placeholder="취소 사유를 입력하세요."
        />
      </Modal>

      <Modal
        title={approvalAction?.mode === 'approve' ? '승인 처리' : '반려 처리'}
        open={approvalAction != null}
        onCancel={() => {
          setApprovalAction(null);
          setApprovalComment('');
        }}
        onOk={() => {
          if (!approvalAction) return;
          if (approvalAction.mode === 'approve') {
            void approveM.mutateAsync({ approvalId: approvalAction.approvalId, comment: approvalComment.trim() || undefined });
            return;
          }
          if (!approvalComment.trim()) {
            message.warning('반려 사유를 입력해 주세요.');
            return;
          }
          void rejectM.mutateAsync({ approvalId: approvalAction.approvalId, comment: approvalComment.trim() });
        }}
        okText={approvalAction?.mode === 'approve' ? '승인' : '반려'}
        cancelText="닫기"
        confirmLoading={approveM.isPending || rejectM.isPending}
      >
        <Input.TextArea
          rows={4}
          value={approvalComment}
          onChange={(e) => setApprovalComment(e.target.value)}
          placeholder={approvalAction?.mode === 'approve' ? '승인 의견(선택)' : '반려 사유(필수)'}
        />
      </Modal>
    </Space>
  );
}
