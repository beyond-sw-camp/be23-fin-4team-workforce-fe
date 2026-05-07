import {
  BankOutlined,
  CameraOutlined,
  DeleteOutlined,
  EditOutlined,
  HomeOutlined,
  IdcardOutlined,
  MailOutlined,
  PhoneOutlined,
  SignatureOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Alert, Avatar, Button, Card, Form, Input, Modal, Radio, Spin, Tag, Typography, Upload } from 'antd';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/features/auth/useAuth';
import { esgApi } from '@/features/esg/api/esgApi';
import type { UpdateMyInfoPayload, YnFlag } from '@/features/member/api/memberApi';
import { memberApi, normalizeYnFlag } from '@/features/member/api/memberApi';
import {
  displayAddressByPublicYn,
  displayDetailAddressByPublicYn,
  displayPhoneByPublicYn,
} from '@/features/member/lib/memberPrivateFieldDisplay';
import { EMPLOYMENT_TYPE_KO } from '@/app/locale/app-ko';
import { AppButton } from '@/shared/ui/AppButton';
import { AppWorkspacePageTitle } from '@/shared/ui/AppWorkspacePageTitle';
import { AddressSearchField } from '@/shared/ui/AddressSearchField';

const PROFILE_ACCEPT = '.jpg,.jpeg,.png,.gif,image/jpeg,image/png,image/gif';
const SIGNATURE_ACCEPT = '.png,image/png';
const SECTION_CARD = 'tw-rounded-2xl tw-border tw-border-slate-200/90 tw-shadow-sm tw-shadow-slate-900/5';

type FormValues = {
  phoneNumber: string;
  phonePublicYn: YnFlag;
  emergencyContact: string;
  address: string;
  detailAddress: string;
  addressPublicYn: YnFlag;
  bank: string;
  bankAccount: string;
  extensionNumber: string;
  telNumber: string;
};

const FORM_KEYS: (keyof FormValues)[] = [
  'phoneNumber',
  'phonePublicYn',
  'emergencyContact',
  'address',
  'detailAddress',
  'addressPublicYn',
  'bank',
  'bankAccount',
  'extensionNumber',
  'telNumber',
];

function isAllowedProfileImage(file: File): boolean {
  const okType = ['image/jpeg', 'image/png', 'image/gif'].includes(file.type);
  const okName = /\.(jpe?g|png|gif)$/i.test(file.name);
  return okType || okName;
}

function isPngSignature(file: File): boolean {
  return file.type === 'image/png' || /\.png$/i.test(file.name);
}

function displayText(v: string | null | undefined, emptyLabel = '—') {
  if (v == null || String(v).trim() === '') return emptyLabel;
  return v;
}

function ynPublicLabel(v: unknown): string {
  const n = normalizeYnFlag(v);
  if (n === 'YES') return '공개';
  if (n === 'NO') return '비공개';
  return '—';
}

function memberToFormValues(member: Awaited<ReturnType<typeof memberApi.detail>>): FormValues {
  return {
    phoneNumber: member.phoneNumber ?? '',
    phonePublicYn: member.phonePublicYn ?? 'YES',
    emergencyContact: member.emergencyContact ?? '',
    address: member.address ?? '',
    detailAddress: member.detailAddress ?? '',
    addressPublicYn: member.addressPublicYn ?? 'YES',
    bank: member.bank ?? '',
    bankAccount: member.bankAccount ?? '',
    extensionNumber: member.extensionNumber ?? '',
    telNumber: member.telNumber ?? '',
  };
}

function buildUpdatePayload(values: FormValues, initial: FormValues): UpdateMyInfoPayload {
  const payload: UpdateMyInfoPayload = {
    phonePublicYn: values.phonePublicYn,
    addressPublicYn: values.addressPublicYn,
  };
  const otherKeys = FORM_KEYS.filter((k) => k !== 'phonePublicYn' && k !== 'addressPublicYn');
  for (const k of otherKeys) {
    const next = values[k];
    const prev = initial[k];
    if (next === prev) {
      (payload as Record<string, unknown>)[k] = null;
      continue;
    }
    (payload as Record<string, unknown>)[k] = typeof next === 'string' ? next.trim() : next;
  }
  return payload;
}

