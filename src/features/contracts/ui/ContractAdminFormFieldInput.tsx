import { DatePicker, Input, InputNumber } from 'antd';
import dayjs from 'dayjs';
import { useMemo } from 'react';
import type { FormFieldSchema } from '@/features/approvals/lib/approvalFormSchema';
import { isContractMoneyLikeNumberField } from '@/features/contracts/lib/contractMoneyLikeField';

export type ContractAdminFormFieldInputProps = {
  field: FormFieldSchema;
  /** Input.TextArea rows */
  textAreaRows?: number;
};

/** 연봉계약 등 템플릿에서 `type: "text"` 로 둔 적용일 칸 — 달력 선택 지원 */
function isEffectiveDateTextField(field: FormFieldSchema): boolean {
  if (field.type !== 'text') return false;
  return field.label.replace(/\s+/g, '') === '적용일';
}

type PickerBoundProps = {
  value?: dayjs.Dayjs | string | null;
  onChange?: (v: dayjs.Dayjs | null) => void;
};

function ContractAdminDatePickerBound({ value, onChange }: PickerBoundProps) {
  const innerValue = useMemo(() => {
    if (value == null || value === '') return undefined;
    if (dayjs.isDayjs(value)) return value;
    if (typeof value === 'string') {
      const d = dayjs(value.trim());
      return d.isValid() ? d : undefined;
    }
    return undefined;
  }, [value]);

  return (
    <DatePicker
      className="tw-w-full"
      format="YYYY-MM-DD"
      value={innerValue}
      onChange={(d) => onChange?.(d ?? null)}
    />
  );
}

function ContractAdminDateTimePickerBound({ value, onChange }: PickerBoundProps) {
  const innerValue = useMemo(() => {
    if (value == null || value === '') return undefined;
    if (dayjs.isDayjs(value)) return value;
    if (typeof value === 'string') {
      const d = dayjs(value.trim());
      return d.isValid() ? d : undefined;
    }
    return undefined;
  }, [value]);

  return (
    <DatePicker
      showTime
      className="tw-w-full"
      format="YYYY-MM-DD HH:mm"
      value={innerValue}
      onChange={(d) => onChange?.(d ?? null)}
    />
  );
}

export function ContractAdminFormFieldInput({ field, textAreaRows = 3 }: ContractAdminFormFieldInputProps) {
  if (field.type === 'textarea') {
    return <Input.TextArea rows={textAreaRows} />;
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
      />
    );
  }
  if (field.type === 'number') {
    return <Input type="number" />;
  }
  if (field.type === 'datetime-local') {
    return <ContractAdminDateTimePickerBound />;
  }
  if (field.type === 'date' || isEffectiveDateTextField(field)) {
    return <ContractAdminDatePickerBound />;
  }
  return <Input />;
}
