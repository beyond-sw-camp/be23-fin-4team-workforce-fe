import { Button } from 'antd';
import { useEffect, useState } from 'react';
import { twMerge } from 'tailwind-merge';
import { AppSearchField } from '@/shared/ui/AppSearchField';

const appSearchButtonClassName =
  '!tw-h-10 !tw-min-h-10 !tw-shrink-0 !tw-rounded-xl !tw-border-0 !tw-bg-[#1e3a5f] !tw-px-5 !tw-font-semibold !tw-shadow-none ' +
  'hover:!tw-bg-[#152a45] disabled:!tw-cursor-not-allowed disabled:!tw-border disabled:!tw-border-slate-200 ' +
  'disabled:!tw-bg-slate-100 disabled:!tw-text-slate-500 disabled:!tw-opacity-100 disabled:!tw-shadow-none ' +
  'disabled:hover:!tw-bg-slate-100 disabled:hover:!tw-text-slate-500';

type AppSearchBarProps = {
  value?: string;
  defaultValue?: string;
  placeholder?: string;
  ariaLabel?: string;
  buttonText?: string;
  className?: string;
  inputClassName?: string;
  buttonClassName?: string;
  onValueChange?: (value: string) => void;
  onSearch?: (value: string) => void;
};

export function AppSearchBar({
  value,
  defaultValue = '',
  placeholder = '검색',
  ariaLabel = '검색',
  buttonText = '검색',
  className,
  inputClassName,
  buttonClassName,
  onValueChange,
  onSearch,
}: AppSearchBarProps) {
  const controlled = value != null;
  const [innerValue, setInnerValue] = useState(value ?? defaultValue);
  const currentValue = controlled ? value : innerValue;

  useEffect(() => {
    if (controlled) return;
    setInnerValue(defaultValue);
  }, [controlled, defaultValue]);

  const setNextValue = (next: string) => {
    if (!controlled) setInnerValue(next);
    onValueChange?.(next);
  };

  const submitSearch = () => {
    onSearch?.(currentValue.trim());
  };

  return (
    <div
      className={twMerge('tw-flex tw-min-w-0 tw-flex-1 tw-items-center tw-gap-2', className)}
    >
      <AppSearchField
        allowClear
        value={currentValue}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className={twMerge('tw-min-w-0 tw-flex-1', inputClassName)}
        onChange={(event) => setNextValue(event.target.value)}
        onPressEnter={submitSearch}
      />
      <Button type="primary" htmlType="button" className={twMerge(appSearchButtonClassName, buttonClassName)} onClick={submitSearch}>
        {buttonText}
      </Button>
    </div>
  );
}
