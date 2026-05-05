import dayjs from 'dayjs';
import type { FormFieldSchema, FormFieldType } from '@/features/approvals/lib/approvalFormSchema';
import { isContractSendDebugEnabled, logContractSendDebug } from '@/features/contracts/lib/contractSendDebug';

export type ContractFieldMeta = {
  source: string;
  sourceField?: string;
  editable: boolean;
};

export const CONTRACT_FIELD_DEFAULT_SOURCE = 'ADMIN_INPUT';
/** 안내 문구(static_note) — 발송 시 직원 입력 대상에서 제외 */
export const CONTRACT_FIELD_STATIC_BLOCK_SOURCE = 'STATIC_BLOCK';

/** formSchema의 source 문자열을 비교 가능한 형태로 통일 (대소문자·공백·하이픈). */
export function normalizeContractFieldSource(raw: string | undefined | null): string {
  return String(raw ?? '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');
}

export function isContractAdminInputSource(source: string | undefined | null): boolean {
  const n = normalizeContractFieldSource(source);
  return n === 'ADMIN_INPUT' || n === 'ADMININPUT';
}

/**
 * Ant Design Form에서 `pathPrefix + ['adminInput', key]` 값만 스키마 key 기준으로 모읍니다.
 * `getFieldsValue(true)`가 중첩 adminInput을 비우는 경우가 있어 필드별 getFieldValue를 사용합니다.
 */
export function collectContractAdminInputFromForm(
  getFieldValue: (namePath: (string | number)[]) => unknown,
  fieldKeys: string[],
  pathPrefix: (string | number)[] = [],
): Record<string, unknown> {
  const rawByKey: Record<string, unknown> = {};
  for (const key of fieldKeys) {
    rawByKey[key] = getFieldValue([...pathPrefix, 'adminInput', key]);
  }
  const out: Record<string, unknown> = {};
  for (const key of fieldKeys) {
    const v = rawByKey[key];
    if (v === undefined || v === null) continue;
    if (typeof v === 'string' && v.trim() === '') continue;
    const normalized = normalizeAdminScalarForApi(v);
    if (normalized === undefined || normalized === null) continue;
    if (typeof normalized === 'string' && normalized.trim() === '') continue;
    out[key] = normalized;
  }
  if (isContractSendDebugEnabled()) {
    logContractSendDebug('collectContractAdminInputFromForm', {
      pathPrefix: pathPrefix.length ? pathPrefix.join('.') : '(root)',
      adminKeys: fieldKeys,
      rawGetFieldValue: rawByKey,
      normalizedAdminInput: out,
    });
  }
  return out;
}

/** 백엔드가 `type: "text"`로 둔 날짜 필드를 달력 입력으로 쓰기 위한 휴리스틱 */
function coerceContractFieldTypeToDateIfLikely(name: string, label: string, type: FormFieldType): FormFieldType {
  if (type !== 'text') return type;
  const key = name.toLowerCase();
  const labelNorm = label.replace(/\s+/g, '');
  const nameLooksDate = /date|일자|적용|시작|종료|기간/.test(key);
  const labelLooksDate = /적용일|시작일|종료일|계약일|시작|종료|기간|날짜/.test(labelNorm);
  if (nameLooksDate || labelLooksDate) return 'date';
  return type;
}

/** 재발송 등에서 문자열 날짜를 DatePicker용 dayjs로 바꿉니다. */
export function coerceAdminInputInitialForForm(
  admin: Record<string, unknown>,
  fieldDefs: FormFieldSchema[],
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...admin };
  for (const f of fieldDefs) {
    if (f.type !== 'date' && f.type !== 'datetime-local') continue;
    const v = next[f.name];
    if (v == null) continue;
    if (isDayjsLike(v)) continue;
    if (typeof v === 'string' && v.trim()) {
      const raw = v.trim();
      const datePart = raw.split(/[T ]/)[0] ?? raw;
      const d = dayjs(f.type === 'datetime-local' ? raw.replace(' ', 'T') : datePart);
      if (d.isValid()) next[f.name] = d;
    }
  }
  return next;
}

function isDayjsLike(value: unknown): value is {
  isValid: () => boolean;
  format: (f: string) => string;
  hour?: () => number;
  minute?: () => number;
  second?: () => number;
} {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof (value as { isValid?: unknown }).isValid === 'function' &&
    typeof (value as { format?: unknown }).format === 'function'
  );
}

