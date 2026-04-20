import { FileTextOutlined, FolderOutlined, SearchOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Button, Card, Descriptions, Empty, Input, Modal, Select, Spin, Tag, Tree, Typography } from 'antd';
import type { DataNode } from 'antd/es/tree';
import dayjs from 'dayjs';
import { useCallback, useEffect, useMemo, useState, type Key as ReactKey } from 'react';
import {
  APPROVAL_REQUEST_TYPES,
  approvalApi,
  type ApprovalDocument,
  type ApprovalPolicyLineWithCandidates,
  type ApprovalRequestType,
} from '@/features/approvals/api/approvalApi';
import { parseFormSchema, type FormFieldSchema } from '@/features/approvals/lib/approvalFormSchema';
import {
  ApprovalFormPaperFieldRow,
  ApprovalFormPaperLayout,
  ApprovalFormStampColumn,
} from '@/features/approvals/ui/ApprovalFormPaperLayout';

function normalizeRequestType(raw: string | undefined): ApprovalRequestType {
  const u = String(raw ?? '')
    .trim()
    .toUpperCase();
  return (APPROVAL_REQUEST_TYPES as readonly string[]).includes(u) ? (u as ApprovalRequestType) : 'GENERAL';
}

function formatDocTitle(name?: string | null): string {
  const raw = String(name ?? '').trim();
  const compact = raw.replace(/\s+/g, '');
  if (compact === '휴가신청') return '연차신청서';
  return raw || '—';
}

function isHiddenDocName(doc: ApprovalDocument): boolean {
  const compact = String(doc.documentName ?? '').replace(/\s+/g, '');
  return compact === '연차신청서';
}

const TREE_GROUPS: { key: string; title: string; match: (t: ApprovalRequestType) => boolean }[] = [
  { key: 'gen', title: '일반', match: (t) => t === 'GENERAL' },
  {
    key: 'sup',
    title: '지원',
    match: (t) =>
      ['VACATION', 'ATTENDANCE', 'HR_MOVEMENT', 'CERTIFICATE', 'CONTRACT'].includes(t),
  },
  { key: 'exp', title: '지출결의', match: (t) => t === 'SALARY' },
  { key: 'off', title: '공문', match: (t) => t === 'OFFICIAL' },
  { key: 'misc', title: '기타', match: () => true },
];

function groupKeyForType(t: ApprovalRequestType): string {
  for (const g of TREE_GROUPS) {
    if (g.key === 'misc') continue;
    if (g.match(t)) return g.key;
  }
  return 'misc';
}

const REQUEST_TYPE_LABEL: Record<ApprovalRequestType, string> = {
  VACATION: '휴가',
  ATTENDANCE: '근태',
  HR_MOVEMENT: '부서이동',
  SALARY: '급여',
  GENERAL: '일반기안',
  CONTRACT: '전자계약',
  CERTIFICATE: '문서발급',
  OFFICIAL: '공문',
};

function requestTypeLabelKo(raw: string | undefined): string {
  const u = String(raw ?? '').trim().toUpperCase();
  if ((APPROVAL_REQUEST_TYPES as readonly string[]).includes(u)) {
    return REQUEST_TYPE_LABEL[u as ApprovalRequestType];
  }
  const trimmed = String(raw ?? '').trim();
  return trimmed || '—';
}

function truncateId(id: string, head = 8, tail = 4): string {
  const t = id.trim();
  if (t.length <= head + tail + 3) return t;
  return `${t.slice(0, head)}…${t.slice(-tail)}`;
}

function summarizeOrgScope(organizationId: string | null | undefined): { title: string; detail?: string } {
  const v = organizationId?.trim();
  if (!v) {
    return { title: '전사 (부서로 제한하지 않음)' };
  }
  return { title: '특정 조직으로만 제한', detail: truncateId(v) };
}

function primaryJobTitleLine(row: ApprovalPolicyLineWithCandidates): string {
  const first = row.candidates[0];
  if (first?.jobTitleName?.trim()) return first.jobTitleName.trim();
  return '직책 미표시';
}

