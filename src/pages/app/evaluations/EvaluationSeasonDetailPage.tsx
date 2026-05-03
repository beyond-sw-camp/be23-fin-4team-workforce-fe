import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { Alert, App, Button, Card, Collapse, Space, Table, Tabs, Tag, Typography } from 'antd';
import { CalendarOutlined, CheckCircleOutlined, SoundOutlined, StopOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { evaluationRedesignApi } from '@/features/evaluation/api/evaluationRedesignApi';
import { seasonStatusLabel } from '@/features/evaluation/lib/evaluationLabels';
import type { EvaluationSeason, SeasonStatus } from '@/features/evaluation/model/types';
import type { EvaluationFlowResponse, EvaluationStage } from '@/features/evaluation/model/workflowTypes';
import { GroupsSection } from '@/features/evaluation/ui/GroupsSection';
import { meetingApi } from '@/features/meetings/api/meetingApi';
import type { MeetingRecord } from '@/features/meetings/model/types';
import { useMemberDisplayNames } from '@/features/members/hooks/useMemberDisplayNames';
import { PERM } from '@/features/permissions/backend-permissions';
import { usePermissions } from '@/features/permissions/usePermissionsHook';
import { parseApiError } from '@/shared/api/error-parser';
import { DetailPageHeader } from '@/shared/ui/DetailPageHeader';

const { Text, Title } = Typography;
const STAGES: SeasonStatus[] = ['DRAFT', 'SELF_EVAL', 'MANAGER_EVAL', 'GRADE_CONFIRM', 'RESULT_PUBLISHED', 'INTERVIEW', 'CLOSED'];
const RESPONSE_STAGE_LABEL: Record<EvaluationStage, string> = {
  SELF_PENDING: '자기평가 대기',
  SELF_SUBMITTED: '자기평가 제출',
  PEER_OPEN: '상사평가 중',
  UPWARD_OPEN: '상사평가 중',
  DOWNWARD_OPEN: '상사평가 중',
  CALIBRATION_OPEN: '등급 확정 중',
  CALIBRATION_LOCKED: '공개 대기',
  CONFIRMED: '등급 확정',
  SKIPPED_LEAVER: '평가 제외',
};

export default function EvaluationSeasonDetailPage() {
  const { message } = App.useApp();
  const { hasPermission } = usePermissions();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { seasonId } = useParams({ strict: false }) as { seasonId: string };
  const canUpdate = hasPermission(PERM.EVALUATION_UPDATE);
  const canRead = hasPermission(PERM.EVALUATION_READ);

  const { data: seasons = [] } = useQuery({
    queryKey: ['eval-seasons'],
    queryFn: async () => {
      const redesigned = await evaluationRedesignApi.listSeasons();
      return redesigned.map((s) => ({
        seasonId: s.seasonId,
        companyId: s.companyId,
        name: s.name,
        type: s.type,
        targetCycle: s.targetCycle,
        targetCycleStart: s.targetCycleStart,
        startDate: s.startDate,
        endDate: s.endDate,
        status: s.status,
        resultPublishDate: s.resultPublishDate ?? undefined,
        resultsPublishedAt: s.resultsPublishedAt ?? undefined,
      })) as EvaluationSeason[];
    },
  });
  const season = useMemo(() => seasons.find((item) => item.seasonId === seasonId), [seasons, seasonId]);

  const { data: groups = [] } = useQuery({
    queryKey: ['eval-groups', seasonId],
    queryFn: () => evaluationRedesignApi.listGroups(seasonId),
    enabled: !!seasonId,
  });
  const { data: meetings = [] } = useQuery({
    queryKey: ['evaluation-season-meetings', seasonId],
    queryFn: () => meetingApi.listSeasonMeetings(seasonId),
    enabled: !!seasonId && ['RESULT_PUBLISHED', 'INTERVIEW', 'CLOSED'].includes(season?.status ?? ''),
  });
  const { data: seasonResponses = [] } = useQuery({
    queryKey: ['evaluation-season-responses', seasonId],
    queryFn: () => evaluationRedesignApi.listSeasonResponses(seasonId),
    enabled: !!seasonId && !!season && season.status !== 'DRAFT' && canRead,
  });
  const meetingMemberIds = useMemo(
    () =>
      Array.from(
        new Set([
          ...meetings.flatMap((meeting) => [meeting.memberId, meeting.managerId]).filter(Boolean),
          ...seasonResponses.flatMap((response) => [response.targetMemberId, response.evaluatorId]).filter(Boolean),
        ]),
      ),
    [meetings, seasonResponses],
  );
  const { labelFor: labelMeetingMember } = useMemberDisplayNames(meetingMemberIds);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['eval-seasons'] });
    void queryClient.invalidateQueries({ queryKey: ['eval-groups', seasonId] });
    void queryClient.invalidateQueries({ queryKey: ['evaluation-season-responses', seasonId] });
  };

  const stageMutation = useMutation({
    mutationFn: async (status: SeasonStatus) => {
      if (status === 'DRAFT') return evaluationRedesignApi.activateSeason(seasonId);
      if (status === 'SELF_EVAL') return evaluationRedesignApi.openManagerEval(seasonId);
      if (status === 'MANAGER_EVAL') return evaluationRedesignApi.openGradeConfirm(seasonId);
      if (status === 'GRADE_CONFIRM') return evaluationRedesignApi.publishSeason(seasonId);
      if (status === 'RESULT_PUBLISHED') return evaluationRedesignApi.openInterview(seasonId);
      if (status === 'INTERVIEW') return evaluationRedesignApi.closeSeason(seasonId);
      return Promise.resolve();
    },
    onSuccess: () => {
      message.success('평가 단계가 변경되었습니다.');
      invalidate();
    },
    onError: (err) => message.error(parseApiError(err).message),
  });
  const goBackToManagement = () => navigate({ to: '/app/evaluations', search: { view: 'overview' } });

  if (!season) {
    return (
      <div className="tw-mx-auto tw-w-full tw-space-y-4">
        <DetailPageHeader
          onBackClick={goBackToManagement}
          backLabel="평가 운영 관리"
          title="평가 상세"
          subtitle="평가 정보를 불러오지 못했습니다. 목록에서 다시 선택해 주세요."
          showShare={false}
        />
        <Card>
          <Text type="secondary">평가를 찾을 수 없습니다.</Text>
        </Card>
      </div>
    );
  }

  const nextAction = nextStageAction(season.status);
  const opsSummary = buildOperationSummary(seasonResponses, meetings);
  const stageGuide = stageGuideText(season.status);

  return (
    <div className="tw-mx-auto tw-w-full tw-space-y-5">
      <DetailPageHeader
        onBackClick={goBackToManagement}
        backLabel="평가 운영 관리"
        title="평가 상세"
        subtitle="조직목표 기간을 평가 기준으로 사용하고 자기평가부터 면담까지 단계별로 운영합니다."
        showShare
      />

      <Card className="tw-rounded-3xl tw-border tw-border-slate-200/80 tw-shadow-sm tw-shadow-slate-900/5" styles={{ body: { padding: 24 } }}>
        <div className="tw-grid tw-grid-cols-1 tw-gap-5 xl:tw-grid-cols-[minmax(0,1fr)_340px]">
          <div className="tw-min-w-0">
            <div className="tw-flex tw-flex-wrap tw-items-center tw-gap-2">
              <Tag color="blue" className="!tw-m-0">{seasonStatusLabel(season.status)}</Tag>
              <Tag color={season.resultsPublishedAt ? 'green' : 'default'} className="!tw-m-0">
                {season.resultsPublishedAt ? '결과 공개 완료' : '결과 비공개'}
              </Tag>
            </div>
            <Title level={2} className="!tw-mt-3 !tw-mb-2 !tw-text-[28px]">
              {season.name}
            </Title>
            <div className="tw-flex tw-flex-wrap tw-gap-x-4 tw-gap-y-1.5 tw-text-sm tw-text-slate-500">
              <span className="tw-inline-flex tw-items-center tw-gap-1.5">
                <CalendarOutlined />
                운영 기간 {season.startDate} ~ {season.endDate}
              </span>
              {season.targetCycleStart ? (
                <span>
                  목표 기간 <strong className="tw-text-slate-800">{season.targetCycleStart}</strong>
                  {season.targetCycle ? <span className="tw-text-slate-400"> · {season.targetCycle}</span> : null}
                </span>
              ) : null}
              {season.resultPublishDate ? (
                <span className="tw-inline-flex tw-items-center tw-gap-1.5">
                  <SoundOutlined />
                  공개 예정 {season.resultPublishDate}
                </span>
              ) : null}
            </div>

            <div className="tw-mt-5">
              <StageRail status={season.status} />
            </div>
          </div>

          <div className="tw-rounded-2xl tw-border tw-border-slate-200 tw-bg-slate-50 tw-p-4">
            <div className="tw-text-sm tw-font-semibold tw-text-slate-900">다음 운영</div>
            <div className="tw-mt-1 tw-text-sm tw-leading-6 tw-text-slate-600">{stageGuide}</div>
            {canUpdate && nextAction ? (
              <Button
                type="primary"
                block
                icon={nextAction.danger ? <StopOutlined /> : <CheckCircleOutlined />}
                danger={nextAction.danger}
                loading={stageMutation.isPending}
                onClick={() => stageMutation.mutate(season.status)}
                className="!tw-mt-4 !tw-h-10 !tw-rounded-xl !tw-font-semibold"
              >
                {nextAction.label}
              </Button>
            ) : null}
            {nextAction ? (
              <div className="tw-mt-2 tw-text-xs tw-leading-5 tw-text-slate-500">{nextAction.description}</div>
            ) : null}
          </div>
        </div>

        <div className="tw-mt-5 tw-grid tw-grid-cols-2 tw-gap-3 md:tw-grid-cols-4">
          <StageQuickMetric label="대상자" value={`${opsSummary.total}명`} help="자동 생성된 평가 응답" />
          <StageQuickMetric label="자기평가 제출" value={opsSummary.total ? `${opsSummary.selfSubmitted}/${opsSummary.total}` : '-'} help="제출 또는 이후 단계" tone="blue" />
          <StageQuickMetric label="등급 확정" value={opsSummary.total ? `${opsSummary.confirmed}/${opsSummary.total}` : '-'} help="최종 등급 확정" tone="green" />
          <StageQuickMetric label="면담" value={opsSummary.meetingTotal ? `${opsSummary.meetingDone}/${opsSummary.meetingTotal}` : '-'} help="결과 공개 후 관리" tone="gold" />
        </div>
      </Card>

      <Card
        className="tw-rounded-2xl tw-border tw-border-slate-200/80 tw-shadow-sm tw-shadow-slate-900/5"
        styles={{ body: { padding: 20 } }}
      >
        <Tabs
          defaultActiveKey="targets"
          items={[
            {
              key: 'targets',
              label: `대상자/평가자 ${groups.length > 0 ? `· ${opsSummary.total}명` : ''}`,
              children: (
                <div className="tw-space-y-4">
                  <Alert
                    type="info"
                    showIcon
                    className="!tw-rounded-xl"
                    message={season.status === 'DRAFT' ? '평가 시작 시 대상자가 자동으로 로드됩니다.' : '평가 대상자와 상사평가자를 확인하세요.'}
                    description={
                      season.status === 'DRAFT'
                        ? '목표 기간에 승인 완료된 개인 목표를 가진 구성원이 자동으로 평가 대상자가 됩니다.'
                        : '대상자는 승인 완료 개인 목표 기준이며, 상사평가자는 직속 상사 기준으로 자동 지정됩니다.'
                    }
                  />
                  <GroupsSection
                    groups={groups}
                    selectedSeasonId={seasonId}
                    seasonStatus={season.status}
                    onInvalidate={invalidate}
                  />
                </div>
              ),
            },
            {
              key: 'results',
              label: `결과 현황 ${opsSummary.confirmed ? `· ${opsSummary.confirmed}명 확정` : ''}`,
              children:
                canRead && season.status !== 'DRAFT' ? (
                  <SeasonResultsDashboard
                    responses={seasonResponses}
                    groups={groups}
                    meetings={meetings}
                    labelFor={labelMeetingMember}
                    embedded
                  />
                ) : (
                  <SeasonEmptyPanel
                    title="아직 결과 현황을 볼 수 없습니다."
                    description="평가를 시작하면 자기평가, 상사평가, 등급 확정 진행 현황이 이 탭에 표시됩니다."
                  />
                ),
            },
            {
              key: 'meetings',
              label: `피드백 면담 ${opsSummary.meetingTotal ? `· ${opsSummary.meetingDone}/${opsSummary.meetingTotal}` : ''}`,
              children: ['RESULT_PUBLISHED', 'INTERVIEW', 'CLOSED'].includes(season.status) ? (
                <SeasonMeetingsCard meetings={meetings} labelFor={labelMeetingMember} embedded />
              ) : (
                <SeasonEmptyPanel
                  title="면담은 결과 공개 후 생성됩니다."
                  description="결과 공개 단계에 진입하면 대상자별 피드백 면담이 자동으로 준비되고 이 탭에서 관리합니다."
                />
              ),
            },
          ]}
        />
      </Card>
    </div>
  );
}

