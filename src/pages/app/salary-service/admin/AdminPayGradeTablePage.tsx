/**
 * /app/salary/pay-grade-table — 호봉표 관리 (시스템 관리자)
 * 호봉 → 기본급. 직급 무관. 직급별 차등은 직책수당 등 SalaryItemTemplate 으로 처리.
 */
import { Link } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  App,
  Button,
  Card,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { type Dayjs } from 'dayjs';
import { salaryApi } from '@/features/salary-service/api/salaryApi';
import type { PayGradeTable } from '@/features/salary-service/types';

function formatWon(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return '—';
  return `${n.toLocaleString('ko-KR')}원`;
}

const QK = ['salary', 'pay-grade-table'] as const;

export function AdminPayGradeTablePage() {
  const { message } = App.useApp();
  const qc = useQueryClient();

  const [asOf, setAsOf] = useState<Dayjs>(() => dayjs());
  const [showHistory, setShowHistory] = useState(false);

  const [editTarget, setEditTarget] = useState<PayGradeTable | null>(null);
  const [editForm] = Form.useForm<{ baseSalary: number; description?: string }>();

  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkForm] = Form.useForm<BulkFormValues>();

  const listQ = useQuery({
    queryKey: QK,
    queryFn: () => salaryApi.payGradeTable.list(),
  });
  const rawList = listQ.data ?? [];

  const asOfIso = asOf.format('YYYY-MM-DD');

  const isActiveOn = (row: PayGradeTable, date: string): boolean => {
    if (!row.effectiveFrom) return false;
    if (row.effectiveFrom > date) return false;
    if (row.effectiveTo && row.effectiveTo < date) return false;
    return true;
  };

  // 활성/이력 필터 + 호봉 오름차순, 같은 호봉이면 적용일 최신순
  const displayed = useMemo(() => {
    const rows = showHistory ? rawList : rawList.filter((r) => isActiveOn(r, asOfIso));
    return [...rows].sort((a, b) => {
      if ((a.step ?? 0) !== (b.step ?? 0)) return (a.step ?? 0) - (b.step ?? 0);
      return (b.effectiveFrom ?? '').localeCompare(a.effectiveFrom ?? '');
    });
  }, [rawList, asOfIso, showHistory]);

  const updateM = useMutation({
    mutationFn: ({
      id,
      baseSalary,
      description,
    }: {
      id: string;
      baseSalary: number;
      description?: string;
    }) => salaryApi.payGradeTable.update(id, { baseSalary, description }),
    onSuccess: () => {
      message.success('기본급이 수정되었습니다.');
      setEditTarget(null);
      editForm.resetFields();
      void qc.invalidateQueries({ queryKey: QK });
    },
    onError: (e: Error) => message.error(e.message || '수정 실패'),
  });

  const deleteM = useMutation({
    mutationFn: (id: string) => salaryApi.payGradeTable.delete(id),
    onSuccess: () => {
      message.success('호봉이 삭제되었습니다.');
      void qc.invalidateQueries({ queryKey: QK });
    },
    onError: (e: Error) => message.error(e.message || '삭제 실패'),
  });

  const bulkM = useMutation({
    mutationFn: salaryApi.payGradeTable.bulkCreate,
    onSuccess: (res) => {
      message.success(`신규 ${res.created}건, 교체 ${res.replaced}건 반영`);
      setBulkOpen(false);
      bulkForm.resetFields();
      void qc.invalidateQueries({ queryKey: QK });
    },
    onError: (e: Error) => message.error(e.message || '일괄 등록 실패'),
  });

  const openEdit = (row: PayGradeTable) => {
    setEditTarget(row);
    editForm.setFieldsValue({
      baseSalary: row.baseSalary ?? 0,
      description: row.description ?? '',
    });
  };

  const columns: ColumnsType<PayGradeTable> = useMemo(
    () => [
      {
        title: '호봉',
        dataIndex: 'step',
        key: 'step',
        width: 100,
        render: (v: number) => <strong>{v}호봉</strong>,
      },
      {
        title: '기본급',
        dataIndex: 'baseSalary',
        key: 'baseSalary',
        align: 'right',
        render: (v: number) => formatWon(v),
      },
      {
        title: '적용 기간',
        key: 'period',
        render: (_, r) =>
          `${r.effectiveFrom ?? '—'} ~ ${
            r.effectiveTo ?? (isActiveOn(r, asOfIso) ? '현재' : '—')
          }`,
      },
      {
        title: '상태',
        key: 'state',
        width: 90,
        render: (_, r) =>
          isActiveOn(r, asOfIso) ? <Tag color="green">활성</Tag> : <Tag>과거</Tag>,
      },
      {
        title: '설명',
        dataIndex: 'description',
        key: 'description',
        render: (v: string | null) => v ?? '—',
      },
      {
        title: '액션',
        key: 'actions',
        width: 170,
        render: (_, r) => (
          <Space>
            <Button size="small" onClick={() => openEdit(r)}>
              기본급 수정
            </Button>
            <Popconfirm
              title={`${r.step}호봉을 삭제할까요?`}
              okText="삭제"
              cancelText="취소"
              onConfirm={() => r.payGradeTableId && deleteM.mutate(r.payGradeTableId)}
            >
              <Button size="small" danger>
                삭제
              </Button>
            </Popconfirm>
          </Space>
        ),
      },
    ],
    [deleteM, asOfIso],
  );

  return (
    <Space direction="vertical" className="tw-w-full" size={16}>
      <div className="tw-flex tw-flex-wrap tw-items-start tw-justify-between tw-gap-3">
        <div>
          <Typography.Title level={4} className="!tw-m-0 !tw-text-slate-900">
            호봉표 관리
          </Typography.Title>
          <Typography.Text type="secondary" className="tw-text-xs">
            호봉 → 기본급 매핑을 관리합니다. 직급별 차등은 직책수당 등 별도 수당으로 처리하세요.
          </Typography.Text>
          <div className="tw-mt-2">
            <Link to="/app/salary/settings" className="tw-text-sm tw-text-[#2563EB]">
              ← 급여 설정
            </Link>
          </div>
        </div>
        <Space wrap>
          <Space align="center">
            <Typography.Text type="secondary" className="!tw-text-xs">
              기준일
            </Typography.Text>
            <DatePicker value={asOf} onChange={(d) => d && setAsOf(d)} allowClear={false} />
          </Space>
          <Space align="center">
            <Typography.Text type="secondary" className="!tw-text-xs">
              과거 이력 포함
            </Typography.Text>
            <Switch checked={showHistory} onChange={setShowHistory} />
          </Space>
          <Button
            type="primary"
            onClick={() => {
              bulkForm.resetFields();
              setBulkOpen(true);
            }}
          >
            일괄 등록
          </Button>
        </Space>
      </div>

      <Card className="tw-border-slate-200/80 tw-shadow-sm">
        <Table<PayGradeTable>
          rowKey={(r) => r.payGradeTableId ?? `${r.step}-${r.effectiveFrom}`}
          loading={listQ.isLoading}
          columns={columns}
          dataSource={displayed}
          pagination={{ pageSize: 30 }}
          size="small"
          locale={{
            emptyText: '등록된 호봉이 없습니다. "일괄 등록" 으로 초기 세팅하세요.',
          }}
        />
      </Card>

      {/* 단건 수정 모달 */}
      <Modal
        open={Boolean(editTarget)}
        title={editTarget ? `${editTarget.step}호봉 수정` : '수정'}
        onCancel={() => {
          setEditTarget(null);
          editForm.resetFields();
        }}
        onOk={() => editForm.submit()}
        confirmLoading={updateM.isPending}
        okText="저장"
        cancelText="취소"
        destroyOnClose
      >
        {editTarget && (
          <>
            <Typography.Text type="secondary" className="!tw-text-xs !tw-block tw-mb-3">
              적용 기간: {editTarget.effectiveFrom} ~ {editTarget.effectiveTo ?? '현재'}
            </Typography.Text>
            <Form
              form={editForm}
              layout="vertical"
              onFinish={(v) => {
                if (!editTarget.payGradeTableId) return;
                updateM.mutate({
                  id: editTarget.payGradeTableId,
                  baseSalary: v.baseSalary,
                  description: v.description,
                });
              }}
            >
              <Form.Item
                label="기본급 (원)"
                name="baseSalary"
                rules={[{ required: true, message: '기본급을 입력하세요.' }]}
              >
                <InputNumber
                  min={0}
                  step={100000}
                  style={{ width: '100%' }}
                  formatter={(v) => (v ? `${Number(v).toLocaleString('ko-KR')}원` : '')}
                  parser={(v) => Number((v ?? '').replace(/[^0-9]/g, '')) as 0}
                />
              </Form.Item>
              <Form.Item label="설명 (선택)" name="description">
                <Input maxLength={200} placeholder="예: 2026년 인상 반영" />
              </Form.Item>
            </Form>
          </>
        )}
      </Modal>

      {/* 일괄 등록 모달 */}
      <BulkCreateModal
        open={bulkOpen}
        onCancel={() => {
          setBulkOpen(false);
          bulkForm.resetFields();
        }}
        onSubmit={(payload) => bulkM.mutate(payload)}
        submitting={bulkM.isPending}
        form={bulkForm}
      />
    </Space>
  );
}

