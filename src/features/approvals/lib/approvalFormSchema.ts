import type { ApprovalRequestDetail } from '@/features/approvals/api/approvalRequestApi';

export const FORM_SCHEMA_FIELD_TYPES = [
  'text',
  'textarea',
  'number',
  'date',
  'select',
  'datetime-local',
  'time',
] as const;

export type FormFieldType = (typeof FORM_SCHEMA_FIELD_TYPES)[number];

export type FormFieldSchema = {
  name: string;
  label: string;
  type: FormFieldType;
  options?: string[];
  placeholder?: string;
  /** true면 양식 수정 API에서 삭제·라벨·타입·순서·잠금 해제 불가 */
  locked?: boolean;
};

export type FormSchema = {
  fields: FormFieldSchema[];
};

export function parseFormSchema(raw: string): FormSchema {
  try {
    const parsed = JSON.parse(raw) as { fields?: unknown };
    const fields = Array.isArray(parsed.fields)
      ? parsed.fields
          .map((item): FormFieldSchema | null => {
            if (!item || typeof item !== 'object') return null;
            const o = item as Record<string, unknown>;
            const name = typeof o.name === 'string' ? o.name.trim() : '';
            const label = typeof o.label === 'string' ? o.label.trim() : '';
            const rawType = typeof o.type === 'string' ? o.type.trim() : 'text';
            const type: FormFieldType = (FORM_SCHEMA_FIELD_TYPES as readonly string[]).includes(rawType)
              ? (rawType as FormFieldType)
              : 'text';
            const options = Array.isArray(o.options)
              ? o.options.filter((v): v is string => typeof v === 'string').map((v) => v.trim())
              : undefined;
            const placeholder = typeof o.placeholder === 'string' ? o.placeholder.trim() : undefined;
            const locked = o.locked === true;
            if (!name || !label) return null;
            return {
              name,
              label,
              type,
              ...(options?.length ? { options } : {}),
              ...(placeholder ? { placeholder } : {}),
              ...(locked ? { locked: true } : {}),
            };
          })
          .filter((f): f is FormFieldSchema => f != null)
      : [];
    return { fields };
  } catch {
    return { fields: [] };
  }
}

export function parseDetailContentJson(detail: ApprovalRequestDetail): Record<string, unknown> {
  const raw = detail.contentJson?.trim();
  if (!raw) return {};
  try {
    const v = JSON.parse(raw) as unknown;
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** 기안 본문의 `title` 필드(양식 기본 '제목') — 없으면 빈 문자열 */
export function getApprovalRequestSubjectLine(detail: ApprovalRequestDetail): string {
  const c = parseDetailContentJson(detail);
  const t = c.title;
  if (typeof t === 'string' && t.trim()) return t.trim();
  return '';
}

export function formatStoredContentValue(value: unknown): string {
  if (value == null) return '—';
  if (typeof value === 'string') return value.trim() || '—';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return '—';
    }
  }
  return String(value);
}
