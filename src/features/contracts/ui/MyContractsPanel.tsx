import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { App, Button, Card, Input, Space, Spin, Table, Tabs, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AppDoubleActionModal } from '@/shared/ui/AppDoubleActionModal';
import { AppModal } from '@/shared/ui/AppModal';
import { useAuth } from '@/features/auth/useAuth';
import {
  contractEffectiveRejectReason,
  contractEmployeeCanReject,
  contractEmployeeSignaturePending,
  contractTemplateApi,
  type ContractRecord,
} from '@/features/contracts/api/contractTemplateApi';
import { uploadSignaturePngForContract } from '@/features/contracts/lib/uploadSignaturePng';
import { ContractPartySignaturesCard } from '@/features/contracts/ui/ContractPartySignaturesCard';
import { ContractSignaturePad, type ContractSignaturePadHandle } from '@/features/contracts/ui/ContractSignaturePad';
import {
  ApprovalFormPaperFieldRow,
  ApprovalFormPaperLayout,
} from '@/features/approvals/ui/ApprovalFormPaperLayout';

type ContractSchemaField = { key: string; label: string; type: string; sourceField?: string };

const MY_CONTRACT_STATUS_TABS = [
  { key: 'ALL', label: '전체' },
  { key: 'SENT', label: '발송됨' },
  { key: 'SIGNED', label: '체결완료' },
  { key: 'REJECTED', label: '거절됨' },
  { key: 'CANCELED', label: '회수됨' },
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
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
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
  const s = status.toUpperCase();
  if (s === 'SENT') return <Tag color="processing">서명 대기</Tag>;
  if (s === 'SIGNED') return <Tag color="success">완료</Tag>;
  if (s === 'REJECTED') return <Tag color="error">거절</Tag>;
  if (s === 'CANCELED') return <Tag color="default">회수</Tag>;
  if (s === 'CREATED') return <Tag>생성됨</Tag>;
  return <Tag>{status}</Tag>;
}

