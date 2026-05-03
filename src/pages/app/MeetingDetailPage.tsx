import { useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  Checkbox,
  Col,
  DatePicker,
  Descriptions,
  Divider,
  Empty,
  Form,
  Input,
  List,
  Modal,
  Progress,
  Row,
  Space,
  Tag,
  Tooltip,
  Typography,
  message,
  Skeleton,
} from 'antd';
import {
  CalendarOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  DislikeOutlined,
  FrownOutlined,
  LikeOutlined,
  LinkOutlined,
  MehOutlined,
  PlusOutlined,
  SmileOutlined,
  StarFilled,
  StarOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import dayjs from 'dayjs';
import 'dayjs/locale/ko';
import { useAuth } from '@/features/auth/useAuth';
import { meetingApi } from '@/features/meetings/api/meetingApi';
import type { CompleteMeetingPayload, MeetingAction, Reaction, RepeatCycle, TlRating } from '@/features/meetings/model/types';
import { useMemberDisplayNames } from '@/features/members/hooks/useMemberDisplayNames';
import { MemberRemoteSelect } from '@/features/members/ui/MemberRemoteSelect';
import { DetailPageHeader } from '@/shared/ui/DetailPageHeader';

dayjs.locale('ko');

const repeatMap: Record<string, string> = {
  ONE_TIME: '1회',
  WEEKLY: '매주',
  BI_WEEKLY: '격주',
  MONTHLY: '매월',
  QUARTERLY: '분기',
};

const reactionConfig: { value: Reaction; icon: React.ReactNode; label: string; color: string }[] = [
  { value: 'VERY_POSITIVE', icon: <LikeOutlined />, label: '매우 좋음', color: '#52c41a' },
  { value: 'POSITIVE', icon: <SmileOutlined />, label: '좋음', color: '#73d13d' },
  { value: 'NEUTRAL', icon: <MehOutlined />, label: '보통', color: '#8c8c8c' },
  { value: 'NEGATIVE', icon: <FrownOutlined />, label: '아쉬움', color: '#faad14' },
  { value: 'VERY_NEGATIVE', icon: <DislikeOutlined />, label: '매우 아쉬움', color: '#ff4d4f' },
];

const ratingConfig: { value: TlRating; label: string; color: string }[] = [
  { value: 'EXCEEDS', label: '우수', color: 'green' },
  { value: 'MEETS', label: '적합', color: 'blue' },
  { value: 'BELOW', label: '미달', color: 'orange' },
];

type ActionStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';
const actionStatusColor: Record<ActionStatus, string> = {
  PENDING: 'default',
  IN_PROGRESS: 'processing',
  COMPLETED: 'success',
};
const actionStatusLabel: Record<ActionStatus, string> = {
  PENDING: '대기',
  IN_PROGRESS: '진행 중',
  COMPLETED: '완료',
};

export default function MeetingDetailPage() {
  const { meetingId } = useParams({ strict: false }) as { meetingId: string };
  const { user } = useAuth();
  const qc = useQueryClient();
  const [completeForm] = Form.useForm();
  const [actionForm] = Form.useForm();
  const [editForm] = Form.useForm();
  const [showActionForm, setShowActionForm] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [managerReaction, setManagerReaction] = useState<Reaction | undefined>();

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

  const memberIds = useMemo(() => {
    const ids = new Set<string>();
    const meeting = meetingQ.data;
    if (meeting) {
      ids.add(meeting.memberId);
      ids.add(meeting.managerId);
    }
    for (const action of actionsQ.data ?? []) ids.add(action.assigneeId);
    return [...ids];
  }, [actionsQ.data, meetingQ.data]);
  const { labelFor } = useMemberDisplayNames(memberIds);

  const completeMut = useMutation({
    mutationFn: (body: CompleteMeetingPayload) => meetingApi.completeMeeting(meetingId, body),
    onSuccess: () => {
      message.success('면담을 완료 처리했습니다.');
      qc.invalidateQueries({ queryKey: ['meetings'] });
    },
    onError: () => message.error('면담 완료 처리에 실패했습니다.'),
  });

  const updateMut = useMutation({
    mutationFn: (body: { scheduledAt?: string; agenda?: string; repeatCycle?: RepeatCycle }) =>
      meetingApi.updateMeeting(meetingId, body),
    onSuccess: () => {
      message.success('면담 정보를 수정했습니다.');
      setEditOpen(false);
      qc.invalidateQueries({ queryKey: ['meetings'] });
    },
    onError: (error: any) => message.error(error?.response?.data?.message ?? '면담 정보 수정에 실패했습니다.'),
  });

  const memberReactionMut = useMutation({
    mutationFn: (reaction: Reaction) => meetingApi.recordMemberReaction(meetingId, { memberReaction: reaction }),
    onSuccess: () => {
      message.success('구성원 반응을 저장했습니다.');
      qc.invalidateQueries({ queryKey: ['meetings', meetingId] });
    },
    onError: (error: any) => message.error(error?.response?.data?.message ?? '구성원 반응 저장에 실패했습니다.'),
  });

  const createActionMut = useMutation({
    mutationFn: (body: { content: string; assigneeId: string; dueDate?: string }) => meetingApi.createAction(meetingId, body),
    onSuccess: () => {
      message.success('후속 액션을 추가했습니다.');
      actionForm.resetFields();
      setShowActionForm(false);
      qc.invalidateQueries({ queryKey: ['meetings', meetingId, 'actions'] });
    },
    onError: (error: any) => message.error(error?.response?.data?.message ?? '후속 액션 추가에 실패했습니다.'),
  });

  const completeActionMut = useMutation({
    mutationFn: (actionId: string) => meetingApi.completeAction(meetingId, actionId),
    onSuccess: () => {
      message.success('후속 액션을 완료 처리했습니다.');
      qc.invalidateQueries({ queryKey: ['meetings', meetingId, 'actions'] });
    },
    onError: (error: any) => message.error(error?.response?.data?.message ?? '후속 액션 완료 처리에 실패했습니다.'),
  });

  const rateActionMut = useMutation({
    mutationFn: ({ actionId, tlRating }: { actionId: string; tlRating: TlRating }) =>
      meetingApi.rateAction(meetingId, actionId, { tlRating }),
    onSuccess: () => {
      message.success('후속 액션 평가를 저장했습니다.');
      qc.invalidateQueries({ queryKey: ['meetings', meetingId, 'actions'] });
    },
    onError: (error: any) => message.error(error?.response?.data?.message ?? '후속 액션 평가 저장에 실패했습니다.'),
  });

  if (meetingQ.isLoading) {
    return (
      <div className="tw-mx-auto tw-max-w-[900px] tw-p-6">
        <Skeleton active paragraph={{ rows: 8 }} />
      </div>
    );
  }

  const meeting = meetingQ.data;
  if (!meeting) {
    return (
      <div className="tw-mx-auto tw-max-w-[900px] tw-p-6">
        <Empty description="면담 정보를 찾을 수 없습니다." />
      </div>
    );
  }

  const isCompleted = !!meeting.completedAt;
  const isOverdue = !isCompleted && dayjs(meeting.scheduledAt).isBefore(dayjs());
  const actions = actionsQ.data ?? [];
  const actionsDone = actions.filter((action) => action.status === 'COMPLETED').length;
  const currentUserId = user?.id ?? '';
  const isManager = meeting.managerId === currentUserId;
  const isMember = meeting.memberId === currentUserId;

  const openEdit = () => {
    editForm.setFieldsValue({
      scheduledAt: dayjs(meeting.scheduledAt),
      agenda: meeting.agenda,
    });
    setEditOpen(true);
  };

  return (
    <div className="tw-mx-auto tw-max-w-[900px] tw-p-6">
      <DetailPageHeader
        backTo="/app/meetings"
        backLabel="면담 목록"
        title="면담 상세"
        subtitle={
          <Space wrap size="small" className="tw-text-slate-600">
            <span>{labelFor(meeting.memberId)} · {labelFor(meeting.managerId)}</span>
            <span className="tw-inline-flex tw-items-center tw-gap-1">
              <CalendarOutlined />
              {dayjs(meeting.scheduledAt).format('YYYY-MM-DD (ddd) HH:mm')}
            </span>
            {isCompleted ? (
              <Tag icon={<CheckCircleOutlined />} color="success">완료</Tag>
            ) : isOverdue ? (
              <Tag icon={<ClockCircleOutlined />} color="warning">지연</Tag>
            ) : (
              <Tag icon={<ClockCircleOutlined />} color="processing">예정</Tag>
            )}
            {meeting.relatedSeasonId && (
              <Tag color="blue" icon={<LinkOutlined />}>피드백 면담</Tag>
            )}
          </Space>
        }
        showShare={false}
      />

      {meeting.relatedSeasonId && (
        <Card className="tw-mb-5 tw-rounded-2xl tw-border tw-border-blue-200 tw-bg-blue-50/40">
          <div className="tw-flex tw-flex-wrap tw-items-center tw-justify-between tw-gap-3">
            <div>
              <div className="tw-text-sm tw-font-semibold tw-text-slate-900">평가 피드백 면담</div>
              <div className="tw-mt-1 tw-text-sm tw-text-slate-600">
                이 면담은 평가 결과 공개 후 자동 생성된 피드백 면담입니다. 결과 리뷰와 다음 액션 정리에 집중해 주세요.
              </div>
            </div>
            {meeting.relatedEvaluationResponseId && (
              <Link to="/app/evaluations" className="tw-font-medium tw-text-[#1e3a5f]">
                평가 결과 보기
              </Link>
            )}
          </div>
        </Card>
      )}

      <Card className="tw-mb-5">
        <div className="tw-mb-4 tw-flex tw-flex-wrap tw-items-center tw-justify-between tw-gap-3">
          <Typography.Text strong>면담 정보</Typography.Text>
          {isManager && !isCompleted ? (
            <Button size="small" onClick={openEdit}>
              일정·아젠다 수정
            </Button>
          ) : null}
        </div>
        <Descriptions column={{ xs: 1, sm: 2 }} size="small" styles={{ label: { fontWeight: 500 } }}>
          <Descriptions.Item label="구성원">
            <Space><UserOutlined /><Typography.Text>{labelFor(meeting.memberId)}</Typography.Text></Space>
          </Descriptions.Item>
          <Descriptions.Item label="매니저">
            <Space><UserOutlined /><Typography.Text>{labelFor(meeting.managerId)}</Typography.Text></Space>
          </Descriptions.Item>
          <Descriptions.Item label="일정">{dayjs(meeting.scheduledAt).format('YYYY-MM-DD (ddd) HH:mm')}</Descriptions.Item>
          <Descriptions.Item label="반복">{repeatMap[meeting.repeatCycle] ?? meeting.repeatCycle}</Descriptions.Item>
          <Descriptions.Item label="아젠다" span={2}>{meeting.agenda || '-'}</Descriptions.Item>
          {meeting.relatedSeasonId && <Descriptions.Item label="연결 시즌"><Tag color="blue">{meeting.relatedSeasonId.slice(0, 8)}…</Tag></Descriptions.Item>}
          {isCompleted && <Descriptions.Item label="완료 시각">{dayjs(meeting.completedAt).format('YYYY-MM-DD HH:mm')}</Descriptions.Item>}
        </Descriptions>
      </Card>

      {!isCompleted && isManager && (
        <Card title="면담 완료 처리" className="tw-mb-5">
          <Form
            form={completeForm}
            layout="vertical"
            onFinish={(values) => {
              completeMut.mutate({
                memo: values.memo,
                privateMemo: values.privateMemo || undefined,
                managerReaction,
              });
            }}
          >
            <Form.Item name="memo" label="면담 기록" rules={[{ required: true, message: '면담 기록을 입력해 주세요.' }]}>
              <Input.TextArea rows={4} placeholder="논의한 내용과 합의한 결론을 정리해 주세요." />
            </Form.Item>
            <Form.Item name="privateMemo" label="비공개 메모">
              <Input.TextArea rows={2} placeholder="매니저만 볼 수 있는 메모가 있으면 남겨 주세요." />
            </Form.Item>
            <Form.Item label="매니저 반응">
              <ReactionPicker value={managerReaction} onChange={setManagerReaction} />
            </Form.Item>
            <Button type="primary" icon={<CheckCircleOutlined />} loading={completeMut.isPending} onClick={() => completeForm.submit()}>
              면담 완료
            </Button>
          </Form>
        </Card>
      )}

      {!isCompleted && isMember ? (
        <Card className="tw-mb-5 tw-rounded-2xl tw-border tw-border-slate-200/90 tw-bg-slate-50/60">
          <div className="tw-text-sm tw-font-semibold tw-text-slate-900">면담 예정</div>
          <div className="tw-mt-1 tw-text-sm tw-text-slate-500">
            면담 완료 처리는 상사가 진행합니다. 완료 후에는 이 화면에서 면담 기록과 후속 액션을 확인할 수 있습니다.
          </div>
        </Card>
      ) : null}

      {isCompleted && (
        <>
          <Card title="면담 기록" className="tw-mb-5">
            <Typography.Paragraph>{meeting.memo || <Typography.Text type="secondary">기록 없음</Typography.Text>}</Typography.Paragraph>
            {meeting.managerReaction && (
              <div className="tw-mt-3">
                <Typography.Text type="secondary" className="tw-mr-2">매니저 반응:</Typography.Text>
                {reactionConfig.find((item) => item.value === meeting.managerReaction)?.label ?? meeting.managerReaction}
              </div>
            )}
          </Card>

          {meeting.privateMemo && (
            <Card title="비공개 메모" className="tw-mb-5" style={{ borderColor: '#faad14' }}>
              <Typography.Paragraph>{meeting.privateMemo}</Typography.Paragraph>
            </Card>
          )}

          <Card title="구성원 반응" className="tw-mb-5" size="small">
            {isMember ? (
              <>
                <Typography.Text className="tw-mr-3">면담이 어땠는지 남겨 주세요.</Typography.Text>
                <ReactionPicker value={meeting.memberReaction} onChange={(value) => memberReactionMut.mutate(value)} disabled={memberReactionMut.isPending} />
              </>
            ) : (
              <Typography.Text type="secondary">
                {meeting.memberReaction
                  ? reactionConfig.find((item) => item.value === meeting.memberReaction)?.label ?? meeting.memberReaction
                  : '구성원 반응이 아직 등록되지 않았습니다.'}
              </Typography.Text>
            )}
          </Card>
        </>
      )}

      <Card
        title={
          <Space>
            <span>후속 액션</span>
            {actions.length > 0 && (
              <Badge count={`${actionsDone}/${actions.length}`} style={{ backgroundColor: actionsDone === actions.length ? '#52c41a' : '#1677ff' }} />
            )}
          </Space>
        }
        extra={
          isManager ? (
          <Button type="dashed" size="small" icon={<PlusOutlined />} onClick={() => setShowActionForm(true)}>
            액션 추가
          </Button>
          ) : null
        }
      >
        {actions.length > 0 && (
          <Progress percent={Math.round((actionsDone / actions.length) * 100)} size="small" className="tw-mb-4" strokeColor="#52c41a" />
        )}

        {actions.length === 0 && !showActionForm ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="등록된 후속 액션이 없습니다." />
        ) : (
          <List
            dataSource={actions}
            renderItem={(action) => (
              <List.Item
                key={action.meetingActionId}
                actions={[
                  action.status !== 'COMPLETED' && action.assigneeId === currentUserId && (
                    <Button
                      key="complete"
                      size="small"
                      type="link"
                      onClick={() =>
                        Modal.confirm({
                          title: '이 액션을 완료 처리할까요?',
                          onOk: () => completeActionMut.mutate(action.meetingActionId),
                        })
                      }
                    >
                      완료 처리
                    </Button>
                  ),
                ].filter(Boolean)}
              >
                <List.Item.Meta
                  avatar={<Checkbox checked={action.status === 'COMPLETED'} disabled />}
                  title={
                    <Space>
                      <Typography.Text delete={action.status === 'COMPLETED'} className={action.status === 'COMPLETED' ? 'tw-text-gray-400' : ''}>
                        {action.content}
                      </Typography.Text>
                      <Tag color={actionStatusColor[action.status as ActionStatus]}>{actionStatusLabel[action.status as ActionStatus]}</Tag>
                    </Space>
                  }
                  description={
                    <Space split={<Divider type="vertical" />} size={0}>
                      <Typography.Text type="secondary">담당: {labelFor(action.assigneeId)}</Typography.Text>
                      {action.dueDate && <Typography.Text type="secondary">기한: {dayjs(action.dueDate).format('MM/DD')}</Typography.Text>}
                      {action.tlRating && <Tag color={ratingConfig.find((item) => item.value === action.tlRating)?.color}>{ratingConfig.find((item) => item.value === action.tlRating)?.label}</Tag>}
                    </Space>
                  }
                />
                {action.status === 'COMPLETED' && isManager && (
                  <div className="tw-ml-4">
                    <TlRatingPicker value={action.tlRating} onChange={(value) => rateActionMut.mutate({ actionId: action.meetingActionId, tlRating: value })} />
                  </div>
                )}
              </List.Item>
            )}
          />
        )}

        {showActionForm && (
          <>
            <Divider dashed />
            <Form
              form={actionForm}
              layout="vertical"
              onFinish={(values) => {
                createActionMut.mutate({
                  content: values.content,
                  assigneeId: values.assigneeId,
                  dueDate: values.dueDate ? values.dueDate.format('YYYY-MM-DD') : undefined,
                });
              }}
            >
              <Form.Item name="content" label="내용" rules={[{ required: true, message: '액션 내용을 입력해 주세요.' }]}>
                <Input placeholder="누가 무엇을 언제까지 할지 한 줄로 정리해 주세요." />
              </Form.Item>
              <Row gutter={12}>
                <Col span={14}>
                  <Form.Item name="assigneeId" label="담당자" rules={[{ required: true, message: '담당자를 선택해 주세요.' }]}>
                    <MemberRemoteSelect placeholder="이름 또는 이메일로 검색" />
                  </Form.Item>
                </Col>
                <Col span={10}>
                  <Form.Item name="dueDate" label="기한">
                    <DatePicker className="tw-w-full" placeholder="기한" />
                  </Form.Item>
                </Col>
              </Row>
              <Space>
                <Button type="primary" loading={createActionMut.isPending} onClick={() => actionForm.submit()}>추가</Button>
                <Button onClick={() => setShowActionForm(false)}>취소</Button>
              </Space>
            </Form>
          </>
        )}
      </Card>

      <Modal
        open={editOpen}
        title="면담 정보 수정"
        onCancel={() => setEditOpen(false)}
        onOk={() => editForm.submit()}
        okText="저장"
        cancelText="취소"
        confirmLoading={updateMut.isPending}
        destroyOnHidden
      >
        <Form
          form={editForm}
          layout="vertical"
          onFinish={(values) => {
            updateMut.mutate({
              scheduledAt: values.scheduledAt ? values.scheduledAt.toISOString() : undefined,
              agenda: values.agenda,
            });
          }}
        >
          <Form.Item name="scheduledAt" label="일정" rules={[{ required: true, message: '면담 일정을 선택해 주세요.' }]}>
            <DatePicker showTime={{ format: 'HH:mm' }} format="YYYY-MM-DD HH:mm" className="tw-w-full" />
          </Form.Item>
          <Form.Item name="agenda" label="아젠다">
            <Input.TextArea rows={3} placeholder="면담에서 다룰 내용을 적어 주세요." />
          </Form.Item>
        </Form>
      </Modal>

      {isCompleted ? <Form form={completeForm} preserve={false} className="tw-hidden" aria-hidden /> : null}
      {!showActionForm ? <Form form={actionForm} preserve={false} className="tw-hidden" aria-hidden /> : null}
    </div>
  );
}

