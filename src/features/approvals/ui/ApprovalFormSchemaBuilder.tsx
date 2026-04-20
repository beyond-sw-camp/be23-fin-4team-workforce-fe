import { DeleteOutlined, DownOutlined, MinusCircleOutlined, UpOutlined } from '@ant-design/icons';
import { Button, Input, Select, Space, Switch, Table, Tag, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useMemo } from 'react';
import {
  FORM_SCHEMA_FIELD_TYPES,
  type FormFieldSchema,
  type FormFieldType,
} from '@/features/approvals/lib/approvalFormSchema';

const TYPE_LABEL: Record<FormFieldType, string> = {
  text: '한 줄 텍스트',
  textarea: '여러 줄',
  number: '숫자',
  date: '날짜',
  'datetime-local': '날짜·시간',
  time: '시간',
  select: '선택(드롭다운)',
};

const TYPE_OPTIONS = FORM_SCHEMA_FIELD_TYPES.map((t) => ({
  value: t,
  label: TYPE_LABEL[t],
}));

export type ApprovalFormSchemaBuilderProps = {
  value: FormFieldSchema[];
  onChange: (next: FormFieldSchema[]) => void;
  /** true면 `locked: true` 행은 편집·삭제·순서 이동 불가 (양식 수정 화면) */
  respectFieldLocks?: boolean;
};

function SelectOptionsEditor({
  options,
  onChange,
  disabled,
}: {
  options: string[] | undefined;
  onChange: (next: string[]) => void;
  disabled?: boolean;
}) {
  const rows = options?.length ? [...options] : [''];

  const setRow = (index: number, text: string) => {
    const next = [...rows];
    next[index] = text;
    onChange(next);
  };

  const addRow = () => {
    onChange([...rows, '']);
  };

  const removeRow = (index: number) => {
    if (rows.length <= 1) {
      onChange(['']);
      return;
    }
    onChange(rows.filter((_, i) => i !== index));
  };

  return (
    <div className="tw-flex tw-min-w-[168px] tw-max-w-[240px] tw-flex-col tw-gap-1">
      {rows.map((opt, oi) => (
        <Space.Compact key={oi} className="tw-w-full">
          <Input
            size="small"
            value={opt}
            disabled={disabled}
            placeholder={`선택지 ${oi + 1}`}
            onChange={(e) => setRow(oi, e.target.value)}
            onPressEnter={(e) => e.preventDefault()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.stopPropagation();
              }
            }}
          />
          <Button
            type="default"
            size="small"
            icon={<MinusCircleOutlined />}
            disabled={disabled}
            aria-label="이 항목 삭제"
            onClick={() => removeRow(oi)}
          />
        </Space.Compact>
      ))}
      <Button type="dashed" size="small" className="tw-text-xs" disabled={disabled} onClick={addRow}>
        선택지 줄 추가
      </Button>
    </div>
  );
}

