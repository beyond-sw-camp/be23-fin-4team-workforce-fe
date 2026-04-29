import type {EvaluationGroup} from '@/features/evaluation/model/types';

/** 백엔드 SeasonActivationService: DOWNWARD 매핑이 Lead로 고정됩니다(없으면 직속 상사 조회 → 실패 시 422). */
export function hasExplicitDownwardLead(
  maps: EvaluationGroup['evaluatorMaps'] | undefined,
  targetMemberId: string,
): boolean {
  return (maps ?? []).some(
    (m) =>
      m.targetMemberId === targetMemberId &&
      m.evaluationType === 'DOWNWARD' &&
      Boolean(m.evaluatorId) &&
      m.evaluatorId !== targetMemberId,
  );
}

/**
 * 시즌 활성화 버튼 비활성 조건을 백엔드와 맞춥니다.
 * - 그룹·대상·유형별 매핑 완료
 * - 각 피평가자마다 Lead용 DOWNWARD(상급자) 행이 명시적으로 있어야 함
 */
export function computeSeasonActivationReadiness(groups: EvaluationGroup[]): {ready: boolean; reason: string} {
  if (!groups.length) {
    return {ready: false, reason: '그룹이 없어 시즌을 시작할 수 없습니다.'};
  }
  for (const g of groups) {
    const targets = g.targetMemberIds ?? [];
    const evalTypes = g.evaluationTypes ?? [];
    const maps = g.evaluatorMaps ?? [];
    if (!targets.length) {
      return {ready: false, reason: `그룹 '${g.name}'에 대상 인원이 없습니다.`};
    }
    if (!evalTypes.length) {
      return {ready: false, reason: `그룹 '${g.name}'에 평가 유형이 없습니다.`};
    }
    const missingEvaluatorRow = targets.some((tid) =>
      evalTypes.some((et) =>
        !maps.some(
          (m) =>
            m.targetMemberId === tid &&
            m.evaluationType === et &&
            m.evaluatorId &&
            (et === 'SELF' ? m.evaluatorId === tid : m.evaluatorId !== tid),
        ),
      ),
    );
    if (missingEvaluatorRow) {
      return {ready: false, reason: `그룹 '${g.name}'의 평가자 지정이 완료되지 않았습니다.`};
    }
    const missingLead = targets.some((tid) => !hasExplicitDownwardLead(maps, tid));
    if (missingLead) {
      return {
        ready: false,
        reason: `그룹 '${g.name}': 모든 피평가자에게 Lead(상급자·DOWNWARD) 평가자를 지정해야 활성화할 수 있습니다. 아래 「평가자」에서 상급자 행을 추가하세요.`,
      };
    }
  }
  return {ready: true, reason: ''};
}
