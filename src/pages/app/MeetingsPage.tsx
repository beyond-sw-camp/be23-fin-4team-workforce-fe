import { useMemo, useState } from 'react';
import { Card, DatePicker, Empty, Form, Input, Select, Space, Table, Tag, Typography, message } from 'antd';
import { CalendarOutlined, CheckCircleOutlined, ClockCircleOutlined, LinkOutlined, TeamOutlined, UserOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/ko';
import { useAuth } from '@/features/auth/useAuth';
import { meetingApi } from '@/features/meetings/api/meetingApi';
import type { CreateMeetingPayload, MeetingRecord, RepeatCycle } from '@/features/meetings/model/types';
import { useMemberDisplayNames } from '@/features/members/hooks/useMemberDisplayNames';
import { MemberRemoteSelect } from '@/features/members/ui/MemberRemoteSelect';
import { AppDoubleActionModal } from '@/shared/ui/AppDoubleActionModal';
import { AppWorkspacePageTitle } from '@/shared/ui/AppWorkspacePageTitle';

dayjs.extend(relativeTime);
dayjs.locale('ko');

const { Text } = Typography;

const repeatLabel: Record<RepeatCycle, string> = {
  ONE_TIME: '1회',
  WEEKLY: '매주',
  BI_WEEKLY: '격주',
  MONTHLY: '매월',
  QUARTERLY: '분기',
};

const repeatOptions = Object.entries(repeatLabel).map(([value, label]) => ({ value, label }));

type MeetingScope = 'member' | 'manager';
type MeetingKind = 'all' | 'feedback' | 'general' | 'pending';

export default function MeetingsPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [scope, setScope] = useState<MeetingScope>('member');
  const [kind, setKind] = useState<MeetingKind>('all');
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [form] = Form.useForm();

  const memberQ = useQuery({
    queryKey: ['meetings', 'as-member'],
    queryFn: () => meetingApi.listMyMeetingsAsMember(),
  });
  const managerQ = useQuery({
    queryKey: ['meetings', 'as-manager'],
    queryFn: () => meetingApi.listMyMeetingsAsManager(),
  });

  const createMut = useMutation({
    mutationFn: (body: CreateMeetingPayload) => meetingApi.createMeeting(body),
    onSuccess: () => {
      message.success('면담을 예약했습니다.');
      setCreateModalOpen(false);
      form.resetFields();
      qc.invalidateQueries({ queryKey: ['meetings'] });
    },
    onError: () => message.error('면담 예약에 실패했습니다.'),
  });

  const meetings = scope === 'member' ? memberQ.data ?? [] : managerQ.data ?? [];
  const loading = scope === 'member' ? memberQ.isLoading : managerQ.isLoading;

  const filteredMeetings = useMemo(() => {
    return meetings.filter((meeting) => {
      if (kind === 'feedback') return !!meeting.relatedSeasonId;
      if (kind === 'general') return !meeting.relatedSeasonId;
      if (kind === 'pending') return !meeting.completedAt;
      return true;
    });
  }, [kind, meetings]);

  const stats = useMemo(() => {
    const feedback = meetings.filter((meeting) => !!meeting.relatedSeasonId).length;
    const pending = meetings.filter((meeting) => !meeting.completedAt).length;
    const done = meetings.filter((meeting) => !!meeting.completedAt).length;
    return { total: meetings.length, feedback, pending, done };
  }, [meetings]);

  const allPartnerIds = useMemo(() => {
    const ids = new Set<string>();
    for (const meeting of [...(memberQ.data ?? []), ...(managerQ.data ?? [])]) {
      ids.add(meeting.memberId);
      ids.add(meeting.managerId);
    }
    return [...ids];
  }, [managerQ.data, memberQ.data]);
  const { labelFor } = useMemberDisplayNames(allPartnerIds);

  const partnerField = scope === 'member' ? 'managerId' : 'memberId';
  const partnerLabel = scope === 'member' ? '매니저' : '구성원';

  return (
    <div className="tw-mx-auto tw-w-full tw-space-y-8">
      <AppWorkspacePageTitle
        eyebrow="MEETINGS"
        title="면담"
        subtitle="평가 피드백 면담과 일반 1:1 면담을 함께 관리합니다."
      />

      <section className="tw-grid tw-grid-cols-1 tw-gap-4 lg:tw-grid-cols-4">
        <StatCard label="전체 면담" value={stats.total} icon={<TeamOutlined />} />
        <StatCard label="피드백 면담" value={stats.feedback} icon={<LinkOutlined />} accent="blue" />
        <StatCard label="진행 예정" value={stats.pending} icon={<ClockCircleOutlined />} accent="amber" />
        <StatCard label="완료" value={stats.done} icon={<CheckCircleOutlined />} accent="green" />
      </section>

      <Card className="tw-rounded-2xl tw-border tw-border-slate-200/90 tw-shadow-sm tw-shadow-slate-900/5" styles={{ body: { padding: 16 } }}>
        <div className="tw-flex tw-flex-wrap tw-items-center tw-justify-between tw-gap-3">
          <div className="tw-flex tw-flex-wrap tw-gap-2">
            <FilterChip active={scope === 'member'} onClick={() => setScope('member')}>참여 면담</FilterChip>
            <FilterChip active={scope === 'manager'} onClick={() => setScope('manager')}>관리 면담</FilterChip>
          </div>
          <div className="tw-flex tw-flex-wrap tw-gap-2">
            <FilterChip active={kind === 'all'} onClick={() => setKind('all')}>전체</FilterChip>
            <FilterChip active={kind === 'feedback'} onClick={() => setKind('feedback')}>피드백 면담</FilterChip>
            <FilterChip active={kind === 'general'} onClick={() => setKind('general')}>일반 1:1</FilterChip>
            <FilterChip active={kind === 'pending'} onClick={() => setKind('pending')}>미완료</FilterChip>
          </div>
        </div>
      </Card>

      <Card className="tw-rounded-2xl tw-border tw-border-slate-200/90 tw-shadow-sm tw-shadow-slate-900/5" styles={{ body: { padding: 0 } }}>
        <Table
          rowKey="meetingRecordId"
          columns={[
            {
              title: partnerLabel,
              dataIndex: partnerField,
              key: 'partner',
              render: (id: string, record: MeetingRecord) => (
                <Space>
                  <UserOutlined />
                  <Typography.Text className="tw-font-medium">{labelFor(id)}</Typography.Text>
                  {record.relatedSeasonId && (
                    <Tag color="blue" className="!tw-rounded-full">
                      <LinkOutlined className="tw-mr-1" />
                      피드백 면담
                    </Tag>
                  )}
                </Space>
              ),
            },
            {
              title: '일정',
              dataIndex: 'scheduledAt',
              key: 'scheduledAt',
              render: (value: string) => (
                <Space>
                  <CalendarOutlined className="tw-text-slate-400" />
                  <span>{dayjs(value).format('YYYY-MM-DD (ddd) HH:mm')}</span>
                </Space>
              ),
              sorter: (a: MeetingRecord, b: MeetingRecord) => dayjs(a.scheduledAt).unix() - dayjs(b.scheduledAt).unix(),
              defaultSortOrder: 'ascend' as const,
            },
            {
              title: '반복',
              dataIndex: 'repeatCycle',
              key: 'repeatCycle',
              width: 100,
              render: (value: RepeatCycle) => <Tag>{repeatLabel[value]}</Tag>,
            },
            {
              title: '상태',
              key: 'status',
              width: 120,
              render: (_: unknown, record: MeetingRecord) => statusTag(record),
            },
            {
              title: '',
              key: 'action',
              width: 120,
              render: (_: unknown, record: MeetingRecord) => (
                <Link
                  to="/app/meetings/$meetingId"
                  params={{ meetingId: record.meetingRecordId }}
                  className="tw-font-medium tw-text-[#1e3a5f]"
                >
                  상세 보기
                </Link>
              ),
            },
          ]}
          dataSource={filteredMeetings}
          loading={loading}
          pagination={{ pageSize: 15, showSizeChanger: false }}
          locale={{
            emptyText: (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={kind === 'feedback' ? '피드백 면담이 없습니다.' : '조건에 맞는 면담이 없습니다.'}
              />
            ),
          }}
        />
      </Card>

      <Card className="tw-rounded-2xl tw-border tw-border-slate-200/90 tw-shadow-sm tw-shadow-slate-900/5" styles={{ body: { padding: 20 } }}>
        <div className="tw-flex tw-flex-wrap tw-items-center tw-justify-between tw-gap-3">
          <div>
            <div className="tw-text-base tw-font-semibold tw-text-slate-900">일반 1:1 면담 예약</div>
            <div className="tw-mt-1 tw-text-sm tw-text-slate-500">평가 피드백 면담은 결과 공개 후 자동 생성됩니다. 그 외 면담은 여기서 직접 예약합니다.</div>
          </div>
          <AppDoubleActionModal
            title="면담 예약"
            width={520}
            open={createModalOpen}
            onClose={() => setCreateModalOpen(false)}
            onConfirm={() => form.submit()}
            cancelText="취소"
            confirmText="예약"
            confirmLoading={createMut.isPending}
            destroyOnHidden
          >
            <Form
              form={form}
              layout="vertical"
              className="tw-px-5 tw-py-4"
              onFinish={(values) => {
                createMut.mutate({
                  memberId: values.memberId,
                  managerId: user?.id ?? values.memberId,
                  repeatCycle: values.repeatCycle,
                  scheduledAt: values.scheduledAt.toISOString(),
                  agenda: values.agenda,
                });
              }}
            >
              <Form.Item name="memberId" label="면담 대상" rules={[{ required: true, message: '면담 대상을 선택해 주세요.' }]}>
                <MemberRemoteSelect placeholder="이름 또는 이메일로 검색" />
              </Form.Item>
              <Form.Item name="scheduledAt" label="일시" rules={[{ required: true, message: '일시를 선택해 주세요.' }]}>
                <DatePicker showTime={{ format: 'HH:mm' }} format="YYYY-MM-DD HH:mm" className="tw-w-full" />
              </Form.Item>
              <Form.Item name="repeatCycle" label="반복 주기" initialValue="ONE_TIME" rules={[{ required: true }]}>
                <Select options={repeatOptions} />
              </Form.Item>
              <Form.Item name="agenda" label="아젠다">
                <Input.TextArea rows={3} placeholder="면담 목적이나 다루고 싶은 안건을 적어 주세요." />
              </Form.Item>
            </Form>
          </AppDoubleActionModal>
          <button
            type="button"
            onClick={() => setCreateModalOpen(true)}
            className="tw-h-10 tw-rounded-xl tw-bg-[#1e3a5f] tw-px-4 tw-text-sm tw-font-semibold tw-text-white hover:tw-bg-[#152a45]"
          >
            일반 면담 예약
          </button>
        </div>
      </Card>
    </div>
  );
}

