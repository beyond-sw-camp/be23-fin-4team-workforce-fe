import { Select, Spin } from 'antd';
import type { SelectProps } from 'antd';
import type { DefaultOptionType } from 'antd/es/select';
import type { RefSelectProps } from 'antd/es/select';
import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { membersApi } from '@/features/members/api/membersApi';
import type { Member } from '@/features/members/model/types';

function memberOptionLabel(m: Member): string {
  const dept = m.department?.trim() ? ` · ${m.department}` : '';
  return `${m.name} (${m.email})${dept}`;
}

export type MemberRemoteSelectProps = {
  value?: string;
  onChange?: (value: string | undefined) => void;
  placeholder?: string;
  /** 선택 목록에서 제외할 회원 ID (동일인 중복 배정 방지 등) */
  excludeMemberIds?: string[];
} & Omit<
  SelectProps<string>,
  | 'value'
  | 'onChange'
  | 'options'
  | 'mode'
  | 'filterOption'
  | 'showSearch'
  | 'onSearch'
  | 'loading'
  | 'optionLabelProp'
  | 'labelInValue'
>;

export const MemberRemoteSelect = forwardRef<RefSelectProps, MemberRemoteSelectProps>(
  function MemberRemoteSelect(
    { value, onChange, placeholder, excludeMemberIds, getPopupContainer, ...rest },
    ref,
  ) {
    const [options, setOptions] = useState<{ value: string; label: string }[]>([]);
    const [loading, setLoading] = useState(false);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const valueRef = useRef(value);
    valueRef.current = value;

    const excludeSet = useMemo(() => new Set((excludeMemberIds ?? []).filter(Boolean)), [excludeMemberIds]);

    const mapItems = useCallback(
      (items: Member[]) =>
        items
          .filter((m) => !excludeSet.has(m.id))
          .map((m) => ({ value: m.id, label: memberOptionLabel(m) })),
      [excludeSet],
    );

    /** 원격 검색으로 옵션이 바뀌어도 현재 선택 값이 목록에서 사라지지 않도록 병합 */
    const mergeOptions = useCallback(
      (fetched: { value: string; label: string }[], prev: { value: string; label: string }[]) => {
        const merged = [...fetched];
        const current = valueRef.current;
        if (current && !merged.some((o) => o.value === current)) {
          const keep = prev.find((o) => o.value === current);
          if (keep) merged.unshift(keep);
        }
        return merged;
      },
      [],
    );

    const fetchList = useCallback(
      async (keyword: string) => {
        setLoading(true);
        try {
          const res = await membersApi.list({ page: 1, pageSize: 40, keyword: keyword || undefined });
          const next = mapItems(res.items);
          setOptions((prev) => mergeOptions(next, prev));
        } finally {
          setLoading(false);
        }
      },
      [mapItems, mergeOptions],
    );

    useEffect(() => {
      if (!value) return;
      let cancelled = false;
      void (async () => {
        const detail = await membersApi.detail(value);
        if (cancelled || !detail || excludeSet.has(detail.id)) return;
        setOptions((prev) => {
          if (prev.some((o) => o.value === value)) return prev;
          return [{ value: detail.id, label: memberOptionLabel(detail) }, ...prev];
        });
      })();
      return () => {
        cancelled = true;
      };
    }, [value, excludeSet]);

    const onSearch = (text: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => void fetchList(text), 300);
    };

    const onOpenChange = (open: boolean) => {
      if (open) void fetchList('');
    };

    const handleChange: SelectProps<string>['onChange'] = (v, option) => {
      onChange?.(v as string | undefined);
      const id = v as string | undefined;
      if (!id) return;
      setOptions((prev) => {
        if (prev.some((o) => o.value === id)) return prev;
        const opt = option as DefaultOptionType | DefaultOptionType[] | undefined;
        const single = Array.isArray(opt) ? opt[0] : opt;
        const label =
          single && typeof single === 'object' && single !== null && 'label' in single
            ? String(single.label)
            : undefined;
        if (label) return [{ value: id, label }, ...prev];
        return prev;
      });
    };

    return (
      <Select<string, { value: string; label: string }>
        {...rest}
        ref={ref}
        showSearch
        filterOption={false}
        value={value ?? undefined}
        onChange={handleChange}
        onSearch={onSearch}
        onOpenChange={onOpenChange}
        notFoundContent={loading ? <Spin size="small" /> : undefined}
        loading={loading}
        options={options}
        placeholder={placeholder}
        allowClear
        className={rest.className ?? 'tw-w-full'}
        getPopupContainer={getPopupContainer ?? ((node) => node.parentElement ?? document.body)}
        optionLabelProp="label"
      />
    );
  },
);
