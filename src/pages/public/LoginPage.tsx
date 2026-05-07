import { Alert, Card, Checkbox, Form, Input, Typography } from 'antd';
import { ArrowRightOutlined, LockOutlined, MailOutlined } from '@ant-design/icons';
import { useNavigate } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { APP_POST_LOGIN_PATH } from '@/app/config/paths';
import { useAuth } from '@/features/auth/useAuth';
import { decodeJwtPayload } from '@/shared/auth/jwtTenantClaims';
import { getAccessToken } from '@/shared/stores/authTokenStore';
import brandLogo from '@/shared/assets/brand/logo.png';
import { AppButton } from '@/shared/ui/AppButton';

const SAVED_LOGIN_EMAIL_KEY = 'workforce.savedLoginEmail';

function readSavedLoginEmail(): string {
  if (typeof window === 'undefined') return '';
  try {
    return localStorage.getItem(SAVED_LOGIN_EMAIL_KEY)?.trim() ?? '';
  } catch {
    return '';
  }
}

function persistSavedLoginEmail(email: string, remember: boolean) {
  if (typeof window === 'undefined') return;
  try {
    if (remember && email.trim()) {
      localStorage.setItem(SAVED_LOGIN_EMAIL_KEY, email.trim());
    } else {
      localStorage.removeItem(SAVED_LOGIN_EMAIL_KEY);
    }
  } catch {
    // 저장 실패 시 무시 (프라이빗 모드 등)
  }
}

export type LoginPageProps = {
  embedded?: boolean;
};

