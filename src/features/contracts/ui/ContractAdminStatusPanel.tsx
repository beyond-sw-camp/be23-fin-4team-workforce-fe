import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Card, Modal, Select, Space, Spin, Switch, Table, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import { useMemo, useRef, useState } from 'react';
import { useAuth } from '@/features/auth/useAuth';
import {
  contractEmployeeSignaturePending,
  contractTemplateApi,
  type ContractBatchSummary,
  type ContractRecord,
} from '@/features/contracts/api/contractTemplateApi';
import { uploadSignaturePngForContract } from '@/features/contracts/lib/uploadSignaturePng';
import { ApprovalFormPaperFieldRow, ApprovalFormPaperLayout } from '@/features/approvals/ui/ApprovalFormPaperLayout';
import { CONTRACT_HUB_CARD_CLASS } from '@/features/contracts/ui/contractHubStyles';
import { ContractPartySignaturesCard } from '@/features/contracts/ui/ContractPartySignaturesCard';
import { ContractSignaturePad, type ContractSignaturePadHandle } from '@/features/contracts/ui/ContractSignaturePad';

type ContractSchemaField = { key: string; label: string; type: string; sourceField?: string };

const STATUS_OPTIONS = [
  { value: 'ALL', label: '전체' },
  { value: 'SENT', label: '서명 대기' },
  { value: 'SIGNED', label: '완료' },
  { value: 'REJECTED', label: '거절' },
  { value: 'CREATED', label: '생성됨' },
] as const;

function parseSchemaFields(raw: string): ContractSchemaField[] {
  try {
    const parsed = JSON.parse(raw) as { fields?: unknown };
    const items = Array.isArray(parsed.fields) ? parsed.fields : [];
    return items
      .map((it) => {
        if (!it || typeof it !== 'object') return null;
        const o = it as Record<string, unknown>;
        const key = String(o.key ?? o.name ?? '').trim();
        const label = String(o.label ?? '').trim();
        const type = String(o.type ?? 'text').trim();
        const sourceField = typeof o.sourceField === 'string' ? o.sourceField.trim() : '';
        if (!key || !label) return null;
        return { key, label, type, ...(sourceField ? { sourceField } : {}) };
      })
      .filter((v): v is ContractSchemaField => v != null);
  } catch {
    return [];
  }
}

function parseContent(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function formatValue(value: unknown): string {
  if (value == null) return '—';
  if (typeof value === 'string') return value.trim() || '—';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return '—';
  }
}

function statusTag(status: string) {
  const s = String(status).toUpperCase();
  if (s === 'SENT') return <Tag color="processing">서명 대기</Tag>;
  if (s === 'SIGNED') return <Tag color="success">완료</Tag>;
  if (s === 'REJECTED') return <Tag color="error">거절</Tag>;
  if (s === 'CREATED') return <Tag>생성됨</Tag>;
  return <Tag>{status}</Tag>;
}

function formatDateTime(value: string): string {
  const d = dayjs(value);
  return d.isValid() ? d.format('YYYY-MM-DD HH:mm') : value;
}

