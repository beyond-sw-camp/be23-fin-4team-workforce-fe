import { findApprovalFormFieldByLabel, parseFormSchema } from '@/features/approvals/lib/approvalFormSchema';

/**
 * 결재 작성 시 양식을 고른 직후 `content` 초기값. 제목 필드에는 문서명(표시용)만 넣는다.
 */
export function composeContentPatchWithDefaultTitle(
  formSchema: string,
  documentDisplayName: string,
): Record<string, unknown> {
  const { fields } = parseFormSchema(formSchema);
  const titleField = fields.find((f) => f.name === 'title') ?? findApprovalFormFieldByLabel(fields, '제목');
  if (!titleField) return {};
  const name = documentDisplayName.trim();
  return { [titleField.name]: name };
}
