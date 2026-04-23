import { useMemo, useState, type Key } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { App, Button, Card, Dropdown, Form, Input, InputNumber, Modal, Popconfirm, Progress, Radio, Select, Space, Spin, Steps, Table, Tag, Tree, Typography, Upload } from 'antd';
import type { DataNode } from 'antd/es/tree';
import type { UploadProps } from 'antd';
import type { UploadFile } from 'antd/es/upload/interface';
import { DeleteOutlined, EditOutlined, InboxOutlined, RightOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { APP_POST_LOGIN_PATH } from '@/app/config/paths';
import { memberApi } from '@/features/member/api/memberApi';
import { aiApi } from '@/features/ai/api/aiApi';
import { evaluationApi } from '@/features/evaluation/api/evaluationApi';
import { esgApi } from '@/features/esg/api/esgApi';
import { organizationApi } from '@/features/organization/api/organizationApi';
import { OrganizationRolesSection } from '@/features/organization/ui/OrganizationRolesSection';
import type { OrganizationTreeNode } from '@/features/organization/api/organizationApi';
import { AppButton } from '@/shared/ui/AppButton';
import { ApprovalsAdminPage } from '@/pages/app/ApprovalsAdminPage';
import { AdminCompanyHolidaysPage } from '@/pages/app/salary-service/admin/AdminCompanyHolidaysPage';
import { AdminSalarySettingsPage } from '@/pages/app/salary-service/admin/AdminSalarySettingsPage';
import { AdminWorkSchedulesPage } from '@/pages/app/salary-service/admin/AdminWorkSchedulesPage';
import { AdminOvertimePoliciesPage } from '@/pages/app/salary-service/admin/AdminOvertimePoliciesPage';
import { AdminLeavePoliciesPage } from '@/pages/app/salary-service/admin/AdminLeavePoliciesPage';

type StepStatus = 'pending' | 'completed' | 'skipped';

type OnboardingStep = {
  title: string;
  apis: string[];
};

const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    title: '조직 설정',
    apis: ['POST /organization/create'],
  },
  {
    title: '직급/직책 설정',
    apis: ['POST /organization/job-grade/create', 'POST /organization/job-title/create'],
  },
  {
    title: '역할/권한 설정',
    apis: ['POST /member/role/create'],
  },
  {
    title: '근무/급여 정책',
    apis: [
      'POST /salary/taxRate',
      'POST /salary/salary-item-templates',
      'POST /salary/salary-policies',
      'POST /work-schedules',
      'POST /attendance/overtime-policies',
      'POST /leave-policies',
    ],
  },
  {
    title: '공휴일 설정',
    apis: ['GET /company-holidays', 'POST /company-holidays', 'PATCH /company-holidays/{id}', 'DELETE /company-holidays/{id}'],
  },
  {
    title: '전자결재 양식',
    apis: ['POST /approval/documents'],
  },
  {
    title: 'ESG 그린장터',
    apis: ['PUT /esg/config', 'POST /esg/subjects', 'POST /esg/shop/items'],
  },
  {
    title: 'HR 정책 문서 업로드',
    apis: ['POST /ai/documents/upload'],
  },
  {
    title: '평가 정책 설정',
    apis: ['POST /evaluation/evaluation-designs'],
  },
];

const INITIAL_STEP_STATUS: StepStatus[] = ONBOARDING_STEPS.map(() => 'pending');
const HR_DOC_MAX_BYTES = 10 * 1024 * 1024;
const HR_DOC_ACCEPT_EXT = /\.(pdf|docx|txt)$/i;

function validateHrDocFile(file: File): string | null {
  if (!HR_DOC_ACCEPT_EXT.test(file.name)) {
    return '지원 형식은 pdf, docx, txt 입니다.';
  }
  if (file.size > HR_DOC_MAX_BYTES) {
    return '파일 크기는 10MB 이하여야 합니다.';
  }
  return null;
}

