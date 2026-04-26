import { Button, Input } from 'antd';

type Props = {
  value: string;
  onChange: (next: string) => void;
  onCancel: () => void;
  onSave: () => void;
  loading: boolean;
};

/**
 * 메시지 인라인 편집 폼.
 * 저장 버튼은 antd Button(primary) — 분해 전 동작 보존.
 */
export function ChatEditingBody({ value, onChange, onCancel, onSave, loading }: Props) {
  return (
    <div className="tw-flex tw-w-full tw-flex-col tw-gap-2">
      <Input.TextArea
        value={value}
        rows={3}
        onChange={(e) => onChange(e.target.value)}
        className="!tw-text-sm"
        autoFocus
      />
      <div className="tw-flex tw-justify-end tw-gap-2">
        <button
          type="button"
          className="tw-rounded-md tw-px-2 tw-py-1 tw-text-xs tw-text-slate-500 hover:tw-bg-slate-100"
          onClick={onCancel}
        >
          취소
        </button>
        <Button
          type="primary"
          size="small"
          loading={loading}
          disabled={!value.trim()}
          className="!tw-rounded-lg"
          onClick={onSave}
        >
          저장
        </Button>
      </div>
    </div>
  );
}