function StageRail({ status }: { status: SeasonStatus }) {
  const currentIndex = Math.max(0, STAGES.indexOf(status));

  return (
    <div className="tw-grid tw-grid-cols-2 tw-gap-2 md:tw-grid-cols-4 xl:tw-grid-cols-7">
      {STAGES.map((stage, index) => {
        const active = index === currentIndex;
        const done = index < currentIndex;
        const className = active
          ? 'tw-border-[#1e3a5f] tw-bg-[#1e3a5f] tw-text-white'
          : done
            ? 'tw-border-emerald-100 tw-bg-emerald-50 tw-text-emerald-700'
            : 'tw-border-slate-200 tw-bg-white tw-text-slate-400';

        return (
          <div
            key={stage}
            className={`tw-rounded-xl tw-border tw-px-3 tw-py-2 tw-text-center tw-text-xs tw-font-semibold ${className}`}
          >
            {seasonStatusLabel(stage)}
          </div>
        );
      })}
    </div>
  );
}

function StageQuickMetric({
  label,
  value,
  help,
  tone = 'default',
}: {
  label: string;
  value: string;
  help: string;
  tone?: 'default' | 'blue' | 'green' | 'gold';
}) {
  const toneClass =
    tone === 'blue'
      ? 'tw-border-blue-100 tw-bg-blue-50/70 tw-text-blue-700'
      : tone === 'green'
        ? 'tw-border-emerald-100 tw-bg-emerald-50/70 tw-text-emerald-700'
        : tone === 'gold'
          ? 'tw-border-amber-100 tw-bg-amber-50/70 tw-text-amber-700'
          : 'tw-border-slate-200 tw-bg-white tw-text-slate-900';

  return (
    <div className={`tw-rounded-2xl tw-border tw-p-4 ${toneClass}`}>
      <div className="tw-text-xs tw-font-semibold tw-opacity-80">{label}</div>
      <div className="tw-mt-1 tw-text-2xl tw-font-bold">{value}</div>
      <div className="tw-mt-1 tw-text-[11px] tw-leading-4 tw-opacity-70">{help}</div>
    </div>
  );
}

