import { PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  App,
  Button,
  Card,
  DatePicker,
  Input,
  Modal,
  Space,
  Table,
  Tabs,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { type Dayjs } from 'dayjs';
import { useMemo, useState } from 'react';
import { absenceProxyApi, type AbsenceProxyRecord } from '@/features/approvals/api/absenceProxyApi';
import { useAuth } from '@/features/auth/useAuth';
import { memberApi, type MemberListItemForApproval } from '@/features/member/api/memberApi';
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
  const { user } = useAuth();
  const myMemberId = user?.id?.trim();
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [pickerRange, setPickerRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);
  const [memberKeyword, setMemberKeyword] = useState('');
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

  const { data: memberCandidates = [], isFetching: membersLoading } = useQuery({
    queryKey: ['member', 'list-approvals', 'absence-proxy', memberKeyword],
    queryFn: () => memberApi.listMembersForApprovals({ keyword: memberKeyword || undefined }),
    enabled: createOpen,
    staleTime: 30_000,
  });

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
      setMemberKeyword('');
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

  return (
    <div className="tw-mx-auto tw-max-w-5xl">
      <div className="tw-mb-4 tw-flex tw-flex-wrap tw-items-start tw-justify-between tw-gap-3">
        <div>
          <Typography.Title level={4} className="!tw-mb-1">
            부재 위임(대결)
          </Typography.Title>
          <Typography.Paragraph type="secondary" className="!tw-mb-0 tw-max-w-xl tw-text-sm">
            휴가·출장 등 부재 시 대결자를 지정하면, 해당 기간 동안 원 결재자 대신 결재 대기함에 문서가 표시되고 승인·반려할 수 있습니다.
          </Typography.Paragraph>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
          위임 등록
        </Button>
      </div>

      {mineIsError || delegatedIsError ? (
        <Alert
          type="error"
          showIcon
          className="tw-mb-4"
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

      <Card className="tw-border-slate-200/80 tw-shadow-sm">
        <Tabs
          items={[
            {
              key: 'mine',
              label: '내가 등록한 위임',
              children: (
                <Table<AbsenceProxyRecord>
                  rowKey="proxyId"
                  loading={mineLoading}
                  columns={mineColumns}
                  dataSource={mine}
                  pagination={{ pageSize: 8 }}
                  locale={{ emptyText: '등록된 위임이 없습니다.' }}
                />
              ),
            },
            {
              key: 'delegated',
              label: '나에게 위임된 목록',
              children: (
                <Table<AbsenceProxyRecord>
                  rowKey="proxyId"
                  loading={delegatedLoading}
                  columns={delegatedColumns}
                  dataSource={delegated}
                  pagination={{ pageSize: 8 }}
                  locale={{ emptyText: '나에게 위임된 일정이 없습니다.' }}
                />
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
            <Input
              allowClear
              prefix={<SearchOutlined />}
              placeholder="이름, 부서, 직위로 검색"
              value={memberKeyword}
              onChange={(e) => setMemberKeyword(e.target.value)}
              className="tw-mb-2"
            />
            <div className="tw-max-h-56 tw-overflow-auto tw-rounded-md tw-border tw-border-slate-100 tw-bg-slate-50/50">
              {membersLoading ? (
                <Typography.Text type="secondary" className="tw-block tw-p-3 tw-text-sm">
                  불러오는 중…
                </Typography.Text>
              ) : memberCandidates.length === 0 ? (
                <Typography.Text type="secondary" className="tw-block tw-p-3 tw-text-sm">
                  검색 결과가 없습니다.
                </Typography.Text>
              ) : (
                memberCandidates
                  .filter((m) => !myMemberId || m.memberId !== myMemberId)
                  .map((m) => {
                  const active = selectedSubstitute?.memberId === m.memberId;
                  return (
                    <button
                      key={m.memberPositionId}
                      type="button"
                      onClick={() => setSelectedSubstitute(m)}
                      className={`tw-block tw-w-full tw-border-0 tw-border-b tw-border-slate-100 tw-bg-transparent tw-p-2.5 tw-text-left tw-text-sm last:tw-border-b-0 hover:tw-bg-white ${
                        active ? 'tw-bg-blue-50' : ''
                      }`}
                    >
                      <span className="tw-font-medium">{m.name}</span>
                      {m.jobTitleName ? (
                        <span className="tw-text-slate-600"> ({m.jobTitleName})</span>
                      ) : null}
                      <div className="tw-text-xs tw-text-slate-500">{m.organizationName}</div>
                    </button>
                  );
                })
              )}
            </div>
            {selectedSubstitute ? (
              <Typography.Text className="!tw-mt-2 tw-block tw-text-xs tw-text-slate-600">
                선택: <strong>{selectedSubstitute.name}</strong> · {selectedSubstitute.organizationName}
              </Typography.Text>
            ) : null}
          </div>
        </Space>
      </Modal>
    </div>
  );
}
