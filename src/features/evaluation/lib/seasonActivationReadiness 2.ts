import type { EvaluationGroup } from '@/features/evaluation/model/types';

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

export function computeSeasonActivationReadiness(groups: EvaluationGroup[]): { ready: boolean; reason: string } {
  if (!groups.length) {
    return { ready: false, reason: '그룹이 없어 시즌을 시작할 수 없습니다.' };
  }
  for (const g of groups) {
    const targets = g.targetMemberIds ?? [];
    const evalTypes = g.evaluationTypes ?? [];
    const maps = g.evaluatorMaps ?? [];
    if (!targets.length) {
      return { ready: false, reason: `그룹 '${g.name}'에 평가 대상자가 없습니다.` };
    }
    if (!evalTypes.length) {
      return { ready: false, reason: `그룹 '${g.name}'에 평가 유형이 없습니다.` };
    }
    const missingEvaluatorRow = targets.some((tid) =>
      evalTypes.some(
        (et) =>
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
      return { ready: false, reason: `그룹 '${g.name}'의 평가자 지정이 완료되지 않았습니다.` };
    }
    const missingLead = targets.some((tid) => !hasExplicitDownwardLead(maps, tid));
    if (missingLead) {
      return {
        ready: false,
        reason: `그룹 '${g.name}': 모든 평가 대상자에게 최종 검토자(상급자 평가자)를 지정해야 시즌을 활성화할 수 있습니다.`,
      };
    }
  }
  return { ready: true, reason: '' };
}