function buildOperationSummary(responses: EvaluationFlowResponse[], meetings: MeetingRecord[]) {
  const selfSubmittedStages: EvaluationStage[] = [
    'SELF_SUBMITTED',
    'PEER_OPEN',
    'UPWARD_OPEN',
    'DOWNWARD_OPEN',
    'CALIBRATION_OPEN',
    'CALIBRATION_LOCKED',
    'CONFIRMED',
  ];

  return {
    total: responses.length,
    selfSubmitted: responses.filter((response) => selfSubmittedStages.includes(response.stage)).length,
    confirmed: responses.filter((response) => response.stage === 'CONFIRMED').length,
    meetingTotal: meetings.length,
    meetingDone: meetings.filter((meeting) => !!meeting.completedAt).length,
  };
}

function stageGuideText(status: SeasonStatus) {
  if (status === 'DRAFT') {
    return '평가를 시작하면 승인 완료 개인 목표 보유자가 자동으로 대상자가 되고 자기평가가 열립니다.';
  }
  if (status === 'SELF_EVAL') {
    return '구성원은 자기평가를 작성합니다. 운영자는 대상자와 상사평가자 누락만 확인하면 됩니다.';
  }
  if (status === 'MANAGER_EVAL') {
    return '상사평가자가 목표별 등급과 근거를 입력합니다. 미작성자가 없는지 확인해 주세요.';
  }
  if (status === 'GRADE_CONFIRM') {
    return '상사평가 결과를 기준으로 최종 등급을 확정합니다. 완료 후 결과를 공개합니다.';
  }
  if (status === 'RESULT_PUBLISHED') {
    return '구성원이 결과를 확인할 수 있습니다. 다음 단계에서 피드백 면담을 진행합니다.';
  }
  if (status === 'INTERVIEW') {
    return '공개된 결과를 바탕으로 면담을 진행합니다. 면담 완료 후 평가를 종료합니다.';
  }
  return '평가가 종료되었습니다. 결과와 면담 기록을 조회할 수 있습니다.';
}