function LoginPage({ embedded = false }: LoginPageProps) {
  const auth = useAuth();
  const navigate = useNavigate();
  const [form] = Form.useForm<{
    email: string;
    password: string;
    rememberSaveId: boolean;
  }>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const savedEmail = useMemo(() => readSavedLoginEmail(), []);

  const onFinish = async (values: { email: string; password: string; rememberSaveId: boolean }) => {
    setLoading(true);
    setError(null);
    try {
      const session = await auth.login({
        email: values.email,
        password: values.password,
      });
      persistSavedLoginEmail(values.email, values.rememberSaveId);

      // SaaS 운영자 분기 - actor_type=OPERATOR 면 운영자 콘솔로
      void session;
      const token = getAccessToken();
      const tokenPayload = token ? decodeJwtPayload(token) : null;
      const actorType = (tokenPayload?.actor_type ?? tokenPayload?.actorType) as string | undefined;
      if (actorType === 'OPERATOR') {
        void navigate({ to: '/saas/dashboard', replace: true });
        return;
      }

      if (session.user.flags?.mustChangePassword) {
        void navigate({ to: '/change-password', search: { forced: true } });
        return;
      }
      if (session.user.flags?.onboardingRequired) {
        void navigate({ to: '/app/onboarding', replace: true });
        return;
      }
      void navigate({ to: APP_POST_LOGIN_PATH, replace: true });
    } catch (e) {
      setError((e as { message?: string })?.message ?? '로그인에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const shellClass = embedded
    ? 'tw-relative tw-flex tw-w-full tw-min-h-screen tw-items-start tw-justify-center tw-overflow-x-hidden tw-bg-slate-50 tw-pt-20 sm:tw-pt-24 tw-pb-8 sm:tw-pb-10 tw-px-3 sm:tw-px-4'
    : 'tw-relative tw-flex tw-min-h-screen tw-items-center tw-justify-center tw-overflow-x-hidden tw-overflow-y-hidden tw-bg-slate-50 tw-p-6';

  return (
    <div className={`${shellClass} tw-max-w-full`}>
      {embedded ? null : (
        <>
          <div className="tw-absolute tw-left-[-10%] tw-top-[-10%] tw-h-[45%] tw-w-[45%] tw-rounded-full tw-bg-blue-100 tw-blur-[120px]" />
          <div className="tw-absolute tw-bottom-[-10%] tw-right-[-10%] tw-h-[40%] tw-w-[40%] tw-rounded-full tw-bg-indigo-100 tw-blur-[110px]" />
        </>
      )}

      {embedded ? (
        <div className="tw-z-10 tw-mx-auto tw-w-full tw-max-w-[460px] tw-min-w-0">
          <div className="tw-min-w-0 tw-p-5 sm:tw-p-6 md:tw-p-8">
            <div className="tw-mb-5 sm:tw-mb-6 tw-flex tw-flex-col tw-items-center tw-gap-2">
            <img
              src={brandLogo}
              alt="WORKFORCE 로고"
              className="tw-h-12 tw-w-auto tw-block tw-shrink-0"
            />
            <Typography.Text className="tw-text-[11px] tw-font-bold tw-uppercase tw-tracking-[0.2em] tw-text-slate-500">
              LOGIN
            </Typography.Text>
          </div>

          {error ? <Alert type="error" showIcon message={error} className="tw-mb-4" /> : null}

          <Form
            form={form}
            layout="vertical"
            initialValues={{
              email: savedEmail,
              rememberSaveId: Boolean(savedEmail),
            }}
            onFinish={(values) => void onFinish(values)}
            requiredMark={false}
          >
            <Form.Item
              label={<span className="tw-text-[11px] tw-font-bold tw-uppercase tw-tracking-[0.15em] tw-text-slate-400">Email</span>}
              name="email"
              rules={[{ required: true, message: '이메일을 입력해 주세요.' }]}
            >
              <Input
                size="large"
                prefix={<MailOutlined className="tw-text-slate-400" />}
                placeholder="example@workforce.com"
                className="tw-rounded-2xl"
              />
            </Form.Item>

            <Form.Item
              label={<span className="tw-text-[11px] tw-font-bold tw-uppercase tw-tracking-[0.15em] tw-text-slate-400">Password</span>}
              name="password"
              rules={[{ required: true, message: '비밀번호를 입력해 주세요.' }]}
            >
              <Input.Password
                size="large"
                prefix={<LockOutlined className="tw-text-slate-400" />}
                placeholder="••••••••"
                className="tw-rounded-2xl"
              />
            </Form.Item>

            <div className="tw-mb-4 tw-flex tw-flex-wrap tw-items-center tw-justify-between tw-gap-2">
              <Form.Item name="rememberSaveId" valuePropName="checked" className="tw-mb-0">
                <Checkbox className="tw-text-xs tw-font-semibold tw-text-slate-500">아이디 저장</Checkbox>
              </Form.Item>
              <AppButton
                type="text"
                variant="text"
                className="tw-text-xs tw-font-bold tw-text-blue-600 hover:tw-text-blue-700"
                onClick={() => navigate({ to: '/find-password' })}
              >
                비밀번호 찾기
              </AppButton>
            </div>

            <AppButton
              htmlType="submit"
              size="large"
              loading={loading}
              icon={!loading ? <ArrowRightOutlined /> : undefined}
              iconPosition="end"
              className="tw-h-12 tw-w-full !tw-font-black"
            >
              로그인
            </AppButton>
          </Form>

          <div className="tw-mt-2 tw-border-t tw-border-slate-100 tw-pt-2">
            <div className="tw-space-y-3">
              <AppButton
                size="large"
                variant="secondary"
                className="tw-h-12 tw-w-full !tw-font-semibold !tw-bg-white hover:!tw-bg-white"
                onClick={() => navigate({ to: '/company/onboarding' })}
              >
                회사 계정 가입
              </AppButton>
            </div>
          </div>
          </div>
        </div>
      ) : (
        <Card className="tw-z-10 tw-w-full tw-max-w-[460px] tw-rounded-[36px] tw-border tw-border-slate-100 tw-shadow-2xl tw-shadow-blue-900/5">
          <div className="tw-p-7 md:tw-p-9">
            <div className="tw-mb-6 tw-flex tw-flex-col tw-items-center tw-gap-2">
              <img
                src={brandLogo}
                alt="WORKFORCE 로고"
                className="tw-h-12 tw-w-auto tw-block tw-shrink-0"
              />
              <Typography.Text className="tw-text-[11px] tw-font-bold tw-uppercase tw-tracking-[0.2em] tw-text-slate-500">
                LOGIN
              </Typography.Text>
            </div>

            {error ? <Alert type="error" showIcon message={error} className="tw-mb-4" /> : null}

            <Form
              form={form}
              layout="vertical"
              initialValues={{
                email: savedEmail,
                rememberSaveId: Boolean(savedEmail),
              }}
              onFinish={(values) => void onFinish(values)}
              requiredMark={false}
            >
              <Form.Item
                label={<span className="tw-text-[11px] tw-font-bold tw-uppercase tw-tracking-[0.15em] tw-text-slate-400">Email</span>}
                name="email"
                rules={[{ required: true, message: '이메일을 입력해 주세요.' }]}
              >
                <Input
                  size="large"
                  prefix={<MailOutlined className="tw-text-slate-400" />}
                  placeholder="example@workforce.com"
                  className="tw-rounded-2xl"
                />
              </Form.Item>

              <Form.Item
                label={<span className="tw-text-[11px] tw-font-bold tw-uppercase tw-tracking-[0.15em] tw-text-slate-400">Password</span>}
                name="password"
                rules={[{ required: true, message: '비밀번호를 입력해 주세요.' }]}
              >
                <Input.Password
                  size="large"
                  prefix={<LockOutlined className="tw-text-slate-400" />}
                  placeholder="••••••••"
                  className="tw-rounded-2xl"
                />
              </Form.Item>

              <div className="tw-mb-4 tw-flex tw-items-center tw-justify-between">
                <Form.Item name="rememberSaveId" valuePropName="checked" className="tw-mb-0">
                  <Checkbox className="tw-text-xs tw-font-semibold tw-text-slate-500">아이디 저장</Checkbox>
                </Form.Item>
                <AppButton
                  type="text"
                  variant="text"
                  className="tw-text-xs tw-font-bold tw-text-blue-600 hover:tw-text-blue-700"
                  onClick={() => navigate({ to: '/find-password' })}
                >
                  비밀번호 찾기
                </AppButton>
              </div>

              <AppButton
                htmlType="submit"
                size="large"
                loading={loading}
                icon={!loading ? <ArrowRightOutlined /> : undefined}
                iconPosition="end"
                className="tw-h-12 tw-w-full !tw-font-black"
              >
                로그인
              </AppButton>
            </Form>

            <div className="tw-mt-2 tw-border-t tw-border-slate-100 tw-pt-2">
              <div className="tw-space-y-3">
                <AppButton
                  size="large"
                  variant="secondary"
                  className="tw-h-12 tw-w-full !tw-font-semibold !tw-bg-white hover:!tw-bg-white"
                  onClick={() => navigate({ to: '/company/onboarding' })}
                >
                  회사 계정 가입
                </AppButton>
              </div>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

export default LoginPage
