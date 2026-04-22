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
  value?: string | string[];
  onChange?: (value: string | string[] | undefined) => void;
  placeholder?: string;
  /** 선택 목록에서 제외할 회원 ID (동일인 중복 배정 방지 등) */
  excludeMemberIds?: string[];
  /** 다중 선택 — 승인자 순서 등 */
  multiple?: boolean;
} & Omit<
  SelectProps<string | string[]>,
  | 'value'
  | 'onChange'
  | 'options'
  | 'filterOption'
  | 'showSearch'
  | 'onSearch'
  | 'loading'
  | 'optionLabelProp'
  | 'labelInValue'
  | 'mode'
>;

export const MemberRemoteSelect = forwardRef<RefSelectProps, MemberRemoteSelectProps>(
  function MemberRemoteSelect(
    { value, onChange, placeholder, excludeMemberIds, multiple, getPopupContainer, ...rest },
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
      (
        fetched: { value: string; label: string }[],
        prev: { value: string; label: string }[],
        currentIds: string[],
      ) => {
        const merged = [...fetched];
        for (const id of currentIds) {
          if (!id || merged.some((o) => o.value === id)) continue;
          const keep = prev.find((o) => o.value === id);
          if (keep) merged.unshift(keep);
        }
        return merged;
      },
      [],
    );

    const selectedIds = useMemo(() => {
      if (multiple) {
        const arr = Array.isArray(value) ? value : [];
        return arr.filter(Boolean);
      }
      const s = typeof value === 'string' ? value : '';
      return s ? [s] : [];
    }, [multiple, value]);

    const multiValue = Array.isArray(value) ? value : [];

    const fetchList = useCallback(
      async (keyword: string) => {
        setLoading(true);
        try {
          const res = await membersApi.search({ page: 1, pageSize: 40, keyword: keyword || undefined });
          const next = mapItems(res.items);
          setOptions((prev) => mergeOptions(next, prev, selectedIds));
        } finally {
          setLoading(false);
        }
      },
      [mapItems, mergeOptions, selectedIds],
    );

    useEffect(() => {
      if (selectedIds.length === 0) return;
      let cancelled = false;
      void (async () => {
        for (const id of selectedIds) {
          if (excludeSet.has(id)) continue;
          const detail = await membersApi.detail(id);
          if (cancelled || !detail || excludeSet.has(detail.id)) continue;
          setOptions((prev) => {
            if (prev.some((o) => o.value === id)) return prev;
            return [{ value: detail.id, label: memberOptionLabel(detail) }, ...prev];
          });
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [selectedIds, excludeSet]);

    const onSearch = (text: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => void fetchList(text), 300);
    };

    const onOpenChange = (open: boolean) => {
      if (open) void fetchList('');
    };

    const handleChange: SelectProps<string | string[]>['onChange'] = (v, option) => {
      if (multiple) {
        const ids = (v as string[]) ?? [];
        onChange?.(ids);
        setOptions((prev) => {
          let next = [...prev];
          const opts = option as DefaultOptionType | DefaultOptionType[] | undefined;
          const list = Array.isArray(opts) ? opts : opts ? [opts] : [];
          for (const item of list) {
            if (!item || typeof item !== 'object') continue;
            const id = 'value' in item ? String(item.value) : '';
            const label =
              'label' in item && item.label != null
                ? String(item.label)
                : id
                  ? id
                  : '';
            if (id && !next.some((o) => o.value === id)) {
              next = [{ value: id, label: label || id }, ...next];
            }
          }
          return next;
        });
        return;
      }

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
      <Select<string | string[], { value: string; label: string }>
        {...rest}
        ref={ref}
        mode={multiple ? 'multiple' : undefined}
        showSearch
        filterOption={false}
        value={multiple ? multiValue : (value as string | undefined)}
        onChange={handleChange}
        onSearch={onSearch}
        onOpenChange={onOpenChange}
        notFoundContent={loading ? <Spin size="small" /> : undefined}
        loading={loading}
        options={options}
        placeholder={placeholder}
        allowClear
        maxTagCount={multiple ? 'responsive' : undefined}
        className={rest.className ?? 'tw-w-full'}
        getPopupContainer={
          getPopupContainer ??
          (typeof document !== 'undefined' ? () => document.body : undefined)
        }
        optionLabelProp="label"
      />
    );
  },
);