function SeasonEmptyPanel({ title, description }: { title: string; description: string }) {
  return (
    <div className="tw-rounded-2xl tw-border tw-border-dashed tw-border-slate-200 tw-bg-slate-50 tw-p-10 tw-text-center">
      <div className="tw-text-sm tw-font-semibold tw-text-slate-900">{title}</div>
      <div className="tw-mt-2 tw-text-sm tw-leading-6 tw-text-slate-500">{description}</div>
    </div>
  );
}

function SeasonResultsDashboard({
  responses,
  groups,
  meetings,
  labelFor,
  embedded = false,
}: {
  responses: EvaluationFlowResponse[];
  groups: Array<{ groupId: string; name: string }>;
  meetings: MeetingRecord[];
  labelFor: (memberId: string) => string;
  embedded?: boolean;
}) {
  const meetingByMember = useMemo(() => {
    const map = new Map<string, MeetingRecord>();
    meetings.forEach((meeting) => {
      const current = map.get(meeting.memberId);
      if (!current || dayjs(meeting.scheduledAt).isAfter(dayjs(current.scheduledAt))) {
        map.set(meeting.memberId, meeting);
      }
    });
    return map;
  }, [meetings]);

  const groupNameById = useMemo(() => new Map(groups.map((group) => [group.groupId, group.name])), [groups]);
  const dashboard = useMemo(() => buildResultDashboard(responses, meetingByMember), [responses, meetingByMember]);
  const groupedRows = useMemo(() => {
    const map = new Map<string, EvaluationFlowResponse[]>();
    responses.forEach((response) => {
      const key = response.groupId ? (groupNameById.get(response.groupId) ?? '평가 그룹 미지정') : '평가 그룹 미지정';
      const rows = map.get(key) ?? [];
      rows.push(response);
      map.set(key, rows);
    });
    return Array.from(map.entries()).map(([name, rows]) => ({
      name,
      rows: rows.sort((a, b) => (b.finalScoreSnapshot ?? 0) - (a.finalScoreSnapshot ?? 0)),
    }));
  }, [groupNameById, responses]);

  const content = (
    <div className="tw-space-y-5">
        <div className="tw-grid tw-grid-cols-2 tw-gap-3 md:tw-grid-cols-3 xl:tw-grid-cols-5">
          <DashboardMetric label="평가 대상" value={`${dashboard.total}명`} help="이 평가 기간에 생성된 응답 수" />
          <DashboardMetric label="등급 확정" value={`${dashboard.confirmed}명`} help="최종 등급이 확정된 구성원" />
          <DashboardMetric label="평균 점수" value={dashboard.averageScore == null ? '-' : dashboard.averageScore.toFixed(1)} help="확정 점수 평균" />
          <DashboardMetric
            label="면담 완료"
            value={dashboard.meetingTotal === 0 ? '-' : `${dashboard.meetingDone}/${dashboard.meetingTotal}`}
            help="결과 공개 후 생성된 면담 완료 현황"
          />
          <DashboardMetric label="이의제기" value={`${dashboard.objections}건`} help="요청 또는 검토 중인 이의제기" />
        </div>

        <div className="tw-rounded-2xl tw-border tw-border-slate-200 tw-bg-slate-50/60 tw-p-4">
          <div className="tw-mb-3 tw-text-sm tw-font-semibold tw-text-slate-900">등급 분포</div>
          <div className="tw-grid tw-grid-cols-4 tw-gap-2">
            {(['S', 'A', 'B', 'C'] as const).map((grade) => (
              <div key={grade} className="tw-rounded-xl tw-bg-white tw-p-3 tw-text-center tw-shadow-sm tw-shadow-slate-900/5">
                <div className="tw-text-xs tw-font-semibold tw-text-slate-400">{grade}</div>
                <div className="tw-mt-1 tw-text-lg tw-font-bold tw-text-slate-900">{dashboard.gradeCounts[grade]}</div>
              </div>
            ))}
          </div>
        </div>

        {responses.length === 0 ? (
          <div className="tw-rounded-2xl tw-bg-slate-50 tw-p-8 tw-text-center tw-text-sm tw-text-slate-500">
            아직 생성된 평가 응답이 없습니다. 평가를 시작하면 대상자 현황이 표시됩니다.
          </div>
        ) : (
          <Collapse
            bordered={false}
            expandIconPosition="end"
            className="tw-bg-transparent"
            defaultActiveKey={groupedRows.slice(0, 1).map((group) => group.name)}
            items={groupedRows.map((group) => ({
              key: group.name,
              label: (
                <div className="tw-flex tw-flex-wrap tw-items-center tw-justify-between tw-gap-2">
                  <span className="tw-font-semibold tw-text-slate-900">{group.name}</span>
                  <span className="tw-text-xs tw-text-slate-500">{group.rows.length}명</span>
                </div>
              ),
              children: (
                <SeasonResultTable
                  rows={group.rows}
                  meetingByMember={meetingByMember}
                  labelFor={labelFor}
                />
              ),
            }))}
          />
        )}
      </div>
  );

  if (embedded) return content;

  return (
    <Card
      title="결과 현황"
      className="tw-rounded-2xl tw-border tw-border-slate-200/80 tw-shadow-sm tw-shadow-slate-900/5"
      styles={{ body: { padding: 20 } }}
    >
      {content}
    </Card>
  );
}

