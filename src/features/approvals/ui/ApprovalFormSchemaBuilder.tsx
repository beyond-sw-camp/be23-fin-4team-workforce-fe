import { DeleteOutlined, MinusCircleOutlined } from '@ant-design/icons';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button, Input, Select, Space, Switch, Table, Tag, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { createContext, useCallback, useContext, useMemo, useRef, type CSSProperties, type HTMLAttributes, type Key } from 'react';
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

type SortableFormSchemaRowContextValue = {
  setActivatorNodeRef: (el: HTMLElement | null) => void;
  listeners: ReturnType<typeof useSortable>['listeners'];
  attributes: ReturnType<typeof useSortable>['attributes'];
};

const SortableFormSchemaRowContext = createContext<SortableFormSchemaRowContextValue | null>(null);

/** 결재선 관리 열과 동일한 2×3 점 그리드 드래그 핸들 */
function FormSchemaDragHandle() {
  const ctx = useContext(SortableFormSchemaRowContext);
  if (!ctx) return null;
  return (
    <span
      ref={ctx.setActivatorNodeRef}
      className="tw-inline-flex tw-cursor-grab tw-items-center tw-justify-center tw-rounded tw-p-1.5 tw-text-slate-500 hover:tw-bg-slate-100 hover:tw-text-slate-700 active:tw-cursor-grabbing"
      title="드래그하여 순서 변경"
      {...ctx.listeners}
      {...ctx.attributes}
    >
      <span className="tw-inline-grid tw-grid-cols-2 tw-gap-[3px] tw-leading-none" aria-hidden>
        {Array.from({ length: 6 }).map((_, i) => (
          <span key={i} className="tw-block tw-h-[3px] tw-w-[3px] tw-rounded-full tw-bg-current" />
        ))}
      </span>
    </span>
  );
}

type SortableFormSchemaTableRowProps = HTMLAttributes<HTMLTableRowElement> & {
  'data-row-key'?: Key;
};

const SchemaRowLockedMapContext = createContext<Map<string, boolean>>(new Map());