export function ApprovalFormSchemaBuilder({
  value,
  onChange,
  respectFieldLocks = false,
}: ApprovalFormSchemaBuilderProps) {
  const rows = useMemo(
    () =>
      value.map((field, index) => ({
        key: `${field.name}-${index}`,
        index,
        field,
      })),
    [value],
  );

  const updateAt = (index: number, patch: Partial<FormFieldSchema>) => {
    const next = value.map((f, i) => {
      if (i !== index) return f;
      let u: FormFieldSchema = { ...f, ...patch };
      if (patch.type != null && patch.type !== 'select') {
        const rest = { ...u } as FormFieldSchema & { options?: string[] };
        delete rest.options;
        u = rest as FormFieldSchema;
      } else if (patch.type === 'select') {
        u = {
          ...u,
          options: u.options?.length ? u.options : [''],
        };
      }
      if (Object.prototype.hasOwnProperty.call(patch, 'locked')) {
        if (patch.locked === true) {
          u = { ...u, locked: true };
        } else {
          const rest = { ...u } as FormFieldSchema & { locked?: boolean };
          delete rest.locked;
          u = rest as FormFieldSchema;
        }
      }
      return u;
    });
    onChange(next);
  };

  const removeAt = (index: number) => {
    if (respectFieldLocks && value[index]?.locked) return;
    onChange(value.filter((_, i) => i !== index));
  };

  const move = (index: number, dir: -1 | 1) => {
    const j = index + dir;
    if (j < 0 || j >= value.length) return;
    if (respectFieldLocks) {
      const a = value[index];
      const b = value[j];
      if (a?.locked || b?.locked) return;
    }
    const copy = [...value];
    const t = copy[index];
    const u = copy[j];
    if (t === undefined || u === undefined) return;
    copy[index] = u;
    copy[j] = t;
    onChange(copy);
  };

  const addField = () => {
    const n = value.length + 1;
    onChange([
      ...value,
      {
        name: `field_${n}`,
        label: '',
        type: 'text',
        placeholder: '',
      },
    ]);
  };

  const rowLocked = (field: FormFieldSchema) => respectFieldLocks && field.locked === true;

  const columns: ColumnsType<(typeof rows)[number]> = [
    {
      title: '순서',
      key: 'order',
      width: 88,
      render: (_, record) => {
        const locked = rowLocked(record.field);
        const upOff =
          record.index === 0 ||
          locked ||
          (respectFieldLocks && value[record.index - 1]?.locked === true);
        const downOff =
          record.index >= value.length - 1 ||
          locked ||
          (respectFieldLocks && value[record.index + 1]?.locked === true);
        return (
          <Space size={0} direction="vertical" className="tw-w-full">
            <Button
              type="text"
              size="small"
              icon={<UpOutlined />}
              disabled={upOff}
              onClick={() => move(record.index, -1)}
              aria-label="위로"
            />
            <Button
              type="text"
              size="small"
              icon={<DownOutlined />}
              disabled={downOff}
              onClick={() => move(record.index, 1)}
              aria-label="아래로"
            />
          </Space>
        );
      },
    },
    {
      title: '필드 코드',
      key: 'name',
      width: 140,
      render: (_, record) => {
        const locked = rowLocked(record.field);
        return (
          <Space size={4} wrap className="tw-w-full">
            {locked ? (
              <Tag color="blue" className="!tw-m-0">
                잠금
              </Tag>
            ) : null}
            <Input
              value={record.field.name}
              disabled={locked}
              placeholder="예: title"
              onChange={(e) => updateAt(record.index, { name: e.target.value })}
              className="tw-min-w-0 tw-flex-1 tw-font-mono tw-text-sm"
            />
          </Space>
        );
      },
    },
    {
      title: '항목 이름(라벨)',
      key: 'label',
      width: 160,
      render: (_, record) => (
        <Input
          value={record.field.label}
          disabled={rowLocked(record.field)}
          placeholder="예: 제목"
          onChange={(e) => updateAt(record.index, { label: e.target.value })}
        />
      ),
    },
    {
      title: '입력 형식',
      key: 'type',
      width: 150,
      render: (_, record) => (
        <Select
          className="tw-w-full"
          value={record.field.type}
          disabled={rowLocked(record.field)}
          options={TYPE_OPTIONS}
          onChange={(t) => updateAt(record.index, { type: t as FormFieldType })}
        />
      ),
    },
    {
      title: '안내 문구(선택)',
      key: 'placeholder',
      width: 160,
      render: (_, record) => (
        <Input
          value={record.field.placeholder ?? ''}
          disabled={rowLocked(record.field)}
          placeholder="placeholder"
          onChange={(e) => updateAt(record.index, { placeholder: e.target.value || undefined })}
        />
      ),
    },
    {
      title: (
        <Tooltip title="켜면 이후 양식 수정 시 이 항목의 삭제·이름·형식·순서 변경이 제한됩니다.">
          <span>수정 제한(잠금)</span>
        </Tooltip>
      ),
      key: 'locked',
      width: 112,
      render: (_, record) => {
        const lockedRow = rowLocked(record.field);
        return (
          <Tooltip title="잠금: 이후 양식 수정에서 삭제·변경 불가. 잠금된 행은 여기서 끌 수 없습니다.">
            <Switch
              size="small"
              checked={record.field.locked === true}
              disabled={lockedRow}
              onChange={(checked) => updateAt(record.index, { locked: checked ? true : false })}
            />
          </Tooltip>
        );
      },
    },
    {
      title: '드롭다운 목록',
      key: 'options',
      width: 240,
      render: (_, record) =>
        record.field.type === 'select' ? (
          <SelectOptionsEditor
            options={record.field.options}
            disabled={rowLocked(record.field)}
            onChange={(opts) => updateAt(record.index, { options: opts })}
          />
        ) : (
          <Typography.Text type="secondary" className="tw-text-xs">
            —
          </Typography.Text>
        ),
    },
    {
      title: '',
      key: 'actions',
      width: 48,
      render: (_, record) =>
        rowLocked(record.field) ? null : (
          <Button
            type="text"
            danger
            size="small"
            icon={<DeleteOutlined />}
            onClick={() => removeAt(record.index)}
            aria-label="삭제"
          />
        ),
    },
  ];

  return (
    <div className="tw-space-y-3">
      <Typography.Paragraph type="secondary" className="!tw-mb-0 !tw-text-xs">
        기안서에 표시될 입력 항목을 추가합니다. 필드 코드는 저장 키로 쓰이므로 영문·숫자·밑줄(_)을 권장합니다. 입력 형식이
        「선택(드롭다운)」이면 오른쪽에서 줄마다 한 칸씩 선택지를 적고, 「선택지 줄 추가」로 칸을 늘리면 됩니다.
        {respectFieldLocks ? (
          <>
            {' '}
            <Tag color="blue" className="!tw-m-0">
              잠금
            </Tag>
            표시된 행은 서버에서 고정된 필드로, 삭제·이름·형식·순서를 바꿀 수 없습니다.
          </>
        ) : null}
      </Typography.Paragraph>
      <Table
        size="small"
        pagination={false}
        scroll={{ x: 1080 }}
        rowKey="key"
        dataSource={rows}
        columns={columns}
        locale={{ emptyText: '필드를 추가해 주세요.' }}
      />
      <Button type="dashed" block onClick={addField}>
        입력 항목 추가
      </Button>
    </div>
  );
}

