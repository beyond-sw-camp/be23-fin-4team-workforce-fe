// 관리자 강제 지정 모달 노무수령 거부 절차
// 캘린더 다중 선택 + 사유 입력 LeaveRequest 자동 생성 잔여 즉시 차감
import { useEffect, useMemo, useState } from 'react';
import { Alert, DatePicker, Input, Space, Tag, Typography } from 'antd';
import { AppDoubleActionModal } from '@/shared/ui/AppDoubleActionModal';
import dayjs, { type Dayjs } from 'dayjs';
import type { LeavePromotionNoResponse } from '@/features/salary-service/types';

type Props = {
  target: LeavePromotionNoResponse | null;
  memberName?: string;
  confirmLoading?: boolean;
  onCancel: () => void;
  onSubmit: (datesIso: string[], reason: string) => void;
};

export function LeaveDesignateModal({
  target,
  memberName,
  confirmLoading,
  onCancel,
  onSubmit,
}: Props) {
  const [picked, setPicked] = useState<Dayjs[]>([]);
  const [reason, setReason] = useState('');

  useEffect(() => {
    setPicked([]);
    setReason('');
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
  const reasonInvalid = reason.trim().length === 0;

  const submit = () => {
    if (!target) return;
    if (picked.length === 0 || reasonInvalid) return;
    onSubmit(picked.map((d) => d.format('YYYY-MM-DD')), reason.trim());
  };

  return (
    <Modal
      open={target !== null}
      title="연차 강제 지정 (노무수령 거부)"
      okText="강제 지정"
      okType="danger"
      cancelText="취소"
      okButtonProps={{
        disabled: picked.length === 0 || overLimit || reasonInvalid,
      }}
      confirmLoading={confirmLoading}
      onCancel={onCancel}
      onOk={submit}
      destroyOnHidden
      width={560}
    >
      {target ? (
        <Space direction="vertical" className="tw-w-full" size="middle">
          <Alert
            type="warning"
            showIcon
            message="노무수령 거부 절차 안내"
            description="회사가 직접 연차일을 지정합니다 직원은 그날 출근해도 출근 처리되지 않으며 연차 잔여가 즉시 차감됩니다 신중히 진행해주세요"
          />

          <div className="tw-rounded-md tw-bg-slate-50 tw-p-3 tw-text-sm">
            <div>
              <Typography.Text type="secondary">대상 직원 </Typography.Text>
              <Typography.Text strong>
                {memberName ?? target.memberId.slice(0, 8) + '…'}
              </Typography.Text>
            </div>
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
            <div>
              <Typography.Text type="secondary">2차 통보 후 경과 </Typography.Text>
              <Typography.Text strong>{target.daysSinceSent}일</Typography.Text>
            </div>
          </div>

          <div>
            <Typography.Text strong>지정할 날짜</Typography.Text>
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

          <div>
            <Typography.Text strong>지정 사유 (필수)</Typography.Text>
            <Input.TextArea
              rows={3}
              maxLength={500}
              showCount
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="예 1차 2차 통보에도 회신 없음 노무수령 거부 절차로 강제 지정"
              className="tw-mt-2"
            />
          </div>
        </Space>
      ) : null}
    </Modal>
  );
}
