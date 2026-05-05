import { useEffect, useState, type ReactNode } from 'react';
import type { MembersSearch } from '@/features/members/model/types';
import { AppSearchBar } from '@/shared/ui/AppSearchBar';

type Props = {
  initialKeyword?: string;
  onSearch: (next: Partial<MembersSearch>) => void;
  /** 검색·검색 버튼 우측 (예: 직원 계정 생성) */
  trailing?: ReactNode;
};

export function MemberSearchForm({ initialKeyword, onSearch, trailing }: Props) {
  const [keyword, setKeyword] = useState(initialKeyword ?? '');

  useEffect(() => {
    setKeyword(initialKeyword ?? '');
  }, [initialKeyword]);

  return (
    <div className="tw-flex tw-w-full tw-flex-col tw-gap-2 md:tw-flex-row md:tw-items-center md:tw-gap-3">
      <AppSearchBar
        value={keyword}
        onValueChange={setKeyword}
        onSearch={(nextKeyword) => onSearch({ keyword: nextKeyword || undefined, page: 1 })}
        placeholder="이름·이메일·부서로 검색"
        ariaLabel="구성원 검색"
        className="md:tw-max-w-3xl"
      />
      {trailing ? <div className="tw-flex tw-shrink-0 tw-items-center md:tw-ml-auto">{trailing}</div> : null}
    </div>
  );
}
