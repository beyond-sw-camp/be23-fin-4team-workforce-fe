import { Progress, Typography } from 'antd';
import type { Goal, MeasureType } from '@/features/goals/model/types';

const { Text } = Typography;

function normalizeApiPercent(raw: number): number {
  if (!Number.isFinite(raw)) return raw;
  if (raw > 0 && raw <= 1) return raw * 100;
  return raw;
}

function estimateAchievementPct(goal: Goal): number | null {
  const current = goal.actualValue ?? 0;
  const target = goal.targetValue ?? 0;
  const baseline = goal.baseline ?? 0;
  const measureType = (goal.measureType ?? 'HIGHER_BETTER') as MeasureType;
  const eps = 1e-9;

  switch (measureType) {
    case 'HIGHER_BETTER': {
      const denom = target - baseline;
      if (Math.abs(denom) < eps) return 0;
      return ((current - baseline) / denom) * 100;
    }
    case 'LOWER_BETTER': {
      const denom = baseline - target;
      if (Math.abs(denom) < eps) return 0;
      return ((baseline - current) / denom) * 100;
    }
    case 'TARGET_MATCH': {
      if (Math.abs(target) < eps) return 0;
      return 100 - (Math.abs(current - target) / Math.abs(target)) * 100;
    }
    default:
      return null;
  }
}

/** 막대·툴팁용 달성률(0~cap), 없으면 null */
export function computeGoalProgressPercent(goal: Goal): number | null {
  const target = goal.targetValue ?? 0;
  const current = goal.actualValue ?? 0;
  const serverRaw = goal.achievementPct;
  const cap = goal.capPct != null && Number.isFinite(goal.capPct) ? Number(goal.capPct) : 200;

  const fromServer =
    serverRaw !== undefined && serverRaw !== null && Number.isFinite(Number(serverRaw)) ? Number(serverRaw) : null;
  const normalizedServer = fromServer !== null ? normalizeApiPercent(fromServer) : null;

  const est = estimateAchievementPct(goal);
  const estClamped = est !== null && Number.isFinite(est) ? Math.min(cap, Math.max(0, est)) : null;
  const towardTargetRatio =
    Math.abs(target) >= 1e-9 ? Math.min(cap, Math.max(0, (current / target) * 100)) : null;

  let pctRaw: number | null = null;
  if (normalizedServer != null && normalizedServer > 0) {
    pctRaw = Math.min(cap, normalizedServer);
  } else {
    const fromBaseline = estClamped ?? 0;
    const fromCurrentTarget = towardTargetRatio ?? 0;
    const combined = fromBaseline > 0 ? fromBaseline : fromCurrentTarget;
    pctRaw =
      estClamped === null && towardTargetRatio === null
        ? null
        : combined;
  }

  if (pctRaw === null || Number.isNaN(pctRaw)) return null;
  return Math.max(0, pctRaw);
}

/** 테이블 셀용 전체 진행 UI */
export function goalProgress(goal: Goal) {
  const target = goal.targetValue ?? 0;
  const current = goal.actualValue ?? 0;
  const baseline = goal.baseline ?? 0;
  const pct = computeGoalProgressPercent(goal);

  if (pct === null) {
    return <Text type="secondary">—</Text>;
  }

  const displayPct = pct;
  const barPct = Math.min(100, Math.round(displayPct));

  return (
    <div className="tw-min-w-[120px]">
      <Progress
        percent={barPct}
        size="small"
        status={barPct >= 100 ? 'success' : 'active'}
        format={() => `${Math.round(displayPct)}%`}
      />
      <Text type="secondary" className="tw-text-xs">
        {current} / {target}
        {Math.abs(baseline) >= 1e-9 ? ` · 기준 ${baseline}` : null}
      </Text>
    </div>
  );
}
