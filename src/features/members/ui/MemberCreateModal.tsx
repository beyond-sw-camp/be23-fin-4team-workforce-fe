import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { App, DatePicker, Form, Input, Select } from 'antd';
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
import { membersCtaButtonClass } from '@/features/members/ui/membersCtaButtonClass';
import { membersKeys } from '@/features/members/queries';
import { AppDoubleActionModal } from '@/shared/ui/AppDoubleActionModal';

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

/**
 * 직원 계정 생성 모달.
 * - 모달은 인사정보(이름·이메일·조직·직급·직책·역할 등)만 받는다.
 * - 활성 급여정책이 있어야 모달을 열 수 있다 (호출자 MembersPage 에서 사전 차단).
 * - [생성 후 급여 등록] 단일 액션: 직원만 생성 → 백엔드가 활성 정책 기준으로 0원/1호봉 Salary 자동 생성
 *   → 곧바로 [직원 급여 관리] 의 급여 등록 모달이 해당 직원으로 prefill 된 상태로 열림.
 */
export function MemberCreateModal({ open, onClose }: Props) {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const navigate = useNavigate();
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
    mutationFn: async (v: FormValues) => {
      const memberPayload: CreateMemberPayload = {
        name: v.name.trim(),
        englishInitial: v.englishInitial.trim(),
        personalEmail: v.personalEmail.trim(),
        joinDate: v.joinDate.format('YYYY-MM-DD'),
        employmentType: v.employmentType,
        organizationId: v.organizationId,
        jobGradeId: v.jobGradeId,
        jobTitleId: v.jobTitleId,
        roleId: v.roleId,
      };
      const created = await memberApi.create(memberPayload);
      return { created, personalEmail: memberPayload.personalEmail };
    },
    onSuccess: async ({ created, personalEmail }) => {
      message.success('직원이 등록되었습니다. 이어서 급여를 등록해 주세요.');
      form.resetFields();
      onClose();
      await qc.invalidateQueries({ queryKey: membersKeys.all });
      await qc.invalidateQueries({ queryKey: ['salary', 'salaries'] });

      // 1순위: create 응답에서 새 직원 ID 추출 (백엔드가 키를 다양하게 줄 수 있어 여러 후보 시도).
      const createdRecord = created as Record<string, unknown> | null | undefined;
      const idCandidates = [
        createdRecord?.memberId,
        createdRecord?.id,
        createdRecord?.member_id,
        // 일부 응답은 envelope 그대로 반환되며 data 필드 안에 있을 수 있다.
        (createdRecord?.data as Record<string, unknown> | undefined)?.memberId,
        (createdRecord?.data as Record<string, unknown> | undefined)?.id,
      ];
      let memberIdRaw = idCandidates.find(
        (v): v is string => typeof v === 'string' && v.trim().length > 0,
      );

      // 2순위: ID 가 응답에 없으면 이메일로 재조회해서 식별 (PERSONAL_EMAIL 은 회사 단위 유일).
      if (!memberIdRaw && personalEmail) {
        try {
          const page = await memberApi.searchMembersLookupPage({
            keyword: personalEmail,
            page: 0,
            size: 5,
          });
          const match = page.content.find(
            (row) => (row.email ?? '').toLowerCase() === personalEmail.toLowerCase(),
          );
          if (match?.memberId) memberIdRaw = match.memberId;
        } catch {
          // 검색 실패는 fallback 흐름으로 처리.
        }
      }

      if (memberIdRaw) {
        // 직원 prefill 된 [급여 등록] 모달 자동 오픈 (등록 탭에서 인라인 모달).
        void navigate({
          to: '/app/payroll/admin',
          search: { tab: 'register', createForMemberId: memberIdRaw },
        });
      } else {
        // memberId 추출 실패 - 등록 탭으로 이동 (미등록 리스트에서 사용자가 직접 클릭).
        void navigate({
          to: '/app/payroll/admin',
          search: { tab: 'register' },
        });
      }
    },
    onError: (e: Error) => message.error(e.message || '등록에 실패했습니다.'),
  });

  const handleOk = async () => {
    try {
      const v = await form.validateFields();
      await createM.mutateAsync(v);
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
    <>
      {/* `destroyOnHidden`으로 모달이 닫히면 Form이 제거되어 useForm 경고가 난다. */}
      {!open ? <Form form={form} preserve={false} className="tw-hidden" aria-hidden /> : null}
      <AppDoubleActionModal
        title="직원 계정 생성"
        open={open}
        onClose={onClose}
        onConfirm={() => void handleOk()}
        confirmText="생성 후 급여 등록"
        cancelText="취소"
        confirmButtonClassName={membersCtaButtonClass}
        width={880}
        destroyOnHidden
        confirmLoading={createM.isPending}
      >
        <Form<FormValues> form={form} layout="vertical" className="tw-pt-2 tw-px-2 tw-pb-1">
          {/* 1행: 이름 + 영문 이니셜 */}
          <div className="tw-grid tw-grid-cols-2 tw-gap-x-6 tw-gap-y-1">
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
          </div>

          {/* 2행: 개인 이메일 (단독, full width) */}
          <Form.Item
            name="personalEmail"
            label="개인 이메일"
            rules={[{ required: true, type: 'email', message: '올바른 이메일을 입력하세요.' }]}
          >
            <Input placeholder="user@example.com" />
          </Form.Item>

          {/* 3행: 입사일 + 고용 형태 */}
          <div className="tw-grid tw-grid-cols-2 tw-gap-x-6 tw-gap-y-1">
            <Form.Item name="joinDate" label="입사일" rules={[{ required: true, message: '입사일을 선택하세요.' }]}>
              <DatePicker className="tw-w-full" format="YYYY-MM-DD" />
            </Form.Item>
            <Form.Item name="employmentType" label="고용 형태" rules={[{ required: true }]}>
              <Select options={MEMBER_FORM_EMPLOYMENT_OPTIONS} placeholder="선택" />
            </Form.Item>
          </div>

          {/* 4행: 조직 + 직급 */}
          <div className="tw-grid tw-grid-cols-2 tw-gap-x-6 tw-gap-y-1">
            <Form.Item name="organizationId" label="조직" rules={[{ required: true, message: '조직을 선택하세요.' }]}>
              <Select showSearch optionFilterProp="label" options={orgOptions} placeholder="조직 선택" />
            </Form.Item>
            <Form.Item name="jobGradeId" label="직급" rules={[{ required: true, message: '직급을 선택하세요.' }]}>
              <Select showSearch optionFilterProp="label" options={gradeOptions} placeholder="직급 선택" />
            </Form.Item>
          </div>

          {/* 5행: 직책 + 역할 */}
          <div className="tw-grid tw-grid-cols-2 tw-gap-x-6 tw-gap-y-1">
            <Form.Item name="jobTitleId" label="직책" rules={[{ required: true, message: '직책을 선택하세요.' }]}>
              <Select showSearch optionFilterProp="label" options={titleOptions} placeholder="직책 선택" />
            </Form.Item>
            <Form.Item name="roleId" label="역할" rules={[{ required: true, message: '역할을 선택하세요.' }]}>
              <Select showSearch optionFilterProp="label" options={roleOptions} placeholder="역할 선택" />
            </Form.Item>
          </div>
        </Form>
      </AppDoubleActionModal>
    </>
  );
}