function DashboardMetric({ label, value, help }: { label: string; value: string; help: string }) {
  return (
    <div className="tw-rounded-2xl tw-border tw-border-slate-200 tw-bg-white tw-p-4">
      <div className="tw-text-xs tw-font-semibold tw-text-slate-500">{label}</div>
      <div className="tw-mt-2 tw-text-2xl tw-font-bold tw-text-slate-900">{value}</div>
      <div className="tw-mt-1 tw-text-[11px] tw-leading-4 tw-text-slate-400">{help}</div>
    </div>
  );
}

function SeasonResultTable({
  rows,
  meetingByMember,
  labelFor,
}: {
  rows: EvaluationFlowResponse[];
  meetingByMember: Map<string, MeetingRecord>;
  labelFor: (memberId: string) => string;
}) {
  return (
    <Table
      rowKey="responseId"
      pagination={false}
      size="small"
      scroll={{ x: 760 }}
      dataSource={rows}
      columns={[
        {
          title: '구성원',
          dataIndex: 'targetMemberId',
          render: (memberId: string) => labelFor(memberId),
        },
        {
          title: '상사평가자',
          dataIndex: 'evaluatorId',
          render: (memberId: string) => labelFor(memberId),
        },
        {
          title: '상태',
          dataIndex: 'stage',
          render: (stage: EvaluationStage) => <Tag>{RESPONSE_STAGE_LABEL[stage] ?? stage}</Tag>,
        },
        {
          title: '등급',
          dataIndex: 'confirmedGrade',
          render: (grade?: string | null) => grade ? <GradeTag grade={grade} /> : <span className="tw-text-slate-400">-</span>,
        },
        {
          title: '점수',
          dataIndex: 'finalScoreSnapshot',
          render: (score?: number | null) => score == null ? '-' : score.toFixed(1),
        },
        {
          title: '이의제기',
          dataIndex: 'objectionStatus',
          render: (status?: string | null) => objectionTag(status),
        },
        {
          title: '면담',
          render: (_: unknown, record: EvaluationFlowResponse) => {
            const meeting = meetingByMember.get(record.targetMemberId);
            if (!meeting) return <span className="tw-text-slate-400">미생성</span>;
            return meeting.completedAt ? <Tag color="green">완료</Tag> : <Tag color="processing">예정</Tag>;
          },
        },
      ]}
    />
  );
}