/** API·JSON 직렬화에 맞게 문자열 날짜·콤마 숫자·Dayjs 등을 정리합니다. */
export function normalizeAdminScalarForApi(value: unknown): unknown {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'boolean') return value;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return undefined;
    return dayjs(value).format('YYYY-MM-DD');
  }
  if (isDayjsLike(value)) {
    if (!value.isValid()) return undefined;
    const hour = value.hour?.() ?? 0;
    const minute = value.minute?.() ?? 0;
    const second = value.second?.() ?? 0;
    if (hour === 0 && minute === 0 && second === 0) return value.format('YYYY-MM-DD');
    return value.format('YYYY-MM-DD HH:mm');
  }
  if (typeof value === 'string') {
    const t = value.trim();
    if (!t) return undefined;
    const dateLike = t.match(/^(\d{4})[./](\d{1,2})[./](\d{1,2})$/);
    if (dateLike) {
      const y = dateLike[1];
      const mo = dateLike[2]!.padStart(2, '0');
      const d = dateLike[3]!.padStart(2, '0');
      return `${y}-${mo}-${d}`;
    }
    const numericClean = t.replace(/,/g, '').trim();
    if (/^\d+$/.test(numericClean)) {
      const n = Number(numericClean);
      if (Number.isFinite(n)) return n;
    }
    return t;
  }
  return value;
}

/** 계약 템플릿 formSchema(JSON)를 파싱해 발송·재발송 폼에 사용합니다. */
export function parseContractFormSchema(raw: string): {
  fields: FormFieldSchema[];
  metaByName: Record<string, ContractFieldMeta>;
  formDescription?: string;
} {
  try {
    const parsed = JSON.parse(raw) as { fields?: unknown; formDescription?: unknown };
    const items = Array.isArray(parsed.fields) ? parsed.fields : [];
    const fields: FormFieldSchema[] = [];
    const metaByName: Record<string, ContractFieldMeta> = {};
    for (const item of items) {
      if (!item || typeof item !== 'object') continue;
      const o = item as Record<string, unknown>;
      const name = String(o.key ?? o.name ?? '').trim();
      const label = String(o.label ?? '').trim();
      let type = String(o.type ?? 'text').trim() as FormFieldType;
      const staticTextRaw = typeof o.staticText === 'string' ? o.staticText.trim() : '';
      if (!name) continue;
      if (type === 'static_note') {
        if (!label && !staticTextRaw) continue;
        fields.push({
          name,
          label: label || '안내',
          type: 'static_note',
          ...(staticTextRaw ? { staticText: staticTextRaw } : {}),
        });
        metaByName[name] = {
          source: normalizeContractFieldSource(CONTRACT_FIELD_STATIC_BLOCK_SOURCE),
          editable: false,
        };
        continue;
      }
      if (!label) continue;
      type = coerceContractFieldTypeToDateIfLikely(name, label, type);
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
        source: normalizeContractFieldSource(
          typeof o.source === 'string' && o.source.trim() !== ''
            ? o.source
            : CONTRACT_FIELD_DEFAULT_SOURCE,
        ),
        sourceField: typeof o.sourceField === 'string' && o.sourceField.trim() ? o.sourceField.trim() : undefined,
        editable: o.editable === true,
      };
    }
    const fd = parsed.formDescription;
    const formDescription = typeof fd === 'string' && fd.trim() ? fd.trim() : undefined;
    return { fields, metaByName, ...(formDescription ? { formDescription } : {}) };
  } catch {
    return { fields: [], metaByName: {} };
  }
}

/** 발송·재발송 시 ADMIN_INPUT을 API 요청 본문 객체로 만듭니다. 비어 있으면 undefined. */
export function compactAdminInputObject(
  adminInput: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  const entries: [string, unknown][] = [];
  for (const [k, value] of Object.entries(adminInput ?? {})) {
    if (value == null) continue;
    if (typeof value === 'string' && value.trim() === '') continue;
    const n = normalizeAdminScalarForApi(value);
    if (n === undefined || n === null) continue;
    if (typeof n === 'string' && n.trim() === '') continue;
    entries.push([k, n]);
  }
  const normalized = Object.fromEntries(entries);
  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

/** 로그·디버그용 JSON 문자열. API에는 `compactAdminInputObject` 결과를 그대로 보냅니다. */
export function compactAdminInputJson(adminInput: Record<string, unknown> | undefined): string | undefined {
  const o = compactAdminInputObject(adminInput);
  return o !== undefined ? JSON.stringify(o) : undefined;
}