export function MyProfilePage() {
  const { message } = App.useApp();
  const { user, refreshAuth } = useAuth();
  const queryClient = useQueryClient();
  const id = user?.id?.trim();
  const [editOpen, setEditOpen] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [form] = Form.useForm<FormValues>();
  const initialRef = useRef<FormValues | null>(null);

  const { data: member, isLoading } = useQuery({
    queryKey: ['member', 'detail', id],
    queryFn: () => memberApi.detail(id!),
    enabled: Boolean(id),
  });

  const { data: signatureImageUrl, isLoading: signatureLoading } = useQuery({
    queryKey: ['member', 'signature', id],
    queryFn: () => memberApi.getSignatureImageUrl(),
    enabled: Boolean(id),
  });

  const { data: esgCfg } = useQuery({
    queryKey: ['esg', 'config'],
    queryFn: () => esgApi.getConfig(),
    staleTime: 60_000,
  });

  const esgEnabled = esgCfg?.esgEnabledYn === 'YES';

  const uploadM = useMutation({
    mutationFn: (file: File) => memberApi.uploadProfileImage(file),
    onSuccess: async () => {
      message.success('프로필 이미지가 업로드되었습니다.');
      await refreshAuth();
      await queryClient.invalidateQueries({ queryKey: ['member', 'detail', id] });
    },
    onError: (e: Error) => message.error(e.message || '업로드에 실패했습니다.'),
  });

  const deleteImgM = useMutation({
    mutationFn: () => memberApi.deleteProfileImage(),
    onSuccess: async () => {
      message.success('프로필 이미지가 삭제되었습니다.');
      await refreshAuth();
      await queryClient.invalidateQueries({ queryKey: ['member', 'detail', id] });
    },
    onError: (e: Error) => message.error(e.message || '삭제에 실패했습니다.'),
  });

  const uploadSignatureM = useMutation({
    mutationFn: (file: File) => memberApi.uploadSignatureImage(file),
    onSuccess: async () => {
      message.success('전자서명 이미지가 등록되었습니다.');
      await queryClient.invalidateQueries({ queryKey: ['member', 'signature', id] });
    },
    onError: (e: Error) => message.error(e.message || '서명 업로드에 실패했습니다.'),
  });

  const deleteSignatureM = useMutation({
    mutationFn: () => memberApi.deleteSignatureImage(),
    onSuccess: async () => {
      message.success('전자서명이 삭제되었습니다.');
      await queryClient.invalidateQueries({ queryKey: ['member', 'signature', id] });
    },
    onError: (e: Error) => message.error(e.message || '서명 삭제에 실패했습니다.'),
  });

  const updateM = useMutation({
    mutationFn: (payload: UpdateMyInfoPayload) => memberApi.updateMe(payload),
    onSuccess: async () => {
      message.success('내 정보가 저장되었습니다.');
      await queryClient.invalidateQueries({ queryKey: ['member', 'detail', id] });
      await refreshAuth();
      setIsDirty(false);
      setEditOpen(false);
    },
    onError: (e: Error) => message.error(e.message || '저장에 실패했습니다.'),
  });

  useEffect(() => {
    if (!editOpen || !member) return;
    const values = memberToFormValues(member);
    form.setFieldsValue(values);
    initialRef.current = values;
    setIsDirty(false);
  }, [editOpen, form, member]);

  if (!id) {
    return (
      <Alert type="warning" showIcon message="로그인 정보에서 회원 ID를 찾을 수 없습니다." className="tw-rounded-xl" />
    );
  }

  if (isLoading) {
    return (
      <div className="tw-flex tw-min-h-[280px] tw-items-center tw-justify-center">
        <Spin />
      </div>
    );
  }

  if (!member) {
    return <Alert type="warning" showIcon message="내 정보를 불러오지 못했습니다." className="tw-rounded-xl" />;
  }

  const profileSrc = member.profileUrl?.trim() || undefined;
  const initial = member.name?.trim()?.slice(0, 1)?.toUpperCase() || '?';
  const employmentType = EMPLOYMENT_TYPE_KO[member.employmentType] ?? member.employmentType;

  return (
    <div className="tw-mx-auto tw-w-full tw-space-y-6">
      <AppWorkspacePageTitle
        eyebrow="MY PROFILE"
        title="마이페이지"
        subtitle="내 기본 정보, 연락처, 결재 서명과 급여 계좌 정보를 확인합니다."
        extra={
          <AppButton variant="secondary" icon={<EditOutlined />} onClick={() => setEditOpen(true)}>
            내 정보 수정
          </AppButton>
        }
      />

      <Card className={SECTION_CARD} styles={{ body: { padding: 24 } }}>
        <div className="tw-flex tw-flex-col tw-gap-6 lg:tw-flex-row lg:tw-items-center lg:tw-justify-between">
          <div className="tw-flex tw-min-w-0 tw-flex-col tw-gap-5 sm:tw-flex-row sm:tw-items-center">
            <Avatar
              size={112}
              src={profileSrc}
              icon={!profileSrc ? <UserOutlined /> : undefined}
              className={
                profileSrc
                  ? 'tw-shrink-0 [&_img]:tw-object-cover'
                  : 'tw-shrink-0 tw-bg-slate-100 tw-text-3xl tw-font-bold tw-text-[#1e3a5f]'
              }
            >
              {!profileSrc ? initial : null}
            </Avatar>
            <div className="tw-min-w-0">
              <div className="tw-flex tw-flex-wrap tw-items-center tw-gap-2">
                <Typography.Title level={3} className="!tw-m-0 !tw-text-[#1e3a5f]">
                  {member.name}
                </Typography.Title>
                <Tag className="!tw-m-0 !tw-rounded-full !tw-border-slate-200 !tw-px-3">
                  {employmentType}
                </Tag>
              </div>
              <div className="tw-mt-2 tw-flex tw-flex-wrap tw-gap-x-4 tw-gap-y-1 tw-text-sm tw-text-slate-500">
                <span>{member.organizationName ?? '소속 정보 없음'}</span>
                <span>{member.jobGradeName ?? '직급 없음'}</span>
                <span>{member.jobTitleName ?? '직책 없음'}</span>
              </div>
              <div className="tw-mt-3 tw-flex tw-items-center tw-gap-2 tw-text-sm tw-text-slate-600">
                <MailOutlined className="tw-text-slate-400" />
                <span>{member.email}</span>
              </div>
            </div>
          </div>
          <div className="tw-flex tw-flex-wrap tw-gap-2">
            <Upload
              accept={PROFILE_ACCEPT}
              showUploadList={false}
              beforeUpload={(file) => {
                if (!isAllowedProfileImage(file)) {
                  message.error('jpg, jpeg, png, gif 형식만 업로드할 수 있습니다.');
                  return false;
                }
                void uploadM.mutateAsync(file);
                return false;
              }}
            >
              <Button icon={<CameraOutlined />} loading={uploadM.isPending}>
                이미지 변경
              </Button>
            </Upload>
            <Button
              icon={<DeleteOutlined />}
              danger
              loading={deleteImgM.isPending}
              disabled={!profileSrc}
              onClick={() => void deleteImgM.mutateAsync()}
            >
              삭제
            </Button>
          </div>
        </div>
      </Card>

      <div className="tw-grid tw-grid-cols-1 tw-gap-4 xl:tw-grid-cols-[1.1fr_0.9fr]">
        <InfoSection title="기본 정보" icon={<IdcardOutlined />}>
          <InfoRow label="사번" value={member.sabun} />
          <InfoRow label="입사일" value={member.joinDate} />
          <InfoRow label="조직" value={member.organizationName ?? '—'} />
          <InfoRow label="직급" value={member.jobGradeName ?? '—'} />
          <InfoRow label="직책" value={member.jobTitleName ?? '—'} />
          {esgEnabled ? (
            <InfoRow
              label="ESG 점수"
              value={
                member.esgScore != null && Number.isFinite(Number(member.esgScore))
                  ? Number(member.esgScore).toLocaleString('ko-KR', { maximumFractionDigits: 2 })
                  : '—'
              }
            />
          ) : null}
        </InfoSection>

        <InfoSection title="전자결재 서명" icon={<SignatureOutlined />}>
          <div className="tw-rounded-xl tw-border tw-border-dashed tw-border-slate-200 tw-bg-slate-50/70 tw-p-4">
            <div className="tw-flex tw-min-h-[112px] tw-items-center tw-justify-center">
              {signatureLoading ? (
                <Spin size="small" />
              ) : signatureImageUrl ? (
                <img src={signatureImageUrl} alt="등록된 전자서명" className="tw-max-h-28 tw-max-w-full tw-object-contain" />
              ) : (
                <Typography.Text type="secondary">등록된 서명이 없습니다.</Typography.Text>
              )}
            </div>
          </div>
          <div className="tw-mt-3 tw-flex tw-flex-wrap tw-gap-2">
            <Upload
              accept={SIGNATURE_ACCEPT}
              showUploadList={false}
              beforeUpload={(file) => {
                if (!isPngSignature(file)) {
                  message.error('PNG 형식만 업로드할 수 있습니다.');
                  return false;
                }
                void uploadSignatureM.mutateAsync(file);
                return false;
              }}
            >
              <Button icon={<SignatureOutlined />} loading={uploadSignatureM.isPending}>
                {signatureImageUrl ? '서명 교체' : '서명 등록'}
              </Button>
            </Upload>
            <Button
              icon={<DeleteOutlined />}
              danger
              loading={deleteSignatureM.isPending}
              disabled={!signatureImageUrl}
              onClick={() => void deleteSignatureM.mutateAsync()}
            >
              삭제
            </Button>
          </div>
        </InfoSection>
      </div>

      <div className="tw-grid tw-grid-cols-1 tw-gap-4 xl:tw-grid-cols-3">
        <InfoSection title="연락처" icon={<PhoneOutlined />}>
          <InfoRow label="휴대폰" value={displayPhoneByPublicYn(member.phoneNumber, member.phonePublicYn)} />
          <InfoRow label="연락처 공개" value={ynPublicLabel(member.phonePublicYn)} />
          <InfoRow label="내선번호" value={displayText(member.extensionNumber)} />
          <InfoRow label="직통번호" value={displayText(member.telNumber)} />
          <InfoRow label="비상연락처" value={displayText(member.emergencyContact)} />
        </InfoSection>

        <InfoSection title="주소" icon={<HomeOutlined />}>
          <InfoRow label="주소" value={displayAddressByPublicYn(member.address, member.addressPublicYn)} />
          <InfoRow label="상세 주소" value={displayDetailAddressByPublicYn(member.detailAddress, member.addressPublicYn)} />
          <InfoRow label="주소 공개" value={ynPublicLabel(member.addressPublicYn)} />
        </InfoSection>

        <InfoSection title="급여 계좌" icon={<BankOutlined />}>
          <InfoRow label="은행" value={displayText(member.bank)} />
          <InfoRow label="계좌번호" value={displayText(member.bankAccount)} />
          <div className="tw-mt-3 tw-rounded-xl tw-bg-slate-50 tw-p-3 tw-text-xs tw-leading-relaxed tw-text-slate-500">
            급여 계좌는 본인 조회 화면에서만 표시됩니다.
          </div>
        </InfoSection>
      </div>

      <ProfileEditModal
        open={editOpen}
        form={form}
        isDirty={isDirty}
        saving={updateM.isPending}
        onDirty={() => setIsDirty(true)}
        onCancel={() => {
          if (isDirty && !window.confirm('저장하지 않은 변경사항이 있습니다. 닫을까요?')) return;
          setEditOpen(false);
          setIsDirty(false);
        }}
        onSubmit={(values) => {
          const initial = initialRef.current ?? memberToFormValues(member);
          void updateM.mutateAsync(buildUpdatePayload(values, initial));
        }}
      />
    </div>
  );
}

