import { CloseOutlined, ExpandOutlined, FileAddOutlined, FileTextOutlined, FolderOutlined, ShrinkOutlined } from '@ant-design/icons';
import { Button, Empty, Spin, Tooltip, Tree, Typography } from 'antd';
import { AppSearchBar } from '@/shared/ui';
import { AppSingleActionModal } from '@/shared/ui/AppSingleActionModal';
import type { TreeProps } from 'antd';
import type { DataNode } from 'antd/es/tree';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  APPROVAL_REQUEST_TYPES,
  normalizeApprovalRequestType,
  type ApprovalDocument,
  type ApprovalRequestType,
} from '@/features/approvals/api/approvalApi';
import { APPROVAL_REQUEST_TYPE_LABEL_KO, approvalRequestTypeLabelKo } from '@/features/approvals/lib/approvalRequestTypeKo';
import { parseFormSchema, shouldHideApprovalFormFieldInSelectModalPreview } from '@/features/approvals/lib/approvalFormSchema';
import {
  ApprovalFormPaperFieldRow,
  ApprovalFormPaperLayout,
  ApprovalFormPaperStaticNoteRow,
  ApprovalFormStampColumn,
} from '@/features/approvals/ui/ApprovalFormPaperLayout';
import { PRETTY_SCROLLBAR_CLASS } from '@/features/member-chat/ui/shared/prettyScrollbar';
import { DetailPageHeader } from '@/shared/ui/DetailPageHeader';
function formatDocTitle(name?: string | null): string {
  const raw = String(name ?? '').trim();
  const compact = raw.replace(/\s+/g, '');
  if (compact === '휴가신청') return '연차신청서';
  return raw || '—';
}

/** 타입별 폴더 표시 순서 (양식 선택 UX용) */
const REQUEST_TYPE_FOLDER_ORDER: readonly ApprovalRequestType[] = [
  'GENERAL',
  'OFFICIAL',
  'VACATION',
  'ATTENDANCE',
  'HR',
  'BUSINESS_TRIP',
] as const;

