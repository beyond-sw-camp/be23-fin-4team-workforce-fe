import { ArrowLeftOutlined, MailOutlined } from '@ant-design/icons';
import { Alert, Card, Form, Input, Space, Typography } from 'antd';
import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { memberApi } from '@/features/member/api/memberApi';
import { AppButton } from '@/shared/ui/AppButton';

export function VerifyEmailPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSend = async (values: { email: string }) => {
    setLoading(true);
    setError(null);
    try {
      await memberApi.sendEmailCode(values);
    } catch (e) {
      setError((e as { message?: string })?.message ?? '요청 처리에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const onVerify = async (values: { email: string; code: string }) => {
    setLoading(true);
    setError(null);
    try {
      await memberApi.verifyEmailCode(values);
      setVerified(true);
    } catch (e) {
      setError((e as { message?: string })?.message ?? '요청 처리에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="tw-flex tw-min-h-screen tw-items-center tw-justify-center tw-bg-slate-50 tw-p-6">
      <Card className="tw-w-full tw-max-w-[520px] tw-rounded-[32px] tw-border tw-border-slate-100 tw-shadow-2xl tw-shadow-blue-900/5">
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
            이메일 인증
          </Typography.Title>
          <Typography.Text className="tw-text-slate-500">인증 코드를 발송하고 6자리 코드를 검증합니다.</Typography.Text>

          {verified ? <Alert type="success" showIcon message="이메일 인증이 완료되었습니다." className="tw-my-4" /> : null}
          {error ? <Alert type="error" showIcon message={error} className="tw-my-4" /> : null}

          <Space direction="vertical" className="tw-mt-6 tw-w-full" size={18}>
            <Form layout="vertical" onFinish={(values) => void onSend(values)} requiredMark={false}>
              <Form.Item name="email" label="이메일" rules={[{ required: true, message: '이메일을 입력해 주세요.' }]}>
                <Input size="large" prefix={<MailOutlined className="tw-text-slate-400" />} className="tw-rounded-2xl" />
              </Form.Item>
              <AppButton htmlType="submit" size="large" className="tw-h-12 tw-w-full" variant="secondary" loading={loading}>
                인증 코드 발송
              </AppButton>
            </Form>

            <Form layout="vertical" onFinish={(values) => void onVerify(values)} requiredMark={false}>
              <Form.Item name="email" label="이메일" rules={[{ required: true, message: '이메일을 입력해 주세요.' }]}>
                <Input size="large" className="tw-rounded-2xl" />
              </Form.Item>
              <Form.Item name="code" label="인증 코드" rules={[{ required: true, message: '코드를 입력해 주세요.' }]}>
                <Input size="large" maxLength={6} className="tw-rounded-2xl tw-tracking-[0.3em]" />
              </Form.Item>
              <AppButton htmlType="submit" size="large" className="tw-h-12 tw-w-full !tw-font-black" variant="primary" loading={loading}>
                코드 확인
              </AppButton>
            </Form>
          </Space>
        </div>
      </Card>
    </div>
  );
}
