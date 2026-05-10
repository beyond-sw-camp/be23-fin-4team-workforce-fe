import {forwardRef} from 'react';
import type {ButtonHTMLAttributes} from 'react';
import {twMerge} from 'tailwind-merge';

export type AppInlinePillButtonProps = ButtonHTMLAttributes<HTMLButtonElement>;

export const AppInlinePillButton = forwardRef<HTMLButtonElement, AppInlinePillButtonProps>(
    function AppInlinePillButton({className, type = 'button', ...props}, ref) {
        return (
            <button
                ref={ref}
                type={type}
                {...props}
                className={twMerge(
                    'tw-inline-flex tw-items-center tw-justify-center tw-gap-1.5 tw-rounded-full tw-border tw-border-solid !tw-border-slate-300 tw-bg-white tw-text-slate-700 tw-transition-colors hover:!tw-border-slate-400 hover:tw-bg-slate-50 disabled:tw-cursor-not-allowed disabled:tw-opacity-60',
                    className,
                )}
            />
        );
    },
);