function GradeTag({ grade }: { grade: string }) {
  const color = grade === 'S' ? 'gold' : grade === 'A' ? 'cyan' : grade === 'B' ? 'blue' : 'default';
  return <Tag color={color}>{grade}</Tag>;
}

function objectionTag(status?: string | null) {
  if (!status || status === 'NONE') return <span className="tw-text-slate-400">없음</span>;
  if (status === 'REQUESTED') return <Tag color="orange">요청</Tag>;
  if (status === 'REVIEWING') return <Tag color="purple">검토 중</Tag>;
  if (status === 'RESOLVED') return <Tag color="green">종결</Tag>;
  return <Tag>{status}</Tag>;
}

function buildResultDashboard(responses: EvaluationFlowResponse[], meetingByMember: Map<string, MeetingRecord>) {
  const confirmedResponses = responses.filter((response) => response.stage === 'CONFIRMED');
  const scoreValues = confirmedResponses
    .map((response) => response.finalScoreSnapshot)
    .filter((score): score is number => typeof score === 'number');
  const gradeCounts = { S: 0, A: 0, B: 0, C: 0 };
  confirmedResponses.forEach((response) => {
    const grade = response.confirmedGrade;
    if (grade === 'S' || grade === 'A' || grade === 'B' || grade === 'C') gradeCounts[grade] += 1;
  });
  const memberIds = new Set(responses.map((response) => response.targetMemberId));
  const meetings = Array.from(memberIds).map((memberId) => meetingByMember.get(memberId)).filter(Boolean) as MeetingRecord[];
  return {
    total: responses.length,
    confirmed: confirmedResponses.length,
    averageScore: scoreValues.length > 0 ? scoreValues.reduce((sum, score) => sum + score, 0) / scoreValues.length : null,
    meetingTotal: meetings.length,
    meetingDone: meetings.filter((meeting) => !!meeting.completedAt).length,
    objections: responses.filter((response) => response.objectionStatus && response.objectionStatus !== 'NONE' && response.objectionStatus !== 'RESOLVED').length,
    gradeCounts,
  };
}

