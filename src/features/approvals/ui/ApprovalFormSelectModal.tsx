import { FileAddOutlined, FileTextOutlined, FolderOutlined, SearchOutlined } from '@ant-design/icons';
import { Button, Empty, Input, Modal, Spin, Tree, Typography } from 'antd';
import type { TreeProps } from 'antd';
import type { DataNode } from 'antd/es/tree';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { APPROVAL_REQUEST_TYPES, type ApprovalDocument, type ApprovalRequestType } from '@/features/approvals/api/approvalApi';
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

/** 타입별 폴더 표시 순서 (양식 선택 UX용) */
const REQUEST_TYPE_FOLDER_ORDER: readonly ApprovalRequestType[] = [
  'GENERAL',
  'OFFICIAL',
  'VACATION',
  'ATTENDANCE',
  'HR_MOVEMENT',
  'SALARY',
  'CONTRACT',
  'CERTIFICATE',
] as const;

const REQUEST_TYPE_FOLDER_LABEL: Record<ApprovalRequestType, string> = {
  VACATION: '휴가',
  ATTENDANCE: '근태',
  HR_MOVEMENT: '부서이동',
  SALARY: '급여',
  GENERAL: '일반기안',
  CONTRACT: '전자계약',
  CERTIFICATE: '문서발급',
  OFFICIAL: '공문',
};

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
  initialDocumentId,
}: ApprovalFormSelectModalProps) {
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);
  const [composeDocId, setComposeDocId] = useState<string | undefined>(undefined);
  const [docListSidebarCollapsed, setDocListSidebarCollapsed] = useState(false);

  useEffect(() => {
    if (open) {
      setSearch('');
      const initial = initialDocumentId?.trim();
      const valid = initial && documents.some((d) => d.documentId === initial) ? initial : undefined;
      setSelectedId(valid);
      setComposeDocId(undefined);
      setDocListSidebarCollapsed(false);
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

  const treeData: DataNode[] = useMemo(() => {
    const byType = new Map<ApprovalRequestType, ApprovalDocument[]>();
    for (const t of APPROVAL_REQUEST_TYPES) {
      byType.set(t, []);
    }
    for (const doc of filteredDocs) {
      const t = normalizeRequestType(doc.requestType);
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
      const folderLabel = REQUEST_TYPE_FOLDER_LABEL[requestType] ?? requestType;
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
  const composeDoc = composeDocId ? docById.get(composeDocId) : undefined;
  const composeIframeSrc = useMemo(() => {
    if (!composeDocId) return '';
    return `/app/approvals?tab=compose&embed=compose-modal&docId=${encodeURIComponent(composeDocId)}`;
  }, [composeDocId]);

  /** 동일 노드 재클릭 시 Ant Design Tree가 keys를 비우는 경우가 있어 info.node.key를 사용 */
  const handleTreeSelect = useCallback<TreeProps['onSelect']>((_keys, info) => {
    const raw = info.node?.key;
    const key = typeof raw === 'string' ? raw : String(raw ?? '');
    if (!key.startsWith('doc-')) return;
    const nextId = key.slice(4);
    setSelectedId(nextId);
    setComposeDocId(nextId);
    setDocListSidebarCollapsed(true);
  }, []);

  const handleOk = () => {
    if (!selectedId || !selectedDoc) return;
    setComposeDocId(selectedId);
    setDocListSidebarCollapsed(true);
  };

  return (
    <Modal
      title="결재양식 선택"
      open={open}
      onCancel={onCancel}
      footer={null}
      width={1120}
      destroyOnHidden
      style={{ top: 48 }}
      styles={{
        content: {
          height: 820,
          maxHeight: '90vh',
          resize: 'both',
          display: 'flex',
          flexDirection: 'column',
          padding: 0,
          overflow: 'auto',
        },
        header: { flexShrink: 0, marginBottom: 0, padding: '12px 16px' },
        body: { flex: 1, minHeight: 0, padding: 0, overflow: 'hidden' },
      }}
    >
      <div className="tw-flex tw-h-full tw-min-h-0 tw-w-full tw-overflow-hidden tw-bg-white">
        <div className="tw-order-2 tw-flex tw-min-w-0 tw-flex-1 tw-flex-col">
          {composeDocId ? (
            <>
              <div className="tw-flex tw-shrink-0 tw-items-center tw-justify-between tw-gap-2 tw-border-b tw-border-slate-200 tw-bg-slate-100 tw-px-4 tw-py-2.5">
                <Button
                  type="link"
                  size="small"
                  onClick={() => {
                    setComposeDocId(undefined);
                    setDocListSidebarCollapsed(false);
                  }}
                >
                  양식 목록 펼치기
                </Button>
                <Typography.Text strong className="tw-truncate">
                  결재 작성 - {formatDocTitle(composeDoc?.documentName)}
                </Typography.Text>
                <span className="tw-w-[110px]" aria-hidden />
              </div>
              <div className="tw-min-h-0 tw-flex-1 tw-overflow-hidden tw-bg-slate-50/30">
                <iframe
                  title="결재 양식 작성"
                  src={composeIframeSrc}
                  className="tw-h-full tw-w-full tw-border-0"
                />
              </div>
            </>
          ) : (
            <>
              <div className="tw-flex tw-shrink-0 tw-items-center tw-justify-between tw-gap-2 tw-bg-slate-100 tw-px-4 tw-py-2.5 tw-text-sm tw-font-semibold tw-text-slate-700">
                <span>상세정보</span>
                <Button type="link" size="small" onClick={() => setDocListSidebarCollapsed(true)}>
                  목록 접기
                </Button>
              </div>
              <div className="tw-flex tw-min-h-0 tw-flex-1 tw-flex-col tw-items-center tw-justify-center tw-overflow-auto tw-bg-gradient-to-b tw-from-slate-50 tw-to-slate-100/70 tw-px-6 tw-py-10 sm:tw-px-10">
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
                  <Typography.Paragraph type="secondary" className="!tw-mb-8 !tw-max-w-md !tw-text-sm !tw-leading-relaxed">
                    왼쪽에서 타입별 폴더를 펼친 뒤 작성할 양식을 누르면 이곳에 미리보기가 열립니다. 목록이 길면 상단 검색으로
                    이름을 찾을 수 있습니다.
                  </Typography.Paragraph>
                  <div className="tw-w-full tw-rounded-xl tw-border tw-border-slate-200/90 tw-bg-white/95 tw-p-5 tw-text-left tw-shadow-sm tw-ring-1 tw-ring-slate-100">
                    <Typography.Text strong className="tw-text-xs tw-tracking-wide tw-text-slate-600">
                      시작 순서
                    </Typography.Text>
                    <ul className="tw-mb-0 tw-mt-3 tw-list-none tw-space-y-3 tw-p-0">
                      <li className="tw-flex tw-gap-3">
                        <span className="tw-flex tw-h-7 tw-w-7 tw-shrink-0 tw-items-center tw-justify-center tw-rounded-lg tw-bg-[#1e3a5f]/10 tw-text-xs tw-font-bold tw-text-[#1e3a5f]">
                          1
                        </span>
                        <span className="tw-min-w-0 tw-pt-0.5 tw-text-sm tw-text-slate-600">
                          <FolderOutlined className="tw-mr-1 tw-text-amber-600" aria-hidden />
                          타입 폴더에서 양식을 선택합니다.
                        </span>
                      </li>
                      <li className="tw-flex tw-gap-3">
                        <span className="tw-flex tw-h-7 tw-w-7 tw-shrink-0 tw-items-center tw-justify-center tw-rounded-lg tw-bg-[#1e3a5f]/10 tw-text-xs tw-font-bold tw-text-[#1e3a5f]">
                          2
                        </span>
                        <span className="tw-min-w-0 tw-pt-0.5 tw-text-sm tw-text-slate-600">
                          <FileTextOutlined className="tw-mr-1 tw-text-slate-500" aria-hidden />
                          오른쪽에서 내용을 확인한 뒤 하단{' '}
                          <Typography.Text strong className="tw-text-slate-800">
                            이 양식으로 작성
                          </Typography.Text>
                          을 누릅니다.
                        </span>
                      </li>
                      <li className="tw-flex tw-gap-3">
                        <span className="tw-flex tw-h-7 tw-w-7 tw-shrink-0 tw-items-center tw-justify-center tw-rounded-lg tw-bg-slate-100 tw-text-xs tw-font-bold tw-text-slate-600">
                          3
                        </span>
                        <span className="tw-min-w-0 tw-pt-0.5 tw-text-sm tw-text-slate-600">
                          <SearchOutlined className="tw-mr-1 tw-text-slate-400" aria-hidden />
                          양식이 많으면 왼쪽 상단 검색으로 이름을 좁혀 보세요. 오른쪽 영역을 넓히려면 상단{' '}
                          <Typography.Text strong className="tw-text-slate-800">
                            목록 접기
                          </Typography.Text>
                          를 이용하면 됩니다.
                        </span>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
              <div className="tw-flex tw-shrink-0 tw-items-center tw-justify-end tw-gap-2 tw-border-t tw-border-slate-200 tw-bg-slate-50/80 tw-px-4 tw-py-3">
                <Button onClick={onCancel}>취소</Button>
                <Button type="primary" disabled={!selectedDoc} onClick={handleOk}>
                  이 양식으로 작성
                </Button>
              </div>
            </>
          )}
        </div>

        <div
          className={`tw-order-1 tw-flex tw-shrink-0 tw-flex-col tw-border-r tw-border-slate-200 tw-transition-all tw-duration-200 ${
            composeDocId || docListSidebarCollapsed
              ? 'tw-w-0 tw-overflow-hidden tw-border-r-0 tw-opacity-0'
              : 'tw-w-[min(100%,360px)] tw-opacity-100'
          }`}
        >
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
      </div>
    </Modal>
  );
}
