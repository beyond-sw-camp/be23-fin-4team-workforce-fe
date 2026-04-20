import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PropsWithChildren } from 'react';
import { message } from 'antd';
import { queryClient } from '@/app/config/queryClient';
import { authClient } from '@/features/auth/auth-client';
import { AuthContext } from '@/features/auth/auth-context';
import type { AuthContextValue, AuthSession, LoginInput, Me } from '@/features/auth/types';
import { computeAccessExpiryMs } from '@/shared/auth/accessTokenExpiry';
import { subscribeAccessToken } from '@/shared/stores/authTokenStore';

const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const ACTIVITY_EVENTS: Array<keyof WindowEventMap> = ['mousemove', 'keydown', 'click', 'scroll'];

export function AuthProvider({ children }: PropsWithChildren) {
  const [status, setStatus] = useState<AuthContextValue['status']>('loading');
  const [user, setUser] = useState<Me | null>(null);
  const [accessExpiresAtMs, setAccessExpiresAtMs] = useState<number | null>(null);
  const sessionExpiryLogoutStarted = useRef(false);

  const syncExpiryFromToken = useCallback((token: string | null) => {
    setAccessExpiresAtMs(computeAccessExpiryMs(token));
  }, []);

  useEffect(() => {
    return subscribeAccessToken(syncExpiryFromToken);
  }, [syncExpiryFromToken]);

  useEffect(() => {
    if (status !== 'authenticated' || accessExpiresAtMs == null) {
      sessionExpiryLogoutStarted.current = false;
      return;
    }

    const id = window.setInterval(() => {
      if (sessionExpiryLogoutStarted.current) return;
      if (Date.now() < accessExpiresAtMs) return;
      sessionExpiryLogoutStarted.current = true;
      void (async () => {
        await authClient.logout();
        queryClient.clear();
        setUser(null);
        setStatus('unauthenticated');
        void message.warning('세션이 만료되어 로그아웃되었습니다.');
        window.location.assign('/login');
      })();
    }, 1000);

    return () => clearInterval(id);
  }, [status, accessExpiresAtMs]);

  useEffect(() => {
    void (async () => {
      const session = await authClient.getSession();
      if (session) {
        setUser(session.user);
        setStatus('authenticated');
      } else {
        setStatus('unauthenticated');
      }
    })();
  }, []);

  useEffect(() => {
    if (status !== 'authenticated') {
      return;
    }

    let idleTimer: ReturnType<typeof setTimeout> | null = null;

    const startIdleTimer = () => {
      if (idleTimer) {
        clearTimeout(idleTimer);
      }
      idleTimer = setTimeout(() => {
        void (async () => {
          await authClient.logout();
          queryClient.clear();
          setUser(null);
          setStatus('unauthenticated');
          void message.warning('30분 동안 활동이 없어 자동 로그아웃되었습니다.');
          window.location.assign('/login');
        })();
      }, IDLE_TIMEOUT_MS);
    };

    const handleActivity = () => {
      startIdleTimer();
    };

    startIdleTimer();
    ACTIVITY_EVENTS.forEach((eventName) => {
      window.addEventListener(eventName, handleActivity, { passive: true });
    });

    return () => {
      if (idleTimer) {
        clearTimeout(idleTimer);
      }
      ACTIVITY_EVENTS.forEach((eventName) => {
        window.removeEventListener(eventName, handleActivity);
      });
    };
  }, [status]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      isAuthenticated: status === 'authenticated',
      accessExpiresAtMs,
      login: async (input: LoginInput): Promise<AuthSession> => {
        const session = await authClient.login(input);
        setUser(session.user);
        setStatus('authenticated');
        return session;
      },
      logout: async () => {
        await authClient.logout();
        /** 이전 계정 React Query 캐시(대시보드 프로필 등) 제거 */
        queryClient.clear();
        /** `Me` 제거로 `permissions` 등 인증 전역 상태 초기화 */
        setUser(null);
        setStatus('unauthenticated');
      },
      refreshAuth: async () => {
        if (!authClient.refreshSession) {
          setUser(null);
          setStatus('unauthenticated');
          return false;
        }
        const session = await authClient.refreshSession();
        if (session) {
          setUser(session.user);
          setStatus('authenticated');
          return true;
        }
        setUser(null);
        setStatus('unauthenticated');
        return false;
      },
    }),
    [status, user, accessExpiresAtMs],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