export function MyContractsPanel() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { contractId?: string };
  const contractIdFromSearch = search.contractId?.trim() || undefined;
  const { user } = useAuth();
  const [statusFilter, setStatusFilter] = useState<(typeof MY_CONTRACT_STATUS_TABS)[number]['key']>('ALL');
  const [selectedContractId, setSelectedContractId] = useState<string | null>(null);

  useEffect(() => {
    if (!contractIdFromSearch) return;
    setSelectedContractId(contractIdFromSearch);
  }, [contractIdFromSearch]);

  const closeDetail = () => {
    setSelectedContractId(null);
    void navigate({ to: '/app/contracts', search: { contractId: undefined }, replace: true });
  };

  const openDetail = (contractId: string) => {
    const id = contractId.trim();
    if (!id) return;
    setSelectedContractId(id);
    void navigate({ to: '/app/contracts', search: { contractId: id }, replace: true });
  };
  const [signModalContractId, setSignModalContractId] = useState<string | null>(null);
  const [signSubmitting, setSignSubmitting] = useState(false);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectReasonDraft, setRejectReasonDraft] = useState('');
  const padRef = useRef<ContractSignaturePadHandle>(null);

  const { data: myContracts = [], isFetching, refetch } = useQuery({
    queryKey: ['contract', 'my', statusFilter],
    queryFn: () =>
      statusFilter === 'ALL'
        ? contractTemplateApi.listMyContracts()
        : contractTemplateApi.listMyContracts({
            status: statusFilter as 'SENT' | 'SIGNED' | 'REJECTED' | 'CANCELED',
          }),
    staleTime: 30_000,
  });

  const { data: contractDetail, isFetching: detailLoading } = useQuery({
    queryKey: ['contract', 'my-detail', selectedContractId],
    queryFn: () => contractTemplateApi.getContractMy(selectedContractId!),
    enabled: Boolean(selectedContractId),
  });

  const signM = useMutation({
    mutationFn: (vars: { contractId: string; signatureImageUrl: string }) =>
      contractTemplateApi.signContract(vars.contractId, { signatureImageUrl: vars.signatureImageUrl }),
    onSuccess: async (_res, vars) => {
      message.success('전자계약 서명이 완료되었습니다.');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['contract', 'my'] }),
        queryClient.invalidateQueries({ queryKey: ['contract', 'my-detail', vars.contractId] }),
      ]);
    },
    onError: (e: Error) => message.error(e.message || '계약 서명에 실패했습니다.'),
  });

  const rejectContractM = useMutation({
    mutationFn: (vars: { contractId: string; rejectReason: string }) =>
      contractTemplateApi.rejectContract(vars.contractId, { rejectReason: vars.rejectReason }),
    onSuccess: async (updated, vars) => {
      message.success('계약을 거절했습니다.');
      queryClient.setQueryData(['contract', 'my-detail', vars.contractId], updated);
      setRejectModalOpen(false);
      setRejectReasonDraft('');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['contract', 'my'] }),
        queryClient.invalidateQueries({ queryKey: ['contract', 'my-detail', vars.contractId] }),
        queryClient.invalidateQueries({ queryKey: ['contract', 'admin', 'contracts'] }),
        queryClient.invalidateQueries({ queryKey: ['contract', 'admin', 'batch-contracts'] }),
        queryClient.invalidateQueries({ queryKey: ['contract', 'admin', 'batches'] }),
      ]);
    },
    onError: (e: Error) => message.error(e.message || '계약 거절에 실패했습니다.'),
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

  const detailFields = useMemo(
    () => (contractDetail ? parseSchemaFields(contractDetail.formSchemaSnapshot) : []),
    [contractDetail],
  );
  const detailContent = useMemo(
    () => (contractDetail ? parseContent(contractDetail.contentJson) : {}),
    [contractDetail],
  );

  const canRejectCurrentDetail = useMemo(
    () => (contractDetail ? contractEmployeeCanReject(contractDetail, user?.id) : false),
    [contractDetail, user?.id],
  );

  return (
    <>
      <Card className="tw-border-slate-200/80 tw-shadow-sm" title="내 계약">
        <div className="tw-mb-3 tw-flex tw-flex-col tw-gap-2 sm:tw-flex-row sm:tw-items-center sm:tw-justify-between">
          <Tabs
            size="small"
            activeKey={statusFilter}
            onChange={(k) => setStatusFilter(k as (typeof MY_CONTRACT_STATUS_TABS)[number]['key'])}
            items={[...MY_CONTRACT_STATUS_TABS]}
            className="tw-min-w-0 tw-flex-1"
          />
          <Button onClick={() => void refetch()} className="tw-shrink-0">
            새로고침
          </Button>
        </div>
        <Table<ContractRecord>
          rowKey="contractId"
          loading={isFetching}
          dataSource={myContracts}
          pagination={{ pageSize: 8, showSizeChanger: false }}
          locale={{ emptyText: '계약이 없습니다.' }}
          onRow={(record) => ({
            onClick: (e) => {
              const el = e.target as HTMLElement;
              if (el.closest('button, a, [role="button"], .ant-select, .ant-tabs')) return;
              openDetail(record.contractId);
            },
            className: 'tw-cursor-pointer',
          })}
          columns={[
            { title: '템플릿', dataIndex: 'templateName', key: 'templateName', ellipsis: true },
            {
              title: '문서번호',
              dataIndex: 'contractNumber',
              key: 'contractNumber',
              width: 140,
              ellipsis: true,
              render: (v: string | null) => v?.trim() || '—',
            },
            {
              title: '상태',
              dataIndex: 'contractStatus',
              key: 'contractStatus',
              width: 140,
              render: (v: string) => statusTag(v),
            },
            {
              title: '생성일',
              dataIndex: 'createdAt',
              key: 'createdAt',
              width: 180,
              render: (v: string) => {
                const d = dayjs(v);
                return d.isValid() ? d.format('YYYY-MM-DD HH:mm') : v;
              },
            },
            {
              title: '서명',
              key: 'sign',
              width: 110,
              render: (_: unknown, row) =>
                contractEmployeeSignaturePending(row) ? (
                  <Button
                    type="primary"
                    size="small"
                    loading={
                      signSubmitting ||
                      (signM.isPending && signM.variables?.contractId === row.contractId)
                    }
                    onClick={(ev) => {
                      ev.stopPropagation();
                      openSignModal(row.contractId);
                    }}
                  >
                    서명하기
                  </Button>
                ) : (
                  <Typography.Text type="secondary">—</Typography.Text>
                ),
            },
          ]}
        />
      </Card>

      <AppModal
        title={contractDetail ? `계약 상세 - ${contractDetail.templateName}` : '계약 상세'}
        open={selectedContractId != null}
        onCancel={closeDetail}
        footer={
          selectedContractId ? (
            <div className="tw-flex tw-flex-wrap tw-items-center tw-justify-end tw-gap-2">
              <Button key="close" onClick={closeDetail}>
                닫기
              </Button>
              {!detailLoading && contractDetail && canRejectCurrentDetail ? (
                <Button
                  key="reject"
                  danger
                  onClick={() => {
                    setRejectReasonDraft('');
                    setRejectModalOpen(true);
                  }}
                >
                  거절
                </Button>
              ) : null}
              {!detailLoading && contractDetail && contractEmployeeSignaturePending(contractDetail) ? (
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
                </Button>
              ) : null}
            </div>
          ) : null
        }
        width={920}
        style={{ top: 48 }}
        styles={{ content: { resize: 'both', overflow: 'auto' }, body: { maxHeight: 'min(85vh, 900px)', overflowY: 'auto' } }}
        destroyOnClose
      >
        <div className="tw-px-5 tw-py-4">
        {detailLoading || !contractDetail ? (
          <Spin />
        ) : (
          <Space direction="vertical" className="tw-w-full" size={12}>
            <Card size="small" title="기본 정보">
              <div className="tw-grid tw-grid-cols-1 sm:tw-grid-cols-2 tw-gap-2 tw-text-sm">
                <div><strong>템플릿</strong>: {contractDetail.templateName}</div>
                <div><strong>문서번호</strong>: {contractDetail.contractNumber?.trim() || '—'}</div>
                <div><strong>상태</strong>: {statusTag(contractDetail.contractStatus)}</div>
                {contractDetail.sealImageUrl?.trim() ? (
                  <div className="sm:tw-col-span-2 tw-flex tw-flex-wrap tw-items-center tw-gap-2">
                    <strong className="tw-shrink-0">회사 직인</strong>
                    <img
                      src={contractDetail.sealImageUrl.trim()}
                      alt="회사 직인"
                      className="tw-max-h-24 tw-max-w-[200px] tw-rounded tw-border tw-border-slate-200 tw-object-contain tw-bg-white tw-p-1"
                    />
                  </div>
                ) : null}
                <div><strong>직원명</strong>: {contractDetail.employeeName || '—'}</div>
                <div><strong>사번</strong>: {contractDetail.employeeSabun || '—'}</div>
                <div><strong>부서</strong>: {contractDetail.organizationName || '—'}</div>
                <div><strong>직책</strong>: {contractDetail.jobTitleName || '—'}</div>
                {String(contractDetail.contractStatus).toUpperCase() === 'CANCELED' && contractDetail.cancelReason?.trim() ? (
                  <div className="sm:tw-col-span-2">
                    <strong>회수 사유</strong>:{' '}
                    <Typography.Paragraph className="!tw-mb-0 tw-inline tw-whitespace-pre-wrap">
                      {contractDetail.cancelReason.trim()}
                    </Typography.Paragraph>
                  </div>
                ) : null}
                {String(contractDetail.contractStatus).toUpperCase() === 'REJECTED' && contractEffectiveRejectReason(contractDetail) ? (
                  <div className="sm:tw-col-span-2">
                    <strong>거절 사유</strong>:{' '}
                    <Typography.Paragraph className="!tw-mb-0 tw-inline tw-whitespace-pre-wrap">
                      {contractEffectiveRejectReason(contractDetail)}
                    </Typography.Paragraph>
                  </div>
                ) : null}
              </div>
            </Card>
            {contractEmployeeSignaturePending(contractDetail) || canRejectCurrentDetail ? (
              <Card size="small" className="tw-border-amber-200/90 tw-bg-amber-50/60">
                <div className="tw-flex tw-flex-col tw-gap-3 sm:tw-flex-row sm:tw-items-center sm:tw-justify-between">
                  <Typography.Text className="!tw-mb-0">
                    {canRejectCurrentDetail
                      ? '내용을 확인한 뒤 서명하거나, 동의하지 않으면 거절할 수 있습니다.'
                      : '직원 서명이 필요합니다. 내용을 확인한 뒤 서명해 주세요.'}
                  </Typography.Text>
                  <Space wrap className="tw-shrink-0">
                    {canRejectCurrentDetail ? (
                      <Button
                        danger
                        onClick={() => {
                          setRejectReasonDraft('');
                          setRejectModalOpen(true);
                        }}
                      >
                        거절
                      </Button>
                    ) : null}
                    {contractEmployeeSignaturePending(contractDetail) ? (
                      <Button
                        type="primary"
                        loading={
                          signSubmitting ||
                          (signM.isPending && signM.variables?.contractId === contractDetail.contractId)
                        }
                        onClick={() => openSignModal(contractDetail.contractId)}
                      >
                        서명하기
                      </Button>
                    ) : null}
                  </Space>
                </div>
              </Card>
            ) : null}
            <ContractPartySignaturesCard parties={contractDetail.parties} />
            <Card size="small" title="계약서 내용">
              <div className="tw-max-h-[min(70vh,720px)] tw-overflow-auto">
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
              </div>
            </Card>
          </Space>
        )}
        </div>
      </AppModal>

      <AppDoubleActionModal
        title="계약 거절"
        open={rejectModalOpen && Boolean(contractDetail)}
        onClose={() => {
          setRejectModalOpen(false);
          setRejectReasonDraft('');
        }}
        confirmText="거절"
        cancelText="닫기"
        confirmDanger
        confirmLoading={rejectContractM.isPending}
        onConfirm={() => {
          const r = rejectReasonDraft.trim();
          if (!r) {
            message.warning('거절 사유를 입력해 주세요.');
            return;
          }
          if (!contractDetail) return;
          void rejectContractM.mutateAsync({ contractId: contractDetail.contractId, rejectReason: r });
        }}
        destroyOnHidden
        width={520}
      >
        <div className="tw-px-5 tw-py-4">
        <Typography.Paragraph type="secondary" className="tw-text-sm">
          거절 후에는 이 계약에 서명할 수 없으며, 필요 시 인사팀에서 재발송할 수 있습니다.
        </Typography.Paragraph>
        <Input.TextArea
          rows={4}
          value={rejectReasonDraft}
          onChange={(e) => setRejectReasonDraft(e.target.value)}
          placeholder="거절 사유를 입력해 주세요."
          maxLength={2000}
          showCount
        />
        </div>
      </AppDoubleActionModal>

      <AppModal
        title="전자계약 서명"
        open={signModalContractId != null}
        onCancel={closeSignModal}
        destroyOnClose
        okText="서명"
        cancelText="취소"
        confirmLoading={signSubmitting || signM.isPending}
        onOk={() => handleSubmitSign()}
        afterOpenChange={(open) => {
          if (open) padRef.current?.clear();
        }}
        width={640}
        styles={{ body: { paddingTop: 8 } }}
      >
        <div className="tw-px-5 tw-py-4">
        <Typography.Paragraph type="secondary" className="tw-mb-3 tw-text-sm">
          계약 내용을 확인한 뒤 아래 패드에 서명하고 &quot;서명&quot;을 눌러 주세요. 서명 이미지는 업로드된 뒤
          전자계약에 반영됩니다.
        </Typography.Paragraph>
        <ContractSignaturePad ref={padRef} className="tw-w-full" />
        </div>
      </AppModal>
    </>
  );
}