function ProfileEditModal({
  open,
  form,
  isDirty,
  saving,
  onDirty,
  onCancel,
  onSubmit,
}: {
  open: boolean;
  form: ReturnType<typeof Form.useForm<FormValues>>[0];
  isDirty: boolean;
  saving: boolean;
  onDirty: () => void;
  onCancel: () => void;
  onSubmit: (values: FormValues) => void;
}) {
  return (
    <Modal
      open={open}
      title={
        <div>
          <Typography.Text strong className="!tw-text-lg !tw-text-slate-900">
            내 정보 수정
          </Typography.Text>
          <div className="tw-mt-1 tw-text-sm tw-font-normal tw-text-slate-500">
            연락처, 주소와 급여 계좌 정보를 수정합니다.
          </div>
        </div>
      }
      width={760}
      centered
      destroyOnHidden={false}
      maskClosable={!isDirty}
      onCancel={onCancel}
      footer={
        <div className="tw-flex tw-justify-end tw-gap-2">
          <Button onClick={onCancel} disabled={saving}>
            취소
          </Button>
          <AppButton loading={saving} onClick={() => form.submit()}>
            저장
          </AppButton>
        </div>
      }
      styles={{
        body: { maxHeight: 'calc(100vh - 260px)', overflowY: 'auto', paddingTop: 18 },
      }}
    >
      <Form<FormValues> form={form} layout="vertical" onFinish={onSubmit} onValuesChange={onDirty}>
        <ModalSection title="연락처" description="업무 연락에 사용하는 연락처와 공개 범위를 설정합니다.">
          <div className="tw-grid tw-grid-cols-1 tw-gap-4 md:tw-grid-cols-2">
            <Form.Item name="phoneNumber" label="휴대폰 번호">
              <Input placeholder="010-0000-0000" />
            </Form.Item>
            <Form.Item name="emergencyContact" label="비상연락처">
              <Input placeholder="비상 시 연락 가능한 번호" />
            </Form.Item>
            <Form.Item name="extensionNumber" label="내선번호">
              <Input placeholder="1234" />
            </Form.Item>
            <Form.Item name="telNumber" label="직통번호">
              <Input placeholder="02-0000-0000" />
            </Form.Item>
          </div>
          <Form.Item name="phonePublicYn" label="연락처 공개 범위">
            <Radio.Group optionType="button" buttonStyle="solid">
              <Radio.Button value="YES">공개</Radio.Button>
              <Radio.Button value="NO">비공개</Radio.Button>
            </Radio.Group>
          </Form.Item>
        </ModalSection>

        <ModalSection title="주소" description="주소 공개 범위는 직원 프로필 조회 화면에 적용됩니다.">
          <div className="tw-grid tw-grid-cols-1 tw-gap-4 md:tw-grid-cols-[1.2fr_0.8fr]">
            <Form.Item name="address" label="주소" rules={[{ required: true, message: '주소를 입력해 주세요.' }]}>
              <AddressSearchField />
            </Form.Item>
            <Form.Item
              name="detailAddress"
              label="상세 주소"
              rules={[{ required: true, message: '상세 주소를 입력해 주세요.' }]}
            >
              <Input size="large" placeholder="예: 6층, 301호" />
            </Form.Item>
          </div>
          <Form.Item name="addressPublicYn" label="주소 공개 범위">
            <Radio.Group optionType="button" buttonStyle="solid">
              <Radio.Button value="YES">공개</Radio.Button>
              <Radio.Button value="NO">비공개</Radio.Button>
            </Radio.Group>
          </Form.Item>
        </ModalSection>

        <ModalSection title="급여 계좌" description="급여 이체에 사용하는 본인 명의 계좌를 입력합니다.">
          <div className="tw-grid tw-grid-cols-1 tw-gap-4 md:tw-grid-cols-2">
            <Form.Item name="bank" label="은행" rules={[{ max: 30, message: '30자 이내로 입력해 주세요.' }]}>
              <Input placeholder="예: 신한은행, KB국민은행" maxLength={30} />
            </Form.Item>
            <Form.Item
              name="bankAccount"
              label="계좌번호"
              rules={[{ pattern: /^[0-9-]*$/, message: '계좌번호는 숫자와 - 만 입력해 주세요.' }]}
            >
              <Input placeholder="예: 110-123-456789" maxLength={30} />
            </Form.Item>
          </div>
        </ModalSection>
      </Form>
    </Modal>
  );
}

