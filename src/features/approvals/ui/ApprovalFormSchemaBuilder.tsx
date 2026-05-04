import { DeleteOutlined, MinusCircleOutlined, SettingOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
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
import { Alert, Button, Input, Select, Space, Switch, Tag, Tooltip, Typography } from 'antd';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  Fragment,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { approvalRequestTypeLabelKo } from '@/features/approvals/lib/approvalRequestTypeKo';
import {
  ApprovalFormPaperFieldRow,
  ApprovalFormPaperLayout,
  ApprovalFormStampColumn,
} from '@/features/approvals/ui/ApprovalFormPaperLayout';
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
  hidden: '숨김(자동)',
  ai_transcribe: '녹음 받아쓰기(AI)',
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

const SchemaRowLockedMapContext = createContext<Map<string, boolean>>(new Map());

type SortableFieldListRowProps = {
  id: string;
  selected: boolean;
  locked: boolean;
  onSelect: () => void;
  onDelete?: () => void;
  children: ReactNode;
};

function SortableFieldListRow({ id, selected, locked, onSelect, onDelete, children }: SortableFieldListRowProps) {
  const lockedMap = useContext(SchemaRowLockedMapContext);
  const rowDisabled = lockedMap.get(id) === true;
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled: rowDisabled,
  });

  const mergedStyle: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    ...(isDragging
      ? {
          position: 'relative',
          zIndex: 2,
          boxShadow: '0 2px 12px rgba(0, 0, 0, 0.12)',
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
      <div
        ref={setNodeRef}
        style={mergedStyle}
        {...attributes}
        role="button"
        tabIndex={0}
        onClick={onSelect}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            onSelect();
            e.preventDefault();
          }
        }}
        className={`tw-flex tw-min-w-0 tw-w-full tw-max-w-full tw-items-center tw-gap-1.5 tw-rounded-lg tw-border tw-px-2 tw-py-2 tw-text-left tw-outline-none tw-transition-colors ${
          selected
            ? 'tw-border-[#1e3a5f] tw-bg-[#1e3a5f]/[0.06] tw-ring-1 tw-ring-[#1e3a5f]/25'
            : 'tw-border-slate-200/90 tw-bg-white hover:tw-bg-slate-50'
        }`}
      >
        {locked ? (
          <Typography.Text type="secondary" className="tw-w-7 tw-shrink-0 tw-text-center tw-text-[10px]">
            고정
          </Typography.Text>
        ) : (
          <span onClick={(e) => e.stopPropagation()} className="tw-shrink-0">
            <FormSchemaDragHandle />
          </span>
        )}
        <div className="tw-min-w-0 tw-flex-1">{children}</div>
        {!locked && onDelete ? (
          <Button
            type="text"
            danger
            size="small"
            icon={<DeleteOutlined />}
            className="tw-shrink-0"
            aria-label="삭제"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
          />
        ) : null}
      </div>
    </SortableFormSchemaRowContext.Provider>
  );
}

function previewControlForField(field: FormFieldSchema) {
  const ph = field.placeholder?.trim() || undefined;
  const common = 'tw-w-full';
  switch (field.type) {
    case 'textarea':
      return <Input.TextArea readOnly className={common} rows={2} placeholder={ph} value="" />;
    case 'number':
      return <Input readOnly className={common} type="number" placeholder={ph} />;
    case 'date':
      return <Input readOnly className={common} type="date" />;
    case 'datetime-local':
      return <Input readOnly className={common} type="datetime-local" />;
    case 'time':
      return <Input readOnly className={common} type="time" />;
    case 'select': {
      const opts = (field.options ?? []).map((o) => o.trim()).filter(Boolean);
      return (
        <Select
          disabled
          className={common}
          placeholder={ph ?? '선택'}
          options={(opts.length ? opts : ['(선택지 없음)']).map((o) => ({ value: o, label: o }))}
        />
      );
    }
    case 'hidden':
      return <Tag>숨김 필드</Tag>;
    case 'ai_transcribe':
      return <Tag color="blue">녹음·AI 필드</Tag>;
    default:
      return <Input readOnly className={common} placeholder={ph ?? '입력 예시'} />;
  }
}

export type ApprovalFormSchemaPaperPreviewMeta = {
  documentName: string;
  categoryLabel: string;
  requestTypeCode: string;
};

