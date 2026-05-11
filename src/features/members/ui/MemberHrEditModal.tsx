import { Alert, App, DatePicker, Form, Input, Select, Spin, Typography } from 'antd';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import { useEffect, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MEMBER_STATUS_KO } from '@/app/locale/app-ko';
import type { EmploymentType, MemberStatus, UpdateMemberHrPayload } from '@/features/member/api/memberApi';
import { memberApi } from '@/features/member/api/memberApi';
import {
  buildOrgOptions,
  MEMBER_FORM_EMPLOYMENT_OPTIONS,
  pickRowId,
  pickRowName,
} from '@/features/members/lib/memberFormShared';
import { membersKeys } from '@/features/members/queries';
import { organizationApi } from '@/features/organization/api/organizationApi';
import { AppSingleActionModal } from '@/shared/ui/AppSingleActionModal';

const MEMBER_FORM_STATUS_OPTIONS = (['ACTIVE', 'DORMANT', 'LEAVE'] as const).map((v) => ({
  value: v,
  label: MEMBER_STATUS_KO[v],
}));

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

type MemberHrEditModalProps = {
  memberId: string;
  open: boolean;
  onClose: () => void;
};

function toPayloadEmploymentType(t: EmploymentType | 'CONTRACTOR'): EmploymentType {
  return t === 'CONTRACTOR' ? 'CONTRACT' : t;
}

export function MemberHrEditModal({ memberId, open, onClose }: MemberHrEditModalProps) {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [form] = Form.useForm<FormValues>();

  const { data: member, isLoading, isError } = useQuery({
    queryKey: ['member', 'detail', memberId],
    queryFn: () => memberApi.detail(memberId),
    enabled: open && Boolean(memberId),
  });

  const { data: orgList = [] } = useQuery({
    queryKey: ['organization', 'list'],
    queryFn: () => organizationApi.list(),
    enabled: open,
  });

  const { data: grades = [] } = useQuery({
    queryKey: ['organization', 'job-grades'],
    queryFn: () => organizationApi.listJobGrades(),
    enabled: open,
  });

  const { data: titles = [] } = useQuery({
    queryKey: ['organization', 'job-titles'],
    queryFn: () => organizationApi.listJobTitles(),
    enabled: open,
  });

  const { data: roles = [] } = useQuery({
    queryKey: ['member', 'roles', 'list'],
    queryFn: () => memberApi.getRoles(),
    enabled: open,
  });

  const updateM = useMutation({
    mutationFn: (payload: UpdateMemberHrPayload) => memberApi.updateHr(memberId, payload),
    onSuccess: async () => {
      message.success('직원 정보가 수정되었습니다.');
      await qc.invalidateQueries({ queryKey: ['member', 'detail', memberId] });
      await qc.invalidateQueries({ queryKey: membersKeys.all });
      onClose();
    },
    onError: (e: Error) => message.error(e.message || '수정에 실패했습니다.'),
  });

  const orgOptions = useMemo(() => buildOrgOptions(orgList, { excludeRoot: true }), [orgList]);

  const gradeOptions = useMemo(
    () =>
      grades
        .map((row) => {
          const r = row as Record<string, unknown>;
          const id = pickRowId(r);
          return id ? { value: id, label: pickRowName(r) || id } : null;
        })
        .filter((x): x is { value: string; label: string } => x !== null)
        .filter((opt) => opt.label !== '관리자'),
    [grades],
  );

  const titleOptions = useMemo(
    () =>
      titles
        .map((row) => {
          const r = row as Record<string, unknown>;
          const id = pickRowId(r);
          return id ? { value: id, label: pickRowName(r) || id } : null;
        })
        .filter((x): x is { value: string; label: string } => x !== null)
        .filter((opt) => opt.label !== '관리자'),
    [titles],
  );

  const roleOptions = useMemo(
    () => roles.filter((r) => r.id).map((r) => ({ value: r.id, label: r.name })),
    [roles],
  );

  useEffect(() => {
    if (!open || !member) return;
    const findByLabel = (options: Array<{ value: string; label: string }>, label?: string) => {
      const normalizedLabel = label?.trim();
      if (!normalizedLabel) return '';
      return options.find((option) => option.label.trim() === normalizedLabel)?.value ?? '';
    };
    const findOrgByLabel = (label?: string) => {
      const normalizedLabel = label?.trim();
      if (!normalizedLabel) return '';
      return (
        orgOptions.find((option) => option.label.trim() === normalizedLabel || option.label.trim().endsWith(normalizedLabel))?.value ??
        ''
      );
    };

    form.setFieldsValue({
      name: member.name,
      sabun: member.sabun,
      joinDate: dayjs(member.joinDate),
      employmentType: toPayloadEmploymentType(member.employmentType),
      memberStatus: member.memberStatus,
      organizationId: member.organizationId ?? findOrgByLabel(member.organizationName),
      jobGradeId: member.jobGradeId ?? findByLabel(gradeOptions, member.jobGradeName),
      jobTitleId: member.jobTitleId ?? findByLabel(titleOptions, member.jobTitleName),
      roleId: member.roleId ?? findByLabel(roleOptions, member.roleName),
      isPromotion: 'omit',
      changeReason: '',
    });
  }, [form, gradeOptions, member, open, orgOptions, roleOptions, titleOptions]);

  const submit = async () => {
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
      if (reason) payload.changeReason = reason;
      await updateM.mutateAsync(payload);
    } catch {
      /* validation */
    }
  };

  return (
    <AppSingleActionModal
      open={open}
      title="인사 정보 수정"
      onClose={onClose}
      onSubmit={() => void submit()}
      submitText="저장"
      submitLoading={updateM.isPending}
      submitDisabled={isLoading || isError || !member}
      width={720}
      destroyOnHidden
    >
      <div className="tw-px-5 tw-py-5">
        {isLoading ? (
          <div className="tw-flex tw-min-h-40 tw-items-center tw-justify-center">
            <Spin />
          </div>
        ) : isError || !member ? (
          <Alert type="warning" showIcon message="구성원 정보를 불러올 수 없습니다." />
        ) : (
          <Form<FormValues> form={form} layout="vertical" requiredMark={false}>
            <div className="tw-mb-5 tw-rounded-xl tw-border tw-border-slate-200 tw-bg-slate-50/70 tw-p-4">
              <Typography.Text className="tw-block tw-text-sm tw-font-semibold tw-text-slate-800">
                기존 인사 정보를 불러왔습니다.
              </Typography.Text>
              <Typography.Text className="tw-mt-1 tw-block tw-text-xs tw-text-slate-500">
                변경 후 저장하면 구성원 상세와 인사 이력에 반영됩니다.
              </Typography.Text>
            </div>
            <div className="tw-grid tw-grid-cols-1 tw-gap-x-4 md:tw-grid-cols-2">
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
              <Form.Item name="isPromotion" label="변경 유형">
                <Select
                  options={[
                    { value: 'omit', label: '미입력' },
                    { value: 'false', label: '일반 변경' },
                    { value: 'true', label: '승진 및 부서이동' },
                  ]}
                />
              </Form.Item>
            </div>
            <Form.Item name="changeReason" label="변경 사유" className="!tw-mb-0">
              <Input.TextArea rows={2} maxLength={500} showCount placeholder="선택 (예: 부서 이동)" />
            </Form.Item>
          </Form>
        )}
      </div>
    </AppSingleActionModal>
  );
}
