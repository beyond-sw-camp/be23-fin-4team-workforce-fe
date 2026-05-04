import type { ApprovalRequestDetail, OfficialRecipient } from '@/features/approvals/api/approvalRequestApi';

export const FORM_SCHEMA_FIELD_TYPES = [
  'text',
  'textarea',
  'number',
  'date',
  'select',
  'datetime-local',
  'time',
  'hidden',
  /** 회의록 등: 녹음 후 STT·요약, contentJson에는 포함하지 않음 */
  'ai_transcribe',
] as const;

export type FormFieldType = (typeof FORM_SCHEMA_FIELD_TYPES)[number];

/** `type: "ai_transcribe"` 필드의 `config` */
export type AiTranscribeFieldConfig = {
  fillTranscript: string;
  fillSummary: string;
  attachAudio?: boolean;
  language?: string;
};

/** select 필드의 options 를 동적으로 로드하는 소스 식별자 (`companyOrganization` 은 회사 조직도 기준 다중 선택) */
export type FormFieldSource = 'companyLeaveType' | 'companyOrganization' | string;

export type FormFieldSchema = {
  name: string;
  label: string;
  type: FormFieldType;
  options?: string[];
  /** source 가 지정되면 options 대신 런타임에 API 로 옵션 로드. 예: "companyLeaveType" */
  source?: FormFieldSource;
  placeholder?: string;
  /** true면 양식 수정 API에서 삭제·라벨·타입·순서·잠금 해제 불가 */
  locked?: boolean;
  /** `ai_transcribe` 전용 */
  config?: AiTranscribeFieldConfig;
};

export type FormSchema = {
  fields: FormFieldSchema[];
};

/**
 * 결재 생성 시 pre-action으로 contentJson에 주입되는 엔티티 ID 필드명.
 * `ApprovalsPage`의 `PRE_ACTION_CONFIGS[].entityIdField`와 동기화할 것.
 */
export const APPROVAL_PRE_ACTION_ENTITY_ID_FIELD_NAMES = [
  'leaveRequestId',
  'overtimeRequestId',
  'memberAllowanceId',
  'selectionId',
  'leaveOfAbsenceId',
] as const;

/** 양식 선택 모달 등 기안지 미리보기에서 노출하지 않을 필드 */
export function shouldHideApprovalFormFieldInSelectModalPreview(field: FormFieldSchema): boolean {
  if (field.type === 'hidden') return true;
  if ((APPROVAL_PRE_ACTION_ENTITY_ID_FIELD_NAMES as readonly string[]).includes(field.name)) return true;
  const compact = field.label.replace(/\s+/g, '').toLowerCase();
  if (compact.includes('salary') && compact.includes('연결')) return true;
  return false;
}

/** 연차신청서 등 휴가 양식: 휴가종류 select와 경조사 구분 필드 연동 시 라벨 기준 */
export const APPROVAL_VACATION_LEAVE_KIND_FIELD_LABEL = '휴가종류';
export const APPROVAL_FAMILY_EVENT_SUBTYPE_FIELD_LABEL = '경조사 구분';
export const APPROVAL_FAMILY_EVENT_LEAVE_KIND_OPTION = '경조사';

export function findApprovalFormFieldByLabel(
  fields: FormFieldSchema[],
  label: string,
): FormFieldSchema | undefined {
  const normalize = (v: string) => v.trim().replace(/\s+/g, '').toUpperCase();
  const target = normalize(label);
  return fields.find((f) => normalize(f.label) === target);
}

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
            const source = typeof o.source === 'string' && o.source.trim() ? o.source.trim() : undefined;
            const placeholder = typeof o.placeholder === 'string' ? o.placeholder.trim() : undefined;
            const locked = o.locked === true;
            if (!name || !label) return null;
            let config: AiTranscribeFieldConfig | undefined;
            if (type === 'ai_transcribe' && o.config && typeof o.config === 'object') {
              const c = o.config as Record<string, unknown>;
              const fillTranscript =
                typeof c.fillTranscript === 'string' ? c.fillTranscript.trim() : '';
              const fillSummary = typeof c.fillSummary === 'string' ? c.fillSummary.trim() : '';
              const lang = typeof c.language === 'string' ? c.language.trim() : undefined;
              if (fillTranscript && fillSummary) {
                config = {
                  fillTranscript,
                  fillSummary,
                  attachAudio: c.attachAudio === true,
                  ...(lang ? { language: lang } : {}),
                };
              }
            }
            return {
              name,
              label,
              type,
              ...(options?.length ? { options } : {}),
              ...(source ? { source } : {}),
              ...(placeholder ? { placeholder } : {}),
              ...(locked ? { locked: true } : {}),
              ...(config ? { config } : {}),
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

/** 일반기안 등 본문에 넣는 조직 선택 스냅샷 — `contentJson` 최상위 키 */
export const APPROVAL_CONTENT_ORG_RECIPIENTS_KEY = 'organizationRecipients';

export function extractOrganizationRecipientsFromContent(content: Record<string, unknown>): OfficialRecipient[] {
  const raw = content[APPROVAL_CONTENT_ORG_RECIPIENTS_KEY];
  if (!Array.isArray(raw)) return [];
  const out: OfficialRecipient[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const o = item as Record<string, unknown>;
    const id = String(o.recipientOrganizationId ?? o.recipient_organization_id ?? '').trim();
    const name = String(o.recipientOrganizationName ?? o.recipient_organization_name ?? '').trim();
    if (id) out.push({ recipientOrganizationId: id, recipientOrganizationName: name || id });
  }
  return out;
}

export function omitOrganizationRecipientsFromContent(content: Record<string, unknown>): void {
  delete content[APPROVAL_CONTENT_ORG_RECIPIENTS_KEY];
}

/** 기안 본문의 `title` 필드(양식 기본 '제목') — 없으면 빈 문자열 */
export function getApprovalRequestSubjectLine(detail: ApprovalRequestDetail): string {
  const c = parseDetailContentJson(detail);
  const t = c.title;
  if (typeof t === 'string' && t.trim()) return t.trim();
  return '';
}

/** 제출용 contentJson에서 위젯 전용 필드 제거 (서버는 audio 등을 기대하지 않음) */
export function stripNonPersistedApprovalContentFields(
  content: Record<string, unknown>,
  fields: FormFieldSchema[],
): void {
  for (const f of fields) {
    if (f.type === 'ai_transcribe') {
      delete content[f.name];
    }
  }
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