export type ApprovalFormSchemaBuilderProps = {
  value: FormFieldSchema[];
  onChange: (next: FormFieldSchema[]) => void;
  /** true면 `locked: true` 행은 편집·삭제·순서 이동 불가 (양식 수정 화면) */
  respectFieldLocks?: boolean;
  /** 우측 기안서 스타일 미리보기 제목·유형 (미주입 시 placeholder) */
  paperPreviewMeta?: ApprovalFormSchemaPaperPreviewMeta;
  /**
   * 좌측 사이드바 상단. 없으면 paperPreviewMeta로 양식명·요청(유형)을 읽기 전용으로 표시합니다.
   * 결재 양식 추가처럼 상단에서 직접 입력해야 할 때 Form.Item 등을 넣습니다.
   */
  sidebarTop?: ReactNode;
  /** 상단 안내 Alert 바로 아래에 렌더 (예: 캘린더 연동 설정) */
  belowHelpSlot?: ReactNode;
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
  paperPreviewMeta: paperPreviewMetaProp,
  sidebarTop,
  belowHelpSlot,
}: ApprovalFormSchemaBuilderProps) {
  const paperPreviewMeta: ApprovalFormSchemaPaperPreviewMeta = paperPreviewMetaProp ?? {
    documentName: '미리보기',
    categoryLabel: '—',
    requestTypeCode: 'GENERAL',
  };
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

  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  useEffect(() => {
    if (value.length === 0) {
      setSelectedIndex(null);
      return;
    }
    setSelectedIndex((cur) => {
      if (cur == null) return null;
      if (cur >= value.length) return null;
      return cur;
    });
  }, [value.length]);

  const onDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const ids = [...rowIdsRef.current];
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
      const selectedId =
        selectedIndex != null && selectedIndex >= 0 && selectedIndex < ids.length ? ids[selectedIndex] : null;
      rowIdsRef.current = arrayMove(ids, oldIndex, newIndex);
      onChange(nextFields);
      if (selectedId != null) {
        const ni = rowIdsRef.current.findIndex((x) => x === selectedId);
        if (ni >= 0) setSelectedIndex(ni);
      }
    },
    [onChange, respectFieldLocks, value, selectedIndex],
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
    const next = value.filter((_, i) => i !== index);
    rowIdsRef.current = rowIdsRef.current.filter((_, i) => i !== index);
    setSelectedIndex((cur) => {
      if (cur == null) return null;
      if (index < cur) return cur - 1;
      if (index === cur) return null;
      return cur;
    });
    onChange(next);
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
    setSelectedIndex(value.length);
  };

  const renderFieldProperties = (index: number) => {
    const field = value[index];
    if (!field) return null;
    const locked = rowLocked(field);
    return (
      <div className="tw-box-border tw-min-w-0 tw-max-w-full tw-space-y-3 tw-overflow-x-hidden tw-rounded-lg tw-border tw-border-slate-200 tw-bg-white tw-p-3 tw-shadow-sm">
        <div className="tw-flex tw-min-w-0 tw-items-center tw-gap-2 tw-border-b tw-border-slate-100 tw-pb-2">
          <SettingOutlined className="tw-text-[#1e3a5f]" />
          <Typography.Text strong className="tw-text-xs">
            필드 속성
          </Typography.Text>
        </div>
        <Typography.Paragraph type="secondary" className="!tw-mb-0 !tw-text-[11px]">
          이 항목의 라벨·형식·힌트를 바꿉니다.
        </Typography.Paragraph>
        <div className="tw-min-w-0 tw-space-y-3">
          <div className="tw-min-w-0 tw-max-w-full">
            <Typography.Text className="tw-mb-1 tw-block tw-text-[11px] tw-font-medium tw-text-slate-700">필드 이름</Typography.Text>
            <Input
              size="small"
              className="tw-max-w-full"
              value={field.label}
              disabled={locked}
              placeholder="예: 휴가 기간"
              onChange={(e) => updateAt(index, { label: e.target.value })}
            />
          </div>
          <div className="tw-min-w-0 tw-max-w-full">
            <Typography.Text className="tw-mb-1 tw-block tw-text-[11px] tw-font-medium tw-text-slate-700">입력 형식</Typography.Text>
            <Select
              size="small"
              className="tw-w-full tw-max-w-full"
              popupMatchSelectWidth
              value={field.type}
              disabled={locked}
              options={TYPE_OPTIONS}
              onChange={(t) => updateAt(index, { type: t as FormFieldType })}
            />
          </div>
          <div className="tw-min-w-0 tw-max-w-full">
            <Typography.Text className="tw-mb-1 tw-block tw-text-[11px] tw-font-medium tw-text-slate-700">안내 문구</Typography.Text>
            <Input
              size="small"
              className="tw-max-w-full"
              value={field.placeholder ?? ''}
              disabled={locked}
              placeholder="예: 시작일과 종료일을 선택하세요"
              onChange={(e) => updateAt(index, { placeholder: e.target.value || undefined })}
            />
          </div>
          <div className="tw-flex tw-min-w-0 tw-max-w-full tw-items-center tw-justify-between tw-gap-2 tw-rounded-md tw-bg-slate-50 tw-px-2.5 tw-py-2">
            <Typography.Text className="tw-min-w-0 tw-flex-1 tw-text-[11px] [overflow-wrap:anywhere]">
              잠금(이후 양식 수정 시 제한)
            </Typography.Text>
            <Tooltip
              title={
                field.locked === true
                  ? '끄면 항목 이름·형식·순서 등을 다시 바꿀 수 있습니다.'
                  : '켜면 이후 양식 수정에서 이 항목의 삭제·이름·형식·순서 변경이 제한됩니다.'
              }
            >
              <span className="tw-inline-flex tw-shrink-0">
              <Switch
                size="small"
                checked={field.locked === true}
                onChange={(checked) => updateAt(index, { locked: checked ? true : false })}
              />
              </span>
            </Tooltip>
          </div>
          {locked ? (
            <Typography.Text type="secondary" className="tw-block tw-break-all tw-text-[10px] tw-font-mono">
              내부 코드: {field.name}
            </Typography.Text>
          ) : null}
          {field.type === 'select' ? (
            <div className="tw-min-w-0 tw-max-w-full">
              <Typography.Text className="tw-mb-1 tw-block tw-text-[11px] tw-font-medium tw-text-slate-700">선택지</Typography.Text>
              <SelectOptionsEditor
                options={field.options}
                disabled={locked}
                onChange={(opts) => updateAt(index, { options: opts })}
              />
            </div>
          ) : null}
        </div>
      </div>
    );
  };

  const documentPaperPreview = (
    <div className="tw-min-h-0 tw-min-w-0 tw-flex-1 tw-overflow-y-auto tw-bg-slate-100/60 tw-p-2 sm:tw-p-3">
      <Typography.Text type="secondary" className="tw-mb-2 tw-block tw-text-[11px]">
        문서 미리보기
      </Typography.Text>
      <ApprovalFormPaperLayout
        documentName={paperPreviewMeta.documentName.trim() || '—'}
        categoryLabel={paperPreviewMeta.categoryLabel}
        requestTypeCode={paperPreviewMeta.requestTypeCode}
        drafterName="신청자"
        drafterOrg="신청부서"
        writtenDate={dayjs().format('YYYY-MM-DD')}
        stampColumn={
          <ApprovalFormStampColumn
            drafterName="신청자"
            drafterJobTitle="직위"
            applicationWrittenDateIso={dayjs().format('YYYY-MM-DD')}
            approvers={[{ id: 'preview-1', memberName: '결재자', jobTitleName: '직위' }]}
          />
        }
      >
        {value.length === 0 ? (
          <tr>
            <td colSpan={2} className="tw-border tw-border-slate-200 tw-bg-white tw-p-6 tw-text-center">
              <Typography.Text type="secondary" className="tw-text-xs">
                항목을 추가하면 여기에 표시됩니다.
              </Typography.Text>
            </td>
          </tr>
        ) : (
          value.map((field, i) => {
            if (field.type === 'hidden') return null;
            const fieldLocked = field.locked === true;
            const isSel = selectedIndex === i;
            return (
              <ApprovalFormPaperFieldRow key={sortableIds[i] ?? `pv-${i}`} label={field.label?.trim() || '(이름 없음)'} required={fieldLocked}>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedIndex((cur) => (cur === i ? null : i))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      setSelectedIndex((cur) => (cur === i ? null : i));
                      e.preventDefault();
                    }
                  }}
                  className={isSel ? 'tw-rounded tw-ring-1 tw-ring-[#1e3a5f]/35' : ''}
                >
                  {previewControlForField(field)}
                </div>
              </ApprovalFormPaperFieldRow>
            );
          })
        )}
      </ApprovalFormPaperLayout>
    </div>
  );

  const sidebarMetaReadonly =
    sidebarTop == null ? (
      <div className="tw-mb-3 tw-min-w-0 tw-max-w-full tw-space-y-2 tw-overflow-x-hidden tw-rounded-lg tw-border tw-border-slate-200 tw-bg-white tw-px-3 tw-py-2.5">
        <div>
          <Typography.Text className="tw-mb-0.5 tw-block tw-text-[11px] tw-font-medium tw-text-slate-500">양식명</Typography.Text>
          <Typography.Text className="tw-block tw-text-sm tw-text-slate-900">
            {paperPreviewMeta.documentName.trim() || '—'}
          </Typography.Text>
        </div>
        <div>
          <Typography.Text className="tw-mb-0.5 tw-block tw-text-[11px] tw-font-medium tw-text-slate-500">요청 유형</Typography.Text>
          <Typography.Text className="tw-block tw-text-sm tw-text-slate-900">
            {approvalRequestTypeLabelKo(paperPreviewMeta.requestTypeCode)}
          </Typography.Text>
        </div>
      </div>
    ) : null;

  return (
    <div className="tw-min-w-0 tw-max-w-full tw-space-y-2">
      <Alert
        type="info"
        showIcon
        className="tw-text-sm"
        message="왼쪽에서 항목을 누르면 아래에 속성이 펼쳐지고, 같은 항목을 다시 누르면 접힙니다. 오른쪽은 기안과 같은 문서 미리보기입니다."
      />
      {belowHelpSlot ? <div className="tw-mt-2 tw-min-w-0 tw-max-w-full tw-overflow-x-hidden">{belowHelpSlot}</div> : null}
      <SchemaRowLockedMapContext.Provider value={lockedBySortableId}>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <div className="tw-flex tw-min-h-[min(52vh,480px)] tw-max-h-[min(70vh,720px)] tw-min-w-0 tw-flex-col tw-gap-0 tw-overflow-hidden tw-rounded-lg tw-border tw-border-slate-200/90 tw-bg-slate-50/30 lg:tw-flex-row">
            <div className="tw-box-border tw-flex tw-min-h-0 tw-w-full tw-min-w-0 tw-max-w-full tw-shrink-0 tw-flex-col tw-overflow-x-hidden tw-border-slate-200 tw-bg-slate-50/40 tw-border-b tw-p-3 lg:tw-w-[380px] lg:tw-max-w-[380px] lg:tw-shrink-0 lg:tw-border-b-0 lg:tw-border-r lg:tw-border-solid">
              {sidebarTop ? <div className="tw-mb-3 tw-min-w-0 tw-max-w-full tw-space-y-2">{sidebarTop}</div> : null}
              {sidebarMetaReadonly}
              <Typography.Text strong className="tw-mb-2 tw-block tw-text-xs tw-text-slate-600">
                항목 목록
              </Typography.Text>
              <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
                <div className="tw-flex tw-min-h-0 tw-min-w-0 tw-flex-1 tw-flex-col tw-gap-1.5 tw-overflow-y-auto tw-overflow-x-hidden tw-pr-0.5">
                  {value.length === 0 ? (
                    <Typography.Text type="secondary" className="tw-px-1 tw-text-xs">
                      항목이 없습니다. 아래 버튼으로 추가하세요.
                    </Typography.Text>
                  ) : (
                    value.map((field, i) => {
                      const id = sortableIds[i] ?? `row-${i}`;
                      const locked = rowLocked(field);
                      return (
                        <Fragment key={id}>
                          <SortableFieldListRow
                            id={id}
                            selected={selectedIndex === i}
                            locked={locked}
                            onSelect={() => setSelectedIndex((cur) => (cur === i ? null : i))}
                            onDelete={locked ? undefined : () => removeAt(i)}
                          >
                            <div className="tw-min-w-0">
                              <div className="tw-truncate tw-text-sm tw-font-medium tw-text-slate-800">
                                {field.label?.trim() || '(이름 없음)'}
                              </div>
                              <div className="tw-truncate tw-text-[11px] tw-text-slate-500">{TYPE_LABEL[field.type]}</div>
                            </div>
                          </SortableFieldListRow>
                          {selectedIndex === i ? (
                            <div className="tw-ml-1 tw-mt-1 tw-mb-1 tw-min-w-0 tw-max-w-full tw-border-l-2 tw-border-[#1e3a5f]/35 tw-pl-2 tw-pr-0">
                              {renderFieldProperties(i)}
                            </div>
                          ) : null}
                        </Fragment>
                      );
                    })
                  )}
                </div>
              </SortableContext>
              <Button type="dashed" block size="small" className="tw-mt-2 tw-shrink-0" onClick={addField}>
                입력 항목 추가
              </Button>
            </div>
            {documentPaperPreview}
          </div>
        </DndContext>
      </SchemaRowLockedMapContext.Provider>
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
    if (!name) return '모든 행에 내부 필드 이름이 필요합니다. 항목을 다시 추가해 보세요.';
    if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(name)) {
      return `내부 필드 이름은 영문으로 시작하고 영문·숫자·_만 사용할 수 있습니다: "${name}"`;
    }
    if (names.has(name)) return `내부 필드 이름이 중복되었습니다: ${name}`;
    names.add(name);
    if (!label) return `「${name}」항목의 이름(라벨)을 입력해 주세요.`;
    if (f.type === 'select') {
      const opts = (f.options ?? []).map((o) => o.trim()).filter(Boolean);
      if (!opts.length) return `「${label}」은(는) 선택형이므로 드롭다운 선택지를 1개 이상 입력해 주세요.`;
    }
  }
  return null;
}
