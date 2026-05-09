import { InputNumber, Space } from 'antd';
import type { ComponentProps, CSSProperties, ReactNode } from 'react';
import clsx from 'clsx';

type InputNumberProps = ComponentProps<typeof InputNumber>;

type AppUnitInputNumberProps = Omit<InputNumberProps, 'addonAfter' | 'addonBefore' | 'className' | 'style'> & {
  unit?: ReactNode;
  prefixUnit?: ReactNode;
  className?: string;
  inputClassName?: string;
  inputStyle?: CSSProperties;
  style?: CSSProperties;
};

export function AppUnitInputNumber({
  unit,
  prefixUnit,
  className,
  inputClassName,
  inputStyle,
  style,
  ...props
}: AppUnitInputNumberProps) {
  return (
    <Space.Compact block className={className} style={style}>
      {prefixUnit !== undefined ? (
        <span
          className={clsx(
            'tw-inline-flex tw-min-w-10 tw-items-center tw-justify-center tw-border tw-border-r-0 tw-border-solid tw-border-slate-300 tw-bg-slate-50 tw-px-3 tw-text-sm tw-font-medium tw-text-slate-500',
            'tw-rounded-l-md',
          )}
        >
          {prefixUnit}
        </span>
      ) : null}
      <InputNumber
        {...props}
        className={inputClassName}
        style={{ width: '100%', ...inputStyle }}
      />
      {unit !== undefined ? (
        <span
          className={clsx(
            'tw-inline-flex tw-min-w-10 tw-items-center tw-justify-center tw-border tw-border-l-0 tw-border-solid tw-border-slate-300 tw-bg-slate-50 tw-px-3 tw-text-sm tw-font-medium tw-text-slate-500',
            'tw-rounded-r-md',
          )}
        >
          {unit}
        </span>
      ) : null}
    </Space.Compact>
  );
}
