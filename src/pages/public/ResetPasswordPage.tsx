import { ArrowLeftOutlined, LockOutlined, MailOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { Alert, Card, Form, Input, Typography } from 'antd';
import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { memberApi } from '@/features/member/api/memberApi';
import { AppButton } from '@/shared/ui/AppButton';

type ResetForm = {
  email: string;
  code: string;
  newPassword: string;
  confirmPassword: string;
};

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onFinish = async (values: ResetForm) => {
    setLoading(true);
    setError(null);
    try {
      await memberApi.verifyResetPasswordCode(values.email, values.code);
      await memberApi.resetPassword({
        personalEmail: values.email,
        newPassword: values.newPassword,
        newPasswordCheck: values.confirmPassword,
      });
      setDone(true);
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

          <div className="tw-mb-6 tw-rounded-3xl tw-bg-gradient-to-br tw-from-blue-600 tw-to-indigo-700 tw-p-6 tw-text-white">
            <Typography.Title level={4} className="!tw-mb-1 !tw-text-white">
              비밀번호 재설정
            </Typography.Title>
            <Typography.Text className="tw-text-blue-100">
              인증 코드 확인 후 새 비밀번호로 재설정합니다. (찾기 화면에서 코드를 먼저 받아 주세요.)
            </Typography.Text>
          </div>

          {done ? <Alert type="success" showIcon message="비밀번호가 변경되었습니다." className="tw-mb-4" /> : null}
          {error ? <Alert type="error" showIcon message={error} className="tw-mb-4" /> : null}

          <Form layout="vertical" onFinish={(values) => void onFinish(values)} requiredMark={false}>
            <Form.Item name="email" label="이메일" rules={[{ required: true, message: '이메일을 입력해 주세요.' }]}>
              <Input size="large" prefix={<MailOutlined className="tw-text-slate-400" />} className="tw-rounded-2xl" />
            </Form.Item>

            <Form.Item name="code" label="인증 코드" rules={[{ required: true, message: '인증 코드를 입력해 주세요.' }]}>
              <Input size="large" maxLength={6} prefix={<SafetyCertificateOutlined className="tw-text-slate-400" />} className="tw-rounded-2xl tw-tracking-[0.25em]" />
            </Form.Item>

            <Form.Item name="newPassword" label="새 비밀번호" rules={[{ required: true, message: '새 비밀번호를 입력해 주세요.' }]}>
              <Input.Password size="large" prefix={<LockOutlined className="tw-text-slate-400" />} className="tw-rounded-2xl" />
            </Form.Item>

            <Form.Item
              name="confirmPassword"
              label="새 비밀번호 확인"
              dependencies={['newPassword']}
              rules={[
                { required: true, message: '비밀번호 확인을 입력해 주세요.' },
                ({ getFieldValue }) => ({
                  validator(_, value) {
                    if (!value || getFieldValue('newPassword') === value) {
                      return Promise.resolve();
                    }
                    return Promise.reject(new Error('비밀번호가 일치하지 않습니다.'));
                  },
                }),
              ]}
            >
              <Input.Password size="large" prefix={<LockOutlined className="tw-text-slate-400" />} className="tw-rounded-2xl" />
            </Form.Item>

            <AppButton htmlType="submit" size="large" loading={loading} variant="primary" className="tw-mt-2 tw-h-12 tw-w-full !tw-font-black">
              비밀번호 재설정
            </AppButton>
          </Form>
        </div>
      </Card>
    </div>
  );
}
