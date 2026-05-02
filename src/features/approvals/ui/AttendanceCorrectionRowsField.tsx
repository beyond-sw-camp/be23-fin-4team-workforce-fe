/**
 * 근태정정신청 양식 전용 - 다중 일자 정정 행 입력 위젯
 * ApprovalsPage form 렌더링에서 documentName === '근태정정신청' 일 때만 사용 (special case)
 */
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { Button, Card, DatePicker, Input, Space, TimePicker, Typography } from 'antd';
import dayjs from 'dayjs';

export type CorrectionRowValue = {
  id: string;
  /** YYYY-MM-DD */
  attendanceDate: string;
  /** YYYY-MM-DDTHH:mm:ss 또는 빈문자열 */
  requestedClockIn: string;
  requestedClockOut: string;
  reason: string;
};

type Props = {
  value: CorrectionRowValue[];
  onChange: (rows: CorrectionRowValue[]) => void;
};

export function AttendanceCorrectionRowsField({ value, onChange }: Props) {
  const handleAdd = () => {
    onChange([
      ...value,
      {
        id: `row-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        attendanceDate: '',
        requestedClockIn: '',
        requestedClockOut: '',
        reason: '',
      },
    ]);
  };

  const handleRemove = (id: string) => {
    if (value.length <= 1) return;
    onChange(value.filter((r) => r.id !== id));
  };

  const handleChange = (id: string, patch: Partial<CorrectionRowValue>) => {
    onChange(value.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  return (
    <Space direction="vertical" className="tw-w-full" size={12}>
      {value.map((row, idx) => {
        const dateObj = row.attendanceDate ? dayjs(row.attendanceDate) : null;
        const inObj = row.requestedClockIn ? dayjs(row.requestedClockIn) : null;
        const outObj = row.requestedClockOut ? dayjs(row.requestedClockOut) : null;
        return (
          <Card
            key={row.id}
            size="small"
            className="!tw-border-slate-200/80"
            title={`${idx + 1}번째 정정`}
            extra={
              value.length > 1 ? (
                <Button
                  size="small"
                  type="text"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={() => handleRemove(row.id)}
                />
              ) : null
            }
          >
            <div className="tw-grid tw-grid-cols-1 md:tw-grid-cols-3 tw-gap-3">
              <div>
                <Typography.Text className="tw-text-xs tw-text-slate-500">정정 일자</Typography.Text>
                <DatePicker
                  style={{ width: '100%' }}
                  value={dateObj}
                  format="YYYY-MM-DD"
                  disabledDate={(d) => d.isAfter(dayjs(), 'day')}
                  onChange={(d) => {
                    const dateStr = d ? d.format('YYYY-MM-DD') : '';
                    // 일자 바뀌면 출/퇴근 시각의 일자도 함께 갱신
                    const inIso = inObj && dateStr
                      ? `${dateStr}T${inObj.format('HH:mm:ss')}`
                      : '';
                    const outIso = outObj && dateStr
                      ? `${dateStr}T${outObj.format('HH:mm:ss')}`
                      : '';
                    handleChange(row.id, {
                      attendanceDate: dateStr,
                      requestedClockIn: inIso,
                      requestedClockOut: outIso,
                    });
                  }}
                />
              </div>
              <div>
                <Typography.Text className="tw-text-xs tw-text-slate-500">정정 출근시각</Typography.Text>
                <TimePicker
                  style={{ width: '100%' }}
                  value={inObj}
                  format="HH:mm"
                  minuteStep={5}
                  onChange={(t) => {
                    const iso = t && row.attendanceDate
                      ? `${row.attendanceDate}T${t.format('HH:mm:00')}`
                      : '';
                    handleChange(row.id, { requestedClockIn: iso });
                  }}
                />
              </div>
              <div>
                <Typography.Text className="tw-text-xs tw-text-slate-500">정정 퇴근시각</Typography.Text>
                <TimePicker
                  style={{ width: '100%' }}
                  value={outObj}
                  format="HH:mm"
                  minuteStep={5}
                  onChange={(t) => {
                    const iso = t && row.attendanceDate
                      ? `${row.attendanceDate}T${t.format('HH:mm:00')}`
                      : '';
                    handleChange(row.id, { requestedClockOut: iso });
                  }}
                />
              </div>
            </div>
            <div className="tw-mt-3">
              <Typography.Text className="tw-text-xs tw-text-slate-500">정정 사유</Typography.Text>
              <Input.TextArea
                rows={2}
                value={row.reason}
                onChange={(e) => handleChange(row.id, { reason: e.target.value })}
                placeholder="예: 회의 후 외근으로 퇴근 미체크"
                maxLength={200}
                showCount
              />
            </div>
          </Card>
        );
      })}

      <Button icon={<PlusOutlined />} onClick={handleAdd}>
        일자 추가
      </Button>
    </Space>
  );
}
