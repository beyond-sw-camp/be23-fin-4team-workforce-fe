import { ArrowLeftOutlined, PlusOutlined } from '@ant-design/icons';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  App,
  Button,
  Card,
  DatePicker,
  Divider,
  Input,
  Modal,
  Space,
  Table,
  Tabs,
  Tag,
  Tree,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { DataNode } from 'antd/es/tree';
import clsx from 'clsx';
import dayjs, { type Dayjs } from 'dayjs';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { useNavigate, useRouterState } from '@tanstack/react-router';
import { absenceProxyApi, type AbsenceProxyRecord } from '@/features/approvals/api/absenceProxyApi';
import {
  buildOrgTreeWithMemberLeaves,
  flattenDirectMembersDeduped,
} from '@/features/approvals/lib/approvalOrgTree';
import { APPROVAL_ORG_DRAG_MIME, ApprovalOrgDropZone } from '@/features/approvals/ui/ApprovalOrgDropZone';
import { useAuth } from '@/features/auth/useAuth';
import { memberApi, type MemberListItemForApproval } from '@/features/member/api/memberApi';
import { organizationApi } from '@/features/organization/api/organizationApi';
import { parseApiError } from '@/shared/api/error-parser';

/** `toISOString()`은 UTC로 바뀌어 한국 등 로컬 '오늘'이 전날로 밀릴 수 있음 — LocalDateTime용 로컬 벽시각 */
function toLocalDateTimePayload(d: Dayjs): string {
  return d.format('YYYY-MM-DDTHH:mm:ss');
}

function formatRange(start: string, end: string) {
  const a = dayjs(start);
  const b = dayjs(end);
  if (!a.isValid() || !b.isValid()) return `${start} ~ ${end}`;
  return `${a.format('YYYY-MM-DD HH:mm')} ~ ${b.format('YYYY-MM-DD HH:mm')}`;
}

function proxyStatusTag(row: AbsenceProxyRecord) {
  if (row.isActiveYn !== 'Y') {
    return <Tag>취소됨</Tag>;
  }
  const now = dayjs();
  const start = dayjs(row.startDate);
  const end = dayjs(row.endDate);
  if (!start.isValid() || !end.isValid()) {
    return <Tag color="processing">활성</Tag>;
  }
  if (now.isBefore(start)) {
    return <Tag color="blue">예약</Tag>;
  }
  if (now.isAfter(end)) {
    return <Tag color="default">기간 종료</Tag>;
  }
  return <Tag color="success">진행 중</Tag>;
}

