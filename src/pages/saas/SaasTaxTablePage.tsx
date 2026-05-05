import { ArrowLeftOutlined, FileExcelOutlined, InboxOutlined, ReloadOutlined } from '@ant-design/icons';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { Alert, App, Button, InputNumber, Modal, Space, Table, Tag, Typography, Upload } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { UploadFile } from 'antd/es/upload/interface';
import { useState } from 'react';
import { saasApi } from '@/features/saas/api/saasApi';

const QK_YEARS = ['saas', 'tax-table', 'years'] as const;

type Row = { year: number; count: number };

export default function SaasTaxTablePage() {
  return (
    <App>
      <SaasTaxTablePageInner />
    </App>
  );
}

function SaasTaxTablePageInner() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { message } = App.useApp();

  // 업로드 폼 - 연도 / 파일
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState<number>(currentYear);
  const [fileList, setFileList] = useState<UploadFile[]>([]);

  // 등록된 연도 목록
  const yearsQ = useQuery({
    queryKey: QK_YEARS,
    queryFn: () => saasApi.taxTable.listYears(),
  });

  // 각 연도별 행 수 - 연도 목록 받은 뒤 병렬 조회
  const countsQ = useQueries({
    queries: (yearsQ.data ?? []).map((y) => ({
      queryKey: ['saas', 'tax-table', 'count', y] as const,
      queryFn: () => saasApi.taxTable.count(y),
    })),
  });

  const rows: Row[] = (yearsQ.data ?? []).map((y, i) => ({
    year: y,
    count: countsQ[i]?.data ?? 0,
  }));

  const uploadM = useMutation({
    mutationFn: (vars: { year: number; file: File; force: boolean }) =>
      saasApi.taxTable.upload(vars.year, vars.file, vars.force),
    onSuccess: (res) => {
      message.success(`${res.effectiveYear}년 ${res.inserted}건 등록되었습니다.`);
      setFileList([]);
      void qc.invalidateQueries({ queryKey: ['saas', 'tax-table'] });
    },
    onError: (e: unknown, vars) => {
      const err = e as { status?: number; message?: string };
      // 409 = 같은 연도 이미 등록됨. 덮어쓰기 확인 모달
      if (err?.status === 409) {
        Modal.confirm({
          title: `${vars.year}년이 이미 등록되어 있어요`,
          content: '덮어쓰면 기존 데이터가 모두 삭제되고 새 파일로 교체돼요. 진행할까요?',
          okText: '덮어쓰기',
          cancelText: '취소',
          okButtonProps: { danger: true },
          onOk: () => uploadM.mutate({ ...vars, force: true }),
        });
        return;
      }
      message.error(err?.message ?? '업로드 실패');
    },
  });

  const handleUpload = () => {
    if (!year || year < 2000 || year > 2100) {
      message.warning('연도를 다시 확인해주세요.');
      return;
    }
    const file = fileList[0]?.originFileObj;
    if (!file) {
      message.warning('엑셀 파일을 선택해주세요.');
      return;
    }
    uploadM.mutate({ year, file, force: false });
  };

  const cols: ColumnsType<Row> = [
    {
      title: '적용 연도',
      dataIndex: 'year',
      key: 'year',
      width: 140,
      render: (y: number) => <Tag color="blue">{y}년</Tag>,
    },
    {
      title: '등록 행 수',
      dataIndex: 'count',
      key: 'count',
      render: (c: number) => `${c.toLocaleString()}건`,
    },
  ];

  return (
    <div className="tw-min-h-screen tw-bg-slate-50 tw-p-8">
      <div className="tw-mx-auto tw-max-w-4xl tw-space-y-6">
        <div className="tw-flex tw-items-center tw-justify-between">
          <Space align="center" size={12}>
            <Button
              type="text"
              icon={<ArrowLeftOutlined />}
              onClick={() => navigate({ to: '/saas/dashboard' })}
            />
            <FileExcelOutlined className="tw-text-2xl tw-text-emerald-500" />
            <Typography.Title level={2} className="!tw-m-0">
              간이세액표 관리
            </Typography.Title>
          </Space>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => {
              void qc.invalidateQueries({ queryKey: ['saas', 'tax-table'] });
            }}
            loading={yearsQ.isFetching}
          >
            새로고침
          </Button>
        </div>

        <Alert
          type="info"
          showIcon
          message="국세청 고시 간이세액표 엑셀을 매년 1월에 업로드하면 그 해 모든 회사의 급여 계산에 자동 반영돼요."
        />

        <div className="tw-rounded-lg tw-border tw-border-slate-200 tw-bg-white tw-p-6 tw-space-y-4">
          <Typography.Title level={4} className="!tw-mt-0">
            새 연도 업로드
          </Typography.Title>
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <Space size="middle" align="end">
              <div>
                <Typography.Text type="secondary" className="tw-text-xs">
                  적용 연도
                </Typography.Text>
                <InputNumber
                  min={2000}
                  max={2100}
                  value={year}
                  onChange={(v) => setYear(Number(v) || currentYear)}
                  addonAfter="년"
                  style={{ width: 160, display: 'block' }}
                />
              </div>
            </Space>
            <Upload.Dragger
              name="file"
              accept=".xlsx,.xls"
              maxCount={1}
              fileList={fileList}
              beforeUpload={() => false}
              onChange={(info) => setFileList(info.fileList.slice(-1))}
              onRemove={() => setFileList([])}
            >
              <p className="ant-upload-drag-icon">
                <InboxOutlined />
              </p>
              <p className="ant-upload-text">엑셀(.xlsx) 파일을 끌어다 놓거나 클릭해서 선택</p>
              <p className="ant-upload-hint tw-text-xs">홈택스 다운로드 간이세액표 양식 그대로 업로드 가능</p>
            </Upload.Dragger>
            <Button
              type="primary"
              loading={uploadM.isPending}
              onClick={handleUpload}
              disabled={fileList.length === 0}
            >
              업로드
            </Button>
          </Space>
        </div>

        <div className="tw-rounded-lg tw-border tw-border-slate-200 tw-bg-white tw-p-6">
          <Typography.Title level={4} className="!tw-mt-0">
            등록된 연도
          </Typography.Title>
          <Table<Row>
            rowKey={(r) => String(r.year)}
            loading={yearsQ.isLoading}
            dataSource={rows}
            columns={cols}
            pagination={false}
            locale={{ emptyText: '아직 등록된 연도가 없어요.' }}
          />
        </div>
      </div>
    </div>
  );
}
