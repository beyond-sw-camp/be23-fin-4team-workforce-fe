import { Button, Form } from 'antd';
import type { ReactNode } from 'react';
import type { MembersSearch } from '@/features/members/model/types';
import { membersCtaButtonClass } from '@/features/members/ui/membersCtaButtonClass';
import { AppSearchField } from '@/shared/ui/AppSearchField';

type Props = {
  initialKeyword?: string;
  onSearch: (next: Partial<MembersSearch>) => void;
  /** 검색·검색 버튼 우측 (예: 직원 계정 생성) */
  trailing?: ReactNode;
};

export function MemberSearchForm({ initialKeyword, onSearch, trailing }: Props) {
  return (
    <div className="tw-flex tw-w-full tw-flex-col tw-gap-2 md:tw-flex-row md:tw-items-center md:tw-gap-3">
      <Form
        layout="inline"
        className="tw-flex tw-min-w-0 tw-flex-1 tw-flex-wrap tw-items-center tw-gap-2 [&_.ant-form-item]:!tw-mb-0 [&_.ant-form-item]:!tw-mr-0"
        initialValues={{ keyword: initialKeyword }}
        onFinish={(values: { keyword?: string }) => onSearch({ keyword: values.keyword, page: 1 })}
      >
        <Form.Item name="keyword" className="!tw-mb-0 !tw-mr-0 tw-min-w-0 tw-flex-1 md:tw-max-w-3xl">
          <AppSearchField allowClear placeholder="이름·이메일·부서로 검색" aria-label="구성원 검색" />
        </Form.Item>
        <Form.Item className="!tw-mb-0">
          <Button type="primary" htmlType="submit" className={membersCtaButtonClass}>
            검색
          </Button>
        </Form.Item>
      </Form>
      {trailing ? <div className="tw-flex tw-shrink-0 tw-items-center md:tw-ml-auto">{trailing}</div> : null}
    </div>
  );
}
