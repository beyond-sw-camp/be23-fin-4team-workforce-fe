// 직원 사용 계획 회신 모달
// - 캘린더 다중 선택 (주말/만료일 이후/회사 공휴일/이미 신청한 휴가일 자동 차단)
// - 선택 날짜는 Tag 리스트로 정렬 노출, 개별 X 로 제거 가능
// - 회신은 사용 계획 기록만, LeaveRequest 자동 생성 X / 잔여 차감 없음
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, DatePicker, Modal, Space, Tag, Typography } from 'antd';
import { CloseOutlined } from '@ant-design/icons';
import dayjs, { type Dayjs } from 'dayjs';
import type { LeavePromotionMy } from '@/features/salary-service/types';
import { attendanceApi } from '@/features/salary-service/api/attendanceApi';

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
  const [calendarOpen, setCalendarOpen] = useState(false);

  useEffect(() => {
    setPicked([]);
    setCalendarOpen(false);
  }, [target?.promotionLogId]);

  // 회사 공휴일 (법정공휴일 포함하여 회사가 등록한 휴일 마스터)
  const holidaysQ = useQuery({
    queryKey: ['attendance', 'company-holidays'],
    queryFn: () => attendanceApi.companyHoliday.list(),
    enabled: target !== null,
    staleTime: 5 * 60_000,
  });

  // 내 휴가 신청 이력 (이미 신청한 날짜 차단용)
  const myLeavesQ = useQuery({
    queryKey: ['salary', 'leave-requests', 'my', 'for-promotion'],
    queryFn: () => attendanceApi.leaveRequest.listMyHistory({ page: 0, size: 200 }),
    enabled: target !== null,
    staleTime: 60_000,
  });

  // 차단 날짜 Set (YYYY-MM-DD)
  const blockedSet = useMemo(() => {
    const s = new Set<string>();
    (holidaysQ.data ?? []).forEach((h) => {
      const d = (h as unknown as { holidayDate?: string }).holidayDate;
      if (d) s.add(d);
    });
    (myLeavesQ.data?.content ?? []).forEach((r) => {
      // 휴가 시작~종료 범위 모두 차단 (반려/취소 제외)
      const status = (r as unknown as { approvalStatus?: string }).approvalStatus ?? '';
      if (status === 'REJECTED' || status === 'CANCELED' || status === 'CANCELLED') return;
      const start = (r as unknown as { startDate?: string }).startDate;
      const end = (r as unknown as { endDate?: string }).endDate ?? start;
      if (!start) return;
      let cur = dayjs(start);
      const last = dayjs(end);
      while (!cur.isAfter(last, 'day')) {
        s.add(cur.format('YYYY-MM-DD'));
        cur = cur.add(1, 'day');
      }
    });
    return s;
  }, [holidaysQ.data, myLeavesQ.data]);

  const expirationDayjs = useMemo(
    () =>
      target?.balanceExpirationDate
        ? dayjs(target.balanceExpirationDate)
        : null,
    [target?.balanceExpirationDate],
  );

  const remaining = target?.remainingDays ?? 0;
  const overLimit = picked.length > remaining;

  // 선택 불가 조건: 과거 / 만료일 이후 / 주말 / 회사 공휴일 / 기존 신청 휴가
  const disabledDate = (d: Dayjs): boolean => {
    if (d.isBefore(dayjs().startOf('day'))) return true;
    if (expirationDayjs && d.isAfter(expirationDayjs, 'day')) return true;
    const dow = d.day();
    if (dow === 0 || dow === 6) return true; // 주말
    if (blockedSet.has(d.format('YYYY-MM-DD'))) return true;
    return false;
  };

  // 선택 후 정렬 + 중복 제거
  const sortedPicked = useMemo(
    () => [...picked].sort((a, b) => a.valueOf() - b.valueOf()),
    [picked],
  );

  const removeOne = (iso: string) => {
    setPicked((prev) => prev.filter((d) => d.format('YYYY-MM-DD') !== iso));
  };

  const submit = () => {
    if (!target) return;
    if (picked.length === 0) return;
    onSubmit(sortedPicked.map((d) => d.format('YYYY-MM-DD')));
  };

  return (
    <Modal
      open={target !== null}
      title="연차 사용 계획 회신"
      okText="회신하기"
      cancelText="취소"
      okButtonProps={{ disabled: picked.length === 0 || overLimit }}
      confirmLoading={confirmLoading}
      onCancel={onCancel}
      onOk={submit}
      destroyOnHidden
      width={560}
    >
      {target ? (
        <Space direction="vertical" className="tw-w-full" size="middle">
          {/* 잔여/만료 요약 */}
          <div className="tw-rounded-md tw-bg-slate-50 tw-p-3 tw-text-sm tw-flex tw-flex-wrap tw-items-center tw-gap-x-4 tw-gap-y-1">
            <div>
              <Typography.Text type="secondary">잔여 연차 </Typography.Text>
              <Typography.Text strong>{remaining}일</Typography.Text>
            </div>
            <div>
              <Typography.Text type="secondary">만료일 </Typography.Text>
              <Typography.Text strong>
                {expirationDayjs ? expirationDayjs.format('YYYY-MM-DD') : '—'}
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
            description="실제 휴가는 평소처럼 별도 신청해주세요. 회신만으로도 회사 촉진 의무가 완료됩니다. 주말·공휴일·기존 휴가일은 자동 제외됩니다."
          />

          {/* 날짜 선택 */}
          <div>
            <Typography.Text strong>사용 예정 날짜</Typography.Text>
            <DatePicker
              multiple
              value={picked}
              onChange={(v) => setPicked(Array.isArray(v) ? v : v ? [v] : [])}
              disabledDate={disabledDate}
              className="tw-mt-2 tw-w-full"
              placeholder="달력에서 평일 날짜 선택"
              format="YYYY-MM-DD"
              open={calendarOpen}
              onOpenChange={setCalendarOpen}
              renderExtraFooter={() => (
                <div className="tw-flex tw-justify-between tw-items-center tw-py-1">
                  <Typography.Text type="secondary" className="!tw-text-xs">
                    선택 {picked.length}일 / 잔여 {remaining}일
                  </Typography.Text>
                  <Button size="small" type="primary" onClick={() => setCalendarOpen(false)}>
                    확인
                  </Button>
                </div>
              )}
            />
            <Typography.Text type="secondary" className="!tw-text-xs tw-block tw-mt-1">
              차단: 주말 · 회사 공휴일 · 본인 기존 휴가 · 만료일 이후
            </Typography.Text>
          </div>

          {/* 선택 결과 */}
          {sortedPicked.length > 0 && (
            <div className="tw-rounded-md tw-border tw-border-slate-200 tw-p-2.5">
              <div className="tw-flex tw-items-center tw-justify-between tw-mb-2">
                <Typography.Text strong className="!tw-text-sm">
                  선택 {sortedPicked.length}일
                  <span className={`tw-ml-2 tw-text-xs ${overLimit ? 'tw-text-red-500' : 'tw-text-slate-500'}`}>
                    / 잔여 {remaining}일
                  </span>
                </Typography.Text>
                <Button size="small" type="text" danger onClick={() => setPicked([])}>
                  전체 지우기
                </Button>
              </div>
              <Space wrap size={[6, 6]}>
                {sortedPicked.map((d) => {
                  const iso = d.format('YYYY-MM-DD');
                  return (
                    <Tag
                      key={iso}
                      closable
                      closeIcon={<CloseOutlined />}
                      onClose={(e) => {
                        e.preventDefault();
                        removeOne(iso);
                      }}
                      className="!tw-py-1"
                    >
                      {iso} ({['일', '월', '화', '수', '목', '금', '토'][d.day()]})
                    </Tag>
                  );
                })}
              </Space>
              {overLimit && (
                <Typography.Text type="danger" className="!tw-text-xs tw-block tw-mt-1">
                  선택 일수가 잔여를 초과합니다 (최대 {remaining}일)
                </Typography.Text>
              )}
            </div>
          )}
        </Space>
      ) : null}
    </Modal>
  );
}
