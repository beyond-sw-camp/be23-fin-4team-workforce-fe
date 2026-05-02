import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Card, Modal, Select, Space, Spin, Table, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import { useMemo, useRef, useState } from 'react';
import {
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

type ContractSchemaField = { key: string; label: string; type: string };

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
        if (!key || !label) return null;
        return { key, label, type };
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
  if (s === 'CREATED') return <Tag>생성됨</Tag>;
  return <Tag>{status}</Tag>;
}

export function MyContractsPanel() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'SENT' | 'SIGNED' | 'REJECTED' | 'CREATED'>('ALL');
  const [selectedContractId, setSelectedContractId] = useState<string | null>(null);
  const [signModalContractId, setSignModalContractId] = useState<string | null>(null);
  const [signSubmitting, setSignSubmitting] = useState(false);
  const padRef = useRef<ContractSignaturePadHandle>(null);

  const { data: myContracts = [], isFetching, refetch } = useQuery({
    queryKey: ['contract', 'my', statusFilter],
    queryFn: () => contractTemplateApi.listMyContracts(),
    staleTime: 30_000,
  });

  const filtered = useMemo(
    () =>
      statusFilter === 'ALL'
        ? myContracts
        : myContracts.filter((row) => String(row.contractStatus).toUpperCase() === statusFilter),
    [myContracts, statusFilter],
  );

  const { data: contractDetail, isFetching: detailLoading } = useQuery({
    queryKey: ['contract', 'detail', selectedContractId],
    queryFn: () => contractTemplateApi.getContract(selectedContractId!),
    enabled: Boolean(selectedContractId),
  });

  const signM = useMutation({
    mutationFn: (vars: { contractId: string; signatureImageUrl: string }) =>
      contractTemplateApi.signContract(vars.contractId, { signatureImageUrl: vars.signatureImageUrl }),
    onSuccess: async (_res, vars) => {
      message.success('전자계약 서명이 완료되었습니다.');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['contract', 'my'] }),
        queryClient.invalidateQueries({ queryKey: ['contract', 'detail', vars.contractId] }),
      ]);
    },
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

  return (
    <>
      <Card className="tw-border-slate-200/80 tw-shadow-sm" title="내 계약">
        <div className="tw-mb-3 tw-flex tw-items-center tw-justify-between tw-gap-2">
          <Select
            value={statusFilter}
            onChange={(v) => setStatusFilter(v)}
            options={[...STATUS_OPTIONS]}
            style={{ width: 160 }}
          />
          <Button onClick={() => void refetch()}>새로고침</Button>
        </div>
        <Table<ContractRecord>
          rowKey="contractId"
          loading={isFetching}
          dataSource={filtered}
          pagination={{ pageSize: 8, showSizeChanger: false }}
          locale={{ emptyText: '계약이 없습니다.' }}
          onRow={(record) => ({
            onClick: (e) => {
              const el = e.target as HTMLElement;
              if (el.closest('button, a, [role="button"], .ant-select')) return;
              setSelectedContractId(record.contractId);
            },
            className: 'tw-cursor-pointer',
          })}
          columns={[
            { title: '템플릿', dataIndex: 'templateName', key: 'templateName' },
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

      <Modal
        title={contractDetail ? `계약 상세 - ${contractDetail.templateName}` : '계약 상세'}
        open={selectedContractId != null}
        onCancel={() => setSelectedContractId(null)}
        footer={
          contractDetail && contractEmployeeSignaturePending(contractDetail)
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
        style={{ top: 48 }}
        styles={{ content: { resize: 'both', overflow: 'auto' }, body: { maxHeight: 'min(85vh, 900px)', overflowY: 'auto' } }}
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
            {contractEmployeeSignaturePending(contractDetail) ? (
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
                          {formatValue(detailContent[field.key])}
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
      </Modal>

      <Modal
        title="전자계약 서명"
        open={signModalContractId != null}
        onCancel={closeSignModal}
        destroyOnHidden
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
        <Typography.Paragraph type="secondary" className="tw-mb-3 tw-text-sm">
          계약 내용을 확인한 뒤 아래 패드에 서명하고 &quot;서명&quot;을 눌러 주세요. 서명 이미지는 업로드된 뒤
          전자계약에 반영됩니다.
        </Typography.Paragraph>
        <ContractSignaturePad ref={padRef} className="tw-w-full" />
      </Modal>
    </>
  );
}
