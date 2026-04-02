import { useEffect, useMemo, useState } from 'react';
import type { PropsWithChildren } from 'react';
import { message } from 'antd';
import { authClient } from '@/features/auth/auth-client';
import { AuthContext } from '@/features/auth/auth-context';
import type { AuthContextValue, LoginInput, Me } from '@/features/auth/types';

const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const ACTIVITY_EVENTS: Array<keyof WindowEventMap> = ['mousemove', 'keydown', 'click', 'scroll'];

export function AuthProvider({ children }: PropsWithChildren) {
  const [status, setStatus] = useState<AuthContextValue['status']>('loading');
  const [user, setUser] = useState<Me | null>(null);

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
      login: async (input: LoginInput) => {
        const session = await authClient.login(input);
        setUser(session.user);
        setStatus('authenticated');
      },
      logout: async () => {
        await authClient.logout();
        setUser(null);
        setStatus('unauthenticated');
      },
    }),
    [status, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
