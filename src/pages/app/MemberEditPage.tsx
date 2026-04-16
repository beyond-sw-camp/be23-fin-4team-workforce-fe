import { App, Alert, Card, DatePicker, Form, Input, Select, Space, Typography } from 'antd';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { useEffect, useMemo } from 'react';
import type { EmploymentType, UpdateMemberHrPayload } from '@/features/member/api/memberApi';
import { memberApi } from '@/features/member/api/memberApi';
import {
  buildOrgOptions,
  MEMBER_FORM_EMPLOYMENT_OPTIONS,
  pickRowId,
  pickRowName,
} from '@/features/members/lib/memberFormShared';
import { membersKeys } from '@/features/members/queries';
import { organizationApi } from '@/features/organization/api/organizationApi';
import { useAuth } from '@/features/auth/useAuth';
import { AppButton } from '@/shared/ui/AppButton';

type FormValues = {
  name: string;
  sabun: string;
  joinDate: Dayjs;
  employmentType: EmploymentType;
  extensionNumber: string;
  telNumber: string;
  organizationId: string;
  jobGradeId: string;
  jobTitleId: string;
};

function toPayloadEmploymentType(t: EmploymentType | 'CONTRACTOR'): EmploymentType {
  return t === 'CONTRACTOR' ? 'CONTRACT' : t;
}