export function AbsenceProxyPage() {
  const { message, modal } = App.useApp();
  const navigate = useNavigate();
  const routeSearch = useRouterState({
    select: (s) => s.location.search as { embed?: string },
  });
  const isEmbedModal = routeSearch.embed === 'compose-modal';
  const { user } = useAuth();
  const myMemberId = user?.id?.trim();
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [pickerRange, setPickerRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);
  const [substitutePickerKeyword, setSubstitutePickerKeyword] = useState('');
  const [orgTreeSelectedKey, setOrgTreeSelectedKey] = useState<string>();
  const [selectedSubstitute, setSelectedSubstitute] = useState<MemberListItemForApproval | null>(null);

  const {
    data: mine = [],
    isFetching: mineLoading,
    isError: mineIsError,
    error: mineErr,
    refetch: refetchMine,
  } = useQuery({
    queryKey: ['approval', 'absence-proxy', 'my'],
    queryFn: () => absenceProxyApi.listMine(),
    retry: 1,
    staleTime: 0,
    refetchOnMount: 'always',
  });

  const {
    data: delegated = [],
    isFetching: delegatedLoading,
    isError: delegatedIsError,
    error: delegatedErr,
    refetch: refetchDelegated,
  } = useQuery({
    queryKey: ['approval', 'absence-proxy', 'delegated'],
    queryFn: () => absenceProxyApi.listDelegatedToMe(),
    retry: 1,
    staleTime: 0,
    refetchOnMount: 'always',
  });

  const { data: orgChart } = useQuery({
    queryKey: ['organization', 'org-chart'],
    queryFn: () => organizationApi.getOrgChart(),
    enabled: createOpen,
    staleTime: 60_000,
  });

  const orgTreeDataWithMembers = useMemo<DataNode[]>(
    () => buildOrgTreeWithMemberLeaves(orgChart?.organizations ?? []),
    [orgChart],
  );

  const orgPickerSearchMembers = useMemo(
    () => flattenDirectMembersDeduped(orgChart?.organizations ?? []),
    [orgChart],
  );

  const orgPickerSearchMatches = useMemo(() => {
    const q = substitutePickerKeyword.trim().toLowerCase();
    if (!q) return [];
    return orgPickerSearchMembers.filter((m) =>
      `${m.name} ${m.jobTitleName} ${m.organizationName}`.toLowerCase().includes(q),
    );
  }, [substitutePickerKeyword, orgPickerSearchMembers]);

  const pickSubstituteByMemberId = useCallback(
    async (memberId: string) => {
      const mid = memberId?.trim();
      if (!mid) return;
      if (myMemberId && mid === myMemberId) {
        message.warning('본인은 대결자로 지정할 수 없습니다.');
        return;
      }
      try {
        const detail = await memberApi.detail(mid);
        const positionId = detail.memberPositionId?.trim();
        if (!positionId) {
          message.warning('선택 멤버의 직위 정보를 찾을 수 없습니다.');
          return;
        }
        setSelectedSubstitute({
          memberId: mid,
          memberPositionId: positionId,
          name: detail.name || mid,
          organizationName: detail.organizationName || '',
          jobTitleName: detail.jobTitleName || '',
        });
      } catch (e) {
        message.error(e instanceof Error ? e.message : '멤버 정보를 불러오지 못했습니다.');
      }
    },
    [message, myMemberId],
  );

  const memberIdSet = useMemo(() => {
    const s = new Set<string>();
    for (const r of mine) {
      if (r.substituteId) s.add(r.substituteId);
    }
    for (const r of delegated) {
      if (r.memberId) s.add(r.memberId);
    }
    return [...s];
  }, [mine, delegated]);

  const nameQueries = useQueries({
    queries: memberIdSet.map((id) => ({
      queryKey: ['member', 'detail', 'absence-proxy-label', id],
      queryFn: () => memberApi.detail(id),
      enabled: Boolean(id),
      staleTime: 5 * 60_000,
    })),
  });

  const memberNameById = useMemo(() => {
    const map = new Map<string, string>();
    memberIdSet.forEach((id, i) => {
      const name = nameQueries[i]?.data?.name?.trim();
      if (name) map.set(id, name);
    });
    return map;
  }, [memberIdSet, nameQueries]);

  const createMut = useMutation({
    mutationFn: absenceProxyApi.create,
    onSuccess: async (created) => {
      message.success('부재 위임을 등록했습니다.');
      setCreateOpen(false);
      setSelectedSubstitute(null);
      setPickerRange(null);
      setSubstitutePickerKeyword('');
      setOrgTreeSelectedKey(undefined);
      await qc.refetchQueries({ queryKey: ['approval', 'absence-proxy', 'my'] });
      const mineAfter = qc.getQueryData<AbsenceProxyRecord[]>(['approval', 'absence-proxy', 'my']);
      const hasCreated = mineAfter?.some((r) => r.proxyId === created.proxyId);
      if (!hasCreated) {
        qc.setQueryData<AbsenceProxyRecord[]>(['approval', 'absence-proxy', 'my'], (prev) => {
          const list = prev ?? [];
          if (list.some((r) => r.proxyId === created.proxyId)) return list;
          return [created, ...list];
        });
      }
      await qc.refetchQueries({ queryKey: ['approval', 'absence-proxy', 'delegated'] });
      await qc.invalidateQueries({ queryKey: ['approval-user', 'pending-approvals'] });
    },
    onError: (e: unknown) => {
      const err = e as { response?: { data?: { message?: string } } };
      const m = err?.response?.data?.message;
      message.error(typeof m === 'string' && m.trim() ? m : '등록에 실패했습니다. 조건을 확인해 주세요.');
    },
  });

  const deactivateMut = useMutation({
    mutationFn: absenceProxyApi.deactivate,
    onSuccess: async () => {
      message.success('위임을 취소했습니다.');
      await Promise.all([
        qc.refetchQueries({ queryKey: ['approval', 'absence-proxy', 'my'] }),
        qc.refetchQueries({ queryKey: ['approval', 'absence-proxy', 'delegated'] }),
      ]);
      await qc.invalidateQueries({ queryKey: ['approval-user', 'pending-approvals'] });
    },
    onError: () => message.error('취소에 실패했습니다.'),
  });

  const mineColumns: ColumnsType<AbsenceProxyRecord> = [
    {
      title: '대결자',
      key: 'sub',
      render: (_, row) => memberNameById.get(row.substituteId) ?? row.substituteId,
    },
    {
      title: '위임 기간',
      key: 'range',
      width: 320,
      render: (_, row) => formatRange(row.startDate, row.endDate),
    },
    {
      title: '상태',
      key: 'st',
      width: 110,
      render: (_, row) => proxyStatusTag(row),
    },
    {
      title: '관리',
      key: 'act',
      width: 100,
      render: (_, row) => (
        <Button
          type="link"
          size="small"
          danger
          disabled={row.isActiveYn !== 'Y' || deactivateMut.isPending}
          onClick={() => {
            modal.confirm({
              title: '위임을 취소할까요?',
              content: '즉시 대결 권한이 해제되며, 아직 처리하지 않은 건은 원 결재자 흐름으로 돌아갑니다.',
              okText: '취소하기',
              okButtonProps: { danger: true },
              cancelText: '닫기',
              onOk: () => deactivateMut.mutateAsync(row.proxyId),
            });
          }}
        >
          위임 취소
        </Button>
      ),
    },
  ];

  const delegatedColumns: ColumnsType<AbsenceProxyRecord> = [
    {
      title: '부재자',
      key: 'absent',
      render: (_, row) => memberNameById.get(row.memberId) ?? row.memberId,
    },
    {
      title: '위임 기간',
      key: 'range',
      width: 320,
      render: (_, row) => formatRange(row.startDate, row.endDate),
    },
    {
      title: '상태',
      key: 'st',
      width: 110,
      render: (_, row) => proxyStatusTag(row),
    },
  ];

  const submitCreate = () => {
    if (!selectedSubstitute) {
      message.warning('대결자를 선택해 주세요.');
      return;
    }
    const range = pickerRange;
    if (!range?.[0] || !range[1]) {
      message.warning('위임 시작·종료 일시를 선택해 주세요.');
      return;
    }
    const [start, end] = range;
    if (!end.isAfter(start)) {
      message.warning('종료 일시는 시작 이후여야 합니다.');
      return;
    }
    createMut.mutate({
      substituteId: selectedSubstitute.memberId,
      startDate: toLocalDateTimePayload(start),
      endDate: toLocalDateTimePayload(end),
    });
  };

  const tabTableWrap = (node: ReactNode) => (
    <div
      className={clsx(
        isEmbedModal &&
          'tw-box-border tw-flex tw-h-full tw-min-h-0 tw-flex-1 tw-flex-col tw-overflow-auto tw-p-4 tw-pt-3',
      )}
    >
      {node}
    </div>
  );

  return (
    <div
      className={clsx(
        isEmbedModal
          ? 'tw-flex tw-h-full tw-min-h-0 tw-w-full tw-flex-col tw-gap-4 tw-overflow-hidden'
          : 'tw-mx-auto tw-max-w-5xl',
      )}
    >
      <div
        className={clsx(
          isEmbedModal
            ? 'tw-flex tw-flex-shrink-0 tw-flex-col tw-gap-3'
            : 'tw-mb-4 tw-flex tw-flex-wrap tw-items-start tw-justify-between tw-gap-3',
        )}
      >
        <div>
          <div className="tw-flex tw-flex-nowrap tw-items-center tw-gap-2">
            {!isEmbedModal ? (
              <Button
                type="text"
                icon={<ArrowLeftOutlined />}
                aria-label="전자결재로 돌아가기"
                className="!tw-shrink-0 !tw-text-slate-600 hover:!tw-text-slate-900"
                onClick={() =>
                  navigate({
                    to: '/app/approvals',
                    search: { tab: 'compose', sideNav: 'request-compose' },
                    replace: true,
                  })
                }
              />
            ) : null}
            <Typography.Title level={4} className="!tw-m-0 tw-leading-none">
              부재 위임(대결)
            </Typography.Title>
          </div>
          <Typography.Paragraph type="secondary" className="!tw-mb-0 !tw-mt-2 tw-max-w-xl tw-text-sm">
            휴가·출장 등 부재 시 대결자를 지정하면, 해당 기간 동안 원 결재자 대신 결재 대기함에 문서가 표시되고 승인·반려할 수 있습니다.
          </Typography.Paragraph>
        </div>
        {isEmbedModal ? (
          <div className="tw-flex tw-w-full tw-shrink-0 tw-justify-end tw-pr-1">
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
              위임 등록
            </Button>
          </div>
        ) : (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
            위임 등록
          </Button>
        )}
      </div>

      {mineIsError || delegatedIsError ? (
        <Alert
          type="error"
          showIcon
          className={clsx(isEmbedModal ? 'tw-flex-shrink-0' : 'tw-mb-4')}
          message="위임 목록을 불러오지 못했습니다."
          description={
            <div className="tw-space-y-1">
              {mineIsError ? (
                <div>
                  <strong>내가 등록한 위임:</strong> {parseApiError(mineErr).message}
                </div>
              ) : null}
              {delegatedIsError ? (
                <div>
                  <strong>나에게 위임된 목록:</strong> {parseApiError(delegatedErr).message}
                </div>
              ) : null}
            </div>
          }
          action={
            <Button
              size="small"
              onClick={() => {
                void refetchMine();
                void refetchDelegated();
              }}
            >
              다시 시도
            </Button>
          }
        />
      ) : null}

      <Card
        size="small"
        className={clsx(
          'tw-border-slate-200/80 tw-shadow-sm',
          isEmbedModal && 'tw-flex tw-min-h-0 tw-flex-1 tw-flex-col tw-overflow-hidden tw-rounded-lg',
        )}
        styles={
          isEmbedModal
            ? { body: { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', padding: 0 } }
            : undefined
        }
      >
        <Tabs
          rootClassName={
            isEmbedModal
              ? clsx(
                  'tw-min-h-0 tw-flex-1 tw-flex tw-flex-col',
                  '[&_.ant-tabs]:tw-mb-0 [&_.ant-tabs]:tw-flex [&_.ant-tabs]:tw-h-full [&_.ant-tabs]:tw-min-h-0 [&_.ant-tabs]:tw-flex-col',
                  '[&_.ant-tabs-nav]:tw-mb-0 [&_.ant-tabs-nav]:tw-shrink-0 [&_.ant-tabs-nav]:tw-px-4 [&_.ant-tabs-nav]:tw-pt-1',
                  '[&_.ant-tabs-content-holder]:tw-min-h-0 [&_.ant-tabs-content-holder]:tw-flex-1 [&_.ant-tabs-content-holder]:tw-flex [&_.ant-tabs-content-holder]:tw-flex-col',
                  '[&_.ant-tabs-content]:tw-min-h-0 [&_.ant-tabs-content]:tw-flex-1 [&_.ant-tabs-content]:tw-flex [&_.ant-tabs-content]:tw-flex-col',
                  '[&_.ant-tabs-tabpane.ant-tabs-tabpane-active]:tw-flex [&_.ant-tabs-tabpane.ant-tabs-tabpane-active]:tw-min-h-0 [&_.ant-tabs-tabpane.ant-tabs-tabpane-active]:tw-flex-1 [&_.ant-tabs-tabpane.ant-tabs-tabpane-active]:tw-flex-col',
                )
              : undefined
          }
          items={[
            {
              key: 'mine',
              label: '내가 등록한 위임',
              children: tabTableWrap(
                <Table<AbsenceProxyRecord>
                  rowKey="proxyId"
                  loading={mineLoading}
                  columns={mineColumns}
                  dataSource={mine}
                  pagination={{ pageSize: 8 }}
                  locale={{ emptyText: '등록된 위임이 없습니다.' }}
                  className={isEmbedModal ? '[&_.ant-table-wrapper]:tw-min-h-0' : undefined}
                />,
              ),
            },
            {
              key: 'delegated',
              label: '나에게 위임된 목록',
              children: tabTableWrap(
                <Table<AbsenceProxyRecord>
                  rowKey="proxyId"
                  loading={delegatedLoading}
                  columns={delegatedColumns}
                  dataSource={delegated}
                  pagination={{ pageSize: 8 }}
                  locale={{ emptyText: '나에게 위임된 일정이 없습니다.' }}
                  className={isEmbedModal ? '[&_.ant-table-wrapper]:tw-min-h-0' : undefined}
                />,
              ),
            },
          ]}
        />
      </Card>

      <Modal
        title="부재 위임 등록"
        open={createOpen}
        onCancel={() => {
          setCreateOpen(false);
          setSelectedSubstitute(null);
          setPickerRange(null);
          setSubstitutePickerKeyword('');
          setOrgTreeSelectedKey(undefined);
        }}
        okText="등록"
        confirmLoading={createMut.isPending}
        onOk={() => submitCreate()}
        width={640}
        destroyOnHidden
      >
        <Space direction="vertical" size="middle" className="tw-w-full">
          <div>
            <Typography.Text className="tw-mb-1 tw-block tw-text-sm tw-font-medium">위임 기간</Typography.Text>
            <DatePicker.RangePicker
              showTime={{ format: 'HH:mm' }}
              format="YYYY-MM-DD HH:mm"
              className="tw-w-full"
              value={pickerRange}
              onChange={(v) => setPickerRange(v as [Dayjs | null, Dayjs | null] | null)}
              disabledDate={(current) => Boolean(current && current.isBefore(dayjs(), 'day'))}
            />
            <Typography.Paragraph type="secondary" className="!tw-mt-1 !tw-mb-0 !tw-text-xs">
              오늘 포함 이후 날짜만 선택할 수 있습니다(과거 일자는 불가). 종료는 시작보다 뒤여야 합니다. 기존 위임과 기간이 겹치면 등록할 수 없습니다.
            </Typography.Paragraph>
          </div>
          <div>
            <Typography.Text className="tw-mb-1 tw-block tw-text-sm tw-font-medium">대결자 선택</Typography.Text>
            <Typography.Paragraph type="secondary" className="!tw-mb-2 !tw-mt-0 !tw-text-xs">
              결재 작성 화면과 같이 조직도에서 멤버를 드래그해 오른쪽 칸에 놓거나, 멤버 노드를 클릭해 선택하세요. 조직 단위는
              지정할 수 없습니다.
            </Typography.Paragraph>
            <div className="tw-grid tw-grid-cols-1 tw-gap-4 lg:tw-grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <Card size="small" title="조직도" variant="borderless" className="tw-shadow-none tw-bg-transparent">
                <Input
                  value={substitutePickerKeyword}
                  onChange={(e) => setSubstitutePickerKeyword(e.target.value)}
                  placeholder="이름, 직위, 부서 검색"
                  className="tw-mb-2"
                />
                <div className="tw-max-h-[min(40vh,320px)] tw-overflow-auto tw-rounded-md tw-border tw-border-slate-100 tw-bg-white tw-p-1">
                  <Tree
                    showLine
                    blockNode
                    expandAction="click"
                    treeData={orgTreeDataWithMembers}
                    selectedKeys={
                      orgTreeSelectedKey && !String(orgTreeSelectedKey).startsWith('member:')
                        ? [orgTreeSelectedKey]
                        : []
                    }
                    onSelect={(keys) => {
                      const key = typeof keys[0] === 'string' ? keys[0] : undefined;
                      if (!key) {
                        setOrgTreeSelectedKey(undefined);
                        return;
                      }
                      if (key.startsWith('member:')) {
                        const rest = key.slice('member:'.length);
                        const ci = rest.indexOf(':');
                        const memberId = ci === -1 ? '' : rest.slice(ci + 1);
                        if (memberId) void pickSubstituteByMemberId(memberId);
                        setOrgTreeSelectedKey(undefined);
                        return;
                      }
                      setOrgTreeSelectedKey(key);
                    }}
                    titleRender={(nodeData) => {
                      const key = String(nodeData.key);
                      const isMember = key.startsWith('member:');
                      const dragPayload = isMember
                        ? (() => {
                            const rest = key.slice('member:'.length);
                            const ci = rest.indexOf(':');
                            const memberId = ci === -1 ? '' : rest.slice(ci + 1);
                            return { kind: 'member' as const, memberId };
                          })()
                        : { kind: 'org' as const, organizationId: key };
                      return (
                        <span
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData(APPROVAL_ORG_DRAG_MIME, JSON.stringify(dragPayload));
                            e.dataTransfer.effectAllowed = 'copy';
                          }}
                          className="tw-inline-flex tw-cursor-grab tw-select-none tw-items-center tw-gap-1"
                        >
                          {nodeData.title as ReactNode}
                        </span>
                      );
                    }}
                  />
                </div>
                <Divider className="!tw-my-3" />
                <Typography.Text type="secondary" className="tw-mb-2 tw-block tw-text-xs">
                  검색 결과 (드래그하여 추가)
                </Typography.Text>
                <Space direction="vertical" className="tw-w-full" size={6}>
                  {substitutePickerKeyword.trim() ? (
                    orgPickerSearchMatches.length ? (
                      orgPickerSearchMatches
                        .filter((m) => !myMemberId || m.memberId !== myMemberId)
                        .map((m) => (
                          <div
                            key={m.memberId}
                            draggable
                            onDragStart={(e) => {
                              e.dataTransfer.setData(
                                APPROVAL_ORG_DRAG_MIME,
                                JSON.stringify({ kind: 'member' as const, memberId: m.memberId }),
                              );
                              e.dataTransfer.effectAllowed = 'copy';
                            }}
                            className="tw-flex tw-cursor-grab tw-select-none tw-items-center tw-rounded-lg tw-bg-slate-50/70 tw-px-2 tw-py-1.5 tw-transition-colors hover:tw-bg-slate-100/80"
                          >
                            <span className="tw-truncate tw-pr-2 tw-text-sm">
                              {m.name} {m.jobTitleName ? `(${m.jobTitleName})` : ''}
                              <span className="tw-text-slate-500"> · {m.organizationName}</span>
                            </span>
                          </div>
                        ))
                    ) : (
                      <Typography.Text type="secondary" className="tw-text-xs">
                        검색 결과가 없습니다.
                      </Typography.Text>
                    )
                  ) : (
                    <Typography.Text type="secondary" className="tw-text-xs">
                      이름·직위·부서로 검색한 결과를 드래그하거나, 트리에서 바로 드래그하세요.
                    </Typography.Text>
                  )}
                </Space>
              </Card>
              <ApprovalOrgDropZone
                onDropMember={(id) => void pickSubstituteByMemberId(id)}
                onDropOrg={() =>
                  message.info('대결자는 멤버 한 명만 지정할 수 있습니다. 조직이 아닌 사람을 드래그해 주세요.')
                }
              >
                <Card size="small" title="대결자" variant="borderless" className="tw-min-h-[200px] tw-shadow-none tw-bg-transparent">
                  {selectedSubstitute ? (
                    <div className="tw-space-y-2">
                      <div>
                        <span className="tw-font-medium">{selectedSubstitute.name}</span>
                        {selectedSubstitute.jobTitleName ? (
                          <span className="tw-text-slate-600"> ({selectedSubstitute.jobTitleName})</span>
                        ) : null}
                        <div className="tw-text-xs tw-text-slate-500">{selectedSubstitute.organizationName}</div>
                      </div>
                      <Button type="link" size="small" className="!tw-h-auto !tw-p-0" onClick={() => setSelectedSubstitute(null)}>
                        선택 해제
                      </Button>
                    </div>
                  ) : (
                    <Typography.Text type="secondary" className="tw-text-sm">
                      멤버를 이 영역으로 드래그해 놓으세요.
                    </Typography.Text>
                  )}
                </Card>
              </ApprovalOrgDropZone>
            </div>
          </div>
        </Space>
      </Modal>
    </div>
  );
}
