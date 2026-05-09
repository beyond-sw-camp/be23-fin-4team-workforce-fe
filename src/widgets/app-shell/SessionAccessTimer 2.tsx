import { ClockCircleOutlined } from '@ant-design/icons';
import { Button, message } from 'antd';
import { useEffect, useState } from 'react';
import { useAuth } from '@/features/auth/useAuth';

function formatSessionCountdown(totalSeconds: number): string {
  const s = Math.max(0, totalSeconds);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

type SessionAccessTimerProps = {
  size?: 'default' | 'compact';
};

export function SessionAccessTimer({ size = 'default' }: SessionAccessTimerProps) {
  const { accessExpiresAtMs, refreshAuth } = useAuth();
  const [remainingSec, setRemainingSec] = useState(0);
  const [extending, setExtending] = useState(false);

  useEffect(() => {
    if (accessExpiresAtMs == null) {
      setRemainingSec(0);
      return;
    }

    const tick = () => {
      setRemainingSec(Math.max(0, Math.ceil((accessExpiresAtMs - Date.now()) / 1000)));
    };

    tick();
    const id = window.setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [accessExpiresAtMs]);

  const handleExtend = async () => {
    setExtending(true);
    try {
      const ok = await refreshAuth();
      if (ok) {
        void message.success('세션이 연장되었습니다.');
      } else {
        void message.error('세션 연장에 실패했습니다. 다시 로그인해 주세요.');
      }
    } catch {
      void message.error('세션 연장에 실패했습니다.');
    } finally {
      setExtending(false);
    }
  };

  if (accessExpiresAtMs == null) {
    return null;
  }

  const sessionTone =
    remainingSec > 0 && remainingSec <= 60
      ? 'danger'
      : remainingSec > 0 && remainingSec <= 5 * 60
        ? 'warning'
        : 'safe';
  const sessionStyle = {
    safe: {
      shell: 'tw-border-blue-100/70 tw-bg-blue-50/50',
      dot: 'tw-bg-blue-500',
      icon: 'tw-text-blue-500',
      time: 'tw-text-blue-950',
      button:
        '!tw-border-blue-200 !tw-bg-white !tw-text-blue-600 hover:!tw-border-blue-600 hover:!tw-bg-blue-600 hover:!tw-text-white',
    },
    warning: {
      shell: 'tw-border-orange-200/70 tw-bg-orange-50/70',
      dot: 'tw-animate-pulse tw-bg-orange-500',
      icon: 'tw-text-orange-500',
      time: 'tw-text-orange-950',
      button:
        '!tw-border-orange-300 !tw-bg-orange-500 !tw-text-white hover:!tw-border-orange-600 hover:!tw-bg-orange-600 hover:!tw-text-white',
    },
    danger: {
      shell: 'tw-border-red-200 tw-bg-red-50/80',
      dot: 'tw-animate-ping tw-bg-red-600',
      icon: 'tw-text-red-600',
      time: 'tw-text-red-950',
      button:
        '!tw-border-red-400 !tw-bg-red-600 !tw-text-white !tw-shadow-[0_4px_12px_rgba(220,38,38,0.18)] hover:!tw-border-red-700 hover:!tw-bg-red-700 hover:!tw-text-white',
    },
  }[sessionTone];
  const compact = size === 'compact';

  return (
    <div
      className={`tw-flex tw-w-fit tw-items-center tw-border tw-border-solid tw-shadow-[0_1px_2px_rgba(15,23,42,0.04)] tw-backdrop-blur-md tw-transition-all tw-duration-500 ${compact ? 'tw-h-9 tw-gap-2 tw-rounded-xl tw-py-0 tw-pl-2.5 tw-pr-1' : 'tw-h-11 tw-gap-2.5 tw-rounded-full tw-py-1 tw-pl-3 tw-pr-1.5'} ${sessionStyle.shell}`}
      title="액세스 토큰 만료까지 남은 시간"
    >
      <div className="tw-flex tw-items-center tw-gap-2">
        <span className="tw-relative tw-inline-flex tw-size-4 tw-items-center tw-justify-center">
          <span
            className={`tw-absolute -tw-right-0.5 -tw-top-0.5 tw-size-1.5 tw-rounded-full ${sessionStyle.dot}`}
          />
          <ClockCircleOutlined className={`tw-text-[16px] ${sessionStyle.icon}`} aria-hidden />
        </span>
        <span
          className={`tw-tabular-nums tw-font-semibold tw-leading-none tw-tracking-tight ${compact ? 'tw-min-w-[44px] tw-text-xs' : 'tw-min-w-[48px] tw-text-sm'} ${sessionStyle.time}`}
        >
          {formatSessionCountdown(remainingSec)}
        </span>
      </div>
      <Button
        type="default"
        size="small"
        loading={extending}
        onClick={() => void handleExtend()}
        className={`!tw-text-xs !tw-font-bold !tw-transition-all active:!tw-scale-95 ${compact ? '!tw-h-7 !tw-rounded-lg !tw-px-2.5' : '!tw-h-8 !tw-rounded-full !tw-px-3.5'} ${sessionStyle.button}`}
      >
        연장
      </Button>
    </div>
  );
}
