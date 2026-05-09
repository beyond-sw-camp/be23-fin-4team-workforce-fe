import type { Answer, DesignSection } from '@/features/evaluation/model/types';

/**
 * 설계의 문항 `id` 기준으로 `answers[]` 를 Record 로 맞춘다.
 * 1) `questionId` 가 설계 id 와 일치하면 그대로 사용
 * 2) 남는 답변은 설계 문항 **평면 순서**대로 소비 (구 설계·id 누락·중복 id 호환)
 *
 * 백엔드 `SectionScorer` 는 `answersJson` 의 `questionId` 를 설계 `DesignQuestion.id` 와 매칭하므로
 * 프론트도 동일 키를 써야 한다.
 */
export function alignAnswersWithDesign(
  sections: DesignSection[],
  responseAnswers: Answer[],
): Record<string, Answer> {
  const flatQuestions = sections.flatMap((s) => s.questions ?? []);
  const pool = [...(responseAnswers ?? [])];
  const out: Record<string, Answer> = {};

  for (const q of flatQuestions) {
    const ix = pool.findIndex((a) => a.questionId === q.id);
    if (ix >= 0) {
      const [hit] = pool.splice(ix, 1);
      out[q.id] = { ...hit, questionId: q.id };
    }
  }

  for (const q of flatQuestions) {
    if (out[q.id]) continue;
    const next = pool.shift();
    out[q.id] = next ? { ...next, questionId: q.id } : { questionId: q.id };
  }

  return out;
}