function pickOrgId(node: OrganizationTreeNode): string {
  const raw =
    node.id ?? node.organizationId ?? node.organization_id ?? node.uuid ?? node.organizationUuid ?? node.organization_uuid;
  if (typeof raw === 'string' && raw) return raw;
  if (typeof raw === 'number') return String(raw);
  return '';
}

function pickOrgName(node: OrganizationTreeNode): string {
  return typeof node.name === 'string' ? node.name : '';
}

function pickParentId(node: OrganizationTreeNode): string | null {
  const p = node.parentId ?? node.parent_id;
  if (p === null || p === undefined || p === '') return null;
  return typeof p === 'string' ? p : String(p);
}

function toTreeNodes(nodes: OrganizationTreeNode[]): DataNode[] {
  if (!nodes.length) return [];
  const nested = nodes.some((n) => Array.isArray(n.children) && (n.children as unknown[]).length > 0);
  if (nested) {
    const mapOne = (n: OrganizationTreeNode, index: number): DataNode => {
      const id = pickOrgId(n);
      const ch = n.children as OrganizationTreeNode[] | undefined;
      return {
        key: id || `org-nested-${index}`,
        title: pickOrgName(n) || '(이름 없음)',
        children: Array.isArray(ch) ? ch.map((c, i) => mapOne(c, i)) : undefined,
      };
    };
    return nodes.map((n, i) => mapOne(n, i));
  }

  const byId = new Map<string, DataNode & { parentId: string | null }>();
  nodes.forEach((n) => {
    const id = pickOrgId(n);
    if (!id) return;
    byId.set(id, {
      key: id,
      title: pickOrgName(n) || '(이름 없음)',
      children: [],
      parentId: pickParentId(n),
    });
  });
  const roots: DataNode[] = [];
  byId.forEach((node) => {
    const p = node.parentId;
    if (p && byId.has(p)) {
      const parent = byId.get(p)!;
      if (!parent.children) parent.children = [];
      (parent.children as DataNode[]).push(node);
    } else {
      roots.push(node);
    }
  });
  return roots;
}

function stepTag(status: StepStatus) {
  if (status === 'completed') return <Tag color="success">완료</Tag>;
  if (status === 'skipped') return <Tag>스킵</Tag>;
  return <Tag>진행 전</Tag>;
}

function asPretty(value: unknown) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value ?? '');
  }
}

function JsonPreviewCard({ title, rows }: { title: string; rows: unknown[] }) {
  return (
    <Card size="small" title={title}>
      <pre className="tw-m-0 tw-max-h-56 tw-overflow-auto tw-text-xs">{asPretty(rows)}</pre>
    </Card>
  );
}

