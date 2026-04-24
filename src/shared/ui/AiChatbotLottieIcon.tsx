import Lottie from 'lottie-react';
import iconBot from '@/shared/assets/lottie/icon-bot-white.json';

type AiChatbotLottieIconProps = {
  className?: string;
};

export function AiChatbotLottieIcon({ className }: AiChatbotLottieIconProps) {
  return (
    <span
      className={[
        'tw-inline-grid tw-shrink-0 tw-place-items-center tw-leading-none tw-bg-transparent',
        '[&>div]:tw-flex [&>div]:tw-h-full [&>div]:tw-w-full [&>div]:tw-items-center [&>div]:tw-justify-center [&>div]:tw-bg-transparent',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <Lottie
        animationData={iconBot}
        loop
        className="!tw-h-full !tw-w-full tw-bg-transparent [&_canvas]:tw-bg-transparent [&_svg]:tw-block [&_svg]:tw-max-h-full [&_svg]:tw-max-w-full [&_svg]:tw-shrink-0"
      />
    </span>
  );
}
