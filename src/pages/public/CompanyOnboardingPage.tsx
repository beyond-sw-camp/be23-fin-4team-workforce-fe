import { UploadOutlined } from '@ant-design/icons';
import { Alert, App, Button, Card, Checkbox, Descriptions, Form, Input, Space, Tag, Typography, Upload } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { authClient } from '@/features/auth/auth-client';
import { companyApi } from '@/features/organization/api/companyApi';
import { AddressSearchField } from '@/shared/ui/AddressSearchField';
import { AppButton } from '@/shared/ui/AppButton';
import { AppModal } from '@/shared/ui/AppModal';

export type CompanyOnboardingPageProps = {
  /** 홈 레이아웃 메인 영역에 넣을 때 전체 화면용 바깥 패딩을 줄입니다. */
  embedded?: boolean;
};

type CompanyOnboardingFormValues = {
  businessNumber: string;
  companyName: string;
  companyDomain: string;
  ceoName: string;
  address: string;
  detailAddress: string;
  adminEmail: string;
  adminName: string;
  code: string;
  adminPassword: string;
  adminPasswordCheck: string;
  agreeTerms: boolean;
  agreePrivacy: boolean;
};

const PASSWORD_SPECIAL_RE = /[!@#$%^&*()_+\-=[\]{}]/;
const PASSWORD_RULE_HINT = '영문·숫자·특수문자(!@#$%^&*()_+-=[]{} 등)를 모두 포함해 8자 이상 입력해 주세요.';

const agreeValidator = (message: string) => (_: unknown, value: boolean) =>
  value === true ? Promise.resolve() : Promise.reject(new Error(message));

const LEGAL_DUMMY_TERMS = `제1조 (목적)\n본 약관은 WORKFORCE 서비스 이용과 관련하여 회사와 이용자 간 권리·의무를 정하는 것을 목적으로 합니다. (더미 텍스트)\n\n제2조 (정의)\n이용자란 본 약관에 동의하고 서비스를 이용하는 자를 말합니다. (더미 텍스트)\n\n제3조 (약관의 효력)\n회사는 필요 시 약관을 변경할 수 있으며, 변경 내용은 서비스 내 공지로 안내합니다. (더미 텍스트)`;

const LEGAL_DUMMY_PRIVACY = `1. 수집하는 개인정보 항목\n회사명, 사업자번호, 담당자 이메일, 주소 등 가입 시 입력하신 정보가 포함될 수 있습니다. (더미 텍스트)\n\n2. 개인정보의 이용 목적\n회원 식별, 서비스 제공, 고객 지원 및 법령상 의무 이행 등에 활용됩니다. (더미 텍스트)\n\n3. 보유 및 파기\n목적 달성 후 관련 법령에서 정한 기간 동안 보관 후 안전하게 파기합니다. (더미 텍스트)`;

const LOGO_MAX_BYTES = 5 * 1024 * 1024;

export function CompanyOnboardingPage({ embedded = false }: CompanyOnboardingPageProps) {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [form] = Form.useForm<CompanyOnboardingFormValues>();
  const passwordValue = Form.useWatch('adminPassword', form);
  const agreeTermsW = Form.useWatch('agreeTerms', form);
  const agreePrivacyW = Form.useWatch('agreePrivacy', form);
  const agreeTermsOn = agreeTermsW === true;
  const agreePrivacyOn = agreePrivacyW === true;
  const allAgreementsChecked = agreeTermsOn && agreePrivacyOn;
  const someAgreementChecked = agreeTermsOn || agreePrivacyOn;
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [businessChecked, setBusinessChecked] = useState(false);
  const [emailVerified, setEmailVerified] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [legalModal, setLegalModal] = useState<null | 'terms' | 'privacy'>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = window.setInterval(() => {
      setResendCooldown((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [resendCooldown]);

  const passwordStrengthText = useMemo(() => {
    const value = passwordValue ?? '';
    if (!value) return null;
    const hasLength = value.length >= 8;
    const hasLetter = /[A-Za-z]/.test(value);
    const hasNumber = /\d/.test(value);
    const hasSpecial = PASSWORD_SPECIAL_RE.test(value);
    const score = [hasLength, hasLetter, hasNumber, hasSpecial].filter(Boolean).length;
    if (score <= 2) return '약함';
    if (score === 3) return '보통';
    return '강함';
  }, [passwordValue]);

  const sanitizeBusinessNumberDigits = (value: string) => value.replace(/\D/g, '').slice(0, 10);

  const checkBusinessNumber = async () => {
    setError(null);
    setSuccess(null);
    const values = await form.validateFields(['businessNumber']).catch(() => null);
    if (!values?.businessNumber) return;
    setLoading(true);
    try {
      const response = await companyApi.checkBusinessNumber(values.businessNumber);
      if (!response?.success) {
        setError(response?.message ?? '유효하지 않은 사업자번호입니다.');
        return;
      }
      setBusinessChecked(true);
      if (response.companyName) {
        form.setFieldValue('companyName', response.companyName);
      }
      setSuccess(response.message ?? '사업자번호가 확인되었습니다.');
    } catch (e) {
      setError((e as { message?: string }).message ?? '사업자번호 검증에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const sendCode = async () => {
    setError(null);
    setSuccess(null);
    const values = await form.validateFields(['adminEmail', 'companyName']).catch(() => null);
    if (!values?.adminEmail) return;
    setLoading(true);
    try {
      const res = await companyApi.sendVerificationCode(values.adminEmail);
      if (!res.success) {
        setError(res.message ?? '인증 코드 발송에 실패했습니다.');
        return;
      }
      setSuccess(res.message ?? '이메일 인증 코드가 발송되었습니다.');
      setResendCooldown(60);
    } catch (e) {
      setError((e as { message?: string }).message ?? '인증 코드 발송에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const verifyCode = async () => {
    setError(null);
    setSuccess(null);
    const values = await form.validateFields(['adminEmail', 'code']).catch(() => null);
    if (!values?.adminEmail || !values?.code) return;
    setLoading(true);
    try {
      const res = await companyApi.verifyCode(values.adminEmail, values.code);
      if (!res.success) {
        setError(res.message ?? '인증 코드 확인에 실패했습니다.');
        return;
      }
      setEmailVerified(true);
      setSuccess(res.message ?? '이메일 인증이 완료되었습니다.');
    } catch (e) {
      setError((e as { message?: string }).message ?? '인증 코드 확인에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const submitOnboarding = async (values: CompanyOnboardingFormValues) => {
    setError(null);
    setSuccess(null);
    if (!businessChecked) {
      setError('사업자번호 검증을 먼저 완료해 주세요.');
      return;
    }
    if (!emailVerified) {
      setError('이메일 인증을 먼저 완료해 주세요.');
      return;
    }
    if (!values.agreeTerms || !values.agreePrivacy) {
      setError('필수 약관에 모두 동의해 주세요.');
      return;
    }
    setLoading(true);
    try {
      const res = await companyApi.onboarding({
        companyName: values.companyName,
        companyDomain: values.companyDomain,
        ceoName: values.ceoName,
        businessNumber: values.businessNumber.replace(/\D/g, ''),
        address: values.address,
        detailAddress: values.detailAddress,
        adminEmail: values.adminEmail,
        adminPassword: values.adminPassword,
        adminPasswordCheck: values.adminPasswordCheck,
        adminName: values.adminName,
      });
      if (!res.success) {
        setError(res.message ?? '온보딩 처리에 실패했습니다.');
        return;
      }
      let logoOk = false;
      if (logoFile) {
        try {
          await authClient.login({
            email: values.adminEmail.trim(),
            password: values.adminPassword,
          });
          await companyApi.updateLogo(logoFile);
          await authClient.logout();
          logoOk = true;
        } catch (e) {
          message.warning(
            (e as Error)?.message ??
              '로고는 등록되지 않았습니다. 로그인 후 회사 설정에서 다시 등록할 수 있습니다.',
          );
        }
      }
      const baseMsg =
        res.message ?? '회사 온보딩이 완료되었습니다. 로그인 페이지에서 로그인해 주세요.';
      const okMsg = logoOk ? `${baseMsg.trim()} 회사 로고가 등록되었습니다.` : baseMsg;
      message.success(okMsg);
      setLogoFile(null);
      void navigate({ to: '/login', replace: true });
    } catch (e) {
      setError((e as { message?: string }).message ?? '온보딩 처리에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const outerClass = embedded
    ? 'tw-min-h-screen tw-w-full tw-bg-[#F8FAFC] tw-pt-24 tw-pb-10'
    : 'tw-min-h-screen tw-bg-[#F8FAFC] tw-px-6 tw-py-10';

  return (
    <div className={outerClass}>
      <div className="tw-mx-auto tw-w-full tw-max-w-[760px]">
        <Card className="tw-rounded-[28px] tw-border-0 tw-bg-white tw-shadow-[0_16px_60px_rgba(15,23,42,0.08)]">
          <div className="tw-mb-8 tw-flex tw-items-start tw-justify-between">
            <div>
              <Typography.Text className="tw-text-xs tw-font-bold tw-uppercase tw-tracking-[0.16em] tw-text-[#2563EB]">
                Workforce Onboarding
              </Typography.Text>
              <Typography.Title level={2} className="!tw-mt-2 !tw-mb-2 !tw-text-[#0F172A] !tw-tracking-tight">
                회사 계정 가입을 시작해요
              </Typography.Title>
              <Typography.Text className="tw-text-slate-500">
                사업자번호·이메일 인증 후 회사·관리자 정보를 입력해 가입을 완료해요.
              </Typography.Text>
            </div>
            <AppButton variant="text" onClick={() => navigate({ to: '/' })}>
              홈으로 돌아가기
            </AppButton>
          </div>

          {error ? <Alert type="error" showIcon message={error} className="tw-mb-4" /> : null}
          {success ? <Alert type="success" showIcon message={success} className="tw-mb-4" /> : null}

          <Form
            form={form}
            layout="vertical"
            initialValues={{ agreeTerms: false, agreePrivacy: false }}
            onFinish={(values) => void submitOnboarding(values)}
            requiredMark={false}
          >
            <Space direction="vertical" className="tw-w-full" size={20}>
              <div>
                <div className="tw-mb-3 tw-flex tw-items-center tw-justify-between tw-rounded-2xl tw-bg-[#EFF6FF] tw-px-4 tw-py-3">
                  <Typography.Text className="tw-font-semibold tw-text-[#2563EB]">사업자번호</Typography.Text>
                  {businessChecked ? <Tag color="green">검증 완료</Tag> : <Tag>미검증</Tag>}
                </div>
                <Form.Item
                  name="businessNumber"
                  label="사업자번호"
                  rules={[{ required: true, message: '사업자번호를 입력해 주세요.' }]}
                  className="!tw-mb-3"
                  getValueFromEvent={(e) => sanitizeBusinessNumberDigits(e?.target?.value ?? '')}
                >
                  <Input
                    size="large"
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="1234567890"
                    maxLength={10}
                    onChange={() => setBusinessChecked(false)}
                  />
                </Form.Item>
                <div className="tw-flex tw-justify-end">
                  <AppButton size="large" className="tw-min-w-[160px]" loading={loading} onClick={() => void checkBusinessNumber()}>
                    사업자번호 검증
                  </AppButton>
                </div>
              </div>

              <div>
                <div className="tw-mb-3 tw-flex tw-items-center tw-justify-between tw-rounded-2xl tw-bg-[#EFF6FF] tw-px-4 tw-py-3">
                  <Typography.Text className="tw-font-semibold tw-text-[#2563EB]">회사·이메일 인증</Typography.Text>
                  {emailVerified ? <Tag color="green">인증 완료</Tag> : <Tag>미인증</Tag>}
                </div>
                <Form.Item name="companyName" label="회사명" rules={[{ required: true, message: '회사명을 입력해 주세요.' }]}>
                  <Input
                    size="large"
                    onChange={() => {
                      setEmailVerified(false);
                    }}
                  />
                </Form.Item>
                <Form.Item
                  name="adminEmail"
                  label="관리자 이메일"
                  rules={[
                    { required: true, message: '이메일을 입력해 주세요.' },
                    { type: 'email', message: '올바른 이메일 형식이 아닙니다.' },
                  ]}
                >
                  <Input
                    size="large"
                    placeholder="admin@company.com"
                    onChange={() => {
                      setEmailVerified(false);
                    }}
                  />
                </Form.Item>
                <div className="tw-flex tw-justify-end">
                  <AppButton
                    size="large"
                    variant="secondary"
                    disabled={resendCooldown > 0}
                    loading={loading}
                    onClick={() => void sendCode()}
                  >
                    {resendCooldown > 0 ? `재발송 (${resendCooldown}s)` : '인증 코드 발송'}
                  </AppButton>
                </div>
                <Form.Item name="code" label="인증 코드" rules={[{ required: true, message: '인증 코드를 입력해 주세요.' }]}>
                  <Input
                    size="large"
                    maxLength={6}
                    placeholder="발송된 6자리 코드"
                    onChange={() => {
                      setEmailVerified(false);
                    }}
                  />
                </Form.Item>
                <div className="tw-flex tw-justify-end">
                  <AppButton size="large" loading={loading} onClick={() => void verifyCode()}>
                    인증 코드 확인
                  </AppButton>
                </div>
              </div>

              {businessChecked && emailVerified ? (
                <Card size="small" className="tw-rounded-2xl tw-border tw-border-slate-100 tw-bg-slate-50">
                  <Descriptions column={1} size="small" title="입력 정보 확인">
                    <Descriptions.Item label="사업자번호">{form.getFieldValue('businessNumber')}</Descriptions.Item>
                    <Descriptions.Item label="회사명">{form.getFieldValue('companyName')}</Descriptions.Item>
                    <Descriptions.Item label="회사 도메인">{form.getFieldValue('companyDomain')}</Descriptions.Item>
                    <Descriptions.Item label="관리자 이메일">{form.getFieldValue('adminEmail')}</Descriptions.Item>
                    <Descriptions.Item label="관리자 이름">{form.getFieldValue('adminName')}</Descriptions.Item>
                    <Descriptions.Item label="주소">
                      {form.getFieldValue('address')}
                      {form.getFieldValue('detailAddress') ? (
                        <>
                          <br />
                          <span className="tw-text-slate-600">{form.getFieldValue('detailAddress')}</span>
                        </>
                      ) : null}
                    </Descriptions.Item>
                  </Descriptions>
                </Card>
              ) : null}

              <div>
                <Typography.Text className="tw-mb-3 tw-block tw-text-xs tw-font-bold tw-uppercase tw-tracking-[0.12em] tw-text-slate-400">
                  회사 · 관리자 정보
                </Typography.Text>
                {!businessChecked || !emailVerified ? (
                  <Typography.Text type="secondary" className="tw-mb-4 tw-block tw-text-sm tw-leading-relaxed">
                    사업자번호 검증과 이메일 인증이 끝나면 아래 내용을 입력하고 가입을 완료할 수 있어요. (미리 입력해 두어도 됩니다.)
                  </Typography.Text>
                ) : null}
                <Form.Item
                  name="companyDomain"
                  label="회사 도메인"
                  extra={
                    <Typography.Text type="secondary" className="tw-block tw-text-xs tw-leading-relaxed">
                      영문·숫자만 입력 가능합니다. 직원 이메일 자동 생성에 사용됩니다. (예: workforce → emp0001.홍길동@workforce.company)
                    </Typography.Text>
                  }
                  rules={[
                    { required: true, message: '회사 도메인을 입력해 주세요.' },
                    {
                      pattern: /^[a-z0-9]+$/,
                      message: '영문(소문자)과 숫자만 입력할 수 있습니다.',
                    },
                  ]}
                >
                  <Input
                    size="large"
                    placeholder="workforce"
                    autoComplete="off"
                    onChange={(event) => {
                      const v = event.target.value.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
                      form.setFieldValue('companyDomain', v);
                    }}
                  />
                </Form.Item>
                <Form.Item name="ceoName" label="대표자명" rules={[{ required: true, message: '대표자명을 입력해 주세요.' }]}>
                  <Input size="large" />
                </Form.Item>
                <Form.Item
                  label="회사 로고 (선택)"
                  extra={
                    <Typography.Text type="secondary" className="tw-block tw-text-xs tw-leading-relaxed">
                      PNG, JPG, GIF, WebP · 최대 5MB. 가입 완료 직후 관리자 계정으로 잠시 로그인해 등록합니다.
                    </Typography.Text>
                  }
                >
                  <Upload
                    accept="image/png,image/jpeg,image/jpg,image/gif,image/webp"
                    maxCount={1}
                    fileList={
                      logoFile
                        ? [{ uid: '-logo', name: logoFile.name, status: 'done' }]
                        : []
                    }
                    beforeUpload={(file) => {
                      if (!file.type.startsWith('image/')) {
                        message.error('이미지 파일만 선택할 수 있습니다.');
                        return Upload.LIST_IGNORE;
                      }
                      if (file.size > LOGO_MAX_BYTES) {
                        message.error('5MB 이하 이미지만 등록할 수 있습니다.');
                        return Upload.LIST_IGNORE;
                      }
                      setLogoFile(file);
                      return false;
                    }}
                    onRemove={() => {
                      setLogoFile(null);
                    }}
                  >
                    <Button size="large" icon={<UploadOutlined />}>
                      로고 이미지 선택
                    </Button>
                  </Upload>
                </Form.Item>
                <Form.Item name="address" label="주소" rules={[{ required: true, message: '주소를 입력해 주세요.' }]}>
                  <AddressSearchField />
                </Form.Item>
                <Form.Item
                  name="detailAddress"
                  label="상세 주소"
                  rules={[{ required: true, message: '상세 주소를 입력해 주세요.' }]}
                  extra={
                    <Typography.Text type="secondary" className="tw-text-xs">
                      건물 동·층·호수 등 (예: 6층, 301호)
                    </Typography.Text>
                  }
                >
                  <Input size="large" placeholder="예: 6층, 301호" />
                </Form.Item>
                <Typography.Text type="secondary" className="tw-mb-2 tw-block tw-text-xs tw-leading-relaxed">
                  {PASSWORD_RULE_HINT}
                </Typography.Text>
                <Form.Item
                  name="adminPassword"
                  label="관리자 비밀번호"
                  rules={[
                    { required: true, message: '비밀번호를 입력해 주세요.' },
                    {
                      validator: async (_, value: string) => {
                        if (!value || value.length < 8) {
                          throw new Error('비밀번호는 8자 이상이어야 합니다.');
                        }
                        if (!/[A-Za-z]/.test(value)) {
                          throw new Error('영문을 포함해 주세요.');
                        }
                        if (!/\d/.test(value)) {
                          throw new Error('숫자를 포함해 주세요.');
                        }
                        if (!PASSWORD_SPECIAL_RE.test(value)) {
                          throw new Error('특수문자(!@#$%^&*()_+-=[]{} 등)를 포함해 주세요.');
                        }
                      },
                    },
                  ]}
                >
                  <Input.Password size="large" />
                </Form.Item>
                <Form.Item
                  name="adminPasswordCheck"
                  label="비밀번호 확인"
                  dependencies={['adminPassword']}
                  rules={[
                    { required: true, message: '비밀번호 확인을 입력해 주세요.' },
                    ({ getFieldValue }) => ({
                      validator(_, value) {
                        if (!value || getFieldValue('adminPassword') === value) {
                          return Promise.resolve();
                        }
                        return Promise.reject(new Error('비밀번호가 일치하지 않습니다.'));
                      },
                    }),
                  ]}
                >
                  <Input.Password size="large" />
                </Form.Item>
                {passwordStrengthText ? (
                  <Typography.Text
                    type={passwordStrengthText === '강함' ? 'success' : passwordStrengthText === '보통' ? 'warning' : 'danger'}
                    className="tw-mb-2 tw-block"
                  >
                    비밀번호 강도: {passwordStrengthText}
                  </Typography.Text>
                ) : null}
                <Form.Item name="adminName" label="관리자 이름" rules={[{ required: true, message: '관리자 이름을 입력해 주세요.' }]}>
                  <Input size="large" />
                </Form.Item>

                <div className="tw-mt-6 tw-rounded-2xl tw-border tw-border-slate-100 tw-bg-slate-50/80 tw-p-4">
                  <Typography.Text className="tw-mb-3 tw-block tw-text-xs tw-font-bold tw-uppercase tw-tracking-[0.12em] tw-text-slate-400">
                    약관 동의
                  </Typography.Text>
                  <div className="tw-mb-4 tw-border-b tw-border-slate-200/90 tw-pb-4">
                    <Checkbox
                      indeterminate={someAgreementChecked && !allAgreementsChecked}
                      checked={allAgreementsChecked}
                      className="tw-items-start tw-leading-snug [&_.ant-checkbox]:tw-mt-0.5"
                      onChange={(e) => {
                        const v = e.target.checked;
                        form.setFieldsValue({ agreeTerms: v, agreePrivacy: v });
                      }}
                    >
                      <span className="tw-text-sm tw-font-semibold tw-text-slate-900">약관 전체 동의</span>
                    </Checkbox>
                    <Typography.Text type="secondary" className="tw-ml-7 tw-mt-1 tw-block tw-text-xs">
                      이용약관·개인정보처리방침에 함께 동의합니다.
                    </Typography.Text>
                  </div>
                  <div className="!tw-mb-3 tw-flex tw-w-full tw-items-start tw-justify-between tw-gap-3">
                    <Form.Item
                      name="agreeTerms"
                      valuePropName="checked"
                      noStyle
                      rules={[{ validator: agreeValidator('이용약관에 동의해 주세요.') }]}
                    >
                      <Checkbox className="tw-min-w-0 tw-flex-1 tw-items-start tw-leading-snug [&_.ant-checkbox]:tw-mt-0.5">
                        <span className="tw-text-sm tw-text-slate-700">
                          <span className="tw-font-bold tw-text-rose-600">[필수]</span>{' '}
                          <span className="tw-font-semibold tw-text-[#0F172A]">이용약관</span>에 동의합니다.
                        </span>
                      </Checkbox>
                    </Form.Item>
                    <button
                      type="button"
                      className="tw-shrink-0 tw-border-0 tw-bg-transparent tw-pt-0.5 tw-text-sm tw-font-medium tw-text-slate-600 tw-underline tw-underline-offset-4 tw-decoration-slate-400 tw-transition-colors hover:tw-text-[#2563EB] hover:tw-decoration-[#2563EB]"
                      onClick={() => setLegalModal('terms')}
                    >
                      내용 보기
                    </button>
                  </div>
                  <div className="tw-flex tw-w-full tw-items-start tw-justify-between tw-gap-3">
                    <Form.Item
                      name="agreePrivacy"
                      valuePropName="checked"
                      noStyle
                      rules={[{ validator: agreeValidator('개인정보처리방침에 동의해 주세요.') }]}
                    >
                      <Checkbox className="tw-min-w-0 tw-flex-1 tw-items-start tw-leading-snug [&_.ant-checkbox]:tw-mt-0.5">
                        <span className="tw-text-sm tw-text-slate-700">
                          <span className="tw-font-bold tw-text-rose-600">[필수]</span>{' '}
                          <span className="tw-font-semibold tw-text-[#0F172A]">개인정보처리방침</span>에 동의합니다.
                        </span>
                      </Checkbox>
                    </Form.Item>
                    <button
                      type="button"
                      className="tw-shrink-0 tw-border-0 tw-bg-transparent tw-pt-0.5 tw-text-sm tw-font-medium tw-text-slate-600 tw-underline tw-underline-offset-4 tw-decoration-slate-400 tw-transition-colors hover:tw-text-[#2563EB] hover:tw-decoration-[#2563EB]"
                      onClick={() => setLegalModal('privacy')}
                    >
                      내용 보기
                    </button>
                  </div>
                </div>

                <div className="tw-flex tw-flex-wrap tw-items-center tw-justify-end tw-gap-2 tw-pt-2">
                  <AppButton
                    size="large"
                    htmlType="submit"
                    loading={loading}
                    disabled={!businessChecked || !emailVerified}
                  >
                    회사 온보딩 완료
                  </AppButton>
                </div>
              </div>
            </Space>
          </Form>
        </Card>
      </div>

      <AppModal
        title={
          <span className="tw-text-lg tw-font-bold tw-text-[#0F172A]">
            {legalModal === 'terms' ? '이용약관' : legalModal === 'privacy' ? '개인정보처리방침' : ''}
          </span>
        }
        open={legalModal !== null}
        onCancel={() => setLegalModal(null)}
        footer={
          <AppButton variant="secondary" className="tw-min-w-[96px]" onClick={() => setLegalModal(null)}>
            닫기
          </AppButton>
        }
        width={520}
        destroyOnHidden
        classNames={{ body: '!tw-pt-2' }}
      >
        <Typography.Paragraph className="!tw-mb-0 tw-whitespace-pre-wrap tw-text-sm tw-leading-relaxed tw-text-slate-600">
          {legalModal === 'terms' ? LEGAL_DUMMY_TERMS : legalModal === 'privacy' ? LEGAL_DUMMY_PRIVACY : null}
        </Typography.Paragraph>
      </AppModal>
    </div>
  );
}