const FORM_SELECT_MODAL_NORMAL_HEIGHT = 'min(820px, calc(100dvh - 96px))';
const FORM_SELECT_MODAL_MAXIMIZED_HEIGHT = 'calc(100dvh - 32px)';

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
  const [composeDocId, setComposeDocId] = useState<string | undefined>(undefined);
  const [docListSidebarCollapsed, setDocListSidebarCollapsed] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    if (open) {
      setSearch('');
      const initial = initialDocumentId?.trim();
      const valid = initial && documents.some((d) => d.documentId === initial) ? initial : undefined;
      setSelectedId(valid);
      setComposeDocId(undefined);
      setDocListSidebarCollapsed(false);
      setIsMaximized(false);
    }
  }, [open, initialDocumentId, documents]);

  const docById = useMemo(() => new Map(documents.map((d) => [d.documentId, d])), [documents]);

  const filteredDocs = useMemo(() => {
    const kw = search.trim().toLowerCase();
    return documents.filter((d) => {
      if (!kw) return true;
      const title = formatDocTitle(d.documentName).toLowerCase();
      return title.includes(kw) || String(d.documentName ?? '').toLowerCase().includes(kw);
    });
  }, [documents, search]);

  /** 양식(leaf) 더블클릭 시 선택 + 작성 iframe으로 바로 이동 */
  const goToComposeForDocumentId = useCallback((documentId: string) => {
    if (!documents.some((d) => d.documentId === documentId)) return;
    setSelectedId(documentId);
    setComposeDocId(documentId);
    setDocListSidebarCollapsed(true);
  }, [documents]);

  const treeData: DataNode[] = useMemo(() => {
    const byType = new Map<ApprovalRequestType, ApprovalDocument[]>();
    for (const t of APPROVAL_REQUEST_TYPES) {
      byType.set(t, []);
    }
    for (const doc of filteredDocs) {
      const t = normalizeApprovalRequestType(doc.requestType);
      byType.get(t)?.push(doc);
    }

    const nodes: DataNode[] = [];
    for (const requestType of REQUEST_TYPE_FOLDER_ORDER) {
      const list = (byType.get(requestType) ?? []).slice().sort((a, b) => {
        const na = formatDocTitle(a.documentName);
        const nb = formatDocTitle(b.documentName);
        return na.localeCompare(nb, 'ko');
      });
      if (list.length === 0) continue;
      const folderLabel = APPROVAL_REQUEST_TYPE_LABEL_KO[requestType];
      nodes.push({
        key: `grp-${requestType}`,
        title: (
          <span className="tw-inline-flex tw-min-w-0 tw-items-center tw-gap-1.5">
            <FolderOutlined className="tw-shrink-0 tw-text-amber-600" />
            <span className="tw-truncate">{folderLabel}</span>
          </span>
        ),
        selectable: false,
        children: list.map((doc) => ({
          key: `doc-${doc.documentId}`,
          isLeaf: true,
          title: (
            <span
              className="tw-inline-flex tw-w-full tw-min-w-0 tw-cursor-pointer tw-items-center tw-gap-1.5"
              onDoubleClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                goToComposeForDocumentId(doc.documentId);
              }}
            >
              <FileTextOutlined className="tw-shrink-0 tw-text-slate-500" />
              <span className="tw-min-w-0 tw-truncate">{formatDocTitle(doc.documentName)}</span>
            </span>
          ),
        })),
      });
    }
    return nodes;
  }, [filteredDocs, goToComposeForDocumentId]);

  const selectedDoc = selectedId ? docById.get(selectedId) : undefined;
  const composeDoc = composeDocId ? docById.get(composeDocId) : undefined;
  const selectedSchema = useMemo(() => (selectedDoc ? parseFormSchema(selectedDoc.formSchema) : { fields: [] }), [selectedDoc]);
  // 휴가신청서는 작성 화면에서 시작일/종료일을 숨기고 "휴가 날짜" multi DatePicker 한 칸으로 통합 처리
  // 미리보기에도 같은 모양으로 노출되도록 startDate/endDate 필드를 미리보기에서 제외
  const isLeaveDocument = selectedDoc?.documentName === '휴가신청서';
  const previewFields = useMemo(
    () => selectedSchema.fields.filter((f) => {
      if (shouldHideApprovalFormFieldInSelectModalPreview(f)) return false;
      if (isLeaveDocument && (f.name === 'startDate' || f.name === 'endDate')) return false;
      return true;
    }),
    [selectedSchema.fields, isLeaveDocument],
  );
  const composeIframeSrc = useMemo(() => {
    if (!composeDocId) return '';
    return `/app/approvals?tab=compose&embed=compose-modal&docId=${encodeURIComponent(composeDocId)}`;
  }, [composeDocId]);

  /** 동일 노드 재클릭 시 Ant Design Tree가 keys를 비우는 경우가 있어 info.node.key를 사용 */
  const handleTreeSelect = useCallback<NonNullable<TreeProps['onSelect']>>((_keys, info) => {
    const raw = info.node?.key;
    const key = typeof raw === 'string' ? raw : String(raw ?? '');
    if (!key.startsWith('doc-')) return;
    const nextId = key.slice(4);
    setSelectedId(nextId);
  }, []);

  const handleOk = () => {
    if (!selectedId || !selectedDoc) return;
    setComposeDocId(selectedId);
    setDocListSidebarCollapsed(true);
  };

  return (
    <AppSingleActionModal
      title={
        <div className="tw-flex tw-items-center tw-justify-between tw-gap-2">
            <span className="tw-text-sm tw-font-semibold tw-text-slate-800">전자결재</span>
            <div className="tw-flex tw-items-center tw-justify-end tw-gap-1">
            <Tooltip title={isMaximized ? '복원' : '최대화'} placement="bottom">
              <button
                type="button"
                onClick={() => setIsMaximized((prev) => !prev)}
                className="tw-inline-flex tw-h-7 tw-w-7 tw-cursor-pointer tw-items-center tw-justify-center tw-rounded-md tw-border-0 tw-bg-transparent tw-text-slate-400 tw-transition-colors hover:tw-bg-slate-100 hover:tw-text-slate-700"
                aria-label={isMaximized ? '복원' : '최대화'}
              >
                {isMaximized ? <ShrinkOutlined className="tw-text-[14px]" /> : <ExpandOutlined className="tw-text-[14px]" />}
              </button>
            </Tooltip>
            <Tooltip title="닫기" placement="bottom">
              <button
                type="button"
                onClick={onCancel}
                className="tw-inline-flex tw-h-7 tw-w-7 tw-cursor-pointer tw-items-center tw-justify-center tw-rounded-md tw-border-0 tw-bg-transparent tw-text-slate-400 tw-transition-colors hover:tw-bg-rose-50 hover:tw-text-rose-500"
                aria-label="닫기"
              >
                <CloseOutlined className="tw-text-[14px]" />
              </button>
            </Tooltip>
            </div>
        </div>
      }
      open={open}
      onClose={onCancel}
      onSubmit={() => undefined}
      submitText="확인"
      wrapClassName="wf-approval-form-select-modal-wrap"
      closable={false}
      customFooter={null}
      width={isMaximized ? 'calc(100vw - 32px)' : 1120}
      destroyOnHidden
      centered={!isMaximized}
      style={isMaximized ? { top: 16 } : undefined}
      styles={{
        content: {
          height: isMaximized ? FORM_SELECT_MODAL_MAXIMIZED_HEIGHT : FORM_SELECT_MODAL_NORMAL_HEIGHT,
          maxHeight: isMaximized ? FORM_SELECT_MODAL_MAXIMIZED_HEIGHT : FORM_SELECT_MODAL_NORMAL_HEIGHT,
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
        <div className="tw-order-2 tw-flex tw-min-w-0 tw-flex-1 tw-flex-col">
          {composeDocId ? (
            <>
              <div className="tw-shrink-0 tw-bg-slate-100 tw-px-4 tw-py-2.5 [&>header]:tw-mb-0 [&_h1]:tw-text-base [&_h1]:tw-font-semibold [&_h1]:tw-text-slate-700">
                <DetailPageHeader
                  backLabel="결재 양식 선택으로 돌아가기"
                  onBackClick={() => {
                    setComposeDocId(undefined);
                    setDocListSidebarCollapsed(false);
                  }}
                  title={`결재 작성중 - ${formatDocTitle(composeDoc?.documentName)}`}
                  showShare={false}
                />
              </div>
              <div className="tw-min-h-0 tw-flex-1 tw-overflow-hidden tw-bg-slate-50/30">
                <iframe title="결재 양식 작성" src={composeIframeSrc} className="tw-h-full tw-w-full tw-border-0" />
              </div>
            </>
          ) : (
            <>
              <div className="tw-flex tw-shrink-0 tw-items-center tw-justify-between tw-gap-2 tw-bg-slate-100 tw-px-4 tw-py-2.5 tw-text-sm tw-font-semibold tw-text-slate-700">
                <span>결재 문서 미리보기</span>
              </div>
              {selectedDoc ? (
                <div
                  className={`tw-min-h-0 tw-flex-1 tw-cursor-pointer tw-select-none tw-overflow-auto tw-bg-slate-50/40 tw-p-6 ${PRETTY_SCROLLBAR_CLASS}`}
                  title="더블클릭하면 이 양식으로 작성을 시작합니다."
                  onDoubleClick={() => {
                    if (!selectedDoc) return;
                    handleOk();
                  }}
                >
                  <ApprovalFormPaperLayout
                    documentName={formatDocTitle(selectedDoc.documentName)}
                    categoryLabel={approvalRequestTypeLabelKo(selectedDoc.requestType)}
                    requestTypeCode={normalizeApprovalRequestType(selectedDoc.requestType)}
                    drafterName="기안자"
                    drafterOrg="소속부서"
                    drafterJobTitle="직책"
                    stampColumn={
                      <ApprovalFormStampColumn
                        drafterName="기안자"
                        drafterJobTitle="직책"
                        approvers={[]}
                        applicationWrittenDateIso={undefined}
                      />
                    }
                  >
                    {previewFields.length > 0 ? (
                      <>
                        {previewFields.map((field) =>
                          field.type === 'static_note' ? (
                            <ApprovalFormPaperStaticNoteRow
                              key={`${selectedDoc.documentId}-${field.name}`}
                              title={field.label?.trim() || undefined}
                              body={field.staticText?.trim() ?? ''}
                            />
                          ) : (
                            <ApprovalFormPaperFieldRow
                              key={`${selectedDoc.documentId}-${field.name}`}
                              label={field.label}
                              required={field.locked === true}
                            >
                              <div className="tw-min-h-[28px] tw-whitespace-pre-wrap tw-text-sm tw-text-slate-500">
                                {field.type === 'select' && field.options?.length
                                  ? `선택: ${field.options.join(' / ')}`
                                  : field.placeholder || '입력값'}
                              </div>
                            </ApprovalFormPaperFieldRow>
                          ),
                        )}
                        {/* 휴가신청서 전용 - 작성 화면과 동일하게 "휴가 날짜" multi DatePicker 행 미리보기 */}
                        {isLeaveDocument && (
                          <ApprovalFormPaperFieldRow label="휴가 날짜" required>
                            <div className="tw-min-h-[28px] tw-text-sm tw-text-slate-500">
                              휴가일을 클릭해 하나씩 선택 (연속/비연속 모두 가능)
                            </div>
                          </ApprovalFormPaperFieldRow>
                        )}
                      </>
                    ) : (
                      <ApprovalFormPaperFieldRow label="안내">
                        <Empty description="미리보기 가능한 양식 필드가 없습니다." />
                      </ApprovalFormPaperFieldRow>
                    )}
                  </ApprovalFormPaperLayout>
                </div>
              ) : (
                <div
                  className={`tw-flex tw-min-h-0 tw-flex-1 tw-flex-col tw-items-center tw-justify-center tw-overflow-auto tw-bg-gradient-to-b tw-from-slate-50 tw-to-slate-100/70 tw-px-6 tw-py-10 sm:tw-px-10 ${PRETTY_SCROLLBAR_CLASS}`}
                >
                  <div className="tw-flex tw-w-full tw-max-w-lg tw-flex-col tw-items-center tw-text-center">
                    <div
                      className="tw-mb-5 tw-flex tw-h-[4.5rem] tw-w-[4.5rem] tw-items-center tw-justify-center tw-rounded-2xl tw-bg-white tw-shadow-md tw-ring-1 tw-ring-slate-200/80"
                      aria-hidden
                    >
                      <FileAddOutlined className="tw-text-[2.25rem] tw-text-[#1e3a5f]" />
                    </div>
                    <Typography.Title level={4} className="!tw-mb-2 !tw-mt-0 !tw-text-slate-900">
                      결재 양식을 선택해 주세요
                    </Typography.Title>
                    <Typography.Paragraph type="secondary" className="!tw-mb-0 !tw-max-w-md !tw-text-sm !tw-leading-relaxed">
                      왼쪽에서 타입별 폴더를 펼친 뒤 양식을 누르면 미리보기를 확인할 수 있고, 양식을 더블클릭하면 바로 작성 화면으로 이동합니다.
                    </Typography.Paragraph>
                  </div>
                </div>
              )}
              <div className="tw-flex tw-shrink-0 tw-items-center tw-justify-end tw-gap-2 tw-border-t tw-border-slate-200 tw-bg-slate-50/80 tw-px-4 tw-py-3">
                <Button onClick={onCancel}>닫기</Button>
                <Button type="primary" disabled={!selectedDoc} onClick={handleOk}>
                  이 양식으로 작성
                </Button>
              </div>
            </>
          )}
        </div>

        <div
          className={`tw-order-1 tw-flex tw-shrink-0 tw-flex-col tw-border-r tw-border-slate-200 tw-transition-all tw-duration-200 ${
            docListSidebarCollapsed
              ? 'tw-w-0 tw-overflow-hidden tw-border-r-0 tw-opacity-0'
              : 'tw-w-[min(100%,360px)] tw-opacity-100'
          }`}
        >
          <div className="tw-shrink-0 tw-border-b tw-border-slate-100 tw-p-3">
            <AppSearchBar
              placeholder="양식제목"
              value={search}
              onValueChange={setSearch}
              onSearch={setSearch}
              className="tw-w-full"
            />
          </div>
          <div className={`tw-min-h-0 tw-flex-1 tw-overflow-auto tw-p-2 ${PRETTY_SCROLLBAR_CLASS}`}>
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
      </div>
    </AppSingleActionModal>
  );
}
