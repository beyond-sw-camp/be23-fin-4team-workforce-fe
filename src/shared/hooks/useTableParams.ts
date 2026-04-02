import { useNavigate, useSearch } from '@tanstack/react-router';

/**
 * `/app/members` 목록의 `validateSearch`와 URL 쿼리를 동기화합니다.
 * `useSearch`는 라우트 **id**, `useNavigate`는 **fullPath**를 `from`으로 써야 타입이 맞습니다.
 */
export function useTableParams() {
  const search = useSearch({ from: '/app-layout/app/members', strict: true });
  const navigate = useNavigate({ from: '/app/members' });

  const setTableParams = (next: Partial<typeof search>) => {
    void navigate({
      to: '.',
      search: (prev) => ({ ...prev, ...next }),
      replace: true,
    });
  };

  return { search, setTableParams };
}
