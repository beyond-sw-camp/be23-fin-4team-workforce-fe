import { Button } from 'antd';
import type { ButtonProps } from 'antd';
import { twMerge } from 'tailwind-merge';

type AppButtonVariant = 'primary' | 'secondary' | 'subtle' | 'danger' | 'text';

// Ant Design 5.24+ ButtonProps에도 `variant`가 있어 교차 타입 시 충돌하므로 제외 후 우리 전용 variant 사용
type AppButtonProps = Omit<ButtonProps, 'variant'> & {
  variant?: AppButtonVariant;
};

export function AppButton({ variant = 'primary', className, ...props }: AppButtonProps) {
  const variantClassName =
    variant === 'primary'
      ? 'tw-border-0 !tw-bg-[#2563EB] hover:!tw-bg-[#1D4ED8]'
      : variant === 'secondary'
        ? 'tw-border tw-border-slate-200 tw-bg-white tw-text-[#0F172A] hover:tw-border-[#2563EB]/30 hover:tw-bg-[#EFF6FF] hover:tw-text-[#2563EB]'
        : variant === 'danger'
          ? 'tw-border-0 !tw-bg-rose-600 hover:!tw-bg-rose-700'
          : variant === 'text'
            ? 'tw-h-auto tw-border-0 tw-bg-transparent tw-p-0 tw-text-[#2563EB] tw-shadow-none hover:tw-bg-transparent hover:tw-text-[#1D4ED8]'
          : 'tw-border tw-border-transparent tw-bg-[#EFF6FF] tw-text-[#0F172A] hover:tw-bg-[#DBEAFE]';

  return (
    <Button
      {...props}
      type={variant === 'primary' || variant === 'danger' ? 'primary' : 'default'}
      className={twMerge('tw-h-11 tw-rounded-2xl tw-font-bold', variant === 'text' ? 'tw-rounded-none' : '', variantClassName, className)}
    />
  );
}
