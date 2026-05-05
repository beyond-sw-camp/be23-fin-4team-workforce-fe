import { DatePicker, Input, InputNumber } from 'antd';
import type { FormFieldSchema } from '@/features/approvals/lib/approvalFormSchema';
import { isContractMoneyLikeNumberField } from '@/features/contracts/lib/contractMoneyLikeField';

export type ContractAdminFormFieldInputProps = {
  field: FormFieldSchema;
  /** Input.TextArea rows */
  textAreaRows?: number;
} & Record<string, unknown>;

export function ContractAdminFormFieldInput({ field, textAreaRows = 3, ...rest }: ContractAdminFormFieldInputProps) {
  if (field.type === 'textarea') {
    return <Input.TextArea rows={textAreaRows} {...rest} />;
  }
  if (field.type === 'number' && isContractMoneyLikeNumberField(field)) {
    return (
      <InputNumber
        className="tw-w-full"
        controls={false}
        min={0}
        precision={0}
        formatter={(v) => {
          if (v === undefined || v === null || v === '') return '';
          const parts = String(v).split('.');
          const intPart = parts[0]!.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
          return parts[1] !== undefined ? `${intPart}.${parts[1]}` : intPart;
        }}
        parser={(display) => {
          const cleaned = (display ?? '').replace(/,/g, '').trim();
          if (cleaned === '') return null as unknown as number;
          const n = Number(cleaned);
          return Number.isFinite(n) ? n : (null as unknown as number);
        }}
        {...rest}
      />
    );
  }
  if (field.type === 'number') {
    return <Input type="number" {...rest} />;
  }
  if (field.type === 'date') {
    return <DatePicker className="tw-w-full" format="YYYY-MM-DD" allowClear {...rest} />;
  }
  if (field.type === 'datetime-local') {
    return <DatePicker showTime className="tw-w-full" format="YYYY-MM-DD HH:mm" allowClear {...rest} />;
  }
  return <Input {...rest} />;
}
