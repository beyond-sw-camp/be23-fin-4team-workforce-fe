// 직원 사용 계획 회신 모달
// 캘린더 다중 선택 후 제출 LeaveRequest 자동 생성 X 잔여 차감 없음
import { useEffect, useMemo, useState } from 'react';
import { Alert, DatePicker, Space, Tag, Typography } from 'antd';
import { AppDoubleActionModal } from '@/shared/ui/AppDoubleActionModal';
import dayjs, { type Dayjs } from 'dayjs';
import type { LeavePromotionMy } from '@/features/salary-service/types';

type Props = {
  target: LeavePromotionMy | null;
  confirmLoading?: boolean;
  onCancel: () => void;
  onSubmit: (datesIso: string[]) => void;
};

export function PromotionResponseModal({
  target,
  confirmLoading,
  onCancel,
  onSubmit,
}: Props) {
  const [picked, setPicked] = useState<Dayjs[]>([]);

  useEffect(() => {
    setPicked([]);
  }, [target?.promotionLogId]);

  const expirationDayjs = useMemo(
    () =>
      target?.balanceExpirationDate
        ? dayjs(target.balanceExpirationDate)
        : null,
    [target?.balanceExpirationDate],
  );

  const remaining = target?.remainingDays ?? 0;
  const overLimit = picked.length > remaining;

  const submit = () => {
    if (!target) return;
    if (picked.length === 0) return;
    onSubmit(picked.map((d) => d.format('YYYY-MM-DD')));
  };

  return (
    <AppDoubleActionModal
      open={target !== null}
      title="연차 사용 계획 회신"
      confirmText="회신하기"
      cancelText="취소"
      confirmDisabled={picked.length === 0 || overLimit}
      confirmLoading={confirmLoading}
      onClose={onCancel}
      onConfirm={submit}
      destroyOnHidden
      width={520}
    >
      {target ? (
        <Space direction="vertical" className="tw-w-full tw-px-5 tw-py-4" size="middle">
          <div className="tw-rounded-md tw-bg-slate-50 tw-p-3 tw-text-sm">
            <div>
              <Typography.Text type="secondary">잔여 연차 </Typography.Text>
              <Typography.Text strong>{remaining}일</Typography.Text>
            </div>
            <div>
              <Typography.Text type="secondary">만료일 </Typography.Text>
              <Typography.Text strong>
                {expirationDayjs
                  ? expirationDayjs.format('YYYY-MM-DD')
                  : '—'}
              </Typography.Text>
              {expirationDayjs ? (
                <Tag className="tw-ml-2" color="orange">
                  D-{expirationDayjs.diff(dayjs(), 'day')}
                </Tag>
              ) : null}
            </div>
          </div>

          <Alert
            type="warning"
            showIcon
            message="입력 날짜는 참고용 계획입니다"
            description="실제 휴가 사용은 평소처럼 별도 신청해주세요 회신만으로도 회사 촉진 의무가 완료됩니다"
          />

          <div>
            <Typography.Text strong>사용 예정 날짜</Typography.Text>
            <DatePicker
              multiple
              value={picked}
              onChange={(v) => setPicked(Array.isArray(v) ? v : v ? [v] : [])}
              disabledDate={(d) => d.isBefore(dayjs().startOf('day'))}
              className="tw-mt-2 tw-w-full"
              placeholder="달력에서 날짜 선택"
            />
            {overLimit ? (
              <Typography.Text type="danger" className="tw-text-xs">
                선택 일수가 잔여를 초과합니다 (최대 {remaining}일)
              </Typography.Text>
            ) : (
              <Typography.Text type="secondary" className="tw-text-xs">
                선택 {picked.length} / 잔여 {remaining}일
              </Typography.Text>
            )}
          </div>
        </Space>
      ) : null}
    </AppDoubleActionModal>
  );
}
