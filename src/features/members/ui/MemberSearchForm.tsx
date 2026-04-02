import { Form, Input } from 'antd';
import type { MembersSearch } from '@/features/members/model/types';
import { AppButton } from '@/shared/ui/AppButton';

type Props = {
  initialKeyword?: string;
  onSearch: (next: Partial<MembersSearch>) => void;
};

export function MemberSearchForm({ initialKeyword, onSearch }: Props) {
  return (
    <Form
      layout="inline"
      initialValues={{ keyword: initialKeyword }}
      onFinish={(values: { keyword?: string }) => onSearch({ keyword: values.keyword, page: 1 })}
    >
      <Form.Item name="keyword">
        <Input allowClear placeholder="Search members" />
      </Form.Item>
      <Form.Item>
        <AppButton htmlType="submit" variant="primary">
          Search
        </AppButton>
      </Form.Item>
    </Form>
  );
}