function PolicyStepsList({ lines }: { lines: ApprovalPolicyLineWithCandidates[] }) {
  const sorted = [...lines].sort((a, b) => a.stepOrder - b.stepOrder);
  if (sorted.length === 0) {
    return (
      <Empty
        className="tw-py-6"
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description="등록된 결재 단계가 없습니다. 관리자에게 문의하세요."
      />
    );
  }
  return (
    <div className="tw-space-y-3">
      {sorted.map((row) => {
        const org = summarizeOrgScope(row.organizationId);
        return (
          <div
            key={row.policyLineId}
            className="tw-rounded-xl tw-border tw-border-slate-200/90 tw-bg-white tw-p-4 tw-shadow-sm tw-shadow-slate-900/[0.03]"
          >
            <div className="tw-mb-3 tw-flex tw-flex-wrap tw-items-center tw-gap-2">
              <span className="tw-inline-flex tw-h-8 tw-min-w-[3.25rem] tw-items-center tw-justify-center tw-rounded-lg tw-bg-blue-50 tw-px-2.5 tw-text-xs tw-font-bold tw-text-blue-800 tw-tabular-nums">
                {row.stepOrder}단계
              </span>
              <Typography.Text className="!tw-m-0 tw-text-base tw-font-semibold tw-text-slate-900">
                {primaryJobTitleLine(row)}
              </Typography.Text>
            </div>

            <div className="tw-mb-3 tw-rounded-lg tw-bg-slate-50 tw-px-3 tw-py-2">
              <Typography.Text type="secondary" className="tw-text-xs tw-leading-relaxed">
                {org.title}
                {org.detail ? (
                  <>
                    {' '}
                    <code className="tw-rounded tw-bg-slate-200/80 tw-px-1.5 tw-py-0.5 tw-text-[11px] tw-text-slate-700">
                      {org.detail}
                    </code>
                  </>
                ) : null}
              </Typography.Text>
              {!row.candidates[0]?.jobTitleName?.trim() ? (
                <div className="tw-mt-1.5">
                  <Typography.Text type="secondary" className="tw-text-[11px]">
                    시스템 직책 ID{' '}
                    <code className="tw-rounded tw-bg-slate-200/60 tw-px-1 tw-font-mono tw-text-[11px]">
                      {truncateId(row.jobTitleId, 10, 6)}
                    </code>
                  </Typography.Text>
                </div>
              ) : null}
            </div>

            <div>
              <div className="tw-mb-2 tw-flex tw-flex-wrap tw-items-baseline tw-gap-2">
                <Typography.Text className="tw-text-xs tw-font-medium tw-uppercase tw-tracking-wide tw-text-slate-500">
                  이 단계 후보 결재자
                </Typography.Text>
                {row.candidates.length > 0 ? (
                  <Typography.Text type="secondary" className="!tw-text-xs">
                    총 {row.candidates.length}명 (아래 모두 후보입니다)
                  </Typography.Text>
                ) : null}
              </div>
              {row.candidates.length === 0 ? (
                <Typography.Text type="secondary" className="tw-text-sm">
                  아직 후보가 없습니다. 조직·직책 설정을 확인해 주세요.
                </Typography.Text>
              ) : (
                <ol className="tw-m-0 tw-list-none tw-space-y-2 tw-p-0">
                  {row.candidates.map((c, idx) => (
                    <li
                      key={`${row.policyLineId}-cand-${idx}-${c.memberPositionId || c.memberId || 'x'}`}
                      className="tw-flex tw-gap-3 tw-rounded-lg tw-border tw-border-slate-100 tw-bg-slate-50/80 tw-px-3 tw-py-2.5"
                    >
                      <span
                        className="tw-flex tw-h-7 tw-w-7 tw-shrink-0 tw-items-center tw-justify-center tw-rounded-md tw-bg-white tw-text-xs tw-font-bold tw-tabular-nums tw-text-slate-600 tw-ring-1 tw-ring-slate-200/80"
                        aria-hidden
                      >
                        {idx + 1}
                      </span>
                      <div className="tw-flex tw-min-w-0 tw-flex-1 tw-flex-col tw-gap-0.5">
                        <span className="tw-text-sm tw-font-semibold tw-text-slate-900">{c.memberName}</span>
                        <span className="tw-text-xs tw-text-slate-600">
                          {c.organizationName?.trim() || '부서 정보 없음'} · {c.jobTitleName?.trim() || '직책 정보 없음'}
                        </span>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

const previewInputClass = '!tw-max-w-full tw-bg-slate-50/90 tw-text-slate-600';

function renderFormPreviewField(field: FormFieldSchema) {
  const ph = field.placeholder?.trim() || `${field.label} 입력`;
  const dis = { disabled: true as const };

  if (field.type === 'textarea') {
    return (
      <ApprovalFormPaperFieldRow key={field.name} label={field.label}>
        <Input.TextArea rows={3} placeholder={ph} className={`!tw-max-w-full ${previewInputClass}`} {...dis} />
      </ApprovalFormPaperFieldRow>
    );
  }
  if (field.type === 'number') {
    return (
      <ApprovalFormPaperFieldRow key={field.name} label={field.label}>
        <Input type="number" placeholder={ph} className={`!tw-max-w-xs ${previewInputClass}`} {...dis} />
      </ApprovalFormPaperFieldRow>
    );
  }
  if (field.type === 'date') {
    return (
      <ApprovalFormPaperFieldRow key={field.name} label={field.label}>
        <Input type="date" className={`!tw-max-w-xs ${previewInputClass}`} {...dis} />
      </ApprovalFormPaperFieldRow>
    );
  }
  if (field.type === 'datetime-local') {
    return (
      <ApprovalFormPaperFieldRow key={field.name} label={field.label}>
        <Input type="datetime-local" className={`!tw-max-w-xs ${previewInputClass}`} {...dis} />
      </ApprovalFormPaperFieldRow>
    );
  }
  if (field.type === 'time') {
    return (
      <ApprovalFormPaperFieldRow key={field.name} label={field.label}>
        <Input type="time" className={`!tw-max-w-xs ${previewInputClass}`} step={60} {...dis} />
      </ApprovalFormPaperFieldRow>
    );
  }
  if (field.type === 'select') {
    return (
      <ApprovalFormPaperFieldRow key={field.name} label={field.label}>
        <Select
          className={`!tw-max-w-md ${previewInputClass}`}
          placeholder={ph}
          options={(field.options ?? []).map((opt) => ({ value: opt, label: opt }))}
          {...dis}
        />
      </ApprovalFormPaperFieldRow>
    );
  }
  return (
    <ApprovalFormPaperFieldRow key={field.name} label={field.label}>
      <Input placeholder={ph} className={previewInputClass} {...dis} />
    </ApprovalFormPaperFieldRow>
  );
}

export type ApprovalFormSelectModalProps = {
  open: boolean;
  onCancel: () => void;
  documents: ApprovalDocument[];
  loading?: boolean;
  onConfirm: (documentId: string, doc: ApprovalDocument) => void;
  /** 목록에서 특정 양식을 눌러 열 때 트리·미리보기에 미리 선택 */
  initialDocumentId?: string;
};

export function ApprovalFormSelectModal({
  open,
  onCancel,
  documents,
  loading,
  onConfirm,
  initialDocumentId,
}: ApprovalFormSelectModalProps) {
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (open) {
      setSearch('');
      const initial = initialDocumentId?.trim();
      const valid = initial && documents.some((d) => d.documentId === initial) ? initial : undefined;
      setSelectedId(valid);
    }
  }, [open, initialDocumentId, documents]);

  const docById = useMemo(() => new Map(documents.map((d) => [d.documentId, d])), [documents]);

  const filteredDocs = useMemo(() => {
    const kw = search.trim().toLowerCase();
    return documents.filter((d) => {
      if (isHiddenDocName(d)) return false;
      if (!kw) return true;
      const title = formatDocTitle(d.documentName).toLowerCase();
      return title.includes(kw) || String(d.documentName ?? '').toLowerCase().includes(kw);
    });
  }, [documents, search]);

  const treeData: DataNode[] = useMemo(() => {
    const byGroup = new Map<string, ApprovalDocument[]>();
    for (const g of TREE_GROUPS) {
      if (g.key !== 'misc') byGroup.set(g.key, []);
    }
    byGroup.set('misc', []);

    for (const doc of filteredDocs) {
      const t = normalizeRequestType(doc.requestType);
      const gk = groupKeyForType(t);
      const list = byGroup.get(gk);
      if (list) list.push(doc);
      else byGroup.get('misc')!.push(doc);
    }

    const nodes: DataNode[] = [];
    for (const g of TREE_GROUPS) {
      if (g.key === 'misc') continue;
      const list = byGroup.get(g.key) ?? [];
      if (list.length === 0) continue;
      nodes.push({
        key: `grp-${g.key}`,
        title: (
          <span className="tw-inline-flex tw-items-center tw-gap-1.5">
            <FolderOutlined className="tw-text-amber-600" />
            <span>{g.title}</span>
          </span>
        ),
        selectable: false,
        children: list.map((doc) => ({
          key: `doc-${doc.documentId}`,
          isLeaf: true,
          title: (
            <span className="tw-inline-flex tw-items-center tw-gap-1.5">
              <FileTextOutlined className="tw-text-slate-500" />
              <span className="tw-truncate">{formatDocTitle(doc.documentName)}</span>
            </span>
          ),
        })),
      });
    }
    const misc = byGroup.get('misc') ?? [];
    if (misc.length > 0) {
      nodes.push({
        key: 'grp-misc',
        title: (
          <span className="tw-inline-flex tw-items-center tw-gap-1.5">
            <FolderOutlined className="tw-text-amber-600" />
            <span>기타</span>
          </span>
        ),
        selectable: false,
        children: misc.map((doc) => ({
          key: `doc-${doc.documentId}`,
          isLeaf: true,
          title: (
            <span className="tw-inline-flex tw-items-center tw-gap-1.5">
              <FileTextOutlined className="tw-text-slate-500" />
              <span className="tw-truncate">{formatDocTitle(doc.documentName)}</span>
            </span>
          ),
        })),
      });
    }
    return nodes;
  }, [filteredDocs]);

  const selectedDoc = selectedId ? docById.get(selectedId) : undefined;

  const policyQuery = useQuery({
    queryKey: ['approval', 'policy-lines', 'candidates', 'form-select-modal', selectedDoc?.documentId],
    queryFn: () => approvalApi.getPolicyLineCandidates(selectedDoc!.documentId),
    enabled: Boolean(open && selectedDoc),
  });

  const selectedFormSchema = useMemo(() => {
    if (!selectedDoc) return { fields: [] };
    return parseFormSchema(selectedDoc.formSchema);
  }, [selectedDoc]);

  const previewStampApprovers = useMemo(() => {
    const lines = policyQuery.data ?? [];
    return [...lines]
      .sort((a, b) => a.stepOrder - b.stepOrder)
      .map((row) => {
        const first = row.candidates[0];
        return {
          id: row.policyLineId,
          memberName: first?.memberName?.trim() || `${row.stepOrder}단계 (후보 없음)`,
          jobTitleName: first?.jobTitleName?.trim() || undefined,
        };
      });
  }, [policyQuery.data]);

  const handleTreeSelect = useCallback((keys: ReactKey[]) => {
    const last = keys[keys.length - 1];
    const key = typeof last === 'string' ? last : String(last ?? '');
    if (key.startsWith('doc-')) {
      setSelectedId(key.slice(4));
    }
  }, []);

  const handleOk = () => {
    if (!selectedId || !selectedDoc) return;
    onConfirm(selectedId, selectedDoc);
  };

  return (
    <Modal
      title="결재양식 선택"
      open={open}
      onCancel={onCancel}
      footer={null}
      width={1120}
      destroyOnHidden
      styles={{
        content: {
          height: 820,
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          padding: 0,
          overflow: 'hidden',
        },
        header: { flexShrink: 0, marginBottom: 0, padding: '12px 16px' },
        body: { flex: 1, minHeight: 0, padding: 0, overflow: 'hidden' },
      }}
    >
      <div className="tw-flex tw-h-full tw-min-h-0 tw-w-full tw-overflow-hidden tw-bg-white">
        <div className="tw-flex tw-w-[min(100%,360px)] tw-shrink-0 tw-flex-col tw-border-r tw-border-slate-200">
          <div className="tw-shrink-0 tw-border-b tw-border-slate-100 tw-p-3">
            <Input
              allowClear
              placeholder="양식제목"
              prefix={<SearchOutlined className="tw-text-slate-400" />}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="tw-min-h-0 tw-flex-1 tw-overflow-auto tw-p-2">
            {loading ? (
              <div className="tw-flex tw-min-h-[120px] tw-flex-col tw-items-center tw-justify-center tw-gap-2 tw-py-10">
                <Spin size="large" />
                <Typography.Text type="secondary" className="tw-text-xs">
                  양식 목록 불러오는 중...
                </Typography.Text>
              </div>
            ) : treeData.length === 0 ? (
              <Empty className="tw-py-8" description="검색 결과가 없습니다." />
            ) : (
              <Tree
                showLine
                blockNode
                defaultExpandAll
                selectedKeys={selectedId ? [`doc-${selectedId}`] : []}
                onSelect={handleTreeSelect}
                treeData={treeData}
                className="tw-bg-transparent"
              />
            )}
          </div>
        </div>

        <div className="tw-flex tw-min-w-0 tw-flex-1 tw-flex-col">
          <div className="tw-shrink-0 tw-bg-slate-100 tw-px-4 tw-py-2.5 tw-text-sm tw-font-semibold tw-text-slate-700">
            상세정보
          </div>
          <div className="tw-min-h-0 tw-flex-1 tw-overflow-auto tw-bg-slate-50/40 tw-px-4 tw-py-4">
            {!selectedDoc ? (
              <Typography.Text type="secondary">왼쪽에서 양식을 선택하세요.</Typography.Text>
            ) : (
              <div className="tw-space-y-5">
                <Card
                  size="small"
                  className="tw-border-slate-200/90 tw-bg-gradient-to-b tw-from-white tw-to-slate-50/50 tw-shadow-sm tw-shadow-slate-900/[0.04]"
                  title={<span className="tw-text-sm tw-font-semibold tw-text-slate-800">양식 요약</span>}
                  styles={{ body: { paddingTop: 12 } }}
                >
                  <Descriptions
                    column={1}
                    size="small"
                    colon={false}
                    styles={{
                      label: {
                        width: 120,
                        color: 'rgb(100 116 139)',
                        verticalAlign: 'top',
                        paddingBottom: 10,
                      },
                      content: { paddingBottom: 10 },
                    }}
                  >
                    <Descriptions.Item label="양식 제목">
                      <span className="tw-text-[15px] tw-font-semibold tw-leading-snug tw-text-slate-900">
                        {formatDocTitle(selectedDoc.documentName)}
                      </span>
                    </Descriptions.Item>
                    <Descriptions.Item label="문서 분류">
                      <span className="tw-font-medium tw-text-slate-800">
                        {requestTypeLabelKo(selectedDoc.requestType)}
                      </span>
                    </Descriptions.Item>
                    <Descriptions.Item label="부서 문서함">
                      {selectedDoc.isDeptVisibleYn === 'Y' ? (
                        <Tag color="blue" className="!tw-m-0">
                          공개
                        </Tag>
                      ) : (
                        <Tag className="!tw-m-0">비공개 (민감 양식)</Tag>
                      )}
                    </Descriptions.Item>
                  </Descriptions>
                </Card>

                <section className="tw-rounded-xl tw-border tw-border-slate-200/80 tw-bg-white tw-p-4 tw-shadow-sm tw-shadow-slate-900/[0.03]">
                  <Typography.Title level={5} className="!tw-mb-1 !tw-mt-0 !tw-text-base !text-slate-900">
                    작성 양식 미리보기
                  </Typography.Title>
                  <Typography.Paragraph type="secondary" className="!tw-mb-3 !tw-mt-0 !tw-text-xs !leading-relaxed">
                    실제 기안 화면과 같은 서식입니다. 입력란은 선택·확인용으로 비활성화되어 있습니다.
                  </Typography.Paragraph>
                  <div className="tw-max-h-[min(52vh,520px)] tw-overflow-auto tw-rounded-lg tw-border tw-border-slate-200/90 tw-bg-slate-50/50 tw-p-2 sm:tw-p-3">
                    {selectedFormSchema.fields.length === 0 ? (
                      <Empty
                        className="tw-py-8"
                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                        description="이 양식에 정의된 입력 항목이 없습니다."
                      />
                    ) : (
                      <ApprovalFormPaperLayout
                        documentName={formatDocTitle(selectedDoc.documentName)}
                        categoryLabel={requestTypeLabelKo(selectedDoc.requestType)}
                        requestTypeCode={normalizeRequestType(selectedDoc.requestType)}
                        drafterName="(작성 시 본인)"
                        drafterOrg="(작성 시 소속)"
                        drafterJobTitle="(작성 시 직책)"
                        writtenDate={dayjs().format('YYYY-MM-DD')}
                        stampColumn={
                          <ApprovalFormStampColumn
                            drafterName="(작성 시 본인)"
                            drafterJobTitle={undefined}
                            applicationWrittenDateIso={dayjs().format('YYYY-MM-DD')}
                            approvers={previewStampApprovers}
                          />
                        }
                      >
                        {selectedFormSchema.fields.map((field) => renderFormPreviewField(field))}
                      </ApprovalFormPaperLayout>
                    )}
                  </div>

                  <div className="tw-mt-6 tw-border-t tw-border-slate-200 tw-pt-5">
                    <Typography.Title level={5} className="!tw-mb-1 !tw-mt-0 !tw-text-base !text-slate-900">
                      결재가 이렇게 진행됩니다
                    </Typography.Title>
                    <Typography.Paragraph type="secondary" className="!tw-mb-4 !tw-mt-0 !tw-text-xs !leading-relaxed">
                      관리자가 설정한 단계와 후보입니다. 실제 결재 라인은 조직 상황에 따라 달라질 수 있습니다.
                    </Typography.Paragraph>
                    {policyQuery.isFetching ? (
                      <div className="tw-flex tw-min-h-[120px] tw-flex-col tw-items-center tw-justify-center tw-gap-2 tw-py-10">
                        <Spin size="large" />
                        <Typography.Text type="secondary" className="tw-text-xs">
                          결재 단계 불러오는 중...
                        </Typography.Text>
                      </div>
                    ) : policyQuery.isError ? (
                      <Typography.Text type="danger" className="tw-text-sm">
                        결재 정책을 불러오지 못했습니다.
                      </Typography.Text>
                    ) : (
                      <PolicyStepsList lines={policyQuery.data ?? []} />
                    )}
                  </div>
                </section>
              </div>
            )}
          </div>
          <div className="tw-flex tw-shrink-0 tw-items-center tw-justify-end tw-gap-2 tw-border-t tw-border-slate-200 tw-bg-slate-50/80 tw-px-4 tw-py-3">
            <Button onClick={onCancel}>취소</Button>
            <Button type="primary" disabled={!selectedDoc} onClick={handleOk}>
              이 양식으로 작성
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
