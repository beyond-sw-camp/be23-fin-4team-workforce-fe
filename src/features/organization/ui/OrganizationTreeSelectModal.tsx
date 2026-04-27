import { RightOutlined, SearchOutlined } from '@ant-design/icons';
import { Input, Modal, Tree, Typography } from 'antd';
import type { DataNode } from 'antd/es/tree';
import { useMemo, useState } from 'react';
import type { OrganizationFlatRow } from '@/features/organization/lib/flattenOrganizationTree';

type Props = {
  open: boolean;
  rows: OrganizationFlatRow[];
  selectedOrganizationId?: string;
  onClose: () => void;
  onSelect: (organizationId: string) => void;
};

function filterRowsKeepingAncestors(rows: OrganizationFlatRow[], keyword: string): OrganizationFlatRow[] {
  const q = keyword.trim().toLowerCase();
  if (!q) return rows;
  const byId = new Map(rows.map((r) => [r.id, r]));
  const keep = new Set<string>();
  for (const r of rows) {
    if (!r.name.toLowerCase().includes(q)) continue;
    keep.add(r.id);
    let p = r.parentId;
    while (p) {
      keep.add(p);
      p = byId.get(p)?.parentId ?? null;
    }
  }
  return rows.filter((r) => keep.has(r.id));
}

export function OrganizationTreeSelectModal({
  open,
  rows,
  selectedOrganizationId,
  onClose,
  onSelect,
}: Props) {
  const [keyword, setKeyword] = useState('');

  const filteredRows = useMemo(
    () => filterRowsKeepingAncestors(rows, keyword),
    [rows, keyword],
  );

  const treeData = useMemo<DataNode[]>(() => {
    if (filteredRows.length === 0) return [];
    const byId = new Map(filteredRows.map((r) => [r.id, r]));
    const ROOT = '__root__';
    const childrenMap = new Map<string, OrganizationFlatRow[]>();
    for (const r of filteredRows) {
      const parentKey = r.parentId && byId.has(r.parentId) ? r.parentId : ROOT;
      childrenMap.set(parentKey, [...(childrenMap.get(parentKey) ?? []), r]);
    }

    const build = (parentKey: string): DataNode[] => {
      const children = [...(childrenMap.get(parentKey) ?? [])].sort((a, b) =>
        a.name.localeCompare(b.name, 'ko', { sensitivity: 'base' }),
      );
      return children.map((r) => {
        const nested = build(r.id);
        return {
          key: r.id,
          title: r.name,
          isLeaf: nested.length === 0,
          ...(nested.length > 0 ? { children: nested } : {}),
        };
      });
    };

    return build(ROOT);
  }, [filteredRows]);

  const expandedKeys = useMemo(() => filteredRows.map((r) => r.id), [filteredRows]);

  return (
    <Modal
      open={open}
      title="조직트리에서 선택"
      onCancel={onClose}
      footer={null}
      width={560}
      destroyOnHidden
    >
      <div className="tw-space-y-3">
        <Input
          allowClear
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="조직명 검색"
          prefix={<SearchOutlined className="tw-text-slate-400" />}
        />
        {treeData.length === 0 ? (
          <Typography.Text type="secondary">선택 가능한 조직이 없습니다.</Typography.Text>
        ) : (
          <div className="tw-max-h-[52vh] tw-overflow-auto tw-rounded-xl tw-border tw-border-slate-200 tw-bg-white tw-p-2">
            <Tree
              blockNode
              showLine={{ showLeafIcon: false }}
              treeData={treeData}
              expandedKeys={expandedKeys}
              selectedKeys={selectedOrganizationId ? [selectedOrganizationId] : []}
              onSelect={(keys) => {
                const id = String(keys[0] ?? '').trim();
                if (!id) return;
                onSelect(id);
                onClose();
              }}
              switcherIcon={({ expanded }) => (
                <RightOutlined
                  className={`tw-text-[11px] tw-text-slate-400 tw-transition-transform ${expanded ? 'tw-rotate-90' : ''}`}
                />
              )}
            />
          </div>
        )}
      </div>
    </Modal>
  );
}

