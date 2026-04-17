import { App, Alert, Button, Card, DatePicker, Form, Input, Select, Space, Typography } from 'antd';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { useEffect, useMemo } from 'react';
import { MEMBER_STATUS_KO } from '@/app/locale/app-ko';
import type { EmploymentType, MemberStatus, UpdateMemberHrPayload } from '@/features/member/api/memberApi';
import { memberApi } from '@/features/member/api/memberApi';
import {
  buildOrgOptions,
  MEMBER_FORM_EMPLOYMENT_OPTIONS,
  pickRowId,
  pickRowName,
} from '@/features/members/lib/memberFormShared';
import { membersCtaButtonClass } from '@/features/members/ui/membersCtaButtonClass';
import { membersKeys } from '@/features/members/queries';
import { organizationApi } from '@/features/organization/api/organizationApi';
import { useAuth } from '@/features/auth/useAuth';

const MEMBER_FORM_STATUS_OPTIONS = (['ACTIVE', 'DORMANT', 'LEAVE'] as const).map((v) => ({
  value: v,
  label: MEMBER_STATUS_KO[v],
}));

/** 폼 전용 — 제출 시 isPromotion 으로 변환 */
type PromotionFormValue = 'omit' | 'true' | 'false';

type FormValues = {
  name: string;
  sabun: string;
  joinDate: Dayjs;
  employmentType: EmploymentType;
  memberStatus: MemberStatus;
  organizationId: string;
  jobGradeId: string;
  jobTitleId: string;
  roleId: string;
  isPromotion: PromotionFormValue;
  changeReason: string;
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

  const { data: roles = [] } = useQuery({
    queryKey: ['member', 'roles', 'list'],
    queryFn: () => memberApi.getRoles(),
    enabled: !isSelf,
  });

  useEffect(() => {
    if (!member) return;
    form.setFieldsValue({
      name: member.name,
      sabun: member.sabun,
      joinDate: dayjs(member.joinDate),
      employmentType: toPayloadEmploymentType(member.employmentType),
      memberStatus: member.memberStatus,
      organizationId: member.organizationId ?? '',
      jobGradeId: member.jobGradeId ?? '',
      jobTitleId: member.jobTitleId ?? '',
      roleId: member.roleId ?? '',
      isPromotion: 'omit',
      changeReason: '',
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

  const roleOptions = roles
    .filter((r) => r.id)
    .map((r) => ({ value: r.id, label: r.name }));

  const onFinish = async () => {
    try {
      const v = await form.validateFields();
      const payload: UpdateMemberHrPayload = {
        name: v.name.trim(),
        sabun: v.sabun.trim(),
        joinDate: v.joinDate.format('YYYY-MM-DD'),
        employmentType: v.employmentType,
        memberStatus: v.memberStatus,
        organizationId: v.organizationId,
        jobGradeId: v.jobGradeId,
        jobTitleId: v.jobTitleId,
        roleId: v.roleId,
      };
      if (v.isPromotion === 'true') {
        payload.isPromotion = true;
      } else if (v.isPromotion === 'false') {
        payload.isPromotion = false;
      } else {
        payload.isPromotion = null;
      }
      const reason = v.changeReason?.trim();
      if (reason) {
        payload.changeReason = reason;
      }
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
          className="tw-inline-block tw-text-sm tw-text-slate-400 tw-no-underline hover:tw-text-slate-500 hover:tw-underline"
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
          className="tw-mb-2 tw-inline-block tw-text-sm tw-text-slate-400 tw-no-underline hover:tw-text-slate-500 hover:tw-underline"
        >
          ← 뒤로가기
        </Link>
        <Typography.Title level={4} className="!tw-m-0 !tw-text-slate-900">
          직원 정보 수정
        </Typography.Title>
     
      </div>

      <Card className="tw-border-slate-200/80 tw-shadow-sm">
        
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
          <Form.Item name="memberStatus" label="재직 상태" rules={[{ required: true, message: '재직 상태를 선택하세요.' }]}>
            <Select options={MEMBER_FORM_STATUS_OPTIONS} placeholder="선택" />
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
          <Form.Item name="roleId" label="역할" rules={[{ required: true, message: '역할을 선택하세요.' }]}>
            <Select showSearch optionFilterProp="label" options={roleOptions} placeholder="역할 선택" />
          </Form.Item>
          <Form.Item
            name="isPromotion"
            label="변경 유형"
          >
            <Select
              options={[
                { value: 'omit', label: '미입력' },
                { value: 'false', label: '일반 변경' },
                { value: 'true', label: '승진 및 부서이동' },
              ]}
            />
          </Form.Item>
          <Form.Item name="changeReason" label="변경 사유">
            <Input.TextArea rows={2} maxLength={500} showCount placeholder="선택 (예: 부서 이동)" />
          </Form.Item>
          <Button
            type="primary"
            loading={updateM.isPending}
            className={membersCtaButtonClass}
            onClick={() => void onFinish()}
          >
            저장
          </Button>
        </Form>
      </Card>
    </Space>
  );
}
