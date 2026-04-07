import { ArrowLeftOutlined, LockOutlined } from '@ant-design/icons';
import { Alert, Card, Form, Input, Typography } from 'antd';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useState } from 'react';
import { APP_POST_LOGIN_PATH } from '@/app/config/paths';
import { useAuth } from '@/features/auth/useAuth';
import { memberApi } from '@/features/member/api/memberApi';
import { AppButton } from '@/shared/ui/AppButton';

type FormValues = {
  currentPassword: string;
  newPassword: string;
  newPasswordCheck: string;
};

export function ChangePasswordPage() {
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { forced?: boolean };
  const { refreshAuth, logout } = useAuth();
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onFinish = async (values: FormValues) => {
    setLoading(true);
    setError(null);
    try {
      await memberApi.changePassword({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
        newPasswordCheck: values.newPasswordCheck,
      });
      await refreshAuth();
      setDone(true);
      window.setTimeout(() => {
        void navigate({ to: APP_POST_LOGIN_PATH, replace: true });
      }, 800);
    } catch (e) {
      const msg =
        e && typeof e === 'object' && 'message' in e && typeof (e as { message: unknown }).message === 'string'
          ? (e as { message: string }).message
          : '비밀번호 변경에 실패했습니다.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="tw-flex tw-min-h-screen tw-items-center tw-justify-center tw-bg-slate-50 tw-p-6">
      <Card className="tw-w-full tw-max-w-[520px] tw-rounded-[32px] tw-border tw-border-slate-100 tw-shadow-2xl tw-shadow-blue-900/5">
        <div className="tw-p-8 md:tw-p-10">
          {search.forced ? (
            <AppButton
              type="text"
              variant="text"
              onClick={() => void logout().then(() => navigate({ to: '/login' }))}
              className="tw-mb-4 tw-flex tw-items-center tw-gap-2 tw-text-xs tw-font-bold tw-uppercase tw-tracking-wide tw-text-slate-500 hover:tw-text-slate-900"
            >
              <ArrowLeftOutlined />
              로그아웃 후 로그인
            </AppButton>
          ) : (
            <AppButton
              type="text"
              variant="text"
              onClick={() => navigate({ to: '/login' })}
              className="tw-mb-4 tw-flex tw-items-center tw-gap-2 tw-text-xs tw-font-bold tw-uppercase tw-tracking-wide tw-text-slate-500 hover:tw-text-slate-900"
            >
              <ArrowLeftOutlined />
              로그인으로
            </AppButton>
          )}

          <div className="tw-mb-6 tw-rounded-3xl tw-bg-gradient-to-br tw-from-blue-600 tw-to-indigo-700 tw-p-6 tw-text-white">
            <Typography.Title level={4} className="!tw-mb-1 !tw-text-white">
              비밀번호 변경
            </Typography.Title>
            <Typography.Text className="tw-text-blue-100">
              {search.forced
                ? '최초 로그인입니다. 새 비밀번호로 변경해 주세요.'
                : '현재 비밀번호와 새 비밀번호를 입력해 주세요.'}
            </Typography.Text>
          </div>

          {search.forced ? (
            <Alert type="info" showIcon message="보안을 위해 최초 로그인 시 비밀번호 변경이 필요합니다." className="tw-mb-4" />
          ) : null}
          {done ? (
            <Alert type="success" showIcon message="비밀번호가 변경되었습니다. 잠시 후 대시보드로 이동합니다." className="tw-mb-4" />
          ) : null}
          {error ? <Alert type="error" showIcon message={error} className="tw-mb-4" /> : null}

          <Form layout="vertical" onFinish={(values) => void onFinish(values)} requiredMark={false}>
            <Form.Item
              name="currentPassword"
              label="현재 비밀번호"
              rules={[{ required: true, message: '현재 비밀번호를 입력해 주세요.' }]}
            >
              <Input.Password size="large" prefix={<LockOutlined className="tw-text-slate-400" />} className="tw-rounded-2xl" />
            </Form.Item>

            <Form.Item name="newPassword" label="새 비밀번호" rules={[{ required: true, message: '새 비밀번호를 입력해 주세요.' }]}>
              <Input.Password size="large" prefix={<LockOutlined className="tw-text-slate-400" />} className="tw-rounded-2xl" />
            </Form.Item>

            <Form.Item
              name="newPasswordCheck"
              label="새 비밀번호 확인"
              dependencies={['newPassword']}
              rules={[
                { required: true, message: '새 비밀번호 확인을 입력해 주세요.' },
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
              비밀번호 변경
            </AppButton>
          </Form>
        </div>
      </Card>
    </div>
  );
}
