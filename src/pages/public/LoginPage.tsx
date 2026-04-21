import { Alert, Card, Checkbox, Form, Input, Typography } from 'antd';
import { ArrowRightOutlined, LockOutlined, MailOutlined } from '@ant-design/icons';
import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { APP_POST_LOGIN_PATH } from '@/app/config/paths';
import { useAuth } from '@/features/auth/useAuth';
import brandLogo from '@/shared/assets/brand/logo.png';
import { AppButton } from '@/shared/ui/AppButton';

export type LoginPageProps = {
  embedded?: boolean;
};

function LoginPage({ embedded = false }: LoginPageProps) {
  const auth = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onFinish = async (values: { email: string; password: string }) => {
    setLoading(true);
    setError(null);
    try {
      const session = await auth.login(values);
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
    ? 'tw-relative tw-flex tw-w-full tw-min-h-screen tw-items-center tw-justify-center tw-bg-slate-50 tw-pb-12'
    : 'tw-relative tw-flex tw-min-h-screen tw-items-center tw-justify-center tw-overflow-hidden tw-bg-slate-50 tw-p-6';

  return (
    <div className={shellClass}>
      {embedded ? null : (
        <>
          <div className="tw-absolute tw-left-[-10%] tw-top-[-10%] tw-h-[45%] tw-w-[45%] tw-rounded-full tw-bg-blue-100 tw-blur-[120px]" />
          <div className="tw-absolute tw-bottom-[-10%] tw-right-[-10%] tw-h-[40%] tw-w-[40%] tw-rounded-full tw-bg-indigo-100 tw-blur-[110px]" />
        </>
      )}

      <Card
        className={
          embedded
            ? 'tw-z-10 tw-w-full tw-max-w-[460px] tw-mx-auto tw-rounded-[28px] tw-border tw-border-slate-100 tw-shadow-lg tw-shadow-slate-900/5'
            : 'tw-z-10 tw-w-full tw-max-w-[460px] tw-rounded-[36px] tw-border tw-border-slate-100 tw-shadow-2xl tw-shadow-blue-900/5'
        }
      >
        <div className="tw-p-8 md:tw-p-10">
          <div className="tw-mb-8 tw-flex tw-flex-col tw-items-center tw-gap-2">
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

          <Form layout="vertical" onFinish={(values) => void onFinish(values)} requiredMark={false}>
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
              <Checkbox className="tw-text-xs tw-font-semibold tw-text-slate-500">아이디 저장</Checkbox>
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

          <div className="tw-mt-3 tw-border-t tw-border-slate-100 tw-pt-3">
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
    </div>
  );
}

export default LoginPage
