import {
  DownloadOutlined } from '@ant-design/icons';
import { useMutation,
  useQuery,
  useQueryClient } from '@tanstack/react-query';
import { useNavigate,
  useSearch } from '@tanstack/react-router';
import { Alert,
  App,
  Button,
  Card,
  Input,
  Space,
  Spin,
  Tabs,
  Tag,
  Timeline,
  Typography,
} from 'antd';
import dayjs from 'dayjs';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AppDoubleActionModal } from '@/shared/ui/AppDoubleActionModal';
import { AppModal } from '@/shared/ui/AppModal';
import { AppSingleActionModal } from '@/shared/ui/AppSingleActionModal';
import { useAuth } from '@/features/auth/useAuth';
import { PERM } from '@/features/permissions/backend-permissions';
import { usePermissions } from '@/features/permissions/usePermissionsHook';
import { parseApiError } from '@/shared/api/error-parser';
import { companyApi } from '@/features/organization/api/companyApi';
import { salaryApi } from '@/features/salary-service/api/salaryApi';
import type { MySalaryHistory } from '@/features/salary-service/types';
import {
  contractEffectiveRejectReason,
  contractEmployeeCanReject,
  contractEmployeeSignaturePending,
  contractTemplateApi,
  type ContractRecord,
} from '@/features/contracts/api/contractTemplateApi';
import { uploadSignaturePngForContract } from '@/features/contracts/lib/uploadSignaturePng';
import { parseContractFormSchema } from '@/features/contracts/lib/parseContractFormSchema';
import { isContractMoneyLikeNumberField } from '@/features/contracts/lib/contractMoneyLikeField';
import type { FormFieldSchema } from '@/features/approvals/lib/approvalFormSchema';
import { ContractPartySignaturesCard } from '@/features/contracts/ui/ContractPartySignaturesCard';
import { ContractSignaturePad, type ContractSignaturePadHandle } from '@/features/contracts/ui/ContractSignaturePad';
import { AppDataTable } from '@/shared/ui/AppDataTable';

import {
  ApprovalFormPaperFieldRow,
  ApprovalFormPaperLayout,
  ApprovalFormPaperStaticNoteRow,
} from '@/features/approvals/ui/ApprovalFormPaperLayout';

const MY_CONTRACT_STATUS_TABS = [
  { key: 'ALL', label: '전체' },
  { key: 'SENT', label: '발송됨' },
  { key: 'SIGNED', label: '체결완료' },
  { key: 'REJECTED', label: '거절됨' },
  { key: 'CANCELED', label: '회수됨' },
  { key: 'NEGOTIATION', label: '연봉협상 이력' },
] as const;

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

function formatValue(value: unknown, field?: FormFieldSchema): string {
  if (value == null) return '—';
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return '—';
    // 양식이 number 인데 contentJson 에 string 으로 저장된 케이스 보정
    if (field && isContractMoneyLikeNumberField(field)) {
      const n = Number(trimmed.replace(/,/g, ''));
      if (!Number.isNaN(n)) return `${n.toLocaleString('ko-KR')} 원`;
    }
    return trimmed;
  }
  if (typeof value === 'number') {
    if (field && isContractMoneyLikeNumberField(field)) {
      return `${value.toLocaleString('ko-KR')} 원`;
    }
    return value.toLocaleString('ko-KR');
  }
  if (typeof value === 'boolean') return value ? '예' : '아니오';
  try {
    return JSON.stringify(value);
  } catch {
    return '—';
  }
}

