import { Alert, Card, Descriptions, Space, Tag, Typography } from 'antd';
import { useParams } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { memberApi } from '@/features/member/api/memberApi';
import { AppButton } from '@/shared/ui/AppButton';

export function MemberDetailPage() {
  const { memberId } = useParams({ strict: false }) as { memberId: string };
  const queryClient = useQueryClient();
  const { data: member, isLoading } = useQuery({
    queryKey: ['member', 'detail', memberId],
    queryFn: () => memberApi.detail(memberId),
  });

  const refreshDetail = () => queryClient.invalidateQueries({ queryKey: ['member', 'detail', memberId] });

  const unlockMutation = useMutation({
    mutationFn: () => memberApi.unlock(memberId),
    onSuccess: () => void refreshDetail(),
  });
  const dormantMutation = useMutation({
    mutationFn: () => memberApi.leave(memberId),
    onSuccess: () => void refreshDetail(),
  });
  const returnMutation = useMutation({
    mutationFn: () => memberApi.returnFromLeave(memberId),
    onSuccess: () => void refreshDetail(),
  });

  if (isLoading) {
    return <Typography.Text>Loading...</Typography.Text>;
  }

  if (!member) {
    return <Alert type="warning" showIcon message="직원 상세 정보를 찾을 수 없습니다." />;
  }

  return (
    <Space direction="vertical" className="tw-w-full" size={16}>
      <Typography.Title level={4} className="!tw-m-0">
        Member Detail
      </Typography.Title>
      <Card>
        <Descriptions bordered column={1} size="small">
          <Descriptions.Item label="이름">{member.name}</Descriptions.Item>
          <Descriptions.Item label="이메일">{member.email}</Descriptions.Item>
          <Descriptions.Item label="사번">{member.sabun}</Descriptions.Item>
          <Descriptions.Item label="입사일">{member.joinDate}</Descriptions.Item>
          <Descriptions.Item label="고용형태">{member.employmentType}</Descriptions.Item>
          <Descriptions.Item label="재직상태">
            <Tag color={member.memberStatus === 'ACTIVE' ? 'green' : member.memberStatus === 'DORMANT' ? 'gold' : 'volcano'}>
              {member.memberStatus}
            </Tag>
          </Descriptions.Item>
          <Descriptions.Item label="계정상태">
            <Tag color={member.accountStatus === 'ACTIVE' ? 'green' : member.accountStatus === 'BLOCKED' ? 'red' : 'default'}>
              {member.accountStatus}
            </Tag>
          </Descriptions.Item>
          <Descriptions.Item label="조직">{member.organizationName ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="직급">{member.jobGradeName ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="직책">{member.jobTitleName ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="역할">{member.roleName ?? '-'}</Descriptions.Item>
        </Descriptions>
      </Card>
      <Card>
        <Space wrap>
          <AppButton
            variant="secondary"
            loading={unlockMutation.isPending}
            disabled={member.accountStatus !== 'BLOCKED'}
            onClick={() => void unlockMutation.mutateAsync()}
          >
            잠금 해제
          </AppButton>
          <AppButton
            variant="secondary"
            loading={dormantMutation.isPending}
            disabled={member.memberStatus !== 'ACTIVE'}
            onClick={() => void dormantMutation.mutateAsync()}
          >
            휴직 처리
          </AppButton>
          <AppButton
            variant="secondary"
            loading={returnMutation.isPending}
            disabled={member.memberStatus !== 'DORMANT'}
            onClick={() => void returnMutation.mutateAsync()}
          >
            복직 처리
          </AppButton>
        </Space>
      </Card>
    </Space>
  );
}
