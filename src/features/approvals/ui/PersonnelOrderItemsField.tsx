import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { Button, Empty, Form, Input, Select, Space, Tag, Typography } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { organizationApi, type OrgChartMember, type OrgChartOrgNode } from '@/features/organization/api/organizationApi';

// 결재 양식 인사발령품의서 전용 입력 패널
// field.type === 'personnel_order_items' 일 때 textarea 대신 렌더
// Form 의 ['content', 'contentJsonText'] 위치에 사람 읽기용 summary 를 넣고
// ['content', 'items'] / ['content', 'summaryText'] 도 동시 set 해서 BE publishPersonnelOrderEventIfApplicable 이 받을 수 있게 함

type OrderType = 'TRANSFER' | 'PROMOTION' | 'DEMOTION' | 'REASSIGN' | 'ROLE_CHANGE';

const ORDER_TYPE_OPTIONS: { value: OrderType; label: string }[] = [
  { value: 'TRANSFER', label: '전보 (부서 이동)' },
  { value: 'PROMOTION', label: '승진 (직급 상향)' },
  { value: 'DEMOTION', label: '강등 (직급 하향)' },
  { value: 'REASSIGN', label: '보직 변경 (직책 변경)' },
  { value: 'ROLE_CHANGE', label: '복합 (부서·직급·직책 동시)' },
];

type ItemRow = {
  rowKey: string;
  memberId?: string;
  memberName?: string;
  orderType: OrderType;
  beforeOrganizationId?: string;
  afterOrganizationId?: string;
  beforeOrganizationName?: string;
  afterOrganizationName?: string;
  beforeJobGradeName?: string;
  afterJobGradeName?: string;
  beforeJobTitleName?: string;
  afterJobTitleName?: string;
  reason?: string;
};

// 조직 트리 평탄화 - select 옵션 + 직원 -> 현재 부서 매핑
function flattenOrgTree(nodes: OrgChartOrgNode[]) {
  const orgs: { id: string; name: string }[] = [];
  // memberId -> { name, orgId, orgName, jobGradeName, jobTitleName }
  const memberMap = new Map<string, {
    name: string;
    orgId: string;
    orgName: string;
    jobGradeName: string;
    jobTitleName?: string | null;
  }>();
  const walk = (node: OrgChartOrgNode) => {
    orgs.push({ id: node.organizationId, name: node.name });
    for (const m of node.members ?? []) {
      memberMap.set(m.memberId, {
        name: m.name,
        orgId: node.organizationId,
        orgName: node.name,
        jobGradeName: m.jobGradeName ?? '',
        jobTitleName: m.jobTitleName,
      });
    }
    for (const c of node.children ?? []) walk(c);
  };
  for (const n of nodes) walk(n);
  return { orgs, memberMap };
}

// 행 -> 사람 읽기용 한 줄
function rowToSummaryLine(r: ItemRow): string | null {
  if (!r.memberName) return null;
  const parts: string[] = [];
  if (r.beforeOrganizationName !== r.afterOrganizationName && r.afterOrganizationName) {
    parts.push(`부서: ${r.beforeOrganizationName ?? '-'} -> ${r.afterOrganizationName}`);
  }
  if (r.beforeJobGradeName !== r.afterJobGradeName && r.afterJobGradeName) {
    parts.push(`직급: ${r.beforeJobGradeName ?? '-'} -> ${r.afterJobGradeName}`);
  }
  const beforeTitle = r.beforeJobTitleName ?? '';
  const afterTitle = r.afterJobTitleName ?? '';
  if (beforeTitle !== afterTitle) {
    parts.push(`직책: ${beforeTitle || '-'} -> ${afterTitle || '-'}`);
  }
  const head = `${r.memberName} (${ORDER_TYPE_OPTIONS.find((o) => o.value === r.orderType)?.label ?? r.orderType})`;
  if (!parts.length && !r.reason) return head;
  const tail = parts.join(' / ');
  const reasonPart = r.reason ? ` · 사유: ${r.reason}` : '';
  return `${head} - ${tail}${reasonPart}`;
}

function buildSummaryText(rows: ItemRow[]): string {
  return rows
    .map(rowToSummaryLine)
    .filter((s): s is string => Boolean(s))
    .join('\n');
}