// ─────────────────────────────────────────────
// 일괄 등록 모달
// ─────────────────────────────────────────────

type BulkFormValues = {
  effectiveFrom: Dayjs;
  stepStart: number;
  stepEnd: number;
  initialBase: number;
  stepIncrement: number;
};

type BulkCreateModalProps = {
  open: boolean;
  onCancel: () => void;
  onSubmit: (payload: {
    effectiveFrom: string;
    entries: Array<{ step: number; baseSalary: number }>;
  }) => void;
  submitting: boolean;
  form: ReturnType<typeof Form.useForm<BulkFormValues>>[0];
};

function BulkCreateModal({ open, onCancel, onSubmit, submitting, form }: BulkCreateModalProps) {
  const [preview, setPreview] = useState<Array<{ step: number; baseSalary: number }>>([]);

  const refreshPreview = () => {
    const v = form.getFieldsValue();
    if (!v.stepStart || !v.stepEnd || v.initialBase == null) {
      setPreview([]);
      return;
    }
    const next: typeof preview = [];
    for (let step = v.stepStart; step <= v.stepEnd; step++) {
      const diff = step - v.stepStart;
      next.push({
        step,
        baseSalary: v.initialBase + diff * (v.stepIncrement ?? 0),
      });
    }
    setPreview(next);
  };

  const handleFinish = (v: BulkFormValues) => {
    if (v.stepEnd < v.stepStart) return;
    const entries: Array<{ step: number; baseSalary: number }> = [];
    for (let step = v.stepStart; step <= v.stepEnd; step++) {
      const diff = step - v.stepStart;
      entries.push({
        step,
        baseSalary: v.initialBase + diff * (v.stepIncrement ?? 0),
      });
    }
    onSubmit({ effectiveFrom: v.effectiveFrom.format('YYYY-MM-DD'), entries });
  };

  return (
    <Modal
      open={open}
      onCancel={onCancel}
      onOk={() => form.submit()}
      confirmLoading={submitting}
      okText="등록"
      cancelText="취소"
      title="호봉표 일괄 등록"
      destroyOnClose
      width={600}
      afterOpenChange={(o) => {
        if (o) refreshPreview();
      }}
    >
      <Form<BulkFormValues>
        form={form}
        layout="vertical"
        onFinish={handleFinish}
        onValuesChange={refreshPreview}
        initialValues={{
          effectiveFrom: dayjs(),
          stepStart: 1,
          stepEnd: 10,
          initialBase: 2500000,
          stepIncrement: 100000,
        }}
      >
        <Form.Item
          label="적용 시작일"
          name="effectiveFrom"
          rules={[{ required: true, message: '적용일을 선택하세요.' }]}
          extra="기존 동일 호봉 레코드는 자동으로 전일까지 마감됩니다."
        >
          <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
        </Form.Item>

        <div className="tw-grid tw-grid-cols-2 tw-gap-3">
          <Form.Item
            label="시작 호봉"
            name="stepStart"
            rules={[{ required: true, message: '시작 호봉을 입력하세요.' }]}
          >
            <InputNumber min={1} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            label="종료 호봉"
            name="stepEnd"
            rules={[{ required: true, message: '종료 호봉을 입력하세요.' }]}
          >
            <InputNumber min={1} style={{ width: '100%' }} />
          </Form.Item>
        </div>

        <div className="tw-grid tw-grid-cols-2 tw-gap-3">
          <Form.Item
            label="초기 기본급 (시작 호봉)"
            name="initialBase"
            rules={[{ required: true, message: '초기 기본급을 입력하세요.' }]}
          >
            <InputNumber
              min={0}
              step={100000}
              style={{ width: '100%' }}
              formatter={(v) => (v ? `${Number(v).toLocaleString('ko-KR')}원` : '')}
              parser={(v) => Number((v ?? '').replace(/[^0-9]/g, '')) as 0}
            />
          </Form.Item>
          <Form.Item
            label="호봉당 인상액"
            name="stepIncrement"
            extra="0 이면 모든 호봉 동일"
          >
            <InputNumber
              min={0}
              step={10000}
              style={{ width: '100%' }}
              formatter={(v) => (v ? `${Number(v).toLocaleString('ko-KR')}원` : '')}
              parser={(v) => Number((v ?? '').replace(/[^0-9]/g, '')) as 0}
            />
          </Form.Item>
        </div>

        <Typography.Text strong>미리보기</Typography.Text>
        <div className="tw-mt-2 tw-max-h-64 tw-overflow-auto tw-rounded tw-border tw-border-slate-200">
          <Table
            rowKey={(r) => `${r.step}`}
            size="small"
            pagination={false}
            dataSource={preview}
            columns={[
              {
                title: '호봉',
                dataIndex: 'step',
                key: 'step',
                render: (v: number) => `${v}호봉`,
              },
              {
                title: '기본급',
                dataIndex: 'baseSalary',
                key: 'baseSalary',
                align: 'right',
                render: (v: number) => `${v.toLocaleString('ko-KR')}원`,
              },
            ]}
            locale={{ emptyText: '조건을 입력하면 미리보기가 표시됩니다.' }}
          />
        </div>
      </Form>
    </Modal>
  );
}
