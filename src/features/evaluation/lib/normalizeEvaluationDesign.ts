import type { DesignQuestion, EvaluationDesign, QuestionType } from '@/features/evaluation/model/types';

function normalizeQuestionType(raw: unknown): QuestionType {
  const u = String(raw ?? 'scale').toUpperCase();
  if (u === 'TEXT') return 'text';
  if (u === 'SCALE') return 'scale';
  if (u === 'GRADE') return 'grade';
  if (u === 'GAP') return 'gap';
  return 'scale';
}

/** 저장 JSON(`text`, `SCALE` 등)을 작성 화면 타입과 맞춤 */
export function normalizeEvaluationDesign(design: EvaluationDesign): EvaluationDesign {
  return {
    ...design,
    sections: (design.sections ?? []).map((sec, si) => ({
      ...sec,
      questions: (sec.questions ?? []).map((q, qi) => {
        const legacy = q as DesignQuestion & { text?: string };
        return {
          id: legacy.id && String(legacy.id).length > 0 ? legacy.id : `s${si}-q${qi}`,
          type: normalizeQuestionType(legacy.type),
          title: legacy.title?.trim() ? legacy.title : (legacy.text ?? '').trim() || '(문항)',
          description: legacy.description,
          required: legacy.required !== false,
          weight: typeof legacy.weight === 'number' ? legacy.weight : 0,
          options: legacy.options,
        };
      }),
    })),
  };
}
