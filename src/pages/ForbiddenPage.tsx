import { Button, Result } from 'antd';
import { useNavigate } from '@tanstack/react-router';
import { APP_POST_LOGIN_PATH } from '@/app/config/paths';

export function ForbiddenPage() {
  const navigate = useNavigate();

  return (
    <Result
      className="tw-py-12"
      status="403"
      title="접근 권한이 없습니다"
      subTitle="이 페이지를 보려면 필요한 권한이 있어야 합니다. 관리자에게 문의하거나 대시보드로 돌아가 주세요."
      extra={
        <Button type="primary" size="large" onClick={() => void navigate({ to: APP_POST_LOGIN_PATH })}>
          대시보드로 이동
        </Button>
      }
    />
  );
}
