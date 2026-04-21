import { FileTextOutlined, FolderOutlined, SearchOutlined } from '@ant-design/icons';
import { Button, Empty, Input, Modal, Spin, Tree, Typography } from 'antd';
import type { DataNode } from 'antd/es/tree';
import { useCallback, useEffect, useMemo, useState, type Key as ReactKey } from 'react';
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
  const composeDoc = composeDocId ? docById.get(composeDocId) : undefined;
  const composeIframeSrc = useMemo(() => {
    if (!composeDocId) return '';
    return `/app/approvals?tab=compose&embed=compose-modal&docId=${encodeURIComponent(composeDocId)}`;
  }, [composeDocId]);

  const handleTreeSelect = useCallback((keys: ReactKey[]) => {
    const last = keys[keys.length - 1];
    const key = typeof last === 'string' ? last : String(last ?? '');
    if (key.startsWith('doc-')) {
      const nextId = key.slice(4);
      setSelectedId(nextId);
      setComposeDocId(nextId);
      setDocListSidebarCollapsed(true);
    }
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
              <div className="tw-min-h-0 tw-flex-1 tw-overflow-auto tw-bg-slate-50/40 tw-px-4 tw-py-4">
                <Typography.Text type="secondary">결재 양식을 선택해 주세요.</Typography.Text>
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
