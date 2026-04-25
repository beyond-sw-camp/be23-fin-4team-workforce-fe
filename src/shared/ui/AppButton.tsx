import { Button } from 'antd';
import type { ButtonProps } from 'antd';
import { forwardRef } from 'react';
import { twMerge } from 'tailwind-merge';

type AppButtonVariant = 'primary' | 'secondary' | 'subtle' | 'danger' | 'text';

// Omit `variant` from antd ButtonProps (antd 5.24+ adds its own variant; we use AppButtonVariant).
export type AppButtonProps = Omit<ButtonProps, 'variant'> & {
  variant?: AppButtonVariant;
};

/** forwardRef: Popconfirm/Tooltip need a DOM ref on the child (avoids StrictMode findDOMNode warnings). */
export const AppButton = forwardRef<HTMLButtonElement | HTMLAnchorElement, AppButtonProps>(function AppButton(
  { variant = 'primary', className, ...props },
  ref,
) {
  const variantClassName =
    variant === 'primary'
      ? 'tw-border-0 !tw-bg-[#1e3a5f] hover:!tw-bg-[#152a45] disabled:!tw-cursor-not-allowed disabled:!tw-border disabled:!tw-border-slate-200 disabled:!tw-bg-white disabled:!tw-text-slate-400 disabled:!tw-opacity-100 disabled:!tw-shadow-none disabled:hover:!tw-bg-white disabled:hover:!tw-text-slate-400'
      : variant === 'secondary'
        ? 'tw-border tw-border-slate-200 tw-bg-white tw-text-[#0F172A] hover:tw-border-[#2563EB]/30 hover:tw-bg-[#EFF6FF] hover:tw-text-[#2563EB]'
        : variant === 'danger'
          ? 'tw-border-0 !tw-bg-rose-600 hover:!tw-bg-rose-700'
          : variant === 'text'
            ? 'tw-h-auto tw-border-0 tw-bg-transparent tw-p-0 tw-text-[#2563EB] tw-shadow-none hover:tw-bg-transparent hover:tw-text-[#1D4ED8]'
            : 'tw-border tw-border-transparent tw-bg-[#EFF6FF] tw-text-[#0F172A] hover:tw-bg-[#DBEAFE]';

  return (
    <Button
      ref={ref}
      {...props}
      type={variant === 'primary' || variant === 'danger' ? 'primary' : 'default'}
      className={twMerge('tw-h-11 tw-rounded-2xl tw-font-bold', variant === 'text' ? 'tw-rounded-none' : '', variantClassName, className)}
    />
  );
});
