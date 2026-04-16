import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, DatePicker, Form, Input, Modal, Select, Typography } from 'antd';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import { useEffect, useMemo } from 'react';
import type { CreateMemberPayload, EmploymentType } from '@/features/member/api/memberApi';
import { memberApi } from '@/features/member/api/memberApi';
import { organizationApi } from '@/features/organization/api/organizationApi';
import {
  buildOrgOptions,
  MEMBER_FORM_EMPLOYMENT_OPTIONS,
  pickRowId,
  pickRowName,
} from '@/features/members/lib/memberFormShared';
import { membersKeys } from '@/features/members/queries';

type FormValues = {
  name: string;
  englishInitial: string;
  personalEmail: string;
  joinDate: Dayjs;
  employmentType: EmploymentType;
  organizationId: string;
  jobGradeId: string;
  jobTitleId: string;
  roleId: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
};

export function MemberCreateModal({ open, onClose }: Props) {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [form] = Form.useForm<FormValues>();

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

  useEffect(() => {
    if (open) {
      form.setFieldsValue({
        joinDate: dayjs(),
        employmentType: 'FULL_TIME',
      });
    }
  }, [open, form]);

  const createM = useMutation({
    mutationFn: (payload: CreateMemberPayload) => memberApi.create(payload),
    onSuccess: async () => {
      message.success('직원이 등록되었습니다.');
      form.resetFields();
      onClose();
      await qc.invalidateQueries({ queryKey: membersKeys.all });
    },
    onError: (e: Error) => message.error(e.message || '등록에 실패했습니다.'),
  });

  const handleOk = async () => {
    try {
      const v = await form.validateFields();
      const joinDate = v.joinDate.format('YYYY-MM-DD');
      const payload: CreateMemberPayload = {
        name: v.name.trim(),
        englishInitial: v.englishInitial.trim(),
        personalEmail: v.personalEmail.trim(),
        joinDate,
        employmentType: v.employmentType,
        organizationId: v.organizationId,
        jobGradeId: v.jobGradeId,
        jobTitleId: v.jobTitleId,
        roleId: v.roleId,
      };
      await createM.mutateAsync(payload);
    } catch {
      // validation
    }
  };

  const orgOptions = useMemo(() => buildOrgOptions(orgList), [orgList]);

  const gradeOptions = grades.map((row) => {
    const r = row as Record<string, unknown>;
    const id = pickRowId(r);
    return id ? { value: id, label: pickRowName(r) || id } : null;
  }).filter((x): x is { value: string; label: string } => x !== null);

  const titleOptions = titles.map((row) => {
    const r = row as Record<string, unknown>;
    const id = pickRowId(r);
    return id ? { value: id, label: pickRowName(r) || id } : null;
  }).filter((x): x is { value: string; label: string } => x !== null);

  const roleOptions = roles
    .filter((r) => r.id)
    .map((r) => ({ value: r.id, label: r.name }));

  return (
    <Modal
      title="직원 등록"
      open={open}
      onCancel={onClose}
      onOk={() => void handleOk()}
      okText="등록"
      cancelText="취소"
      width={560}
      destroyOnHidden
      confirmLoading={createM.isPending}
    >
      <Typography.Paragraph type="secondary" className="!tw-mb-4 !tw-text-sm">
        신규 구성원을 등록합니다. (POST /member/create)
      </Typography.Paragraph>
      <Form<FormValues> form={form} layout="vertical" className="tw-pt-1">
        <Form.Item name="name" label="이름" rules={[{ required: true, message: '이름을 입력하세요.' }]}>
          <Input placeholder="홍길동" maxLength={80} />
        </Form.Item>
        <Form.Item
          name="englishInitial"
          label="영문 이니셜"
          rules={[{ required: true, message: '영문 이니셜을 입력하세요.' }]}
        >
          <Input placeholder="HK" maxLength={20} />
        </Form.Item>
        <Form.Item
          name="personalEmail"
          label="개인 이메일"
          rules={[{ required: true, type: 'email', message: '올바른 이메일을 입력하세요.' }]}
        >
          <Input placeholder="user@example.com" />
        </Form.Item>
        <Form.Item name="joinDate" label="입사일" rules={[{ required: true, message: '입사일을 선택하세요.' }]}>
          <DatePicker className="tw-w-full" format="YYYY-MM-DD" />
        </Form.Item>
        <Form.Item name="employmentType" label="고용 형태" rules={[{ required: true }]}>
          <Select options={MEMBER_FORM_EMPLOYMENT_OPTIONS} placeholder="선택" />
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
      </Form>
    </Modal>
  );
}