export function defaultSchemaFields(): FormFieldSchema[] {
  return [
    { name: 'title', label: '제목', type: 'text', placeholder: '' },
    { name: 'reason', label: '사유', type: 'textarea', placeholder: '' },
  ];
}

export function serializeFormSchema(fields: FormFieldSchema[]): string {
  const cleaned: FormFieldSchema[] = fields.map((f) => {
    const name = f.name.trim();
    const label = f.label.trim();
    const type = f.type;
    const placeholder = f.placeholder?.trim();
    const base: FormFieldSchema = {
      name,
      label,
      type,
      ...(placeholder ? { placeholder } : {}),
      ...(f.locked === true ? { locked: true } : {}),
    };
    if (type === 'select' && f.options?.length) {
      const opts = f.options.map((o) => o.trim()).filter(Boolean);
      if (opts.length) return { ...base, options: opts };
    }
    return base;
  });
  return JSON.stringify({ fields: cleaned }, null, 2);
}

export function validateSchemaFieldsForSubmit(fields: FormFieldSchema[]): string | null {
  if (!fields.length) return '입력 항목을 1개 이상 추가해 주세요.';
  const names = new Set<string>();
  for (const f of fields) {
    const name = f.name.trim();
    const label = f.label.trim();
    if (!name) return '모든 행에 필드 코드를 입력해 주세요.';
    if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(name)) {
      return `필드 코드는 영문으로 시작하고 영문·숫자·_만 사용할 수 있습니다: "${name}"`;
    }
    if (names.has(name)) return `필드 코드가 중복되었습니다: ${name}`;
    names.add(name);
    if (!label) return `「${name}」항목의 이름(라벨)을 입력해 주세요.`;
    if (f.type === 'select') {
      const opts = (f.options ?? []).map((o) => o.trim()).filter(Boolean);
      if (!opts.length) return `「${label}」은(는) 선택형이므로 드롭다운 선택지를 1개 이상 입력해 주세요.`;
    }
  }
  return null;
}