function ReactionPicker({
  value,
  onChange,
  disabled,
}: {
  value?: Reaction;
  onChange: (value: Reaction) => void;
  disabled?: boolean;
}) {
  return (
    <Space>
      {reactionConfig.map((reaction) => (
        <Tooltip key={reaction.value} title={reaction.label}>
          <Button
            shape="circle"
            size="large"
            disabled={disabled}
            type={value === reaction.value ? 'primary' : 'default'}
            style={value === reaction.value ? { background: reaction.color, borderColor: reaction.color } : {}}
            icon={reaction.icon}
            onClick={() => onChange(reaction.value)}
          />
        </Tooltip>
      ))}
    </Space>
  );
}

function TlRatingPicker({
  value,
  onChange,
}: {
  value?: TlRating;
  onChange: (value: TlRating) => void;
}) {
  return (
    <Space>
      {ratingConfig.map((rating) => (
        <Tag.CheckableTag key={rating.value} checked={value === rating.value} onChange={() => onChange(rating.value)} style={{ padding: '4px 12px', fontSize: 13 }}>
          {value === rating.value ? <StarFilled className="tw-mr-1" /> : <StarOutlined className="tw-mr-1" />}
          {rating.label}
        </Tag.CheckableTag>
      ))}
    </Space>
  );
}
