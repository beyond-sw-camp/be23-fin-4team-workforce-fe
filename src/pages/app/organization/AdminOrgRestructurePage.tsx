/**
 * /app/organization/restructure - 조직 개편 시뮬레이션 (관리자만)
 *
 * Phase 1: 시뮬 화면만 (DB 변경 없음, client state)
 *  - 좌측: 현재 조직도 (read-only)
 *  - 우측: 시뮬 트리 (drag-drop 으로 직원 이동, 직급/직책 변경 모달)
 *  - 하단: 변경 사항 누적 list
 *  - [초기화] / [전자결재로 올리기 (Phase 2)] 버튼
 *
 * Phase 2 (TODO): 변경 사항 list -> 인사발령 결재 양식 자동 변환 + ApprovalDocument 생성
 */
import { useMemo, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  App,
  Button,
  Card,
  DatePicker,
  Empty,
  Input,
  Modal,
  Form,
  Select,
  Space,
  Tag,
  Tree,
  Typography,
} from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import type { TreeDataNode, TreeProps } from 'antd';
import {
  ApartmentOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { organizationApi } from '@/features/organization/api/organizationApi';
import type { OrgChartOrgNode, OrgChartMember } from '@/features/organization/api/organizationApi';
import { approvalApi } from '@/features/approvals/api/approvalApi';

type SimMember = {
  memberId: string;
  name: string;
  jobGradeName: string;
  jobTitleName: string;
  /** 시뮬 트리 상에서 현재 속한 조직 */
  currentOrgId: string;
  /** 원본 조직 (변경 비교용) */
  originalOrgId: string;
  originalJobGradeName: string;
  originalJobTitleName: string;
};

type Change = {
  memberId: string;
  name: string;
  /** 부서 이동 */
  fromOrgName?: string;
  toOrgName?: string;
  /** 직급 변경 */
  fromJobGrade?: string;
  toJobGrade?: string;
  /** 직책 변경 */
  fromJobTitle?: string;
  toJobTitle?: string;
};

function flattenOrg(
  nodes: OrgChartOrgNode[],
  parentId: string | null = null,
  acc: { orgId: string; name: string; parentId: string | null }[] = [],
): { orgId: string; name: string; parentId: string | null }[] {
  for (const n of nodes) {
    acc.push({ orgId: n.organizationId, name: n.name, parentId });
    if (n.children?.length) flattenOrg(n.children, n.organizationId, acc);
  }
  return acc;
}

function flattenMembers(nodes: OrgChartOrgNode[]): SimMember[] {
  const result: SimMember[] = [];
  const walk = (ns: OrgChartOrgNode[]) => {
    for (const n of ns) {
      for (const m of n.members ?? []) {
        const titleName = m.jobTitleName ?? '';
        result.push({
          memberId: m.memberId,
          name: m.name,
          jobGradeName: m.jobGradeName ?? '',
          jobTitleName: titleName,
          currentOrgId: n.organizationId,
          originalOrgId: n.organizationId,
          originalJobGradeName: m.jobGradeName ?? '',
          originalJobTitleName: titleName,
        });
      }
      if (n.children?.length) walk(n.children);
    }
  };
  walk(nodes);
  return result;
}

/** 트리 데이터 빌드 - 조직 노드 + 자식 조직 노드 + 직원 leaf */
function buildTreeData(
  orgs: OrgChartOrgNode[],
  members: SimMember[],
  draggable: boolean,
): TreeDataNode[] {
  const memberByOrg = new Map<string, SimMember[]>();
  for (const m of members) {
    if (!memberByOrg.has(m.currentOrgId)) memberByOrg.set(m.currentOrgId, []);
    memberByOrg.get(m.currentOrgId)!.push(m);
  }

  const walk = (nodes: OrgChartOrgNode[]): TreeDataNode[] =>
    nodes.map((n) => {
      const orgMembers = memberByOrg.get(n.organizationId) ?? [];
      const memberNodes: TreeDataNode[] = orgMembers.map((m) => ({
        key: `member:${m.memberId}`,
        title: (
          <span>
            <UserOutlined className="tw-mr-1 tw-text-slate-400" />
            <span className="tw-text-slate-700">{m.name}</span>
            {m.jobGradeName && (
              <Tag color="default" className="!tw-ml-1.5 !tw-text-[11px]">
                {m.jobGradeName}
              </Tag>
            )}
            {m.jobTitleName && (
              <Tag color="purple" className="!tw-ml-1 !tw-text-[11px]">
                {m.jobTitleName}
              </Tag>
            )}
          </span>
        ),
        isLeaf: true,
        // member 는 draggable, 부서 노드는 drop target
      }));
      const childOrgNodes = walk(n.children ?? []);
      return {
        key: `org:${n.organizationId}`,
        title: (
          <span>
            <ApartmentOutlined className="tw-mr-1 tw-text-blue-500" />
            <span className="tw-font-medium">{n.name}</span>
            <span className="tw-ml-1.5 tw-text-xs tw-text-slate-400">
              ({orgMembers.length})
            </span>
          </span>
        ),
        children: [...memberNodes, ...childOrgNodes],
        // 부서 노드는 draggable=false (혼란 방지)
        // antd 4 draggable Tree는 모든 노드 draggable - icon 으로 구분
      };
    });
  return walk(orgs);
}

/** localStorage 키 - 결재 작성 화면(iframe 포함)이 이 prefill 을 읽어서 contentJson 채움
 *  (sessionStorage는 iframe 모달에서 부모와 분리되므로 localStorage 사용) */
const PERSONNEL_ORDER_PREFILL_STORAGE_KEY = 'wf-approval-prefill-personnel-order';

export function AdminOrgRestructurePage() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [submitOpen, setSubmitOpen] = useState(false);
  const [submitForm] = Form.useForm<{ effectiveDate: Dayjs; reason?: string }>();

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

  // 인사발령품의서 양식 documentId 조회 (결재 작성 자동 진입에 사용)
  const personnelDocQ = useQuery({
    queryKey: ['approval', 'documents', 'active', 'personnel-order'],
    queryFn: () => approvalApi.listActiveDocuments(),
    staleTime: 60_000,
  });
  const personnelOrderDocId = useMemo(() => {
    return (personnelDocQ.data ?? []).find((d) => d.documentName === '인사발령품의서')?.documentId;
  }, [personnelDocQ.data]);

  const orgs = orgChartQ.data?.organizations ?? [];
  const orgList = useMemo(() => flattenOrg(orgs), [orgs]);
  const orgNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const o of orgList) m.set(o.orgId, o.name);
    return m;
  }, [orgList]);

  // 시뮬 직원 state - 원본 복사
  const [simMembers, setSimMembers] = useState<SimMember[]>([]);
  // 직원 정보 모달
  const [editTarget, setEditTarget] = useState<SimMember | null>(null);
  const [editForm] = Form.useForm<{ jobGradeName: string; jobTitleName?: string | null }>();

  // org-chart 처음 로드 시 simMembers 초기화
  const initSim = () => {
    setSimMembers(flattenMembers(orgs));
    message.success('시뮬 트리를 현재 상태로 초기화했습니다.');
  };
  // 컴포넌트 첫 렌더 시 한번만 초기화 (useEffect 대신 lazy 초기화)
  useMemo(() => {
    if (orgs.length > 0 && simMembers.length === 0) {
      setSimMembers(flattenMembers(orgs));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgs]);

  // 변경 사항 - simMembers vs original 비교
  const changes = useMemo<Change[]>(() => {
    const list: Change[] = [];
    for (const m of simMembers) {
      const movedOrg = m.currentOrgId !== m.originalOrgId;
      const changedGrade = m.jobGradeName !== m.originalJobGradeName;
      const changedTitle = (m.jobTitleName ?? '') !== (m.originalJobTitleName ?? '');
      if (movedOrg || changedGrade || changedTitle) {
        list.push({
          memberId: m.memberId,
          name: m.name,
          fromOrgName: movedOrg ? (orgNameById.get(m.originalOrgId) ?? m.originalOrgId) : undefined,
          toOrgName: movedOrg ? (orgNameById.get(m.currentOrgId) ?? m.currentOrgId) : undefined,
          fromJobGrade: changedGrade ? m.originalJobGradeName : undefined,
          toJobGrade: changedGrade ? m.jobGradeName : undefined,
          fromJobTitle: changedTitle ? m.originalJobTitleName : undefined,
          toJobTitle: changedTitle ? m.jobTitleName : undefined,
        });
      }
    }
    return list;
  }, [simMembers, orgNameById]);

  // 좌측 read-only 트리 (원본)
  const leftTreeData = useMemo(
    () => buildTreeData(orgs, flattenMembers(orgs), false),
    [orgs],
  );
  // 우측 시뮬 트리
  const rightTreeData = useMemo(
    () => buildTreeData(orgs, simMembers, true),
    [orgs, simMembers],
  );

  // 우측 트리 drag-drop - 직원 카드를 다른 부서로 이동
  const onDrop: TreeProps['onDrop'] = (info) => {
    const dragKey = String(info.dragNode.key);
    const dropKey = String(info.node.key);
    if (!dragKey.startsWith('member:')) {
      message.warning('직원 카드만 드래그할 수 있습니다.');
      return;
    }
    const memberId = dragKey.replace('member:', '');
    // drop target 이 org 또는 member 인 경우 분기 - member 위에 drop 하면 그 직원이 속한 org 로
    let targetOrgId: string;
    if (dropKey.startsWith('org:')) {
      targetOrgId = dropKey.replace('org:', '');
    } else if (dropKey.startsWith('member:')) {
      const targetMemberId = dropKey.replace('member:', '');
      const targetMember = simMembers.find((m) => m.memberId === targetMemberId);
      if (!targetMember) return;
      targetOrgId = targetMember.currentOrgId;
    } else {
      return;
    }
    setSimMembers((prev) =>
      prev.map((m) => (m.memberId === memberId ? { ...m, currentOrgId: targetOrgId } : m)),
    );
    const moved = simMembers.find((m) => m.memberId === memberId);
    if (moved) {
      message.success(
        `${moved.name} → ${orgNameById.get(targetOrgId) ?? targetOrgId} 이동`,
      );
    }
  };

  // 트리 노드 클릭 - 직원이면 직급 변경 모달
  const onSelect: TreeProps['onSelect'] = (keys) => {
    const k = keys[0];
    if (typeof k !== 'string' || !k.startsWith('member:')) return;
    const memberId = k.replace('member:', '');
    const target = simMembers.find((m) => m.memberId === memberId);
    if (!target) return;
    setEditTarget(target);
    editForm.setFieldsValue({
      jobGradeName: target.jobGradeName,
      jobTitleName: target.jobTitleName || null,
    });
  };

  const jobGradeOptions = useMemo(() => {
    const list = jobGradesQ.data ?? [];
    return list.map((g) => {
      const name = (g.name as string) ?? (g.jobGradeName as string) ?? '';
      return { value: name, label: name };
    });
  }, [jobGradesQ.data]);

  const jobTitleOptions = useMemo(() => {
    const list = jobTitlesQ.data ?? [];
    return list.map((t) => {
      const name = (t.name as string) ?? (t.jobTitleName as string) ?? '';
      return { value: name, label: name };
    });
  }, [jobTitlesQ.data]);

  /** 직급명 -> displayOrder 맵. displayOrder 작을수록 높은 직급 (예: 과장=1, 사원=2) */
  const jobGradeOrderByName = useMemo(() => {
    const m = new Map<string, number>();
    for (const g of jobGradesQ.data ?? []) {
      const name = (g.name as string) ?? (g.jobGradeName as string) ?? '';
      const order = typeof g.displayOrder === 'number' ? g.displayOrder : 999;
      if (name) m.set(name, order);
    }
    return m;
  }, [jobGradesQ.data]);

  /** 변경 사항 유형 분석 -> orderCategory 결정 (옵션 B: 양식은 항상 "인사발령품의서") */
  type OrderCategory = 'TRANSFER' | 'PROMOTION' | 'DEMOTION' | 'MIXED' | 'REGULAR';
  function resolveOrderCategory(): OrderCategory {
    if (changes.length === 0) return 'REGULAR';
    let onlyTransfer = true;
    let onlyPromotion = true;
    let onlyDemotion = true;
    let hasMixedPerMember = false;
    for (const c of changes) {
      const movedOrg = !!(c.fromOrgName && c.toOrgName);
      const changedGrade = !!(c.fromJobGrade && c.toJobGrade);
      if (movedOrg && changedGrade) hasMixedPerMember = true;
      if (!movedOrg) onlyTransfer = false;
      if (!changedGrade) {
        onlyPromotion = false;
        onlyDemotion = false;
      } else {
        const before = jobGradeOrderByName.get(c.fromJobGrade ?? '') ?? 999;
        const after = jobGradeOrderByName.get(c.toJobGrade ?? '') ?? 999;
        if (after >= before) onlyPromotion = false;
        if (after <= before) onlyDemotion = false;
      }
    }
    if (changes.length === 1 && hasMixedPerMember) return 'MIXED';
    if (hasMixedPerMember) return 'REGULAR';
    if (onlyTransfer) return 'TRANSFER';
    if (onlyPromotion) return 'PROMOTION';
    if (onlyDemotion) return 'DEMOTION';
    return 'REGULAR';
  }
  const orderCategoryLabel: Record<OrderCategory, string> = {
    TRANSFER: '전보',
    PROMOTION: '승진',
    DEMOTION: '강등',
    MIXED: '승진+전보',
    REGULAR: '정기 인사발령',
  };

  return (
    <Space direction="vertical" className="tw-w-full" size={16}>
      <div>
        <Typography.Title level={4} className="!tw-m-0">
          조직 개편 시뮬레이션
        </Typography.Title>
        <Typography.Paragraph type="secondary" className="!tw-mb-0 !tw-mt-1 !tw-text-sm">
          좌측 현재 조직도 ↔ 우측 시뮬 트리. 우측에서 직원을 드래그해 다른 부서로 이동하거나 노드를
          클릭해 직급을 변경하세요. <b>실제 발령은 [전자결재로 올리기]</b>로 결재 통과 시 적용됩니다 (Phase 2).
        </Typography.Paragraph>
      </div>

      <Space wrap>
        <Button onClick={initSim}>시뮬 초기화 (현재 상태로 리셋)</Button>
        <Button
          type="primary"
          disabled={changes.length === 0}
          onClick={() => {
            submitForm.setFieldsValue({
              effectiveDate: dayjs().add(7, 'day'),
              reason: '',
            });
            setSubmitOpen(true);
          }}
        >
          전자결재로 올리기 ({changes.length}건)
        </Button>
      </Space>

      <div className="tw-grid tw-grid-cols-1 lg:tw-grid-cols-2 tw-gap-3">
        <Card title="현재 조직도" size="small" loading={orgChartQ.isLoading}>
          {leftTreeData.length === 0 ? (
            <Empty description="조직 데이터 없음" />
          ) : (
            <Tree
              treeData={leftTreeData}
              defaultExpandAll
              selectable={false}
              showIcon={false}
              blockNode
            />
          )}
        </Card>
        <Card title="시뮬 트리 (drag-drop / 클릭하여 직급 변경)" size="small">
          {rightTreeData.length === 0 ? (
            <Empty description="조직 데이터 없음" />
          ) : (
            <Tree
              treeData={rightTreeData}
              defaultExpandAll
              draggable
              blockNode
              onDrop={onDrop}
              onSelect={onSelect}
              showIcon={false}
            />
          )}
        </Card>
      </div>

      <Card title={`변경 사항 (${changes.length}건)`} size="small">
        {changes.length === 0 ? (
          <Alert
            type="info"
            showIcon
            message="아직 변경 사항이 없습니다."
            description="우측 시뮬 트리에서 직원을 드래그하거나 직급을 변경해보세요."
          />
        ) : (
          <ul className="tw-space-y-1.5 tw-mb-0 tw-pl-0">
            {changes.map((c) => (
              <li key={c.memberId} className="tw-flex tw-items-center tw-gap-2 tw-text-sm">
                <Tag color="blue">{c.name}</Tag>
                {c.fromOrgName && c.toOrgName && (
                  <span>
                    부서 <Tag>{c.fromOrgName}</Tag> →{' '}
                    <Tag color="processing">{c.toOrgName}</Tag>
                  </span>
                )}
                {c.fromJobGrade != null && c.toJobGrade != null && (
                  <span>
                    직급 <Tag>{c.fromJobGrade || '-'}</Tag> →{' '}
                    <Tag color="gold">{c.toJobGrade || '-'}</Tag>
                  </span>
                )}
                {c.fromJobTitle !== undefined && c.toJobTitle !== undefined && (
                  <span>
                    직책 <Tag>{c.fromJobTitle || '-'}</Tag> →{' '}
                    <Tag color="purple">{c.toJobTitle || '-'}</Tag>
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* 전자결재 신청 모달 - 효력일 + 사유 입력 후 결재 페이지로 prefill 데이터와 함께 이동 */}
      <Modal
        open={submitOpen}
        title="인사발령 전자결재 신청"
        onCancel={() => setSubmitOpen(false)}
        onOk={() => submitForm.submit()}
        okText="결재 작성으로 이동"
        cancelText="취소"
        destroyOnHidden
        width={560}
      >
        <Form<{ effectiveDate: Dayjs; reason?: string }>
          form={submitForm}
          layout="vertical"
          onFinish={(v) => {
            // 변경 사항 -> 인사발령품의서 contentJson items 로 packing
            // items 는 BE cascade 용 (memberId 등 ID 포함, 사용자에게는 노출 X)
            const items = changes.map((c) => {
              const sm = simMembers.find((m) => m.memberId === c.memberId);
              const movedOrg = !!(c.fromOrgName && c.toOrgName);
              const changedGrade = !!(c.fromJobGrade && c.toJobGrade);
              const changedTitle = !!(c.fromJobTitle !== undefined && c.toJobTitle !== undefined);
              // 두 가지 이상 동시 변경이거나 직책 변경이 부서/직급과 섞인 경우 ROLE_CHANGE
              // 부서만 -> TRANSFER / 직급만 -> PROMOTION or DEMOTION (FE 가 정확히 모르니 PROMOTION 으로 통일)
              // 직책만 -> REASSIGN
              const flags = [movedOrg, changedGrade, changedTitle].filter(Boolean).length;
              let orderType: 'TRANSFER' | 'PROMOTION' | 'REASSIGN' | 'ROLE_CHANGE';
              if (flags >= 2) orderType = 'ROLE_CHANGE';
              else if (movedOrg) orderType = 'TRANSFER';
              else if (changedGrade) orderType = 'PROMOTION';
              else orderType = 'REASSIGN';
              return {
                memberId: c.memberId,
                memberName: c.name,
                orderType,
                beforeOrganizationId: sm?.originalOrgId ?? null,
                afterOrganizationId: sm?.currentOrgId ?? null,
                beforeOrganizationName: c.fromOrgName ?? null,
                afterOrganizationName: c.toOrgName ?? null,
                beforeJobGradeName: c.fromJobGrade ?? null,
                afterJobGradeName: c.toJobGrade ?? null,
                beforeJobTitleName: c.fromJobTitle ?? null,
                afterJobTitleName: c.toJobTitle ?? null,
                reason: v.reason ?? null,
              };
            });
            const orderCategory = resolveOrderCategory();
            // 사용자 노출용 한글 요약 (UUID 등 ID 제외, 부서명/이름/직급만)
            const summaryLines = changes.map((c) => {
              const parts: string[] = [`${c.name}`];
              if (c.fromOrgName && c.toOrgName) parts.push(`부서: ${c.fromOrgName} -> ${c.toOrgName}`);
              if (c.fromJobGrade && c.toJobGrade) parts.push(`직급: ${c.fromJobGrade || '-'} -> ${c.toJobGrade || '-'}`);
              if (c.fromJobTitle !== undefined && c.toJobTitle !== undefined) {
                parts.push(`직책: ${c.fromJobTitle || '-'} -> ${c.toJobTitle || '-'}`);
              }
              return `- ${parts.join(' / ')}`;
            });
            const summaryText = [
              `발령 종류: ${orderCategoryLabel[orderCategory]}`,
              `효력 시작일: ${v.effectiveDate.format('YYYY-MM-DD')}`,
              `대상자: ${changes.length}명`,
              '',
              '[변경 내역]',
              ...summaryLines,
              ...(v.reason ? ['', `사유: ${v.reason}`] : []),
            ].join('\n');
            // 인사발령품의서 = OFFICIAL (공문). 결재 승인 후 기안자가 [발송] 누르면
            // 회사 모든 부서에 자동 배포되도록 recipients 미리 채워서 보냄
            const recipients = orgList.map((o) => ({
              recipientOrganizationId: o.orgId,
              recipientOrganizationName: o.name,
            }));
            const payload = {
              documentName: '인사발령품의서',
              contentJson: {
                effectiveDate: v.effectiveDate.format('YYYY-MM-DD'),
                orderCategory,
                orderCategoryLabel: orderCategoryLabel[orderCategory],
                reason: v.reason ?? null,
                summaryText,
                items,
              },
              recipients,
            };
            // localStorage 사용 - iframe 모달도 부모와 동일 origin 으로 접근 가능
            localStorage.setItem(
              PERSONNEL_ORDER_PREFILL_STORAGE_KEY,
              JSON.stringify(payload),
            );
            setSubmitOpen(false);
            // 인사발령품의서 양식이 등록되어 있으면 결재 작성 모달로 자동 진입
            if (personnelOrderDocId) {
              message.success('인사발령품의서 작성 화면으로 이동합니다. 결재선만 지정해 신청하세요.');
              void navigate({
                to: '/app/approvals',
                search: {
                  tab: 'compose',
                  docId: personnelOrderDocId,
                  autoCompose: '1',
                  sideNav: 'request-compose',
                },
              });
            } else {
              message.warning('인사발령품의서 양식이 등록되어 있지 않습니다. 결재 양식 관리에서 확인하세요.');
              void navigate({ to: '/app/approvals' });
            }
          }}
        >
          <Alert
            type="info"
            showIcon
            className="!tw-mb-3"
            message={`${changes.length}명에 대한 [인사발령품의서 - ${orderCategoryLabel[resolveOrderCategory()]}] 결재 신청합니다.`}
            description="양식은 [인사발령품의서] 1개를 사용하며, 종류(전보/승진/강등/복합/정기)는 결재 내용에 자동 기록됩니다. 결재 통과 시 직원 부서/직급/직책이 변경되고 발령 이력이 누적됩니다."
          />
          <Form.Item
            label="효력 시작일"
            name="effectiveDate"
            rules={[{ required: true, message: '효력일을 선택하세요.' }]}
          >
            <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
          </Form.Item>
          <Form.Item label="발령 사유 / 비고 (선택)" name="reason">
            <Input.TextArea
              rows={3}
              maxLength={500}
              placeholder="예: 2026 상반기 조직개편에 따른 인사이동"
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* 직급 변경 모달 */}
      <Modal
        open={editTarget !== null}
        title={editTarget ? `${editTarget.name} 정보 변경` : ''}
        onCancel={() => setEditTarget(null)}
        onOk={() => {
          editForm.submit();
        }}
        okText="적용"
        cancelText="취소"
        destroyOnHidden
      >
        {editTarget && (
          <Form
            form={editForm}
            layout="vertical"
            initialValues={{
              jobGradeName: editTarget.jobGradeName,
              jobTitleName: editTarget.jobTitleName || null,
            }}
            onFinish={(v) => {
              const newTitle = (v.jobTitleName ?? '').trim();
              setSimMembers((prev) =>
                prev.map((m) =>
                  m.memberId === editTarget.memberId
                    ? { ...m, jobGradeName: v.jobGradeName, jobTitleName: newTitle }
                    : m,
                ),
              );
              setEditTarget(null);
              const titleNote = newTitle !== editTarget.jobTitleName
                ? ` / 직책 → ${newTitle || '—'}`
                : '';
              message.success(`${editTarget.name} 직급 → ${v.jobGradeName}${titleNote}`);
            }}
          >
            <Form.Item
              label={`현재 부서: ${orgNameById.get(editTarget.currentOrgId) ?? '—'}`}
            >
              <Typography.Text type="secondary" className="!tw-text-xs">
                부서 이동은 트리에서 드래그로 처리하세요.
              </Typography.Text>
            </Form.Item>
            <Form.Item
              label="직급"
              name="jobGradeName"
              rules={[{ required: true, message: '직급을 선택하세요.' }]}
            >
              <Select options={jobGradeOptions} placeholder="직급 선택" allowClear />
            </Form.Item>
            <Form.Item
              label="직책 (선택)"
              name="jobTitleName"
              extra="비우면 직책 없음으로 변경됩니다."
            >
              <Select
                options={jobTitleOptions}
                placeholder="직책 선택 (없으면 비움)"
                allowClear
              />
            </Form.Item>
          </Form>
        )}
      </Modal>
    </Space>
  );
}
