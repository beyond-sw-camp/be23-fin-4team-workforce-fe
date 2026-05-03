/**
 * /app/approvals/correction-request - 근태정정 결재 상신 전용 페이지
 * 직원이 다중 일자 정정을 한번에 결재 상신, 결재선은 자유 선택
 * 백엔드는 documentName="근태정정신청" 양식 + corrections 배열 contentJson 으로 처리
 */
import { ArrowLeftOutlined, DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { App, Button, Card, DatePicker, Input, Space, TimePicker, Typography } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useMemo, useState } from 'react';
import { useAuth } from '@/features/auth/useAuth';
import { approvalApi } from '@/features/approvals/api/approvalApi';
import { approvalRequestApi } from '@/features/approvals/api/approvalRequestApi';
import {
  ApprovalLinePicker,
  type ApprovalLinePickerRow,
} from '@/features/approvals/ui/ApprovalLinePicker';

type CorrectionRow = {
  /** 클라이언트 식별자 */
  id: string;
  date: Dayjs | null;
  clockIn: Dayjs | null;
  clockOut: Dayjs | null;
  reason: string;
};

function makeEmptyRow(seedDate?: string, seedClockIn?: string, seedClockOut?: string): CorrectionRow {
  return {
    id: `row-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    date: seedDate ? dayjs(seedDate) : null,
    clockIn: seedDate && seedClockIn
      ? dayjs(`${seedDate}T${seedClockIn}`)
      : null,
    clockOut: seedDate && seedClockOut
      ? dayjs(`${seedDate}T${seedClockOut}`)
      : null,
    reason: '',
  };
}

export function AttendanceCorrectionRequestPage() {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const { user } = useAuth();
  // MyAttendancePage 에서 prefill 로 넘어오는 search params, 첫 행만 채움
  const search = useSearch({ strict: false }) as {
    date?: string;
    clockIn?: string;
    clockOut?: string;
  };

  const [title, setTitle] = useState<string>('근태 정정 신청');
  const [rows, setRows] = useState<CorrectionRow[]>(() => [
    makeEmptyRow(search.date, search.clockIn, search.clockOut),
  ]);
  const [approvalLines, setApprovalLines] = useState<ApprovalLinePickerRow[]>([]);

  // 활성 양식 중 documentName="근태정정신청" 의 documentId 조회
  const docQ = useQuery({
    queryKey: ['approval', 'documents', 'active', 'correction'],
    queryFn: () => approvalApi.listActiveDocuments(),
  });
  const correctionDoc = useMemo(
    () => (docQ.data ?? []).find((d) => d.documentName === '근태정정신청'),
    [docQ.data],
  );

  const handleAddRow = () => setRows((prev) => [...prev, makeEmptyRow()]);
  const handleRemoveRow = (id: string) => {
    setRows((prev) => (prev.length <= 1 ? prev : prev.filter((r) => r.id !== id)));
  };
  const handleChangeRow = (id: string, patch: Partial<CorrectionRow>) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  // 제출 - corrections 배열 + 결재선을 contentJson 에 직렬화 후 결재 상신
  const submitM = useMutation({
    mutationFn: async () => {
      if (!correctionDoc) throw new Error('근태정정신청 양식이 등록되어 있지 않습니다.');
      if (approvalLines.length === 0) throw new Error('결재선을 1명 이상 지정해 주세요.');

      // 각 row 검증 + 결재용 payload 구조로 변환
      const corrections = rows.map((r, idx) => {
        if (!r.date) throw new Error(`${idx + 1}번째 행의 정정 일자를 입력해 주세요.`);
        if (!r.clockIn && !r.clockOut) {
          throw new Error(`${idx + 1}번째 행의 출근 또는 퇴근 시각을 1개 이상 입력해 주세요.`);
        }
        if (!r.reason.trim()) throw new Error(`${idx + 1}번째 행의 사유를 입력해 주세요.`);
        const dateStr = r.date.format('YYYY-MM-DD');
        const composeIso = (t: Dayjs | null) =>
          t ? `${dateStr}T${t.format('HH:mm:00')}` : null;
        return {
          attendanceDate: dateStr,
          requestedClockIn: composeIso(r.clockIn),
          requestedClockOut: composeIso(r.clockOut),
          reason: r.reason.trim(),
        };
      });

      const contentJson = JSON.stringify({
        title: title.trim() || '근태 정정 신청',
        corrections,
      });

      return approvalRequestApi.createRequest({
        documentId: correctionDoc.documentId,
        contentJson,
        requestStatus: 'WAIT',
        approvalLines: approvalLines.map((l) => ({
          stepOrder: l.stepOrder,
          approverMemberId: l.approverMemberId,
          approverMemberPositionId: l.approverMemberPositionId,
        })),
      });
    },
    onSuccess: () => {
      message.success('정정 결재가 상신되었습니다.');
      void navigate({ to: '/app/attendance' });
    },
    onError: (e: Error) => message.error(e.message || '결재 상신에 실패했습니다.'),
  });

  return (
    <Space direction="vertical" className="tw-w-full" size={16}>
      <div className="tw-flex tw-items-center tw-justify-between">
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={() => void navigate({ to: '/app/attendance' })}>
            뒤로가기
          </Button>
          <Typography.Title level={4} className="!tw-m-0 !tw-text-slate-900">
            근태 정정 결재 상신
          </Typography.Title>
        </Space>
        <Button
          type="primary"
          loading={submitM.isPending}
          disabled={!correctionDoc}
          onClick={() => submitM.mutate()}
        >
          상신
        </Button>
      </div>

      {!docQ.isLoading && !correctionDoc && (
        <Card className="tw-border-rose-200 tw-bg-rose-50">
          <Typography.Text type="danger">
            근태정정신청 양식이 회사에 등록되어 있지 않습니다. 관리자에게 문의해 주세요.
          </Typography.Text>
        </Card>
      )}

      <Card title="제목" size="small" className="tw-border-slate-200/80 tw-shadow-sm">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="결재 제목"
          maxLength={100}
        />
      </Card>

      <Card
        title={
          <div className="tw-flex tw-items-center tw-justify-between">
            <span>정정 항목</span>
            <Button size="small" icon={<PlusOutlined />} onClick={handleAddRow}>
              일자 추가
            </Button>
          </div>
        }
        size="small"
        className="tw-border-slate-200/80 tw-shadow-sm"
      >
        <Space direction="vertical" className="tw-w-full" size={12}>
          {rows.map((row, idx) => (
            <Card
              key={row.id}
              size="small"
              className="tw-border-slate-200/80"
              title={`${idx + 1}번째 정정`}
              extra={
                rows.length > 1 ? (
                  <Button
                    size="small"
                    type="text"
                    danger
                    icon={<DeleteOutlined />}
                    onClick={() => handleRemoveRow(row.id)}
                  />
                ) : null
              }
            >
              <div className="tw-grid tw-grid-cols-1 md:tw-grid-cols-3 tw-gap-3">
                <div>
                  <Typography.Text className="tw-text-xs tw-text-slate-500">정정 일자</Typography.Text>
                  <DatePicker
                    style={{ width: '100%' }}
                    value={row.date}
                    onChange={(d) => handleChangeRow(row.id, { date: d })}
                    disabledDate={(d) => d.isAfter(dayjs(), 'day')}
                    format="YYYY-MM-DD"
                  />
                </div>
                <div>
                  <Typography.Text className="tw-text-xs tw-text-slate-500">정정 출근시각</Typography.Text>
                  <TimePicker
                    style={{ width: '100%' }}
                    value={row.clockIn}
                    onChange={(t) => handleChangeRow(row.id, { clockIn: t })}
                    format="HH:mm"
                    minuteStep={5}
                  />
                </div>
                <div>
                  <Typography.Text className="tw-text-xs tw-text-slate-500">정정 퇴근시각</Typography.Text>
                  <TimePicker
                    style={{ width: '100%' }}
                    value={row.clockOut}
                    onChange={(t) => handleChangeRow(row.id, { clockOut: t })}
                    format="HH:mm"
                    minuteStep={5}
                  />
                </div>
              </div>
              <div className="tw-mt-3">
                <Typography.Text className="tw-text-xs tw-text-slate-500">정정 사유</Typography.Text>
                <Input.TextArea
                  rows={2}
                  value={row.reason}
                  onChange={(e) => handleChangeRow(row.id, { reason: e.target.value })}
                  placeholder="예: 회의 후 외근으로 퇴근 미체크"
                  maxLength={200}
                  showCount
                />
              </div>
            </Card>
          ))}
        </Space>
      </Card>

      <Card title="결재선" size="small" className="tw-border-slate-200/80 tw-shadow-sm">
        <ApprovalLinePicker
          value={approvalLines}
          onChange={setApprovalLines}
          excludeMemberId={user?.memberId ?? undefined}
        />
      </Card>
    </Space>
  );
}
