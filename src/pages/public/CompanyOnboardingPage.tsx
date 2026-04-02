import { Alert, Card, Descriptions, Form, Input, Space, Steps, Tag, Typography } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { companyApi } from '@/features/organization/api/companyApi';
import { AddressSearchField } from '@/shared/ui/AddressSearchField';
import { AppButton } from '@/shared/ui/AppButton';

type OnboardingForm = {
  businessNumber: string;
  companyName: string;
  representativeName: string;
  address: string;
  email: string;
  code: string;
  password: string;
};

export function CompanyOnboardingPage() {
  const navigate = useNavigate();
  const [form] = Form.useForm<OnboardingForm>();
  const passwordValue = Form.useWatch('password', form);
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [businessChecked, setBusinessChecked] = useState(false);
  const [emailVerified, setEmailVerified] = useState(false);
  const [onboardingCompleted, setOnboardingCompleted] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

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
    const hasUpper = /[A-Z]/.test(value);
    const hasLower = /[a-z]/.test(value);
    const hasNumber = /\d/.test(value);
    const score = [hasLength, hasUpper, hasLower, hasNumber].filter(Boolean).length;
    if (score <= 2) return '약함';
    if (score === 3) return '보통';
    return '강함';
  }, [passwordValue]);

  const formatBusinessNumber = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 10);
    if (digits.length <= 3) return digits;
    if (digits.length <= 5) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
    return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
  };

  const checkBusinessNumber = async () => {
    setError(null);
    setSuccess(null);
    const values = await form.validateFields(['businessNumber']).catch(() => null);
    if (!values?.businessNumber) return;
    setLoading(true);
    try {
      const response = await companyApi.checkBusinessNumber(values.businessNumber);
      if (!response.valid) {
        setError('유효하지 않은 사업자번호입니다.');
        return;
      }
      setBusinessChecked(true);
      if (response.companyName) {
        form.setFieldValue('companyName', response.companyName);
      }
      setSuccess('사업자번호가 확인되었습니다.');
      setStep(1);
    } catch (e) {
      setError((e as { message?: string }).message ?? '사업자번호 검증에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const sendCode = async () => {
    setError(null);
    setSuccess(null);
    const values = await form.validateFields(['email', 'companyName']).catch(() => null);
    if (!values?.email) return;
    setLoading(true);
    try {
      await companyApi.sendVerificationCode({ email: values.email, companyName: values.companyName });
      setSuccess('이메일 인증 코드가 발송되었습니다.');
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
    const values = await form.validateFields(['email', 'code']).catch(() => null);
    if (!values?.email || !values?.code) return;
    setLoading(true);
    try {
      await companyApi.verifyCode({ email: values.email, code: values.code });
      setEmailVerified(true);
      setSuccess('이메일 인증이 완료되었습니다.');
      setStep(2);
    } catch (e) {
      setError((e as { message?: string }).message ?? '인증 코드 확인에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const submitOnboarding = async (values: OnboardingForm) => {
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
    setLoading(true);
    try {
      await companyApi.onboarding({
        businessNumber: values.businessNumber,
        companyName: values.companyName,
        representativeName: values.representativeName,
        address: values.address,
        email: values.email,
        password: values.password,
      });
      setSuccess('회사 온보딩이 완료되었습니다. 로그인 페이지에서 로그인해 주세요.');
      setOnboardingCompleted(true);
    } catch (e) {
      setError((e as { message?: string }).message ?? '온보딩 처리에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="tw-min-h-screen tw-bg-[#F8FAFC] tw-px-6 tw-py-10">
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
                3단계만 완료하면 관리자 계정을 바로 사용할 수 있어요.
              </Typography.Text>
            </div>
            <AppButton variant="text" onClick={() => navigate({ to: '/' })}>
              홈으로 돌아가기
            </AppButton>
          </div>

          <div className="tw-mb-6 tw-rounded-2xl tw-bg-[#F8FAFC] tw-p-4">
            <Steps
              size="small"
              current={step}
              items={[
                { title: '사업자번호', status: businessChecked ? 'finish' : undefined },
                { title: '이메일 인증', status: emailVerified ? 'finish' : undefined },
                { title: '계정 생성' },
              ]}
            />
          </div>

          {error ? <Alert type="error" showIcon message={error} className="tw-mb-4" /> : null}
          {success ? <Alert type="success" showIcon message={success} className="tw-mb-4" /> : null}

          <Form form={form} layout="vertical" onFinish={(values) => void submitOnboarding(values)} requiredMark={false}>
            {step === 0 ? (
              <Space direction="vertical" className="tw-w-full" size={14}>
                <div className="tw-flex tw-items-center tw-justify-between tw-rounded-2xl tw-bg-[#EFF6FF] tw-px-4 tw-py-3">
                  <Typography.Text className="tw-font-semibold tw-text-[#2563EB]">사업자번호를 먼저 확인해 주세요</Typography.Text>
                  {businessChecked ? <Tag color="green">검증 완료</Tag> : <Tag>진행 중</Tag>}
                </div>
                <Form.Item
                  name="businessNumber"
                  label="사업자번호"
                  rules={[{ required: true, message: '사업자번호를 입력해 주세요.' }]}
                >
                  <Input
                    size="large"
                    placeholder="123-45-67890"
                    maxLength={12}
                    onChange={(event) => {
                      form.setFieldValue('businessNumber', formatBusinessNumber(event.target.value));
                    }}
                  />
                </Form.Item>
                <Space className="tw-w-full tw-justify-end">
                  <AppButton
                    size="large"
                    className="tw-min-w-[160px]"
                    loading={loading}
                    onClick={() => void checkBusinessNumber()}
                  >
                    사업자번호 검증
                  </AppButton>
                  <AppButton
                    size="large"
                    className="tw-min-w-[120px]"
                    variant="secondary"
                    disabled={!businessChecked}
                    onClick={() => {
                      setError(null);
                      setSuccess(null);
                      setStep(1);
                    }}
                  >
                    다음
                  </AppButton>
                </Space>
              </Space>
            ) : null}

            {step === 1 ? (
              <Space direction="vertical" className="tw-w-full" size={14}>
                <div className="tw-flex tw-items-center tw-justify-between tw-rounded-2xl tw-bg-[#EFF6FF] tw-px-4 tw-py-3">
                  <Typography.Text className="tw-font-semibold tw-text-[#2563EB]">담당자 이메일 인증을 완료해 주세요</Typography.Text>
                  {emailVerified ? <Tag color="green">인증 완료</Tag> : <Tag>진행 중</Tag>}
                </div>
                <Form.Item name="companyName" label="회사명" rules={[{ required: true, message: '회사명을 입력해 주세요.' }]}>
                  <Input size="large" />
                </Form.Item>
                <Form.Item
                  name="email"
                  label="담당자 이메일"
                  rules={[
                    { required: true, message: '이메일을 입력해 주세요.' },
                    { type: 'email', message: '올바른 이메일 형식이 아닙니다.' },
                  ]}
                >
                  <Input size="large" placeholder="admin@company.com" />
                </Form.Item>
                <Form.Item name="code" label="인증 코드" rules={[{ required: true, message: '인증 코드를 입력해 주세요.' }]}>
                  <Input size="large" maxLength={6} />
                </Form.Item>
                <Space className="tw-w-full tw-justify-between">
                  <AppButton variant="text" onClick={() => setStep(0)}>
                    이전
                  </AppButton>
                  <Space>
                    <AppButton
                      size="large"
                      variant="secondary"
                      disabled={resendCooldown > 0}
                      loading={loading}
                      onClick={() => void sendCode()}
                    >
                      {resendCooldown > 0 ? `재발송 (${resendCooldown}s)` : '인증 코드 발송'}
                    </AppButton>
                    <AppButton size="large" loading={loading} onClick={() => void verifyCode()}>
                      인증 코드 확인
                    </AppButton>
                    <AppButton
                      size="large"
                      className="tw-min-w-[100px]"
                      variant="secondary"
                      disabled={!emailVerified}
                      onClick={() => {
                        setError(null);
                        setSuccess(null);
                        setStep(2);
                      }}
                    >
                      다음
                    </AppButton>
                  </Space>
                </Space>
              </Space>
            ) : null}

            {step === 2 ? (
              <Space direction="vertical" className="tw-w-full" size={14}>
                <Card size="small" className="tw-rounded-2xl tw-border tw-border-slate-100 tw-bg-slate-50">
                  <Descriptions column={1} size="small" title="입력 정보 확인">
                    <Descriptions.Item label="사업자번호">{form.getFieldValue('businessNumber')}</Descriptions.Item>
                    <Descriptions.Item label="회사명">{form.getFieldValue('companyName')}</Descriptions.Item>
                    <Descriptions.Item label="담당자 이메일">{form.getFieldValue('email')}</Descriptions.Item>
                  </Descriptions>
                </Card>
                <Form.Item
                  name="representativeName"
                  label="대표자명"
                  rules={[{ required: true, message: '대표자명을 입력해 주세요.' }]}
                >
                  <Input size="large" />
                </Form.Item>
                <Form.Item name="address" label="주소" rules={[{ required: true, message: '주소를 입력해 주세요.' }]}>
                  <AddressSearchField />
                </Form.Item>
                <Form.Item
                  name="password"
                  label="대표 계정 비밀번호"
                  rules={[{ required: true, message: '비밀번호를 입력해 주세요.' }]}
                >
                  <Input.Password size="large" />
                </Form.Item>
                {passwordStrengthText ? (
                  <Typography.Text type={passwordStrengthText === '강함' ? 'success' : passwordStrengthText === '보통' ? 'warning' : 'danger'}>
                    비밀번호 강도: {passwordStrengthText}
                  </Typography.Text>
                ) : null}
                <Space className="tw-w-full tw-justify-between">
                  <AppButton variant="text" onClick={() => setStep(1)}>
                    이전
                  </AppButton>
                  <Space>
                    {onboardingCompleted ? (
                      <AppButton size="large" variant="secondary" onClick={() => navigate({ to: '/login' })}>
                        로그인 페이지로 이동
                      </AppButton>
                    ) : null}
                    <AppButton size="large" htmlType="submit" loading={loading} disabled={onboardingCompleted}>
                      회사 온보딩 완료
                    </AppButton>
                  </Space>
                </Space>
              </Space>
            ) : null}
          </Form>
        </Card>
      </div>
    </div>
  );
}
