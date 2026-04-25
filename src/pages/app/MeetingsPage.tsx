import { useMemo, useState } from 'react';
import {
  Tabs,
  Table,
  Button,
  Tag,
  Space,
  Form,
  Input,
  DatePicker,
  Select,
  message,
  Typography,
  Tooltip,
  Empty,
  Card,
} from 'antd';
import {
  CalendarOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  TeamOutlined,
  LinkOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/ko';
import { meetingApi } from '@/features/meetings/api/meetingApi';
import type {
  MeetingRecord,
  CreateMeetingPayload,
  RepeatCycle,
} from '@/features/meetings/model/types';
import { MemberRemoteSelect } from '@/features/members/ui/MemberRemoteSelect';
import { useMemberDisplayNames } from '@/features/members/hooks/useMemberDisplayNames';
import { AppDoubleActionModal } from '@/shared/ui/AppDoubleActionModal';
import { AppWorkspacePageTitle } from '@/shared/ui/AppWorkspacePageTitle';

dayjs.extend(relativeTime);
dayjs.locale('ko');
const { Text } = Typography;

const MEETING_KO = {
  workspaceEyebrow: 'Meetings & conversation rhythm',
  pageTitle: '면담 관리',
  pageSubtitle: '정기·수시 면담을 관리하고 후속 액션을 추적합니다.',
  tabAsMember: '참여 면담',
  tabAsManager: '관리 면담',
  newMeeting: '면담 예약',
  colPartner: '면담 상대',
  colSchedule: '일정',
  colRepeat: '반복',
  colStatus: '상태',
  colAction: '',
  statusScheduled: '예정',
  statusCompleted: '완료',
  repeatOneTime: '1회',
  repeatWeekly: '매주',
  repeatBiWeekly: '격주',
  repeatMonthly: '매월',
  repeatQuarterly: '분기',
  drawerTitle: '새 면담 예약',
  fieldMember: '면담 대상',
  fieldMemberPlaceholder: '이름·이메일로 검색',
  fieldSchedule: '일시',
  fieldRepeat: '반복 주기',
  fieldAgenda: '안건',
  create: '예약하기',
  cancel: '취소',
  created: '면담이 예약되었습니다.',
  detail: '상세',
  feedbackBadge: '평가 피드백',
  statTotal: '전체',
  statUpcoming: '예정',
  statDone: '완료',
};

const repeatLabel: Record<RepeatCycle, string> = {
  ONE_TIME: MEETING_KO.repeatOneTime,
  WEEKLY: MEETING_KO.repeatWeekly,
  BI_WEEKLY: MEETING_KO.repeatBiWeekly,
  MONTHLY: MEETING_KO.repeatMonthly,
  QUARTERLY: MEETING_KO.repeatQuarterly,
};

const repeatOptions = Object.entries(repeatLabel).map(([value, label]) => ({ value, label }));

function statusTag(m: MeetingRecord) {
  if (m.completedAt)
    return (
      <Tag icon={<CheckCircleOutlined />} color="success">
        {MEETING_KO.statusCompleted}
      </Tag>
    );
  const scheduled = dayjs(m.scheduledAt);
  const isPast = scheduled.isBefore(dayjs());
  return (
    <Tag icon={<ClockCircleOutlined />} color={isPast ? 'warning' : 'processing'}>
      {isPast ? '지연' : MEETING_KO.statusScheduled}
    </Tag>
  );
}

function scheduleDisplay(scheduledAt: string) {
  const d = dayjs(scheduledAt);
  const isToday = d.isSame(dayjs(), 'day');
  const isTomorrow = d.isSame(dayjs().add(1, 'day'), 'day');
  const prefix = isToday ? '오늘 ' : isTomorrow ? '내일 ' : '';
  return (
    <Tooltip title={d.format('YYYY-MM-DD HH:mm')}>
      <span>
        {prefix}
        {d.format(isToday || isTomorrow ? 'HH:mm' : 'MM/DD (ddd) HH:mm')}
      </span>
    </Tooltip>
  );
}

export default function MeetingsPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<'member' | 'manager'>('member');
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [form] = Form.useForm();

  // ── Queries ──
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
      message.success(MEETING_KO.created);
      setCreateModalOpen(false);
      form.resetFields();
      qc.invalidateQueries({ queryKey: ['meetings'] });
    },
    onError: () => message.error('면담 예약에 실패했습니다.'),
  });

  const meetings = tab === 'member' ? memberQ.data ?? [] : managerQ.data ?? [];
  const loading = tab === 'member' ? memberQ.isLoading : managerQ.isLoading;

  const upcoming = meetings.filter((m) => !m.completedAt);
  const done = meetings.filter((m) => m.completedAt);
  const thisMonthMeetings = meetings.filter((m) => dayjs(m.scheduledAt).isSame(dayjs(), 'month'));
  const thisMonthDone = thisMonthMeetings.filter((m) => m.completedAt).length;
  const progressPct = thisMonthMeetings.length > 0 ? Math.round((thisMonthDone / thisMonthMeetings.length) * 100) : 0;

  // ── 멤버 UUID → 이름 변환 ──
  const partnerIds = useMemo(() => {
    const allMeetings = [...(memberQ.data ?? []), ...(managerQ.data ?? [])];
    const ids = new Set<string>();
    for (const m of allMeetings) {
      if (m.memberId) ids.add(m.memberId);
      if (m.managerId) ids.add(m.managerId);
    }
    return [...ids];
  }, [memberQ.data, managerQ.data]);

  const { labelFor } = useMemberDisplayNames(partnerIds);

  // ── Columns ──
  const partnerField = tab === 'member' ? 'managerId' : 'memberId';
  const partnerLabel = tab === 'member' ? '매니저' : '구성원';

  const columns = [
    {
      title: partnerLabel,
      dataIndex: partnerField,
      key: 'partner',
      render: (id: string, rec: MeetingRecord) => (
        <Space>
          <UserOutlined />
          <Typography.Text className="tw-font-medium">
            {labelFor(id)}
          </Typography.Text>
          {rec.relatedSeasonId && (
            <Tag color="blue" className="tw-ml-1">
              <LinkOutlined className="tw-mr-1" />
              {MEETING_KO.feedbackBadge}
            </Tag>
          )}
        </Space>
      ),
    },
    {
      title: MEETING_KO.colSchedule,
      dataIndex: 'scheduledAt',
      key: 'schedule',
      sorter: (a: MeetingRecord, b: MeetingRecord) =>
        dayjs(a.scheduledAt).unix() - dayjs(b.scheduledAt).unix(),
      defaultSortOrder: 'ascend' as const,
      render: (v: string) => scheduleDisplay(v),
    },
    {
      title: MEETING_KO.colRepeat,
      dataIndex: 'repeatCycle',
      key: 'repeat',
      width: 90,
      render: (v: RepeatCycle) => <Tag>{repeatLabel[v] ?? v}</Tag>,
    },
    {
      title: MEETING_KO.colStatus,
      key: 'status',
      width: 110,
      render: (_: unknown, rec: MeetingRecord) => statusTag(rec),
    },
    {
      title: MEETING_KO.colAction,
      key: 'action',
      width: 80,
      render: (_: unknown, rec: MeetingRecord) => (
        <Link to="/app/meetings/$meetingId" params={{ meetingId: rec.meetingRecordId }}>
          <Button type="link" size="small">
            {MEETING_KO.detail}
          </Button>
        </Link>
      ),
    },
  ];

  // ── Render ──
  return (
    <div className="tw-mx-auto tw-w-full tw-space-y-8">
      <AppWorkspacePageTitle
        eyebrow={MEETING_KO.workspaceEyebrow}
        title={MEETING_KO.pageTitle}
      />

      <section className="tw-grid tw-grid-cols-1 tw-gap-4 lg:tw-grid-cols-3">
        <Card className="tw-rounded-3xl tw-border-slate-200/80 tw-bg-white tw-shadow-[0_1px_2px_rgba(15,23,42,0.05)] [&_.ant-card-body]:tw-p-5">
          <div className="tw-mb-3 tw-flex tw-items-center tw-gap-2">
            <TeamOutlined className="tw-text-slate-500" />
            <Text className="tw-text-lg tw-font-semibold tw-text-slate-900">면담 요약</Text>
          </div>
          <div className="tw-space-y-2.5">
            <div className="tw-flex tw-items-center tw-justify-between tw-rounded-2xl tw-border tw-border-slate-200/80 tw-bg-white tw-px-4 tw-py-3">
              <span className="tw-text-slate-600">{MEETING_KO.statTotal}</span>
              <span className="tw-text-2xl tw-font-semibold tw-tabular-nums">{meetings.length}</span>
            </div>
            <div className="tw-flex tw-items-center tw-justify-between tw-rounded-2xl tw-border tw-border-slate-200/80 tw-bg-white tw-px-4 tw-py-3">
              <span className="tw-text-slate-600">{MEETING_KO.statUpcoming}</span>
              <span className="tw-text-2xl tw-font-semibold tw-tabular-nums tw-text-blue-600">{upcoming.length}</span>
            </div>
            <div className="tw-flex tw-items-center tw-justify-between tw-rounded-2xl tw-border tw-border-slate-200/80 tw-bg-white tw-px-4 tw-py-3">
              <span className="tw-text-slate-600">{MEETING_KO.statDone}</span>
              <span className="tw-text-2xl tw-font-semibold tw-tabular-nums tw-text-emerald-600">{done.length}</span>
            </div>
          </div>
        </Card>

        <Card className="tw-rounded-3xl tw-border-slate-200/80 tw-bg-white tw-shadow-[0_1px_2px_rgba(15,23,42,0.05)] [&_.ant-card-body]:tw-p-5">
          <div className="tw-mb-1 tw-flex tw-items-center tw-gap-2">
            <CalendarOutlined className="tw-text-slate-500" />
            <Text className="tw-text-lg tw-font-semibold tw-text-slate-900">면담 진척률</Text>
          </div>
          <Text className="tw-text-xs tw-text-slate-500">이번 달 진행 면담 수 기준</Text>
          <div className="tw-flex tw-justify-center tw-py-4">
            <div
              className="tw-grid tw-h-[124px] tw-w-[124px] tw-place-items-center tw-rounded-full"
              style={{ background: `conic-gradient(#3182f6 ${Math.min(100, Math.max(0, progressPct)) * 3.6}deg, #e2e8f0 0deg)` }}
            >
              <div className="tw-grid tw-h-[104px] tw-w-[104px] tw-place-items-center tw-rounded-full tw-bg-white">
                <span className="tw-text-[36px] tw-font-semibold tw-tabular-nums tw-text-slate-800">{progressPct}%</span>
              </div>
            </div>
          </div>
          <div className="tw-rounded-xl tw-border tw-border-slate-200/80 tw-bg-white tw-px-3 tw-py-2 tw-text-center tw-text-xs tw-text-slate-500">
            대상자 대비 진행률 <span className="tw-font-semibold tw-tabular-nums">{done.length}</span> / {meetings.length} 명
          </div>
        </Card>

        <Card
          className="tw-relative tw-overflow-hidden tw-rounded-3xl tw-text-white tw-shadow-lg tw-shadow-indigo-500/20 tw-border-0 [&_.ant-card-body]:tw-flex [&_.ant-card-body]:tw-h-full [&_.ant-card-body]:tw-flex-col [&_.ant-card-body]:tw-justify-between [&_.ant-card-body]:tw-p-5"
          style={{ background: 'linear-gradient(135deg, #6366F1 0%, #4F46E5 55%, #4338CA 100%)' }}
        >
          <div>
            <Text className="!tw-text-indigo-100 tw-text-xs tw-font-semibold tw-uppercase tw-tracking-wide">Quick Action</Text>
            <div className="tw-mt-3 tw-text-[34px] tw-font-semibold tw-leading-none tw-tabular-nums">{upcoming.length}</div>
            <div className="tw-mt-1 tw-text-sm tw-font-medium">아직 확정되지 않은 면담 일정</div>
            <div className="tw-mt-2 tw-text-xs tw-text-indigo-100/90">
              팀원들과의 소통을 위해 정기 면담 일정을 제안해보세요.
            </div>
          </div>
          <Button
            size="large"
            onClick={() => setCreateModalOpen(true)}
            className="!tw-h-11 !tw-rounded-xl !tw-border-0 !tw-bg-white !tw-font-semibold !tw-text-[#3b5bdb] hover:!tw-bg-indigo-50"
          >
            일정 제안하기
          </Button>
        </Card>
      </section>

      {/* ── 탭 ── */}
      <Tabs
        className="[&_.ant-tabs-tab]:!tw-text-base [&_.ant-tabs-tab-btn]:!tw-font-semibold [&_.ant-tabs-ink-bar]:!tw-bg-[#3b5bdb]"
        activeKey={tab}
        onChange={(k) => setTab(k as 'member' | 'manager')}
        items={[
          { key: 'member', label: MEETING_KO.tabAsMember },
          { key: 'manager', label: MEETING_KO.tabAsManager },
        ]}
      />

      <Table
        rowKey="meetingRecordId"
        columns={columns}
        dataSource={meetings}
        loading={loading}
        pagination={{ pageSize: 15, showSizeChanger: false }}
        locale={{
          emptyText: (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={
                tab === 'manager'
                  ? '예약된 면담이 없습니다. 새 면담을 예약해 보세요.'
                  : '배정된 면담이 없습니다.'
              }
            />
          ),
        }}
      />

      {/* ── 생성 Modal ── */}
      <AppDoubleActionModal
        title={MEETING_KO.drawerTitle}
        width={520}
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onConfirm={() => form.submit()}
        cancelText={MEETING_KO.cancel}
        confirmText={MEETING_KO.create}
        confirmLoading={createMut.isPending}
        destroyOnHidden
      >
        <Form
          form={form}
          layout="vertical"
          className="tw-px-5 tw-py-4"
          onFinish={(vals) => {
            createMut.mutate({
              memberId: vals.memberId,
              managerId: vals.managerId ?? vals.memberId,
              repeatCycle: vals.repeatCycle,
              scheduledAt: vals.scheduledAt.toISOString(),
              agenda: vals.agenda,
            });
          }}
        >
          <Form.Item
            name="memberId"
            label={MEETING_KO.fieldMember}
            rules={[{ required: true, message: '면담 대상을 선택해 주세요.' }]}
          >
            <MemberRemoteSelect placeholder={MEETING_KO.fieldMemberPlaceholder} />
          </Form.Item>
          <Form.Item
            name="scheduledAt"
            label={MEETING_KO.fieldSchedule}
            rules={[{ required: true, message: '일시를 선택해 주세요.' }]}
          >
            <DatePicker
              showTime={{ format: 'HH:mm' }}
              format="YYYY-MM-DD HH:mm"
              className="tw-w-full"
              placeholder="날짜·시간 선택"
            />
          </Form.Item>
          <Form.Item
            name="repeatCycle"
            label={MEETING_KO.fieldRepeat}
            initialValue="ONE_TIME"
            rules={[{ required: true }]}
          >
            <Select options={repeatOptions} />
          </Form.Item>
          <Form.Item name="agenda" label={MEETING_KO.fieldAgenda}>
            <Input.TextArea rows={3} placeholder="면담 안건을 간단히 적어 주세요." />
          </Form.Item>
        </Form>
      </AppDoubleActionModal>
    </div>
  );
}
