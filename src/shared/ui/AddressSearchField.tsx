import { Input, Space } from 'antd';
import { useState } from 'react';
import { SearchOutlined } from '@ant-design/icons';
import { openDaumPostcode } from '@/shared/integrations/address/daumPostcode';
import { AppButton } from '@/shared/ui/AppButton';

type Props = {
  value?: string;
  onChange?: (address: string) => void;
  placeholder?: string;
};

export function AddressSearchField({ value, onChange, placeholder }: Props) {
  const [loading, setLoading] = useState(false);

  const onSearchAddress = async () => {
    setLoading(true);
    try {
      const result = await openDaumPostcode();
      const buildingName = result.buildingName ? ` (${result.buildingName})` : '';
      onChange?.(`${result.address}${buildingName}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Space.Compact className="tw-w-full">
      <Input
        value={value}
        onChange={(event) => onChange?.(event.target.value)}
        placeholder={placeholder ?? '주소를 검색해 주세요.'}
      />
      <AppButton icon={<SearchOutlined />} loading={loading} onClick={() => void onSearchAddress()}>
        검색
      </AppButton>
    </Space.Compact>
  );
}
