import { ArrowLeftOutlined, MailOutlined } from '@ant-design/icons';
import { Alert, Card, Form, Input, Typography } from 'antd';
import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { memberApi } from '@/features/member/api/memberApi';
import { AppButton } from '@/shared/ui/AppButton';

export function FindPasswordPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onFinish = async (values: { email: string }) => {
    setLoading(true);
    setError(null);
    try {
      await memberApi.sendResetPasswordCode(values);
      setSent(true);
    } catch (e) {
      setError((e as { message?: string })?.message ?? '요청 처리에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="tw-flex tw-min-h-screen tw-items-center tw-justify-center tw-bg-slate-50 tw-p-6">
      <Card className="tw-w-full tw-max-w-[460px] tw-rounded-[32px] tw-border tw-border-slate-100 tw-shadow-2xl tw-shadow-blue-900/5">
        <div className="tw-p-8 md:tw-p-10">
          <AppButton
            type="text"
            variant="text"
            onClick={() => navigate({ to: '/login' })}
            className="tw-mb-4 tw-flex tw-items-center tw-gap-2 tw-text-xs tw-font-bold tw-uppercase tw-tracking-wide tw-text-slate-500 hover:tw-text-slate-900"
          >
            <ArrowLeftOutlined />
            Back to Login
          </AppButton>

          <Typography.Title level={3} className="!tw-mb-1 !tw-tracking-tight">
            비밀번호 찾기
          </Typography.Title>
          <Typography.Text className="tw-text-slate-500">가입한 이메일로 인증 코드를 발송합니다.</Typography.Text>

          {sent ? <Alert type="success" showIcon message="인증 코드가 발송되었습니다." className="tw-my-4" /> : null}
          {error ? <Alert type="error" showIcon message={error} className="tw-my-4" /> : null}

          <Form className="tw-mt-6" layout="vertical" onFinish={(values) => void onFinish(values)} requiredMark={false}>
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

            <AppButton htmlType="submit" size="large" loading={loading} variant="primary" className="tw-h-12 tw-w-full !tw-font-black">
              인증 메일 발송
            </AppButton>
          </Form>
        </div>
      </Card>
    </div>
  );
}
