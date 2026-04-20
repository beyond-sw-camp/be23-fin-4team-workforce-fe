import { useMemo, useState } from 'react';
import {
  Card,
  Typography,
  Tag,
  Button,
  Space,
  Descriptions,
  Divider,
  Form,
  Input,
  List,
  Checkbox,
  Tooltip,
  message,
  Skeleton,
  Empty,
  Modal,
  Badge,
  Progress,
  DatePicker,
} from 'antd';
import {
  ArrowLeftOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  PlusOutlined,
  SmileOutlined,
  MehOutlined,
  FrownOutlined,
  LikeOutlined,
  DislikeOutlined,
  UserOutlined,
  CalendarOutlined,
  LinkOutlined,
  StarOutlined,
  StarFilled,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from '@tanstack/react-router';
import dayjs from 'dayjs';
import 'dayjs/locale/ko';
import { meetingApi } from '@/features/meetings/api/meetingApi';
import type {
  MeetingAction,
  CompleteMeetingPayload,
  Reaction,
  TlRating,
} from '@/features/meetings/model/types';
import { MemberRemoteSelect } from '@/features/members/ui/MemberRemoteSelect';
import { useMemberDisplayNames } from '@/features/members/hooks/useMemberDisplayNames';

dayjs.locale('ko');

/* ── 한글 사전 ── */
const KO = {
  back: '면담 목록',
  titleMeeting: '면담 상세',
  labelPartner: '면담 상대',
  labelManager: '매니저',
  labelMember: '구성원',
  labelSchedule: '예정 일시',
  labelRepeat: '반복 주기',
  labelAgenda: '안건',
  labelRelatedSeason: '연결 평가 시즌',
  labelStatus: '상태',
  statusScheduled: '예정',
  statusCompleted: '완료',
  statusOverdue: '지연',
  repeatOneTime: '1회',
  repeatWeekly: '매주',
  repeatBiWeekly: '격주',
  repeatMonthly: '매월',
  repeatQuarterly: '분기',

  // Complete
  sectionComplete: '면담 완료 처리',
  fieldMemo: '면담 기록',
  fieldMemoPlaceholder: '면담 내용을 요약해 주세요.',
  fieldPrivateMemo: '비공개 메모',
  fieldPrivateMemoPlaceholder: '매니저만 볼 수 있는 메모입니다.',
  fieldReaction: '매니저 반응',
  complete: '면담 완료',
  completed: '면담이 완료 처리되었습니다.',

  // Memo (completed meeting)
  sectionMemo: '면담 기록',
  sectionPrivateMemo: '비공개 메모 (매니저 전용)',
  noMemo: '기록 없음',

  // Member reaction
  sectionMemberReaction: '구성원 반응',
  memberReactionLabel: '면담이 어떠셨나요?',
  memberReactionSaved: '반응이 저장되었습니다.',

  // Actions
  sectionActions: '후속 액션',
  actionAdd: '액션 추가',
  actionAssigneePlaceholder: '이름·이메일로 검색',
  actionContentPlaceholder: '할 일을 입력하세요',
  actionDuePlaceholder: '기한',
  actionPending: '대기',
  actionInProgress: '진행 중',
  actionCompleted: '완료',
  actionComplete: '완료 처리',
  actionCompleteConfirm: '이 액션을 완료 처리하시겠습니까?',
  actionCreated: '액션이 추가되었습니다.',
  actionStatusCompleted: '액션이 완료되었습니다.',
  actionEmpty: '등록된 후속 액션이 없습니다.',

  // TL Rating
  ratingExceeds: '우수',
  ratingMeets: '적합',
  ratingBelow: '미달',
  ratingUpdated: '이행 평가가 저장되었습니다.',
};

const repeatMap: Record<string, string> = {
  ONE_TIME: KO.repeatOneTime,
  WEEKLY: KO.repeatWeekly,
  BI_WEEKLY: KO.repeatBiWeekly,
  MONTHLY: KO.repeatMonthly,
  QUARTERLY: KO.repeatQuarterly,
};

/* ── 반응 아이콘 매핑 ── */
const reactionConfig: { value: Reaction; icon: React.ReactNode; label: string; color: string }[] = [
  { value: 'VERY_POSITIVE', icon: <LikeOutlined />, label: '매우 좋음', color: '#52c41a' },
  { value: 'POSITIVE', icon: <SmileOutlined />, label: '좋음', color: '#73d13d' },
  { value: 'NEUTRAL', icon: <MehOutlined />, label: '보통', color: '#8c8c8c' },
  { value: 'NEGATIVE', icon: <FrownOutlined />, label: '아쉬움', color: '#faad14' },
  { value: 'VERY_NEGATIVE', icon: <DislikeOutlined />, label: '매우 아쉬움', color: '#ff4d4f' },
];

const ratingConfig: { value: TlRating; label: string; color: string }[] = [
  { value: 'EXCEEDS', label: KO.ratingExceeds, color: 'green' },
  { value: 'MEETS', label: KO.ratingMeets, color: 'blue' },
  { value: 'BELOW', label: KO.ratingBelow, color: 'orange' },
];

type ActionStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';
const actionStatusColor: Record<ActionStatus, string> = {
  PENDING: 'default',
  IN_PROGRESS: 'processing',
  COMPLETED: 'success',
};
const actionStatusLabel: Record<ActionStatus, string> = {
  PENDING: KO.actionPending,
  IN_PROGRESS: KO.actionInProgress,
  COMPLETED: KO.actionCompleted,
};

/* ── 반응 선택 버튼 그룹 ── */
function ReactionPicker({
  value,
  onChange,
  disabled,
}: {
  value?: Reaction;
  onChange: (v: Reaction) => void;
  disabled?: boolean;
}) {
  return (
    <Space>
      {reactionConfig.map((r) => (
        <Tooltip key={r.value} title={r.label}>
          <Button
            shape="circle"
            size="large"
            disabled={disabled}
            type={value === r.value ? 'primary' : 'default'}
            style={value === r.value ? { background: r.color, borderColor: r.color } : {}}
            icon={r.icon}
            onClick={() => onChange(r.value)}
          />
        </Tooltip>
      ))}
    </Space>
  );
}

/* ── 이행 평가 (TL Rating) ── */
function TlRatingPicker({
  value,
  onChange,
}: {
  value?: TlRating;
  onChange: (v: TlRating) => void;
}) {
  return (
    <Space>
      {ratingConfig.map((r) => (
        <Tag.CheckableTag
          key={r.value}
          checked={value === r.value}
          onChange={() => onChange(r.value)}
          style={{ padding: '4px 12px', fontSize: 13 }}
        >
          {value === r.value ? <StarFilled className="tw-mr-1" /> : <StarOutlined className="tw-mr-1" />}
          {r.label}
        </Tag.CheckableTag>
      ))}
    </Space>
  );
}

/* ──────────────── 메인 컴포넌트 ──────────────── */
export default function MeetingDetailPage() {
  const { meetingId } = useParams({ strict: false }) as { meetingId: string };
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [completeForm] = Form.useForm();
  const [actionForm] = Form.useForm();
  const [showActionForm, setShowActionForm] = useState(false);
  const [managerReaction, setManagerReaction] = useState<Reaction | undefined>();

  // ── 면담 데이터 ──
  const meetingQ = useQuery({
    queryKey: ['meetings', meetingId],
    queryFn: () => meetingApi.getMeeting(meetingId),
    enabled: !!meetingId,
  });

  const actionsQ = useQuery({
    queryKey: ['meetings', meetingId, 'actions'],
    queryFn: () => meetingApi.listActions(meetingId),
    enabled: !!meetingId,
  });

  // ── 멤버 UUID → 이름 변환 ──
  const memberIdsToResolve = useMemo(() => {
    const ids = new Set<string>();
    const m = meetingQ.data;
    if (m) {
      if (m.memberId) ids.add(m.memberId);
      if (m.managerId) ids.add(m.managerId);
    }
    for (const a of actionsQ.data ?? []) {
      if (a.assigneeId) ids.add(a.assigneeId);
    }
    return [...ids];
  }, [meetingQ.data, actionsQ.data]);

  const { labelFor } = useMemberDisplayNames(memberIdsToResolve);

  // ── Mutations ──
  const completeMut = useMutation({
    mutationFn: (body: CompleteMeetingPayload) => meetingApi.completeMeeting(meetingId, body),
    onSuccess: () => {
      message.success(KO.completed);
      qc.invalidateQueries({ queryKey: ['meetings'] });
    },
    onError: () => message.error('면담 완료 처리에 실패했습니다.'),
  });

  const memberReactionMut = useMutation({
    mutationFn: (reaction: Reaction) => meetingApi.recordMemberReaction(meetingId, { memberReaction: reaction }),
    onSuccess: () => {
      message.success(KO.memberReactionSaved);
      qc.invalidateQueries({ queryKey: ['meetings', meetingId] });
    },
  });

  const createActionMut = useMutation({
    mutationFn: (body: { content: string; assigneeId: string; dueDate?: string }) =>
      meetingApi.createAction(meetingId, body),
    onSuccess: () => {
      message.success(KO.actionCreated);
      actionForm.resetFields();
      setShowActionForm(false);
      qc.invalidateQueries({ queryKey: ['meetings', meetingId, 'actions'] });
    },
  });

  const completeActionMut = useMutation({
    mutationFn: (actionId: string) => meetingApi.completeAction(meetingId, actionId),
    onSuccess: () => {
      message.success(KO.actionStatusCompleted);
      qc.invalidateQueries({ queryKey: ['meetings', meetingId, 'actions'] });
    },
  });

  const rateActionMut = useMutation({
    mutationFn: ({ actionId, tlRating }: { actionId: string; tlRating: TlRating }) =>
      meetingApi.rateAction(meetingId, actionId, { tlRating }),
    onSuccess: () => {
      message.success(KO.ratingUpdated);
      qc.invalidateQueries({ queryKey: ['meetings', meetingId, 'actions'] });
    },
  });

  // ── Loading / Error ──
  if (meetingQ.isLoading) {
    return (
      <div className="tw-p-6 tw-max-w-[900px] tw-mx-auto">
        <Skeleton active paragraph={{ rows: 8 }} />
      </div>
    );
  }

  const meeting = meetingQ.data;
  if (!meeting) {
    return (
      <div className="tw-p-6 tw-max-w-[900px] tw-mx-auto">
        <Empty description="면담 정보를 찾을 수 없습니다." />
      </div>
    );
  }

  const isCompleted = !!meeting.completedAt;
  const isOverdue = !isCompleted && dayjs(meeting.scheduledAt).isBefore(dayjs());
  const actions: MeetingAction[] = actionsQ.data ?? [];
  const actionsDone = actions.filter((a) => a.status === 'COMPLETED').length;

  return (
    <div className="tw-p-6 tw-max-w-[900px] tw-mx-auto">
      {/* 뒤로가기 */}
      <Button
        type="link"
        icon={<ArrowLeftOutlined />}
        className="tw-pl-0 tw-mb-3"
        onClick={() => navigate({ to: '/app/meetings' })}
      >
        {KO.back}
      </Button>

      {/* ── 상단 정보 카드 ── */}
      <Card
        className="tw-mb-5"
        title={
          <Space>
            <CalendarOutlined />
            <span>{KO.titleMeeting}</span>
            {isCompleted ? (
              <Tag icon={<CheckCircleOutlined />} color="success">{KO.statusCompleted}</Tag>
            ) : isOverdue ? (
              <Tag icon={<ClockCircleOutlined />} color="warning">{KO.statusOverdue}</Tag>
            ) : (
              <Tag icon={<ClockCircleOutlined />} color="processing">{KO.statusScheduled}</Tag>
            )}
            {meeting.relatedSeasonId && (
              <Tag color="blue" icon={<LinkOutlined />}>{`평가 피드백`}</Tag>
            )}
          </Space>
        }
      >
        <Descriptions column={{ xs: 1, sm: 2 }} size="small" styles={{ label: { fontWeight: 500 } }}>
          <Descriptions.Item label={KO.labelMember}>
            <Space>
              <UserOutlined />
              <Typography.Text>{labelFor(meeting.memberId)}</Typography.Text>
            </Space>
          </Descriptions.Item>
          <Descriptions.Item label={KO.labelManager}>
            <Space>
              <UserOutlined />
              <Typography.Text>{labelFor(meeting.managerId)}</Typography.Text>
            </Space>
          </Descriptions.Item>
          <Descriptions.Item label={KO.labelSchedule}>
            {dayjs(meeting.scheduledAt).format('YYYY-MM-DD (ddd) HH:mm')}
          </Descriptions.Item>
          <Descriptions.Item label={KO.labelRepeat}>
            {repeatMap[meeting.repeatCycle] ?? meeting.repeatCycle}
          </Descriptions.Item>
          <Descriptions.Item label={KO.labelAgenda} span={2}>
            {meeting.agenda || '-'}
          </Descriptions.Item>
          {meeting.relatedSeasonId && (
            <Descriptions.Item label={KO.labelRelatedSeason}>
              <Tag color="blue">{meeting.relatedSeasonId.slice(0, 8)}…</Tag>
            </Descriptions.Item>
          )}
          {isCompleted && (
            <Descriptions.Item label="완료 일시">
              {dayjs(meeting.completedAt).format('YYYY-MM-DD HH:mm')}
            </Descriptions.Item>
          )}
        </Descriptions>
      </Card>

      {/* ── 완료 전: 면담 완료 폼 ── */}
      {!isCompleted && (
        <Card title={KO.sectionComplete} className="tw-mb-5">
          <Form
            form={completeForm}
            layout="vertical"
            onFinish={(vals) => {
              completeMut.mutate({
                memo: vals.memo,
                privateMemo: vals.privateMemo || undefined,
                managerReaction: managerReaction,
              });
            }}
          >
            <Form.Item
              name="memo"
              label={KO.fieldMemo}
              rules={[{ required: true, message: '면담 기록을 입력해 주세요.' }]}
            >
              <Input.TextArea rows={4} placeholder={KO.fieldMemoPlaceholder} />
            </Form.Item>
            <Form.Item name="privateMemo" label={KO.fieldPrivateMemo}>
              <Input.TextArea rows={2} placeholder={KO.fieldPrivateMemoPlaceholder} />
            </Form.Item>
            <Form.Item label={KO.fieldReaction}>
              <ReactionPicker value={managerReaction} onChange={setManagerReaction} />
            </Form.Item>
            <Button
              type="primary"
              icon={<CheckCircleOutlined />}
              loading={completeMut.isPending}
              onClick={() => completeForm.submit()}
            >
              {KO.complete}
            </Button>
          </Form>
        </Card>
      )}

      {/* ── 완료 후: 면담 기록 표시 ── */}
      {isCompleted && (
        <>
          <Card title={KO.sectionMemo} className="tw-mb-5">
            <Typography.Paragraph>
              {meeting.memo || <Typography.Text type="secondary">{KO.noMemo}</Typography.Text>}
            </Typography.Paragraph>
            {meeting.managerReaction && (
              <div className="tw-mt-3">
                <Typography.Text type="secondary" className="tw-mr-2">매니저 반응:</Typography.Text>
                {reactionConfig.find((r) => r.value === meeting.managerReaction)?.label ?? meeting.managerReaction}
              </div>
            )}
          </Card>

          {meeting.privateMemo && (
            <Card title={KO.sectionPrivateMemo} className="tw-mb-5" style={{ borderColor: '#faad14' }}>
              <Typography.Paragraph>{meeting.privateMemo}</Typography.Paragraph>
            </Card>
          )}

          {/* 구성원 반응 */}
          <Card title={KO.sectionMemberReaction} className="tw-mb-5" size="small">
            <Typography.Text className="tw-mr-3">{KO.memberReactionLabel}</Typography.Text>
            <ReactionPicker
              value={meeting.memberReaction}
              onChange={(v) => memberReactionMut.mutate(v)}
              disabled={memberReactionMut.isPending}
            />
          </Card>
        </>
      )}

      {/* ── 후속 액션 ── */}
      <Card
        title={
          <Space>
            <span>{KO.sectionActions}</span>
            {actions.length > 0 && (
              <Badge
                count={`${actionsDone}/${actions.length}`}
                style={{ backgroundColor: actionsDone === actions.length ? '#52c41a' : '#1677ff' }}
              />
            )}
          </Space>
        }
        extra={
          <Button
            type="dashed"
            size="small"
            icon={<PlusOutlined />}
            onClick={() => setShowActionForm(true)}
          >
            {KO.actionAdd}
          </Button>
        }
      >
        {/* 액션 진행률 바 */}
        {actions.length > 0 && (
          <Progress
            percent={Math.round((actionsDone / actions.length) * 100)}
            size="small"
            className="tw-mb-4"
            strokeColor="#52c41a"
          />
        )}

        {actions.length === 0 && !showActionForm ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={KO.actionEmpty} />
        ) : (
          <List
            dataSource={actions}
            renderItem={(action) => (
              <List.Item
                key={action.meetingActionId}
                actions={[
                  action.status !== 'COMPLETED' && (
                    <Button
                      key="complete"
                      size="small"
                      type="link"
                      onClick={() => {
                        Modal.confirm({
                          title: KO.actionCompleteConfirm,
                          onOk: () => completeActionMut.mutate(action.meetingActionId),
                        });
                      }}
                    >
                      {KO.actionComplete}
                    </Button>
                  ),
                ].filter(Boolean)}
              >
                <List.Item.Meta
                  avatar={
                    <Checkbox
                      checked={action.status === 'COMPLETED'}
                      disabled
                    />
                  }
                  title={
                    <Space>
                      <Typography.Text
                        delete={action.status === 'COMPLETED'}
                        className={action.status === 'COMPLETED' ? 'tw-text-gray-400' : ''}
                      >
                        {action.content}
                      </Typography.Text>
                      <Tag color={actionStatusColor[action.status]}>
                        {actionStatusLabel[action.status]}
                      </Tag>
                    </Space>
                  }
                  description={
                    <Space split={<Divider type="vertical" />} size={0}>
                      <Typography.Text type="secondary">
                        담당: {labelFor(action.assigneeId)}
                      </Typography.Text>
                      {action.dueDate && (
                        <Typography.Text type="secondary">
                          기한: {dayjs(action.dueDate).format('MM/DD')}
                        </Typography.Text>
                      )}
                      {action.tlRating && (
                        <Tag color={ratingConfig.find((r) => r.value === action.tlRating)?.color}>
                          {ratingConfig.find((r) => r.value === action.tlRating)?.label}
                        </Tag>
                      )}
                    </Space>
                  }
                />
                {/* 이행 평가 (완료된 액션에만) */}
                {action.status === 'COMPLETED' && (
                  <div className="tw-ml-4">
                    <TlRatingPicker
                      value={action.tlRating}
                      onChange={(v) =>
                        rateActionMut.mutate({ actionId: action.meetingActionId, tlRating: v })
                      }
                    />
                  </div>
                )}
              </List.Item>
            )}
          />
        )}

        {/* 액션 추가 폼 */}
        {showActionForm && (
          <>
            <Divider dashed />
            <Form
              form={actionForm}
              layout="vertical"
              onFinish={(vals) => {
                createActionMut.mutate({
                  content: vals.content,
                  assigneeId: vals.assigneeId,
                  dueDate: vals.dueDate ? vals.dueDate.format('YYYY-MM-DD') : undefined,
                });
              }}
            >
              <Form.Item
                name="content"
                label="할 일"
                rules={[{ required: true, message: '내용을 입력해 주세요.' }]}
              >
                <Input placeholder={KO.actionContentPlaceholder} />
              </Form.Item>
              <Row gutter={12}>
                <Col span={14}>
                  <Form.Item
                    name="assigneeId"
                    label="담당자"
                    rules={[{ required: true, message: '담당자를 선택해 주세요.' }]}
                  >
                    <MemberRemoteSelect placeholder={KO.actionAssigneePlaceholder} />
                  </Form.Item>
                </Col>
                <Col span={10}>
                  <Form.Item name="dueDate" label="기한">
                    <DatePicker className="tw-w-full" placeholder={KO.actionDuePlaceholder} />
                  </Form.Item>
                </Col>
              </Row>
              <Space>
                <Button
                  type="primary"
                  loading={createActionMut.isPending}
                  onClick={() => actionForm.submit()}
                >
                  추가
                </Button>
                <Button onClick={() => setShowActionForm(false)}>
                  취소
                </Button>
              </Space>
            </Form>
          </>
        )}
      </Card>
    </div>
  );
}