function SeasonMeetingsCard({
  meetings,
  labelFor,
  embedded = false,
}: {
  meetings: MeetingRecord[];
  labelFor: (memberId: string) => string;
  embedded?: boolean;
}) {
  const completed = meetings.filter((meeting) => !!meeting.completedAt).length;
  const content = (
    <div className="tw-space-y-3">
      {embedded ? (
        <div className="tw-flex tw-justify-end">
          <Tag color={completed === meetings.length && meetings.length > 0 ? 'green' : 'blue'}>
            완료 {completed}/{meetings.length}
          </Tag>
        </div>
      ) : null}
      <Table
        rowKey="meetingRecordId"
        pagination={false}
        scroll={{ x: 760 }}
        dataSource={meetings}
        locale={{ emptyText: '생성된 피드백 면담이 없습니다. 결과 공개 후 자동 생성됩니다.' }}
        columns={[
          {
            title: '구성원',
            dataIndex: 'memberId',
            render: (memberId: string) => labelFor(memberId),
          },
          {
            title: '상사',
            dataIndex: 'managerId',
            render: (managerId: string) => labelFor(managerId),
          },
          {
            title: '예정 일시',
            dataIndex: 'scheduledAt',
            render: (value: string) => (
              <Space>
                <CalendarOutlined className="tw-text-slate-400" />
                {dayjs(value).format('YYYY-MM-DD HH:mm')}
              </Space>
            ),
          },
          {
            title: '상태',
            render: (_: unknown, record: MeetingRecord) =>
              record.completedAt ? <Tag color="green">완료</Tag> : <Tag color="processing">예정</Tag>,
          },
          {
            title: '',
            align: 'right' as const,
            render: (_: unknown, record: MeetingRecord) => (
              <Link
                to="/app/meetings/$meetingId"
                params={{ meetingId: record.meetingRecordId }}
                className="tw-font-medium tw-text-[#1e3a5f]"
              >
                면담 보기
              </Link>
            ),
          },
        ]}
      />
    </div>
  );

  if (embedded) return content;

  return (
    <Card
      title="피드백 면담"
      className="tw-rounded-2xl tw-border tw-border-slate-200/80 tw-shadow-sm tw-shadow-slate-900/5"
      extra={
        <Tag color={completed === meetings.length && meetings.length > 0 ? 'green' : 'blue'}>
          완료 {completed}/{meetings.length}
        </Tag>
      }
    >
      {content}
    </Card>
  );
}

function nextStageAction(status: SeasonStatus): { label: string; description: string; danger?: boolean } | null {
  if (status === 'DRAFT') {
    return {
      label: '평가 시작',
      description: '승인 완료 목표 보유자를 불러오고 자기평가 작성을 시작합니다.',
    };
  }
  if (status === 'SELF_EVAL') {
    return {
      label: '상사평가 시작',
      description: '자기평가를 마감하고 상사평가 단계로 넘어갑니다.',
    };
  }
  if (status === 'MANAGER_EVAL') {
    return {
      label: '등급 확정 시작',
      description: '상사평가를 마감하고 등급 확정 단계로 넘어갑니다.',
    };
  }
  if (status === 'GRADE_CONFIRM') {
    return {
      label: '결과 공개',
      description: '확정된 평가 결과를 구성원에게 공개합니다.',
    };
  }
  if (status === 'RESULT_PUBLISHED') {
    return {
      label: '면담 단계로 진행',
      description: '공개된 결과를 바탕으로 면담을 진행합니다.',
    };
  }
  if (status === 'INTERVIEW') {
    return {
      label: '평가 종료',
      description: '면담까지 완료된 평가를 종료합니다.',
      danger: true,
    };
  }
  return null;
}