export function MemberEditPage() {
  const { message } = App.useApp();
  const { memberId } = useParams({ strict: false }) as { memberId: string };
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();
  const [form] = Form.useForm<FormValues>();

  const isSelf = Boolean(user?.id && memberId && user.id === memberId);

  const { data: member, isLoading, isError } = useQuery({
    queryKey: ['member', 'detail', memberId],
    queryFn: () => memberApi.detail(memberId),
    enabled: Boolean(memberId) && !isSelf,
  });

  const { data: orgList = [] } = useQuery({
    queryKey: ['organization', 'list'],
    queryFn: () => organizationApi.list(),
    enabled: !isSelf,
  });

  const { data: grades = [] } = useQuery({
    queryKey: ['organization', 'job-grades'],
    queryFn: () => organizationApi.listJobGrades(),
    enabled: !isSelf,
  });

  const { data: titles = [] } = useQuery({
    queryKey: ['organization', 'job-titles'],
    queryFn: () => organizationApi.listJobTitles(),
    enabled: !isSelf,
  });

  useEffect(() => {
    if (!member) return;
    form.setFieldsValue({
      name: member.name,
      sabun: member.sabun,
      joinDate: dayjs(member.joinDate),
      employmentType: toPayloadEmploymentType(member.employmentType),
      extensionNumber: member.extensionNumber ?? '',
      telNumber: member.telNumber ?? '',
      organizationId: member.organizationId ?? '',
      jobGradeId: member.jobGradeId ?? '',
      jobTitleId: member.jobTitleId ?? '',
    });
  }, [member, form]);

  const updateM = useMutation({
    mutationFn: (payload: UpdateMemberHrPayload) => memberApi.updateHr(memberId, payload),
    onSuccess: async () => {
      message.success('직원 정보가 수정되었습니다.');
      await qc.invalidateQueries({ queryKey: ['member', 'detail', memberId] });
      await qc.invalidateQueries({ queryKey: membersKeys.all });
      void navigate({ to: '/app/members/$memberId', params: { memberId } });
    },
    onError: (e: Error) => message.error(e.message || '수정에 실패했습니다.'),
  });

  const orgOptions = useMemo(() => buildOrgOptions(orgList), [orgList]);

  const gradeOptions = grades
    .map((row) => {
      const r = row as Record<string, unknown>;
      const id = pickRowId(r);
      return id ? { value: id, label: pickRowName(r) || id } : null;
    })
    .filter((x): x is { value: string; label: string } => x !== null);

  const titleOptions = titles
    .map((row) => {
      const r = row as Record<string, unknown>;
      const id = pickRowId(r);
      return id ? { value: id, label: pickRowName(r) || id } : null;
    })
    .filter((x): x is { value: string; label: string } => x !== null);

  const onFinish = async () => {
    try {
      const v = await form.validateFields();
      const payload: UpdateMemberHrPayload = {
        name: v.name.trim(),
        sabun: v.sabun.trim(),
        joinDate: v.joinDate.format('YYYY-MM-DD'),
        employmentType: v.employmentType,
        extensionNumber: v.extensionNumber.trim(),
        telNumber: v.telNumber.trim(),
        organizationId: v.organizationId,
        jobGradeId: v.jobGradeId,
        jobTitleId: v.jobTitleId,
      };
      await updateM.mutateAsync(payload);
    } catch {
      /* validation */
    }
  };

  if (isSelf) {
    return (
      <Space direction="vertical" className="tw-w-full" size={16}>
        <Link
          to="/app/members/$memberId"
          params={{ memberId }}
          className="tw-inline-block tw-text-sm tw-text-[#2563EB] tw-no-underline hover:tw-underline"
        >
          ← 구성원 상세
        </Link>
        <Alert
          type="info"
          showIcon
          message="본인 인사 정보는 여기서 수정할 수 없습니다."
          description={
            <Link to="/app/me/edit" className="tw-text-[#2563EB]">
              내 정보 수정(마이페이지)으로 이동
            </Link>
          }
        />
      </Space>
    );
  }

  if (isLoading) {
    return <Typography.Text type="secondary">불러오는 중…</Typography.Text>;
  }

  if (isError || !member) {
    return <Alert type="warning" showIcon message="구성원 정보를 찾을 수 없습니다." />;
  }

  return (
    <Space direction="vertical" className="tw-w-full" size={16}>
      <div>
        <Link
          to="/app/members/$memberId"
          params={{ memberId }}
          className="tw-mb-2 tw-inline-block tw-text-sm tw-text-[#2563EB] tw-no-underline hover:tw-underline"
        >
          ← 구성원 상세
        </Link>
        <Typography.Title level={4} className="!tw-m-0 !tw-text-slate-900">
          직원 정보 수정 (인사)
        </Typography.Title>
        <Typography.Text type="secondary" className="tw-text-sm">
          {member.name} · {member.email}
        </Typography.Text>
      </div>

      <Card className="tw-border-slate-200/80 tw-shadow-sm">
        <Typography.Paragraph type="secondary" className="!tw-mb-4 !tw-text-sm">
          MEMBER:UPDATE 권한이 있는 경우에만 저장할 수 있습니다. Authorization, X-User-UUID, X-User-MemberPositionId는 클라이언트에서 설정됩니다.
        </Typography.Paragraph>
        <Form<FormValues> form={form} layout="vertical" requiredMark={false} className="tw-max-w-[560px]">
          <Form.Item name="name" label="이름" rules={[{ required: true, message: '이름을 입력하세요.' }]}>
            <Input maxLength={80} />
          </Form.Item>
          <Form.Item name="sabun" label="사번" rules={[{ required: true, message: '사번을 입력하세요.' }]}>
            <Input maxLength={40} />
          </Form.Item>
          <Form.Item name="joinDate" label="입사일" rules={[{ required: true, message: '입사일을 선택하세요.' }]}>
            <DatePicker className="tw-w-full" format="YYYY-MM-DD" />
          </Form.Item>
          <Form.Item name="employmentType" label="고용 형태" rules={[{ required: true }]}>
            <Select options={MEMBER_FORM_EMPLOYMENT_OPTIONS} placeholder="선택" />
          </Form.Item>
          <Form.Item name="extensionNumber" label="내선번호">
            <Input maxLength={20} placeholder="예: 1234" />
          </Form.Item>
          <Form.Item name="telNumber" label="유선 전화">
            <Input maxLength={40} placeholder="예: 02-1234-5678" />
          </Form.Item>
          <Form.Item name="organizationId" label="조직" rules={[{ required: true, message: '조직을 선택하세요.' }]}>
            <Select showSearch optionFilterProp="label" options={orgOptions} placeholder="조직 선택" />
          </Form.Item>
          <Form.Item name="jobGradeId" label="직급" rules={[{ required: true, message: '직급을 선택하세요.' }]}>
            <Select showSearch optionFilterProp="label" options={gradeOptions} placeholder="직급 선택" />
          </Form.Item>
          <Form.Item name="jobTitleId" label="직책" rules={[{ required: true, message: '직책을 선택하세요.' }]}>
            <Select showSearch optionFilterProp="label" options={titleOptions} placeholder="직책 선택" />
          </Form.Item>
          <AppButton type="primary" loading={updateM.isPending} onClick={() => void onFinish()}>
            저장
          </AppButton>
        </Form>
      </Card>
    </Space>
  );
}