function statusTag(record: MeetingRecord) {
  if (record.completedAt) {
    return (
      <Tag color="success" icon={<CheckCircleOutlined />}>
        완료
      </Tag>
    );
  }
  const isPast = dayjs(record.scheduledAt).isBefore(dayjs());
  return (
    <Tag color={isPast ? 'warning' : 'processing'} icon={<ClockCircleOutlined />}>
      {isPast ? '지연' : '예정'}
    </Tag>
  );
}

function StatCard({
  label,
  value,
  icon,
  accent = 'slate',
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  accent?: 'slate' | 'blue' | 'amber' | 'green';
}) {
  const accentClass = {
    slate: 'tw-text-slate-700',
    blue: 'tw-text-blue-600',
    amber: 'tw-text-amber-600',
    green: 'tw-text-emerald-600',
  }[accent];
  return (
    <Card className="tw-rounded-2xl tw-border tw-border-slate-200/90 tw-shadow-sm tw-shadow-slate-900/5" styles={{ body: { padding: 20 } }}>
      <div className="tw-mb-2 tw-flex tw-items-center tw-gap-2 tw-text-slate-500">{icon}<span>{label}</span></div>
      <div className={`tw-text-3xl tw-font-semibold tw-tabular-nums ${accentClass}`}>{value}</div>
    </Card>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? 'tw-h-9 tw-rounded-full tw-border-0 tw-bg-[#1e3a5f] tw-px-4 tw-text-sm tw-font-semibold tw-text-white hover:tw-bg-[#152a45]'
          : 'tw-h-9 tw-rounded-full tw-border tw-border-slate-200 tw-bg-white tw-px-4 tw-text-sm tw-font-medium tw-text-slate-700 hover:tw-border-[#2563EB]/30 hover:tw-bg-[#EFF6FF] hover:tw-text-[#2563EB]'
      }
    >
      {children}
    </button>
  );
}