export function ContractAdminStatusPanel({ hubLayout = false }: { hubLayout?: boolean }) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'SENT' | 'SIGNED' | 'REJECTED' | 'CREATED'>('ALL');
  const [selectedContractId, setSelectedContractId] = useState<string | null>(null);
  const [selectedBatch, setSelectedBatch] = useState<ContractBatchSummary | null>(null);
  const [onlyUnsigned, setOnlyUnsigned] = useState(false);
  const [signModalContractId, setSignModalContractId] = useState<string | null>(null);
  const [signSubmitting, setSignSubmitting] = useState(false);
  const padRef = useRef<ContractSignaturePadHandle>(null);

  const { data: contracts = [], isFetching: contractsLoading, refetch: refetchContracts } = useQuery({
    queryKey: ['contract', 'admin', 'contracts'],
    queryFn: () => contractTemplateApi.listContracts(),
    staleTime: 30_000,
  });
  const { data: batches = [], isFetching: batchesLoading, refetch: refetchBatches } = useQuery({
    queryKey: ['contract', 'admin', 'batches'],
    queryFn: () => contractTemplateApi.listBatches(),
    staleTime: 30_000,
  });
  const { data: contractDetail, isFetching: detailLoading } = useQuery({
    queryKey: ['contract', 'detail', selectedContractId],
    queryFn: () => contractTemplateApi.getContract(selectedContractId!),
    enabled: Boolean(selectedContractId),
  });
  const { data: batchContracts = [], isFetching: batchContractsLoading } = useQuery({
    queryKey: ['contract', 'admin', 'batch-contracts', selectedBatch?.batchId],
    queryFn: () => contractTemplateApi.getBatchContracts(selectedBatch!.batchId),
    enabled: Boolean(selectedBatch?.batchId),
  });

  const signM = useMutation({
    mutationFn: (vars: { contractId: string; signatureImageUrl: string }) =>
      contractTemplateApi.signContract(vars.contractId, { signatureImageUrl: vars.signatureImageUrl }),
    onSuccess: async (_res, vars) => {
      message.success('전자계약 서명이 완료되었습니다.');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['contract', 'admin', 'contracts'] }),
        queryClient.invalidateQueries({ queryKey: ['contract', 'detail', vars.contractId] }),
        queryClient.invalidateQueries({ queryKey: ['contract', 'admin', 'batch-contracts'] }),
        queryClient.invalidateQueries({ queryKey: ['contract', 'my'] }),
      ]);
    },
    onError: (e: Error) => message.error(e.message || '계약 서명에 실패했습니다.'),
  });

  const openSignModal = (contractId: string) => {
    setSignModalContractId(contractId);
  };

  const closeSignModal = () => {
    setSignModalContractId(null);
    padRef.current?.clear();
  };

  const handleSubmitSign = async () => {
    if (!signModalContractId) return;
    const pad = padRef.current;
    if (!pad || pad.isEmpty()) {
      message.warning('서명 패드에 서명해 주세요.');
      return;
    }
    setSignSubmitting(true);
    try {
      const file = await pad.toPngFile();
      const signatureImageUrl = await uploadSignaturePngForContract(file);
      await signM.mutateAsync({ contractId: signModalContractId, signatureImageUrl });
      closeSignModal();
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : '계약 서명에 실패했습니다.';
      message.error(errorMessage);
      throw e;
    } finally {
      setSignSubmitting(false);
    }
  };

  const filteredContracts = useMemo(
    () =>
      statusFilter === 'ALL'
        ? contracts
        : contracts.filter((row) => String(row.contractStatus).toUpperCase() === statusFilter),
    [contracts, statusFilter],
  );
  const visibleBatchContracts = useMemo(
    () =>
      onlyUnsigned
        ? batchContracts.filter((row) => String(row.contractStatus).toUpperCase() === 'SENT')
        : batchContracts,
    [batchContracts, onlyUnsigned],
  );

  const detailFields = useMemo(
    () => (contractDetail ? parseSchemaFields(contractDetail.formSchemaSnapshot) : []),
    [contractDetail],
  );
  const detailContent = useMemo(
    () => (contractDetail ? parseContent(contractDetail.contentJson) : {}),
    [contractDetail],
  );

  const canSignContractAsCurrentEmployee = useMemo(() => {
    if (!contractDetail || !user?.id?.trim()) return false;
    if (user.id.trim() !== contractDetail.employeeMemberId?.trim()) return false;
    return contractEmployeeSignaturePending(contractDetail);
  }, [contractDetail, user?.id]);

  const contractsToolbar = (
    <div className="tw-mb-3 tw-flex tw-items-center tw-justify-between tw-gap-2">
      <Select value={statusFilter} onChange={(v) => setStatusFilter(v)} options={[...STATUS_OPTIONS]} style={{ width: 160 }} />
      <Button onClick={() => void refetchContracts()}>새로고침</Button>
    </div>
  );

  const renderContractsTable = (compact: boolean) => (
    <Table<ContractRecord>
      rowKey="contractId"
      size={compact ? 'small' : 'middle'}
      loading={contractsLoading}
      dataSource={filteredContracts}
      pagination={{ pageSize: compact ? 5 : 8, showSizeChanger: false }}
      locale={{ emptyText: '계약 데이터가 없습니다.' }}
      onRow={(record) => ({
        onClick: (e) => {
          const el = e.target as HTMLElement;
          if (el.closest('button, a, [role="button"], .ant-select')) return;
          setSelectedContractId(record.contractId);
        },
        className: 'tw-cursor-pointer',
      })}
      columns={[
        { title: '직원', dataIndex: 'employeeName', key: 'employeeName', width: compact ? 100 : 140 },
        { title: '사번', dataIndex: 'employeeSabun', key: 'employeeSabun', width: compact ? 88 : 120, render: (v: string | null) => v || '—' },
        { title: '부서', dataIndex: 'organizationName', key: 'organizationName', width: compact ? 100 : 140, render: (v: string | null) => v || '—' },
        { title: '템플릿', dataIndex: 'templateName', key: 'templateName', ellipsis: true },
        { title: '상태', dataIndex: 'contractStatus', key: 'contractStatus', width: compact ? 100 : 120, render: (v: string) => statusTag(v) },
        { title: '생성일', dataIndex: 'createdAt', key: 'createdAt', width: compact ? 138 : 170, render: (v: string) => formatDateTime(v) },
      ]}
    />
  );

  const batchesToolbar = (
    <div className="tw-mb-3 tw-flex tw-justify-end">
      <Button onClick={() => void refetchBatches()}>새로고침</Button>
    </div>
  );

  const renderBatchesTable = (compact: boolean) => (
    <Table<ContractBatchSummary>
      rowKey="batchId"
      size={compact ? 'small' : 'middle'}
      loading={batchesLoading}
      dataSource={batches}
      pagination={{ pageSize: compact ? 5 : 8, showSizeChanger: false }}
      locale={{ emptyText: '배치 데이터가 없습니다.' }}
      onRow={(record) => ({
        onClick: (e) => {
          const el = e.target as HTMLElement;
          if (el.closest('button, a, [role="button"], .ant-select')) return;
          setSelectedBatch(record);
        },
        className: 'tw-cursor-pointer',
      })}
      columns={[
        { title: '배치명', dataIndex: 'batchName', key: 'batchName', ellipsis: true },
        { title: '템플릿', dataIndex: 'templateName', key: 'templateName', ellipsis: true },
        {
          title: '서명률',
          key: 'signedRate',
          width: compact ? 120 : 170,
          render: (_: unknown, row) => {
            const total = row.totalCount || 0;
            const signed = row.signedCount || 0;
            const rate = total > 0 ? Math.round((signed / total) * 100) : 0;
            return `${signed}/${total} (${rate}%)`;
          },
        },
        { title: '생성일', dataIndex: 'createdAt', key: 'createdAt', width: compact ? 138 : 170, render: (v: string) => formatDateTime(v) },
      ]}
    />
  );

  return (
    <>
      {hubLayout ? (
        <div className="tw-flex tw-h-full tw-min-h-0 tw-w-full tw-flex-1 tw-flex-col tw-overflow-hidden">
          <div className="tw-grid tw-h-full tw-min-h-0 tw-w-full tw-flex-1 tw-grid-cols-1 tw-gap-3 lg:tw-grid-cols-2 lg:tw-items-stretch">
            <Card
              title="전체 계약 목록"
              className={`${CONTRACT_HUB_CARD_CLASS} tw-flex tw-h-full tw-min-h-0 tw-flex-col tw-overflow-hidden`}
              styles={{ body: { flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' } }}
            >
              {contractsToolbar}
              <div className="tw-min-h-0 tw-flex-1 tw-overflow-auto wf-scrollbar tw-pr-0.5">
                {renderContractsTable(true)}
              </div>
            </Card>
            <Card
              title="일괄 발송 현황"
              className={`${CONTRACT_HUB_CARD_CLASS} tw-flex tw-h-full tw-min-h-0 tw-flex-col tw-overflow-hidden`}
              styles={{ body: { flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' } }}
            >
              {batchesToolbar}
              <div className="tw-min-h-0 tw-flex-1 tw-overflow-auto wf-scrollbar tw-pr-0.5">
                {renderBatchesTable(true)}
              </div>
            </Card>
          </div>
        </div>
      ) : (
        <Space direction="vertical" className="tw-w-full" size={16}>
          <Card className="tw-border-slate-200/80 tw-shadow-sm" title="전체 계약 목록">
            {contractsToolbar}
            {renderContractsTable(false)}
          </Card>
          <Card className="tw-border-slate-200/80 tw-shadow-sm" title="일괄 발송 현황">
            {batchesToolbar}
            {renderBatchesTable(false)}
          </Card>
        </Space>
      )}

      <Modal
        title={contractDetail ? `계약 상세 - ${contractDetail.templateName}` : '계약 상세'}
        open={selectedContractId != null}
        onCancel={() => setSelectedContractId(null)}
        footer={
          contractDetail && canSignContractAsCurrentEmployee
            ? [
                <Button key="close" onClick={() => setSelectedContractId(null)}>
                  닫기
                </Button>,
                <Button
                  key="sign"
                  type="primary"
                  loading={
                    signSubmitting ||
                    (signM.isPending && signM.variables?.contractId === contractDetail.contractId)
                  }
                  onClick={() => openSignModal(contractDetail.contractId)}
                >
                  서명하기
                </Button>,
              ]
            : null
        }
        width={920}
        destroyOnHidden
      >
        {detailLoading || !contractDetail ? (
          <Spin />
        ) : (
          <Space direction="vertical" className="tw-w-full" size={12}>
            <Card size="small" title="기본 정보">
              <div className="tw-grid tw-grid-cols-1 sm:tw-grid-cols-2 tw-gap-2 tw-text-sm">
                <div><strong>템플릿</strong>: {contractDetail.templateName}</div>
                <div><strong>상태</strong>: {statusTag(contractDetail.contractStatus)}</div>
                <div><strong>직원명</strong>: {contractDetail.employeeName || '—'}</div>
                <div><strong>사번</strong>: {contractDetail.employeeSabun || '—'}</div>
                <div><strong>부서</strong>: {contractDetail.organizationName || '—'}</div>
                <div><strong>직책</strong>: {contractDetail.jobTitleName || '—'}</div>
              </div>
            </Card>
            {canSignContractAsCurrentEmployee ? (
              <Card size="small" className="tw-border-amber-200/90 tw-bg-amber-50/60">
                <div className="tw-flex tw-flex-col tw-gap-3 sm:tw-flex-row sm:tw-items-center sm:tw-justify-between">
                  <Typography.Text className="!tw-mb-0">
                    직원 서명이 필요합니다. 내용을 확인한 뒤 서명해 주세요.
                  </Typography.Text>
                  <Button
                    type="primary"
                    className="tw-shrink-0"
                    loading={
                      signSubmitting ||
                      (signM.isPending && signM.variables?.contractId === contractDetail.contractId)
                    }
                    onClick={() => openSignModal(contractDetail.contractId)}
                  >
                    서명하기
                  </Button>
                </div>
              </Card>
            ) : null}
            <ContractPartySignaturesCard parties={contractDetail.parties} />
            <Card size="small" title="계약서 내용">
              <ApprovalFormPaperLayout
                documentName={contractDetail.templateName}
                categoryLabel="전자계약"
                requestTypeCode={contractDetail.contractType}
                drafterName={contractDetail.employeeName || '—'}
                drafterOrg={contractDetail.organizationName || '—'}
                drafterJobTitle={contractDetail.jobTitleName || undefined}
                writtenDate={dayjs(contractDetail.createdAt).isValid() ? dayjs(contractDetail.createdAt).format('YYYY-MM-DD') : contractDetail.createdAt}
              >
                {detailFields.length > 0 ? (
                  detailFields.map((field) => (
                    <ApprovalFormPaperFieldRow key={field.key} label={field.label}>
                      <Typography.Text className={field.type === 'textarea' ? 'tw-whitespace-pre-wrap tw-break-words' : undefined}>
                        {formatValue(detailContent[field.key] ?? (field.sourceField ? detailContent[field.sourceField] : undefined))}
                      </Typography.Text>
                    </ApprovalFormPaperFieldRow>
                  ))
                ) : (
                  <ApprovalFormPaperFieldRow label="안내">
                    <Typography.Text type="secondary">양식 스키마를 해석할 수 없습니다.</Typography.Text>
                  </ApprovalFormPaperFieldRow>
                )}
              </ApprovalFormPaperLayout>
            </Card>
          </Space>
        )}
      </Modal>

      <Modal
        title={selectedBatch ? `배치 상세 - ${selectedBatch.batchName || selectedBatch.batchId}` : '배치 상세'}
        open={selectedBatch != null}
        onCancel={() => {
          setSelectedBatch(null);
          setOnlyUnsigned(false);
        }}
        footer={null}
        width={980}
        destroyOnHidden
      >
        <div className="tw-mb-3 tw-flex tw-items-center tw-justify-end tw-gap-2">
          <Typography.Text type="secondary">미서명자만 보기</Typography.Text>
          <Switch checked={onlyUnsigned} onChange={setOnlyUnsigned} />
        </div>
        <Table<ContractRecord>
          rowKey="contractId"
          loading={batchContractsLoading}
          dataSource={visibleBatchContracts}
          pagination={{ pageSize: 8, showSizeChanger: false }}
          locale={{ emptyText: '배치 계약 데이터가 없습니다.' }}
          onRow={(record) => ({
            onClick: (e) => {
              const el = e.target as HTMLElement;
              if (el.closest('button, a, [role="button"], .ant-select, .ant-switch')) return;
              setSelectedContractId(record.contractId);
            },
            className: 'tw-cursor-pointer',
          })}
          columns={[
            { title: '직원', dataIndex: 'employeeName', key: 'employeeName', width: 140 },
            { title: '사번', dataIndex: 'employeeSabun', key: 'employeeSabun', width: 120, render: (v: string | null) => v || '—' },
            { title: '부서', dataIndex: 'organizationName', key: 'organizationName', width: 140, render: (v: string | null) => v || '—' },
            { title: '상태', dataIndex: 'contractStatus', key: 'contractStatus', width: 120, render: (v: string) => statusTag(v) },
          ]}
        />
      </Modal>

      <Modal
        title="전자계약 서명"
        open={signModalContractId != null}
        onCancel={closeSignModal}
        destroyOnHidden
        okText="서명"
        cancelText="취소"
        confirmLoading={signSubmitting || signM.isPending}
        onOk={() => void handleSubmitSign()}
        afterOpenChange={(open) => {
          if (open) padRef.current?.clear();
        }}
        width={640}
        styles={{ body: { paddingTop: 8 } }}
      >
        <Typography.Paragraph type="secondary" className="tw-mb-3 tw-text-sm">
          계약 내용을 확인한 뒤 아래 패드에 서명하고 &quot;서명&quot;을 눌러 주세요. 서명 이미지는 업로드된 뒤
          전자계약에 반영됩니다.
        </Typography.Paragraph>
        <ContractSignaturePad ref={padRef} className="tw-w-full" />
      </Modal>
    </>
  );
}
