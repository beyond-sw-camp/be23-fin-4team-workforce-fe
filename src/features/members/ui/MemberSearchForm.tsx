import { Button, Form, Input } from 'antd';
import type { MembersSearch } from '@/features/members/model/types';
import { membersCtaButtonClass } from '@/features/members/ui/membersCtaButtonClass';

type Props = {
  initialKeyword?: string;
  onSearch: (next: Partial<MembersSearch>) => void;
};

export function MemberSearchForm({ initialKeyword, onSearch }: Props) {
  return (
    <Form
      layout="inline"
      className="tw-flex tw-flex-wrap tw-items-center tw-gap-3"
      initialValues={{ keyword: initialKeyword }}
      onFinish={(values: { keyword?: string }) => onSearch({ keyword: values.keyword, page: 1 })}
    >
      <Form.Item name="keyword" className="!tw-mb-0 tw-min-w-0 tw-flex-1 [@media(min-width:480px)]:tw-max-w-sm">
        <Input allowClear placeholder="이름·이메일·부서로 검색" />
      </Form.Item>
      <Form.Item className="!tw-mb-0">
        <Button type="primary" htmlType="submit" className={membersCtaButtonClass}>
          검색
        </Button>
      </Form.Item>
    </Form>
  );
}