function genRowKey(): string {
  return `r-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

const PERSONNEL_ORDER_PREFILL_STORAGE_KEY = 'wf-approval-prefill-personnel-order';

export function PersonnelOrderItemsField() {
  const form = Form.useFormInstance();
  // 외부에서 prefill 된 items 동기화용 - form 인스턴스 mismatch 회피로 localStorage 도 직접 fallback
  const initialRows = (() => {
    const fromForm = (form.getFieldValue(['content', 'items']) ?? []) as Partial<ItemRow>[];
    if (fromForm.length > 0) return fromForm;
    try {
      const raw = localStorage.getItem(PERSONNEL_ORDER_PREFILL_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as { contentJson?: { items?: Partial<ItemRow>[] } };
      const items = parsed.contentJson?.items;
      return Array.isArray(items) ? items : [];
    } catch {
      return [];
    }
  })();
  const [rows, setRows] = useState<ItemRow[]>(() =>
    initialRows.length > 0
      ? initialRows.map((r) => ({
          rowKey: genRowKey(),
          memberId: r.memberId,
          memberName: r.memberName,
          orderType: (r.orderType as OrderType) ?? 'ROLE_CHANGE',
          beforeOrganizationId: r.beforeOrganizationId,
          afterOrganizationId: r.afterOrganizationId,
          beforeOrganizationName: r.beforeOrganizationName,
          afterOrganizationName: r.afterOrganizationName,
          beforeJobGradeName: r.beforeJobGradeName,
          afterJobGradeName: r.afterJobGradeName,
          beforeJobTitleName: r.beforeJobTitleName,
          afterJobTitleName: r.afterJobTitleName,
          reason: r.reason,
        }))
      : [],
  );

  const orgChartQ = useQuery({
    queryKey: ['organization', 'org-chart'],
    queryFn: () => organizationApi.getOrgChart(),
    staleTime: 30_000,
  });
  const jobGradesQ = useQuery({
    queryKey: ['organization', 'job-grades'],
    queryFn: () => organizationApi.listJobGrades(),
    staleTime: 60_000,
  });
  const jobTitlesQ = useQuery({
    queryKey: ['organization', 'job-titles'],
    queryFn: () => organizationApi.listJobTitles(),
    staleTime: 60_000,
  });

  const { orgs, memberMap } = useMemo(() => {
    const data = orgChartQ.data?.organizations ?? [];
    return flattenOrgTree(data);
  }, [orgChartQ.data]);

  const memberOptions = useMemo(() => {
    const opts: { value: string; label: string; member: OrgChartMember; orgName: string }[] = [];
    for (const [id, info] of memberMap.entries()) {
      opts.push({
        value: id,
        label: `${info.name} · ${info.orgName}${info.jobGradeName ? ` · ${info.jobGradeName}` : ''}`,
        orgName: info.orgName,
        member: {
          memberId: id,
          name: info.name,
          jobGradeName: info.jobGradeName,
          jobTitleName: info.jobTitleName ?? null,
        } as OrgChartMember,
      });
    }
    return opts.sort((a, b) => a.label.localeCompare(b.label, 'ko'));
  }, [memberMap]);

  const orgOptions = useMemo(
    () => orgs.map((o) => ({ value: o.id, label: o.name })),
    [orgs],
  );
  // 직급/직책 응답 키가 name 또는 jobGradeName/jobTitleName 으로 섞여 옴 (AdminOrgRestructurePage 와 동일 패턴)
  const jobGradeOptions = useMemo(
    () =>
      (jobGradesQ.data ?? [])
        .map((g) => ((g.name as string) ?? (g.jobGradeName as string) ?? ''))
        .filter(Boolean)
        .map((n) => ({ value: n, label: n })),
    [jobGradesQ.data],
  );
  const jobTitleOptions = useMemo(
    () => [
      { value: '', label: '(직책 없음)' },
      ...(jobTitlesQ.data ?? [])
        .map((t) => ((t.name as string) ?? (t.jobTitleName as string) ?? ''))
        .filter(Boolean)
        .map((n) => ({ value: n, label: n })),
    ],
    [jobTitlesQ.data],
  );

  // rows -> form 동기화
  useEffect(() => {
    const items = rows
      .filter((r) => r.memberId)
      .map((r) => ({
        memberId: r.memberId,
        memberName: r.memberName,
        orderType: r.orderType,
        beforeOrganizationId: r.beforeOrganizationId ?? null,
        afterOrganizationId: r.afterOrganizationId ?? r.beforeOrganizationId ?? null,
        beforeOrganizationName: r.beforeOrganizationName ?? null,
        afterOrganizationName: r.afterOrganizationName ?? r.beforeOrganizationName ?? null,
        beforeJobGradeName: r.beforeJobGradeName ?? null,
        afterJobGradeName: r.afterJobGradeName ?? r.beforeJobGradeName ?? null,
        beforeJobTitleName: r.beforeJobTitleName ?? null,
        afterJobTitleName: r.afterJobTitleName ?? r.beforeJobTitleName ?? null,
        reason: r.reason ?? null,
      }));
    const summary = buildSummaryText(rows);
    const current = (form.getFieldValue('content') ?? {}) as Record<string, unknown>;
    form.setFieldsValue({
      content: {
        ...current,
        items,
        summaryText: summary,
        contentJsonText: summary,
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  const updateRow = (rowKey: string, patch: Partial<ItemRow>) => {
    setRows((prev) => prev.map((r) => (r.rowKey === rowKey ? { ...r, ...patch } : r)));
  };

  const handleSelectMember = (rowKey: string, memberId: string) => {
    const info = memberMap.get(memberId);
    if (!info) return;
    updateRow(rowKey, {
      memberId,
      memberName: info.name,
      beforeOrganizationId: info.orgId,
      afterOrganizationId: info.orgId,
      beforeOrganizationName: info.orgName,
      afterOrganizationName: info.orgName,
      beforeJobGradeName: info.jobGradeName,
      afterJobGradeName: info.jobGradeName,
      beforeJobTitleName: info.jobTitleName ?? '',
      afterJobTitleName: info.jobTitleName ?? '',
    });
  };

  const handleSelectOrg = (rowKey: string, orgId: string) => {
    const found = orgs.find((o) => o.id === orgId);
    updateRow(rowKey, {
      afterOrganizationId: orgId,
      afterOrganizationName: found?.name,
    });
  };

  const addRow = () => {
    setRows((prev) => [
      ...prev,
      { rowKey: genRowKey(), orderType: 'ROLE_CHANGE' },
    ]);
  };
  const removeRow = (rowKey: string) => {
    setRows((prev) => prev.filter((r) => r.rowKey !== rowKey));
  };

  return (
    <div className="tw-flex tw-flex-col tw-gap-3">
      {rows.length === 0 ? (
        <Empty description="아직 발령 대상이 없습니다. 아래 [+ 발령 추가] 버튼으로 행을 추가하세요." />
      ) : (
        rows.map((r, idx) => (
          <div
            key={r.rowKey}
            className="tw-flex tw-flex-col tw-gap-2 tw-rounded-lg tw-border tw-border-slate-200 tw-bg-slate-50/40 tw-p-3"
          >
            <div className="tw-flex tw-items-center tw-justify-between">
              <Typography.Text strong className="!tw-text-sm">
                대상 {idx + 1}
              </Typography.Text>
              <Button
                type="text"
                danger
                size="small"
                icon={<DeleteOutlined />}
                onClick={() => removeRow(r.rowKey)}
              >
                삭제
              </Button>
            </div>

            <Space wrap size={[8, 8]}>
              <Select
                showSearch
                placeholder="대상 직원 선택 (이름/부서)"
                style={{ minWidth: 280 }}
                value={r.memberId}
                onChange={(v) => handleSelectMember(r.rowKey, v)}
                options={memberOptions}
                optionFilterProp="label"
                loading={orgChartQ.isLoading}
              />
              <Select
                placeholder="발령 종류"
                style={{ minWidth: 220 }}
                value={r.orderType}
                onChange={(v: OrderType) => updateRow(r.rowKey, { orderType: v })}
                options={ORDER_TYPE_OPTIONS}
              />
            </Space>

            {r.memberId ? (
              <div className="tw-flex tw-flex-col tw-gap-2 tw-rounded tw-bg-white tw-p-2 tw-border tw-border-slate-100">
                <div className="tw-flex tw-flex-wrap tw-items-center tw-gap-2">
                  <Tag color="default">현재</Tag>
                  <span className="tw-text-sm">
                    {r.beforeOrganizationName} · {r.beforeJobGradeName || '-'}
                    {r.beforeJobTitleName ? ` · ${r.beforeJobTitleName}` : ''}
                  </span>
                </div>
                <Space wrap size={[8, 8]}>
                  <Select
                    placeholder="이동 후 부서"
                    style={{ minWidth: 200 }}
                    value={r.afterOrganizationId}
                    onChange={(v) => handleSelectOrg(r.rowKey, v)}
                    options={orgOptions}
                  />
                  <Select
                    placeholder="이동 후 직급"
                    style={{ minWidth: 160 }}
                    value={r.afterJobGradeName}
                    onChange={(v) => updateRow(r.rowKey, { afterJobGradeName: v })}
                    options={jobGradeOptions}
                    loading={jobGradesQ.isLoading}
                  />
                  <Select
                    placeholder="이동 후 직책"
                    style={{ minWidth: 160 }}
                    value={r.afterJobTitleName ?? ''}
                    onChange={(v) => updateRow(r.rowKey, { afterJobTitleName: v })}
                    options={jobTitleOptions}
                    loading={jobTitlesQ.isLoading}
                  />
                </Space>
                <Input
                  placeholder="개별 사유 (선택)"
                  value={r.reason ?? ''}
                  onChange={(e) => updateRow(r.rowKey, { reason: e.target.value })}
                  maxLength={200}
                />
              </div>
            ) : null}
          </div>
        ))
      )}
      <Button type="dashed" icon={<PlusOutlined />} onClick={addRow}>
        발령 추가
      </Button>
    </div>
  );
}
