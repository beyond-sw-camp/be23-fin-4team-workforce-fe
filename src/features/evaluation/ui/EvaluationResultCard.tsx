import { Card, Tag } from 'antd';
import type { EvaluationFlowResponse } from '../model/workflowTypes';

const GRADE_COLOR = { S: 'gold', A: 'cyan', B: 'blue', C: 'default' } as const;

const STAGE_LABEL: Partial<Record<EvaluationFlowResponse['stage'], string>> = {
  SELF_PENDING: '자기평가 진행',
  SELF_SUBMITTED: '자기평가 완료',
  CALIBRATION_OPEN: '등급 조정',
  CALIBRATION_LOCKED: '확정 대기',
  CONFIRMED: '확정 완료',
  SKIPPED_LEAVER: '평가 제외',
};

type Props = {
  response: EvaluationFlowResponse;
  onClick?: () => void;
};

export function EvaluationResultCard({ response, onClick }: Props) {
  return (
    <Card
      hoverable={!!onClick}
      onClick={onClick}
      className="tw-rounded-2xl tw-border tw-border-slate-200/90 tw-shadow-sm tw-shadow-slate-900/5"
      styles={{ body: { padding: 20 } }}
    >
      <div className="tw-flex tw-items-start tw-justify-between tw-gap-4">
        <div className="tw-flex-1 tw-min-w-0">
          <div className="tw-flex tw-items-center tw-gap-2 tw-mb-3 tw-flex-wrap">
            <Tag
              color="processing"
              className="!tw-m-0 !tw-rounded-full !tw-px-2.5 !tw-py-0.5 !tw-text-[11px] !tw-font-semibold"
            >
              {STAGE_LABEL[response.stage] ?? response.stage}
            </Tag>
            {response.confirmedAt && (
              <span className="tw-text-xs tw-text-slate-400">
                확정 {new Date(response.confirmedAt).toLocaleDateString('ko-KR')}
              </span>
            )}
            {response.selfEvalEmpty && (
              <Tag
                color="orange"
                className="!tw-m-0 !tw-rounded-full !tw-px-2.5 !tw-py-0.5 !tw-text-[11px] !tw-font-medium"
              >
                자기평가 미제출
              </Tag>
            )}
          </div>

          <div className="tw-grid tw-grid-cols-2 tw-gap-x-6 tw-gap-y-2">
            <Cell label="최종 점수">
              <span className="tw-text-xl tw-font-bold tw-text-[#1e3a5f]">
                {response.finalScoreSnapshot != null
                  ? response.finalScoreSnapshot.toFixed(2)
                  : '-'}
              </span>
            </Cell>
            <Cell label="목표 수">
              <span className="tw-text-sm tw-text-slate-700">
                {response.goalSnapshot?.goals?.length ?? 0}개
              </span>
            </Cell>
            <Cell label="자기평가">
              {response.submittedAt ? (
                <span className="tw-text-xs tw-text-slate-500">
                  {new Date(response.submittedAt).toLocaleString('ko-KR')}
                </span>
              ) : (
                <span className="tw-text-xs tw-text-slate-400">준비중</span>
              )}
            </Cell>
          </div>
          {response.confirmedGrade && (
            <div className="tw-mt-4 tw-rounded-xl tw-bg-slate-50 tw-px-3 tw-py-2 tw-text-xs tw-text-slate-500">
              최종 등급은 Lead가 확정한 KR별 등급을 바탕으로 평가 설계 정책에 따라 자동 산정됩니다.
            </div>
          )}
        </div>

        {response.confirmedGrade && (
          <div className="tw-shrink-0">
            <Tag
              color={GRADE_COLOR[response.confirmedGrade as keyof typeof GRADE_COLOR] ?? 'default'}
              className="!tw-m-0 !tw-rounded-2xl !tw-px-5 !tw-py-2 !tw-text-2xl !tw-font-bold"
            >
              {response.confirmedGrade}
            </Tag>
          </div>
        )}
      </div>
    </Card>
  );
}

function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="tw-text-[11px] tw-font-semibold tw-uppercase tw-tracking-wide tw-text-slate-400">
        {label}
      </div>
      <div className="tw-mt-0.5">{children}</div>
    </div>
  );
}