export default function OnboardingStepperPage() {
  const { message, modal } = App.useApp();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [current, setCurrent] = useState(0);
  const [statuses, setStatuses] = useState<StepStatus[]>(INITIAL_STEP_STATUS);
  const [onboardingEsgEnabledYn, setOnboardingEsgEnabledYn] = useState<'YES' | 'NO'>('NO');
  const [esgApiActivated, setEsgApiActivated] = useState(false);
  const [selectedOrgKeys, setSelectedOrgKeys] = useState<Key[]>([]);
  const [orgModal, setOrgModal] = useState<null | { mode: 'create'; parentId: string | null } | { mode: 'edit'; id: string; name: string }>(null);
  const [gradeModalOpen, setGradeModalOpen] = useState(false);
  const [titleModalOpen, setTitleModalOpen] = useState(false);
  const [orgForm] = Form.useForm<{ name: string }>();
  const [gradeForm] = Form.useForm<{ name: string; displayOrder: number }>();
  const [titleForm] = Form.useForm<{ name: string; displayOrder: number }>();
  const orgPrimaryBtnClass =
    '!tw-h-10 !tw-min-h-10 !tw-rounded-xl !tw-border-0 !tw-bg-[#1e3a5f] !tw-text-white !tw-font-semibold !tw-shadow-none hover:!tw-bg-[#152a45] hover:!tw-text-white disabled:!tw-opacity-60';

  const doneCount = useMemo(() => statuses.filter((s) => s === 'completed' || s === 'skipped').length, [statuses]);
  const progressPercent = Math.round((doneCount / ONBOARDING_STEPS.length) * 100);

  const finishMutation = useMutation({
    mutationFn: () => memberApi.completeOnboarding(),
    onSuccess: () => {
      message.success('온보딩 완료 처리되었습니다.');
      void navigate({ to: APP_POST_LOGIN_PATH, replace: true });
    },
    onError: (error: Error) => {
      message.error(error.message || '온보딩 완료 처리에 실패했습니다.');
    },
  });

  const currentStep = ONBOARDING_STEPS[current];
  if (!currentStep) {
    return null;
  }
  const isLast = current === ONBOARDING_STEPS.length - 1;

  const markCurrent = (status: StepStatus) => {
    setStatuses((prev) => prev.map((v, idx) => (idx === current ? status : v)));
  };

  const gotoNext = () => {
    markCurrent('completed');
    setCurrent((prev) => Math.min(prev + 1, ONBOARDING_STEPS.length - 1));
  };

  const gotoPrev = () => {
    setCurrent((prev) => Math.max(prev - 1, 0));
  };

  const orgQuery = useQuery({
    queryKey: ['onboarding', 'organizations'],
    queryFn: () => organizationApi.list(),
    enabled: current === 0,
  });
  const orgCreate = useMutation({
    mutationFn: organizationApi.create,
    onSuccess: () => {
      message.success('조직이 생성되었습니다.');
      void queryClient.invalidateQueries({ queryKey: ['onboarding', 'organizations'] });
    },
  });
  const orgUpdate = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => organizationApi.update(id, { name }),
    onSuccess: () => {
      message.success('조직명이 수정되었습니다.');
      void queryClient.invalidateQueries({ queryKey: ['onboarding', 'organizations'] });
    },
    onError: (error: Error) => {
      message.error(error.message || '조직 수정에 실패했습니다.');
    },
  });
  const orgDelete = useMutation({
    mutationFn: (organizationId: string) => organizationApi.remove(organizationId),
    onSuccess: () => {
      message.success('조직이 삭제되었습니다.');
      setSelectedOrgKeys([]);
      void queryClient.invalidateQueries({ queryKey: ['onboarding', 'organizations'] });
    },
    onError: (error: Error) => {
      message.error(error.message || '조직 삭제에 실패했습니다.');
    },
  });
  const treeData = useMemo(() => toTreeNodes(orgQuery.data ?? []), [orgQuery.data]);
  const selectedOrgId = selectedOrgKeys[0] != null ? String(selectedOrgKeys[0]) : '';

  const gradeQuery = useQuery({
    queryKey: ['onboarding', 'job-grades'],
    queryFn: () => organizationApi.listJobGrades(),
    enabled: current === 1,
  });
  const gradeCreate = useMutation({
    mutationFn: organizationApi.createJobGrade,
    onSuccess: () => {
      message.success('직급이 생성되었습니다.');
      void queryClient.invalidateQueries({ queryKey: ['onboarding', 'job-grades'] });
    },
  });

  const titleQuery = useQuery({
    queryKey: ['onboarding', 'job-titles'],
    queryFn: () => organizationApi.listJobTitles(),
    enabled: current === 1,
  });
  const titleCreate = useMutation({
    mutationFn: organizationApi.createJobTitle,
    onSuccess: () => {
      message.success('직책이 생성되었습니다.');
      void queryClient.invalidateQueries({ queryKey: ['onboarding', 'job-titles'] });
    },
  });

  const esgConfigQuery = useQuery({
    queryKey: ['onboarding', 'esg-config'],
    queryFn: () => esgApi.getConfig(),
    enabled: current === 6 && esgApiActivated,
  });
  const esgConfigUpdate = useMutation({
    mutationFn: esgApi.updateConfig,
    onSuccess: () => {
      setEsgApiActivated(true);
      message.success('ESG 설정이 저장되었습니다.');
      void queryClient.invalidateQueries({ queryKey: ['onboarding', 'esg-config'] });
    },
  });

  const hrDocQuery = useQuery({
    queryKey: ['onboarding', 'ai-documents'],
    queryFn: () => aiApi.listDocuments(),
    enabled: current === 7,
  });
  const hrDocUpload = useMutation({
    mutationFn: aiApi.uploadDocument,
    onSuccess: () => {
      message.success('HR 정책 문서가 업로드되었습니다.');
      void queryClient.invalidateQueries({ queryKey: ['onboarding', 'ai-documents'] });
    },
  });
  const hrDocDelete = useMutation({
    mutationFn: (id: string) => aiApi.deleteDocument(id),
    onSuccess: () => {
      message.success('문서가 삭제되었습니다.');
      void queryClient.invalidateQueries({ queryKey: ['onboarding', 'ai-documents'] });
    },
    onError: (e: Error) => {
      message.error(e.message || '삭제에 실패했습니다.');
    },
  });

  const hrDocUploadProps: UploadProps = {
    name: 'file',
    multiple: false,
    showUploadList: false,
    disabled: hrDocUpload.isPending,
    beforeUpload: (file) => {
      const err = validateHrDocFile(file as File);
      if (err) {
        message.warning(err);
        return false;
      }
      hrDocUpload.mutate(file as File);
      return false;
    },
  };

  const evalDesignQuery = useQuery({
    queryKey: ['onboarding', 'evaluation-designs'],
    queryFn: () => evaluationApi.listDesigns(),
    enabled: current === 8,
  });
  const evalDesignCreate = useMutation({
    mutationFn: evaluationApi.createDesign,
    onSuccess: () => {
      message.success('평가 정책(디자인)이 생성되었습니다.');
      void queryClient.invalidateQueries({ queryKey: ['onboarding', 'evaluation-designs'] });
    },
  });

  const renderStepContent = () => {
    if (current === 0) {
      return (
        <Space direction="vertical" className="tw-w-full">
          <Space>
            <Button
              className={orgPrimaryBtnClass}
              onClick={() => {
                if (!selectedOrgId) {
                  message.warning('상위 조직을 먼저 선택해 주세요.');
                  return;
                }
                orgForm.resetFields();
                setOrgModal({ mode: 'create', parentId: selectedOrgId });
              }}
            >
              하위 조직 추가
            </Button>
          </Space>
          <div className="tw-min-h-[220px] tw-rounded-xl tw-border tw-border-slate-200/90 tw-bg-slate-50/40 tw-p-3">
            <Tree
              checkable
              checkStrictly
              showLine={{ showLeafIcon: false }}
              switcherIcon={({ expanded }) => (
                <RightOutlined
                  className={`tw-text-[11px] tw-text-slate-400 tw-transition-transform tw-duration-200 tw-ease-out ${expanded ? 'tw-rotate-90' : ''}`}
                />
              )}
              className="tw-bg-transparent [&_.ant-tree-switcher]:tw-flex [&_.ant-tree-switcher]:tw-w-5 [&_.ant-tree-switcher]:tw-shrink-0 [&_.ant-tree-switcher]:tw-items-center [&_.ant-tree-switcher]:tw-justify-center [&_.ant-tree-switcher]:tw-bg-transparent [&_.ant-tree-node-content-wrapper]:tw-rounded-md"
              treeData={treeData}
              titleRender={(node) => {
                const id = String(node.key);
                const name = typeof node.title === 'string' ? node.title : String(node.title ?? '');
                return (
                  <Dropdown
                    trigger={['click']}
                    menu={{
                      items: [
                        { key: 'edit', label: '수정', icon: <EditOutlined /> },
                        { key: 'delete', label: '삭제', icon: <DeleteOutlined />, danger: true },
                      ],
                      onClick: ({ key, domEvent }) => {
                        domEvent.stopPropagation();
                        if (key === 'edit') {
                          orgForm.setFieldsValue({ name });
                          setOrgModal({ mode: 'edit', id, name });
                          return;
                        }
                        modal.confirm({
                          title: '선택한 조직을 삭제할까요?',
                          okText: '삭제',
                          okType: 'danger',
                          cancelText: '취소',
                          onOk: () => orgDelete.mutateAsync(id),
                        });
                      },
                    }}
                  >
                    <span className="tw-cursor-pointer">{name}</span>
                  </Dropdown>
                );
              }}
              checkedKeys={selectedOrgKeys}
              onCheck={(checked) => {
                const raw = Array.isArray(checked) ? checked : checked.checked;
                const keys = raw.filter((k): k is Key => k != null);
                const last = keys.at(-1);
                setSelectedOrgKeys(last != null ? [last] : []);
              }}
              defaultExpandAll
            />
          </div>
          <Modal
            title={orgModal?.mode === 'edit' ? '조직명 수정' : orgModal?.parentId ? '하위 조직 추가' : '최상위 조직 추가'}
            open={orgModal != null}
            onCancel={() => setOrgModal(null)}
            onOk={async () => {
              const v = await orgForm.validateFields();
              if (!orgModal) return;
              if (orgModal.mode === 'edit') {
                void orgUpdate.mutateAsync({ id: orgModal.id, name: v.name.trim() });
              } else {
                void orgCreate.mutateAsync({ name: v.name.trim(), parentId: orgModal.parentId });
              }
              setOrgModal(null);
            }}
            confirmLoading={orgCreate.isPending || orgUpdate.isPending}
            destroyOnHidden
          >
            <Form form={orgForm} layout="vertical">
              <Form.Item name="name" label="조직명" rules={[{ required: true, message: '조직명을 입력해 주세요.' }]}>
                <Input placeholder="예: 본사, 개발팀" />
              </Form.Item>
            </Form>
          </Modal>
        </Space>
      );
    }
    if (current === 1) {
      return (
        <Space direction="vertical" className="tw-w-full">
          <div className="tw-grid tw-grid-cols-1 tw-gap-5 lg:tw-grid-cols-2">
            <Card size="small" title="직급">
              <div className="tw-mb-3 tw-flex tw-justify-end">
                <Button
                  type="primary"
                  className={orgPrimaryBtnClass}
                  onClick={() => {
                    gradeForm.resetFields();
                    setGradeModalOpen(true);
                  }}
                >
                  직급 추가
                </Button>
              </div>
              <Table<Record<string, unknown>>
                rowKey={(row) => String(row.id ?? row.jobGradeId ?? row.job_grade_id ?? JSON.stringify(row))}
                dataSource={gradeQuery.data ?? []}
                pagination={false}
                columns={[
                  { title: '직급명', render: (_, row) => String(row.name ?? '') },
                  {
                    title: '직급순서',
                    width: 120,
                    render: (_, row) => {
                      const raw = row.displayOrder ?? row.display_order;
                      return raw == null ? '—' : String(raw);
                    },
                  },
                ]}
              />
            </Card>
            <Card size="small" title="직책">
              <div className="tw-mb-3 tw-flex tw-justify-end">
                <Button
                  type="primary"
                  className={orgPrimaryBtnClass}
                  onClick={() => {
                    titleForm.resetFields();
                    setTitleModalOpen(true);
                  }}
                >
                  직책 추가
                </Button>
              </div>
              <Table<Record<string, unknown>>
                rowKey={(row) => String(row.id ?? row.jobTitleId ?? row.job_title_id ?? JSON.stringify(row))}
                dataSource={titleQuery.data ?? []}
                pagination={false}
                columns={[
                  { title: '직책명', render: (_, row) => String(row.name ?? '') },
                  {
                    title: '직책순서',
                    width: 120,
                    render: (_, row) => {
                      const raw = row.displayOrder ?? row.display_order;
                      return raw == null ? '—' : String(raw);
                    },
                  },
                ]}
              />
            </Card>
          </div>
          <Modal
            title="직급 추가"
            open={gradeModalOpen}
            onCancel={() => setGradeModalOpen(false)}
            onOk={async () => {
              const v = await gradeForm.validateFields();
              void gradeCreate.mutateAsync({ name: v.name.trim(), displayOrder: Number(v.displayOrder) });
              setGradeModalOpen(false);
            }}
            confirmLoading={gradeCreate.isPending}
            destroyOnHidden
          >
            <Form form={gradeForm} layout="vertical">
              <Form.Item name="name" label="직급명" rules={[{ required: true, message: '직급명을 입력해 주세요.' }]}>
                <Input />
              </Form.Item>
              <Form.Item name="displayOrder" label="직급순서" rules={[{ required: true, message: '직급순서를 입력해 주세요.' }]}>
                <InputNumber className="tw-w-full" />
              </Form.Item>
            </Form>
          </Modal>
          <Modal
            title="직책 추가"
            open={titleModalOpen}
            onCancel={() => setTitleModalOpen(false)}
            onOk={async () => {
              const v = await titleForm.validateFields();
              void titleCreate.mutateAsync({ name: v.name.trim(), displayOrder: Number(v.displayOrder) });
              setTitleModalOpen(false);
            }}
            confirmLoading={titleCreate.isPending}
            destroyOnHidden
          >
            <Form form={titleForm} layout="vertical">
              <Form.Item name="name" label="직책명" rules={[{ required: true, message: '직책명을 입력해 주세요.' }]}>
                <Input />
              </Form.Item>
              <Form.Item name="displayOrder" label="직책순서" rules={[{ required: true, message: '직책순서를 입력해 주세요.' }]}>
                <InputNumber className="tw-w-full" />
              </Form.Item>
            </Form>
          </Modal>
        </Space>
      );
    }
    if (current === 2) {
      return <OrganizationRolesSection />;
    }
    if (current === 3) {
      return (
        <Space direction="vertical" className="tw-w-full">
          <AdminSalarySettingsPage />
          <AdminWorkSchedulesPage />
          <AdminOvertimePoliciesPage />
          <AdminLeavePoliciesPage />
        </Space>
      );
    }
    if (current === 4) {
      return <AdminCompanyHolidaysPage />;
    }
    if (current === 5) {
      return (
        <ApprovalsAdminPage />
      );
    }
    if (current === 6) {
      return (
        <Space direction="vertical" className="tw-w-full">
          <Typography.Paragraph type="secondary" className="!tw-mb-0 !tw-text-xs">
            사이드바 ESG 설정의 기능 설정과 동일하게 ON/OFF 및 월간 포인트 상한만 저장합니다.
          </Typography.Paragraph>
          <Card className="tw-border-slate-200/80 tw-shadow-sm" size="small" title="기능 설정">
            <Form
              layout="vertical"
              className="tw-max-w-md"
              initialValues={{
                esgEnabledYn: esgConfigQuery.data?.esgEnabledYn ?? onboardingEsgEnabledYn ?? 'NO',
                monthlyPointLimit: esgConfigQuery.data?.monthlyPointLimit ?? 1000,
              }}
              onFinish={(v) => {
                const nextYn = v.esgEnabledYn as 'YES' | 'NO';
                setOnboardingEsgEnabledYn(nextYn);
                if (nextYn === 'NO') {
                  setEsgApiActivated(false);
                  message.info('ESG 설정이 NO라서 관련 API를 호출하지 않습니다.');
                  return;
                }
                void esgConfigUpdate.mutateAsync({
                  esgEnabledYn: nextYn,
                  monthlyPointLimit: Number(v.monthlyPointLimit) || 0,
                });
              }}
            >
              <Form.Item
                name="esgEnabledYn"
                label="ESG 그린장터"
                extra="ON이면 활동 인증, 포인트, 포인트샵이 활성화되고 OFF면 비활성화됩니다."
              >
                <Radio.Group
                  onChange={(e) => {
                    const nextYn = e.target.value as 'YES' | 'NO';
                    setOnboardingEsgEnabledYn(nextYn);
                    if (nextYn === 'NO') setEsgApiActivated(false);
                  }}
                >
                  <Radio value="YES">ON</Radio>
                  <Radio value="NO">OFF</Radio>
                </Radio.Group>
              </Form.Item>
              <Form.Item name="monthlyPointLimit" label="월간 포인트 상한">
                <InputNumber min={0} className="tw-w-full" />
              </Form.Item>
              <AppButton variant="secondary" className={orgPrimaryBtnClass} htmlType="submit" loading={esgConfigUpdate.isPending}>
                저장
              </AppButton>
            </Form>
          </Card>
        </Space>
      );
    }
    if (current === 7) {
      return (
        <Space direction="vertical" className="tw-w-full">
          <div>
            <Typography.Title level={5} className="!tw-m-0 !tw-text-slate-900">
              HR 정책 문서 (AI)
            </Typography.Title>
            <Typography.Paragraph type="secondary" className="!tw-mb-0 !tw-mt-1 !tw-text-sm">
              pdf, docx, txt만 업로드 가능하며 최대 10MB입니다. 업로드된 문서는 AI 비서 답변에 반영됩니다.
            </Typography.Paragraph>
          </div>

          <Card className="tw-border-slate-200/80 tw-shadow-sm" title="문서 업로드">
            <Upload.Dragger {...hrDocUploadProps} accept=".pdf,.docx,.txt">
              <p className="ant-upload-drag-icon">
                <InboxOutlined />
              </p>
              <p className="ant-upload-text">클릭하거나 파일을 여기로 끌어다 놓으세요</p>
              <p className="ant-upload-hint">pdf · docx · txt, 최대 10MB</p>
            </Upload.Dragger>
          </Card>

          <Card className="tw-border-slate-200/80 tw-shadow-sm" title="업로드된 문서">
            <Spin spinning={hrDocQuery.isLoading}>
              <Table
                size="small"
                rowKey="id"
                pagination={false}
                locale={{ emptyText: '등록된 문서가 없습니다.' }}
                dataSource={hrDocQuery.data ?? []}
                columns={[
                  {
                    title: '문서명',
                    dataIndex: 'documentName',
                    key: 'documentName',
                  },
                  {
                    title: '업로드 일시',
                    dataIndex: 'createdAt',
                    key: 'createdAt',
                    width: 200,
                    render: (v: string) => {
                      const d = dayjs(v);
                      return d.isValid() ? d.format('YYYY-MM-DD HH:mm') : v;
                    },
                  },
                  {
                    title: '관리',
                    key: 'actions',
                    width: 100,
                    render: (_: unknown, row: { id: string }) => (
                      <Popconfirm
                        title="이 문서를 삭제할까요?"
                        okText="삭제"
                        cancelText="취소"
                        okButtonProps={{ danger: true, loading: hrDocDelete.isPending }}
                        onConfirm={() => hrDocDelete.mutate(row.id)}
                      >
                        <button
                          type="button"
                          className="tw-inline-flex tw-items-center tw-gap-1 tw-border-0 tw-bg-transparent tw-text-red-600 hover:tw-underline"
                        >
                          <DeleteOutlined />
                          삭제
                        </button>
                      </Popconfirm>
                    ),
                  },
                ]}
              />
            </Spin>
          </Card>
        </Space>
      );
    }
    return (
      <Space direction="vertical" className="tw-w-full">
        <Form
          layout="inline"
          onFinish={(v) => {
            const sampleSections = [
              {
                title: '기본 평가',
                weight: 100,
                questions: [{ id: 'q1', type: 'text', title: '종합 평가', required: true, weight: 100 }],
              },
            ];
            void evalDesignCreate.mutateAsync({
              name: v.name,
              sectionsJson: v.sectionsJson || JSON.stringify(sampleSections),
              gradeConfigJson: v.gradeConfigJson || undefined,
            });
          }}
        >
          <Form.Item name="name" rules={[{ required: true }]}><Input placeholder="평가 정책명" /></Form.Item>
          <Form.Item name="sectionsJson"><Input placeholder='[{"title":"기본","weight":100,"questions":[...]}]' /></Form.Item>
          <Form.Item name="gradeConfigJson"><Input placeholder='{"type":"ABSOLUTE","grades":[...]}' /></Form.Item>
          <Form.Item><AppButton htmlType="submit" loading={evalDesignCreate.isPending}>생성</AppButton></Form.Item>
        </Form>
        <JsonPreviewCard title="평가 정책 목록(조회)" rows={evalDesignQuery.data ?? []} />
        <div className="tw-flex tw-justify-end">
          <AppButton
            variant="secondary"
            className={orgPrimaryBtnClass}
            loading={finishMutation.isPending}
            onClick={() => void finishMutation.mutateAsync()}
          >
            온보딩 완료
          </AppButton>
        </div>
      </Space>
    );
  };

  return (
    <Space direction="vertical" className="tw-w-full" size={16}>
      <Card className="tw-border-slate-200/80 tw-shadow-sm">
        <Typography.Title level={4} className="!tw-mb-1">
          초기 회사 온보딩
        </Typography.Title>
        <Typography.Text type="secondary">
          각 단계는 모두 선택 사항입니다. 생성/조회 API만 연동되어 있으며, 스태퍼에서 이전/다음/스킵으로 이동합니다.
        </Typography.Text>
        <div className="tw-mt-4">
          <Progress percent={progressPercent} />
          <Typography.Text type="secondary">{`${doneCount}/${ONBOARDING_STEPS.length} 단계 완료`}</Typography.Text>
        </div>
      </Card>

      <Card className="tw-border-slate-200/80 tw-shadow-sm">
        <Steps
          className="[&_.ant-steps-item-icon]:!tw-w-7 [&_.ant-steps-item-icon]:!tw-h-7 [&_.ant-steps-item-icon]:!tw-leading-7 [&_.ant-steps-item-icon]:!tw-mt-1 [&_.ant-steps-item-icon_.ant-steps-icon]:!tw-text-xs [&_.ant-steps-item-tail]:!tw-top-4"
          current={current}
          items={ONBOARDING_STEPS.map((s, idx) => ({
            title: s.title,
            status: statuses[idx] === 'completed' ? 'finish' : statuses[idx] === 'skipped' ? 'wait' : 'process',
          }))}
          onChange={(idx) => setCurrent(idx)}
        />
      </Card>

      <Card
        className="tw-border-slate-200/80 tw-shadow-sm"
        title={
          <Space>
            <span>{`${current + 1}. ${currentStep.title}`}</span>
            {stepTag(statuses[current] ?? 'pending')}
          </Space>
        }
      >
        <Space direction="vertical" className="tw-w-full" size={12}>
          {renderStepContent()}

          <Space wrap>
            <AppButton variant="secondary" onClick={gotoPrev} disabled={current === 0}>
              이전
            </AppButton>
            <AppButton variant="secondary" onClick={gotoNext} disabled={isLast}>
              다음
            </AppButton>
          </Space>
        </Space>
      </Card>

    </Space>
  );
}