function formatDateTime(value: string): string {
  const d = dayjs.utc(value).tz('Asia/Seoul');
  return d.isValid() ? d.format('YYYY-MM-DD HH:mm') : value;
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

function formatWon(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '—';
  return `₩${Number(value).toLocaleString('ko-KR')}`;
}

function formatPercent(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
}

export type MyContractsPanelProps = {
  /** 전자결재 허브 모달 등 — URL(`/app/contracts`)과 동기화하지 않음 */
  embedded?: boolean;
  /** embedded 시 모달 진입 직후 열 상세 계약 ID */
  initialDetailContractId?: string | null;
};

export function MyContractsPanel({ embedded = false, initialDetailContractId = null }: MyContractsPanelProps = {}) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { contractId?: string };
  const contractIdFromSearch = embedded ? undefined : search.contractId?.trim() || undefined;
  const { user } = useAuth();
  const { hasPermission } = usePermissions();
  const canReadAdminContract = user?.isSystemAdmin === true || hasPermission(PERM.CONTRACT_READ);
  const [statusFilter, setStatusFilter] = useState<(typeof MY_CONTRACT_STATUS_TABS)[number]['key']>('ALL');
  const [selectedContractId, setSelectedContractId] = useState<string | null>(null);

  useEffect(() => {
    if (!contractIdFromSearch) return;
    setSelectedContractId(contractIdFromSearch);
  }, [contractIdFromSearch]);

  useEffect(() => {
    if (!embedded) return;
    const id = initialDetailContractId?.trim();
    if (!id) return;
    setSelectedContractId(id);
  }, [embedded, initialDetailContractId]);

  const closeDetail = () => {
    setSelectedContractId(null);
    if (!embedded) {
      void navigate({ to: '/app/contracts', search: { contractId: undefined }, replace: true });
    }
  };

  const openDetail = (contractId: string) => {
    const id = contractId.trim();
    if (!id) return;
    setSelectedContractId(id);
    if (!embedded) {
      void navigate({ to: '/app/contracts', search: { contractId: id }, replace: true });
    }
  };
  const [signModalContractId, setSignModalContractId] = useState<string | null>(null);
  const [signSubmitting, setSignSubmitting] = useState(false);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectReasonDraft, setRejectReasonDraft] = useState('');
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const padRef = useRef<ContractSignaturePadHandle>(null);

  const { data: myContracts = [], isFetching, refetch } = useQuery({
    queryKey: ['contract', 'my', statusFilter],
    queryFn: () =>
      statusFilter === 'ALL'
        ? contractTemplateApi.listMyContracts()
        : contractTemplateApi.listMyContracts({
            status: statusFilter as 'SENT' | 'SIGNED' | 'REJECTED' | 'CANCELED',
          }),
    enabled: statusFilter !== 'NEGOTIATION',
    staleTime: 30_000,
  });
  const {
    data: mySalaryHistory = [],
    isFetching: salaryHistoryLoading,
    refetch: refetchSalaryHistory,
  } = useQuery({
    queryKey: ['salary', 'salaries', 'my', 'contracts-tab'],
    queryFn: () => salaryApi.salary.listMine(),
    enabled: statusFilter === 'NEGOTIATION',
    staleTime: 30_000,
  });
  const sortedSalaryHistory = useMemo(() => {
    const list = mySalaryHistory.slice();
    list.sort((a, b) => {
      const ad = a.effectiveFrom ? new Date(a.effectiveFrom).getTime() : 0;
      const bd = b.effectiveFrom ? new Date(b.effectiveFrom).getTime() : 0;
      return bd - ad;
    });
    return list;
  }, [mySalaryHistory]);

  const {
    data: contractDetail,
    isFetching: detailLoading,
    isError: detailError,
    error: detailErrorObj,
    refetch: refetchContractDetail,
  } = useQuery({
    queryKey: ['contract', 'my-detail', selectedContractId, canReadAdminContract ? '1' : '0'],
    queryFn: async () => {
      const id = selectedContractId!;
      try {
        return await contractTemplateApi.getContractMy(id);
      } catch (firstErr) {
        if (!canReadAdminContract) throw firstErr;
        try {
          return await contractTemplateApi.getContract(id);
        } catch {
          throw firstErr;
        }
      }
    },
    enabled: Boolean(selectedContractId),
  });
  const { data: companyInfo } = useQuery({
    queryKey: ['company', 'info'],
    queryFn: () => companyApi.getCompanyInfo(),
    staleTime: 60_000,
  });
  const companyDisplayName = companyInfo?.companyName?.trim() || '회사';

  const {
    data: myContractHistory = [],
    isFetching: myHistoryLoading,
    isError: myHistoryError,
    error: myHistoryErrorObj,
  } = useQuery({
    queryKey: ['contract', 'history', 'my', selectedContractId],
    queryFn: () => contractTemplateApi.getContractHistoryMy(selectedContractId!),
    enabled: historyModalOpen && Boolean(selectedContractId),
  });

  const signM = useMutation({
    mutationFn: (vars: { contractId: string; signatureImageUrl: string }) =>
      contractTemplateApi.signContract(vars.contractId, { signatureImageUrl: vars.signatureImageUrl }),
    onSuccess: async (_res, vars) => {
      message.success('전자계약 서명이 완료되었습니다.');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['contract', 'my'] }),
        queryClient.invalidateQueries({ queryKey: ['contract', 'my-detail', vars.contractId] }),
        queryClient.invalidateQueries({ queryKey: ['contract', 'history', 'my', vars.contractId] }),
      ]);
    },
    onError: (e: Error) => message.error(e.message || '계약 서명에 실패했습니다.'),
  });

  const rejectContractM = useMutation({
    mutationFn: (vars: { contractId: string; rejectReason: string }) =>
      contractTemplateApi.rejectContract(vars.contractId, { rejectReason: vars.rejectReason }),
    onSuccess: async (updated, vars) => {
      message.success('계약을 거절했습니다.');
      queryClient.setQueriesData({ queryKey: ['contract', 'my-detail', vars.contractId] }, () => updated);
      setRejectModalOpen(false);
      setRejectReasonDraft('');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['contract', 'my'] }),
        queryClient.invalidateQueries({ queryKey: ['contract', 'my-detail', vars.contractId] }),
        queryClient.invalidateQueries({ queryKey: ['contract', 'history', 'my', vars.contractId] }),
        queryClient.invalidateQueries({ queryKey: ['contract', 'admin', 'contracts'] }),
        queryClient.invalidateQueries({ queryKey: ['contract', 'admin', 'batch-contracts'] }),
        queryClient.invalidateQueries({ queryKey: ['contract', 'admin', 'batches'] }),
      ]);
    },
    onError: (e: Error) => message.error(e.message || '계약 거절에 실패했습니다.'),
  });

  const contractPdfDownloadM = useMutation({
    mutationFn: (id: string) => contractTemplateApi.downloadContractPdf(id),
    onSuccess: ({ blob, filename }) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      message.success('PDF를 저장했습니다.');
    },
    onError: async (err: unknown) => {
      let detail = '';
      const e = err as { response?: { data?: unknown } };
      const data = e?.response?.data;
      if (data instanceof Blob) {
        try {
          const text = await data.text();
          try {
            const json = JSON.parse(text) as { message?: string; error?: string };
            detail = json?.message || json?.error || text;
          } catch {
            detail = text;
          }
        } catch {
          /* noop */
        }
      } else if (typeof data === 'object' && data !== null) {
        detail = (data as { message?: string }).message || '';
      }
      void message.error(detail ? `계약 PDF 다운로드 실패: ${detail}` : '계약 PDF 다운로드에 실패했습니다.');
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
    } finally {
      setSignSubmitting(false);
    }
  };

  const detailContractSchema = useMemo(
    () =>
      contractDetail?.formSchemaSnapshot?.trim()
        ? parseContractFormSchema(contractDetail.formSchemaSnapshot)
        : null,
    [contractDetail],
  );
  const detailFormDescription = detailContractSchema?.formDescription?.trim() ?? '';
  const detailContent = useMemo(
    () => (contractDetail ? parseContent(contractDetail.contentJson) : {}),
    [contractDetail],
  );

  const canRejectCurrentDetail = useMemo(
    () => (contractDetail ? contractEmployeeCanReject(contractDetail, user?.id) : false),
    [contractDetail, user?.id],
  );

  const detailSignCells = useMemo(() => {
    const empty = { label: '—', imageUrl: '', signedAt: '' };
    if (!contractDetail) return { employee: empty, company: empty };
    const employee = contractDetail.parties?.find((p) => String(p.partyRole).toUpperCase() === 'EMPLOYEE');
    const company = contractDetail.parties?.find((p) => String(p.partyRole).toUpperCase() === 'COMPANY');
    const employeeImg = employee?.signatureImageUrl?.trim() || '';
    const companyImg = company?.signatureImageUrl?.trim() || contractDetail.sealImageUrl?.trim() || '';
    return {
      employee: {
        label: contractDetail.employeeName?.trim() || '직원',
        imageUrl: employeeImg,
        signedAt: employee?.signedAt ? formatDateTime(employee.signedAt) : '',
      },
      company: {
        label: '회사',
        imageUrl: companyImg,
        signedAt: company?.signedAt ? formatDateTime(company.signedAt) : '',
      },
    };
  }, [contractDetail]);

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
          <Button
            onClick={() => void (statusFilter === 'NEGOTIATION' ? refetchSalaryHistory() : refetch())}
            className="tw-shrink-0"
          >
            새로고침
          </Button>
        </div>
        {statusFilter === 'NEGOTIATION' ? (
          <AppDataTable<MySalaryHistory>
            rowKey={(row) => row.salaryId ?? `${row.effectiveFrom ?? ''}-${row.currentBaseSalary ?? 0}-${row.jobTitleName ?? ''}`}
            loading={salaryHistoryLoading}
            dataSource={sortedSalaryHistory}
            pagination={{ pageSize: 8, showSizeChanger: false }}
            locale={{ emptyText: '연봉협상 이력이 없습니다.' }}
            columns={[
              {
                title: '적용일',
                dataIndex: 'effectiveFrom',
                key: 'effectiveFrom',
                width: 120,
                render: (v: string | null | undefined) => (v?.trim() ? v.trim() : '—'),
              },
              {
                title: '적용 종료일',
                dataIndex: 'effectiveTo',
                key: 'effectiveTo',
                width: 130,
                render: (v: string | null | undefined) => (v?.trim() ? v.trim() : '현재 적용 중'),
              },
              {
                title: '변경 전 기본급',
                dataIndex: 'previousBaseSalary',
                key: 'previousBaseSalary',
                width: 150,
                render: (v: number | null | undefined) => formatWon(v),
              },
              {
                title: '변경 후 기본급',
                dataIndex: 'currentBaseSalary',
                key: 'currentBaseSalary',
                width: 150,
                render: (v: number | null | undefined) => formatWon(v),
              },
              {
                title: '변동률',
                dataIndex: 'changeRate',
                key: 'changeRate',
                width: 100,
                render: (v: number | null | undefined) => {
                  if (v == null || Number.isNaN(v)) return <Typography.Text type="secondary">—</Typography.Text>;
                  if (v === 0) return <Typography.Text type="secondary">동결</Typography.Text>;
                  const txt = formatPercent(v);
                  const tone = v > 0 ? 'tw-text-slate-600' : v < 0 ? 'tw-text-slate-500' : 'tw-text-slate-500';
                  return <span className={tone}>{txt}</span>;
                },
              },
              {
                title: '직급',
                dataIndex: 'jobGradeName',
                key: 'jobGradeName',
                width: 120,
                render: (v: string | null | undefined) => v?.trim() || '—',
              },
              {
                title: '직책',
                dataIndex: 'jobTitleName',
                key: 'jobTitleName',
                width: 120,
                render: (v: string | null | undefined) => v?.trim() || '—',
              },
            ]}
          />
        ) : (
          <AppDataTable<ContractRecord>
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
        )}
      </Card>

      <AppModal
        title={contractDetail ? `계약 상세 - ${contractDetail.templateName}` : '계약 상세'}
        open={selectedContractId != null}
        onCancel={closeDetail}
        footer={
          selectedContractId ? (
            <div className="tw-flex tw-flex-wrap tw-items-center tw-justify-end tw-gap-2">
              {!detailLoading && contractDetail ? (
                <Button key="history" onClick={() => setHistoryModalOpen(true)}>
                  계약 이력
                </Button>
              ) : null}
              {!detailLoading &&
              contractDetail &&
              String(contractDetail.contractStatus).toUpperCase() === 'SIGNED' ? (
                <Button
                  key="pdf"
                  icon={<DownloadOutlined />}
                  loading={
                    contractPdfDownloadM.isPending &&
                    contractPdfDownloadM.variables === contractDetail.contractId
                  }
                  onClick={() => void contractPdfDownloadM.mutateAsync(contractDetail.contractId)}
                >
                  PDF 다운로드
                </Button>
              ) : null}
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
        destroyOnHidden
      >
        <div className="tw-px-5 tw-py-4">
        {detailLoading ? (
          <Spin />
        ) : detailError ? (
          <Alert
            type="error"
            showIcon
            message="계약을 불러오지 못했습니다."
            description={parseApiError(detailErrorObj).message}
            action={
              <Button size="small" onClick={() => void refetchContractDetail()}>
                다시 시도
              </Button>
            }
          />
        ) : !contractDetail ? (
          <Typography.Text type="secondary">표시할 계약이 없습니다.</Typography.Text>
        ) : (
          <Space direction="vertical" className="tw-w-full" size={12}>
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
            {detailFormDescription ? (
              <Alert
                type="info"
                showIcon
                message="인사팀 안내"
                description={<span className="tw-whitespace-pre-wrap tw-text-sm">{detailFormDescription}</span>}
              />
            ) : null}
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
                  documentNumber={contractDetail.contractNumber?.trim() || undefined}
                  stampColumn={
                    <table className="tw-w-[14rem] tw-table-fixed tw-border-collapse tw-text-sm">
                      <colgroup>
                        <col className="tw-w-[2rem]" />
                        <col className="tw-w-[6rem]" />
                        <col className="tw-w-[6rem]" />
                      </colgroup>
                      <tbody>
                        <tr>
                          <td
                            rowSpan={3}
                            className="tw-border tw-border-solid tw-border-black tw-bg-[#efefef] tw-px-0 tw-py-2 tw-text-center tw-align-middle tw-text-[11px] tw-font-semibold tw-text-black"
                            style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}
                          >
                            서명
                          </td>
                          <td className="tw-border tw-border-solid tw-border-black tw-bg-[#efefef] tw-px-2 tw-py-1 tw-text-center tw-text-xs tw-font-semibold">직원</td>
                          <td className="tw-border tw-border-solid tw-border-black tw-bg-[#efefef] tw-px-2 tw-py-1 tw-text-center tw-text-xs tw-font-semibold">{companyDisplayName}</td>
                        </tr>
                        <tr>
                          <td className="tw-border tw-border-solid tw-border-black tw-bg-white tw-px-1 tw-py-1 tw-text-center tw-align-middle">
                            <div className="tw-flex tw-min-h-[3.2rem] tw-flex-col tw-items-center tw-justify-center tw-gap-1">
                              <span className="tw-text-[11px] tw-font-semibold">{detailSignCells.employee.label}</span>
                              {detailSignCells.employee.imageUrl ? (
                                <img src={detailSignCells.employee.imageUrl} alt="직원 서명" className="tw-max-h-8 tw-max-w-[3.25rem] tw-object-contain" />
                              ) : null}
                            </div>
                          </td>
                          <td className="tw-border tw-border-solid tw-border-black tw-bg-white tw-px-1 tw-py-1 tw-text-center tw-align-middle">
                            <div className="tw-flex tw-min-h-[3.2rem] tw-flex-col tw-items-center tw-justify-center tw-gap-1">
                              {detailSignCells.company.imageUrl ? (
                                <img src={detailSignCells.company.imageUrl} alt="회사 직인" className="tw-max-h-8 tw-max-w-[3.25rem] tw-object-contain" />
                              ) : null}
                            </div>
                          </td>
                        </tr>
                        <tr>
                          <td className="tw-border tw-border-solid tw-border-black tw-bg-white tw-px-1 tw-py-0.5 tw-text-center tw-text-[10px]">
                            {detailSignCells.employee.signedAt || '\u00a0'}
                          </td>
                          <td className="tw-border tw-border-solid tw-border-black tw-bg-white tw-px-1 tw-py-0.5 tw-text-center tw-text-[10px]">
                            {detailSignCells.company.signedAt || '\u00a0'}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  }
                >
                  <ApprovalFormPaperFieldRow label="문서번호">
                    <Typography.Text>{contractDetail.contractNumber?.trim() || '—'}</Typography.Text>
                  </ApprovalFormPaperFieldRow>
                  <ApprovalFormPaperFieldRow label="상태">
                    {statusTag(contractDetail.contractStatus)}
                  </ApprovalFormPaperFieldRow>
                  {String(contractDetail.contractStatus).toUpperCase() === 'CANCELED' && contractDetail.cancelReason?.trim() ? (
                    <ApprovalFormPaperFieldRow label="회수 사유">
                      <Typography.Text className="tw-whitespace-pre-wrap">{contractDetail.cancelReason.trim()}</Typography.Text>
                    </ApprovalFormPaperFieldRow>
                  ) : null}
                  {String(contractDetail.contractStatus).toUpperCase() === 'REJECTED' && contractEffectiveRejectReason(contractDetail) ? (
                    <ApprovalFormPaperFieldRow label="거절 사유">
                      <Typography.Text className="tw-whitespace-pre-wrap">{contractEffectiveRejectReason(contractDetail)}</Typography.Text>
                    </ApprovalFormPaperFieldRow>
                  ) : null}
                  {detailContractSchema && detailContractSchema.fields.length > 0 ? (
                    detailContractSchema.fields.map((field) =>
                      field.type === 'static_note' ? (
                        <ApprovalFormPaperStaticNoteRow
                          key={field.name}
                          title={field.label?.trim() || undefined}
                          body={field.staticText?.trim() ?? ''}
                        />
                      ) : (
                        <ApprovalFormPaperFieldRow key={field.name} label={field.label}>
                          <Typography.Text
                            className={field.type === 'textarea' ? 'tw-whitespace-pre-wrap tw-break-words' : undefined}
                          >
                            {formatValue(
                              (() => {
                                const meta = detailContractSchema.metaByName[field.name];
                                const src = meta?.sourceField?.trim();
                                return detailContent[field.name] ?? (src ? detailContent[src] : undefined);
                              })(),
                              field,
                            )}
                          </Typography.Text>
                        </ApprovalFormPaperFieldRow>
                      ),
                    )
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

      <AppSingleActionModal
        title="계약 이력 (내 문서)"
        open={historyModalOpen}
        onClose={() => setHistoryModalOpen(false)}
        onSubmit={() => setHistoryModalOpen(false)}
        submitText="닫기"
        width={720}
        destroyOnHidden
      >
        <div className="tw-px-5 tw-py-4">
          {myHistoryLoading ? (
            <Spin />
          ) : myHistoryError ? (
            <Alert
              type="error"
              showIcon
              message="이력을 불러오지 못했습니다."
              description={
                myHistoryErrorObj instanceof Error
                  ? myHistoryErrorObj.message
                  : String(myHistoryErrorObj ?? '알 수 없는 오류')
              }
            />
          ) : myContractHistory.length === 0 ? (
            <Typography.Text type="secondary">이력이 없습니다.</Typography.Text>
          ) : (
            <Timeline
              items={myContractHistory.map((row) => {
                const st = String(row.contractStatus).toUpperCase();
                const color =
                  st === 'SIGNED' ? 'green' : st === 'REJECTED' ? 'red' : st === 'CANCELED' ? 'gray' : 'blue';
                return {
                  color,
                  children: (
                    <div className="tw-space-y-1">
                      <div className="tw-flex tw-flex-wrap tw-items-center tw-gap-2">
                        <Typography.Text strong>개정 {row.revision ?? 1}</Typography.Text>
                        {statusTag(row.contractStatus)}
                        <Typography.Text type="secondary" className="tw-text-xs">
                          {formatDateTime(row.createdAt)}
                        </Typography.Text>
                      </div>
                      <div className="tw-text-sm">
                        {row.employeeName} · {row.templateName}
                      </div>
                      {st === 'CANCELED' && row.cancelReason?.trim() ? (
                        <Typography.Text type="secondary" className="tw-text-xs tw-whitespace-pre-wrap">
                          회수: {row.cancelReason.trim()}
                        </Typography.Text>
                      ) : null}
                      {st === 'REJECTED' && contractEffectiveRejectReason(row) ? (
                        <Typography.Text type="secondary" className="tw-text-xs tw-whitespace-pre-wrap">
                          거절: {contractEffectiveRejectReason(row)}
                        </Typography.Text>
                      ) : null}
                      <Button
                        type="link"
                        size="small"
                        className="!tw-h-auto !tw-p-0"
                        onClick={() => {
                          setHistoryModalOpen(false);
                          openDetail(row.contractId);
                        }}
                      >
                        이 버전 상세 열기
                      </Button>
                    </div>
                  ),
                };
              })}
            />
          )}
        </div>
      </AppSingleActionModal>

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
