import { SearchOutlined } from '@ant-design/icons';
import { Input } from 'antd';
import type { InputRef } from 'antd';
import { forwardRef } from 'react';
import { twMerge } from 'tailwind-merge';

/**
 * 앱 셸 헤더 검색과 동일한 pill · slate-100 톤.
 * `AppShellLayout` 헤더 `Input`에도 그대로 쓰려면 이 문자열을 import 하세요.
 */
export const appSearchFieldShellClassName =
  'tw-h-11 tw-w-full tw-rounded-full !tw-border-0 !tw-bg-slate-100 tw-px-3 tw-shadow-none tw-min-w-0 ' +
  'hover:!tw-bg-slate-100 focus-within:!tw-bg-slate-100 ' +
  '[&_.ant-input-affix-wrapper]:!tw-border-0 [&_.ant-input-affix-wrapper]:!tw-shadow-none [&_.ant-input-affix-wrapper-focused]:!tw-shadow-none ' +
  '[&_.ant-input]:!tw-bg-transparent [&_.ant-input]:!tw-text-slate-800 [&_.ant-input]:tw-placeholder:text-slate-400';

export type AppSearchFieldProps = Omit<React.ComponentProps<typeof Input>, 'variant' | 'size'>;

/**
 * 헤더와 같은 borderless pill 검색 입력 (`Input.Search` 아님 — 그룹/버튼으로 인한 깨짐 방지)
 */
export const AppSearchField = forwardRef<InputRef, AppSearchFieldProps>(function AppSearchField(
  { className, allowClear = true, prefix, ...props },
  ref,
) {
  return (
    <Input
      ref={ref}
      variant="borderless"
      size="large"
      allowClear={allowClear}
      prefix={prefix ?? <SearchOutlined className="tw-text-[15px] tw-text-slate-400" />}
      className={twMerge(appSearchFieldShellClassName, className)}
      {...props}
    />
  );
});
