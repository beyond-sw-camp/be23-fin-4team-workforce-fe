import {
  ArrowLeftOutlined,
  LockOutlined,
  MailOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';
import { Alert, Card, Divider, Form, Input, Typography } from 'antd';
import { useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { memberApi } from '@/features/member/api/memberApi';
import {
  PASSWORD_POLICY_PATTERN,
  PASSWORD_POLICY_RULE_MESSAGE,
} from '@/features/member/lib/passwordPolicy';
import { AppButton } from '@/shared/ui/AppButton';

export function FindPasswordPage() {
  const navigate = useNavigate();
  const [form] = Form.useForm<{ email: string; code: string; newPassword: string; confirmPassword: string }>();

  const [codeSent, setCodeSent] = useState(false);
  const [codeVerified, setCodeVerified] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [sendingMail, setSendingMail] = useState(false);
  const [verifyingCode, setVerifyingCode] = useState(false);
  const [registering, setRegistering] = useState(false);

  useEffect(() => {
    if (!done) return;
    const t = window.setTimeout(() => {
      void navigate({ to: '/login', replace: true });
    }, 2000);
    return () => window.clearTimeout(t);
  }, [done, navigate]);

  const handleSendMail = async () => {
    setError(null);
    try {
      await form.validateFields(['email']);
    } catch {
      return;
    }
    const email = form.getFieldValue('email')?.trim() ?? '';
    setSendingMail(true);
    try {
      await memberApi.sendResetPasswordCode(email);
      setCodeSent(true);
      setCodeVerified(false);
    } catch (e) {
      setError((e as { message?: string })?.message ?? '인증 메일 발송에 실패했습니다.');
    } finally {
      setSendingMail(false);
    }
  };

  const handleVerifyCode = async () => {
    setError(null);
    try {
      await form.validateFields(['email', 'code']);
    } catch {
      return;
    }
    const email = form.getFieldValue('email')?.trim() ?? '';
    const code = form.getFieldValue('code')?.trim() ?? '';
    setVerifyingCode(true);
    try {
      await memberApi.verifyResetPasswordCode(email, code);
      setCodeVerified(true);
    } catch (e) {
      setError((e as { message?: string })?.message ?? '인증 코드 확인에 실패했습니다.');
    } finally {
      setVerifyingCode(false);
    }
  };

  const handleRegisterPassword = async () => {
    setError(null);
    try {
      await form.validateFields(['email', 'code', 'newPassword', 'confirmPassword']);
    } catch {
      return;
    }
    const email = form.getFieldValue('email')?.trim() ?? '';
    setRegistering(true);
    try {
      await memberApi.resetPassword({
        personalEmail: email,
        newPassword: form.getFieldValue('newPassword'),
        newPasswordCheck: form.getFieldValue('confirmPassword'),
      });
      setDone(true);
    } catch (e) {
      setError((e as { message?: string })?.message ?? '비밀번호 재설정에 실패했습니다.');
    } finally {
      setRegistering(false);
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
            비밀번호 찾기
          </Typography.Title>
          <Typography.Text className="tw-text-slate-500">
            개인 이메일로 인증 메일을 보낸 뒤, 인증번호 확인 후 새 비밀번호를 등록합니다.
          </Typography.Text>

          {done ? (
            <Alert
              type="success"
              showIcon
              message="비밀번호가 재설정되었습니다. 잠시 후 로그인 화면으로 이동합니다."
              className="tw-mt-4"
            />
          ) : null}
          {!done && error ? <Alert type="error" showIcon message={error} className="tw-mt-4" /> : null}

          {!done ? (
            <Form form={form} className="tw-mt-6" layout="vertical" requiredMark={false}>
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
                  disabled={codeSent}
                />
              </Form.Item>

              <AppButton
                size="large"
                loading={sendingMail}
                variant="primary"
                className="tw-h-12 tw-w-full !tw-font-black"
                onClick={() => void handleSendMail()}
              >
                인증 메일 발송
              </AppButton>

              {codeSent ? (
                <>
                  <Divider className="!tw-my-6">인증번호</Divider>
                  <Alert
                    type="info"
                    showIcon
                    message="이메일로 발송된 6자리 인증번호를 입력한 뒤 확인해 주세요. (유효 5분)"
                    className="tw-mb-4"
                  />

                  <Form.Item name="code" label="인증번호" rules={[{ required: true, message: '인증번호를 입력해 주세요.' }]}>
                    <Input
                      size="large"
                      maxLength={6}
                      prefix={<SafetyCertificateOutlined className="tw-text-slate-400" />}
                      className="tw-rounded-2xl tw-tracking-[0.25em]"
                      disabled={codeVerified}
                    />
                  </Form.Item>

                  {!codeVerified ? (
                    <AppButton
                      size="large"
                      loading={verifyingCode}
                      variant="secondary"
                      className="tw-h-12 tw-w-full !tw-font-semibold"
                      onClick={() => void handleVerifyCode()}
                    >
                      인증 확인
                    </AppButton>
                  ) : (
                    <Alert type="success" showIcon message="인증이 완료되었습니다." className="tw-mb-4" />
                  )}

                  {codeVerified ? (
                    <>
                      <Divider className="!tw-my-6">새 비밀번호</Divider>

                      <Form.Item
                        name="newPassword"
                        label="새 비밀번호"
                        rules={[
                          { required: true, message: '새 비밀번호를 입력해 주세요.' },
                          {
                            pattern: PASSWORD_POLICY_PATTERN,
                            message: PASSWORD_POLICY_RULE_MESSAGE,
                          },
                        ]}
                      >
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

                      <Typography.Paragraph type="secondary" className="!tw-mb-3 !tw-text-xs">
                        {PASSWORD_POLICY_RULE_MESSAGE}
                      </Typography.Paragraph>

                      <AppButton
                        size="large"
                        loading={registering}
                        variant="primary"
                        className="tw-h-12 tw-w-full !tw-font-black"
                        onClick={() => void handleRegisterPassword()}
                      >
                        새 비밀번호 등록
                      </AppButton>
                    </>
                  ) : null}
                </>
              ) : null}
            </Form>
          ) : null}
        </div>
      </Card>
    </div>
  );
}