function ModalSection({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="tw-border-b tw-border-slate-100 tw-pb-5 tw-pt-1 last:tw-border-b-0 last:tw-pb-0">
      <div className="tw-mb-4">
        <Typography.Text strong className="!tw-text-base !tw-text-slate-900">
          {title}
        </Typography.Text>
        <div className="tw-mt-1 tw-text-sm tw-text-slate-500">{description}</div>
      </div>
      {children}
    </section>
  );
}

function InfoSection({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card className={SECTION_CARD} styles={{ body: { padding: 20 } }}>
      <div className="tw-mb-4 tw-flex tw-items-center tw-gap-2">
        <span className="tw-flex tw-h-9 tw-w-9 tw-items-center tw-justify-center tw-rounded-xl tw-bg-slate-100 tw-text-[#1e3a5f]">
          {icon}
        </span>
        <Typography.Text strong className="!tw-text-base !tw-text-slate-900">
          {title}
        </Typography.Text>
      </div>
      <div className="tw-space-y-3">{children}</div>
    </Card>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="tw-flex tw-items-start tw-justify-between tw-gap-4 tw-border-b tw-border-slate-100 tw-pb-3 last:tw-border-b-0 last:tw-pb-0">
      <span className="tw-shrink-0 tw-text-sm tw-text-slate-500">{label}</span>
      <span className="tw-min-w-0 tw-text-right tw-text-sm tw-font-medium tw-text-slate-900">{value}</span>
    </div>
  );
}