function SortableFormSchemaTableRow({ children, style, className, ...rest }: SortableFormSchemaTableRowProps) {
  const id = String(rest['data-row-key'] ?? '');
  const lockedMap = useContext(SchemaRowLockedMapContext);
  const locked = lockedMap.get(id) === true;
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled: locked,
  });

  const mergedStyle: CSSProperties = {
    ...(style as CSSProperties),
    transform: CSS.Transform.toString(transform),
    transition,
    ...(isDragging
      ? {
          position: 'relative',
          zIndex: 1,
          boxShadow: '0 2px 10px rgba(0,0,0,0.12)',
          background: 'var(--ant-color-bg-container, #fff)',
        }
      : {}),
  };

  const ctxValue = useMemo(
    () => ({ setActivatorNodeRef, listeners, attributes }),
    [setActivatorNodeRef, listeners, attributes],
  );

  return (
    <SortableFormSchemaRowContext.Provider value={ctxValue}>
      <tr ref={setNodeRef} style={mergedStyle} className={className} {...rest}>
        {children}
      </tr>
    </SortableFormSchemaRowContext.Provider>
  );
}

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
    <div className="tw-flex tw-w-full tw-min-w-0 tw-flex-col tw-gap-1">
      {rows.map((opt, oi) => (
        <Space.Compact key={oi} className="tw-w-full tw-min-w-0">
            <Input
              size="small"
              className="tw-min-w-0 tw-flex-1"
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
  const rowIdsRef = useRef<string[]>([]);

  const sortableIds = useMemo(() => {
    const n = value.length;
    let ids = rowIdsRef.current;
    if (ids.length > n) {
      ids = ids.slice(0, n);
      rowIdsRef.current = ids;
    } else if (ids.length < n) {
      rowIdsRef.current = [...ids, ...Array.from({ length: n - ids.length }, () => crypto.randomUUID())];
    }
    return rowIdsRef.current;
  }, [value]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const rowLocked = (field: FormFieldSchema) => respectFieldLocks && field.locked === true;

  const lockedBySortableId = useMemo(() => {
    const m = new Map<string, boolean>();
    sortableIds.forEach((id, i) => {
      const f = value[i];
      if (f) m.set(id, respectFieldLocks && f.locked === true);
    });
    return m;
  }, [value, sortableIds, respectFieldLocks]);

  const onDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const ids = rowIdsRef.current;
      const oldIndex = ids.findIndex((x) => x === active.id);
      const newIndex = ids.findIndex((x) => x === over.id);
      if (oldIndex < 0 || newIndex < 0) return;
      const nextFields = arrayMove([...value], oldIndex, newIndex);
      if (respectFieldLocks) {
        for (let i = 0; i < value.length; i++) {
          const orig = value[i];
          if (!orig?.locked) continue;
          const pos = nextFields.indexOf(orig);
          if (pos !== i) return;
        }
      }
      rowIdsRef.current = arrayMove([...ids], oldIndex, newIndex);
      onChange(nextFields);
    },
    [onChange, respectFieldLocks, value],
  );

  const rows = useMemo(
    () =>
      value.map((field, index) => ({
        key: sortableIds[index] ?? `row-${index}`,
        index,
        field,
      })),
    [value, sortableIds],
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
    rowIdsRef.current = rowIdsRef.current.filter((_, i) => i !== index);
    onChange(value.filter((_, i) => i !== index));
  };

  const addField = () => {
    const nextLen = value.length + 1;
    rowIdsRef.current = [...rowIdsRef.current, crypto.randomUUID()];
    onChange([
      ...value,
      {
        name: `field_${nextLen}`,
        label: '',
        type: 'text',
        placeholder: '',
      },
    ]);
  };

  const columns: ColumnsType<(typeof rows)[number]> = [
    {
      title: '순서',
      key: 'order',
      width: 52,
      align: 'center',
      render: (_, record) =>
        rowLocked(record.field) ? (
          <Typography.Text type="secondary" className="!tw-text-[11px]">
            고정
          </Typography.Text>
        ) : (
          <FormSchemaDragHandle />
        ),
    },
    {
      title: '필드 코드',
      key: 'name',
      width: 108,
      render: (_, record) => {
        const locked = rowLocked(record.field);
        return (
          <Space size={4} wrap className="tw-w-full tw-min-w-0">
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
              className="tw-min-w-0 tw-w-full tw-flex-1 tw-font-mono tw-text-sm"
            />
          </Space>
        );
      },
    },
    {
      title: '항목 이름(라벨)',
      key: 'label',
      width: 118,
      render: (_, record) => (
        <Input
          className="tw-w-full tw-min-w-0"
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
      width: 118,
      render: (_, record) => (
        <Select
          className="tw-w-full tw-min-w-0"
          popupMatchSelectWidth={false}
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
      width: 96,
      render: (_, record) => (
        <Input
          className="tw-w-full tw-min-w-0"
          value={record.field.placeholder ?? ''}
          disabled={rowLocked(record.field)}
          placeholder="placeholder"
          onChange={(e) => updateAt(record.index, { placeholder: e.target.value || undefined })}
        />
      ),
    },
    {
      title: (
        <Tooltip title="수정 제한(잠금): 켜면 이후 양식 수정 시 이 항목의 삭제·이름·형식·순서 변경이 제한됩니다.">
          <span>잠금</span>
        </Tooltip>
      ),
      key: 'locked',
      width: 64,
      render: (_, record) => (
        <Tooltip
          title={
            record.field.locked === true
              ? '끄면 필드 코드·이름·형식·순서 등을 다시 바꿀 수 있습니다.'
              : '켜면 이후 양식 수정에서 이 항목의 삭제·이름·형식·순서 변경이 제한됩니다.'
          }
        >
          <Switch
            size="small"
            checked={record.field.locked === true}
            onChange={(checked) => updateAt(record.index, { locked: checked ? true : false })}
          />
        </Tooltip>
      ),
    },
    {
      title: (
        <Tooltip title="선택(드롭다운) 형식일 때만 사용합니다.">
          <span>선택지</span>
        </Tooltip>
      ),
      key: 'options',
      width: 148,
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
      width: 40,
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
        「선택(드롭다운)」이면 맨 오른쪽 선택지 열에서 줄마다 한 칸씩 적고, 「선택지 줄 추가」로 칸을 늘리면 됩니다. 순서 열의
        점 모양 핸들을 드래그하면 기안 화면의 결재선처럼 행 순서를 바꿀 수 있습니다.
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
      <SchemaRowLockedMapContext.Provider value={lockedBySortableId}>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
            <Table
              size="small"
              tableLayout="fixed"
              className="tw-w-full [&_.ant-table-cell]:tw-align-top"
              pagination={false}
              rowKey="key"
              dataSource={rows}
              columns={columns}
              components={{ body: { row: SortableFormSchemaTableRow } }}
              locale={{ emptyText: '필드를 추가해 주세요.' }}
            />
          </SortableContext>
        </DndContext>
      </SchemaRowLockedMapContext.Provider>
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
