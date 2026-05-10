import { useMemo, useState } from 'react';
import { Button, Input, Space } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { organizationApi } from '@/features/organization/api/organizationApi';
import { flattenOrganizationsWithMeta } from '@/features/organization/lib/flattenOrganizationTree';
import { OrganizationTreeSelectModal } from '@/features/organization/ui/OrganizationTreeSelectModal';

type Props = {
  value: string;
  onChange: (orgId: string) => void;
  placeholder?: string;
  allowedOrganizationIds?: string[];
  selectedOrganizationName?: string;
};

export function OrganizationPickerInput({
  value,
  onChange,
  placeholder,
  allowedOrganizationIds,
  selectedOrganizationName,
}: Props) {
  const [open, setOpen] = useState(false);

  const { data: tree = [] } = useQuery({
    queryKey: ['organizations', 'list-for-picker'],
    queryFn: () => organizationApi.list(),
    staleTime: 5 * 60_000,
  });

  const rows = useMemo(() => {
    const flattened = flattenOrganizationsWithMeta(tree as any);
    if (!allowedOrganizationIds || allowedOrganizationIds.length === 0) {
      return flattened;
    }
    return flattened.filter((row) => allowedOrganizationIds.includes(row.id));
  }, [allowedOrganizationIds, tree]);

  const selectedName = useMemo(() => {
    if (!value) return '';
    return rows.find((r) => r.id === value)?.name ?? selectedOrganizationName ?? value;
  }, [rows, selectedOrganizationName, value]);

  return (
    <>
      <Space.Compact style={{ width: '100%' }}>
        <Input
          readOnly
          value={selectedName}
          placeholder={placeholder ?? '조직을 선택하세요'}
          onClick={() => setOpen(true)}
          style={{ cursor: 'pointer' }}
        />
        <Button onClick={() => setOpen(true)}>조직 선택</Button>
        {value && (
          <Button onClick={() => onChange('')} danger>
            초기화
          </Button>
        )}
      </Space.Compact>

      <OrganizationTreeSelectModal
        open={open}
        rows={rows}
        selectedOrganizationId={value || undefined}
        onClose={() => setOpen(false)}
        onSelect={(id) => onChange(id)}
      />
    </>
  );
}
