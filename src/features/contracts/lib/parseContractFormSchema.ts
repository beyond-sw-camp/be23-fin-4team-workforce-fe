import type { FormFieldSchema, FormFieldType } from '@/features/approvals/lib/approvalFormSchema';

export type ContractFieldMeta = {
  source: string;
  sourceField?: string;
  editable: boolean;
};

export const CONTRACT_FIELD_DEFAULT_SOURCE = 'ADMIN_INPUT';

/** 계약 템플릿 formSchema(JSON)를 파싱해 발송·재발송 폼에 사용합니다. */
export function parseContractFormSchema(raw: string): {
  fields: FormFieldSchema[];
  metaByName: Record<string, ContractFieldMeta>;
} {
  try {
    const parsed = JSON.parse(raw) as { fields?: unknown };
    const items = Array.isArray(parsed.fields) ? parsed.fields : [];
    const fields: FormFieldSchema[] = [];
    const metaByName: Record<string, ContractFieldMeta> = {};
    for (const item of items) {
      if (!item || typeof item !== 'object') continue;
      const o = item as Record<string, unknown>;
      const name = String(o.key ?? o.name ?? '').trim();
      const label = String(o.label ?? '').trim();
      const type = String(o.type ?? 'text').trim() as FormFieldType;
      if (!name || !label) continue;
      const options = Array.isArray(o.options)
        ? o.options.filter((v): v is string => typeof v === 'string').map((v) => v.trim()).filter(Boolean)
        : undefined;
      fields.push({
        name,
        label,
        type,
        ...(options?.length ? { options } : {}),
      });
      metaByName[name] = {
        source: String(o.source ?? CONTRACT_FIELD_DEFAULT_SOURCE).trim() || CONTRACT_FIELD_DEFAULT_SOURCE,
        sourceField: typeof o.sourceField === 'string' && o.sourceField.trim() ? o.sourceField.trim() : undefined,
        editable: o.editable === true,
      };
    }
    return { fields, metaByName };
  } catch {
    return { fields: [], metaByName: {} };
  }
}

/** 발송·재발송 시 ADMIN_INPUT 객체를 API용 JSON 문자열로 만듭니다. 비어 있으면 undefined. */
export function compactAdminInputJson(adminInput: Record<string, unknown> | undefined): string | undefined {
  const normalized = Object.fromEntries(
    Object.entries(adminInput ?? {}).filter(([, value]) => {
      if (value == null) return false;
      if (typeof value === 'string') return value.trim() !== '';
      return true;
    }),
  );
  return Object.keys(normalized).length > 0 ? JSON.stringify(normalized) : undefined;
}
