import { useMemo } from 'react';
import { App, Card, Space } from 'antd';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { evaluationRedesignApi } from '../api/evaluationRedesignApi';
import type { EvaluationCalibration, EvaluationFlowResponse } from '../model/workflowTypes';
import { calcFinalScore } from '../lib/scoreCalculator';
import { AppDoubleActionModal } from '@/shared/ui/AppDoubleActionModal';

type Props = {
  open: boolean;
  onClose: () => void;
  response: EvaluationFlowResponse;
  leadCalibration: EvaluationCalibration | null;
};

export function ConfirmModal({ open, onClose, response, leadCalibration }: Props) {
  const { message, modal } = App.useApp();
  const queryClient = useQueryClient();

  const finalScore = useMemo(
    () => calcFinalScore(response.goalSnapshot, leadCalibration?.finalGrades ?? {}),
    [response.goalSnapshot, leadCalibration],
  );

  const confirmMut = useMutation({
    mutationFn: () => evaluationRedesignApi.confirmResponse(response.responseId, {}),
    onSuccess: () => {
      message.success('평가가 확정되었습니다.');
      queryClient.invalidateQueries({ queryKey: ['my-self-evals'] });
      queryClient.invalidateQueries({ queryKey: ['calibrations', response.responseId] });
      queryClient.invalidateQueries({ queryKey: ['my-evaluator-assignments'] });
      queryClient.invalidateQueries({ queryKey: ['my-received-evals'] });
      onClose();
    },
    onError: (error: any) => {
      message.error(error?.response?.data?.message ?? '확정에 실패했습니다.');
    },
  });

  const finalGrades = leadCalibration?.finalGrades ?? {};
  const allFilled = useMemo(() => {
    if (!response.goalSnapshot) return false;
    return response.goalSnapshot.goals.every((goal) => Boolean(finalGrades[goal.goalId]));
  }, [response.goalSnapshot, finalGrades]);

  const handleConfirm = () => {
    modal.confirm({
      title: '이 평가를 최종 확정할까요?',
      content:
        '확정하면 KR별 최종 등급을 기준으로 점수가 계산되고, 전체 등급은 평가 설계 정책에 따라 자동으로 결정됩니다.',
      onOk: () => confirmMut.mutate(),
    });
  };

  return (
    <AppDoubleActionModal
      open={open}
      title="최종 확정"
      onClose={onClose}
      onConfirm={handleConfirm}
      confirmText="확정"
      cancelText="취소"
      width={560}
      destroyOnHidden
      confirmDisabled={!allFilled}
      confirmLoading={confirmMut.isPending}
    >
      <div className="tw-space-y-4 tw-px-5 tw-py-4">
        {!allFilled && (
          <Card
            className="tw-rounded-xl tw-border tw-border-rose-200 tw-bg-rose-50/60"
            styles={{ body: { padding: 12 } }}
          >
            <div className="tw-text-sm tw-text-rose-700">
              모든 KR에 final grade가 입력되어야 확정할 수 있습니다.
            </div>
          </Card>
        )}

        <Card
          className="tw-rounded-2xl tw-border tw-border-indigo-200 tw-bg-indigo-50/40"
          styles={{ body: { padding: 20 } }}
        >
          <div className="tw-flex tw-items-center tw-justify-between">
            <div>
              <div className="tw-text-[10px] tw-font-semibold tw-uppercase tw-tracking-wide tw-text-indigo-500">
                FINAL SCORE PREVIEW
              </div>
              <div className="tw-mt-1 tw-text-[42px] tw-font-bold tw-leading-none tw-text-[#1e3a5f]">
                {finalScore}
              </div>
            </div>
            <div className="tw-max-w-[220px] tw-text-right tw-text-xs tw-leading-5 tw-text-slate-500">
              전체 등급은 확정 시점에 평가 설계의 절대/상대평가 규칙으로 자동 계산됩니다.
            </div>
          </div>
        </Card>

        <div className="tw-rounded-xl tw-bg-slate-50 tw-p-3 tw-text-xs tw-text-slate-500">
          <Space size={6}>
            <span className="tw-font-semibold tw-text-slate-700">참고</span>
            <span>Lead는 KR별 최종 등급만 확정하면 됩니다. 총괄 등급은 별도로 수동 선택하지 않습니다.</span>
          </Space>
        </div>
      </div>
    </AppDoubleActionModal>
  );
}
